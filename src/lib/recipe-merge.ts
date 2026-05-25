import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Tables } from "@/integrations/supabase/types";
import { effectiveIngredientUnitCostEur } from "@/lib/ingredient-unit-cost";
import {
  computeRecipeLineCostEur,
  computeRecipeTotalCostEur,
  prepLineCostEur,
  type RecipeForPrepCost,
  type RecipeIngredientLineForCost,
} from "@/lib/recipe-prep-cost";

function prepOutputForSubRecipeLine(
  line: RecipeIngredientLine,
  recipesById: Map<string, RecipeForPrepCost>,
): Pick<RecipeForPrepCost, "output_quantity" | "output_unit"> {
  const prepId = line.sub_recipe_id;
  if (!prepId) return { output_quantity: null, output_unit: null };
  const fromMap = recipesById.get(prepId);
  if (fromMap) {
    return {
      output_quantity: fromMap.output_quantity ?? null,
      output_unit: fromMap.output_unit ?? null,
    };
  }
  const embed = line.sub_recipe ?? line.subRecipe;
  if (embed && typeof embed === "object") {
    const row = embed as { output_quantity?: number | null; output_unit?: string | null };
    return {
      output_quantity: row.output_quantity ?? null,
      output_unit: row.output_unit ?? null,
    };
  }
  return { output_quantity: null, output_unit: null };
}

function prepUsageLineCostEur(
  line: RecipeIngredientLine,
  prepBatchTotalEur: number,
  recipesById: Map<string, RecipeForPrepCost>,
): number | null {
  const qty = Number(line.quantity);
  const safeQty = Number.isFinite(qty) ? qty : 0;
  const { output_quantity, output_unit } = prepOutputForSubRecipeLine(line, recipesById);
  return prepLineCostEur(
    safeQty,
    line.unit,
    prepBatchTotalEur,
    output_quantity,
    output_unit,
  );
}

export type IngredientEmbed = any;

export type SubRecipeMinimal = any;

export type RecipeIngredientLine = any;

export type RecipeWithIngredients = any;

export type RecipeIngredientRow = any;

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
  recipesById: Map<string, RecipeForPrepCost> = new Map(),
): number | null {
  if (recipesById.size > 0) {
    return computeRecipeTotalCostEur(
      recipeId,
      linesByRecipe as Map<string, RecipeIngredientLineForCost[]>,
      recipesById,
      path,
      memo,
    );
  }

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
      recipesById,
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
  recipesById: Map<string, RecipeForPrepCost> = new Map(),
): number | null {
  if (recipesById.size > 0) {
    return computeRecipeLineCostEur(
      line as RecipeIngredientLineForCost,
      linesByRecipe as Map<string, RecipeIngredientLineForCost[]>,
      recipesById,
      path,
      memo,
    );
  }

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
    const prepBatchTotal =
      computeRecipeTotalCostCached(
        line.sub_recipe_id,
        linesByRecipe,
        path,
        memo,
        recipesById,
      );

    if (prepBatchTotal === null) {
      return null;
    }

    return prepUsageLineCostEur(line, prepBatchTotal, recipesById);
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
  recipesById: Map<string, RecipeForPrepCost> = new Map(),
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
      recipesById,
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
  recipesById: Map<string, RecipeForPrepCost> = new Map(),
): number {
  return (
    recipeCostFromLines(
      lines,
      linesByRecipe,
      recipesById,
    ) ?? 0
  );
}

export function recipeTotalCostEurForRecipe(
  recipeId: string,
  linesByRecipe: Map<
    string,
    RecipeIngredientLine[]
  >,
  recipesById: Map<string, RecipeForPrepCost> = new Map(),
): number | null {
  const path = new Set<string>();

  const memo = new Map<string, number>();

  return computeRecipeTotalCostCached(
    recipeId,
    linesByRecipe,
    path,
    memo,
    recipesById,
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
  recipesById: Map<string, RecipeForPrepCost> = new Map(),
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
        const prepBatchTotal = walk(line.sub_recipe_id);

        if (prepBatchTotal === null) {
          path.delete(rid);
          return null;
        }

        const part = prepUsageLineCostEur(line, prepBatchTotal, recipesById);
        if (part === null) {
          path.delete(rid);
          return null;
        }
        sum += part;
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
  recipesById: Map<string, RecipeForPrepCost> = new Map(),
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
        const prepBatchTotal = walk(line.sub_recipe_id);

        if (prepBatchTotal === null) {
          path.delete(rid);
          return null;
        }

        const part = prepUsageLineCostEur(line, prepBatchTotal, recipesById);
        if (part === null) {
          path.delete(rid);
          return null;
        }
        sum += part;
      }
    }

    path.delete(rid);

    memo.set(rid, sum);

    return sum;
  }

  return walk(recipeId);
}
