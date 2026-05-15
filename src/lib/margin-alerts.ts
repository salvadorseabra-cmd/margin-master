import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import {
  getRecentPriceChanges,
  getVolatileIngredients,
  type IngredientPriceHistoryRow,
  type VolatileIngredientSummary,
} from "@/lib/ingredient-price-history";
import {
  computeAffectedRecipes,
  computeRecipeMarginImpactsForRecipeIds,
  type AffectedRecipeSummary,
  type RecipeMarginImpact,
} from "@/lib/recipe-impact";

type AppSupabaseClient = SupabaseClient<Database>;

const COST_EPS = 1e-9;
const LOG_PREFIX = "[ingredient_price_history]";

function logAlertError(label: string, err: unknown): void {
  if (!err) return;
  const obj = err as { message?: string; code?: string };
  const message = obj?.message ?? (err instanceof Error ? err.message : String(err));
  const code = obj?.code ? ` code=${obj.code}` : "";
  console.error(`${LOG_PREFIX} ${label} failed: ${message}${code}`);
}

export type MarginImpactEstimate = {
  amountEur?: number;
  percentPoints?: number;
};

/** Machine-readable category for filtering or analytics. */
export type MarginAlertKind =
  | "ingredient_inflation_spike"
  | "recipe_margin_deterioration"
  | "supplier_inflation_trend"
  | "monthly_margin_loss"
  | "volatile_ingredient_pricing";

export type MarginAlert = {
  id: string;
  type: MarginAlertKind;
  severity: "high" | "medium" | "low";
  title: string;
  detail: string;
  /** Primary recipe label for compact UI (optional). */
  recipe?: string;
  metricLine: string;
  time: string;
  whatChanged: string;
  affectedRecipes: Array<{ id: string; name: string }>;
  estimatedMarginImpact: string | MarginImpactEstimate;
  recommendedAction: string;
};

export type BuildMarginAlertsOptions = {
  /** Window for spike detection vs older history (default 14). */
  spikeWindowDays?: number;
  /** History pulled for baselines and supplier trends (default 90). */
  historyPullDays?: number;
  /** Recipes touched by price history in this window get modeled (default 14). */
  recipeImpactWindowDays?: number;
  /** Supplier grouping window (default 30). */
  supplierWindowDays?: number;
  /** Monthly loss aggregation window (default 30). */
  monthlyLossWindowDays?: number;
  maxIngredientSpikeAlerts?: number;
  maxRecipeDeteriorationAlerts?: number;
  maxSupplierTrendAlerts?: number;
  maxRecipesForBulkImpact?: number;
};

const DEFAULTS: Required<BuildMarginAlertsOptions> = {
  spikeWindowDays: 14,
  historyPullDays: 90,
  recipeImpactWindowDays: 14,
  supplierWindowDays: 30,
  monthlyLossWindowDays: 30,
  maxIngredientSpikeAlerts: 6,
  maxRecipeDeteriorationAlerts: 10,
  maxSupplierTrendAlerts: 4,
  maxRecipesForBulkImpact: 60,
};

function severityOrder(s: MarginAlert["severity"]): number {
  return s === "high" ? 0 : s === "medium" ? 1 : 2;
}

function mergeOpts(opts?: BuildMarginAlertsOptions): Required<BuildMarginAlertsOptions> {
  return { ...DEFAULTS, ...opts };
}

function sinceIso(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

function effectiveDeltaPercent(row: IngredientPriceHistoryRow): number {
  const dp = row.delta_percent;
  if (dp != null && Number.isFinite(dp)) return dp;
  const prev = row.previous_price == null ? null : Number(row.previous_price);
  const d = row.delta == null ? null : Number(row.delta);
  if (prev != null && prev > COST_EPS && d != null && Number.isFinite(d)) return (d / prev) * 100;
  return 0;
}

function positivePriceMove(row: IngredientPriceHistoryRow): boolean {
  const d = row.delta == null ? null : Number(row.delta);
  if (d != null && Number.isFinite(d) && d > COST_EPS) return true;
  const prev = row.previous_price == null ? null : Number(row.previous_price);
  const next = Number(row.new_price);
  if (prev != null && Number.isFinite(prev) && Number.isFinite(next) && next > prev + COST_EPS) return true;
  return false;
}

function timeLabel(days: number): string {
  return days === 1 ? "Last 24 hours" : `Last ${days} days`;
}

async function fetchRecipesByIngredientIds(
  client: AppSupabaseClient,
  ingredientIds: string[],
): Promise<Map<string, { id: string; name: string }[]>> {
  const out = new Map<string, { id: string; name: string }[]>();
  if (!ingredientIds.length) return out;

  const { data: ri, error: riErr } = await client
    .from("recipe_ingredients")
    .select("recipe_id,ingredient_id")
    .in("ingredient_id", ingredientIds);
  if (riErr) throw riErr;

  const recipeIds = [...new Set((ri ?? []).map((r) => r.recipe_id))];
  if (!recipeIds.length) return out;

  const { data: recipes, error: rErr } = await client.from("recipes").select("id,name").in("id", recipeIds);
  if (rErr) throw rErr;
  const nameByRecipe = new Map((recipes ?? []).map((r) => [r.id, r.name]));

  for (const id of ingredientIds) {
    out.set(id, []);
  }
  for (const row of ri ?? []) {
    const nm = nameByRecipe.get(row.recipe_id);
    if (!nm) continue;
    const list = out.get(row.ingredient_id) ?? [];
    if (!list.some((x) => x.id === row.recipe_id)) {
      list.push({ id: row.recipe_id, name: nm });
    }
    out.set(row.ingredient_id, list);
  }
  return out;
}

async function fetchIngredientNames(
  client: AppSupabaseClient,
  ids: string[],
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (!ids.length) return map;
  const { data, error } = await client.from("ingredients").select("id,name").in("id", ids);
  if (error) throw error;
  for (const r of data ?? []) map.set(r.id, r.name);
  return map;
}

/** Largest modeled increase in food cost per portion (€). */
function portionCostIncrease(impact: RecipeMarginImpact): number {
  return Math.max(0, impact.newFoodCost - impact.previousFoodCost);
}

function marginDropPoints(impact: RecipeMarginImpact): number {
  const before = impact.marginBeforePct;
  const after = impact.marginAfterPct;
  if (before == null || after == null || !Number.isFinite(before) || !Number.isFinite(after)) return 0;
  return Math.max(0, before - after);
}

export async function generateIngredientInflationSpikeAlerts(
  client: AppSupabaseClient,
  opts?: BuildMarginAlertsOptions,
  historyPreloaded?: IngredientPriceHistoryRow[],
): Promise<MarginAlert[]> {
  try {
    return await generateIngredientInflationSpikeAlertsInner(client, opts, historyPreloaded);
  } catch (err) {
    logAlertError("generateIngredientInflationSpikeAlerts", err);
    return [];
  }
}

async function generateIngredientInflationSpikeAlertsInner(
  client: AppSupabaseClient,
  opts?: BuildMarginAlertsOptions,
  historyPreloaded?: IngredientPriceHistoryRow[],
): Promise<MarginAlert[]> {
  const o = mergeOpts(opts);
  const history =
    historyPreloaded ?? (await getRecentPriceChanges(client, o.historyPullDays));
  const spikeSince = sinceIso(o.spikeWindowDays);
  const recentRows = history.filter((h) => h.created_at >= spikeSince && positivePriceMove(h));
  if (!recentRows.length) return [];

  const olderRows = history.filter((h) => h.created_at < spikeSince);
  const baselineByIngredient = new Map<string, number[]>();
  for (const row of olderRows) {
    const eff = effectiveDeltaPercent(row);
    if (!positivePriceMove(row) || eff <= 0) continue;
    const list = baselineByIngredient.get(row.ingredient_id) ?? [];
    list.push(eff);
    baselineByIngredient.set(row.ingredient_id, list);
  }

  const recentMaxByIngredient = new Map<string, { pct: number; row: IngredientPriceHistoryRow }>();
  for (const row of recentRows) {
    const eff = effectiveDeltaPercent(row);
    const prev = recentMaxByIngredient.get(row.ingredient_id);
    if (!prev || eff > prev.pct) recentMaxByIngredient.set(row.ingredient_id, { pct: eff, row });
  }

  const scored: { id: string; pct: number; row: IngredientPriceHistoryRow }[] = [];
  for (const [ingredientId, { pct, row }] of recentMaxByIngredient) {
    const samples = baselineByIngredient.get(ingredientId) ?? [];
    const baselineMed =
      samples.length === 0
        ? 0
        : [...samples].sort((a, b) => a - b)[Math.floor(samples.length / 2)] ?? 0;
    const spikeVsBaseline = pct - baselineMed;
    const strongAbsolute = pct >= 18 || Number(row.delta ?? 0) >= 0.75;
    const strongVsHistory = samples.length >= 2 && spikeVsBaseline >= 10;
    const moderate = pct >= 12 && (samples.length === 0 || spikeVsBaseline >= 5);
    if (strongAbsolute || strongVsHistory || moderate) {
      scored.push({ id: ingredientId, pct, row });
    }
  }

  scored.sort((a, b) => b.pct - a.pct);
  const top = scored.slice(0, o.maxIngredientSpikeAlerts);
  if (!top.length) return [];

  const recipesMap = await fetchRecipesByIngredientIds(
    client,
    top.map((t) => t.id),
  );
  const nameMap = await fetchIngredientNames(client, top.map((t) => t.id));

  const alerts: MarginAlert[] = [];
  for (const { id, pct, row } of top) {
    const ingName = nameMap.get(id) ?? row.ingredient_name ?? "Ingredient";
    const affected = (recipesMap.get(id) ?? []).slice(0, 8);
    const dp = row.delta_percent;
    const pctLabel =
      dp != null && Number.isFinite(dp)
        ? `${dp.toFixed(1)}%`
        : `≈${pct.toFixed(1)}% (from unit Δ)`;
    const severity: MarginAlert["severity"] =
      pct >= 28 || Number(row.delta ?? 0) >= 1.5 ? "high" : pct >= 18 ? "medium" : "low";
    const eurDelta = row.delta != null && Number.isFinite(Number(row.delta)) ? Number(row.delta) : undefined;

    alerts.push({
      id: `ingredient-spike-${id}`,
      type: "ingredient_inflation_spike",
      severity,
      title: `Invoice price jump — ${ingName}`,
      detail: `${ingName} moved up about ${pctLabel} on a recent invoice sync vs your prior unit cost${
        affected.length ? `, used in ${affected.length} recipe${affected.length > 1 ? "s" : ""}.` : "."
      }`,
      recipe: affected[0]?.name,
      metricLine: `+${pctLabel} · unit €${Number(row.new_price).toFixed(2)}`,
      time: timeLabel(o.spikeWindowDays),
      whatChanged: `Unit purchase price increased (${pctLabel}) within ${o.spikeWindowDays}d.`,
      affectedRecipes: affected,
      estimatedMarginImpact: {
        percentPoints: pct > 0 ? Math.min(pct * 0.15, 8) : undefined,
        amountEur: eurDelta,
      },
      recommendedAction:
        "Re-quote the supplier line, rebalance recipes that over-use this SKU, or refresh menu pricing where the dish margin no longer clears your target.",
    });
  }
  return alerts;
}

export async function generateRecipeMarginDeteriorationAlerts(
  client: AppSupabaseClient,
  opts?: BuildMarginAlertsOptions,
  affectedPreloaded?: AffectedRecipeSummary[],
): Promise<MarginAlert[]> {
  try {
    return await generateRecipeMarginDeteriorationAlertsInner(client, opts, affectedPreloaded);
  } catch (err) {
    logAlertError("generateRecipeMarginDeteriorationAlerts", err);
    return [];
  }
}

async function generateRecipeMarginDeteriorationAlertsInner(
  client: AppSupabaseClient,
  opts?: BuildMarginAlertsOptions,
  affectedPreloaded?: AffectedRecipeSummary[],
): Promise<MarginAlert[]> {
  const o = mergeOpts(opts);
  const affected =
    affectedPreloaded ??
    (await computeAffectedRecipes(client, { windowDays: o.recipeImpactWindowDays }));
  if (!affected.length) return [];

  const recipeIds = affected.map((a) => a.recipe_id).slice(0, o.maxRecipesForBulkImpact);
  const impacts = await computeRecipeMarginImpactsForRecipeIds(client, recipeIds);

  const items: { impact: RecipeMarginImpact; drop: number; costUp: number }[] = [];
  for (const a of affected) {
    const impact = impacts.get(a.recipe_id);
    if (!impact) continue;
    const sale = Number(impact.recipe.selling_price) || 0;
    if (sale <= 0) continue;
    const drop = marginDropPoints(impact);
    const costUp = portionCostIncrease(impact);
    if (drop < 1.2 && costUp < 0.35) continue;
    if (impact.affectedIngredients.length === 0) continue;
    items.push({ impact, drop, costUp });
  }

  items.sort((x, y) => y.drop - x.drop || y.costUp - x.costUp);
  const picked = items.slice(0, o.maxRecipeDeteriorationAlerts);

  return picked.map(({ impact, drop, costUp }) => {
    const before = impact.marginBeforePct;
    const after = impact.marginAfterPct;
    const sev: MarginAlert["severity"] =
      drop >= 4 || costUp >= 1.2 ? "high" : drop >= 2.2 || costUp >= 0.55 ? "medium" : "low";
    const names = impact.affectedIngredients.map((i) => i.name).slice(0, 4);
    return {
      id: `recipe-margin-${impact.recipe.id}`,
      type: "recipe_margin_deterioration",
      severity: sev,
      title: `Modeled margin slip — ${impact.recipe.name}`,
      detail: `After the latest invoice-driven unit costs, modeled gross margin ${
        before != null && after != null
          ? `fell from about ${before.toFixed(1)}% to ${after.toFixed(1)}%`
          : "shifted on this recipe"
      } (food cost €${impact.previousFoodCost.toFixed(2)} → €${impact.newFoodCost.toFixed(2)} per portion). Drivers: ${names.join(", ")}${
        impact.affectedIngredients.length > names.length ? "…" : ""
      }.`,
      recipe: impact.recipe.name,
      metricLine: `−${drop.toFixed(1)} pts · +€${costUp.toFixed(2)} food cost`,
      time: timeLabel(o.recipeImpactWindowDays),
      whatChanged: "Recipe food cost rose versus the last captured invoice prices for one or more lines.",
      affectedRecipes: [{ id: impact.recipe.id, name: impact.recipe.name }],
      estimatedMarginImpact: { percentPoints: drop, amountEur: costUp },
      recommendedAction:
        "Adjust portion sizes, substitute where possible, negotiate the underlying supplier lines, or update the menu price for this dish.",
    };
  });
}

type SupplierAgg = {
  supplier: string;
  rows: IngredientPriceHistoryRow[];
};

export async function generateSupplierInflationTrendAlerts(
  client: AppSupabaseClient,
  opts?: BuildMarginAlertsOptions,
  historyPreloaded?: IngredientPriceHistoryRow[],
): Promise<MarginAlert[]> {
  try {
    return await generateSupplierInflationTrendAlertsInner(client, opts, historyPreloaded);
  } catch (err) {
    logAlertError("generateSupplierInflationTrendAlerts", err);
    return [];
  }
}

async function generateSupplierInflationTrendAlertsInner(
  client: AppSupabaseClient,
  opts?: BuildMarginAlertsOptions,
  historyPreloaded?: IngredientPriceHistoryRow[],
): Promise<MarginAlert[]> {
  const o = mergeOpts(opts);
  const history =
    historyPreloaded ??
    (await getRecentPriceChanges(client, Math.max(o.supplierWindowDays, o.historyPullDays)));
  const since = sinceIso(o.supplierWindowDays);
  const windowRows = history.filter((h) => h.created_at >= since && h.supplier_name && h.supplier_name.trim());
  if (windowRows.length < 4) return [];

  const bySupplier = new Map<string, IngredientPriceHistoryRow[]>();
  for (const row of windowRows) {
    const s = row.supplier_name!.trim();
    const list = bySupplier.get(s) ?? [];
    list.push(row);
    bySupplier.set(s, list);
  }

  const scored: SupplierAgg[] = [];
  for (const [supplier, rows] of bySupplier) {
    if (rows.length < 4) continue;
    const sorted = [...rows].sort((a, b) => a.created_at.localeCompare(b.created_at));
    const mid = Math.floor(sorted.length / 2);
    const early = sorted.slice(0, mid);
    const late = sorted.slice(mid);
    const avg = (arr: IngredientPriceHistoryRow[]) =>
      arr.length ? arr.reduce((s, r) => s + Number(r.new_price), 0) / arr.length : 0;
    const earlyAvg = avg(early);
    const lateAvg = avg(late);
    const increases = rows.filter((r) => Number(r.delta ?? 0) > COST_EPS).length;
    const riseRatio = increases / rows.length;
    const priceDrift = earlyAvg > COST_EPS ? (lateAvg - earlyAvg) / earlyAvg : 0;
    if (priceDrift > 0.025 || riseRatio >= 0.5) {
      scored.push({ supplier, rows });
    }
  }

  scored.sort((a, b) => b.rows.length - a.rows.length);
  const top = scored.slice(0, o.maxSupplierTrendAlerts);

  const alerts: MarginAlert[] = [];
  for (const { supplier, rows } of top) {
    const sorted = [...rows].sort((a, b) => a.created_at.localeCompare(b.created_at));
    const mid = Math.floor(sorted.length / 2);
    const earlyAvg = sorted.slice(0, mid).reduce((s, r) => s + Number(r.new_price), 0) / Math.max(1, mid);
    const lateAvg =
      sorted.slice(mid).reduce((s, r) => s + Number(r.new_price), 0) / Math.max(1, sorted.length - mid);
    const driftPct = earlyAvg > COST_EPS ? ((lateAvg - earlyAvg) / earlyAvg) * 100 : 0;
    const increases = rows.filter((r) => Number(r.delta ?? 0) > COST_EPS).length;
    const ingredientTouches = new Set(rows.map((r) => r.ingredient_id)).size;
    const sev: MarginAlert["severity"] =
      driftPct > 8 || increases / rows.length >= 0.65 ? "high" : driftPct > 4 ? "medium" : "low";

    const touchedIds = [...new Set(rows.map((r) => r.ingredient_id))];
    const recipesMap = await fetchRecipesByIngredientIds(client, touchedIds);
    const mergedRecipes = [...recipesMap.values()].flat();
    const uniq = new Map<string, { id: string; name: string }>();
    for (const r of mergedRecipes) uniq.set(r.id, r);
    const affectedRecipes = [...uniq.values()].slice(0, 10);

    alerts.push({
      id: `supplier-trend-${supplier.replace(/\s+/g, "-").slice(0, 48)}`,
      type: "supplier_inflation_trend",
      severity: sev,
      title: `Supplier pricing trend — ${supplier}`,
      detail: `Across ${rows.length} invoice price rows in the last ${o.supplierWindowDays} days, average logged unit prices moved about ${driftPct >= 0 ? "+" : ""}${driftPct.toFixed(
        1,
      )}% from earlier to later updates, with ${increases} increases on ${ingredientTouches} SKUs.`,
      metricLine: `${increases}/${rows.length} rows up · late avg €${lateAvg.toFixed(2)}`,
      time: timeLabel(o.supplierWindowDays),
      whatChanged: "Repeated positive unit-price updates grouped under this supplier name.",
      affectedRecipes,
      estimatedMarginImpact: { percentPoints: Math.min(6, Math.abs(driftPct) * 0.4) },
      recommendedAction:
        "Compare basket pricing with alternate suppliers, consolidate volume on negotiated lines, and pass selective menu updates where dishes rely heavily on this supplier.",
    });
  }
  return alerts;
}

export async function generateMonthlyMarginLossAlert(
  client: AppSupabaseClient,
  opts?: BuildMarginAlertsOptions,
  historyPreloaded?: IngredientPriceHistoryRow[],
): Promise<MarginAlert[]> {
  try {
    return await generateMonthlyMarginLossAlertInner(client, opts, historyPreloaded);
  } catch (err) {
    logAlertError("generateMonthlyMarginLossAlert", err);
    return [];
  }
}

async function generateMonthlyMarginLossAlertInner(
  client: AppSupabaseClient,
  opts?: BuildMarginAlertsOptions,
  historyPreloaded?: IngredientPriceHistoryRow[],
): Promise<MarginAlert[]> {
  const o = mergeOpts(opts);
  const since = sinceIso(o.monthlyLossWindowDays);
  let touchedIds: string[];
  if (historyPreloaded) {
    touchedIds = [
      ...new Set(
        historyPreloaded.filter((h) => h.created_at >= since).map((h) => h.ingredient_id),
      ),
    ];
  } else {
    const { data: hist, error: hErr } = await client
      .from("ingredient_price_history")
      .select("ingredient_id")
      .gte("created_at", since);
    if (hErr) {
      logAlertError("generateMonthlyMarginLossAlert: fetch ingredient ids", hErr);
      return [];
    }
    touchedIds = [...new Set((hist ?? []).map((h) => h.ingredient_id))];
  }
  if (!touchedIds.length) return [];

  const { data: ri, error: riErr } = await client
    .from("recipe_ingredients")
    .select("recipe_id")
    .in("ingredient_id", touchedIds);
  if (riErr) throw riErr;
  const recipeIds = [...new Set((ri ?? []).map((r) => r.recipe_id))].slice(0, o.maxRecipesForBulkImpact);
  if (!recipeIds.length) return [];

  const impacts = await computeRecipeMarginImpactsForRecipeIds(client, recipeIds);
  const portions: { id: string; name: string; delta: number }[] = [];
  let total = 0;
  for (const [rid, impact] of impacts) {
    const d = portionCostIncrease(impact);
    if (d < COST_EPS) continue;
    total += d;
    portions.push({ id: rid, name: impact.recipe.name, delta: d });
  }
  if (total < 0.08) return [];

  portions.sort((a, b) => b.delta - a.delta);
  const affectedRecipes = portions.slice(0, 10).map((p) => ({ id: p.id, name: p.name }));

  return [
    {
      id: "portfolio-monthly-margin-loss",
      type: "monthly_margin_loss",
      severity: total >= 5 ? "high" : total >= 2 ? "medium" : "low",
      title: `Estimated margin erosion (last ${o.monthlyLossWindowDays} days)`,
      detail: `Summing modeled per-portion food-cost increases from invoice-driven ingredient updates, active recipes move by about €${total.toFixed(
        2,
      )} per portion sold across the portfolio (approximation; does not include sales volume).`,
      metricLine: `≈ €${total.toFixed(2)} / portion across recipes`,
      time: timeLabel(o.monthlyLossWindowDays),
      whatChanged: "One or more ingredients captured higher unit costs from synced invoices within the monthly window.",
      affectedRecipes,
      estimatedMarginImpact: { amountEur: total },
      recommendedAction:
        "Prioritize repricing or reformulating the largest per-portion hits first, then work down the list; pair with supplier reviews for the underlying SKUs.",
    },
  ];
}

export async function generateVolatileIngredientAlerts(
  client: AppSupabaseClient,
  opts?: BuildMarginAlertsOptions,
  volatilePreloaded?: VolatileIngredientSummary[],
): Promise<MarginAlert[]> {
  try {
    return await generateVolatileIngredientAlertsInner(client, opts, volatilePreloaded);
  } catch (err) {
    logAlertError("generateVolatileIngredientAlerts", err);
    return [];
  }
}

async function generateVolatileIngredientAlertsInner(
  client: AppSupabaseClient,
  opts?: BuildMarginAlertsOptions,
  volatilePreloaded?: VolatileIngredientSummary[],
): Promise<MarginAlert[]> {
  void mergeOpts(opts);
  const volatile =
    volatilePreloaded ??
    (await getVolatileIngredients(client, { windowDays: 90, minChanges: 4, limit: 12 }));
  if (!volatile.length) return [];

  const names = await fetchIngredientNames(
    client,
    volatile.map((v) => v.ingredient_id),
  );
  const recipesMap = await fetchRecipesByIngredientIds(
    client,
    volatile.map((v) => v.ingredient_id),
  );

  const bits = volatile.slice(0, 8).map((v) => {
    const nm = names.get(v.ingredient_id) ?? "Ingredient";
    return `${nm} (${v.change_count} updates)`;
  });
  const mergedRecipes = [...recipesMap.values()].flat();
  const uniq = new Map<string, { id: string; name: string }>();
  for (const r of mergedRecipes) uniq.set(r.id, r);

  return [
    {
      id: "volatile-ingredients-basket",
      type: "volatile_ingredient_pricing",
      severity: volatile[0].change_count >= 10 ? "medium" : "low",
      title: "Frequently repriced ingredients",
      detail: `These SKUs saw many invoice price rows in the last 90 days — expect noise in food cost and margin until contracts stabilize: ${bits.join(
        "; ",
      )}.`,
      metricLine: `${volatile.length} volatile SKUs tracked`,
      time: "Last 90 days",
      whatChanged: "High frequency of price-history events per ingredient (heuristic volatility).",
      affectedRecipes: [...uniq.values()].slice(0, 12),
      estimatedMarginImpact: "Variable — frequent small moves compound across recipes.",
      recommendedAction:
        "Lock contracted prices where possible, add buffer on menu items that depend on these SKUs, or source secondary suppliers to cap upside swings.",
    },
  ];
}

/**
 * Fetches shared history, affected recipes, and volatility once, then runs all
 * generators in parallel (flat queries only; no nested PostgREST embeds).
 */
export async function buildMarginAlertsFromSupabase(
  client: AppSupabaseClient,
  opts?: BuildMarginAlertsOptions,
): Promise<MarginAlert[]> {
  const o = mergeOpts(opts);
  const [historyPullResult, affectedRecipesResult, volatileSummariesResult] = await Promise.allSettled([
    getRecentPriceChanges(client, o.historyPullDays),
    computeAffectedRecipes(client, { windowDays: o.recipeImpactWindowDays }),
    getVolatileIngredients(client, { windowDays: 90, minChanges: 4, limit: 12 }),
  ]);

  const historyPull =
    historyPullResult.status === "fulfilled" ? historyPullResult.value : (logAlertError("buildMarginAlertsFromSupabase: history preload", historyPullResult.reason), [] as IngredientPriceHistoryRow[]);
  const affectedRecipes =
    affectedRecipesResult.status === "fulfilled"
      ? affectedRecipesResult.value
      : (logAlertError("buildMarginAlertsFromSupabase: affected recipes", affectedRecipesResult.reason), [] as AffectedRecipeSummary[]);
  const volatileSummaries =
    volatileSummariesResult.status === "fulfilled"
      ? volatileSummariesResult.value
      : (logAlertError("buildMarginAlertsFromSupabase: volatile summaries", volatileSummariesResult.reason), [] as VolatileIngredientSummary[]);

  const settled = await Promise.allSettled([
    generateIngredientInflationSpikeAlerts(client, opts, historyPull),
    generateRecipeMarginDeteriorationAlerts(client, opts, affectedRecipes),
    generateSupplierInflationTrendAlerts(client, opts, historyPull),
    generateMonthlyMarginLossAlert(client, opts, historyPull),
    generateVolatileIngredientAlerts(client, opts, volatileSummaries),
  ]);

  const out: MarginAlert[] = [];
  for (const r of settled) {
    if (r.status === "fulfilled") {
      out.push(...r.value);
    } else {
      logAlertError("buildMarginAlertsFromSupabase: generator", r.reason);
    }
  }
  out.sort((a, b) => {
    const s = severityOrder(a.severity) - severityOrder(b.severity);
    if (s !== 0) return s;
    return a.title.localeCompare(b.title);
  });
  return out;
}
