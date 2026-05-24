import {
  catalogReviewIngredientIdsEqual,
  logCatalogReviewIdFilterRow,
  logCatalogReviewIdFilterSummary,
} from "@/lib/catalog-review-id-filter-log";
import type { CatalogReviewPersistedAliasRow } from "@/lib/catalog-review-persisted-aliases";
import {
  logCatalogReviewRowDropped,
  logCatalogReviewSurvival,
} from "@/lib/catalog-review-survival-log";

export type CatalogReviewAliasRowDto = {
  key: string;
  aliasId: string;
  invoiceWording: string;
  supplierName: string | null;
  invoiceDate: string | null;
  invoiceDateSource: CatalogReviewPersistedAliasRow["invoiceDateSource"];
  invoiceLineId: string | null;
  invoiceId: string | null;
  /** Persisted DB link — always the selected canonical ingredient. */
  persistedIngredientId: string;
  persistedIngredientName: string;
};

export type BuildCatalogReviewAliasRowsInput = {
  persistedAliases: readonly CatalogReviewPersistedAliasRow[];
  /** Ingredient shown in the catalog review workspace (page context). */
  catalogIngredientId: string;
  catalogDisplayName: string;
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

export function formatCatalogReviewAliasSupplierDate(
  alias: Pick<CatalogReviewPersistedAliasRow, "supplierName" | "invoiceDate" | "invoiceDateSource">,
): { supplierName: string | null; invoiceDate: string | null } {
  const supplierName = alias.supplierName?.trim() || null;
  const invoiceDate =
    alias.invoiceDateSource != null
      ? formatInvoiceDateLabel(alias.invoiceDate)
      : null;
  return { supplierName, invoiceDate };
}

export function formatCatalogReviewAliasContextLine(
  supplierName: string | null,
  invoiceDate: string | null,
): string | null {
  if (supplierName && invoiceDate) return `${supplierName} · ${invoiceDate}`;
  return supplierName ?? invoiceDate;
}

function sortAliasNames(names: string[]): string[] {
  return [...names].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
}

/** Alias rows from persisted ingredient_aliases links only (matching catalogIngredientId). */
export function buildCatalogReviewAliasRows(
  input: BuildCatalogReviewAliasRowsInput,
): CatalogReviewAliasRowDto[] {
  const { persistedAliases, catalogIngredientId, catalogDisplayName } = input;
  const persistedId = catalogIngredientId.trim();
  const persistedName = catalogDisplayName.trim() || persistedId;
  if (!persistedId) {
    // SURVIVAL DIAGNOSTIC
    logCatalogReviewSurvival("buildCatalogReviewAliasRows_early_empty_catalog_id", persistedAliases, []);
    return [];
  }

  // SURVIVAL DIAGNOSTIC
  logCatalogReviewSurvival("buildCatalogReviewAliasRows_input", persistedAliases, persistedAliases);

  const rows: CatalogReviewAliasRowDto[] = [];
  const buildBeforeCount = persistedAliases.length;
  const droppedReasons: { row: CatalogReviewPersistedAliasRow; reason: string }[] = [];

  for (const alias of persistedAliases) {
    if (!catalogReviewIngredientIdsEqual(alias.ingredientId, persistedId)) {
      logCatalogReviewIdFilterRow({
        stage: "buildCatalogReviewAliasRows",
        beforeCount: buildBeforeCount,
        afterCount: rows.length,
        selectedId: persistedId,
        row: { id: alias.id, ingredientId: alias.ingredientId, aliasName: alias.aliasName },
        filterPredicate:
          "!catalogReviewIngredientIdsEqual(alias.ingredientId, catalogIngredientId.trim())",
      });
      droppedReasons.push({
        row: alias,
        reason:
          "!catalogReviewIngredientIdsEqual(alias.ingredientId, catalogIngredientId.trim())",
      });
      // SURVIVAL DIAGNOSTIC
      logCatalogReviewRowDropped(
        "buildCatalogReviewAliasRows",
        alias,
        "!catalogReviewIngredientIdsEqual(alias.ingredientId, catalogIngredientId.trim())",
      );
      if (import.meta.env.DEV) {
        console.error("[catalog_review_alias_integrity] persisted alias scoped to wrong canonical — excluded", {
          selectedCanonicalId: persistedId,
          aliasId: alias.id,
          aliasIngredientId: alias.ingredientId,
          aliasName: alias.aliasName,
        });
      }
      continue;
    }

    const { supplierName, invoiceDate } = formatCatalogReviewAliasSupplierDate(alias);
    rows.push({
      key: alias.id,
      aliasId: alias.id,
      invoiceWording: alias.aliasName,
      supplierName,
      invoiceDate,
      invoiceDateSource: alias.invoiceDateSource,
      invoiceLineId: alias.invoiceLineId,
      invoiceId: alias.invoiceId,
      persistedIngredientId: persistedId,
      persistedIngredientName: persistedName,
    });
  }

  logCatalogReviewIdFilterSummary({
    stage: "buildCatalogReviewAliasRows",
    beforeCount: buildBeforeCount,
    afterCount: rows.length,
    selectedId: persistedId,
    filterPredicate:
      "catalogReviewIngredientIdsEqual(alias.ingredientId, catalogIngredientId.trim())",
  });

  // SURVIVAL DIAGNOSTIC
  logCatalogReviewSurvival(
    "buildCatalogReviewAliasRows_output",
    persistedAliases,
    rows,
    droppedReasons,
  );

  // DIAGNOSTIC: pipeline trace — remove after source mismatch fixed
  const rowIds = rows.map((row) => row.aliasId);
  console.log("[CatalogReview PIPE]", "afterBuildAliasRows", {
    ids: rowIds,
    length: rowIds.length,
    selectedId: persistedId,
    inputLength: persistedAliases.length,
    filteredOut: persistedAliases.length - rows.length,
  });

  return rows;
}

/** Read-only invoice alias names — persisted links for the selected canonical only. */
export function buildCatalogReviewInvoiceAliasNames(
  persistedAliases: readonly CatalogReviewPersistedAliasRow[],
  catalogIngredientId: string,
): string[] {
  const persistedId = catalogIngredientId.trim();
  if (!persistedId) return [];
  const names = persistedAliases
    .filter((alias) => catalogReviewIngredientIdsEqual(alias.ingredientId, persistedId))
    .map((alias) => alias.aliasName);
  return sortAliasNames(names);
}
