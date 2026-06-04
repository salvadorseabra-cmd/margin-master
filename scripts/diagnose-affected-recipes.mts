/**
 * Report ownerReview.affectedRecipes vs recipe margin alert windows.
 *
 *   ./node_modules/.bin/vite-node scripts/diagnose-affected-recipes.mts
 */
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../src/integrations/supabase/types";
import { loadCanonicalIngredientCatalog } from "../src/lib/ingredient-catalog-load";
import { PRICE_WINDOW_180_DAYS } from "../src/lib/exposure-drill-down";
import { getRecentPriceChanges } from "../src/lib/ingredient-price-history";
import {
  buildMarginAlertsFromSupabase,
  generateRecipeMarginDeteriorationAlerts,
} from "../src/lib/margin-alerts";
import * as marginAlertData from "../src/lib/margin-alert-data";
import {
  buildSynthesisViewModel,
  mapDateRangeToWindowKey,
} from "../src/lib/operational-intelligence-synthesis";
import {
  computeAffectedRecipes,
  computeRecipeMarginImpactsForRecipeIds,
} from "../src/lib/recipe-impact";
import { loadEnvFiles } from "./load-env.mts";

loadEnvFiles();

const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "";
const serviceRoleKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE || "";

if (!url || !serviceRoleKey) {
  console.error(
    JSON.stringify({
      error: "Need VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local",
    }),
  );
  process.exit(1);
}

const supabase = createClient<Database>(url, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const RECIPE_IMPACT_WINDOW_DAYS = 14;
const MARGIN_DROP_MIN = 1.2;
const COST_UP_MIN = 0.35;

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
      ingredients: row.ingredient_id ? (ingredientById.get(row.ingredient_id) ?? null) : null,
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

  const priceHistory = Array.isArray(historyResult) ? historyResult : [];

  return {
    ingredients,
    recipes,
    priceHistory,
    invoices: invoicesResult.error ? [] : (invoicesResult.data ?? []),
  };
}

function marginDropPoints(before: number | null, after: number | null): number {
  if (before == null || after == null || !Number.isFinite(before) || !Number.isFinite(after)) return 0;
  return Math.max(0, before - after);
}

async function diagnoseMarginAlertPipeline() {
  const since = new Date(Date.now() - RECIPE_IMPACT_WINDOW_DAYS * 86_400_000).toISOString();
  const { data: histRows } = await supabase
    .from("ingredient_price_history")
    .select("ingredient_id, created_at")
    .gte("created_at", since);

  const touchedIngredientIds = [...new Set((histRows ?? []).map((h) => h.ingredient_id))];
  const sampleIngredientIds = touchedIngredientIds.slice(0, 8);

  const affected = await computeAffectedRecipes(supabase, {
    windowDays: RECIPE_IMPACT_WINDOW_DAYS,
  });

  const recipeIds = affected.map((a) => a.recipe_id).slice(0, 60);
  const impacts = await computeRecipeMarginImpactsForRecipeIds(supabase, recipeIds);

  let passImpact = 0;
  let skipNoImpact = 0;
  let skipLowDropAndCost = 0;
  let skipNoAffectedIngredients = 0;
  let skipNoSellingPrice = 0;
  const skipSamples: Array<Record<string, unknown>> = [];

  for (const a of affected) {
    const impact = impacts.get(a.recipe_id);
    if (!impact) {
      skipNoImpact += 1;
      if (skipSamples.length < 8) {
        skipSamples.push({ recipe: a.recipe_name, reason: "no_impact_row" });
      }
      continue;
    }
    const sale = Number(impact.recipe.selling_price) || 0;
    if (sale <= 0) {
      skipNoSellingPrice += 1;
      if (skipSamples.length < 8) {
        skipSamples.push({ recipe: a.recipe_name, reason: "selling_price_zero" });
      }
      continue;
    }
    const drop = marginDropPoints(impact.marginBeforePct, impact.marginAfterPct);
    const costUp = Math.max(0, impact.newFoodCost - impact.previousFoodCost);
    if (drop < MARGIN_DROP_MIN && costUp < COST_UP_MIN) {
      skipLowDropAndCost += 1;
      if (skipSamples.length < 8) {
        skipSamples.push({
          recipe: a.recipe_name,
          reason: "below_threshold",
          drop,
          costUp,
          marginBefore: impact.marginBeforePct,
          marginAfter: impact.marginAfterPct,
          previousFoodCost: impact.previousFoodCost,
          newFoodCost: impact.newFoodCost,
          affectedIngredientCount: impact.affectedIngredients.length,
        });
      }
      continue;
    }
    if (impact.affectedIngredients.length === 0) {
      skipNoAffectedIngredients += 1;
      if (skipSamples.length < 8) {
        skipSamples.push({ recipe: a.recipe_name, reason: "no_affected_ingredients", drop, costUp });
      }
      continue;
    }
    passImpact += 1;
  }

  const deteriorationAlerts = await generateRecipeMarginDeteriorationAlerts(supabase);
  const libAlerts = await buildMarginAlertsFromSupabase(supabase).catch(() => []);

  return {
    historyInRecipeWindow: {
      windowDays: RECIPE_IMPACT_WINDOW_DAYS,
      since,
      historyRowCount: histRows?.length ?? 0,
      touchedIngredientCount: touchedIngredientIds.length,
      sampleIngredientIds,
    },
    computeAffectedRecipes: {
      candidateRecipeCount: affected.length,
      sampleRecipes: affected.slice(0, 8).map((r) => r.recipe_name),
    },
    marginImpactFiltering: {
      impactsComputed: impacts.size,
      passWouldBecomeAlert: passImpact,
      skipNoImpact,
      skipNoSellingPrice,
      skipLowDropAndCost: `${skipLowDropAndCost} (need drop>=${MARGIN_DROP_MIN} OR costUp>=${COST_UP_MIN})`,
      skipNoAffectedIngredients,
      skipSamples,
    },
    alertsEmitted: {
      recipeMarginDeteriorationCount: deteriorationAlerts.length,
      recipeMarginTitles: deteriorationAlerts.slice(0, 6).map((a) => a.title),
      libAlertsTotal: libAlerts.length,
      libAlertsByType: libAlerts.reduce(
        (acc, a) => {
          acc[a.type] = (acc[a.type] ?? 0) + 1;
          return acc;
        },
        {} as Record<string, number>,
      ),
    },
  };
}

async function main() {
  const data = await loadMarginData();
  const marginAlertPipeline = await diagnoseMarginAlertPipeline();

  const libAlerts = await buildMarginAlertsFromSupabase(supabase).catch(() => []);
  const local = marginAlertData.buildOperationalAlertItems(data);
  const lib = marginAlertData.convertLibMarginAlerts(libAlerts);
  const alerts = marginAlertData.finalizeOperationalAlertItems(local, lib, data);

  const alertKindCounts = alerts.reduce(
    (acc, a) => {
      acc[a.kind] = (acc[a.kind] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  const health = marginAlertData.buildOperationalHealthPanel(data, libAlerts);
  const synthesis = buildSynthesisViewModel({
    data,
    alerts,
    health,
    dateRange: "90",
  });

  const selectedWindowKey = mapDateRangeToWindowKey("90");
  const worsening = synthesis.operationalSynthesisGroups.recipeMarginMovements.worsening;
  const worseningByWindow = worsening.reduce(
    (acc, e) => {
      acc[e.window] = (acc[e.window] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  const report = {
    dataLoaded: {
      priceHistoryCount: data.priceHistory.length,
      recipeCount: data.recipes.length,
      ingredientCount: data.ingredients.length,
    },
    marginAlertPipeline,
    operationalAlerts: {
      total: alerts.length,
      byKind: alertKindCounts,
      recipe_below_target: alertKindCounts.recipe_below_target ?? 0,
      recipe_margin_deterioration: alertKindCounts.recipe_margin_deterioration ?? 0,
    },
    synthesis: {
      selectedWindowKey,
      recipeMarginWorseningCount: worsening.length,
      recipeMarginWorseningByWindow: worseningByWindow,
      ownerReview: {
        suppliersToWatchCount: synthesis.ownerReview.suppliersToWatch.length,
        opportunitiesCount: synthesis.ownerReview.opportunities.length,
        financialRisksCount: synthesis.ownerReview.financialRisks.length,
        affectedRecipesCount: synthesis.ownerReview.affectedRecipes.length,
      },
    },
  };

  console.log(JSON.stringify(report, null, 2));
}

await main();
