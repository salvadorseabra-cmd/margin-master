/**
 * Ingredient catalog loaders — three data layers (do not mix):
 *
 * 1. **Invoice aliases** — raw supplier/OCR text on invoice lines only (`invoice_items` state).
 *    Unmatched lines stay here until the user matches or creates a canonical ingredient.
 *
 * 2. **Alias memory** — operational mappings (`ingredient_aliases`, localStorage overrides).
 *    Links invoice wording → canonical `ingredient_id`; never a substitute for the catalog.
 *
 * 3. **Canonical catalog** — human-facing operational entities (Ingredients page, recipe picker,
 *    costing, margin alerts). Rows enter only via explicit user create or reuse of an existing
 *    canonical on match/create. Shorthand/alias DB pollution is filtered at load time.
 *
 * Use {@link loadCanonicalIngredientCatalog} for all human-facing UI.
 * Use {@link loadMatchingIngredientCatalog} for invoice match targets (canonical only).
 * {@link loadActiveIngredientCatalog} is internal — active rows before kind filter; do not use in UI.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  filterActiveCatalogIngredients,
  isArchivedIngredientEntry,
  type IngredientCanonicalInput,
} from "@/lib/ingredient-canonical";
import {
  filterCanonicalCatalogIngredients,
  filterMatchingCatalogIngredients,
} from "@/lib/ingredient-kind";
import {
  logCatalogLeakDiagnostics,
  logNearDuplicateCanonicalClusters,
} from "@/lib/ingredient-catalog-diagnostics";
import type { Database } from "@/integrations/supabase/types";

type CatalogClient = SupabaseClient<Database>;

const CATALOG_SELECT_BASE = "id, name, normalized_name, unit";
const CATALOG_SELECT_WITH_KIND = `${CATALOG_SELECT_BASE}, ingredient_kind`;
const CATALOG_SELECT_ARCHIVE_ONLY = `${CATALOG_SELECT_BASE}, is_archived, merged_into_ingredient_id`;
const CATALOG_SELECT_WITH_ARCHIVE = `${CATALOG_SELECT_WITH_KIND}, is_archived, merged_into_ingredient_id`;

export const CANONICAL_MERGE_ARCHIVE_VISIBILITY_PREFIX =
  "[canonical_merge_archive_visibility]";

export type CatalogSelectTierLabel =
  | "with_kind_and_archive"
  | "archive_only"
  | "with_kind"
  | "base";

function catalogSelectTierLabel(select: string): CatalogSelectTierLabel {
  if (select.includes("ingredient_kind") && select.includes("is_archived")) {
    return "with_kind_and_archive";
  }
  if (select.includes("is_archived")) return "archive_only";
  if (select.includes("ingredient_kind")) return "with_kind";
  return "base";
}

function selectIncludesArchiveColumns(select: string): boolean {
  return select.includes("is_archived");
}

function logCanonicalMergeArchiveVisibility(
  message: string,
  details: Record<string, unknown>,
): void {
  console.info(CANONICAL_MERGE_ARCHIVE_VISIBILITY_PREFIX, message, details);
}

function sampleArchiveFlags(rows: IngredientCanonicalInput[], limit = 5) {
  return rows.slice(0, limit).map((row) => ({
    id: row.id,
    name: row.name,
    is_archived: row.is_archived ?? null,
    merged_into_ingredient_id: row.merged_into_ingredient_id ?? null,
  }));
}

async function ingredientArchiveColumnsExist(client: CatalogClient): Promise<boolean> {
  const { error } = await client.from("ingredients").select("is_archived").limit(1);
  return !error;
}

/** PostgREST select for catalog tiers; applies server-side active filter when archive columns are selected. */
function fetchIngredientCatalogSelect(
  client: CatalogClient,
  select: string,
  options?: { activeOnly?: boolean },
) {
  const query = client.from("ingredients").select(select);
  if (options?.activeOnly && selectIncludesArchiveColumns(select)) {
    return query.eq("is_archived", false).is("merged_into_ingredient_id", null);
  }
  return query;
}

/**
 * Load active ingredient rows from DB (archive filter only).
 * @internal Prefer {@link loadCanonicalIngredientCatalog} or {@link loadMatchingIngredientCatalog}.
 */
export async function loadActiveIngredientCatalog(
  client: CatalogClient,
  extraColumns = "",
): Promise<{ rows: IngredientCanonicalInput[]; error: string | null }> {
  const selectTiers = [
    extraColumns ? `${CATALOG_SELECT_WITH_ARCHIVE}, ${extraColumns}` : CATALOG_SELECT_WITH_ARCHIVE,
    extraColumns ? `${CATALOG_SELECT_ARCHIVE_ONLY}, ${extraColumns}` : CATALOG_SELECT_ARCHIVE_ONLY,
    extraColumns ? `${CATALOG_SELECT_WITH_KIND}, ${extraColumns}` : CATALOG_SELECT_WITH_KIND,
    extraColumns ? `${CATALOG_SELECT_BASE}, ${extraColumns}` : CATALOG_SELECT_BASE,
  ];

  let lastError: string | null = null;
  let archiveColumnsOnDb: boolean | undefined;

  for (const select of selectTiers) {
    const hasArchiveColumns = selectIncludesArchiveColumns(select);
    if (!hasArchiveColumns) {
      if (archiveColumnsOnDb === undefined) {
        archiveColumnsOnDb = await ingredientArchiveColumnsExist(client);
      }
      if (archiveColumnsOnDb) {
        logCanonicalMergeArchiveVisibility("skip_select_tier_missing_archive_columns", {
          selectTier: catalogSelectTierLabel(select),
          select,
        });
        continue;
      }
    }

    const result = await fetchIngredientCatalogSelect(client, select, { activeOnly: true });
    if (result.error) {
      lastError = result.error.message;
      continue;
    }

    const raw = (result.data ?? []) as IngredientCanonicalInput[];
    const rows = filterActiveCatalogIngredients(raw, { archiveFieldsLoaded: hasArchiveColumns });
    logCanonicalMergeArchiveVisibility("catalog_load_tier_used", {
      selectTier: catalogSelectTierLabel(select),
      hasArchiveColumns,
      serverActiveFilter: hasArchiveColumns,
      rawRowCount: raw.length,
      activeRowCount: rows.length,
      archiveSample: sampleArchiveFlags(raw),
    });
    if (!hasArchiveColumns) {
      logCanonicalMergeArchiveVisibility("catalog_load_without_archive_columns", {
        selectTier: catalogSelectTierLabel(select),
        select,
        rowCount: raw.length,
      });
    }
    const leaked = rows.filter((row) => isArchivedIngredientEntry(row));
    if (leaked.length > 0) {
      logCanonicalMergeArchiveVisibility("archived_row_after_active_filter", {
        selectTier: catalogSelectTierLabel(select),
        leakedIds: leaked.map((row) => row.id),
      });
    }
    return { rows, error: null };
  }

  return { rows: [], error: lastError };
}

/**
 * Invoice matcher targets: active canonical rows only (no alias kind, no shorthand pollution).
 * In-memory {@link buildInvoiceMatchCatalog} may add synthetics for unmatched lines; DB load must not.
 */
export async function loadMatchingIngredientCatalog(
  client: CatalogClient,
  extraColumns = "",
): Promise<{ rows: IngredientCanonicalInput[]; error: string | null }> {
  const { rows, error } = await loadActiveIngredientCatalog(client, extraColumns);
  if (error) return { rows: [], error };
  logCatalogLeakDiagnostics(rows, "loadMatchingIngredientCatalog:before-filter");
  return { rows: filterMatchingCatalogIngredients(rows), error: null };
}

/**
 * Human-facing ingredients catalog: active canonical rows only (no alias/OCR leakage).
 * Falls back when `ingredient_kind` column is not migrated yet (name heuristics apply).
 */
/**
 * All ingredient rows (including archived) for read-only migration preview / merge deps.
 */
export async function loadIngredientCatalogIncludingArchived(
  client: CatalogClient,
  extraColumns = "",
): Promise<{ rows: IngredientCanonicalInput[]; error: string | null }> {
  const selectTiers = [
    extraColumns ? `${CATALOG_SELECT_WITH_ARCHIVE}, ${extraColumns}` : CATALOG_SELECT_WITH_ARCHIVE,
    extraColumns ? `${CATALOG_SELECT_ARCHIVE_ONLY}, ${extraColumns}` : CATALOG_SELECT_ARCHIVE_ONLY,
    extraColumns ? `${CATALOG_SELECT_WITH_KIND}, ${extraColumns}` : CATALOG_SELECT_WITH_KIND,
    extraColumns ? `${CATALOG_SELECT_BASE}, ${extraColumns}` : CATALOG_SELECT_BASE,
  ];

  let lastError: string | null = null;
  for (const select of selectTiers) {
    const result = await fetchIngredientCatalogSelect(client, select);
    if (result.error) {
      lastError = result.error.message;
      continue;
    }
    return { rows: (result.data ?? []) as IngredientCanonicalInput[], error: null };
  }

  return { rows: [], error: lastError };
}

export async function loadCanonicalIngredientCatalog(
  client: CatalogClient,
  extraColumns = "",
): Promise<{ rows: IngredientCanonicalInput[]; error: string | null }> {
  const { rows, error } = await loadActiveIngredientCatalog(client, extraColumns);
  if (error) return { rows: [], error };
  logCatalogLeakDiagnostics(rows, "loadCanonicalIngredientCatalog:before-filter");
  const canonical = filterCanonicalCatalogIngredients(rows);
  const archivedLeak = canonical.filter((row) => isArchivedIngredientEntry(row));
  if (archivedLeak.length > 0) {
    logCanonicalMergeArchiveVisibility("archived_row_in_canonical_catalog", {
      leakedIds: archivedLeak.map((row) => row.id),
      mergedInto: archivedLeak.map((row) => row.merged_into_ingredient_id ?? null),
    });
  }
  logNearDuplicateCanonicalClusters(
    canonical,
    "loadCanonicalIngredientCatalog:after-filter",
  );
  return { rows: canonical, error: null };
}
