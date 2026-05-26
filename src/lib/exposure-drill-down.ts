import { formatCurrency, formatPercent } from "@/lib/display-format";
import { resolvedOperationalUnitCostEur } from "@/lib/ingredient-unit-cost";
import {
  getLatestHistoryByIngredient,
  getRecipeMetrics,
  getRecipeUsageByIngredient,
  RECENT_PRICE_DAYS,
  TARGET_MARGIN,
  type MarginAlertData,
  type MarginAlertItem,
  type MarginAlertSeverity,
  type PriceHistoryRecord,
  type RecipeRecord,
} from "@/lib/margin-alert-data";
import { logPricingAudit } from "@/lib/pricing-audit";
import {
  buildPortfolioCostExposure,
  buildSupplierIntelligence,
  estimateMonthlyModeledExposureEur,
  extractIngredientIdFromAlert,
  formatTenPercentSensitivityLine,
  inferCostCategory,
  type CostCategoryGroup,
  type CostExposureRow,
} from "@/lib/operational-intelligence-view";

export const PRICE_WINDOW_90_DAYS = 90;
export const PRICE_WINDOW_180_DAYS = 180;

export type PriceWindowStats = {
  windowDays: number;
  windowLabel: string;
  min: number | null;
  max: number | null;
  avg: number | null;
  minFormatted: string | null;
  maxFormatted: string | null;
  avgFormatted: string | null;
  sampleCount: number;
};

export type ExposureRecipeRow = {
  recipeId: string;
  recipeName: string;
  exposurePct: number;
  lineCostLabel: string | null;
  grossMarginLabel: string | null;
};

export type ExposureSupplierMovement = {
  ingredientId: string;
  ingredientName: string;
  supplier: string | null;
  changePct: number;
  latestPriceLabel: string;
  dateLabel: string;
};

export type ExposureSupplierComparison = {
  ingredientId: string;
  ingredientName: string;
  currentSupplier: string | null;
  currentPriceLabel: string;
  cheapestSupplier: string | null;
  cheapestPriceLabel: string;
  gapPct: number | null;
  gapLabel: string | null;
};

export type ExposureDrillDownSignal = {
  id: string;
  severity: MarginAlertSeverity;
  title: string;
  detail: string;
};

export type ExposureDrillDownRecommendation = {
  id: string;
  text: string;
};

export type CategoryExposureDrillDown = {
  kind: "category";
  group: CostCategoryGroup;
  label: string;
  sharePct: number;
  monthlyExposureEur: number;
  monthlyExposureLabel: string | null;
  sensitivityLine: string | null;
  topIngredients: Array<{
    ingredientId: string;
    name: string;
    sharePct: number;
    recipeCount: number;
    trendLabel: string | undefined;
  }>;
  dependentRecipes: ExposureRecipeRow[];
  supplierMovements: ExposureSupplierMovement[];
  marginSignals: ExposureDrillDownSignal[];
  supplierComparisons: ExposureSupplierComparison[];
  recommendations: ExposureDrillDownRecommendation[];
};

export type IngredientExposureDrillDown = {
  kind: "ingredient";
  ingredientId: string;
  ingredientName: string;
  category: CostCategoryGroup;
  costSharePct: number;
  recipeCount: number;
  affectedRecipes: ExposureRecipeRow[];
  recentMovement: ExposureSupplierMovement | null;
  currentPriceLabel: string | null;
  currentSupplier: string | null;
  supplierLow: { supplier: string; priceLabel: string; dateLabel: string } | null;
  supplierHigh: { supplier: string; priceLabel: string; dateLabel: string } | null;
  stats90d: PriceWindowStats;
  stats180d: PriceWindowStats;
  estimatedMonthlyImpact: string | null;
  marginSensitivityLine: string | null;
  competitivenessCopy: string | null;
  betterSupplierLine: string | null;
  supplierStabilityLine: string | null;
  marginSignals: ExposureDrillDownSignal[];
  recommendations: ExposureDrillDownRecommendation[];
};

export type ExposureDrillDownModel = CategoryExposureDrillDown | IngredientExposureDrillDown;

const ESTIMATED_COVERS_PER_MENU_RECIPE = 30;
const ESTIMATED_PORTFOLIO_COVERS = 120;

const CATEGORY_LABELS: Record<CostCategoryGroup, string> = {
  meat: "Meat",
  dairy: "Dairy",
  produce: "Produce",
  sauces: "Sauces",
  bakery: "Bakery",
  beverage: "Beverage",
  other: "Other",
};

const DRILL_DOWN_SIGNAL_KINDS = new Set<MarginAlertItem["kind"]>([
  "price_increase",
  "ingredient_inflation_spike",
  "recipe_below_target",
  "recipe_margin_deterioration",
  "supplier_trend",
  "volatile_pricing",
  "cost_concentration",
]);

function numberOrNull(value: number | null | undefined): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function effectiveUnitCost(ingredient: {
  current_price: number | null;
  purchase_quantity: number | null;
  cost_base_unit?: "g" | "ml" | "un" | null;
}): number {
  return resolvedOperationalUnitCostEur(ingredient) ?? 0;
}

function getHistoryPercent(row: PriceHistoryRecord): number {
  const explicit = numberOrNull(row.delta_percent);
  if (explicit !== null) return explicit;
  const current = numberOrNull(row.new_price);
  const previous = numberOrNull(row.previous_price);
  if (current === null || previous === null || previous <= 0) return 0;
  return ((current - previous) / previous) * 100;
}

function formatPriceUnit(price: number, unit: string): string {
  return `${formatCurrency(price)} / ${unit}`;
}

function formatEstimatedMonthlyEur(amount: number | null): string | null {
  if (amount == null || amount < 1) return null;
  return `Est. ${formatCurrency(amount)}/mo`;
}

function parseMovementPercent(alert: MarginAlertItem): number | null {
  const movement = alert.meta.find((m) => m.label === "Movement")?.value;
  const match = movement?.match(/([\d.]+)/);
  if (!match) return null;
  const n = Number(match[1]);
  return Number.isFinite(n) ? n : null;
}

function estimatePriceIncreaseMonthlyEur(
  data: MarginAlertData,
  ingredientId: string,
  pct: number,
): number | null {
  if (pct <= 0) return null;
  let total = 0;
  for (const recipe of data.recipes) {
    if (recipe.type === "prep") continue;
    let recipeLineCost = 0;
    for (const line of recipe.recipe_ingredients ?? []) {
      if (line.ingredient_id !== ingredientId || !line.ingredients) continue;
      recipeLineCost += Number(line.quantity ?? 0) * effectiveUnitCost(line.ingredients);
    }
    if (recipeLineCost > 0) {
      total += recipeLineCost * (pct / 100) * ESTIMATED_COVERS_PER_MENU_RECIPE;
    }
  }
  if (total < 1) return null;
  return Math.round(total);
}

function rowsWithinDays(rows: PriceHistoryRecord[], days: number, now = Date.now()): PriceHistoryRecord[] {
  const cutoff = now - days * 86_400_000;
  return rows.filter((row) => {
    const ts = new Date(row.created_at).getTime();
    return Number.isFinite(ts) && ts >= cutoff;
  });
}

/** Min / max / avg unit prices from history `new_price` within a day window. */
export function computePriceWindowStats(
  rows: readonly PriceHistoryRecord[],
  windowDays: number,
  unit = "unit",
  now = Date.now(),
): PriceWindowStats {
  const windowLabel = windowDays === PRICE_WINDOW_90_DAYS ? "3 mo" : windowDays === PRICE_WINDOW_180_DAYS ? "6 mo" : `${windowDays}d`;
  const inWindow = rowsWithinDays([...rows], windowDays, now);
  const prices = inWindow
    .map((row) => numberOrNull(row.new_price))
    .filter((p): p is number => p != null && p > 0);

  if (prices.length === 0) {
    return {
      windowDays,
      windowLabel,
      min: null,
      max: null,
      avg: null,
      minFormatted: null,
      maxFormatted: null,
      avgFormatted: null,
      sampleCount: 0,
    };
  }

  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const avg = prices.reduce((s, p) => s + p, 0) / prices.length;

  return {
    windowDays,
    windowLabel,
    min,
    max,
    avg,
    minFormatted: formatPriceUnit(min, unit),
    maxFormatted: formatPriceUnit(max, unit),
    avgFormatted: formatPriceUnit(avg, unit),
    sampleCount: prices.length,
  };
}

function ingredientIdsInCategory(
  data: MarginAlertData,
  category: CostCategoryGroup,
  exposureRows: CostExposureRow[],
): Set<string> {
  const ids = new Set<string>();
  for (const row of exposureRows) {
    if (row.category === category) ids.add(row.ingredientId);
  }
  for (const ing of data.ingredients) {
    if (inferCostCategory(ing.name ?? "") === category) ids.add(ing.id);
  }
  return ids;
}

function recipeUsesCategoryIngredient(recipe: RecipeRecord, categoryIds: Set<string>): boolean {
  for (const line of recipe.recipe_ingredients ?? []) {
    if (line.ingredient_id && categoryIds.has(line.ingredient_id)) return true;
  }
  return false;
}

function buildRecipeExposureForIngredient(
  data: MarginAlertData,
  ingredientId: string,
  limit = 8,
): ExposureRecipeRow[] {
  const metrics = getRecipeMetrics(data.recipes).filter((m) => m.recipe.type !== "prep");
  const rows: ExposureRecipeRow[] = [];

  for (const metric of metrics) {
    const line = metric.recipe.recipe_ingredients?.find((l) => l.ingredient_id === ingredientId);
    if (!line?.ingredients) continue;
    const qty = Number(line.quantity ?? 0);
    const lineCost = qty * effectiveUnitCost(line.ingredients);
    const exposurePct = metric.foodCost > 0 ? (lineCost / metric.foodCost) * 100 : 0;
    rows.push({
      recipeId: metric.recipe.id,
      recipeName: metric.recipe.name,
      exposurePct,
      lineCostLabel: lineCost > 0 ? `${formatCurrency(lineCost)}/portion` : null,
      grossMarginLabel:
        metric.grossMargin != null ? `${formatPercent(Math.round(metric.grossMargin))} margin` : null,
    });
  }

  return rows.sort((a, b) => b.exposurePct - a.exposurePct).slice(0, limit);
}

function buildCategoryDependentRecipes(
  data: MarginAlertData,
  categoryIds: Set<string>,
  limit = 6,
): ExposureRecipeRow[] {
  const metrics = getRecipeMetrics(data.recipes).filter(
    (m) => m.recipe.type !== "prep" && recipeUsesCategoryIngredient(m.recipe, categoryIds),
  );

  return metrics
    .map((metric) => {
      let categoryLineCost = 0;
      for (const line of metric.recipe.recipe_ingredients ?? []) {
        if (!line.ingredient_id || !categoryIds.has(line.ingredient_id) || !line.ingredients) continue;
        categoryLineCost += Number(line.quantity ?? 0) * effectiveUnitCost(line.ingredients);
      }
      const exposurePct = metric.foodCost > 0 ? (categoryLineCost / metric.foodCost) * 100 : 0;
      return {
        recipeId: metric.recipe.id,
        recipeName: metric.recipe.name,
        exposurePct,
        lineCostLabel: categoryLineCost > 0 ? `${formatCurrency(categoryLineCost)}/portion` : null,
        grossMarginLabel:
          metric.grossMargin != null
            ? metric.grossMargin < TARGET_MARGIN
              ? `${formatPercent(Math.round(metric.grossMargin))} · below target`
              : `${formatPercent(Math.round(metric.grossMargin))} margin`
            : null,
      };
    })
    .sort((a, b) => b.exposurePct - a.exposurePct)
    .slice(0, limit);
}

function buildSupplierMovementsForIngredients(
  data: MarginAlertData,
  ingredientIds: Set<string>,
  limit = 6,
): ExposureSupplierMovement[] {
  const ingredientById = new Map(data.ingredients.map((i) => [i.id, i]));
  const cutoff = Date.now() - RECENT_PRICE_DAYS * 86_400_000;
  const latest = getLatestHistoryByIngredient(data.priceHistory);

  return latest
    .filter((row) => ingredientIds.has(row.ingredient_id))
    .filter((row) => new Date(row.created_at).getTime() >= cutoff)
    .map((row) => {
      const ingredient = ingredientById.get(row.ingredient_id);
      const pct = getHistoryPercent(row);
      const unit =
        row.ingredient_unit?.trim() ||
        ingredient?.base_unit?.trim() ||
        ingredient?.unit?.trim() ||
        "unit";
      const price = numberOrNull(row.new_price) ?? 0;
      return {
        ingredientId: row.ingredient_id,
        ingredientName: ingredient?.name?.trim() || row.ingredient_name?.trim() || "Ingredient",
        supplier: row.supplier_name?.trim() || null,
        changePct: pct,
        latestPriceLabel: formatPriceUnit(price, unit),
        dateLabel: new Date(row.created_at).toLocaleDateString(),
      };
    })
    .filter((row) => Math.abs(row.changePct) >= 0.5)
    .sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct))
    .slice(0, limit);
}

function buildSupplierComparisons(
  data: MarginAlertData,
  ingredientIds: Iterable<string>,
  windowDays = PRICE_WINDOW_90_DAYS,
  limit = 5,
): ExposureSupplierComparison[] {
  const ingredientById = new Map(data.ingredients.map((i) => [i.id, i]));
  const comparisons: ExposureSupplierComparison[] = [];

  for (const ingredientId of ingredientIds) {
    const ingredient = ingredientById.get(ingredientId);
    if (!ingredient) continue;

    const history = rowsWithinDays(
      data.priceHistory.filter((r) => r.ingredient_id === ingredientId),
      windowDays,
    );
    if (history.length === 0) continue;

    const unit =
      history[0]?.ingredient_unit?.trim() ||
      ingredient.base_unit?.trim() ||
      ingredient.unit?.trim() ||
      "unit";

    let cheapestPrice: number | null = null;
    let cheapestSupplier: string | null = null;
    for (const row of history) {
      const price = numberOrNull(row.new_price);
      if (price == null || price <= 0) continue;
      if (cheapestPrice == null || price < cheapestPrice) {
        cheapestPrice = price;
        cheapestSupplier = row.supplier_name?.trim() || null;
      }
    }

    const currentUnit = effectiveUnitCost(ingredient);
    if (cheapestPrice == null || currentUnit <= 0) continue;

    const latestRow = getLatestHistoryByIngredient(history).find(
      (r) => r.ingredient_id === ingredientId,
    );
    const currentSupplier = latestRow?.supplier_name?.trim() || null;
    const gapPct =
      cheapestPrice > 0 && currentUnit > cheapestPrice
        ? ((currentUnit - cheapestPrice) / cheapestPrice) * 100
        : null;

    if (gapPct == null || gapPct < 1) continue;

    comparisons.push({
      ingredientId,
      ingredientName: ingredient.name?.trim() || "Ingredient",
      currentSupplier,
      currentPriceLabel: formatPriceUnit(currentUnit, unit),
      cheapestSupplier,
      cheapestPriceLabel: formatPriceUnit(cheapestPrice, unit),
      gapPct: Math.round(gapPct),
      gapLabel: `+${Math.round(gapPct)}% vs recent lowest`,
    });
  }

  return comparisons.sort((a, b) => (b.gapPct ?? 0) - (a.gapPct ?? 0)).slice(0, limit);
}

function recipeAlertUsesIngredient(
  alert: MarginAlertItem,
  ingredientId: string,
  data: MarginAlertData,
): boolean {
  if (alert.kind !== "recipe_below_target" && alert.kind !== "recipe_margin_deterioration") {
    return extractIngredientIdFromAlert(alert) === ingredientId;
  }
  const recipeId = alert.id.replace(/^recipe-margin-/, "");
  const recipe = data.recipes.find((r) => r.id === recipeId);
  if (!recipe) return false;
  return (recipe.recipe_ingredients ?? []).some((line) => line.ingredient_id === ingredientId);
}

function collectDrillDownSignals(
  alerts: MarginAlertItem[],
  options: {
    ingredientIds?: Set<string>;
    ingredientId?: string;
    data: MarginAlertData;
    homepageAlertIds?: Set<string>;
    limit?: number;
  },
): ExposureDrillDownSignal[] {
  const limit = options.limit ?? 4;
  const seen = new Set<string>();
  const signals: ExposureDrillDownSignal[] = [];

  for (const alert of alerts) {
    if (!DRILL_DOWN_SIGNAL_KINDS.has(alert.kind)) continue;
    if (alert.severity === "positive" || alert.severity === "info") continue;
    if (options.homepageAlertIds?.has(alert.id)) continue;

    let matches = false;
    if (options.ingredientId) {
      matches = recipeAlertUsesIngredient(alert, options.ingredientId, options.data);
    } else if (options.ingredientIds) {
      const ingId = extractIngredientIdFromAlert(alert);
      if (ingId && options.ingredientIds.has(ingId)) {
        matches = true;
      } else if (
        alert.kind === "recipe_below_target" ||
        alert.kind === "recipe_margin_deterioration"
      ) {
        const recipeId = alert.id.replace(/^recipe-margin-/, "");
        const recipe = options.data.recipes.find((r) => r.id === recipeId);
        matches =
          !!recipe &&
          (recipe.recipe_ingredients ?? []).some(
            (line) => line.ingredient_id && options.ingredientIds!.has(line.ingredient_id),
          );
      }
    }

    if (!matches) continue;

    const key = extractIngredientIdFromAlert(alert) ?? alert.id;
    if (seen.has(key)) continue;
    seen.add(key);

    const detail =
      alert.meta.find((m) => m.label === "Movement")?.value ??
      alert.meta.find((m) => m.label === "Below target")?.value ??
      alert.context.split(".")[0]?.trim() ??
      alert.context;

    signals.push({
      id: `drill-${alert.id}`,
      severity: alert.severity,
      title: alert.title.replace(/\.$/, ""),
      detail: detail.slice(0, 140),
    });

    if (signals.length >= limit) break;
  }

  return signals;
}

function recommendationFromAlert(alert: MarginAlertItem): string {
  const ingredient = alert.title
    .replace(/\s+cost moved up$/i, "")
    .replace(/\s+spike$/i, "")
    .trim();
  switch (alert.kind) {
    case "price_increase":
    case "ingredient_inflation_spike":
      return `Re-quote ${ingredient} — invoice trend is lifting menu food cost.`;
    case "recipe_below_target":
    case "recipe_margin_deterioration":
      return alert.suggestedAction.split(".")[0]?.trim() || "Review recipe price or portions.";
    case "supplier_trend":
      return "Challenge supplier basket before the next menu cycle.";
    case "volatile_pricing":
      return `Lock or buffer ${ingredient} until invoices stabilize.`;
    case "cost_concentration":
      return alert.suggestedAction.split(".")[0]?.trim() || "Trim dominant portion on affected recipe.";
    default:
      return alert.suggestedAction.split(".")[0]?.trim() || "Review linked costing.";
  }
}

function buildRecommendationsFromAlerts(
  alerts: MarginAlertItem[],
  filter: (alert: MarginAlertItem) => boolean,
  limit = 3,
): ExposureDrillDownRecommendation[] {
  const recs: ExposureDrillDownRecommendation[] = [];
  const seen = new Set<string>();

  for (const alert of alerts) {
    if (!DRILL_DOWN_SIGNAL_KINDS.has(alert.kind)) continue;
    if (!filter(alert)) continue;
    const text = recommendationFromAlert(alert);
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    recs.push({ id: `rec-${alert.id}`, text });
    if (recs.length >= limit) break;
  }

  return recs;
}

function competitivenessCopy(
  currentUnit: number,
  stats90d: PriceWindowStats,
): string | null {
  const lowest = stats90d.min;
  if (lowest == null || lowest <= 0 || currentUnit <= lowest) return null;
  const pct = Math.round(((currentUnit - lowest) / lowest) * 100);
  if (pct < 1) return null;
  return `+${pct}% above recent lowest (${stats90d.windowLabel})`;
}

function supplierExtremesFromHistory(
  rows: PriceHistoryRecord[],
  ingredient?: { base_unit?: string | null; unit?: string | null },
): {
  low: { supplier: string; priceLabel: string; dateLabel: string } | null;
  high: { supplier: string; priceLabel: string; dateLabel: string } | null;
} {
  const unit =
    rows[0]?.ingredient_unit?.trim() ||
    ingredient?.base_unit?.trim() ||
    ingredient?.unit?.trim() ||
    "unit";

  let low: { supplier: string; price: number; date: string } | null = null;
  let high: { supplier: string; price: number; date: string } | null = null;

  for (const row of rows) {
    const price = numberOrNull(row.new_price);
    if (price == null || price <= 0) continue;
    const supplier = row.supplier_name?.trim() || "Unknown supplier";
    if (!low || price < low.price) low = { supplier, price, date: row.created_at };
    if (!high || price > high.price) high = { supplier, price, date: row.created_at };
  }

  return {
    low: low
      ? {
          supplier: low.supplier,
          priceLabel: formatPriceUnit(low.price, unit),
          dateLabel: new Date(low.date).toLocaleDateString(),
        }
      : null,
    high: high
      ? {
          supplier: high.supplier,
          priceLabel: formatPriceUnit(high.price, unit),
          dateLabel: new Date(high.date).toLocaleDateString(),
        }
      : null,
  };
}

export function buildCategoryExposureDrillDown(input: {
  data: MarginAlertData;
  alerts: MarginAlertItem[];
  category: CostCategoryGroup;
  categorySharePct: number;
  exposureRows?: CostExposureRow[];
  homepageAlertIds?: Set<string>;
}): CategoryExposureDrillDown {
  const exposureRows = input.exposureRows ?? buildPortfolioCostExposure(input.data, 50);
  const categoryIds = ingredientIdsInCategory(input.data, input.category, exposureRows);

  const catRows = exposureRows.filter((r) => r.category === input.category);
  const catLineTotal = catRows.reduce((s, r) => s + r.totalLineCost, 0);
  const catRecipeCount = catRows.reduce((s, r) => s + r.recipeCount, 0);
  const monthlyExposureEur = estimateMonthlyModeledExposureEur(catLineTotal, catRecipeCount);

  const topIngredients = catRows
    .sort((a, b) => b.costSharePct - a.costSharePct)
    .slice(0, 6)
    .map((r) => ({
      ingredientId: r.ingredientId,
      name: r.ingredientName,
      sharePct: r.costSharePct,
      recipeCount: r.recipeCount,
      trendLabel: r.trendLabel,
    }));

  const marginSignals = collectDrillDownSignals(input.alerts, {
    ingredientIds: categoryIds,
    data: input.data,
    homepageAlertIds: input.homepageAlertIds,
    limit: 4,
  });

  const recommendations = buildRecommendationsFromAlerts(input.alerts, (alert) => {
    const ingId = extractIngredientIdFromAlert(alert);
    if (ingId && categoryIds.has(ingId)) return true;
    if (alert.kind === "recipe_below_target" || alert.kind === "recipe_margin_deterioration") {
      const recipeId = alert.id.replace(/^recipe-margin-/, "");
      const recipe = input.data.recipes.find((r) => r.id === recipeId);
      return (
        !!recipe &&
        (recipe.recipe_ingredients ?? []).some(
          (line) => line.ingredient_id && categoryIds.has(line.ingredient_id),
        )
      );
    }
    return false;
  });

  return {
    kind: "category",
    group: input.category,
    label: CATEGORY_LABELS[input.category],
    sharePct: input.categorySharePct,
    monthlyExposureEur,
    monthlyExposureLabel:
      monthlyExposureEur >= 1 ? `~${formatCurrency(monthlyExposureEur)}/mo modeled exposure` : null,
    sensitivityLine: formatTenPercentSensitivityLine(catLineTotal, catRecipeCount),
    topIngredients,
    dependentRecipes: buildCategoryDependentRecipes(input.data, categoryIds),
    supplierMovements: buildSupplierMovementsForIngredients(input.data, categoryIds),
    marginSignals,
    supplierComparisons: buildSupplierComparisons(input.data, categoryIds),
    recommendations,
  };
}

export function buildIngredientExposureDrillDown(input: {
  data: MarginAlertData;
  alerts: MarginAlertItem[];
  ingredientId: string;
  exposureRow?: CostExposureRow | null;
  homepageAlertIds?: Set<string>;
}): IngredientExposureDrillDown | null {
  const ingredient = input.data.ingredients.find((i) => i.id === input.ingredientId);
  if (!ingredient) return null;

  const exposureRows = buildPortfolioCostExposure(input.data, 50);
  const exposureRow =
    input.exposureRow ??
    exposureRows.find((r) => r.ingredientId === input.ingredientId) ??
    null;

  const name = exposureRow?.ingredientName ?? ingredient.name?.trim() ?? "Ingredient";
  const category = exposureRow?.category ?? inferCostCategory(name);
  const history = input.data.priceHistory.filter((r) => r.ingredient_id === input.ingredientId);
  const unit =
    history[0]?.ingredient_unit?.trim() ||
    ingredient.base_unit?.trim() ||
    ingredient.unit?.trim() ||
    "unit";

  const stats90d = computePriceWindowStats(history, PRICE_WINDOW_90_DAYS, unit);
  const stats180d = computePriceWindowStats(history, PRICE_WINDOW_180_DAYS, unit);
  const currentUnit = effectiveUnitCost(ingredient);
  const latestHistory = getLatestHistoryByIngredient(history).find(
    (r) => r.ingredient_id === input.ingredientId,
  );
  logPricingAudit({
    surface: "exposure_drilldown_ingredient",
    ingredientId: input.ingredientId,
    ingredientName: name,
    source: "catalog",
    unitPriceEur: currentUnit,
    resolvedPrice: ingredient.current_price,
    purchaseQuantity: ingredient.purchase_quantity,
    invoiceDate: latestHistory?.created_at ?? null,
    fallbackFromInvoice: true,
    trigger: `history_rows=${history.length},90d_samples=${stats90d.sampleCount},180d_samples=${stats180d.sampleCount}`,
  });
  const recentRows = buildSupplierMovementsForIngredients(
    input.data,
    new Set([input.ingredientId]),
    1,
  );
  const extremes = supplierExtremesFromHistory(history, ingredient);

  const pct = latestHistory ? getHistoryPercent(latestHistory) : null;
  const estimatedMonthlyImpact =
    pct != null && pct > 0
      ? formatEstimatedMonthlyEur(
          estimatePriceIncreaseMonthlyEur(input.data, input.ingredientId, pct),
        )
      : null;
  const intel = buildSupplierIntelligence(input.data, input.ingredientId);
  const lineTotal = exposureRow?.totalLineCost ?? 0;
  const recipeCount = exposureRow?.recipeCount ?? 0;

  return {
    kind: "ingredient",
    ingredientId: input.ingredientId,
    ingredientName: name,
    category,
    costSharePct: exposureRow?.costSharePct ?? 0,
    recipeCount: exposureRow?.recipeCount ?? getRecipeUsageByIngredient(input.data.recipes).get(input.ingredientId)?.count ?? 0,
    affectedRecipes: buildRecipeExposureForIngredient(input.data, input.ingredientId),
    recentMovement: recentRows[0] ?? null,
    currentPriceLabel: currentUnit > 0 ? formatPriceUnit(currentUnit, unit) : null,
    currentSupplier: latestHistory?.supplier_name?.trim() || null,
    supplierLow: extremes.low,
    supplierHigh: extremes.high,
    stats90d,
    stats180d,
    estimatedMonthlyImpact,
    marginSensitivityLine: formatTenPercentSensitivityLine(lineTotal, recipeCount),
    competitivenessCopy: competitivenessCopy(currentUnit, stats90d),
    betterSupplierLine: intel.betterSupplierLine,
    supplierStabilityLine: intel.stabilityLine,
    marginSignals: collectDrillDownSignals(input.alerts, {
      ingredientId: input.ingredientId,
      data: input.data,
      homepageAlertIds: input.homepageAlertIds,
      limit: 3,
    }),
    recommendations: buildRecommendationsFromAlerts(
      input.alerts,
      (alert) => recipeAlertUsesIngredient(alert, input.ingredientId, input.data),
      3,
    ),
  };
}
