import type { PostgrestError } from "@supabase/supabase-js";
import type { AppSupabaseClient } from "@/lib/ingredient-alias-memory";
import {
  normalizeCanonicalIngredientName,
  type IngredientAliasMap,
  type IngredientCanonicalInput,
  type IngredientCanonicalMatch,
} from "@/lib/ingredient-canonical";
import {
  catalogHasNormalizedNameDuplicate,
  catalogHasOperationalIdentityDuplicate,
  guardIngredientCreation,
  normalizeOperationalIdentityKey,
} from "@/lib/ingredient-operational-identity";
import {
  isConfirmedIngredientMatch,
  isSuggestedIngredientMatch,
} from "@/lib/ingredient-match-explanation";
import {
  areOperationalFamiliesIncompatible,
  detectOperationalFamily,
} from "@/lib/ingredient-operational-families";
import {
  hasRichPackageSemantics,
  resolveInvoiceLinePurchaseFormat,
  structuredPurchaseToIngredientFields,
  type StructuredPurchaseFormat,
} from "@/lib/invoice-purchase-format";
import { findInvoiceItemIngredientMatch } from "@/lib/invoice-ingredient-match-propagation";
import { INGREDIENT_KIND_CANONICAL, looksLikeInvoiceShorthandName } from "@/lib/ingredient-kind";
import { shouldBlockCanonicalNameOnCreate } from "@/lib/canonical-ingredient-operational-name";
import { recordInvoiceLineAliasMemory } from "@/lib/ingredient-match-alias-memory";
import { normalizeIngredientName } from "@/lib/normalizeIngredient";
import {
  traceAliasOnly,
  traceCanonicalCreateAttempt,
  traceCanonicalCreateNameSource,
  traceCanonicalInsert,
  traceUnmatchedPersist,
} from "@/lib/ingredient-catalog-diagnostics";

const LOG_PREFIX = "[ingredient-auto-persist]";
/** Grep-friendly prefix for every insert into public.ingredients (explicit user action only). */
export const INGREDIENT_CREATE_LOG_PREFIX = "[ingredient_create]";
const PURCHASE_INFERENCE_MIN_CONFIDENCE = 0.86;
const OPERATIONAL_CONFLICT_MIN_SHARED_TOKEN_LENGTH = 3;

export type AutoPersistInvoiceItem = {
  id: string;
  name: string;
  quantity: number | null;
  unit: string | null;
  unit_price: number | null;
};

export type AutoPersistCatalogEntry = IngredientCanonicalInput;

export type AutoPersistIneligibilityReason =
  | "has_match"
  | "suggested_match"
  | "invalid_name"
  | "invoice_shorthand"
  | "weak_purchase_format"
  | "operational_family_conflict"
  | "duplicate_normalized_name"
  | "duplicate_operational_identity"
  | "same_operational_family";

export type AutoPersistEligibilityResult = {
  eligible: boolean;
  reason: AutoPersistIneligibilityReason | "eligible";
};

export type IngredientInsertPayload = {
  user_id: string;
  name: string;
  normalized_name: string;
  unit: string;
  current_price: number;
  purchase_quantity: number;
  purchase_unit: string;
  base_unit: string;
  ingredient_kind?: string;
};

function traceAutoPersist(stage: string, details?: Record<string, unknown>): void {
  if (!import.meta.env.DEV) return;
  if (details) console.debug(`${LOG_PREFIX} ${stage}`, details);
  else console.debug(`${LOG_PREFIX} ${stage}`);
}

function traceIngredientCreate(stage: string, details?: Record<string, unknown>): void {
  if (details) console.info(`${INGREDIENT_CREATE_LOG_PREFIX} ${stage}`, details);
  else console.info(`${INGREDIENT_CREATE_LOG_PREFIX} ${stage}`);
}

export type IngredientCreateSource = "explicit_user";

export function autoPersistSessionKey(invoiceId: string, normalizedName: string): string {
  return `${invoiceId}:${normalizedName}`;
}

function isInvalidAutoPersistName(name: string): boolean {
  const trimmed = name.trim();
  if (!trimmed) return true;
  const normalized = normalizeIngredientName(trimmed);
  return !normalized || normalized === "unknown";
}

function canonicalTokenSet(name: string): Set<string> {
  return new Set(
    normalizeCanonicalIngredientName(name)
      .split(/\s+/)
      .filter((token) => token.length > 1),
  );
}

function hasMeaningfulCanonicalTokenOverlap(a: Set<string>, b: Set<string>): boolean {
  for (const token of a) {
    if (token.length >= OPERATIONAL_CONFLICT_MIN_SHARED_TOKEN_LENGTH && b.has(token)) {
      return true;
    }
  }
  return false;
}

export { catalogHasNormalizedNameDuplicate } from "@/lib/ingredient-operational-identity";

/** Blocks batata shoestring auto-create when pão de batata is already in catalog. */
export function catalogHasOperationalFamilyConflict(
  itemName: string,
  catalog: AutoPersistCatalogEntry[],
): boolean {
  const itemFamily = detectOperationalFamily(itemName);
  if (!itemFamily) return false;

  const itemTokens = canonicalTokenSet(itemName);
  for (const entry of catalog) {
    const catalogName = entry.name ?? "";
    const catalogFamily = detectOperationalFamily(catalogName);
    if (!catalogFamily) continue;
    if (!areOperationalFamiliesIncompatible(itemFamily, catalogFamily)) continue;
    if (hasMeaningfulCanonicalTokenOverlap(itemTokens, canonicalTokenSet(catalogName))) {
      return true;
    }
  }
  return false;
}

/** Dedupe within the same operational family when canonical keys already align. */
export function catalogHasSameOperationalFamilyDuplicate(
  itemName: string,
  catalog: AutoPersistCatalogEntry[],
): boolean {
  const itemFamily = detectOperationalFamily(itemName);
  if (!itemFamily) return false;

  const itemCanonical = normalizeCanonicalIngredientName(itemName);
  if (!itemCanonical) return false;

  return catalog.some((entry) => {
    const catalogFamily = detectOperationalFamily(entry.name ?? "");
    if (catalogFamily !== itemFamily) return false;
    const catalogCanonical = normalizeCanonicalIngredientName(entry.name ?? "");
    return catalogCanonical === itemCanonical;
  });
}

export function isPurchaseFormatSufficientForPersist(
  structured: StructuredPurchaseFormat,
  extractedUnit: string | null,
  isGenericUnit: (unit: string | null | undefined) => boolean,
): boolean {
  if (hasRichPackageSemantics(structured)) return true;

  const inferred = structured.inferred;
  if (
    inferred.confidence >= PURCHASE_INFERENCE_MIN_CONFIDENCE &&
    inferred.purchase_quantity > 0 &&
    inferred.purchase_unit != null &&
    inferred.base_unit != null
  ) {
    return true;
  }

  if (structured.normalizedUsableQuantity != null && structured.usableQuantityUnit) {
    return true;
  }

  if (extractedUnit && !isGenericUnit(extractedUnit)) return true;

  return false;
}

export function evaluateAutoPersistEligibility(
  item: AutoPersistInvoiceItem,
  match: IngredientCanonicalMatch | null,
  catalog: AutoPersistCatalogEntry[],
  options?: {
    isGenericUnit?: (unit: string | null | undefined) => boolean;
  },
): AutoPersistEligibilityResult {
  const isGenericUnit = options?.isGenericUnit ?? defaultIsGenericUnit;
  const name = item.name.trim();

  if (match) {
    if (isConfirmedIngredientMatch(match)) return { eligible: false, reason: "has_match" };
    if (isSuggestedIngredientMatch(match)) return { eligible: false, reason: "suggested_match" };
  }

  if (!match && looksLikeInvoiceShorthandName(name)) {
    const shorthandMatch = findInvoiceItemIngredientMatch(name, catalog, {}, undefined);
    if (shorthandMatch && isConfirmedIngredientMatch(shorthandMatch)) {
      return { eligible: false, reason: "has_match" };
    }
  }
  if (isInvalidAutoPersistName(name)) {
    return { eligible: false, reason: "invalid_name" };
  }

  if (looksLikeInvoiceShorthandName(name)) {
    return { eligible: false, reason: "invoice_shorthand" };
  }

  const normalizedName = normalizeIngredientName(name);
  if (catalogHasNormalizedNameDuplicate(normalizedName, catalog)) {
    return { eligible: false, reason: "duplicate_normalized_name" };
  }

  if (catalogHasOperationalIdentityDuplicate(name, catalog)) {
    return { eligible: false, reason: "duplicate_operational_identity" };
  }

  if (catalogHasOperationalFamilyConflict(name, catalog)) {
    return { eligible: false, reason: "operational_family_conflict" };
  }

  if (catalogHasSameOperationalFamilyDuplicate(name, catalog)) {
    return { eligible: false, reason: "same_operational_family" };
  }

  const extractedUnit = item.unit?.trim() || null;
  const structured = resolveInvoiceLinePurchaseFormat({
    name,
    quantity: item.quantity,
    unit: item.unit,
  });
  if (!isPurchaseFormatSufficientForPersist(structured, extractedUnit, isGenericUnit)) {
    return { eligible: false, reason: "weak_purchase_format" };
  }

  return { eligible: true, reason: "eligible" };
}

const GENERIC_UNIT_TOKENS = new Set(["un", "unit", "units", "und", "unds", "unid", "unids"]);

export function defaultIsGenericUnit(unit: string | null | undefined): boolean {
  const normalized = unit?.trim().toLowerCase();
  return !normalized || GENERIC_UNIT_TOKENS.has(normalized);
}

export function buildIngredientInsertPayload(
  item: AutoPersistInvoiceItem,
  userId: string,
  options: {
    isGenericUnit?: (unit: string | null | undefined) => boolean;
  } = {},
): IngredientInsertPayload | null {
  const isGenericUnit = options.isGenericUnit ?? defaultIsGenericUnit;
  const name = item.name.trim();
  const normalizedName = normalizeIngredientName(name);
  traceCanonicalCreateNameSource({
    flowFunction: "buildIngredientInsertPayload",
    flowOrigin: "auto_persist",
    stage: "invoice-line-as-name",
    rawInvoiceText: name,
    normalized: normalizedName,
    finalCanonicalName: name,
    nameSource: "invoice_line",
    insertAttempted: false,
  });
  if (!normalizedName || isInvalidAutoPersistName(name)) return null;

  const extractedUnit = item.unit?.trim() || null;
  const structured = resolveInvoiceLinePurchaseFormat({
    name,
    quantity: item.quantity,
    unit: item.unit,
  });
  const purchaseFields = structuredPurchaseToIngredientFields(
    structured,
    extractedUnit,
    isGenericUnit,
  );
  const stockUnit =
    structured.inferred.base_unit && isGenericUnit(extractedUnit)
      ? structured.inferred.base_unit
      : (extractedUnit ??
        structured.inferred.base_unit ??
        structured.inferred.conversion_hint?.purchase_unit ??
        purchaseFields.base_unit);
  const detectedPrice = Number(item.unit_price);
  const currentPrice = Number.isFinite(detectedPrice) && detectedPrice >= 0 ? detectedPrice : 0;

  return {
    user_id: userId,
    name,
    normalized_name: normalizedName,
    unit: stockUnit,
    current_price: currentPrice,
    purchase_quantity: purchaseFields.purchase_quantity,
    purchase_unit: purchaseFields.purchase_unit,
    base_unit: purchaseFields.base_unit,
    ingredient_kind: INGREDIENT_KIND_CANONICAL,
  };
}

export async function persistIngredientFromInvoiceItem(
  client: AppSupabaseClient,
  payload: IngredientInsertPayload,
  options?: {
    catalog?: AutoPersistCatalogEntry[];
    /** Only explicit user "Create ingredient" may insert canonical rows. */
    source?: IngredientCreateSource;
  },
): Promise<{
  data: AutoPersistCatalogEntry | null;
  error: PostgrestError | null;
  reused?: boolean;
  blocked?: boolean;
  blockReason?: string;
}> {
  const source = options?.source;
  traceCanonicalCreateAttempt({
    flowFunction: "persistIngredientFromInvoiceItem",
    flowOrigin: source === "explicit_user" ? "explicit_user" : "auto_persist",
    stage: "enter",
    rawInvoiceText: null,
    normalized: payload.normalized_name,
    finalCanonicalName: payload.name,
    nameSource: "user_canonical",
    insertAttempted: source === "explicit_user",
    blocked: source !== "explicit_user",
    blockReason: source !== "explicit_user" ? "canonical_ingredients_require_explicit_user_create" : null,
  });
  if (source !== "explicit_user") {
    traceUnmatchedPersist("blocked-ingredient-insert", {
      name: payload.name,
      normalizedName: payload.normalized_name,
      source: source ?? "auto_persist",
    });
    traceIngredientCreate("blocked-non-explicit", {
      name: payload.name,
      normalizedName: payload.normalized_name,
      source: source ?? "auto_persist",
    });
    return {
      data: null,
      error: null,
      blocked: true,
      blockReason: "canonical_ingredients_require_explicit_user_create",
    };
  }

  if (shouldBlockCanonicalNameOnCreate(payload.name)) {
    traceCanonicalCreateAttempt({
      flowFunction: "persistIngredientFromInvoiceItem",
      flowOrigin: "explicit_user",
      stage: "blocked-invoice-shorthand",
      normalized: payload.normalized_name,
      finalCanonicalName: payload.name,
      nameSource: "user_canonical",
      insertAttempted: false,
      blocked: true,
      blockReason: "invoice_shorthand_not_canonical",
    });
    traceIngredientCreate("blocked-invoice-shorthand", {
      name: payload.name,
      normalizedName: payload.normalized_name,
    });
    return {
      data: null,
      error: null,
      blocked: true,
      blockReason: "invoice_shorthand_not_canonical",
    };
  }

  const catalog = options?.catalog ?? [];
  const guard = guardIngredientCreation(payload.name, catalog, {
    flowFunction: "persistIngredientFromInvoiceItem",
    flowOrigin: "explicit_user",
    rawInvoiceText: null,
  });
  if (guard.action === "reuse") {
    traceIngredientCreate("duplicate-prevention-reuse", {
      proposedName: payload.name,
      operationalKey: guard.operationalKey,
      existingId: guard.existing.id,
      reason: guard.reason,
    });
    return { data: guard.existing, error: null, reused: true };
  }

  const archivedConflict = await findArchivedIngredientResurrectionConflict(client, payload);
  if (archivedConflict) {
    traceIngredientCreate("blocked-archived-resurrection", {
      name: payload.name,
      normalizedName: payload.normalized_name,
      archivedId: archivedConflict.id,
      mergedInto: archivedConflict.merged_into_ingredient_id,
    });
    return {
      data: null,
      error: null,
      blocked: true,
      blockReason: "archived_ingredient_resurrection",
    };
  }

  traceCanonicalCreateAttempt({
    flowFunction: "persistIngredientFromInvoiceItem",
    flowOrigin: "explicit_user",
    stage: "insert-attempt",
    normalized: payload.normalized_name,
    finalCanonicalName: payload.name,
    nameSource: "user_canonical",
    insertAttempted: true,
    blocked: false,
  });
  traceCanonicalInsert("insert-attempt", {
    name: payload.name,
    normalizedName: payload.normalized_name,
    operationalKey: guard.operationalKey,
    source: "explicit_user",
  });
  traceIngredientCreate("insert-attempt", {
    name: payload.name,
    normalizedName: payload.normalized_name,
    operationalKey: guard.operationalKey,
  });

  const { data, error } = await client
    .from("ingredients")
    .insert(payload)
    .select("id, name, normalized_name, unit")
    .single();

  if (error) {
    traceIngredientCreate("insert-failed", {
      normalizedName: payload.normalized_name,
      message: error.message,
    });
    return { data: null, error };
  }

  traceCanonicalInsert("insert-ok", {
    ingredientId: data?.id,
    normalizedName: payload.normalized_name,
    name: payload.name,
    operationalKey: guard.operationalKey,
  });
  traceIngredientCreate("insert-ok", {
    ingredientId: data?.id,
    normalizedName: payload.normalized_name,
    name: payload.name,
    operationalKey: guard.operationalKey,
  });
  return { data: (data as AutoPersistCatalogEntry | null) ?? null, error: null, reused: false };
}

type ArchivedResurrectionRow = {
  id: string;
  merged_into_ingredient_id?: string | null;
};

async function findArchivedIngredientResurrectionConflict(
  client: AppSupabaseClient,
  payload: IngredientInsertPayload,
): Promise<ArchivedResurrectionRow | null> {
  const operationalKey = normalizeOperationalIdentityKey(payload.name);
  const selectWithArchive =
    "id, normalized_name, name, is_archived, merged_into_ingredient_id";

  const { data, error } = await client.from("ingredients").select(selectWithArchive);
  if (error) return null;

  for (const row of data ?? []) {
    const archived =
      row.is_archived === true || Boolean(row.merged_into_ingredient_id?.trim());
    if (!archived) continue;

    const storedNorm = row.normalized_name?.trim().toLowerCase();
    if (storedNorm && storedNorm === payload.normalized_name) {
      return row as ArchivedResurrectionRow;
    }

    const display = row.name?.trim() || row.normalized_name?.trim() || "";
    if (operationalKey && normalizeOperationalIdentityKey(display) === operationalKey) {
      return row as ArchivedResurrectionRow;
    }
  }
  return null;
}

export type AutoPersistInvoiceItemsParams = {
  client: AppSupabaseClient;
  userId: string;
  invoiceId: string;
  items: AutoPersistInvoiceItem[];
  catalog: AutoPersistCatalogEntry[];
  confirmedAliases?: IngredientAliasMap;
  supplierName?: string | null;
  attemptedKeys: Set<string>;
  isGenericUnit?: (unit: string | null | undefined) => boolean;
  onIngredientCreated?: (row: AutoPersistCatalogEntry) => void;
};

export async function autoPersistUnmatchedInvoiceItems(
  params: AutoPersistInvoiceItemsParams,
): Promise<{ created: number; skipped: number }> {
  const {
    invoiceId,
    items,
    catalog,
    confirmedAliases = {},
    supplierName,
    attemptedKeys,
  } = params;
  const isGenericUnit = params.isGenericUnit ?? defaultIsGenericUnit;

  let skipped = 0;

  for (const item of items) {
    const normalizedName = normalizeIngredientName(item.name.trim());
    const sessionKey = autoPersistSessionKey(invoiceId, normalizedName);
    if (attemptedKeys.has(sessionKey)) {
      skipped += 1;
      continue;
    }
    attemptedKeys.add(sessionKey);

    const match = findInvoiceItemIngredientMatch(
      item.name,
      catalog,
      confirmedAliases,
      supplierName,
    );
    const eligibility = evaluateAutoPersistEligibility(item, match, catalog, { isGenericUnit });

    if (!eligibility.eligible && eligibility.reason === "invoice_shorthand" && match) {
      const aliasApplied = recordInvoiceLineAliasMemory({
        itemName: item.name,
        match,
        confirmedAliases,
        supplierName,
      });
      if (aliasApplied.recorded) {
        traceAliasOnly("shorthand-match-alias-memory", {
          invoiceId,
          itemId: item.id,
          itemName: item.name,
          canonicalId: match.ingredient.id,
        });
        traceAutoPersist("alias-memory-shorthand", {
          invoiceId,
          itemId: item.id,
          itemName: item.name,
          canonicalId: match.ingredient.id,
        });
      }
    }

    if (!eligibility.eligible && eligibility.reason === "has_match" && match) {
      const aliasApplied = recordInvoiceLineAliasMemory({
        itemName: item.name,
        match,
        confirmedAliases,
        supplierName,
      });
      if (aliasApplied.recorded) {
        traceAliasOnly("confirmed-match-alias-memory", {
          invoiceId,
          itemId: item.id,
          itemName: item.name,
          canonicalId: match.ingredient.id,
        });
        traceAutoPersist("alias-memory", {
          invoiceId,
          itemId: item.id,
          itemName: item.name,
          canonicalId: match.ingredient.id,
        });
      }
    }

    if (!eligibility.eligible) {
      traceCanonicalCreateAttempt({
        flowFunction: "autoPersistUnmatchedInvoiceItems",
        flowOrigin: "auto_persist",
        stage: "skip-ineligible",
        rawInvoiceText: item.name,
        normalized: normalizedName,
        finalCanonicalName: item.name.trim(),
        nameSource: "invoice_line",
        insertAttempted: false,
        blocked: true,
        blockReason: eligibility.reason,
      });
      traceUnmatchedPersist("invoice-line-skipped", {
        invoiceId,
        itemId: item.id,
        itemName: item.name,
        matchKind: match?.kind ?? null,
        reason: eligibility.reason,
        note: "Unmatched state stays on invoice; no ingredients.insert",
      });
      traceAutoPersist("skip", {
        invoiceId,
        itemId: item.id,
        itemName: item.name,
        matchKind: match?.kind ?? null,
        reason: eligibility.reason,
      });
      skipped += 1;
      continue;
    }

    traceCanonicalCreateAttempt({
      flowFunction: "autoPersistUnmatchedInvoiceItems",
      flowOrigin: "auto_persist",
      stage: "auto-create-blocked",
      rawInvoiceText: item.name,
      normalized: normalizedName,
      finalCanonicalName: item.name.trim(),
      nameSource: "invoice_line",
      insertAttempted: false,
      blocked: true,
      blockReason: "explicit_user_create_only",
    });
    traceUnmatchedPersist("auto-create-blocked", {
      invoiceId,
      itemId: item.id,
      itemName: item.name,
      reason: "explicit_user_create_only",
    });
    traceAutoPersist("skip-auto-create-disabled", {
      invoiceId,
      itemId: item.id,
      itemName: item.name,
      reason: "explicit_user_create_only",
      note: "Invoice lines never auto-insert into public.ingredients",
    });
    skipped += 1;
  }

  traceAutoPersist("batch-complete", {
    invoiceId,
    created: 0,
    skipped,
    itemCount: items.length,
    autoInsertDisabled: true,
  });
  return { created: 0, skipped };
}
