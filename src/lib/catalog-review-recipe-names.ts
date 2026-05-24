import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import {
  CATALOG_REVIEW_RECIPE_LINKS_SELECT,
  type RecipeIngredientLink,
} from "@/lib/catalog-pollution-review";

type AppSupabaseClient = SupabaseClient<Database>;

/** Show recipe names inline when count is at or below this threshold. */
export const CATALOG_REVIEW_RECIPE_NAMES_INLINE_MAX = 3;

export function sortRecipeNames(names: readonly string[]): string[] {
  return [...names].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
}

export function dedupeRecipeNamesFromLinks(links: readonly RecipeIngredientLink[]): string[] {
  const names = [
    ...new Set(
      links
        .map((row) => row.recipes?.name?.trim())
        .filter((name): name is string => Boolean(name)),
    ),
  ];
  return sortRecipeNames(names);
}

/** Loads distinct parent recipe names for one canonical ingredient id. */
export async function loadRecipeNamesForIngredient(
  client: AppSupabaseClient,
  ingredientId: string,
): Promise<{ names: string[]; error: string | null }> {
  const id = ingredientId.trim();
  if (!id) {
    return { names: [], error: null };
  }

  try {
    const { data, error } = await client
      .from("recipe_ingredients")
      .select(CATALOG_REVIEW_RECIPE_LINKS_SELECT)
      .eq("ingredient_id", id);

    if (error) {
      return { names: [], error: error.message };
    }

    return { names: dedupeRecipeNamesFromLinks((data ?? []) as RecipeIngredientLink[]), error: null };
  } catch (err) {
    return {
      names: [],
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
