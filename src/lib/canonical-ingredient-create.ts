import {
  buildIngredientInsertPayload,
  defaultIsGenericUnit,
  INGREDIENT_CREATE_LOG_PREFIX,
  type AutoPersistInvoiceItem,
  type IngredientInsertPayload,
} from "@/lib/ingredient-auto-persist";
import { looksLikeInvoiceShorthandName } from "@/lib/ingredient-kind";
import {
  buildCatalogIngredientIdentity,
  formatCanonicalIngredientDisplayName,
} from "@/lib/canonical-ingredient-display-name";
import {
  generateOperationalIngredientName,
  shouldBlockCanonicalNameOnCreate,
} from "@/lib/canonical-ingredient-operational-name";
import { normalizeIngredientName } from "@/lib/normalizeIngredient";
import {
  getAliasTraceCompareBucket,
  traceIngredientAliases,
  traceIngredientAliasesNormalizationRejection,
  traceIngredientAliasesShorthandRejection,
  traceIngredientAliasesValidationRejection,
} from "@/lib/ingredient-aliases-trace";
import {
  traceCanonicalCreateAttempt,
  traceCanonicalCreateNameSource,
} from "@/lib/ingredient-catalog-diagnostics";

/** Grep-friendly prefix for explicit catalog create + alias link from invoice lines. */
export const CANONICAL_CREATE_LOG_PREFIX = "[canonical-create]";

export function traceCanonicalCreate(
  stage: string,
  details?: Record<string, unknown>,
): void {
  const message = `${CANONICAL_CREATE_LOG_PREFIX} ${stage}`;
  if (details) console.info(message, details);
  else console.info(message);
}

export function traceCanonicalCreateFailure(
  stage: string,
  details?: Record<string, unknown>,
): void {
  const message = `${CANONICAL_CREATE_LOG_PREFIX} ${stage}`;
  if (details) console.warn(message, details);
  else console.warn(message);
}

export function traceCanonicalModalOpen(details: {
  rawInvoiceText: string;
  itemId: string;
}): void {
  console.info("[canonical_modal_open]", details);
}

export function traceCanonicalSuggestion(details: { suggestedName: string }): void {
  console.info("[canonical_suggestion]", details);
}

export function traceCanonicalConfirmedName(details: { confirmedName: string }): void {
  console.info("[canonical_confirmed_name]", details);
}

export { INGREDIENT_CREATE_LOG_PREFIX };

export type CanonicalIngredientNameValidation =
  | { ok: true }
  | { ok: false; message: string };

function confirmedNameMatchesInvoiceAlias(
  confirmedName: string,
  invoiceAlias: string,
): boolean {
  const fold = (value: string) => normalizeIngredientName(value.trim());
  const a = fold(confirmedName);
  const b = fold(invoiceAlias);
  return a.length > 0 && a === b;
}

export function validateCanonicalIngredientName(
  rawName: string | null | undefined,
  options?: { invoiceAlias?: string | null },
): CanonicalIngredientNameValidation {
  const name = rawName?.trim() ?? "";
  if (!name) {
    traceIngredientAliasesValidationRejection("validateCanonicalIngredientName", "empty_name", {
      rawName,
    });
    return { ok: false, message: "Enter a catalog ingredient name." };
  }
  const invoiceAlias = options?.invoiceAlias?.trim() ?? "";
  if (invoiceAlias && confirmedNameMatchesInvoiceAlias(name, invoiceAlias)) {
    traceIngredientAliasesValidationRejection(
      "validateCanonicalIngredientName",
      "matches_invoice_alias",
      { rawName: name, invoiceAlias },
    );
    return {
      ok: false,
      message: "Enter a catalog name, not invoice shorthand",
    };
  }
  const normalized = normalizeIngredientName(name);
  if (!normalized || normalized === "unknown") {
    traceIngredientAliasesValidationRejection(
      "validateCanonicalIngredientName",
      "invalid_normalized",
      { rawName: name, normalized },
    );
    return { ok: false, message: "Enter a valid catalog ingredient name." };
  }
  if (shouldBlockCanonicalNameOnCreate(name)) {
    traceIngredientAliasesShorthandRejection("validateCanonicalIngredientName", "shorthand_name", {
      rawName: name,
      compareBucket: getAliasTraceCompareBucket(name),
    });
    return {
      ok: false,
      message:
        "Use a full product name for the catalog. Invoice shorthand belongs in alias memory.",
    };
  }
  traceIngredientAliases("validateCanonicalIngredientName:ok", { rawName: name, normalized });
  return { ok: true };
}

export type CanonicalIngredientCreateFormDefaults = {
  itemId: string;
  invoiceAlias: string;
  /** Cleanup preview only — never auto-filled into the confirmed name field. */
  suggestedCanonicalName: string | null;
  unit: string;
  purchase_quantity: string;
  purchase_unit: string;
  base_unit: string;
  current_price: string;
  invoiceQuantityLabel: string | null;
  supplierName: string | null;
};

export function buildCanonicalIngredientCreateDefaults(
  item: AutoPersistInvoiceItem,
  options?: {
    supplierName?: string | null;
    isGenericUnit?: (unit: string | null | undefined) => boolean;
  },
): CanonicalIngredientCreateFormDefaults {
  const isGenericUnit = options?.isGenericUnit ?? defaultIsGenericUnit;
  const invoiceAlias = item.name.trim();
  const payload = buildIngredientInsertPayload(item, "placeholder-user", { isGenericUnit });
  const qty = item.quantity;
  const unit = item.unit?.trim();
  const invoiceQuantityLabel =
    qty != null && Number.isFinite(Number(qty))
      ? unit
        ? `${qty} ${unit}`
        : String(qty)
      : unit
        ? unit
        : null;

  let suggestedCanonicalName = looksLikeInvoiceShorthandName(invoiceAlias)
    ? generateOperationalIngredientName(invoiceAlias) || null
    : formatCanonicalIngredientDisplayName(invoiceAlias) || null;
  if (
    suggestedCanonicalName &&
    confirmedNameMatchesInvoiceAlias(suggestedCanonicalName, invoiceAlias)
  ) {
    suggestedCanonicalName = null;
  }

  traceCanonicalModalOpen({ rawInvoiceText: invoiceAlias, itemId: item.id });
  if (suggestedCanonicalName) {
    traceCanonicalSuggestion({ suggestedName: suggestedCanonicalName });
  }

  traceCanonicalCreateNameSource({
    flowFunction: "buildCanonicalIngredientCreateDefaults",
    flowOrigin: "explicit_user",
    stage: "dialog-defaults",
    rawInvoiceText: invoiceAlias,
    normalized: suggestedCanonicalName
      ? normalizeIngredientName(suggestedCanonicalName)
      : null,
    finalCanonicalName: null,
    nameSource: "suggestion_preview",
    insertAttempted: false,
  });

  return {
    itemId: item.id,
    invoiceAlias,
    suggestedCanonicalName,
    unit: payload?.unit ?? unit ?? "kg",
    purchase_quantity: payload?.purchase_quantity != null ? String(payload.purchase_quantity) : "1",
    purchase_unit: payload?.purchase_unit ?? "",
    base_unit: payload?.base_unit ?? payload?.unit ?? "",
    current_price:
      item.unit_price != null && Number.isFinite(Number(item.unit_price))
        ? String(Number(item.unit_price))
        : payload?.current_price != null
          ? String(payload.current_price)
          : "",
    invoiceQuantityLabel,
    supplierName: options?.supplierName?.trim() || null,
  };
}

export type ExplicitCanonicalInsertInput = {
  canonicalName: string;
  item: AutoPersistInvoiceItem;
  userId: string;
  unit?: string;
  current_price?: number;
  purchase_quantity?: number;
  purchase_unit?: string | null;
  base_unit?: string;
  isGenericUnit?: (unit: string | null | undefined) => boolean;
};

/** Build insert payload using user-confirmed canonical name and invoice-line operational fields. */
export function buildExplicitCanonicalInsertPayload(
  input: ExplicitCanonicalInsertInput,
): IngredientInsertPayload | null {
  const validation = validateCanonicalIngredientName(input.canonicalName, {
    invoiceAlias: input.item.name,
  });
  if (!validation.ok) {
    traceIngredientAliases("buildExplicitCanonicalInsertPayload:early-return", {
      branch: "validateCanonicalIngredientName_failed",
      canonicalName: input.canonicalName,
      invoiceAlias: input.item.name,
    });
    return null;
  }

  traceCanonicalConfirmedName({ confirmedName: input.canonicalName.trim() });

  traceCanonicalCreateAttempt({
    flowFunction: "buildExplicitCanonicalInsertPayload",
    flowOrigin: "explicit_user",
    stage: "enter",
    rawInvoiceText: input.item.name,
    normalized: normalizeIngredientName(input.canonicalName),
    finalCanonicalName: input.canonicalName,
    nameSource: "user_canonical",
    insertAttempted: false,
  });

  const base = buildIngredientInsertPayload(input.item, input.userId, {
    isGenericUnit: input.isGenericUnit,
  });
  if (!base) {
    traceIngredientAliases("buildExplicitCanonicalInsertPayload:early-return", {
      branch: "buildIngredientInsertPayload_null",
      invoiceAlias: input.item.name,
    });
    return null;
  }

  const { name, normalized_name: normalizedName } = buildCatalogIngredientIdentity(
    input.canonicalName,
  );
  traceCanonicalCreateNameSource({
    flowFunction: "buildExplicitCanonicalInsertPayload",
    flowOrigin: "explicit_user",
    stage: "catalog-identity-resolved",
    rawInvoiceText: input.item.name,
    normalized: normalizedName,
    finalCanonicalName: name,
    nameSource: "user_canonical",
    insertAttempted: false,
  });
  traceCanonicalCreate("identity-resolved", {
    canonicalInput: input.canonicalName,
    name,
    normalizedName,
    invoiceAlias: input.item.name,
  });
  if (!normalizedName) {
    traceIngredientAliasesNormalizationRejection(
      "buildExplicitCanonicalInsertPayload",
      "catalog_identity_empty",
      { canonicalName: input.canonicalName, invoiceAlias: input.item.name },
    );
    return null;
  }

  const unit = input.unit?.trim() || base.unit;
  const purchase_quantity =
    input.purchase_quantity != null && input.purchase_quantity > 0
      ? input.purchase_quantity
      : base.purchase_quantity;
  const purchase_unit =
    input.purchase_unit !== undefined ? input.purchase_unit : base.purchase_unit;
  const base_unit = input.base_unit?.trim() || base.base_unit || unit;
  const current_price =
    input.current_price != null && Number.isFinite(input.current_price) && input.current_price >= 0
      ? input.current_price
      : base.current_price;

  return {
    ...base,
    user_id: input.userId,
    name,
    normalized_name: normalizedName,
    unit,
    current_price,
    purchase_quantity,
    purchase_unit,
    base_unit,
  };
}
