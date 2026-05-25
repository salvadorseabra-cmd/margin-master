import type { SupabaseClient, PostgrestError } from "@supabase/supabase-js";
import type { Database, Tables } from "@/integrations/supabase/types";
import { effectiveIngredientUnitCostEur, purchaseQuantityDenom } from "@/lib/ingredient-unit-cost";
import { loadRecipeLinesByRecipeMapForClosure } from "./recipe-impact-engine";
import { recipeTotalCostEurForRecipe, recipeTotalCostWithIngredientUnitOverrides } from "./recipe-merge";
import { traceFoodCostRecalculationSource } from "./recipe-canonical-graph-trace";
import { traceRecipeLineFoodCostSource } from "./recipe-canonical-integrity";

type AppSupabaseClient = SupabaseClient<Database>;

const COST_EPS = 1e-9;

const HISTORY_LOG_PREFIX = "[ingredient_price_history]";

/**
 * Log a Supabase history-read error with a stable, secret-free prefix.
 * Callers should fall back to empty data so the UI keeps rendering.
 */
function logHistoryError(label: string, error: PostgrestError | null | undefined): void {
  if (!error) return;
  const code = error.code ? ` code=${error.code}` : "";
  console.error(`${HISTORY_LOG_PREFIX} ${label} failed: ${error.message}${code}`);
}

/**
 * Default assumed monthly covers when volume is unknown (see {@link estimateMonthlyImpact}).
 * Persisted `recipe_margin_impacts.estimated_monthly_loss` uses {@link DEFAULT_ESTIMATED_MONTHLY_RECIPE_SALES} instead.
 */
export const DEFAULT_MONTHLY_SERVINGS_ESTIMATE = 30;

export { DEFAULT_ESTIMATED_MONTHLY_RECIPE_SALES } from "./recipe-impact-engine";

/** Gross margin % below this after current costs triggers a menu-price hint. */
const SUGGEST_LOW_MARGIN_AFTER_PCT = 58;
/** Share of positive Δ food cost attributable to one line to trigger supplier review. */
const SUGGEST_SINGLE_LINE_DOMINANCE = 0.62;
/** Line food cost as a share of recipe total cost to flag quantity sensitivity. */
const SUGGEST_HIGH_LINE_COST_SHARE = 0.28;

type HistoryRow = Pick<
  Tables<"ingredient_price_history">,
  "ingredient_id" | "previous_price" | "new_price" | "created_at"
>;

// --- Types (recipe cost / margin) ---

export type RecipeCostLine = {
  ingredientId: string;
  quantity: number;
  /** € per recipe base unit: `current_price / max(purchase_quantity, 1)` at query time. */
  unitPriceEur: number;
  /** `quantity * unitPriceEur`. */
  lineCostEur: number;
};

/**
 * Recipe food cost from current catalog prices.
 *
 * **Formula:** \(\text{costEur} = \sum_i (\text{quantity}_i \times \text{effectiveUnit}_i)\) with
 * \(\text{effectiveUnit}_i = \text{current\_price}_i / \max(\text{purchase\_quantity}_i, 1)\).
 */
export type RecipeCostResult = {
  costEur: number;
  lines: RecipeCostLine[];
};

/**
 * Gross margin on `recipes.selling_price` vs {@link RecipeCostResult.costEur}.
 *
 * **Formulas (selling = `selling_price` in €, cost = `costEur`):**
 * - Gross profit € = `selling - cost`
 * - Gross margin % = \((\text{selling} - \text{cost}) / \text{selling} \times 100\) when `selling > 0`, else `null`.
 */
export type RecipeMarginResult = {
  sellingPriceEur: number;
  costEur: number;
  /** `(selling - cost) / selling * 100` if `selling > 0`, else `null`. */
  grossMarginPct: number | null;
  /** `selling - cost`. */
  grossProfitEur: number;
};

export type DetectedAffectedRecipe = {
  recipeId: string;
  recipeName: string;
};

export type RecipeMarginDeltaLine = {
  ingredientId: string;
  quantity: number;
  currentUnitPriceEur: number;
  previousUnitPriceEur: number;
  lineCurrentCostEur: number;
  linePreviousCostEur: number;
  lineCostDeltaEur: number;
};

/**
 * Margin shift using **current** recipe food cost vs a **previous** snapshot.
 *
 * **Cost formulas:** same as {@link RecipeCostResult} for current lines.
 * **Previous unit price (per ingredient, deterministic):**
 * 1. Load all `ingredient_price_history` rows for the ingredient, sorted by `created_at` descending.
 * 2. Let **L** = newest row, **P** = second-newest row (if any).
 * 3. If `L.previous_price` is a finite number, use it as the previous unit price.
 * 4. Else if **P** exists, use `P.new_price` as the previous unit price.
 * 5. Else use the current **effective** €/base-unit price (same as line costing: pack price ÷ purchase quantity).
 *
 * **Margin %:** \((\text{selling} - \text{cost}) / \text{selling} \times 100\) when `selling > 0`, else `null`.
 *
 * **Δ margin (percentage points):** `currentMarginPct - previousMarginPct` when both are finite, else `null`.
 */
export type RecipeMarginDeltaResult = {
  recipeId: string;
  recipeName: string;
  sellingPriceEur: number;
  currentCost: number;
  previousCost: number;
  /** `currentCost - previousCost`. */
  deltaCost: number;
  currentMarginPct: number | null;
  previousMarginPct: number | null;
  /** Margin percentage points: current − previous when both defined. */
  deltaMarginPctPoints: number | null;
  lines: RecipeMarginDeltaLine[];
};

export type RecipeMarginImpactAffectedLine = {
  ingredient_id: string;
  name: string;
  quantity: number;
  previousUnitPrice: number;
  newUnitPrice: number;
  lineCostDelta: number;
};

export type RecipeMarginImpact = {
  recipe: Pick<Tables<"recipes">, "id" | "name" | "selling_price">;
  previousFoodCost: number;
  newFoodCost: number;
  marginBeforePct: number | null;
  marginAfterPct: number | null;
  affectedIngredients: RecipeMarginImpactAffectedLine[];
};

export type AffectedRecipeSummary = {
  recipe_id: string;
  recipe_name: string;
};

// --- History helpers ---

function finiteOr(value: number | null | undefined, fallback: number): number {
  const n = value == null ? NaN : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/** Map pack-level history prices to € per base unit using a fixed purchase denominator. */
function historyRowsAsEffectivePerBaseUnit(rows: HistoryRow[], purchaseDenom: number): HistoryRow[] {
  const d = purchaseDenom > 0 ? purchaseDenom : 1;
  return rows.map((r) => ({
    ...r,
    new_price: finiteOr(r.new_price, 0) / d,
    previous_price: r.previous_price == null ? null : finiteOr(r.previous_price, 0) / d,
  }));
}

/**
 * Resolves the modeled **previous** unit price before the latest invoice snapshot,
 * using only flat `ingredient_price_history` rows for one ingredient (`rows` must be
 * sorted by `created_at` descending).
 *
 * @see {@link RecipeMarginDeltaResult} for the full precedence rule.
 */
export function resolvePreviousUnitPriceEur(
  currentUnitPriceEur: number,
  historyRowsNewestFirst: HistoryRow[],
): number {
  const cur = finiteOr(currentUnitPriceEur, 0);
  if (!historyRowsNewestFirst.length) return cur;
  const L = historyRowsNewestFirst[0];
  const prevL = L.previous_price == null ? null : Number(L.previous_price);
  if (prevL != null && Number.isFinite(prevL)) return prevL;
  const P = historyRowsNewestFirst[1];
  if (P) {
    const priorNew = Number(P.new_price);
    if (Number.isFinite(priorNew)) return priorNew;
  }
  return cur;
}

function groupHistoryByIngredient(rows: HistoryRow[]): Map<string, HistoryRow[]> {
  const map = new Map<string, HistoryRow[]>();
  for (const row of rows) {
    const list = map.get(row.ingredient_id) ?? [];
    list.push(row);
    map.set(row.ingredient_id, list);
  }
  for (const [id, list] of map) {
    list.sort((a, b) => b.created_at.localeCompare(a.created_at));
    map.set(id, list);
  }
  return map;
}

function grossMarginPct(selling: number, cost: number): number | null {
  if (!(selling > COST_EPS)) return null;
  return ((selling - cost) / selling) * 100;
}

// --- 1. Recipe cost ---

/**
 * Computes total recipe food cost from `recipe_ingredients` joined in memory to
 * `ingredients.current_price` and `ingredients.purchase_quantity` (two flat selects, no embeds).
 *
 * **Line cost:** `quantity × (current_price / max(purchase_quantity, 1))`.
 * **Total:** sum of line costs.
 */
export async function computeRecipeCost(
  client: AppSupabaseClient,
  recipeId: string,
): Promise<RecipeCostResult> {
  traceFoodCostRecalculationSource("compute_recipe_cost", { recipeId, surface: "recipe-impact" });

  const { linesByRecipe, recipesById } = await loadRecipeLinesByRecipeMapForClosure(client, [recipeId]);
  const topLines = linesByRecipe.get(recipeId) ?? [];
  if (!topLines.length) return { costEur: 0, lines: [] };

  const costEur = recipeTotalCostEurForRecipe(recipeId, linesByRecipe, recipesById) ?? 0;

  const priceById = new Map<string, number>();
  for (const line of topLines) {
    if (!line.ingredient_id || !line.ingredients) continue;
    priceById.set(line.ingredient_id, effectiveIngredientUnitCostEur(line.ingredients));
  }

  const outLines: RecipeCostLine[] = [];
  for (const line of topLines) {
    if (!line.ingredient_id) continue;
    traceRecipeLineFoodCostSource({
      surface: "recipe-impact.computeRecipeCost",
      recipeId,
      lineId: line.id,
      ingredientId: line.ingredient_id,
      source: "ingredients_join",
      inCanonicalCatalog: undefined,
    });
    const qty = Number(line.quantity);
    const safeQty = Number.isFinite(qty) ? qty : 0;
    const unit = priceById.get(line.ingredient_id) ?? 0;
    const lineCost = safeQty * unit;
    outLines.push({
      ingredientId: line.ingredient_id,
      quantity: safeQty,
      unitPriceEur: unit,
      lineCostEur: lineCost,
    });
  }
  return { costEur, lines: outLines };
}

// --- 2. Recipe margin ---

/**
 * Gross margin vs `recipes.selling_price` and {@link computeRecipeCost}.
 *
 * **Gross profit €** = `selling_price − costEur`.
 * **Gross margin %** = `(selling_price − costEur) / selling_price × 100` if `selling_price > 0`, else `null`.
 */
export async function computeRecipeMargin(
  client: AppSupabaseClient,
  recipeId: string,
): Promise<(RecipeMarginResult & { recipeName: string }) | null> {
  const { data: recipe, error: rErr } = await client
    .from("recipes")
    .select("id,name,selling_price")
    .eq("id", recipeId)
    .maybeSingle();
  if (rErr) throw rErr;
  if (!recipe) return null;

  const cost = await computeRecipeCost(client, recipeId);

  const selling = finiteOr(recipe.selling_price, 0);
  const grossProfitEur = selling - cost.costEur;
  return {
    recipeName: recipe.name,
    sellingPriceEur: selling,
    costEur: cost.costEur,
    grossMarginPct: grossMarginPct(selling, cost.costEur),
    grossProfitEur,
  };
}

// --- 3. Affected recipes by ingredient ---

/**
 * All distinct recipes that use `ingredientId`, with names from a second flat query.
 */
export async function detectAffectedRecipes(
  client: AppSupabaseClient,
  ingredientId: string,
): Promise<DetectedAffectedRecipe[]> {
  const { data: ri, error: riErr } = await client
    .from("recipe_ingredients")
    .select("recipe_id")
    .eq("ingredient_id", ingredientId);
  if (riErr) throw riErr;
  const recipeIds = [...new Set((ri ?? []).map((r) => r.recipe_id))];
  if (!recipeIds.length) return [];

  const { data: recipes, error: rErr } = await client.from("recipes").select("id,name").in("id", recipeIds);
  if (rErr) throw rErr;
  const nameBy = new Map((recipes ?? []).map((r) => [r.id, r.name]));
  return recipeIds
    .map((id) => ({ recipeId: id, recipeName: nameBy.get(id) ?? "Recipe" }))
    .sort((a, b) => a.recipeName.localeCompare(b.recipeName));
}

// --- 4. Margin delta ---

/**
 * @see {@link RecipeMarginDeltaResult} for previous-unit and margin formulas.
 */
export async function computeMarginDelta(
  client: AppSupabaseClient,
  recipeId: string,
): Promise<RecipeMarginDeltaResult | null> {
  const { data: recipe, error: rErr } = await client
    .from("recipes")
    .select("id,name,selling_price")
    .eq("id", recipeId)
    .maybeSingle();
  if (rErr) throw rErr;
  if (!recipe) return null;

  const { linesByRecipe, recipesById } = await loadRecipeLinesByRecipeMapForClosure(client, [recipeId]);
  const topLines = linesByRecipe.get(recipeId) ?? [];

  const selling = finiteOr(recipe.selling_price, 0);
  if (!topLines.length) {
    return {
      recipeId: recipe.id,
      recipeName: recipe.name,
      sellingPriceEur: selling,
      currentCost: 0,
      previousCost: 0,
      deltaCost: 0,
      currentMarginPct: grossMarginPct(selling, 0),
      previousMarginPct: grossMarginPct(selling, 0),
      deltaMarginPctPoints: 0,
      lines: [],
    };
  }

  const allClosureIngredientIds = new Set<string>();
  for (const ls of linesByRecipe.values()) {
    for (const row of ls) {
      if (row.ingredient_id) allClosureIngredientIds.add(row.ingredient_id);
    }
  }

  const ingredientIds = [...allClosureIngredientIds];

  if (!ingredientIds.length) {
    const currentCost = recipeTotalCostEurForRecipe(recipeId, linesByRecipe, recipesById) ?? 0;
    const currentMarginPct = grossMarginPct(selling, currentCost);
    return {
      recipeId: recipe.id,
      recipeName: recipe.name,
      sellingPriceEur: selling,
      currentCost,
      previousCost: currentCost,
      deltaCost: 0,
      currentMarginPct,
      previousMarginPct: currentMarginPct,
      deltaMarginPctPoints: 0,
      lines: [],
    };
  }

  const [{ data: ingredients, error: iErr }, historyResult] = await Promise.all([
    client.from("ingredients").select("id,name,current_price,purchase_quantity").in("id", ingredientIds),
    client
      .from("ingredient_price_history")
      .select("ingredient_id,previous_price,new_price,created_at")
      .in("ingredient_id", ingredientIds),
  ]);
  if (iErr) throw iErr;
  if (historyResult.error) {
    logHistoryError("computeMarginDelta", historyResult.error);
  }
  const historyRows = historyResult.error ? [] : historyResult.data ?? [];

  const metaById = new Map<string, { name: string; currentPack: number; purchaseDenom: number }>();
  for (const ing of ingredients ?? []) {
    const pq = purchaseQuantityDenom(ing.purchase_quantity);
    metaById.set(ing.id, {
      name: ing.name,
      currentPack: finiteOr(ing.current_price, 0),
      purchaseDenom: pq,
    });
  }

  const histByIng = groupHistoryByIngredient(historyRows);

  const previousUnitById = new Map<string, number>();
  for (const id of ingredientIds) {
    const meta = metaById.get(id);
    if (!meta) continue;
    const currentUnit = meta.currentPack / meta.purchaseDenom;
    const histRaw = histByIng.get(id) ?? [];
    const hist = historyRowsAsEffectivePerBaseUnit(histRaw, meta.purchaseDenom);
    const previousUnit = resolvePreviousUnitPriceEur(currentUnit, hist);
    previousUnitById.set(id, previousUnit);
  }

  const currentCost = recipeTotalCostEurForRecipe(recipeId, linesByRecipe, recipesById) ?? 0;
  const previousCost =
    recipeTotalCostWithIngredientUnitOverrides(recipeId, linesByRecipe, previousUnitById, recipesById) ?? 0;

  const lines: RecipeMarginDeltaLine[] = [];
  for (const line of topLines) {
    if (!line.ingredient_id) continue;
    traceRecipeLineFoodCostSource({
      surface: "recipe-impact.computeMarginDelta",
      recipeId: recipe.id,
      lineId: line.id,
      ingredientId: line.ingredient_id,
      source: "ingredients_join",
    });
    const meta = metaById.get(line.ingredient_id);
    if (!meta) continue;
    const qty = Number(line.quantity);
    const safeQty = Number.isFinite(qty) ? qty : 0;
    const currentUnit = meta.currentPack / meta.purchaseDenom;
    const histRaw = histByIng.get(line.ingredient_id) ?? [];
    const hist = historyRowsAsEffectivePerBaseUnit(histRaw, meta.purchaseDenom);
    const previousUnit = resolvePreviousUnitPriceEur(currentUnit, hist);

    const lineCur = safeQty * currentUnit;
    const linePrev = safeQty * previousUnit;

    lines.push({
      ingredientId: line.ingredient_id,
      quantity: safeQty,
      currentUnitPriceEur: currentUnit,
      previousUnitPriceEur: previousUnit,
      lineCurrentCostEur: lineCur,
      linePreviousCostEur: linePrev,
      lineCostDeltaEur: lineCur - linePrev,
    });
  }

  const currentMarginPct = grossMarginPct(selling, currentCost);
  const previousMarginPct = grossMarginPct(selling, previousCost);
  const deltaMarginPctPoints =
    currentMarginPct != null && previousMarginPct != null && Number.isFinite(currentMarginPct) && Number.isFinite(previousMarginPct)
      ? currentMarginPct - previousMarginPct
      : null;

  return {
    recipeId: recipe.id,
    recipeName: recipe.name,
    sellingPriceEur: selling,
    currentCost,
    previousCost,
    deltaCost: currentCost - previousCost,
    currentMarginPct,
    previousMarginPct,
    deltaMarginPctPoints,
    lines,
  };
}

// --- 5. Monthly impact ---

/**
 * Linear cash impact of the modeled food-cost move over a month.
 *
 * **Formula:** `deltaCostPerServing × monthlyServingsEstimate`, where `deltaCostPerServing`
 * is {@link RecipeMarginDeltaResult.deltaCost} from {@link computeMarginDelta}.
 *
 * **Default `monthlyServingsEstimate`:** {@link DEFAULT_MONTHLY_SERVINGS_ESTIMATE} (`30`) when omitted —
 * a coarse stand-in when true covers are unknown.
 */
export async function estimateMonthlyImpact(
  client: AppSupabaseClient,
  recipeId: string,
  opts?: { monthlyServingsEstimate?: number },
): Promise<{
  monthlyServingsEstimate: number;
  deltaCostPerServing: number;
  estimatedMonthlyDeltaCostEur: number;
} | null> {
  const monthlyServingsEstimate = opts?.monthlyServingsEstimate ?? DEFAULT_MONTHLY_SERVINGS_ESTIMATE;
  const delta = await computeMarginDelta(client, recipeId);
  if (!delta) return null;
  return {
    monthlyServingsEstimate,
    deltaCostPerServing: delta.deltaCost,
    estimatedMonthlyDeltaCostEur: delta.deltaCost * monthlyServingsEstimate,
  };
}

// --- 6. Suggested action ---

/**
 * Deterministic copy from modeled costs/margins (no LLM).
 *
 * **Rules (first match wins):**
 * 1. `sellingPriceEur ≤ 0` → prompt to set a selling price.
 * 2. **Raise menu price:** `currentMarginPct` finite and **&lt; 58%** (gross margin after current costs).
 * 3. **Review supplier:** modeled food cost rose (`deltaCost > 0`) and one line accounts for **≥ 62%**
 *    of the sum of strictly positive per-line `lineCostDeltaEur` values.
 * 4. **Reduce ingredient quantity:** some line has **≥ 28%** of `currentCost` as `lineCurrentCostEur`
 *    and a strictly positive `lineCostDeltaEur` on that line.
 * 5. Otherwise a short default reconciliation line.
 *
 * **Overloads:** pass {@link RecipeMarginDeltaResult} for pure formatting, or `(client, recipeId)` to
 * run {@link computeMarginDelta} then format (returns `null` if the recipe row is missing).
 */
function suggestedActionFromMarginDelta(delta: RecipeMarginDeltaResult): string {
  const { sellingPriceEur, currentMarginPct, deltaCost, lines, currentCost } = delta;

  if (!(sellingPriceEur > COST_EPS)) {
    return "Set a positive selling price on the recipe before optimizing food cost or margin.";
  }

  if (currentMarginPct != null && currentMarginPct < SUGGEST_LOW_MARGIN_AFTER_PCT) {
    return "Raise menu price on this item until gross margin clears your target.";
  }

  const positiveDeltas = lines.filter((l) => l.lineCostDeltaEur > COST_EPS);
  const sumPos = positiveDeltas.reduce((s, l) => s + l.lineCostDeltaEur, 0);
  if (deltaCost > COST_EPS && sumPos > COST_EPS) {
    let maxL = positiveDeltas[0]!;
    for (const l of positiveDeltas) {
      if (l.lineCostDeltaEur > maxL.lineCostDeltaEur) maxL = l;
    }
    if (maxL.lineCostDeltaEur / sumPos >= SUGGEST_SINGLE_LINE_DOMINANCE) {
      return "Review supplier pricing for the ingredient that accounts for most of the food-cost increase.";
    }
  }

  if (currentCost > COST_EPS) {
    for (const l of lines) {
      const share = l.lineCurrentCostEur / currentCost;
      if (share >= SUGGEST_HIGH_LINE_COST_SHARE && l.lineCostDeltaEur > COST_EPS) {
        return "Reduce ingredient quantity on high-cost lines where the dish still meets spec.";
      }
    }
  }

  return "Reconcile recipe yields and invoice unit costs; adjust pricing or formulation if drift persists.";
}

export function generateSuggestedAction(delta: RecipeMarginDeltaResult): string;
export function generateSuggestedAction(client: AppSupabaseClient, recipeId: string): Promise<string | null>;
export function generateSuggestedAction(
  a: AppSupabaseClient | RecipeMarginDeltaResult,
  b?: string,
): string | Promise<string | null> {
  if (b !== undefined) {
    const client = a as AppSupabaseClient;
    return computeMarginDelta(client, b).then((d) => (d ? suggestedActionFromMarginDelta(d) : null));
  }
  return suggestedActionFromMarginDelta(a as RecipeMarginDeltaResult);
}

// --- Portfolio: recipes touched by recent price history ---

/**
 * Recipes referencing any ingredient with `ingredient_price_history.created_at` in the window.
 */
export async function computeAffectedRecipes(
  client: AppSupabaseClient,
  opts?: { windowDays?: number },
): Promise<AffectedRecipeSummary[]> {
  const windowDays = opts?.windowDays ?? 14;
  const since = new Date(Date.now() - windowDays * 86_400_000).toISOString();
  const { data: hist, error: hErr } = await client
    .from("ingredient_price_history")
    .select("ingredient_id")
    .gte("created_at", since);
  if (hErr) {
    logHistoryError("computeAffectedRecipes", hErr);
    return [];
  }
  const touchedIds = [...new Set((hist ?? []).map((h) => h.ingredient_id))];
  if (!touchedIds.length) return [];

  const { data: ri, error: riErr } = await client
    .from("recipe_ingredients")
    .select("recipe_id")
    .in("ingredient_id", touchedIds);
  if (riErr) throw riErr;
  const recipeIds = [...new Set((ri ?? []).map((r) => r.recipe_id))];
  if (!recipeIds.length) return [];

  const { data: recipes, error: rErr } = await client.from("recipes").select("id,name").in("id", recipeIds);
  if (rErr) throw rErr;

  return (recipes ?? [])
    .map((r) => ({ recipe_id: r.id, recipe_name: r.name }))
    .sort((a, b) => a.recipe_name.localeCompare(b.recipe_name));
}

// --- Recipe margin impact (alerts / UI) ---

/**
 * Modeled recipe food cost: **new** = current catalog prices; **previous** unit prices
 * follow {@link resolvePreviousUnitPriceEur} (same rule as {@link computeMarginDelta}).
 *
 * **Margin %:** \((\text{selling} - \text{cost}) / \text{selling} \times 100\) when `selling > 0`.
 */
export async function computeRecipeMarginImpact(
  client: AppSupabaseClient,
  recipeId: string,
): Promise<RecipeMarginImpact | null> {
  const delta = await computeMarginDelta(client, recipeId);
  if (!delta) return null;

  const ingredientIds = [...new Set(delta.lines.map((l) => l.ingredientId))];
  let nameBy = new Map<string, string>();
  if (ingredientIds.length) {
    const { data: ingredients, error: iErr } = await client.from("ingredients").select("id,name").in("id", ingredientIds);
    if (iErr) throw iErr;
    nameBy = new Map((ingredients ?? []).map((i) => [i.id, i.name]));
  }

  const affectedIngredients: RecipeMarginImpactAffectedLine[] = [];
  for (const l of delta.lines) {
    if (Math.abs(l.previousUnitPriceEur - l.currentUnitPriceEur) <= COST_EPS) continue;
    affectedIngredients.push({
      ingredient_id: l.ingredientId,
      name: nameBy.get(l.ingredientId) ?? "Ingredient",
      quantity: l.quantity,
      previousUnitPrice: l.previousUnitPriceEur,
      newUnitPrice: l.currentUnitPriceEur,
      lineCostDelta: l.lineCostDeltaEur,
    });
  }

  const recipe: Pick<Tables<"recipes">, "id" | "name" | "selling_price"> = {
    id: delta.recipeId,
    name: delta.recipeName,
    selling_price: delta.sellingPriceEur,
  };

  return {
    recipe,
    previousFoodCost: delta.previousCost,
    newFoodCost: delta.currentCost,
    marginBeforePct: delta.previousMarginPct,
    marginAfterPct: delta.currentMarginPct,
    affectedIngredients,
  };
}

/**
 * Batch version of {@link computeRecipeMarginImpact} (flat queries only).
 */
export async function computeRecipeMarginImpactsForRecipeIds(
  client: AppSupabaseClient,
  recipeIds: string[],
): Promise<Map<string, RecipeMarginImpact>> {
  const out = new Map<string, RecipeMarginImpact>();
  if (!recipeIds.length) return out;

  const { data: recipes, error: rErr } = await client
    .from("recipes")
    .select("id,name,selling_price")
    .in("id", recipeIds);
  if (rErr) throw rErr;
  const recipeList = recipes ?? [];

  const { linesByRecipe, recipesById } = await loadRecipeLinesByRecipeMapForClosure(client, recipeIds);

  const ingredientIds = new Set<string>();
  for (const ls of linesByRecipe.values()) {
    for (const row of ls) {
      if (row.ingredient_id) ingredientIds.add(row.ingredient_id);
    }
  }
  const ingList = [...ingredientIds];

  const priceById = new Map<string, { name: string; current_price: number; purchase_quantity: number }>();
  let histByIng = new Map<string, HistoryRow[]>();

  if (ingList.length) {
    const [{ data: ingredients, error: iErr }, historyResult] = await Promise.all([
      client.from("ingredients").select("id,name,current_price,purchase_quantity").in("id", ingList),
      client
        .from("ingredient_price_history")
        .select("ingredient_id,previous_price,new_price,created_at")
        .in("ingredient_id", ingList),
    ]);
    if (iErr) throw iErr;
    if (historyResult.error) {
      logHistoryError("computeRecipeMarginImpactsForRecipeIds", historyResult.error);
    }
    const historyRows = historyResult.error ? [] : historyResult.data ?? [];

    for (const ing of ingredients ?? []) {
      priceById.set(ing.id, {
        name: ing.name,
        current_price: finiteOr(ing.current_price, 0),
        purchase_quantity: purchaseQuantityDenom(ing.purchase_quantity),
      });
    }
    histByIng = groupHistoryByIngredient(historyRows);
  }

  const previousUnitById = new Map<string, number>();
  for (const id of ingList) {
    const meta = priceById.get(id);
    if (!meta) continue;
    const newUnit = meta.current_price / meta.purchase_quantity;
    const histRaw = histByIng.get(id) ?? [];
    const hist = historyRowsAsEffectivePerBaseUnit(histRaw, meta.purchase_quantity);
    const previousUnit = resolvePreviousUnitPriceEur(newUnit, hist);
    previousUnitById.set(id, previousUnit);
  }

  for (const recipe of recipeList) {
    const linesForRecipe = linesByRecipe.get(recipe.id) ?? [];
    const sale = finiteOr(recipe.selling_price, 0);

    if (!linesForRecipe.length) {
      out.set(recipe.id, {
        recipe,
        previousFoodCost: 0,
        newFoodCost: 0,
        marginBeforePct: sale > 0 ? 100 : null,
        marginAfterPct: sale > 0 ? 100 : null,
        affectedIngredients: [],
      });
      continue;
    }

    const newFoodCost = recipeTotalCostEurForRecipe(recipe.id, linesByRecipe, recipesById) ?? 0;
    const previousFoodCost =
      recipeTotalCostWithIngredientUnitOverrides(recipe.id, linesByRecipe, previousUnitById, recipesById) ??
      0;

    const affectedIngredients: RecipeMarginImpactAffectedLine[] = [];

    for (const line of linesForRecipe) {
      if (!line.ingredient_id) continue;
      traceRecipeLineFoodCostSource({
        surface: "recipe-impact.computeRecipeMarginImpactsForRecipeIds",
        recipeId: recipe.id,
        lineId: line.id,
        ingredientId: line.ingredient_id,
        source: "ingredients_join",
      });
      const meta = priceById.get(line.ingredient_id);
      if (!meta) continue;
      const qty = Number(line.quantity);
      const safeQty = Number.isFinite(qty) ? qty : 0;
      const pq = meta.purchase_quantity;
      const newUnit = meta.current_price / pq;
      const histRaw = histByIng.get(line.ingredient_id) ?? [];
      const hist = historyRowsAsEffectivePerBaseUnit(histRaw, pq);
      const previousUnit = resolvePreviousUnitPriceEur(newUnit, hist);

      if (Math.abs(previousUnit - newUnit) > COST_EPS) {
        affectedIngredients.push({
          ingredient_id: line.ingredient_id,
          name: meta.name,
          quantity: safeQty,
          previousUnitPrice: previousUnit,
          newUnitPrice: newUnit,
          lineCostDelta: safeQty * (newUnit - previousUnit),
        });
      }
    }

    out.set(recipe.id, {
      recipe,
      previousFoodCost,
      newFoodCost,
      marginBeforePct: grossMarginPct(sale, previousFoodCost),
      marginAfterPct: grossMarginPct(sale, newFoodCost),
      affectedIngredients,
    });
  }

  return out;
}
