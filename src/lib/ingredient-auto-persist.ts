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
import { normalizeIngredientName } from "@/lib/normalizeIngredient";

const LOG_PREFIX = "[ingredient-auto-persist]";
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
};

function traceAutoPersist(stage: string, details?: Record<string, unknown>): void {
  if (!import.meta.env.DEV) return;
  if (details) console.debug(`${LOG_PREFIX} ${stage}`, details);
  else console.debug(`${LOG_PREFIX} ${stage}`);
}

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

  if (match) {
    if (isConfirmedIngredientMatch(match)) return { eligible: false, reason: "has_match" };
    if (isSuggestedIngredientMatch(match)) return { eligible: false, reason: "suggested_match" };
  }

  const name = item.name.trim();
  if (isInvalidAutoPersistName(name)) {
    return { eligible: false, reason: "invalid_name" };
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
  if (!normalizedName || isInvalidAutoPersistName(name)) return null;

  const extractedUnit = item.unit?.trim() || null;
  const structured = resolveInvoiceLinePurchaseFormat({
    name,
    quantity: item.quantity,
    unit: item.unit,
  });
  const purchaseFields = structuredPurchaseToIngredientFields(structured, extractedUnit, isGenericUnit);
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
  };
}

export async function persistIngredientFromInvoiceItem(
  client: AppSupabaseClient,
  payload: IngredientInsertPayload,
  options?: { catalog?: AutoPersistCatalogEntry[] },
): Promise<{
  data: AutoPersistCatalogEntry | null;
  error: PostgrestError | null;
  reused?: boolean;
}> {
  const catalog = options?.catalog ?? [];
  const guard = guardIngredientCreation(payload.name, catalog);
  if (guard.action === "reuse") {
    traceAutoPersist("duplicate-prevention-reuse", {
      proposedName: payload.name,
      operationalKey: guard.operationalKey,
      existingId: guard.existing.id,
      reason: guard.reason,
    });
    return { data: guard.existing, error: null, reused: true };
  }

  const { data, error } = await client
    .from("ingredients")
    .insert(payload)
    .select("id, name, normalized_name, unit")
    .single();

  if (error) {
    traceAutoPersist("insert-failed", { normalizedName: payload.normalized_name, message: error.message });
    return { data: null, error };
  }

  traceAutoPersist("insert-ok", {
    ingredientId: data?.id,
    normalizedName: payload.normalized_name,
    name: payload.name,
    operationalKey: guard.operationalKey,
  });
  return { data: (data as AutoPersistCatalogEntry | null) ?? null, error: null, reused: false };
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
    client,
    userId,
    invoiceId,
    items,
    confirmedAliases = {},
    supplierName,
    attemptedKeys,
    onIngredientCreated,
  } = params;
  const isGenericUnit = params.isGenericUnit ?? defaultIsGenericUnit;

  let catalog = [...params.catalog];
  let created = 0;
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

    if (!eligibility.eligible) {
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

    const payload = buildIngredientInsertPayload(item, userId, { isGenericUnit });
    if (!payload) {
      traceAutoPersist("skip", { invoiceId, itemId: item.id, reason: "invalid_payload" });
      skipped += 1;
      continue;
    }

    const { data, error, reused } = await persistIngredientFromInvoiceItem(client, payload, {
      catalog,
    });
    if (error || !data) {
      attemptedKeys.delete(sessionKey);
      skipped += 1;
      continue;
    }

    if (reused) {
      traceAutoPersist("skip", {
        invoiceId,
        itemId: item.id,
        itemName: item.name,
        reason: "duplicate_operational_identity",
        existingId: data.id,
      });
      skipped += 1;
      continue;
    }

    catalog = [...catalog, data];
    onIngredientCreated?.(data);
    created += 1;
  }

  traceAutoPersist("batch-complete", { invoiceId, created, skipped, itemCount: items.length });
  return { created, skipped };
}
