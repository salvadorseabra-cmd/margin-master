import type { SupabaseClient } from "@supabase/supabase-js";
import {
  filterActiveCatalogIngredients,
  type IngredientCanonicalInput,
} from "@/lib/ingredient-canonical";
import { filterCanonicalCatalogIngredients } from "@/lib/ingredient-kind";
import type { Database } from "@/integrations/supabase/types";

type CatalogClient = SupabaseClient<Database>;

const CATALOG_SELECT_BASE = "id, name, normalized_name, unit";
const CATALOG_SELECT_WITH_KIND = `${CATALOG_SELECT_BASE}, ingredient_kind`;
const CATALOG_SELECT_WITH_ARCHIVE = `${CATALOG_SELECT_WITH_KIND}, is_archived, merged_into_ingredient_id`;

/**
 * Load ingredients for matching/pickers. Tries merge-archive columns when migrated;
 * falls back to base columns so pre-migration databases still work.
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
 * Human-facing ingredients catalog: active canonical rows only (no alias/OCR leakage).
 * Falls back when `ingredient_kind` column is not migrated yet (name heuristics apply).
 */
export async function loadCanonicalIngredientCatalog(
  client: CatalogClient,
  extraColumns = "",
): Promise<{ rows: IngredientCanonicalInput[]; error: string | null }> {
  const { rows, error } = await loadActiveIngredientCatalog(client, extraColumns);
  if (error) return { rows: [], error };
  return { rows: filterCanonicalCatalogIngredients(rows), error: null };
}
