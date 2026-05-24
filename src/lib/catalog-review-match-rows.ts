import type { CatalogReviewCurrentMatchRow } from "@/lib/catalog-review-current-matches";

export type CatalogReviewMatchRowDto = {
  key: string;
  invoiceLineId: string;
  invoiceWording: string;
  supplierName: string | null;
  invoiceDate: string | null;
  invoiceId: string | null;
  matchedIngredientId: string;
  matchedIngredientName: string;
};

function formatInvoiceDateLabel(raw: string | null | undefined): string | null {
  const trimmed = raw?.trim();
  if (!trimmed) return null;
  const parsed = Date.parse(trimmed);
  if (Number.isNaN(parsed)) return trimmed;
  return new Date(parsed).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function formatCatalogReviewMatchSupplierDate(
  row: Pick<CatalogReviewCurrentMatchRow, "supplierName" | "invoiceDate">,
): { supplierName: string | null; invoiceDate: string | null } {
  const supplierName = row.supplierName?.trim() || null;
  const invoiceDate = formatInvoiceDateLabel(row.invoiceDate);
  return { supplierName, invoiceDate };
}

/** Invoice lines that currently resolve to the selected canonical (live matcher). */
export function buildCatalogReviewMatchRows(
  currentMatches: readonly CatalogReviewCurrentMatchRow[],
  catalogIngredientId: string,
  catalogDisplayName: string,
): CatalogReviewMatchRowDto[] {
  const persistedId = catalogIngredientId.trim();
  const displayName = catalogDisplayName.trim() || persistedId;
  if (!persistedId) return [];

  return currentMatches
    .filter((row) => row.matchedIngredientId.trim() === persistedId)
    .map((row) => {
      const { supplierName, invoiceDate } = formatCatalogReviewMatchSupplierDate(row);
      return {
        key: row.itemId,
        invoiceLineId: row.itemId,
        invoiceWording: row.itemName,
        supplierName,
        invoiceDate,
        invoiceId: row.invoiceId,
        matchedIngredientId: persistedId,
        matchedIngredientName: row.matchedIngredientName.trim() || displayName,
      };
    });
}
