import type { SupabaseClient } from "@supabase/supabase-js";
import { filterActiveCatalogIngredients, type IngredientCanonicalInput } from "@/lib/ingredient-canonical";
import type { Database } from "@/integrations/supabase/types";

type CatalogClient = SupabaseClient<Database>;

const CATALOG_SELECT_BASE = "id, name, normalized_name, unit";
const CATALOG_SELECT_WITH_ARCHIVE = `${CATALOG_SELECT_BASE}, is_archived, merged_into_ingredient_id`;

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
