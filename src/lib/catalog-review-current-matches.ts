/**
 * Catalog Review — current invoice line matches via the live ItemsTable matcher.
 * Display and counts come from `invoice_items` + `invoices` scan, not `ingredient_aliases`.
 *
 * Schema (migrations): invoice_items has no ingredient_id — match is resolved at read time
 * using confirmed alias memory + catalog (same as purchase memory / ingredients detail).
 */

import type { PostgrestError } from "@supabase/supabase-js";
import { formatCanonicalIngredientDisplayName } from "@/lib/canonical-ingredient-display-name";
import { persistManualIngredientCorrection } from "@/lib/ingredient-correction-memory";
import type { IngredientAliasMap, IngredientCanonicalInput } from "@/lib/ingredient-canonical";
import { buildInvoiceMatchCatalog } from "@/lib/ingredient-canonical-synthesis";
import {
  invoiceRowMatchSummaryBucket,
  resolveInvoiceTableRowIngredientMatch,
} from "@/lib/invoice-ingredient-row-display";
import {
  buildCutoverContextForInvoiceItem,
  buildPersistedMatchMapFromRows,
  type PersistedMatchForCutover,
} from "@/lib/invoice-item-match-read-cutover";
import { getInvoiceItemMatchesForItemIds } from "@/lib/invoice-item-match-repository";
import { isMatchLifecycleReadCutoverEnabled } from "@/lib/match-lifecycle-flags";
import { normalizeInvoiceItemFields } from "@/lib/invoice-item-fields";
import { isEligibleInvoiceIngredientRow } from "@/lib/invoice-unresolved-ingredient-count";
import type { AppSupabaseClient } from "@/lib/ingredient-alias-memory";
import {
  buildMatchedInvoiceProductsFromScan,
  loadInvoiceItemsForMatchedProductScan,
  MATCHED_INVOICE_PRODUCTS_SCAN_LIMIT,
  type IngredientMatchedInvoiceProduct,
} from "@/lib/ingredient-operational-intelligence";
import { normalizeSupplierDisplayName } from "@/lib/supplier-identity";

export type CatalogReviewInvoiceItemScanRow = {
  id: string;
  invoice_id: string;
  name: string;
  quantity: number | null;
  unit: string | null;
  unit_price: number | null;
  total: number | null;
  created_at: string;
  invoices: {
    invoice_date: string | null;
    supplier_name: string | null;
  } | null;
};

export type CatalogReviewCurrentMatchRow = IngredientMatchedInvoiceProduct & {
  matchedIngredientName: string;
};

export type CatalogReviewCurrentMatchesLoadResult = {
  rows: CatalogReviewCurrentMatchRow[];
  truncated: boolean;
  scanLimit: number;
};

function normalizeSupplierScope(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null;
  return normalizeSupplierDisplayName(raw) || null;
}

function canonicalDisplayNameForEntry(
  entry: IngredientCanonicalInput,
  ingredientId: string,
): string | null {
  const name = entry.id?.trim() === ingredientId ? entry.name?.trim() : null;
  if (!name) return null;
  return formatCanonicalIngredientDisplayName(name) || name;
}

/**
 * One pass over invoice scan rows — count live matcher hits per catalog ingredient id.
 */
export function buildCatalogReviewCurrentMatchCountsFromScan(
  catalog: readonly IngredientCanonicalInput[],
  confirmedAliases: IngredientAliasMap,
  scanRows: readonly CatalogReviewInvoiceItemScanRow[],
  persistedMatchByItemId?: ReadonlyMap<string, PersistedMatchForCutover>,
): Record<string, number> {
  const catalogIds = new Set(
    catalog.map((row) => row.id?.trim()).filter((id): id is string => Boolean(id)),
  );
  if (catalogIds.size === 0 || scanRows.length === 0) return {};

  const eligibleRows = scanRows
    .map((row) =>
      normalizeInvoiceItemFields({
        id: row.id,
        name: row.name,
        quantity: row.quantity,
        unit: row.unit,
        unit_price: row.unit_price,
        total: row.total,
      }),
    )
    .filter(isEligibleInvoiceIngredientRow);
  if (eligibleRows.length === 0) return {};

  const matchCatalog = buildInvoiceMatchCatalog(
    [...catalog],
    eligibleRows.map((row) => ({ name: row.name })),
  );
  const sourceById = new Map(scanRows.map((row) => [row.id, row]));
  const seenItemIds = new Set<string>();
  const counts: Record<string, number> = {};

  for (const normalized of eligibleRows) {
    const source = sourceById.get(normalized.id);
    if (!source || seenItemIds.has(normalized.id)) continue;

    const supplierName = normalizeSupplierScope(source.invoices?.supplier_name ?? null);
    const { match, state } = resolveInvoiceTableRowIngredientMatch(
      normalized.name,
      matchCatalog,
      confirmedAliases,
      supplierName,
      undefined,
      buildCutoverContextForInvoiceItem(normalized.id, persistedMatchByItemId),
    );
    const matchedIngredientId = match?.ingredient.id?.trim();
    if (!match || !matchedIngredientId || !catalogIds.has(matchedIngredientId)) continue;

    const bucket = invoiceRowMatchSummaryBucket(state.displayState);
    if (bucket === "unmatched") continue;

    seenItemIds.add(normalized.id);
    counts[matchedIngredientId] = (counts[matchedIngredientId] ?? 0) + 1;
  }

  return counts;
}

export async function loadCatalogReviewInvoiceItemScan(
  client: AppSupabaseClient,
): Promise<{
  rows: CatalogReviewInvoiceItemScanRow[];
  truncated: boolean;
  scanLimit: number;
  persistedMatchByItemId: Map<string, PersistedMatchForCutover>;
}> {
  const { rows, truncated } = await loadInvoiceItemsForMatchedProductScan(client);
  const scanRows = rows as CatalogReviewInvoiceItemScanRow[];

  let persistedMatchByItemId = new Map<string, PersistedMatchForCutover>();
  if (isMatchLifecycleReadCutoverEnabled() && scanRows.length > 0) {
    const { data: matchRows } = await getInvoiceItemMatchesForItemIds(
      client,
      scanRows.map((row) => row.id),
    );
    persistedMatchByItemId = buildPersistedMatchMapFromRows(matchRows ?? []);
  }

  return {
    rows: scanRows,
    truncated,
    scanLimit: MATCHED_INVOICE_PRODUCTS_SCAN_LIMIT,
    persistedMatchByItemId,
  };
}

export function loadCatalogReviewCurrentMatchesForIngredient(
  ingredientId: string,
  catalog: readonly IngredientCanonicalInput[],
  confirmedAliases: IngredientAliasMap,
  scanRows: readonly CatalogReviewInvoiceItemScanRow[],
  options?: {
    truncated?: boolean;
    scanLimit?: number;
    persistedMatchByItemId?: ReadonlyMap<string, PersistedMatchForCutover>;
  },
): CatalogReviewCurrentMatchesLoadResult {
  const trimmedId = ingredientId.trim();
  const entry = catalog.find((row) => row.id?.trim() === trimmedId);
  const matchedIngredientName =
    (entry && canonicalDisplayNameForEntry(entry, trimmedId)) ||
    trimmedId;

  const result = buildMatchedInvoiceProductsFromScan(
    trimmedId,
    catalog,
    confirmedAliases,
    scanRows,
    options,
  );

  return {
    rows: result.products.map((product) => ({
      ...product,
      matchedIngredientName: matchedIngredientName || result.canonicalName || trimmedId,
    })),
    truncated: result.truncated,
    scanLimit: result.scanLimit,
  };
}

export type ReassignCatalogReviewInvoiceLineParams = {
  client: AppSupabaseClient;
  confirmedAliases: IngredientAliasMap;
  itemName: string;
  toIngredientId: string;
  toIngredientName: string;
  supplierName?: string | null;
};

export type ReassignCatalogReviewInvoiceLineResult = {
  nextConfirmedAliases: IngredientAliasMap;
  error: PostgrestError | null;
};

/**
 * Persist a new live match for one invoice line wording (updates confirmed alias memory only).
 */
export async function reassignCatalogReviewInvoiceLineMatch(
  params: ReassignCatalogReviewInvoiceLineParams,
): Promise<ReassignCatalogReviewInvoiceLineResult> {
  const { applied, error } = await persistManualIngredientCorrection({
    itemName: params.itemName,
    ingredientId: params.toIngredientId,
    ingredientName: params.toIngredientName,
    supplierName: params.supplierName,
    confirmedAliases: params.confirmedAliases,
    supabase: params.client,
  });

  if (error) {
    return { error, nextConfirmedAliases: params.confirmedAliases };
  }
  if (!applied) {
    return {
      error: { message: "Could not save invoice line match", code: "invalid_match" } as PostgrestError,
      nextConfirmedAliases: params.confirmedAliases,
    };
  }

  return {
    error: null,
    nextConfirmedAliases: applied.nextConfirmedAliases,
  };
}
