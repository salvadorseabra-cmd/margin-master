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
const CATALOG_SELECT_WITH_ARCHIVE = `${CATALOG_SELECT_WITH_KIND}, is_archived, merged_into_ingredient_id`;

/**
 * Load active ingredient rows from DB (archive filter only).
 * @internal Prefer {@link loadCanonicalIngredientCatalog} or {@link loadMatchingIngredientCatalog}.
 */
export async function loadActiveIngredientCatalog(
  client: CatalogClient,
  extraColumns = "",
): Promise<{ rows: IngredientCanonicalInput[]; error: string | null }> {
  const selectWithArchive = extraColumns
    ? `${CATALOG_SELECT_WITH_ARCHIVE}, ${extraColumns}`
    : CATALOG_SELECT_WITH_ARCHIVE;

  const withArchive = await client.from("ingredients").select(selectWithArchive);
  if (!withArchive.error) {
    return {
      rows: filterActiveCatalogIngredients((withArchive.data ?? []) as IngredientCanonicalInput[]),
      error: null,
    };
  }

  const selectWithKind = extraColumns
    ? `${CATALOG_SELECT_WITH_KIND}, ${extraColumns}`
    : CATALOG_SELECT_WITH_KIND;
  const withKind = await client.from("ingredients").select(selectWithKind);
  if (!withKind.error) {
    return {
      rows: filterActiveCatalogIngredients((withKind.data ?? []) as IngredientCanonicalInput[]),
      error: null,
    };
  }

  const selectBase = extraColumns ? `${CATALOG_SELECT_BASE}, ${extraColumns}` : CATALOG_SELECT_BASE;
  const basic = await client.from("ingredients").select(selectBase);
  if (basic.error) {
    return { rows: [], error: basic.error.message };
  }

  return {
    rows: filterActiveCatalogIngredients((basic.data ?? []) as IngredientCanonicalInput[]),
    error: null,
  };
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
  const selectWithArchive = extraColumns
    ? `${CATALOG_SELECT_WITH_ARCHIVE}, ${extraColumns}`
    : CATALOG_SELECT_WITH_ARCHIVE;

  const result = await client.from("ingredients").select(selectWithArchive);
  if (result.error) {
    return { rows: [], error: result.error.message };
  }
  return { rows: (result.data ?? []) as IngredientCanonicalInput[], error: null };
}

export async function loadCanonicalIngredientCatalog(
  client: CatalogClient,
  extraColumns = "",
): Promise<{ rows: IngredientCanonicalInput[]; error: string | null }> {
  const { rows, error } = await loadActiveIngredientCatalog(client, extraColumns);
  if (error) return { rows: [], error };
  logCatalogLeakDiagnostics(rows, "loadCanonicalIngredientCatalog:before-filter");
  const canonical = filterCanonicalCatalogIngredients(rows);
  logNearDuplicateCanonicalClusters(
    canonical,
    "loadCanonicalIngredientCatalog:after-filter",
  );
  return { rows: canonical, error: null };
}
