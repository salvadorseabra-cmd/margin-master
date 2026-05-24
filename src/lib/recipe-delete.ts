import type { SupabaseClient } from "@supabase/supabase-js";

export const RECIPE_DELETE_SUB_RECIPE_BLOCKER_MESSAGE =
  "This prep item is used in other recipes.";

export type RecipeDeleteBlockers = {
  blocked: boolean;
  message: string | null;
  dependentRecipeNames: string[];
};

type RecipeIngredientDependentRow = {
  recipe_id: string;
};

type RecipeNameRow = {
  id: string;
  name: string;
};

/**
 * Returns blockers when `recipeId` is referenced as a sub-recipe on other recipes.
 */
export async function loadRecipeDeleteBlockers(
  client: SupabaseClient,
  recipeId: string,
): Promise<{ blockers: RecipeDeleteBlockers; error: string | null }> {
  const { data: dependentLines, error: linesError } = await client
    .from("recipe_ingredients")
    .select("recipe_id")
    .eq("sub_recipe_id", recipeId);

  if (linesError) {
    return {
      blockers: { blocked: false, message: null, dependentRecipeNames: [] },
      error: linesError.message,
    };
  }

  const parentRecipeIds = [
    ...new Set(
      ((dependentLines ?? []) as RecipeIngredientDependentRow[])
        .map((row) => row.recipe_id)
        .filter(Boolean),
    ),
  ];

  if (!parentRecipeIds.length) {
    return {
      blockers: { blocked: false, message: null, dependentRecipeNames: [] },
      error: null,
    };
  }

  const { data: parentRecipes, error: recipesError } = await client
    .from("recipes")
    .select("id, name")
    .in("id", parentRecipeIds);

  if (recipesError) {
    return {
      blockers: { blocked: false, message: null, dependentRecipeNames: [] },
      error: recipesError.message,
    };
  }

  const dependentRecipeNames = ((parentRecipes ?? []) as RecipeNameRow[])
    .map((recipe) => recipe.name?.trim())
    .filter((name): name is string => Boolean(name))
    .sort((a, b) => a.localeCompare(b));

  return {
    blockers: {
      blocked: true,
      message: RECIPE_DELETE_SUB_RECIPE_BLOCKER_MESSAGE,
      dependentRecipeNames,
    },
    error: null,
  };
}

function formatRecipeDeleteBlockerError(blockers: RecipeDeleteBlockers): string {
  const names = blockers.dependentRecipeNames;
  if (!names.length) return blockers.message ?? RECIPE_DELETE_SUB_RECIPE_BLOCKER_MESSAGE;
  return `${blockers.message} Used in: ${names.join(", ")}.`;
}

/**
 * Deletes a recipe owned by `userId` when it is not referenced as a sub-recipe elsewhere.
 * Child `recipe_ingredients` rows for this recipe cascade at the database level.
 */
export async function deleteRecipe(
  client: SupabaseClient,
  recipeId: string,
  userId: string,
): Promise<{ error: string | null }> {
  const { blockers, error: blockerError } = await loadRecipeDeleteBlockers(client, recipeId);
  if (blockerError) return { error: blockerError };
  if (blockers.blocked) {
    return { error: formatRecipeDeleteBlockerError(blockers) };
  }

  const { error } = await client.from("recipes").delete().eq("id", recipeId).eq("user_id", userId);

  return { error: error?.message ?? null };
}
