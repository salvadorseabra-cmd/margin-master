import {
  catalogReviewIngredientIdsEqual,
  logCatalogReviewIdFilterRow,
  logCatalogReviewIdFilterSummary,
} from "@/lib/catalog-review-id-filter-log";
import {
  logCatalogReviewRowDropped,
  logCatalogReviewSurvival,
} from "@/lib/catalog-review-survival-log";
import type { AppSupabaseClient } from "@/lib/ingredient-alias-memory";

const LOG_PREFIX = "[catalog_review_persisted_aliases]";

export type CatalogReviewInvoiceDateSource = "invoice_date" | "invoice_created_at" | null;

export type CatalogReviewPersistedAliasRow = {
  id: string;
  ingredientId: string;
  aliasName: string;
  /** Supplier on the alias row (always from ingredient_aliases.supplier_name). */
  supplierName: string | null;
  invoiceLineId: string | null;
  invoiceId: string | null;
  invoiceDate: string | null;
  invoiceDateSource: CatalogReviewInvoiceDateSource;
};

type PersistedAliasDbRow = {
  id: string;
  ingredient_id: string;
  alias_name: string;
  supplier_name: string | null;
};

function logQueryFailure(label: string, message: string): void {
  console.error(`${LOG_PREFIX} ${label} failed: ${message}`);
}

async function assertIngredientOwnedByUser(
  client: AppSupabaseClient,
  ingredientId: string,
  userId: string,
): Promise<boolean> {
  const { data, error } = await client
    .from("ingredients")
    .select("id")
    .eq("id", ingredientId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    logQueryFailure("assertIngredientOwnedByUser", error.message);
    return false;
  }
  return Boolean(data?.id);
}

export function resolveCatalogReviewInvoiceDate(
  invoice: { invoice_date?: string | null; created_at?: string | null } | null | undefined,
): { invoiceDate: string | null; invoiceDateSource: CatalogReviewInvoiceDateSource } {
  const invoiceDate = invoice?.invoice_date?.trim();
  if (invoiceDate) {
    return { invoiceDate, invoiceDateSource: "invoice_date" };
  }
  const createdAt = invoice?.created_at?.trim();
  if (createdAt) {
    return { invoiceDate: createdAt.slice(0, 10), invoiceDateSource: "invoice_created_at" };
  }
  return { invoiceDate: null, invoiceDateSource: null };
}

function assertIngredientIdMatch(
  selectedIngredientId: string,
  row: Pick<PersistedAliasDbRow, "id" | "ingredient_id" | "alias_name">,
): boolean {
  const matches = catalogReviewIngredientIdsEqual(row.ingredient_id, selectedIngredientId);
  if (!matches) {
    logCatalogReviewIdFilterRow({
      stage: "assertIngredientIdMatch",
      beforeCount: 1,
      afterCount: 0,
      selectedId: selectedIngredientId,
      row,
      filterPredicate: "!catalogReviewIngredientIdsEqual(row.ingredient_id, selectedIngredientId)",
    });
  }
  return matches;
}

export type CatalogReviewPersistedAliasDropReason = "ingredient_id mismatch";

export type CatalogReviewPersistedAliasDroppedRow = {
  aliasRowRaw: PersistedAliasDbRow;
  reason: CatalogReviewPersistedAliasDropReason;
};

function mapPersistedAliasRow(
  selectedIngredientId: string,
  row: PersistedAliasDbRow,
  droppedRowsWithReason: CatalogReviewPersistedAliasDroppedRow[],
): CatalogReviewPersistedAliasRow | null {
  if (!assertIngredientIdMatch(selectedIngredientId, row)) {
    logCatalogReviewIdFilterRow({
      stage: "mapPersistedAliasRow",
      beforeCount: 1,
      afterCount: 0,
      selectedId: selectedIngredientId,
      row,
      filterPredicate: "assertIngredientIdMatch failed — return null",
    });
    const dropped = { aliasRowRaw: row, reason: "ingredient_id mismatch" as const };
    droppedRowsWithReason.push(dropped);
    // SURVIVAL DIAGNOSTIC
    logCatalogReviewRowDropped(
      "mapPersistedAliasRow",
      row,
      "assertIngredientIdMatch failed — ingredient_id mismatch",
    );
    return null;
  }

  return {
    id: row.id?.trim() ?? "",
    ingredientId: row.ingredient_id?.trim() ?? selectedIngredientId,
    aliasName: row.alias_name?.trim() ?? "",
    supplierName: row.supplier_name?.trim() || null,
    invoiceLineId: null,
    invoiceId: null,
    invoiceDate: null,
    invoiceDateSource: null,
  };
}

/**
 * Catalog Review right panel: persisted `ingredient_aliases` rows for one canonical only.
 * Uses real columns on ingredient_aliases (no invoice_item_id FK in schema).
 * Does not scan invoices, similarity, pollution review, or operational memory heuristics.
 */
export async function loadPersistedIngredientAliasesForCatalogReview(
  client: AppSupabaseClient,
  ingredientId: string,
  userId: string,
): Promise<CatalogReviewPersistedAliasRow[]> {
  const trimmedId = ingredientId?.trim();
  const trimmedUser = userId?.trim();
  const filtersApplied: string[] = [];

  if (!trimmedId || !trimmedUser) {
    // SURVIVAL DIAGNOSTIC
    logCatalogReviewSurvival("loadPersisted_early_return_missing_ids", [], []);
    // DIAGNOSTIC: remove after source mismatch fixed
    console.group("[CatalogReview RIGHT]");
    console.log("selected ingredient id:", ingredientId);
    console.log("source:", "loadPersistedIngredientAliasesForCatalogReview");
    console.log("exact alias ids returned:", []);
    console.log("filters applied:", ["missing ingredientId or userId — early return"]);
    console.log("null guards / dropped rows:", []);
    console.groupEnd();
    return [];
  }

  filtersApplied.push("assertIngredientOwnedByUser (ingredients.id + user_id)");
  const owned = await assertIngredientOwnedByUser(client, trimmedId, trimmedUser);
  if (!owned) {
    // SURVIVAL DIAGNOSTIC
    logCatalogReviewSurvival("loadPersisted_early_return_not_owned", [], []);
    // DIAGNOSTIC: remove after source mismatch fixed
    console.group("[CatalogReview RIGHT]");
    console.log("selected ingredient id:", trimmedId);
    console.log("source:", "loadPersistedIngredientAliasesForCatalogReview");
    console.log("exact alias ids returned:", []);
    console.log("filters applied:", [
      ...filtersApplied,
      "ingredient not owned by user — early return",
    ]);
    console.log("null guards / dropped rows:", []);
    console.groupEnd();
    return [];
  }

  filtersApplied.push(
    "ingredient_aliases.select(...).eq(ingredient_id, selectedId).order(created_at desc)",
  );

  const { data, error } = await client
    .from("ingredient_aliases")
    .select("id, ingredient_id, alias_name, supplier_name")
    .eq("ingredient_id", trimmedId)
    .order("created_at", { ascending: false });

  if (error) {
    logQueryFailure("loadPersistedIngredientAliasesForCatalogReview", error.message);
    // SURVIVAL DIAGNOSTIC
    logCatalogReviewSurvival("loadPersisted_early_return_query_error", [], []);
    // DIAGNOSTIC: remove after source mismatch fixed
    console.group("[CatalogReview RIGHT]");
    console.log("selected ingredient id:", trimmedId);
    console.log("source:", "loadPersistedIngredientAliasesForCatalogReview");
    console.log("exact alias ids returned:", []);
    console.log("filters applied:", [...filtersApplied, `query error: ${error.message}`]);
    console.log("null guards / dropped rows:", []);
    console.groupEnd();
    return [];
  }

  const aliasRows = (data ?? []) as PersistedAliasDbRow[];
  // SURVIVAL DIAGNOSTIC — rawLoader output (DB rows, pre client map)
  logCatalogReviewSurvival("rawLoader_db", [], aliasRows);
  logCatalogReviewIdFilterSummary({
    stage: "loadPersistedIngredientAliasesForCatalogReview.eq(ingredient_id)",
    beforeCount: aliasRows.length,
    afterCount: aliasRows.length,
    selectedId: trimmedId,
    filterPredicate: `.eq('ingredient_id', trimmedId) — postgrest query (no client-side drop yet)`,
  });
  for (const row of aliasRows) {
    logCatalogReviewIdFilterRow({
      stage: "loadPersistedIngredientAliasesForCatalogReview.eq(ingredient_id)",
      beforeCount: aliasRows.length,
      afterCount: aliasRows.length,
      selectedId: trimmedId,
      row,
      filterPredicate: "ingredient_aliases.ingredient_id eq selectedId (DB)",
    });
  }

  filtersApplied.push("mapPersistedAliasRow (ingredient_id mismatch guard)");

  const droppedRowsWithReason: CatalogReviewPersistedAliasDroppedRow[] = [];
  const mapped: CatalogReviewPersistedAliasRow[] = [];
  const mapBeforeCount = aliasRows.length;
  for (const row of aliasRows) {
    const mappedRow = mapPersistedAliasRow(trimmedId, row, droppedRowsWithReason);
    if (mappedRow) mapped.push(mappedRow);
  }
  logCatalogReviewIdFilterSummary({
    stage: "mapPersistedAliasRow (batch)",
    beforeCount: mapBeforeCount,
    afterCount: mapped.length,
    selectedId: trimmedId,
    filterPredicate: "mapPersistedAliasRow — assertIngredientIdMatch per row",
  });
  // SURVIVAL DIAGNOSTIC
  logCatalogReviewSurvival(
    "mapPersistedAliasRow_batch",
    aliasRows,
    mapped,
    droppedRowsWithReason.map(({ aliasRowRaw, reason }) => ({
      row: aliasRowRaw,
      reason,
    })),
  );
  // SURVIVAL DIAGNOSTIC — final loader return
  logCatalogReviewSurvival(
    "loadPersistedIngredientAliasesForCatalogReview_final",
    aliasRows,
    mapped,
    droppedRowsWithReason.map(({ aliasRowRaw, reason }) => ({
      row: aliasRowRaw,
      reason,
    })),
  );

  const returnedIds = mapped.map((row) => row.id);

  // DIAGNOSTIC: pipeline trace — remove after source mismatch fixed
  console.log("[CatalogReview PIPE]", "rawLoader", {
    ids: returnedIds,
    length: returnedIds.length,
    selectedId: trimmedId,
    rawRowCount: aliasRows.length,
    droppedCount: droppedRowsWithReason.length,
  });

  // DIAGNOSTIC: remove after source mismatch fixed
  console.group("[CatalogReview RIGHT]");
  console.log("selected ingredient id:", trimmedId);
  console.log("source:", "loadPersistedIngredientAliasesForCatalogReview");
  console.log("exact alias ids returned:", returnedIds);
  console.log("filters applied:", filtersApplied);
  console.log("null guards / dropped rows:", droppedRowsWithReason);
  console.groupEnd();

  return mapped;
}
