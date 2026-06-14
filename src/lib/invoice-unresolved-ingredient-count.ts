import type { IngredientAliasMap, IngredientCanonicalInput } from "@/lib/ingredient-canonical";
import { buildInvoiceMatchCatalog } from "@/lib/ingredient-canonical-synthesis";
import {
  type InvoiceItemRow,
  normalizeInvoiceItemFields,
  shouldRejectInvoiceIngredientRow,
} from "@/lib/invoice-item-fields";
import {
  invoiceRowMatchSummaryBucket,
  resolveInvoiceTableRowIngredientMatch,
} from "@/lib/invoice-ingredient-row-display";
import {
  buildCutoverContextForInvoiceItem,
  type PersistedMatchForCutover,
} from "@/lib/invoice-item-match-read-cutover";

export { buildCutoverContextForInvoiceItem };

export type InvoiceUnresolvedIngredientCountInput = Pick<
  InvoiceItemRow,
  "id" | "name" | "quantity" | "unit" | "unit_price" | "total"
>;

export type CountUnresolvedInvoiceIngredientsParams = {
  items: readonly InvoiceUnresolvedIngredientCountInput[];
  ingredientCatalog: readonly IngredientCanonicalInput[];
  confirmedAliases?: IngredientAliasMap;
  supplierName?: string | null;
  persistedMatchByItemId?: ReadonlyMap<string, PersistedMatchForCutover>;
};

export type UnresolvedInvoiceIngredientCountResult = {
  /** Invoice lines included in normalization accounting (not ignored metadata rows). */
  eligibleRowCount: number;
  /** Rows with no canonical match (`displayState === "unmatched"`). */
  unmatchedCount: number;
  matchedCount: number;
  suggestedCount: number;
  /** Every eligible row has a confirmed canonical ingredient match. */
  isNormalizationComplete: boolean;
};

export type InvoiceListIngredientStatusTone = "success" | "warning" | "review";

export type InvoiceListIngredientStatus = {
  tone: InvoiceListIngredientStatusTone;
  label: string;
  unmatchedCount: number;
};

/** Rows that participate in invoice ingredient normalization counts. */
export function isEligibleInvoiceIngredientRow(
  item: InvoiceUnresolvedIngredientCountInput,
): boolean {
  const normalized = normalizeInvoiceItemFields(item);
  return !shouldRejectInvoiceIngredientRow(normalized);
}

/**
 * Count unresolved canonical ingredient matches for one invoice from its line items only.
 * Does not read alias memory tables, catalog rows, or ingredient master data beyond matching.
 */
export function countUnresolvedInvoiceIngredients(
  params: CountUnresolvedInvoiceIngredientsParams,
): UnresolvedInvoiceIngredientCountResult {
  const eligibleItems = params.items
    .map((item) => normalizeInvoiceItemFields(item))
    .filter(isEligibleInvoiceIngredientRow);

  if (eligibleItems.length === 0) {
    return {
      eligibleRowCount: 0,
      unmatchedCount: 0,
      matchedCount: 0,
      suggestedCount: 0,
      isNormalizationComplete: true,
    };
  }

  const matchCatalog = buildInvoiceMatchCatalog(
    params.ingredientCatalog,
    eligibleItems.map((item) => ({ name: item.name })),
  );

  let unmatchedCount = 0;
  let matchedCount = 0;
  let suggestedCount = 0;

  for (const item of eligibleItems) {
    const { state } = resolveInvoiceTableRowIngredientMatch(
      item.name,
      matchCatalog,
      params.confirmedAliases ?? {},
      params.supplierName,
      undefined,
      buildCutoverContextForInvoiceItem(item.id, params.persistedMatchByItemId),
    );
    const bucket = invoiceRowMatchSummaryBucket(state.displayState);
    if (bucket === "matched") matchedCount += 1;
    else if (bucket === "suggested") suggestedCount += 1;
    else unmatchedCount += 1;
  }

  return {
    eligibleRowCount: eligibleItems.length,
    unmatchedCount,
    matchedCount,
    suggestedCount,
    isNormalizationComplete: unmatchedCount === 0 && suggestedCount === 0,
  };
}

/** Batch helper for invoice list badges (invoice id → unmatched line count). */
export function countUnresolvedInvoiceIngredientsByInvoice(
  itemsByInvoice: Readonly<Record<string, readonly InvoiceUnresolvedIngredientCountInput[]>>,
  ingredientCatalog: readonly IngredientCanonicalInput[],
  confirmedAliases: IngredientAliasMap = {},
  supplierNameByInvoice: Readonly<Record<string, string | null | undefined>> = {},
  persistedMatchByInvoiceId: Readonly<
    Record<string, ReadonlyMap<string, PersistedMatchForCutover>>
  > = {},
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const [invoiceId, items] of Object.entries(itemsByInvoice)) {
    counts[invoiceId] = countUnresolvedInvoiceIngredients({
      items,
      ingredientCatalog,
      confirmedAliases,
      supplierName: supplierNameByInvoice[invoiceId] ?? null,
      persistedMatchByItemId: persistedMatchByInvoiceId[invoiceId],
    }).unmatchedCount;
  }
  return counts;
}

export function formatProcessedWithUnresolvedLabel(unmatchedCount: number): string {
  if (unmatchedCount <= 0) return "Processed";
  if (unmatchedCount === 1) return "Processed • 1 unmatched ingredient";
  return `Processed • ${unmatchedCount} unmatched ingredients`;
}

/**
 * Augments base invoice extraction status with ingredient normalization warnings.
 * RED (review): existing OCR/extraction status — caller passes `baseStatus === "Review"`.
 * ORANGE (warning): processed extraction with unresolved unmatched ingredient rows.
 * GREEN (success): processed extraction and all eligible rows confirmed to canonical ingredients.
 */
export function deriveInvoiceListIngredientStatus(params: {
  baseStatus: string;
  unmatchedCount: number;
  isNormalizationComplete?: boolean;
}): InvoiceListIngredientStatus {
  const { baseStatus, unmatchedCount } = params;
  const normalizationComplete =
    params.isNormalizationComplete ?? (unmatchedCount === 0);

  if (baseStatus === "Review") {
    return { tone: "review", label: "Needs review", unmatchedCount };
  }

  if (baseStatus === "Processed" && unmatchedCount > 0) {
    return {
      tone: "warning",
      label: formatProcessedWithUnresolvedLabel(unmatchedCount),
      unmatchedCount,
    };
  }

  if (baseStatus === "Processed" && !normalizationComplete) {
    return {
      tone: "warning",
      label: "Processed • review ingredient matches",
      unmatchedCount,
    };
  }

  if (baseStatus === "Processed") {
    return { tone: "success", label: "Processed", unmatchedCount: 0 };
  }

  return {
    tone: baseStatus === "Processing" ? "warning" : "review",
    label: baseStatus,
    unmatchedCount,
  };
}
