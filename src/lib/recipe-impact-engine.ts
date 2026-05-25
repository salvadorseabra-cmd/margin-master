import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Tables, TablesInsert } from "@/integrations/supabase/types";
import {
  recipeTotalCostUsingEffectiveUnitForIngredient,
  type IngredientEmbed,
  type RecipeIngredientLine,
} from "@/lib/recipe-merge";
import { buildRecipesById, type RecipeForPrepCost } from "@/lib/recipe-prep-cost";

type AppSupabaseClient = SupabaseClient<Database>;

const COST_EPS = 1e-9;

/** Default assumed recipe sales/month when projecting `recipe_margin_impacts.estimated_monthly_loss`. */
export const DEFAULT_ESTIMATED_MONTHLY_RECIPE_SALES = 300;
/** Align with `INGREDIENT_PRICE_EQ_EPS` in invoice sync — skip work/inserts when effective €/base-unit is unchanged. */
const EFFECTIVE_UNIT_PRICE_EQ_EPS = 1e-6;

type RecipeIngredientRow = Pick<
  Tables<"recipe_ingredients">,
  "id" | "recipe_id" | "ingredient_id" | "sub_recipe_id" | "quantity" | "unit"
>;

type RecipeOutputRow = Pick<Tables<"recipes">, "id" | "output_quantity" | "output_unit">;

function grossMarginPctOrZero(selling: number, cost: number): number {
  if (!(selling > COST_EPS)) return 0;
  return ((selling - cost) / selling) * 100;
}

/** Loads all `recipe_id`s reachable via `sub_recipe_id` chains from `seedIds` (max 10 expansion passes). */
async function expandRecipeIdsForSubRecipeClosure(client: AppSupabaseClient, seedIds: string[]): Promise<string[]> {
  const expanded = new Set(seedIds);
  for (let p = 0; p < 10; p++) {
    const ids = [...expanded];
    if (!ids.length) break;
    const { data, error } = await client
      .from("recipe_ingredients")
      .select("sub_recipe_id")
      .in("recipe_id", ids)
      .not("sub_recipe_id", "is", null);
    if (error) throw error;
    const before = expanded.size;
    for (const row of data ?? []) {
      const sid = row.sub_recipe_id as string | null;
      if (sid) expanded.add(sid);
    }
    if (expanded.size === before) break;
  }
  return [...expanded];
}

/** Loads all lines for `seedIds` plus every recipe reachable via nested `sub_recipe_id` (max 10 passes). */
export async function loadRecipeLinesByRecipeMapForClosure(
  client: AppSupabaseClient,
  seedRecipeIds: string[],
): Promise<{
  linesByRecipe: Map<string, RecipeIngredientLine[]>;
  recipesById: Map<string, RecipeForPrepCost>;
}> {
  const expandedIds = await expandRecipeIdsForSubRecipeClosure(client, seedRecipeIds);
  const [{ data: allRi, error: allRiErr }, { data: recipeOutputs, error: recipesErr }] =
    await Promise.all([
      client
        .from("recipe_ingredients")
        .select("id,recipe_id,ingredient_id,sub_recipe_id,quantity,unit")
        .in("recipe_id", expandedIds),
      client
        .from("recipes")
        .select("id,output_quantity,output_unit")
        .in("id", expandedIds),
    ]);
  if (allRiErr) throw allRiErr;
  if (recipesErr) throw recipesErr;
  const riRows = (allRi ?? []) as RecipeIngredientRow[];
  const recipesById = buildRecipesById((recipeOutputs ?? []) as RecipeOutputRow[]);
  const allIngredientIds = [...new Set(riRows.map((r) => r.ingredient_id).filter((id): id is string => Boolean(id)))];
  const byIngredient = new Map<string, IngredientEmbed>();
  if (allIngredientIds.length) {
    const { data: ingData, error: ingErr } = await client
      .from("ingredients")
      .select("id,name,current_price,unit,purchase_quantity,purchase_unit,base_unit")
      .in("id", allIngredientIds);
    if (ingErr) throw ingErr;
    for (const ing of (ingData ?? []) as IngredientEmbed[]) {
      byIngredient.set(ing.id, ing);
    }
  }
  return {
    linesByRecipe: buildLinesByRecipeMap(expandedIds, riRows, byIngredient),
    recipesById,
  };
}

function buildLinesForRecipe(
  recipeId: string,
  riRows: RecipeIngredientRow[],
  byIngredient: Map<string, IngredientEmbed>,
): RecipeIngredientLine[] {
  const list: RecipeIngredientLine[] = [];
  for (const row of riRows) {
    if (row.recipe_id !== recipeId) continue;
    list.push({
      id: row.id,
      recipe_id: row.recipe_id,
      ingredient_id: row.ingredient_id,
      sub_recipe_id: row.sub_recipe_id,
      quantity: row.quantity,
      unit: row.unit,
      ingredients: row.ingredient_id ? byIngredient.get(row.ingredient_id) ?? null : null,
      subRecipe: null,
    });
  }
  list.sort((a, b) => a.id.localeCompare(b.id));
  return list;
}

function buildLinesByRecipeMap(
  recipeIds: string[],
  riRows: RecipeIngredientRow[],
  byIngredient: Map<string, IngredientEmbed>,
): Map<string, RecipeIngredientLine[]> {
  const m = new Map<string, RecipeIngredientLine[]>();
  for (const rid of recipeIds) {
    m.set(rid, buildLinesForRecipe(rid, riRows, byIngredient));
  }
  return m;
}

/**
 * Maps **margin drop** in percentage points (`old_margin_pct − new_margin_pct`, positive = worse) to a coarse level.
 * Any non-positive drop (margin flat or improved) is classified **LOW** when a row is still recorded
 * because food cost increased.
 */
function impactLevelFromMarginDrop(marginDropPctPoints: number): "HIGH" | "MEDIUM" | "LOW" {
  if (marginDropPctPoints > 5) return "HIGH";
  if (marginDropPctPoints > 2) return "MEDIUM";
  return "LOW";
}

export type CalculateRecipeMarginImpactArgs = {
  recipeId: string;
  ingredientId: string;
  /** Prior effective € per recipe base unit (pack price ÷ max(purchase_quantity, 1)). */
  oldUnitPrice: number;
  /** New effective € per base unit after the catalog update. */
  newUnitPrice: number;
  /** Sales/month per recipe for cash impact; defaults to {@link DEFAULT_ESTIMATED_MONTHLY_RECIPE_SALES}. */
  estimatedMonthlySales?: number;
};

export type CalculateRecipeMarginImpactResult = {
  recipeId: string;
  sellingPriceEur: number;
  oldRecipeCost: number;
  newRecipeCost: number;
  oldMarginPct: number;
  newMarginPct: number;
  /**
   * Stored column semantics: **`new_margin_pct − old_margin_pct`** (industry-style delta).
   * Negative values mean gross margin **worsened**.
   */
  marginDeltaPct: number;
  /** **`old_margin_pct − new_margin_pct`** (= `-(marginDeltaPct)`). Used for impact bands. */
  marginDropPctPoints: number;
  estimatedMonthlyLoss: number | null;
  impactLevel: "HIGH" | "MEDIUM" | "LOW";
  /** `false` when `selling_price ≤ 0` (nonsense margins) or the recipe row is missing. */
  shouldRecord: boolean;
  /** When `shouldRecord` is false, a short machine reason for skips (not persisted). */
  skipReason?: "no_recipe" | "non_positive_selling_price";
};

/**
 * Recomputes recipe food cost **as if** only the given ingredient’s effective unit cost were `oldUnitPrice`
 * vs `newUnitPrice`, with all other lines using current `ingredients` prices from `lines`.
 *
 * **Margin %:** \((\text{selling} - \text{cost}) / \text{selling} \times 100\) when `selling_price > 0`.
 * **`margin_delta_pct`** (returned as `marginDeltaPct`): `new_margin_pct - old_margin_pct`.
 * **Margin drop** (for levels): `old_margin_pct - new_margin_pct` = `-(marginDeltaPct)`.
 *
 * **`shouldRecord`:** `false` if `selling_price ≤ 0` (we skip inserts to avoid meaningless margins) or recipe missing.
 * Callers still use {@link recordIngredientPriceChangeImpacts} rules for **whether** to insert when `shouldRecord` is true.
 */
export async function calculateRecipeMarginImpact(
  client: AppSupabaseClient,
  args: CalculateRecipeMarginImpactArgs,
): Promise<CalculateRecipeMarginImpactResult | null> {
  const { recipeId, ingredientId, oldUnitPrice, newUnitPrice, estimatedMonthlySales } = args;
  const salesPerMonth = estimatedMonthlySales ?? DEFAULT_ESTIMATED_MONTHLY_RECIPE_SALES;

  const { data: recipe, error: rErr } = await client
    .from("recipes")
    .select("id,selling_price")
    .eq("id", recipeId)
    .maybeSingle();
  if (rErr) throw rErr;
  if (!recipe) return null;

  const selling = Number(recipe.selling_price);
  const sellingPriceEur = Number.isFinite(selling) ? selling : 0;
  if (!(sellingPriceEur > COST_EPS)) {
    return {
      recipeId,
      sellingPriceEur,
      oldRecipeCost: 0,
      newRecipeCost: 0,
      oldMarginPct: 0,
      newMarginPct: 0,
      marginDeltaPct: 0,
      marginDropPctPoints: 0,
      estimatedMonthlyLoss: null,
      impactLevel: "LOW",
      shouldRecord: false,
      skipReason: "non_positive_selling_price",
    };
  }

  const { linesByRecipe, recipesById } = await loadRecipeLinesByRecipeMapForClosure(client, [recipeId]);
  const topLines = linesByRecipe.get(recipeId) ?? [];
  if (!topLines.length) {
    const oldRecipeCost = 0;
    const newRecipeCost = 0;
    const oldMarginPct = grossMarginPctOrZero(sellingPriceEur, oldRecipeCost);
    const newMarginPct = grossMarginPctOrZero(sellingPriceEur, newRecipeCost);
    const marginDeltaPct = newMarginPct - oldMarginPct;
    const marginDropPctPoints = oldMarginPct - newMarginPct;
    return {
      recipeId,
      sellingPriceEur,
      oldRecipeCost,
      newRecipeCost,
      oldMarginPct,
      newMarginPct,
      marginDeltaPct,
      marginDropPctPoints,
      estimatedMonthlyLoss: (newRecipeCost - oldRecipeCost) * salesPerMonth,
      impactLevel: impactLevelFromMarginDrop(marginDropPctPoints),
      shouldRecord: true,
    };
  }

  const oldRecipeCost =
    recipeTotalCostUsingEffectiveUnitForIngredient(
      recipeId,
      linesByRecipe,
      ingredientId,
      oldUnitPrice,
      recipesById,
    ) ?? 0;
  const newRecipeCost =
    recipeTotalCostUsingEffectiveUnitForIngredient(
      recipeId,
      linesByRecipe,
      ingredientId,
      newUnitPrice,
      recipesById,
    ) ?? 0;

  const oldMarginPct = grossMarginPctOrZero(sellingPriceEur, oldRecipeCost);
  const newMarginPct = grossMarginPctOrZero(sellingPriceEur, newRecipeCost);
  const marginDeltaPct = newMarginPct - oldMarginPct;
  const marginDropPctPoints = oldMarginPct - newMarginPct;

  return {
    recipeId,
    sellingPriceEur,
    oldRecipeCost,
    newRecipeCost,
    oldMarginPct,
    newMarginPct,
    marginDeltaPct,
    marginDropPctPoints,
    estimatedMonthlyLoss: (newRecipeCost - oldRecipeCost) * salesPerMonth,
    impactLevel: impactLevelFromMarginDrop(marginDropPctPoints),
    shouldRecord: true,
  };
}

export type RecordIngredientPriceChangeImpactsParams = {
  ingredientId: string;
  /** Effective €/base-unit before the catalog price change. */
  previousPrice: number;
  /** Effective €/base-unit after the catalog price change (matches post-update `ingredients` row). */
  newPrice: number;
  /** Sales/month per recipe for `estimated_monthly_loss`; defaults to {@link DEFAULT_ESTIMATED_MONTHLY_RECIPE_SALES}. */
  estimatedMonthlySales?: number;
};

/**
 * For every recipe that references `ingredientId` **directly** or **one level up** as a parent recipe
 * that embeds a sub-recipe whose lines include that ingredient, inserts `recipe_margin_impacts` rows when
 * the modeled change is materially adverse.
 *
 * **v1 parent propagation:** only recipes with a line `sub_recipe_id →` a recipe that **directly** contains
 * `ingredientId`. Deeper ancestor chains (parent of parent) are not expanded here — see inline query.
 *
 * **Skip recipe entirely when:** `recipes.selling_price ≤ 0` (avoids nonsense margin ratios).
 *
 * **Skip insert for a recipe when:** food cost does **not** increase and gross margin does **not** decrease
 * (both within `COST_EPS`). Example: price drop on the ingredient — no audit row.
 *
 * **Columns:** `margin_delta_pct` = `new_margin_pct - old_margin_pct`. **`estimated_monthly_loss`** =
 * `(new_recipe_cost - old_recipe_cost) × estimatedMonthlySales` (default {@link DEFAULT_ESTIMATED_MONTHLY_RECIPE_SALES}).
 */
export async function recordIngredientPriceChangeImpacts(
  client: AppSupabaseClient,
  params: RecordIngredientPriceChangeImpactsParams,
): Promise<void> {
  const { ingredientId, previousPrice, newPrice, estimatedMonthlySales } = params;
  const salesPerMonth = estimatedMonthlySales ?? DEFAULT_ESTIMATED_MONTHLY_RECIPE_SALES;

  const prevU = Number(previousPrice);
  const nextU = Number(newPrice);
  if (!Number.isFinite(prevU) || !Number.isFinite(nextU)) return;
  if (Math.abs(prevU - nextU) <= EFFECTIVE_UNIT_PRICE_EQ_EPS) return;

  const { data: riTouch, error: touchErr } = await client
    .from("recipe_ingredients")
    .select("recipe_id,quantity")
    .eq("ingredient_id", ingredientId);
  if (touchErr) throw touchErr;
  const touched = riTouch ?? [];
  const childRecipeIds = [...new Set(touched.map((r) => r.recipe_id))];
  if (!childRecipeIds.length) return;

  const { data: parentRi, error: parentErr } = await client
    .from("recipe_ingredients")
    .select("recipe_id")
    .in("sub_recipe_id", childRecipeIds);
  if (parentErr) throw parentErr;
  const parentRecipeIds = [...new Set((parentRi ?? []).map((r) => r.recipe_id))];

  const recipeIdsToImpact = [...new Set([...childRecipeIds, ...parentRecipeIds])];

  const [{ data: recipes, error: recErr }, closure] = await Promise.all([
    client.from("recipes").select("id,selling_price").in("id", recipeIdsToImpact),
    loadRecipeLinesByRecipeMapForClosure(client, recipeIdsToImpact),
  ]);
  const { linesByRecipe, recipesById } = closure;
  if (recErr) throw recErr;

  const recipeRows = (recipes ?? []) as Pick<Tables<"recipes">, "id" | "selling_price">[];
  const recipeById = new Map(recipeRows.map((r) => [r.id, r]));

  const inserts: TablesInsert<"recipe_margin_impacts">[] = [];

  for (const rid of recipeIdsToImpact) {
    const recipe = recipeById.get(rid);
    if (!recipe) continue;
    const selling = Number(recipe.selling_price);
    const sellingPriceEur = Number.isFinite(selling) ? selling : 0;
    if (!(sellingPriceEur > COST_EPS)) continue;

    const lines = linesByRecipe.get(rid) ?? [];
    if (!lines.length) continue;

    const oldRecipeCost =
      recipeTotalCostUsingEffectiveUnitForIngredient(
        rid,
        linesByRecipe,
        ingredientId,
        previousPrice,
        recipesById,
      ) ?? 0;
    const newRecipeCost =
      recipeTotalCostUsingEffectiveUnitForIngredient(
        rid,
        linesByRecipe,
        ingredientId,
        newPrice,
        recipesById,
      ) ?? 0;

    const oldMarginPct = grossMarginPctOrZero(sellingPriceEur, oldRecipeCost);
    const newMarginPct = grossMarginPctOrZero(sellingPriceEur, newRecipeCost);

    const costIncrease = newRecipeCost - oldRecipeCost > COST_EPS;
    const marginDecrease = oldMarginPct - newMarginPct > COST_EPS;
    if (!costIncrease && !marginDecrease) continue;

    const marginDeltaPct = newMarginPct - oldMarginPct;
    const marginDropPctPoints = oldMarginPct - newMarginPct;
    const estimated_monthly_loss = (newRecipeCost - oldRecipeCost) * salesPerMonth;
    const impact_level = impactLevelFromMarginDrop(marginDropPctPoints);

    inserts.push({
      recipe_id: rid,
      ingredient_id: ingredientId,
      old_recipe_cost: oldRecipeCost,
      new_recipe_cost: newRecipeCost,
      old_margin_pct: oldMarginPct,
      new_margin_pct: newMarginPct,
      margin_delta_pct: marginDeltaPct,
      estimated_monthly_loss,
      impact_level,
    });
  }

  if (!inserts.length) return;

  const { error: insErr } = await client.from("recipe_margin_impacts").insert(inserts);
  if (insErr) throw insErr;
}
