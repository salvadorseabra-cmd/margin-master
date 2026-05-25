import { formatUnitCostCurrency } from "@/lib/display-format";
import { effectiveIngredientUnitCostEur } from "@/lib/ingredient-unit-cost";
import { computePrepLineCost } from "@/lib/recipe-unit-normalization";

const PREP_UNIT_COST_PREFIX = "[PREP_UNIT_COST]";
const PREP_PROPAGATION_PREFIX = "[PREP_PROPAGATION]";
const RESOLVED_LINE_COST_PREFIX = "[RESOLVED_LINE_COST]";

function shouldLogPrepCostDiagnostics(): boolean {
  if (import.meta.env.DEV) return true;
  if (typeof window === "undefined") return false;
  const w = window as Window & { __MARGINLY_RECIPE_CANONICAL_TRACE__?: boolean };
  return w.__MARGINLY_RECIPE_CANONICAL_TRACE__ === true;
}

/** Temporary DEV/trace diagnostics for prep €/output unit. */
export function logPrepUnitCost(input: {
  prepId: string;
  batchTotalEur: number;
  outputQuantity: number | null | undefined;
  outputUnit?: string | null;
  unitCostEur: number;
  trigger?: string;
}): void {
  if (!shouldLogPrepCostDiagnostics()) return;
  console.info(PREP_UNIT_COST_PREFIX, {
    prepId: input.prepId,
    batchTotalEur: input.batchTotalEur,
    outputQuantity: input.outputQuantity ?? null,
    outputUnit: input.outputUnit ?? null,
    unitCostEur: input.unitCostEur,
    trigger: input.trigger ?? null,
  });
}

/** Temporary DEV/trace diagnostics when a parent recipe uses a prep. */
export function logPrepPropagation(input: {
  parentRecipeId?: string | null;
  prepId: string;
  usageQuantity: number;
  usageUnit?: string | null;
  batchTotalEur: number;
  lineCostEur: number | null;
  outputQuantity: number | null | undefined;
  outputUnit?: string | null;
  trigger?: string;
}): void {
  if (!shouldLogPrepCostDiagnostics()) return;
  console.info(PREP_PROPAGATION_PREFIX, {
    parentRecipeId: input.parentRecipeId ?? null,
    prepId: input.prepId,
    usageQuantity: input.usageQuantity,
    usageUnit: input.usageUnit ?? null,
    batchTotalEur: input.batchTotalEur,
    lineCostEur: input.lineCostEur,
    outputQuantity: input.outputQuantity ?? null,
    outputUnit: input.outputUnit ?? null,
    trigger: input.trigger ?? null,
  });
}

/** Temporary DEV/trace diagnostics for a resolved recipe line cost. */
export function logResolvedLineCost(input: {
  recipeId?: string | null;
  ingredientId?: string | null;
  prepId?: string | null;
  quantity: number;
  unit?: string | null;
  lineCostEur: number | null;
  trigger?: string;
}): void {
  if (!shouldLogPrepCostDiagnostics()) return;
  console.info(RESOLVED_LINE_COST_PREFIX, {
    recipeId: input.recipeId ?? null,
    ingredientId: input.ingredientId ?? null,
    prepId: input.prepId ?? null,
    quantity: input.quantity,
    unit: input.unit ?? null,
    lineCostEur: input.lineCostEur,
    trigger: input.trigger ?? null,
  });
}

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

/** € per output unit (L, kg, ml, …): batch total ÷ output quantity (same rules as {@link computePrepLineCost}). */
export function prepUnitCostEur(
  prepTotalIngredientCost: number,
  outputQuantity: number | null | undefined,
  outputUnit?: string | null,
): number {
  const displayUnit = outputUnit?.trim() || null;
  const unitCost = computePrepLineCost(
    1,
    displayUnit,
    prepTotalIngredientCost,
    outputQuantity,
    outputUnit,
  ).cost;
  return unitCost ?? 0;
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
    const lineCost = prepLineCostEur(
      qty,
      line.unit,
      prepTotal,
      prep?.output_quantity,
      prep?.output_unit,
    );
    logPrepPropagation({
      prepId: line.sub_recipe_id,
      usageQuantity: qty,
      usageUnit: line.unit,
      batchTotalEur: prepTotal,
      lineCostEur: lineCost,
      outputQuantity: prep?.output_quantity,
      outputUnit: prep?.output_unit,
      trigger: "computeRecipeLineCostEur",
    });
    logResolvedLineCost({
      prepId: line.sub_recipe_id,
      quantity: qty,
      unit: line.unit,
      lineCostEur: lineCost,
      trigger: "computeRecipeLineCostEur",
    });
    return lineCost;
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
  logContext?: { trigger?: string },
): number {
  const prep = recipesById.get(prepRecipeId);
  const total = computeRecipeTotalCostEurOrZero(prepRecipeId, linesByRecipe, recipesById);
  const unitCost = prepUnitCostEur(total, prep?.output_quantity, prep?.output_unit);
  logPrepUnitCost({
    prepId: prepRecipeId,
    batchTotalEur: total,
    outputQuantity: prep?.output_quantity,
    outputUnit: prep?.output_unit,
    unitCostEur: unitCost,
    trigger: logContext?.trigger,
  });
  return unitCost;
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
