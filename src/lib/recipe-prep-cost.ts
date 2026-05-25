import { formatUnitCostCurrency } from "@/lib/display-format";
import { effectiveIngredientUnitCostEur } from "@/lib/ingredient-unit-cost";
import {
  computeNormalizedUnitCost,
  computePrepLineCost,
  unitCostPerDisplayUnit,
} from "@/lib/recipe-unit-normalization";

export type PrepOutputFields = {
  output_quantity: number | null | undefined;
  output_unit?: string | null;
};

export type RecipeIngredientLineForCost = {
  ingredient_id: string | null;
  sub_recipe_id: string | null;
  quantity: number | null | undefined;
  unit?: string | null;
  ingredients?: {
    current_price: number | null;
    purchase_quantity: number | null;
  } | null;
};

export type RecipeForPrepCost = PrepOutputFields & {
  id: string;
};

function safeQuantity(quantity: number | null | undefined): number {
  const qty = Number(quantity);
  return Number.isFinite(qty) ? qty : 0;
}

/** € per output unit (L, kg, ml, …): total ingredient cost ÷ normalized batch output. */
export function prepUnitCostEur(
  prepTotalIngredientCost: number,
  outputQuantity: number | null | undefined,
  outputUnit?: string | null,
): number {
  const perBase = computeNormalizedUnitCost(prepTotalIngredientCost, outputQuantity, outputUnit);
  if (perBase != null) {
    const perDisplay = unitCostPerDisplayUnit(perBase, outputUnit);
    if (perDisplay != null) return perDisplay;
  }

  const out = Number(outputQuantity);
  if (!Number.isFinite(out) || out <= 0) return 0;
  const total = Number(prepTotalIngredientCost);
  const safeTotal = Number.isFinite(total) ? total : 0;
  return safeTotal / out;
}

/** Line cost when a parent recipe uses `usageQuantity` of a prep (units normalized when known). */
export function prepLineCostEur(
  usageQuantity: number,
  usageUnit: string | null | undefined,
  prepTotalIngredientCost: number,
  outputQuantity: number | null | undefined,
  outputUnit?: string | null,
): number | null {
  return computePrepLineCost(
    usageQuantity,
    usageUnit,
    prepTotalIngredientCost,
    outputQuantity,
    outputUnit,
  ).cost;
}

export function ingredientLineCostEur(
  quantity: number | null | undefined,
  ingredient: NonNullable<RecipeIngredientLineForCost["ingredients"]>,
): number {
  return safeQuantity(quantity) * effectiveIngredientUnitCostEur(ingredient);
}

export function computeRecipeLineCostEur(
  line: RecipeIngredientLineForCost,
  linesByRecipe: Map<string, RecipeIngredientLineForCost[]>,
  recipesById: Map<string, RecipeForPrepCost>,
  path: Set<string>,
  memo: Map<string, number>,
): number | null {
  const qty = safeQuantity(line.quantity);

  if (line.ingredient_id) {
    if (!line.ingredients) return 0;
    return ingredientLineCostEur(qty, line.ingredients);
  }

  if (line.sub_recipe_id) {
    const prepTotal = computeRecipeTotalCostEur(
      line.sub_recipe_id,
      linesByRecipe,
      recipesById,
      path,
      memo,
    );
    if (prepTotal === null) return null;
    const prep = recipesById.get(line.sub_recipe_id);
    return prepLineCostEur(qty, line.unit, prepTotal, prep?.output_quantity, prep?.output_unit);
  }

  return 0;
}

export function computeRecipeTotalCostEur(
  recipeId: string,
  linesByRecipe: Map<string, RecipeIngredientLineForCost[]>,
  recipesById: Map<string, RecipeForPrepCost>,
  path: Set<string>,
  memo: Map<string, number>,
): number | null {
  if (path.has(recipeId)) return null;

  if (memo.has(recipeId)) {
    return memo.get(recipeId)!;
  }

  path.add(recipeId);

  let sum = 0;
  for (const line of linesByRecipe.get(recipeId) ?? []) {
    const part = computeRecipeLineCostEur(line, linesByRecipe, recipesById, path, memo);
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

export function computeRecipeTotalCostEurOrZero(
  recipeId: string,
  linesByRecipe: Map<string, RecipeIngredientLineForCost[]>,
  recipesById: Map<string, RecipeForPrepCost>,
): number {
  const path = new Set<string>();
  const memo = new Map<string, number>();
  return computeRecipeTotalCostEur(recipeId, linesByRecipe, recipesById, path, memo) ?? 0;
}

export function buildLinesByRecipeId(
  recipes: Array<{ id: string; recipe_ingredients?: RecipeIngredientLineForCost[] | null }>,
): Map<string, RecipeIngredientLineForCost[]> {
  const map = new Map<string, RecipeIngredientLineForCost[]>();
  for (const recipe of recipes) {
    map.set(recipe.id, recipe.recipe_ingredients ?? []);
  }
  return map;
}

export function buildRecipesById(recipes: RecipeForPrepCost[]): Map<string, RecipeForPrepCost> {
  return new Map(recipes.map((recipe) => [recipe.id, recipe]));
}

/** € per output unit for a prep recipe (0 when batch output missing or ≤ 0). */
export function computePrepUnitCost(
  prepRecipeId: string,
  linesByRecipe: Map<string, RecipeIngredientLineForCost[]>,
  recipesById: Map<string, RecipeForPrepCost>,
): number {
  const prep = recipesById.get(prepRecipeId);
  const total = computeRecipeTotalCostEurOrZero(prepRecipeId, linesByRecipe, recipesById);
  return prepUnitCostEur(total, prep?.output_quantity, prep?.output_unit);
}

export function formatPrepUnitCostLabel(
  unitCostEur: number,
  outputUnit: string | null | undefined,
): string {
  const unit = outputUnit?.trim() || "unit";
  return `${formatUnitCostCurrency(unitCostEur)} / ${unit}`;
}

/** Share of recipe food cost for one line (same basis as total food cost). */
export function recipeLineContributionPct(lineCost: number, totalFoodCost: number): number {
  const total = Number(totalFoodCost);
  if (!Number.isFinite(total) || total <= 0) return 0;
  const line = Number(lineCost);
  if (!Number.isFinite(line) || line <= 0) return 0;
  return (line / total) * 100;
}

export { computePrepLineCost } from "@/lib/recipe-unit-normalization";
