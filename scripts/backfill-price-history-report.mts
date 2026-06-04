/**
 * Backfill ingredient_price_history and report OI synthesis counts (hostname only in logs).
 *
 *   ./node_modules/.bin/vite-node scripts/backfill-price-history-report.mts
 */
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../src/integrations/supabase/types";
import { backfillIngredientPriceHistoryFromInvoices } from "../src/lib/ingredient-price-history-backfill";
import { loadCanonicalIngredientCatalog } from "../src/lib/ingredient-catalog-load";
import { PRICE_WINDOW_180_DAYS } from "../src/lib/exposure-drill-down";
import { getRecentPriceChanges } from "../src/lib/ingredient-price-history";
import { buildMarginAlertsFromSupabase } from "../src/lib/margin-alerts";
import * as marginAlertData from "../src/lib/margin-alert-data";
import { buildSynthesisViewModel } from "../src/lib/operational-intelligence-synthesis";
import { loadEnvFiles } from "./load-env.mts";

loadEnvFiles();

const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "";
const key =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_ROLE ||
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  process.env.SUPABASE_PUBLISHABLE_KEY ||
  "";

if (!url || !key) {
  console.error(
    JSON.stringify({
      error: "Missing VITE_SUPABASE_URL and a Supabase key (service role or publishable).",
    }),
  );
  process.exit(1);
}

try {
  const host = new URL(url).hostname;
  console.log(`[backfill-report] supabase host: ${host}`);
} catch {
  console.log("[backfill-report] supabase url: (invalid)");
}

const supabase = createClient<Database>(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function countHistoryRows(): Promise<number> {
  const { count, error } = await supabase
    .from("ingredient_price_history")
    .select("id", { count: "exact", head: true });
  if (error) throw new Error(`count history: ${error.message}`);
  return count ?? 0;
}

async function countIngredientsWithTwoPlusPoints(): Promise<number> {
  const { data, error } = await supabase
    .from("ingredient_price_history")
    .select("ingredient_id");
  if (error) throw new Error(`ingredient_id scan: ${error.message}`);
  const tallies = new Map<string, number>();
  for (const row of data ?? []) {
    const id = (row as { ingredient_id?: string }).ingredient_id?.trim();
    if (!id) continue;
    tallies.set(id, (tallies.get(id) ?? 0) + 1);
  }
  let n = 0;
  for (const c of tallies.values()) if (c >= 2) n += 1;
  return n;
}

async function loadMarginData() {
  const [
    ingredientsResult,
    recipesResult,
    recipeIngredientsResult,
    historyResult,
    invoicesResult,
  ] = await Promise.all([
    loadCanonicalIngredientCatalog(
      supabase,
      "current_price, purchase_quantity, purchase_unit, base_unit, created_at, density_g_per_ml",
    ),
    supabase
      .from("recipes")
      .select("id, name, selling_price, type, output_quantity, output_unit")
      .order("name", { ascending: true }),
    supabase
      .from("recipe_ingredients")
      .select("id, recipe_id, ingredient_id, sub_recipe_id, quantity, unit, created_at"),
    getRecentPriceChanges(supabase, PRICE_WINDOW_180_DAYS),
    supabase
      .from("invoices")
      .select("id, supplier_name, total, created_at")
      .gte(
        "created_at",
        new Date(Date.now() - PRICE_WINDOW_180_DAYS * 86_400_000).toISOString(),
      )
      .order("created_at", { ascending: false })
      .limit(200),
  ]);

  if (ingredientsResult.error) throw new Error(ingredientsResult.error);
  if (recipesResult.error) throw recipesResult.error;
  if (recipeIngredientsResult.error) throw recipeIngredientsResult.error;

  const ingredients = [...ingredientsResult.rows].sort((a, b) =>
    (a.name ?? "").localeCompare(b.name ?? "", undefined, { sensitivity: "base" }),
  );
  const ingredientById = new Map(ingredients.map((i) => [i.id, i]));

  const recipeLinesByRecipeId = new Map<string, unknown[]>();
  for (const line of recipeIngredientsResult.data ?? []) {
    const row = line as {
      recipe_id: string | null;
      ingredient_id: string | null;
      id: string;
      sub_recipe_id: string | null;
      quantity: number | null;
      unit: string | null;
      created_at: string | null;
    };
    if (!row.recipe_id) continue;
    const recipeLines = recipeLinesByRecipeId.get(row.recipe_id) ?? [];
    recipeLines.push({
      ...row,
      created_at: row.created_at ?? "",
      ingredients: row.ingredient_id
        ? (ingredientById.get(row.ingredient_id) ?? null)
        : null,
    });
    recipeLinesByRecipeId.set(row.recipe_id, recipeLines);
  }

  const recipes = (
    (recipesResult.data ?? []) as Array<{
      id: string;
      name: string;
      selling_price: number | null;
      type: string | null;
      output_quantity: number | null;
      output_unit: string | null;
    }>
  ).map((recipe) => ({
    ...recipe,
    recipe_ingredients: recipeLinesByRecipeId.get(recipe.id) ?? [],
  }));

  return {
    ingredients,
    recipes,
    priceHistory: Array.isArray(historyResult) ? historyResult : [],
    invoices: invoicesResult.error ? [] : (invoicesResult.data ?? []),
  };
}

async function main() {
  const keyKind =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE
      ? "service_role"
      : "publishable";

  const before = await countHistoryRows();
  const backfill = await backfillIngredientPriceHistoryFromInvoices(supabase);
  const after = await countHistoryRows();
  const ingredientsTwoPlus = await countIngredientsWithTwoPlusPoints();

  let oi: Record<string, unknown> = {};
  try {
    const data = await loadMarginData();
    const libAlerts = await buildMarginAlertsFromSupabase(supabase).catch(() => []);
    const local = marginAlertData.buildOperationalAlertItems(data);
    const lib = marginAlertData.convertLibMarginAlerts(libAlerts);
    const alerts = marginAlertData.finalizeOperationalAlertItems(local, lib, data);
    const health = marginAlertData.buildOperationalHealthPanel(data, libAlerts);
    const synthesis = buildSynthesisViewModel({
      data,
      alerts,
      health,
      dateRange: "90",
    });
    const owner = synthesis.ownerReview;
    oi = {
      suppliersToWatchCount: owner.suppliersToWatch.length,
      opportunitiesCount: owner.opportunities.length,
      affectedRecipesCount: owner.affectedRecipes.length,
      suppliersToWatchPopulates: owner.suppliersToWatch.length > 0,
      opportunitiesPopulates: owner.opportunities.length > 0,
      affectedRecipesPopulates: owner.affectedRecipes.length > 0,
      topSuppliersToWatch: owner.suppliersToWatch.slice(0, 10).map((row) => ({
        supplierName: row.supplierName,
        headline: row.headline,
        impactLine: row.impactLine,
      })),
    };
  } catch (e) {
    oi = { error: e instanceof Error ? e.message : String(e) };
  }

  console.log(
    JSON.stringify(
      {
        keyKind,
        before,
        after,
        delta: after - before,
        ingredientsWithTwoPlusPoints: ingredientsTwoPlus,
        backfill,
        oi,
      },
      null,
      2,
    ),
  );
}

await main();
