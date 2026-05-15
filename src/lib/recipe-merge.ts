import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Tables } from "@/integrations/supabase/types";
import { effectiveIngredientUnitCostEur } from "@/lib/ingredient-unit-cost";

export type IngredientEmbed = any;

export type SubRecipeMinimal = any;

export type RecipeIngredientLine = any;

export type RecipeWithIngredients = any;

export function buildRecipeLinesByRecipeId(
  merged: RecipeWithIngredients[],
): Map<string, RecipeIngredientLine[]> {
  const m = new Map<
    string,
    RecipeIngredientLine[]
  >();

  for (const r of merged) {
    m.set(r.id, r.recipe_ingredients ?? []);
  }

  return m;
}

export function computeRecipeTotalCostCached(
  recipeId: string,
  linesByRecipe: Map<
    string,
    RecipeIngredientLine[]
  >,
  path: Set<string>,
  memo: Map<string, number>,
): number | null {
  if (path.has(recipeId)) return null;

  if (memo.has(recipeId)) {
    return memo.get(recipeId)!;
  }

  path.add(recipeId);

  const lines =
    linesByRecipe.get(recipeId) ?? [];

  let sum = 0;

  for (const line of lines) {
    const part = lineIngredientCost(
      line,
      linesByRecipe,
      path,
      memo,
    );

    if (part === null) {
      path.delete(recipeId);
      return null;
    }

    sum += part;
  }

  path.delete(recipeId);

  memo.set(recipeId, sum);

  return sum;
}

export function lineIngredientCost(
  line: RecipeIngredientLine,
  linesByRecipe: Map<
    string,
    RecipeIngredientLine[]
  >,
  path: Set<string>,
  memo: Map<string, number>,
): number | null {
  const qty = Number(line.quantity);

  const safeQty = Number.isFinite(qty)
    ? qty
    : 0;

  if (line.ingredient_id) {
    const ing = line.ingredients;

    if (!ing) return 0;

    const effective =
      effectiveIngredientUnitCostEur(ing);

    return safeQty * effective;
  }

  if (line.sub_recipe_id) {
    const unitTotal =
      computeRecipeTotalCostCached(
        line.sub_recipe_id,
        linesByRecipe,
        path,
        memo,
      );

    if (unitTotal === null) {
      return null;
    }

    return safeQty * unitTotal;
  }

  return 0;
}

export function recipeCostFromLines(
  lines:
    | RecipeIngredientLine[]
    | null
    | undefined,
  linesByRecipe: Map<
    string,
    RecipeIngredientLine[]
  >,
): number | null {
  const path = new Set<string>();

  const memo = new Map<string, number>();

  let sum = 0;

  for (const line of lines ?? []) {
    const c = lineIngredientCost(
      line,
      linesByRecipe,
      path,
      memo,
    );

    if (c === null) {
      return null;
    }

    sum += c;
  }

  return sum;
}

export function recipeCostFromLinesOrZero(
  lines:
    | RecipeIngredientLine[]
    | null
    | undefined,
  linesByRecipe: Map<
    string,
    RecipeIngredientLine[]
  >,
): number {
  return (
    recipeCostFromLines(
      lines,
      linesByRecipe,
    ) ?? 0
  );
}

export function recipeTotalCostEurForRecipe(
  recipeId: string,
  linesByRecipe: Map<
    string,
    RecipeIngredientLine[]
  >,
): number | null {
  const path = new Set<string>();

  const memo = new Map<string, number>();

  return computeRecipeTotalCostCached(
    recipeId,
    linesByRecipe,
    path,
    memo,
  );
}

export function recipeTotalCostUsingEffectiveUnitForIngredient(
  recipeId: string,
  linesByRecipe: Map<
    string,
    RecipeIngredientLine[]
  >,
  ingredientId: string,
  effectiveUnitEur: number,
): number | null {
  const path = new Set<string>();

  const memo = new Map<string, number>();

  function walk(rid: string): number | null {
    if (path.has(rid)) return null;

    if (memo.has(rid)) {
      return memo.get(rid)!;
    }

    path.add(rid);

    let sum = 0;

    for (const line of linesByRecipe.get(rid) ?? []) {
      const qty = Number(line.quantity);

      const safeQty = Number.isFinite(qty)
        ? qty
        : 0;

      if (line.ingredient_id) {
        let unit: number;

        if (
          line.ingredient_id === ingredientId
        ) {
          unit = effectiveUnitEur;
        } else {
          unit = line.ingredients
            ? effectiveIngredientUnitCostEur(
                line.ingredients,
              )
            : 0;
        }

        sum += safeQty * unit;
      } else if (line.sub_recipe_id) {
        const sub = walk(
          line.sub_recipe_id,
        );

        if (sub === null) {
          path.delete(rid);
          return null;
        }

        sum += safeQty * sub;
      }
    }

    path.delete(rid);

    memo.set(rid, sum);

    return sum;
  }

  return walk(recipeId);
}

export function recipeTotalCostWithIngredientUnitOverrides(
  recipeId: string,
  linesByRecipe: Map<
    string,
    RecipeIngredientLine[]
  >,
  unitEurByIngredientId: Map<string, number>,
): number | null {
  const path = new Set<string>();

  const memo = new Map<string, number>();

  function walk(rid: string): number | null {
    if (path.has(rid)) return null;

    if (memo.has(rid)) {
      return memo.get(rid)!;
    }

    path.add(rid);

    let sum = 0;

    for (const line of linesByRecipe.get(rid) ?? []) {
      const qty = Number(line.quantity);

      const safeQty = Number.isFinite(qty)
        ? qty
        : 0;

      if (line.ingredient_id) {
        const override =
          unitEurByIngredientId.get(
            line.ingredient_id,
          );

        const unit =
          override !== undefined
            ? override
            : line.ingredients
            ? effectiveIngredientUnitCostEur(
                line.ingredients,
              )
            : 0;

        sum += safeQty * unit;
      } else if (line.sub_recipe_id) {
        const sub = walk(
          line.sub_recipe_id,
        );

        if (sub === null) {
          path.delete(rid);
          return null;
        }

        sum += safeQty * sub;
      }
    }

    path.delete(rid);

    memo.set(rid, sum);

    return sum;
  }

  return walk(recipeId);
}

export function recipeTotalCostEurForRecipe(
  recipeId: string,
  linesByRecipe: Map<string, RecipeIngredientLine[]>,
  unitEurByIngredientId: Map<string, number>,
): number | null {
  return recipeTotalCostWithIngredientUnitOverrides(
    recipeId,
    linesByRecipe,
    unitEurByIngredientId,
  );
}
export function recipeTotalCostUsingEffectiveUnitForIngredient(
  recipeId: string,
  linesByRecipe: Map<string, RecipeIngredientLine[]>,
  unitEurByIngredientId: Map<string, number>,
): number | null {
  return recipeTotalCostWithIngredientUnitOverrides(
    recipeId,
    linesByRecipe,
    unitEurByIngredientId,
  );
}