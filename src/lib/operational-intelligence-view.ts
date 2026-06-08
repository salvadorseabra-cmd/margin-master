import { marginAlertSeverityLabel } from "@/lib/margin-alert-severity";
import { formatCurrency, formatPercent } from "@/lib/display-format";
import { linkedIngredientPriceHistoryRows } from "@/lib/ingredient-price-history";
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
  type OperationalHealthPanel,
  type PriceHistoryRecord,
  type RecipeMetric,
  type RecipeRecord,
} from "@/lib/margin-alert-data";
import type { MarginVisitDelta } from "@/lib/margin-alert-visit";

export type CostCategoryGroup =
  | "meat"
  | "dairy"
  | "produce"
  | "sauces"
  | "bakery"
  | "beverage"
  | "other";

export type CostExposureRow = {
  ingredientId: string;
  ingredientName: string;
  category: CostCategoryGroup;
  costSharePct: number;
  totalLineCost: number;
  recipeCount: number;
  trendPct: number | null;
  trendLabel: string | undefined;
  /** Modeled monthly € at current portions × covers heuristic. */
  monthlyModeledExposureEur: number;
  sensitivityLine: string | null;
  supplierDeltaLine: string | null;
};

export type BriefingTone = "red" | "amber" | "green" | "blue";

export type MarginBriefingCard = {
  id: string;
  tone: BriefingTone;
  headline: string;
  /** Primary money/severity line when computable. */
  impactLine: string | null;
  detail: string;
  target: MarginAlertItem["target"];
  actionLabel: string;
};

/** Urgent owner-facing risk card for Today's Margin Risks. */
export type TodaysMarginRiskCard = {
  id: string;
  tone: BriefingTone;
  pressureSource: string;
  event: string;
  recipesSummary: string;
  estimatedMonthlyImpact: string | null;
  monthlyImpactEur: number;
  whyItMatters: string;
  target: MarginAlertItem["target"];
  actionLabel: string;
};

/** @deprecated Use TodaysMarginRiskCard */
export type TodaysRiskCard = TodaysMarginRiskCard;

export type PurchasingMovementItem = {
  id: string;
  tone: "up" | "down" | "stable" | "calm";
  headline: string;
  detail: string;
  impactLine: string | null;
  target: MarginAlertItem["target"];
};

export type CategoryPressureRow = {
  group: CostCategoryGroup;
  label: string;
  trend: "up" | "down" | "flat";
  inflationVs3MoPct: number | null;
  pressureLine: string;
  operationalLine: string;
};

export type OperationalExposureRow = CostExposureRow & {
  operationalScore: number;
  supplierSpikeFlag: boolean;
};

export type RecoveryOpportunityCard = {
  id: string;
  title: string;
  why: string;
  savingsLine: string | null;
  action: string;
  target: MarginAlertItem["target"];
  actionLabel: string;
  monthlyImpactEur: number;
};

/** @deprecated Use PurchasingMovementItem */
export type WeeklyChangeFeedItem = {
  id: string;
  tone: "up" | "down" | "stable" | "calm";
  summary: string;
  impactLine: string | null;
  recipeNames: string[];
  target: MarginAlertItem["target"];
};

export type MenuDependencyRow = {
  id: string;
  kind: "shared_ingredient" | "category_concentration" | "recipe_margin_lever";
  title: string;
  detail: string;
  exposurePct: number | null;
  recipeNames: string[];
  target: MarginAlertItem["target"];
  actionLabel: string;
};

export type OperationalRecommendationCategory =
  | "price_actions"
  | "supplier_actions"
  | "portion_actions"
  | "margin_deterioration"
  | "stability_signals"
  | "recovery_opportunities"
  | "concentration_risk";

export type OperationalRecommendation = {
  id: string;
  category: OperationalRecommendationCategory;
  monthlyImpactEur: number;
  priority: number;
  dedupeKey: string;
  title: string;
  why: string;
  action: string;
  perPortionImpact: string | null;
  monthlyImpact: string | null;
  affectedRecipes: number | null;
  target: MarginAlertItem["target"];
  actionLabel: string;
  urgency: "now" | "this_week" | "monitor";
};

export type RecommendedActionCard = {
  id: string;
  category: OperationalRecommendationCategory;
  categoryLabel: string;
  monthlyImpactEur: number;
  priority: number;
  urgency: "now" | "this_week" | "monitor";
  urgencyLabel: string;
  title: string;
  why: string;
  action: string;
  perPortionImpact: string | null;
  monthlyImpact: string | null;
  /** Combined impact line for compact display. */
  estimatedImpact: string | null;
  affectedRecipes: number | null;
  target: MarginAlertItem["target"];
  actionLabel: string;
};

const RECOMMENDATION_CATEGORY_LABELS: Record<OperationalRecommendationCategory, string> = {
  price_actions: "Pricing",
  supplier_actions: "Supplier",
  portion_actions: "Portions",
  margin_deterioration: "Margin",
  stability_signals: "Stable",
  recovery_opportunities: "Recovery",
  concentration_risk: "Concentration",
};

export type StalePricingBadge = {
  ingredientId: string;
  label: string;
};

export type CostCategorySlice = {
  group: CostCategoryGroup;
  label: string;
  sharePct: number;
  color: string;
};

export type OperationalSignalCard = {
  id: string;
  severity: MarginAlertSeverity;
  severityLabel: string;
  title: string;
  explanation: string;
  recipesAffected: number | null;
  impact: string | null;
  recommendedAction: string;
  target: MarginAlertItem["target"];
  actionLabel: string;
  priority: number;
};

export type PriceMovementRow = {
  ingredientId: string;
  ingredientName: string;
  changePct: number;
  supplier: string | null;
  latestPrice: string;
  trendLabel: string | undefined;
};

export type SupplierWatchRow = {
  supplierName: string;
  status: "price_increase" | "stable" | "price_decrease";
  statusLabel: string;
  lastInvoiceDate: string;
  pricingNote: string;
  riskLevel: "high" | "medium" | "low";
};

export type OperationalIntelligenceKpis = {
  recipeReliabilityPct: number | null;
  recipeReliabilityDetail: string;
  avgFoodCostPct: number | null;
  avgFoodCostDeltaPts: number | null;
  recipesAtRisk: number;
  totalMenuRecipes: number;
  priceMovements: number;
  supplierStabilityPct: number | null;
  supplierStabilityDetail: string;
};

export type DailySummaryStat = {
  label: string;
  value: string;
};

const CATEGORY_LABELS: Record<CostCategoryGroup, string> = {
  meat: "Meat",
  dairy: "Dairy",
  produce: "Produce",
  sauces: "Sauces",
  bakery: "Bakery",
  beverage: "Beverage",
  other: "Other",
};

/** Strong category colors for the exposure chart (not grayscale). */
const CATEGORY_COLORS: Record<CostCategoryGroup, string> = {
  meat: "#e11d48",
  dairy: "#2563eb",
  produce: "#16a34a",
  sauces: "#d97706",
  bakery: "#9333ea",
  beverage: "#0891b2",
  other: "#64748b",
};

const BRIEFING_EXCLUDED_KINDS = new Set<MarginAlertItem["kind"]>([
  "stale_price",
  "recent_update",
  "price_decrease",
  "cost_concentration",
]);

const TODAYS_RISKS_EXCLUDED_KINDS = new Set<MarginAlertItem["kind"]>([
  "stale_price",
  "recent_update",
  "price_decrease",
]);

/**
 * Impact heuristics (directional; UI labels them "estimated"):
 * - monthlyExposureEur ≈ Σ (lineCost × priceChangePct/100 × coversPerRecipe)
 * - coversPerRecipe: 30 for menu recipes using the ingredient; portfolio fallback 120 covers/mo
 * - recipe margin gap: (TARGET_MARGIN − grossMargin)/100 × sellingPrice × coversPerRecipe
 * - portion save: topLine.lineCost × 10% when suggesting trim on dominant ingredient
 * - food cost pts: from alert meta or TARGET_MARGIN − grossMargin
 */
const ESTIMATED_COVERS_PER_MENU_RECIPE = 30;
const ESTIMATED_PORTFOLIO_COVERS = 120;
const PRICE_WINDOW_90_DAYS = 90;

function severityOrder(severity: MarginAlertSeverity): number {
  if (severity === "critical") return 0;
  if (severity === "high") return 1;
  if (severity === "watch") return 2;
  if (severity === "info") return 3;
  return 4;
}

function numberOrNull(value: number | null | undefined): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function getHistoryPercent(row: PriceHistoryRecord): number {
  const explicit = numberOrNull(row.delta_percent);
  if (explicit !== null) return explicit;
  const current = numberOrNull(row.new_price);
  const previous = numberOrNull(row.previous_price);
  if (current === null || previous === null || previous <= 0) return 0;
  return ((current - previous) / previous) * 100;
}

export function inferCostCategory(ingredientName: string): CostCategoryGroup {
  const n = ingredientName.toLowerCase();
  if (
    /\b(beef|novilho|porco|frango|carne|meat|bacon|ham|lombo|vazia|acem|acém|peru|turkey|veal|lamb|borrego)\b/i.test(
      n,
    )
  ) {
    return "meat";
  }
  if (/\b(cheese|queijo|manteiga|butter|cream|nata|leite|milk|dairy|iogurte|yogurt)\b/i.test(n)) {
    return "dairy";
  }
  if (
    /\b(tomate|onion|cebola|alho|garlic|salad|lettuce|alface|pepper|piment|produce|vegetable|fruta|fruit|limão|lemon|cenoura|carrot|batata|potato)\b/i.test(
      n,
    )
  ) {
    return "produce";
  }
  if (
    /\b(sauce|molho|ketchup|maionese|mayo|hellmann|mustard|mostarda|bbq|relish|vinagre|vinegar|dressing)\b/i.test(
      n,
    )
  ) {
    return "sauces";
  }
  if (/\b(bread|pão|bun|brioche|farinha|flour|bakery|bolo|cake|pastry|massa|dough)\b/i.test(n)) {
    return "bakery";
  }
  if (
    /\b(cola|soda|beer|cerveja|wine|vinho|coffee|café|juice|sumo|water|água|beverage|drink|drink)\b/i.test(
      n,
    )
  ) {
    return "beverage";
  }
  return "other";
}

function effectiveUnitCost(ingredient: {
  current_price: number | null;
  purchase_quantity: number | null;
  cost_base_unit?: "g" | "ml" | "un" | null;
}): number {
  return resolvedOperationalUnitCostEur(ingredient) ?? 0;
}

/** Modeled monthly € from portfolio line cost × covers heuristic. */
export function estimateMonthlyModeledExposureEur(
  totalLineCost: number,
  recipeCount: number,
): number {
  if (totalLineCost <= 0) return 0;
  const covers =
    recipeCount > 0
      ? recipeCount * ESTIMATED_COVERS_PER_MENU_RECIPE
      : ESTIMATED_PORTFOLIO_COVERS;
  return Math.round(totalLineCost * covers);
}

export function estimateTenPercentSensitivityEur(
  totalLineCost: number,
  recipeCount: number,
): number {
  return Math.round(estimateMonthlyModeledExposureEur(totalLineCost, recipeCount) * 0.1);
}

export function formatTenPercentSensitivityLine(
  totalLineCost: number,
  recipeCount: number,
): string | null {
  const eur = estimateTenPercentSensitivityEur(totalLineCost, recipeCount);
  if (eur < 1) return null;
  return `10% increase → ~${formatCurrency(eur)}/mo`;
}

export function estimateSupplierDeltaMonthlyEur(
  catalogUnit: number,
  min90d: number,
  monthlyLineExposureEur: number,
): number {
  if (catalogUnit <= min90d || catalogUnit <= 0 || monthlyLineExposureEur < 1) return 0;
  return Math.round(monthlyLineExposureEur * ((catalogUnit - min90d) / catalogUnit));
}

export function formatSupplierDeltaVs90dMinLine(
  catalogUnit: number,
  min90d: number | null,
  monthlyLineExposureEur: number,
): string | null {
  if (min90d == null || min90d <= 0 || catalogUnit <= min90d * 1.01) return null;
  const gapPct = Math.round(((catalogUnit - min90d) / min90d) * 100);
  const deltaEur = estimateSupplierDeltaMonthlyEur(catalogUnit, min90d, monthlyLineExposureEur);
  if (gapPct < 1 && deltaEur < 1) return null;
  return `Catalog +${gapPct}% vs 90d low · ~${formatCurrency(deltaEur)}/mo`;
}

function minUnitPriceInWindow(
  rows: PriceHistoryRecord[],
  ingredientId: string,
  windowDays: number,
): number | null {
  const cutoff = Date.now() - windowDays * 86_400_000;
  const prices = rows
    .filter((row) => row.ingredient_id === ingredientId)
    .filter((row) => new Date(row.created_at).getTime() >= cutoff)
    .map((row) => numberOrNull(row.new_price))
    .filter((p): p is number => p != null && p > 0);
  if (prices.length === 0) return null;
  return Math.min(...prices);
}

function avgUnitPriceInWindow(
  rows: PriceHistoryRecord[],
  ingredientId: string,
  windowDays: number,
): number | null {
  const cutoff = Date.now() - windowDays * 86_400_000;
  const prices = rows
    .filter((row) => row.ingredient_id === ingredientId)
    .filter((row) => new Date(row.created_at).getTime() >= cutoff)
    .map((row) => numberOrNull(row.new_price))
    .filter((p): p is number => p != null && p > 0);
  if (prices.length === 0) return null;
  return prices.reduce((s, p) => s + p, 0) / prices.length;
}

export type SupplierIntelligenceSnapshot = {
  spikeVs3MoPct: number | null;
  spikeMonthlyEur: number | null;
  betterSupplierLine: string | null;
  stabilityLine: string | null;
};

export function buildSupplierIntelligence(
  data: MarginAlertData,
  ingredientId: string,
): SupplierIntelligenceSnapshot {
  const ingredient = data.ingredients.find((i) => i.id === ingredientId);
  const history = data.priceHistory.filter((r) => r.ingredient_id === ingredientId);
  const exposure = buildPortfolioCostExposure(data, 50).find((r) => r.ingredientId === ingredientId);
  const monthlyEur =
    exposure?.monthlyModeledExposureEur ??
    estimateMonthlyModeledExposureEur(0, exposure?.recipeCount ?? 0);

  const avg3mo = avgUnitPriceInWindow(history, ingredientId, PRICE_WINDOW_90_DAYS);
  const latestRow = getLatestHistoryByIngredient(history).find(
    (r) => r.ingredient_id === ingredientId,
  );
  const latestUnit =
    numberOrNull(latestRow?.new_price) ??
    (ingredient ? effectiveUnitCost(ingredient) : null);

  let spikeVs3MoPct: number | null = null;
  let spikeMonthlyEur: number | null = null;
  if (avg3mo != null && avg3mo > 0 && latestUnit != null && latestUnit > avg3mo * 1.02) {
    spikeVs3MoPct = Math.round(((latestUnit - avg3mo) / avg3mo) * 100);
    spikeMonthlyEur = estimatePriceIncreaseMonthlyEur(data, ingredientId, spikeVs3MoPct);
  }

  const catalogUnit = ingredient ? effectiveUnitCost(ingredient) : 0;
  const min90d = minUnitPriceInWindow(history, ingredientId, PRICE_WINDOW_90_DAYS);
  let betterSupplierLine: string | null = null;
  if (min90d != null && catalogUnit > min90d * 1.02) {
    let cheapestSupplier: string | null = null;
    const cutoff = Date.now() - PRICE_WINDOW_90_DAYS * 86_400_000;
    for (const row of history) {
      if (new Date(row.created_at).getTime() < cutoff) continue;
      const price = numberOrNull(row.new_price);
      if (price == null || price > min90d + 0.001) continue;
      cheapestSupplier = row.supplier_name?.trim() || cheapestSupplier;
    }
    const gapPct = Math.round(((catalogUnit - min90d) / min90d) * 100);
    const deltaEur = estimateSupplierDeltaMonthlyEur(
      catalogUnit,
      min90d,
      monthlyEur > 0 ? monthlyEur : estimateMonthlyModeledExposureEur(1, 1),
    );
    if (gapPct >= 2 && deltaEur >= 1) {
      betterSupplierLine = cheapestSupplier
        ? `${cheapestSupplier} ~${formatCurrency(min90d)} vs catalog (+${gapPct}%, ~${formatCurrency(deltaEur)}/mo)`
        : `Recent invoice low ~${formatCurrency(min90d)} — catalog +${gapPct}% (~${formatCurrency(deltaEur)}/mo)`;
    }
  }

  const recentPrices = history
    .slice(0, 12)
    .map((r) => numberOrNull(r.new_price))
    .filter((p): p is number => p != null && p > 0);
  let stabilityLine: string | null = null;
  if (recentPrices.length >= 3) {
    const mean = recentPrices.reduce((s, p) => s + p, 0) / recentPrices.length;
    const variance =
      recentPrices.reduce((s, p) => s + (p - mean) ** 2, 0) / recentPrices.length;
    const cv = mean > 0 ? Math.sqrt(variance) / mean : 1;
    if (cv < 0.06) {
      stabilityLine = `Stable across last ${recentPrices.length} invoices`;
    }
  }

  return { spikeVs3MoPct, spikeMonthlyEur, betterSupplierLine, stabilityLine };
}

export function buildPortfolioCostExposure(data: MarginAlertData, limit = 6): CostExposureRow[] {
  const ingredientById = new Map(data.ingredients.map((i) => [i.id, i]));
  const totals = new Map<string, { name: string; total: number; recipeIds: Set<string> }>();

  for (const recipe of data.recipes) {
    for (const line of recipe.recipe_ingredients ?? []) {
      if (!line.ingredient_id || !line.ingredients) continue;
      const qty = Number(line.quantity ?? 0);
      const lineCost = qty * effectiveUnitCost(line.ingredients);
      const name = line.ingredients.name?.trim() || "Ingredient";
      const current = totals.get(line.ingredient_id) ?? {
        name,
        total: 0,
        recipeIds: new Set<string>(),
      };
      current.recipeIds.add(recipe.id);
      totals.set(line.ingredient_id, {
        name: current.name || name,
        total: current.total + lineCost,
        recipeIds: current.recipeIds,
      });
    }
  }

  const grandTotal = [...totals.values()].reduce((sum, row) => sum + row.total, 0);
  if (grandTotal <= 0) return [];

  const latestByIngredient = new Map(
    getLatestHistoryByIngredient(data.priceHistory).map((row) => [row.ingredient_id, row]),
  );

  return [...totals.entries()]
    .map(([ingredientId, row]) => {
      const ingredient = ingredientById.get(ingredientId);
      const name = row.name || ingredient?.name?.trim() || "Ingredient";
      const history = latestByIngredient.get(ingredientId);
      const trendPct = history ? getHistoryPercent(history) : null;
      const recipeCount = row.recipeIds.size;
      const monthlyModeledExposureEur = estimateMonthlyModeledExposureEur(row.total, recipeCount);
      const catalogUnit = ingredient ? effectiveUnitCost(ingredient) : 0;
      const min90d = minUnitPriceInWindow(data.priceHistory, ingredientId, PRICE_WINDOW_90_DAYS);
      return {
        ingredientId,
        ingredientName: name,
        category: inferCostCategory(name),
        costSharePct: (row.total / grandTotal) * 100,
        totalLineCost: row.total,
        recipeCount,
        trendPct,
        trendLabel: history?.created_at
          ? trendPct != null && Math.abs(trendPct) >= 0.5
            ? `${trendPct > 0 ? "+" : ""}${Math.round(trendPct)}%`
            : "flat"
          : undefined,
        monthlyModeledExposureEur,
        sensitivityLine: formatTenPercentSensitivityLine(row.total, recipeCount),
        supplierDeltaLine: formatSupplierDeltaVs90dMinLine(
          catalogUnit,
          min90d,
          monthlyModeledExposureEur,
        ),
      };
    })
    .sort((a, b) => b.costSharePct - a.costSharePct)
    .slice(0, limit);
}

function computeOperationalExposureScore(
  row: CostExposureRow,
  data: MarginAlertData,
): { score: number; supplierSpikeFlag: boolean } {
  const intel = buildSupplierIntelligence(data, row.ingredientId);
  const supplierSpikeFlag =
    intel.spikeVs3MoPct != null && intel.spikeVs3MoPct >= 5;
  const exposurePart = row.monthlyModeledExposureEur * 0.35;
  const trendPart = Math.abs(row.trendPct ?? 0) * 12;
  const recipePart = Math.min(row.recipeCount, 8) * 8;
  const sharePart = row.costSharePct * 2;
  const spikePart = supplierSpikeFlag ? 40 + (intel.spikeVs3MoPct ?? 0) : 0;
  return {
    score: exposurePart + trendPart + recipePart + sharePart + spikePart,
    supplierSpikeFlag,
  };
}

export function buildTopOperationalExposures(
  data: MarginAlertData,
  limit = 5,
): OperationalExposureRow[] {
  return buildPortfolioCostExposure(data, 50)
    .map((row) => {
      const { score, supplierSpikeFlag } = computeOperationalExposureScore(row, data);
      return { ...row, operationalScore: score, supplierSpikeFlag };
    })
    .sort((a, b) => b.operationalScore - a.operationalScore)
    .slice(0, limit);
}

const HOMEPAGE_CATEGORY_ORDER: CostCategoryGroup[] = [
  "meat",
  "sauces",
  "dairy",
  "bakery",
  "produce",
  "beverage",
];

export function buildCostCategorySlices(
  rows: CostExposureRow[],
  options?: { homepageOnly?: boolean },
): CostCategorySlice[] {
  const buckets = new Map<CostCategoryGroup, number>();
  for (const row of rows) {
    buckets.set(row.category, (buckets.get(row.category) ?? 0) + row.costSharePct);
  }
  const slices = [...buckets.entries()]
    .map(([group, sharePct]) => ({
      group,
      label: CATEGORY_LABELS[group],
      sharePct,
      color: CATEGORY_COLORS[group],
    }))
    .filter((slice) => !options?.homepageOnly || slice.group !== "other")
    .sort((a, b) => b.sharePct - a.sharePct);

  if (!options?.homepageOnly) return slices;

  const orderIndex = new Map(HOMEPAGE_CATEGORY_ORDER.map((g, i) => [g, i]));
  return slices.sort(
    (a, b) =>
      (orderIndex.get(a.group) ?? 99) - (orderIndex.get(b.group) ?? 99) ||
      b.sharePct - a.sharePct,
  );
}

export function buildCategoryPressureRows(
  data: MarginAlertData,
  exposureRows: CostExposureRow[] = buildPortfolioCostExposure(data, 50),
): CategoryPressureRow[] {
  const slices = buildCostCategorySlices(exposureRows, { homepageOnly: true });
  const orderIndex = new Map(HOMEPAGE_CATEGORY_ORDER.map((g, i) => [g, i]));

  return slices
    .map((slice) => {
      const catRows = exposureRows.filter((r) => r.category === slice.group);
      const monthlyPressure = catRows.reduce((s, r) => s + r.monthlyModeledExposureEur, 0);
      const trends = catRows
        .map((r) => r.trendPct)
        .filter((t): t is number => t != null);
      const avgTrend =
        trends.length > 0 ? trends.reduce((s, t) => s + t, 0) / trends.length : 0;

      let inflationVs3MoPct: number | null = null;
      for (const row of catRows) {
        const intel = buildSupplierIntelligence(data, row.ingredientId);
        if (intel.spikeVs3MoPct != null) {
          inflationVs3MoPct =
            inflationVs3MoPct == null
              ? intel.spikeVs3MoPct
              : Math.max(inflationVs3MoPct, intel.spikeVs3MoPct);
        }
      }

      const trend: CategoryPressureRow["trend"] =
        inflationVs3MoPct != null && inflationVs3MoPct >= 3
          ? "up"
          : avgTrend <= -2
            ? "down"
            : Math.abs(avgTrend) < 2
              ? "flat"
              : avgTrend > 0
                ? "up"
                : "down";

      let pressureLine: string;
      if (trend === "down" || (inflationVs3MoPct != null && inflationVs3MoPct < 0)) {
        pressureLine = "Recovering";
      } else if (
        (inflationVs3MoPct == null || inflationVs3MoPct < 3) &&
        Math.abs(avgTrend) < 2
      ) {
        pressureLine = "Stable";
      } else if (monthlyPressure >= 1) {
        pressureLine = `Est. ${formatCurrency(monthlyPressure)}/mo pressure`;
      } else {
        pressureLine = `${formatPercent(Math.round(slice.sharePct))} of menu cost`;
      }

      const arrow = trendArrow(trend);
      const inflBit =
        inflationVs3MoPct != null && Math.abs(inflationVs3MoPct) >= 3
          ? ` · ${inflationVs3MoPct > 0 ? "+" : ""}${Math.round(inflationVs3MoPct)}% vs 3mo`
          : "";

      let operationalLine: string;
      if (pressureLine === "Recovering") {
        operationalLine = `${arrow} Invoice basket easing — hold menu price while costs normalize.`;
      } else if (pressureLine === "Stable") {
        operationalLine = `${arrow} No material category inflation — monitor on next invoice.`;
      } else if (trend === "up") {
        operationalLine = `${arrow}${inflBit} — ${catRows.length} cost line${catRows.length === 1 ? "" : "s"} lifting ${slice.label.toLowerCase()} dishes.`;
      } else {
        operationalLine = `${arrow}${inflBit} — ${slice.label} share ${formatPercent(Math.round(slice.sharePct))}; watch dominant SKUs.`;
      }

      return {
        group: slice.group,
        label: slice.label,
        trend,
        inflationVs3MoPct,
        pressureLine,
        operationalLine,
      };
    })
    .sort(
      (a, b) =>
        (orderIndex.get(a.group) ?? 99) - (orderIndex.get(b.group) ?? 99) ||
        (b.inflationVs3MoPct ?? 0) - (a.inflationVs3MoPct ?? 0),
    );
}

export function formatCategoryExposureTakeaway(
  slices: CostCategorySlice[],
  exposureRows: CostExposureRow[] = [],
): string | null {
  const top = slices[0];
  if (!top || top.sharePct < 15) return null;
  const catMonthly = exposureRows
    .filter((r) => r.category === top.group)
    .reduce((s, r) => s + r.monthlyModeledExposureEur, 0);
  if (catMonthly >= 1) {
    return `${top.label} ~${formatCurrency(catMonthly)}/mo modeled exposure (${formatPercent(Math.round(top.sharePct))} of menu cost)`;
  }
  return `${formatPercent(Math.round(top.sharePct))} ${top.label.toLowerCase()} — largest cost bucket`;
}

export function extractIngredientIdFromAlert(alert: MarginAlertItem): string | null {
  if (alert.id.startsWith("price-increase-")) return alert.id.slice("price-increase-".length);
  if (alert.id.startsWith("ingredient-spike-")) return alert.id.slice("ingredient-spike-".length);
  if (alert.id.startsWith("price-decrease-")) return alert.id.slice("price-decrease-".length);
  if (alert.id.startsWith("stale-price-")) return alert.id.slice("stale-price-".length);
  if (alert.id.startsWith("price-updated-")) return alert.id.slice("price-updated-".length);
  if (alert.id.startsWith("high-contribution|")) return alert.id.split("|")[2] ?? null;
  return null;
}

const SIGNAL_SECTION_EXCLUDE_KINDS = new Set<MarginAlertItem["kind"]>([
  "cost_concentration",
  "recent_update",
  "price_decrease",
]);

export function dedupeOperationalSignals(alerts: MarginAlertItem[]): OperationalSignalCard[] {
  const byKey = new Map<string, MarginAlertItem>();

  for (const alert of alerts) {
    if (SIGNAL_SECTION_EXCLUDE_KINDS.has(alert.kind)) continue;
    if (alert.severity === "positive") continue;

    const ingredientId = extractIngredientIdFromAlert(alert);
    const key = ingredientId ?? alert.id;

    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, alert);
      continue;
    }

    const existingRank = severityOrder(existing.severity) * 1_000_000 - existing.priority;
    const nextRank = severityOrder(alert.severity) * 1_000_000 - alert.priority;
    if (nextRank < existingRank) byKey.set(key, alert);
  }

  return [...byKey.values()]
    .sort(
      (a, b) => severityOrder(a.severity) - severityOrder(b.severity) || b.priority - a.priority,
    )
    .map((alert) => ({
      id: alert.id,
      severity: alert.severity,
      severityLabel: marginAlertSeverityLabel(alert.severity),
      title: alert.title,
      explanation: alert.context,
      recipesAffected: parseRecipesAffected(alert),
      impact: pickImpactLine(alert),
      recommendedAction: alert.suggestedAction,
      target: alert.target,
      actionLabel: alert.actionLabel,
      priority: alert.priority,
    }));
}

function parseRecipesAffected(alert: MarginAlertItem): number | null {
  const meta = alert.meta.find((m) => m.label === "Recipes affected" || m.label === "Recipes");
  if (!meta?.value) return null;
  const n = Number(meta.value);
  return Number.isFinite(n) ? n : null;
}

function pickImpactLine(alert: MarginAlertItem): string | null {
  const movement = alert.meta.find((m) => m.label === "Movement")?.value;
  if (movement) return movement;
  const margin = alert.meta.find((m) => m.label === "Gross margin")?.value;
  if (margin) return `Margin ${margin}`;
  const signal = alert.meta.find((m) => m.label === "Signal")?.value;
  if (signal) return signal;
  return alert.temporalLine ?? null;
}

export function buildPriceMovementRows(data: MarginAlertData, limit = 8): PriceMovementRow[] {
  const ingredientById = new Map(data.ingredients.map((i) => [i.id, i]));
  const latest = getLatestHistoryByIngredient(data.priceHistory);
  const cutoff = Date.now() - RECENT_PRICE_DAYS * 86_400_000;

  return latest
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
        changePct: pct,
        supplier: row.supplier_name?.trim() || null,
        latestPrice: `${formatCurrency(price)} / ${unit}`,
        trendLabel: row.created_at
          ? pct >= 0.5
            ? `+${Math.round(pct)}%`
            : pct <= -0.5
              ? `${Math.round(pct)}%`
              : "flat"
          : undefined,
      };
    })
    .filter((row) => Math.abs(row.changePct) >= 0.5)
    .sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct))
    .slice(0, limit);
}

export function buildSupplierWatchlist(
  data: MarginAlertData,
  alerts: MarginAlertItem[],
  limit = 6,
): SupplierWatchRow[] {
  type SupplierEntry = {
    displayName: string;
    lastDate: string;
    increases: number;
    decreases: number;
    maxPct: number;
    notes: string[];
  };

  const supplierMap = new Map<string, SupplierEntry>();

  for (const invoice of data.invoices) {
    const name = invoice.supplier_name?.trim();
    if (!name) continue;
    const key = name.toLowerCase();
    const current: SupplierEntry = supplierMap.get(key) ?? {
      displayName: name,
      lastDate: "",
      increases: 0,
      decreases: 0,
      maxPct: 0,
      notes: [],
    };
    const date = invoice.created_at ?? "";
    if (!current.lastDate || date.localeCompare(current.lastDate) > 0) {
      current.lastDate = date;
    }
    supplierMap.set(key, current);
  }

  for (const row of linkedIngredientPriceHistoryRows(data.priceHistory)) {
    const supplier = row.supplier_name?.trim();
    if (!supplier) continue;
    const key = supplier.toLowerCase();
    const pct = getHistoryPercent(row);
    const entry: SupplierEntry = supplierMap.get(key) ?? {
      displayName: supplier,
      lastDate: row.created_at,
      increases: 0,
      decreases: 0,
      maxPct: 0,
      notes: [],
    };
    if (pct > 2) entry.increases += 1;
    if (pct < -2) entry.decreases += 1;
    if (Math.abs(pct) > Math.abs(entry.maxPct)) entry.maxPct = pct;
    if (Math.abs(pct) >= 5) {
      const ingredient = row.ingredient_name?.trim() || "SKU";
      entry.notes.push(`${pct > 0 ? "+" : ""}${Math.round(pct)}% on ${ingredient}`);
    }
    if (!entry.lastDate || row.created_at.localeCompare(entry.lastDate) > 0) {
      entry.lastDate = row.created_at;
    }
    supplierMap.set(key, entry);
  }

  const supplierTrendAlerts = alerts.filter((a) => a.kind === "supplier_trend");
  for (const alert of supplierTrendAlerts) {
    const supplier = alert.meta.find((m) => m.label === "Supplier")?.value;
    if (!supplier) continue;
    const key = supplier.toLowerCase();
    const entry = supplierMap.get(key);
    if (entry) entry.notes.push(alert.title);
  }

  return [...supplierMap.entries()]
    .map(([, entry]) => {
      const displayName = entry.displayName;
      let status: SupplierWatchRow["status"] = "stable";
      let statusLabel = "Stable";
      if (entry.increases > entry.decreases && entry.maxPct > 2) {
        status = "price_increase";
        statusLabel = "Price increase";
      } else if (entry.decreases > entry.increases && entry.maxPct < -2) {
        status = "price_decrease";
        statusLabel = "Price decrease";
      }

      const riskLevel: SupplierWatchRow["riskLevel"] =
        entry.maxPct >= 10 || entry.increases >= 2
          ? "high"
          : entry.maxPct >= 5 || entry.increases >= 1
            ? "medium"
            : "low";

      return {
        supplierName: displayName,
        status,
        statusLabel,
        lastInvoiceDate: entry.lastDate ? new Date(entry.lastDate).toLocaleDateString() : "—",
        pricingNote: entry.notes[0] ?? "No recent basket movement",
        riskLevel,
      };
    })
    .sort((a, b) => {
      const riskScore = { high: 0, medium: 1, low: 2 };
      return riskScore[a.riskLevel] - riskScore[b.riskLevel];
    })
    .slice(0, limit);
}

export function buildOperationalKpis(
  data: MarginAlertData,
  alerts: MarginAlertItem[],
  health: OperationalHealthPanel,
): OperationalIntelligenceKpis {
  const recipeMetrics = getRecipeMetrics(data.recipes);
  const menuRecipes = recipeMetrics.filter(
    (m) => m.recipe.type !== "prep" && m.foodCostPercent !== null,
  );
  const recipesAtRisk = menuRecipes.filter((m) => (m.grossMargin ?? 0) < TARGET_MARGIN).length;

  const avgFoodCostPct =
    menuRecipes.length > 0
      ? menuRecipes.reduce((sum, m) => sum + (m.foodCostPercent ?? 0), 0) / menuRecipes.length
      : null;

  const priceMovements = alerts.filter(
    (a) => a.kind === "price_increase" || a.kind === "ingredient_inflation_spike",
  ).length;

  return {
    recipeReliabilityPct: health.recipeReliability?.score ?? null,
    recipeReliabilityDetail: health.recipeReliability?.detail ?? "",
    avgFoodCostPct,
    avgFoodCostDeltaPts: null,
    recipesAtRisk,
    totalMenuRecipes: menuRecipes.length,
    priceMovements,
    supplierStabilityPct: health.supplierStability?.score ?? null,
    supplierStabilityDetail: health.supplierStability?.detail ?? "",
  };
}

export function buildDailySummaryStats(
  alerts: MarginAlertItem[],
  visitDelta: MarginVisitDelta,
): DailySummaryStat[] {
  const priceMoves = alerts.filter((a) => a.kind === "price_increase").length;
  const supplierRisks = alerts.filter(
    (a) =>
      a.kind === "supplier_trend" ||
      a.kind === "volatile_pricing" ||
      (a.severity === "critical" && a.kind === "ingredient_inflation_spike"),
  ).length;

  const newPriceLine = visitDelta.lines.find((l) => l.includes("price increase"));
  const newCriticalLine = visitDelta.lines.find((l) => l.includes("critical"));

  return [
    {
      label: "Price movements",
      value: newPriceLine ?? `${priceMoves} in the last ${RECENT_PRICE_DAYS} days`,
    },
    {
      label: "Supplier risks",
      value:
        newCriticalLine && supplierRisks === 0
          ? newCriticalLine
          : `${supplierRisks} new supplier risk${supplierRisks === 1 ? "" : "s"}`,
    },
  ];
}

export function buildExecutiveRecommendation(input: {
  alerts: MarginAlertItem[];
  signals: OperationalSignalCard[];
  categoryTakeaway: string | null;
  recipesAtRisk: number;
}): string {
  const critical = input.signals.filter((s) => s.severity === "critical" || s.severity === "high");
  if (critical.length > 0) {
    const top = critical[0]!;
    const recipeBit =
      top.recipesAffected && top.recipesAffected > 0
        ? ` across ${top.recipesAffected} recipe${top.recipesAffected === 1 ? "" : "s"}`
        : "";
    return `${top.title.replace(/\.$/, "")}${recipeBit} — ${top.recommendedAction.replace(/\.$/, "")}.`;
  }

  if (input.recipesAtRisk > 0) {
    return `${input.recipesAtRisk} menu recipe${input.recipesAtRisk === 1 ? "" : "s"} sit below the ${TARGET_MARGIN}% margin target — review portions and pricing before the next menu cycle.`;
  }

  if (input.categoryTakeaway) {
    return `Cost is concentrated: ${input.categoryTakeaway}. Monitor invoice moves on those lines before they pull menu margin down.`;
  }

  const stale = input.alerts.filter((a) => a.kind === "stale_price");
  if (stale.length > 0) {
    return `${stale.length} linked ingredient${stale.length === 1 ? "" : "s"} lack recent invoice pricing — sync the next invoice to keep recipe costs current.`;
  }

  return "No critical margin risks from recent invoice data. Keep monitoring supplier baskets and recipe cost shares weekly.";
}

/** Menu recipe count for KPI subtext. */
export function countActiveMenuRecipes(recipes: RecipeRecord[]): number {
  return recipes.filter((r) => r.type !== "prep").length;
}

function severityToBriefingTone(severity: MarginAlertSeverity): BriefingTone {
  if (severity === "critical" || severity === "high") return "red";
  if (severity === "watch") return "amber";
  if (severity === "positive") return "green";
  return "blue";
}

function metaValue(alert: MarginAlertItem, label: string): string | undefined {
  return alert.meta.find((m) => m.label === label)?.value;
}

function parseMovementPercent(alert: MarginAlertItem): number | null {
  const movement = metaValue(alert, "Movement");
  const match = movement?.match(/([\d.]+)/);
  if (!match) return null;
  const n = Number(match[1]);
  return Number.isFinite(n) ? n : null;
}

function formatEstimatedMonthlyEur(amount: number | null): string | null {
  if (amount == null || amount < 1) return null;
  return `Est. ${formatCurrency(amount)}/mo`;
}

function parseMonthlyImpactEur(line: string | null): number {
  if (!line) return 0;
  const match = line.match(/[\d.,]+/);
  if (!match) return 0;
  const n = Number(match[0].replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

function trendArrow(trend: CategoryPressureRow["trend"]): string {
  if (trend === "up") return "↑";
  if (trend === "down") return "↓";
  return "→";
}

function sumIngredientLineCosts(data: MarginAlertData, ingredientId: string): number {
  let total = 0;
  for (const recipe of data.recipes) {
    if (recipe.type === "prep") continue;
    for (const line of recipe.recipe_ingredients ?? []) {
      if (line.ingredient_id !== ingredientId || !line.ingredients) continue;
      total += Number(line.quantity ?? 0) * effectiveUnitCost(line.ingredients);
    }
  }
  return total;
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
  if (total < 1) {
    const portfolioLine = sumIngredientLineCosts(data, ingredientId);
    if (portfolioLine <= 0) return null;
    return Math.round(portfolioLine * (pct / 100) * ESTIMATED_PORTFOLIO_COVERS);
  }
  return Math.round(total);
}

function estimateRecipeMarginGapMonthlyEur(metric: RecipeMetric): number | null {
  if (metric.grossMargin == null || metric.sellingPrice <= 0) return null;
  const gapPts = TARGET_MARGIN - metric.grossMargin;
  if (gapPts <= 0) return null;
  return Math.round((gapPts / 100) * metric.sellingPrice * ESTIMATED_COVERS_PER_MENU_RECIPE);
}

function formatRecipesSummary(count: number | null, names?: string[]): string {
  const effectiveCount = count ?? names?.length ?? null;
  if (effectiveCount != null && effectiveCount > 2) {
    return `${effectiveCount} recipe${effectiveCount === 1 ? "" : "s"} affected`;
  }
  if (names && names.length > 0) {
    const shown = names.slice(0, 2);
    const extra = names.length > shown.length ? ` +${names.length - shown.length}` : "";
    return shown.join(", ") + extra;
  }
  if (count != null && count > 0) {
    return `${count} recipe${count === 1 ? "" : "s"}`;
  }
  return "Menu portfolio";
}

function riskDetailFromAlert(alert: MarginAlertItem, data: MarginAlertData): string {
  const supplier = metaValue(alert, "Supplier");
  const parts: string[] = [];
  if (supplier) parts.push(`Invoice: ${supplier}`);
  if (alert.kind === "recipe_below_target") {
    const driver = metaValue(alert, "Largest driver");
    if (driver) parts.push(`Dominant cost: ${driver}`);
  }
  if (alert.temporalLine) parts.push(alert.temporalLine);
  if (parts.length > 0) return parts.join(" · ");
  const trimmed = alert.context.split(".")[0]?.trim();
  return trimmed && trimmed.length <= 140 ? trimmed : alert.context.slice(0, 140);
}

function monthlyImpactForAlert(alert: MarginAlertItem, data: MarginAlertData): string | null {
  const ingredientId = extractIngredientIdFromAlert(alert);

  if (
    (alert.kind === "price_increase" || alert.kind === "ingredient_inflation_spike") &&
    ingredientId
  ) {
    const pct = parseMovementPercent(alert);
    if (pct != null) return formatEstimatedMonthlyEur(estimatePriceIncreaseMonthlyEur(data, ingredientId, pct));
  }

  if (alert.kind === "recipe_below_target" || alert.kind === "recipe_margin_deterioration") {
    const recipeId = alert.id.replace(/^recipe-margin-/, "");
    const metric = getRecipeMetrics(data.recipes).find((m) => m.recipe.id === recipeId);
    if (metric) return formatEstimatedMonthlyEur(estimateRecipeMarginGapMonthlyEur(metric));
  }

  if (alert.kind === "cost_concentration") {
    const recipeId = alert.id.split("|")[1];
    const metric = recipeId
      ? getRecipeMetrics(data.recipes).find((m) => m.recipe.id === recipeId)
      : null;
    if (metric?.topLine && metric.topLine.contribution >= 55) {
      return formatEstimatedMonthlyEur(
        Math.round(metric.topLine.lineCost * 0.05 * ESTIMATED_COVERS_PER_MENU_RECIPE),
      );
    }
  }

  return null;
}

export function formatBriefingHeadline(alert: MarginAlertItem): string {
  if (alert.kind === "recipe_below_target") {
    const margin = metaValue(alert, "Gross margin");
    const below = metaValue(alert, "Below target");
    const recipeName = alert.title.replace(/\s+below target margin$/i, "");
    if (margin && below) {
      return `${recipeName} — ${margin} margin (${below} under target)`;
    }
    return alert.title;
  }

  if (alert.kind === "recipe_margin_deterioration") {
    const signal = metaValue(alert, "Signal");
    const recipeName = alert.title.replace(/^Modeled margin slip — /i, "");
    if (signal) {
      const pts = signal.match(/−([\d.]+)\s*pts/);
      if (pts) return `${recipeName} food cost +${pts[1]} pts`;
    }
    return alert.title.replace(/^Modeled margin slip — /i, "Margin slip — ");
  }

  if (alert.kind === "price_increase" || alert.kind === "ingredient_inflation_spike") {
    const movement = metaValue(alert, "Movement");
    const name = alert.title.replace(/\s+cost moved up$/i, "").replace(/\s+spike$/i, "");
    const pct = movement?.match(/([\d.]+)/);
    if (pct) return `${name} +${pct[1]}% on invoices`;
    return alert.title;
  }

  if (alert.kind === "portfolio_margin_loss") {
    return alert.title;
  }

  return alert.title.replace(/\.$/, "");
}

export function formatBriefingDetail(alert: MarginAlertItem): string {
  const recipes = metaValue(alert, "Recipes affected") ?? metaValue(alert, "Recipes");
  const supplier = metaValue(alert, "Supplier");
  const parts: string[] = [];

  if (recipes && Number(recipes) > 0) {
    const n = Number(recipes);
    parts.push(`${n} recipe${n === 1 ? "" : "s"} affected`);
  }

  if (supplier) parts.push(supplier);

  if (alert.temporalLine) parts.push(alert.temporalLine);

  if (parts.length > 0) return parts.join(" · ");

  const trimmed = alert.context.split(".")[0]?.trim();
  return trimmed && trimmed.length <= 120 ? trimmed : alert.context.slice(0, 120);
}

function dedupePriorityAlerts(
  alerts: MarginAlertItem[],
  excluded: Set<MarginAlertItem["kind"]>,
  includeInfoPortfolio = true,
): MarginAlertItem[] {
  const byKey = new Map<string, MarginAlertItem>();

  for (const alert of alerts) {
    if (excluded.has(alert.kind)) continue;
    if (alert.severity === "info" && alert.kind !== "portfolio_margin_loss" && !includeInfoPortfolio) {
      if (alert.kind !== "cost_concentration") continue;
    }
    if (alert.severity === "positive") continue;

    const ingredientId = extractIngredientIdFromAlert(alert);
    const key =
      alert.kind === "recipe_below_target" ||
      alert.kind === "recipe_margin_deterioration" ||
      alert.kind === "cost_concentration"
        ? alert.id
        : (ingredientId ?? alert.id);

    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, alert);
      continue;
    }

    const existingRank = severityOrder(existing.severity) * 1_000_000 - existing.priority;
    const nextRank = severityOrder(alert.severity) * 1_000_000 - alert.priority;
    if (nextRank < existingRank) byKey.set(key, alert);
  }

  return [...byKey.values()].sort(
    (a, b) => severityOrder(a.severity) - severityOrder(b.severity) || b.priority - a.priority,
  );
}

function briefingSignalFromAlert(alert: MarginAlertItem): string {
  if (alert.kind === "portfolio_margin_loss") {
    return alert.title.replace(/\.$/, "");
  }
  if (alert.kind === "supplier_trend") {
    const supplier = metaValue(alert, "Supplier");
    return supplier ? `Supplier pressure — ${supplier}` : alert.title.replace(/\.$/, "");
  }
  if (alert.kind === "volatile_pricing") {
    const name = alert.title.replace(/\s+pricing is volatile$/i, "").trim();
    return `${name} — volatile invoice pricing`;
  }
  return formatBriefingHeadline(alert);
}

function briefingDetailFromAlert(alert: MarginAlertItem, data: MarginAlertData): string {
  const supplier = metaValue(alert, "Supplier");
  const recipes = parseRecipesAffected(alert);
  const parts: string[] = [];

  if (alert.kind === "recipe_below_target" || alert.kind === "recipe_margin_deterioration") {
    const below = metaValue(alert, "Below target") ?? metaValue(alert, "Signal");
    if (below) parts.push(below);
    const driver = metaValue(alert, "Largest driver");
    if (driver) parts.push(`Dominant cost: ${driver}`);
  } else if (alert.kind === "price_increase" || alert.kind === "ingredient_inflation_spike") {
    if (supplier) parts.push(supplier);
    if (recipes && recipes > 0) {
      parts.push(`${recipes} recipe${recipes === 1 ? "" : "s"} on this line`);
    }
  } else if (alert.kind === "cost_concentration") {
    const share = metaValue(alert, "Cost share");
    const recipe = metaValue(alert, "Recipe");
    if (share && recipe) parts.push(`${share} of ${recipe} food cost`);
  } else {
    return riskDetailFromAlert(alert, data);
  }

  if (parts.length > 0) return parts.join(" · ");
  const trimmed = alert.context.split(".")[0]?.trim();
  return trimmed && trimmed.length <= 120 ? trimmed : alert.context.slice(0, 120);
}

function pressureSourceFromAlert(alert: MarginAlertItem, data: MarginAlertData): string {
  const supplier = metaValue(alert, "Supplier");
  const ingredientId = extractIngredientIdFromAlert(alert);
  if (alert.kind === "recipe_below_target" || alert.kind === "recipe_margin_deterioration") {
    const driver = metaValue(alert, "Largest driver");
    return driver ? `Recipe margin · ${driver}` : "Recipe margin";
  }
  if (alert.kind === "supplier_trend") {
    return supplier ? `Supplier · ${supplier}` : "Supplier basket";
  }
  if (ingredientId) {
    const name =
      data.ingredients.find((i) => i.id === ingredientId)?.name?.trim() ??
      ingredientLabelFromAlert(alert);
    return supplier ? `${name} · ${supplier}` : `Ingredient · ${name}`;
  }
  return supplier ?? "Portfolio";
}

function whyItMattersFromAlert(alert: MarginAlertItem, data: MarginAlertData): string {
  if (alert.kind === "recipe_below_target" || alert.kind === "recipe_margin_deterioration") {
    const below = metaValue(alert, "Below target") ?? metaValue(alert, "Signal");
    return below
      ? `Cover economics slip ${below} — fix before weekly covers absorb the gap.`
      : "Modeled margin below policy — repricing or portion trim needed on this dish.";
  }
  if (alert.kind === "price_increase" || alert.kind === "ingredient_inflation_spike") {
    const recipes = parseRecipesAffected(alert);
    return recipes && recipes > 0
      ? `Invoice move reprices ${recipes} menu line${recipes === 1 ? "" : "s"} — food cost rises before you change the card.`
      : "Latest invoices lifted this line — menu food cost moves before selling price.";
  }
  if (alert.kind === "supplier_trend") {
    return "Repeated basket increases — negotiate or switch supplier before margin compresses.";
  }
  const trimmed = alert.context.split(".")[0]?.trim();
  return trimmed && trimmed.length <= 160 ? trimmed : alert.suggestedAction;
}

export function buildTodaysMarginRisks(
  data: MarginAlertData,
  alerts: MarginAlertItem[],
  categorySlices: CostCategorySlice[],
  limit = 5,
): TodaysMarginRiskCard[] {
  const usage = getRecipeUsageByIngredient(data.recipes);
  const cards: TodaysMarginRiskCard[] = [];
  const seenEvents = new Set<string>();

  for (const alert of dedupePriorityAlerts(alerts, TODAYS_RISKS_EXCLUDED_KINDS)) {
    const event = briefingSignalFromAlert(alert);
    const eventKey = event.toLowerCase();
    if (seenEvents.has(eventKey)) continue;
    seenEvents.add(eventKey);

    const ingredientId = extractIngredientIdFromAlert(alert);
    const recipeNames = ingredientId ? usage.get(ingredientId)?.recipes : undefined;
    const recipeCount = parseRecipesAffected(alert) ?? recipeNames?.length ?? null;
    const impactLine = monthlyImpactForAlert(alert, data);
    const monthlyImpactEur = parseMonthlyImpactEur(impactLine);

    cards.push({
      id: alert.id,
      tone: severityToBriefingTone(alert.severity),
      pressureSource: pressureSourceFromAlert(alert, data),
      event,
      recipesSummary: formatRecipesSummary(recipeCount, recipeNames),
      estimatedMonthlyImpact: impactLine,
      monthlyImpactEur,
      whyItMatters: whyItMattersFromAlert(alert, data),
      target: alert.target,
      actionLabel: alert.actionLabel,
    });
  }

  const exposureRows = buildPortfolioCostExposure(data, 50);
  const topCategory = categorySlices[0];
  if (cards.length < limit && topCategory && topCategory.sharePct >= 35) {
    const alreadyHasCategory = cards.some((c) => c.id.startsWith("category-risk-"));
    if (!alreadyHasCategory) {
      const catMonthly = exposureRows
        .filter((r) => r.category === topCategory.group)
        .reduce((s, r) => s + r.monthlyModeledExposureEur, 0);
      const sensitivity = exposureRows
        .filter((r) => r.category === topCategory.group)
        .reduce((s, r) => s + (r.totalLineCost ?? 0), 0);
      const catRecipeCount = exposureRows
        .filter((r) => r.category === topCategory.group)
        .reduce((s, r) => s + r.recipeCount, 0);
      const event =
        catMonthly >= 1
          ? `${topCategory.label} — ~${formatCurrency(catMonthly)}/mo at risk`
          : `${topCategory.label} — ${formatPercent(Math.round(topCategory.sharePct))} of menu food cost`;
      const catImpact =
        catMonthly >= 1
          ? formatEstimatedMonthlyEur(catMonthly)
          : formatTenPercentSensitivityLine(sensitivity, catRecipeCount);
      cards.push({
        id: `category-risk-${topCategory.group}`,
        tone: topCategory.sharePct >= 50 ? "amber" : "blue",
        pressureSource: `Category · ${topCategory.label}`,
        event,
        recipesSummary: `${catRecipeCount || "Several"} recipes in category`,
        estimatedMonthlyImpact: catImpact,
        monthlyImpactEur: parseMonthlyImpactEur(catImpact),
        whyItMatters: `${topCategory.label} concentration — one invoice swing hits multiple dishes; protect ${topCategory.label.toLowerCase()}-heavy margin first.`,
        target: "/recipes",
        actionLabel: "Review menu mix",
      });
    }
  }

  if (cards.length < limit) {
    const hasUrgent = cards.some((c) => c.tone === "red" || c.tone === "amber");
    if (!hasUrgent) {
      const stableSauce = alerts.find(
        (a) =>
          a.temporalLine?.toLowerCase().includes("stable") &&
          (a.title.toLowerCase().includes("sauce") ||
            a.title.toLowerCase().includes("molho") ||
            inferCostCategory(a.title) === "sauces"),
      );
      if (stableSauce) {
        cards.push({
          id: `stable-${stableSauce.id}`,
          tone: "green",
          pressureSource: "Sauces · stable basket",
          event: "Sauce costs stable this week",
          recipesSummary: formatRecipesSummary(
            parseRecipesAffected(stableSauce),
            extractIngredientIdFromAlert(stableSauce)
              ? usage.get(extractIngredientIdFromAlert(stableSauce)!)?.recipes
              : undefined,
          ),
          estimatedMonthlyImpact: null,
          monthlyImpactEur: 0,
          whyItMatters:
            stableSauce.temporalLine ?? "Invoice basket steady — no margin action needed today.",
          target: stableSauce.target,
          actionLabel: stableSauce.actionLabel,
        });
      } else if (cards.length === 0) {
        cards.push({
          id: "briefing-stable-week",
          tone: "green",
          pressureSource: "Invoices",
          event: "Stable week on invoices",
          recipesSummary: "Menu portfolio",
          estimatedMonthlyImpact: null,
          monthlyImpactEur: 0,
          whyItMatters: "No material supplier or margin signals — keep the weekly check.",
          target: "/invoices",
          actionLabel: "View invoices",
        });
      }
    }
  }

  return cards
    .sort((a, b) => b.monthlyImpactEur - a.monthlyImpactEur)
    .slice(0, limit);
}

/** @deprecated Use buildTodaysMarginRisks */
export function buildTodaysRisks(
  data: MarginAlertData,
  alerts: MarginAlertItem[],
  categorySlices: CostCategorySlice[],
  limit = 5,
): TodaysMarginRiskCard[] {
  return buildTodaysMarginRisks(data, alerts, categorySlices, limit);
}

export function buildMarginBriefingCards(
  data: MarginAlertData,
  alerts: MarginAlertItem[],
  limit = 4,
): MarginBriefingCard[] {
  return dedupePriorityAlerts(alerts, BRIEFING_EXCLUDED_KINDS)
    .slice(0, limit)
    .map((alert) => ({
      id: alert.id,
      tone: severityToBriefingTone(alert.severity),
      headline: formatBriefingHeadline(alert),
      impactLine: monthlyImpactForAlert(alert, data),
      detail: formatBriefingDetail(alert),
      target: alert.target,
      actionLabel: alert.actionLabel,
    }));
}

const PURCHASING_MOVEMENTS_EXCLUDED_KINDS = new Set<MarginAlertItem["kind"]>([
  "stale_price",
  "recent_update",
]);

/** @deprecated */
const WEEKLY_FEED_EXCLUDED_KINDS = PURCHASING_MOVEMENTS_EXCLUDED_KINDS;

export function buildPurchasingMovements(
  data: MarginAlertData,
  alerts: MarginAlertItem[],
  limit = 5,
): PurchasingMovementItem[] {
  const usage = getRecipeUsageByIngredient(data.recipes);
  const items: PurchasingMovementItem[] = [];
  const seen = new Set<string>();
  const movements = buildPriceMovementRows(data, 12).filter((row) => Math.abs(row.changePct) >= 2);

  for (const row of movements) {
    if (items.length >= limit) break;
    const intel = buildSupplierIntelligence(data, row.ingredientId);
    const pct = row.changePct;
    const names = usage.get(row.ingredientId)?.recipes ?? [];

    let headline: string;
    let detail: string;
    if (intel.spikeVs3MoPct != null && intel.spikeVs3MoPct >= 5) {
      headline = `${row.ingredientName} +${intel.spikeVs3MoPct}% vs 3-month avg`;
      detail =
        intel.betterSupplierLine ??
        "Abnormal shift vs recent invoices — re-quote before the basket sticks.";
    } else if (pct > 0) {
      headline = `${row.ingredientName} +${Math.round(Math.abs(pct))}% on latest invoice`;
      detail =
        names.length > 0
          ? `Basket deterioration on ${names.length} recipe${names.length === 1 ? "" : "s"} — margin compresses before menu price moves.`
          : "Supplier inflation — validate portion and alternate SKU before next buy.";
    } else {
      headline = `${row.ingredientName} ${Math.round(pct)}% — costs easing`;
      detail =
        names.length > 0
          ? `Margin recovery opportunity on ${names.slice(0, 2).join(", ")}${names.length > 2 ? "…" : ""}.`
          : "Invoice basket stabilizing — hold menu price while costs normalize.";
    }

    if (seen.has(headline.toLowerCase())) continue;
    seen.add(headline.toLowerCase());

    const monthly =
      intel.spikeMonthlyEur != null && intel.spikeMonthlyEur >= 1
        ? formatEstimatedMonthlyEur(intel.spikeMonthlyEur)
        : pct > 0
          ? formatEstimatedMonthlyEur(
              estimatePriceIncreaseMonthlyEur(data, row.ingredientId, Math.abs(pct)),
            )
          : null;

    const secondary = [
      monthly,
      intel.stabilityLine,
      intel.betterSupplierLine && pct > 0 ? intel.betterSupplierLine : null,
    ].filter(Boolean);

    items.push({
      id: `purchase-${row.ingredientId}`,
      tone: pct > 2 ? "up" : pct < -2 ? "down" : "stable",
      headline,
      detail,
      impactLine: secondary.length > 0 ? secondary.join(" · ") : null,
      target: "/ingredients",
    });
  }

  const supplierSpike = alerts.find(
    (a) =>
      !PURCHASING_MOVEMENTS_EXCLUDED_KINDS.has(a.kind) &&
      a.kind === "supplier_trend" &&
      (a.severity === "high" || a.severity === "critical"),
  );
  if (supplierSpike && items.length < limit) {
    const supplier = metaValue(supplierSpike, "Supplier");
    const headline = supplier
      ? `${supplier} basket under pressure`
      : supplierSpike.title.replace(/\.$/, "");
    if (!seen.has(headline.toLowerCase())) {
      items.push({
        id: supplierSpike.id,
        tone: "up",
        headline,
        detail:
          "Repeated invoice increases — negotiate consolidated basket or switch lines hitting most recipes.",
        impactLine: metaValue(supplierSpike, "Supplier") ?? null,
        target: supplierSpike.target,
      });
    }
  }

  const stabilizing = alerts.filter(
    (a) =>
      a.kind === "price_decrease" ||
      (a.temporalLine?.toLowerCase().includes("stable") && a.severity !== "critical"),
  );
  for (const alert of stabilizing.slice(0, 1)) {
    if (items.length >= limit) break;
    const name = ingredientLabelFromAlert(alert);
    const headline =
      alert.kind === "price_decrease"
        ? `${name} stabilizing after prior spike`
        : `${name} — stable supplier pricing`;
    if (seen.has(headline.toLowerCase())) continue;
    seen.add(headline.toLowerCase());
    items.push({
      id: `stable-purchase-${alert.id}`,
      tone: "stable",
      headline,
      detail:
        alert.kind === "price_decrease"
          ? "Costs easing — capture margin recovery without menu repricing."
          : alert.temporalLine ?? "Invoice basket steady — no purchasing action required.",
      impactLine: null,
      target: alert.target,
    });
  }

  const hasInflation = items.some((i) => i.tone === "up");
  if (!hasInflation && items.length < limit) {
    items.push({
      id: "purchase-calm",
      tone: "calm",
      headline: "No meaningful supplier inflation vs recent averages",
      detail: "Purchasing baskets steady — focus on recipe margin levers instead of re-quotes.",
      impactLine: null,
      target: "/invoices",
    });
  }

  return items.slice(0, limit);
}

/** @deprecated Use buildPurchasingMovements */
export function buildWeeklyChangeFeed(
  data: MarginAlertData,
  alerts: MarginAlertItem[],
  _categorySlices: CostCategorySlice[],
  limit = 5,
): WeeklyChangeFeedItem[] {
  return buildPurchasingMovements(data, alerts, limit).map((item) => ({
    id: item.id,
    tone: item.tone,
    summary: item.headline,
    impactLine: item.impactLine,
    recipeNames: [],
    target: item.target,
  }));
}

export function buildMenuDependencies(
  data: MarginAlertData,
  alerts: MarginAlertItem[],
  exposureRows: CostExposureRow[],
  categorySlices: CostCategorySlice[],
  limit = 8,
): MenuDependencyRow[] {
  const usage = getRecipeUsageByIngredient(data.recipes);
  const rows: MenuDependencyRow[] = [];
  const recipeMetrics = getRecipeMetrics(data.recipes).filter((m) => m.recipe.type !== "prep");

  const shared = [...usage.entries()]
    .filter(([, u]) => u.count >= 2)
    .sort((a, b) => b[1].count - a[1].count);

  for (const [ingredientId, u] of shared.slice(0, 4)) {
    const exposure = exposureRows.find((r) => r.ingredientId === ingredientId);
    const ingredientName =
      exposure?.ingredientName ??
      data.ingredients.find((i) => i.id === ingredientId)?.name ??
      "Ingredient";
    rows.push({
      id: `shared-${ingredientId}`,
      kind: "shared_ingredient",
      title: `${ingredientName} on ${u.count} recipes`,
      detail: `One invoice move reprices ${u.count} dishes — negotiate or trim portions once.`,
      exposurePct: exposure?.costSharePct ?? null,
      recipeNames: u.recipes.slice(0, 6),
      target: "/ingredients",
      actionLabel: "Review ingredient",
    });
  }

  const topCategory = categorySlices[0];
  if (topCategory && topCategory.sharePct >= 25) {
    rows.push({
      id: `category-${topCategory.group}`,
      kind: "category_concentration",
      title: `${topCategory.label} — ${formatPercent(Math.round(topCategory.sharePct))} of modeled food cost`,
      detail: `Category concentration: protect margin on ${topCategory.label.toLowerCase()}-heavy dishes first.`,
      exposurePct: topCategory.sharePct,
      recipeNames: [],
      target: "/recipes",
      actionLabel: "View menu",
    });
  }

  for (const metric of recipeMetrics) {
    const topLine = metric.topLine;
    if (!topLine || topLine.contribution < 55) continue;
    if (rows.length >= limit) break;
    rows.push({
      id: `lever-${metric.recipe.id}`,
      kind: "recipe_margin_lever",
      title: `${metric.recipe.name}: ${topLine.ingredientName} controls ${formatPercent(Math.round(topLine.contribution))}`,
      detail:
        metric.grossMargin != null
          ? `Margin ${formatPercent(Math.round(metric.grossMargin))} — ${formatCurrency(topLine.lineCost)}/portion on this line`
          : `${formatCurrency(topLine.lineCost)}/portion on dominant ingredient`,
      exposurePct: topLine.contribution,
      recipeNames: [metric.recipe.name],
      target: "/recipes",
      actionLabel: "Open recipe",
    });
  }

  const stale = alerts.filter((a) => a.kind === "stale_price").slice(0, 2);
  for (const alert of stale) {
    const ingredientId = extractIngredientIdFromAlert(alert);
    const u = ingredientId ? usage.get(ingredientId) : null;
    if (!u || u.count < 1) continue;
    rows.push({
      id: `stale-dep-${alert.id}`,
      kind: "shared_ingredient",
      title: `Stale ${alert.title.replace(/\s+pricing is stale$/i, "")} — ${u.count} recipe${u.count === 1 ? "" : "s"}`,
      detail: "Costs may be understated until the next invoice sync.",
      exposurePct: null,
      recipeNames: u.recipes.slice(0, 4),
      target: alert.target,
      actionLabel: alert.actionLabel,
    });
  }

  return rows.slice(0, limit);
}

export function buildStalePricingBadges(alerts: MarginAlertItem[], limit = 4): StalePricingBadge[] {
  return alerts
    .filter((a) => a.kind === "stale_price")
    .slice(0, limit)
    .map((a) => {
      const ingredientId = extractIngredientIdFromAlert(a) ?? a.id;
      const label = a.title.replace(/\s+pricing is stale$/i, "");
      return { ingredientId, label };
    });
}

function estimatePortionReductionImpact(metric: RecipeMetric): {
  perPortion: string | null;
  monthlyEur: number;
  monthly: string | null;
} {
  if (!metric.topLine || metric.foodCost <= 0) {
    return { perPortion: null, monthlyEur: 0, monthly: null };
  }
  const save = metric.topLine.lineCost * 0.1;
  if (save < 0.01) return { perPortion: null, monthlyEur: 0, monthly: null };
  const monthlyEur = Math.round(save * ESTIMATED_COVERS_PER_MENU_RECIPE);
  const perPortion = `Est. ${formatCurrency(save)}/portion (−10% ${metric.topLine.ingredientName})`;
  return {
    perPortion,
    monthlyEur,
    monthly: formatEstimatedMonthlyEur(monthlyEur),
  };
}

function urgencyFromImpact(
  monthlyImpactEur: number,
  severity?: MarginAlertSeverity,
): RecommendedActionCard["urgency"] {
  if (severity === "critical" || monthlyImpactEur >= 250) return "now";
  if (severity === "high" || monthlyImpactEur >= 75) return "this_week";
  return "monitor";
}

function urgencyLabel(urgency: RecommendedActionCard["urgency"]): string {
  if (urgency === "now") return "Act now";
  if (urgency === "this_week") return "This week";
  return "Monitor";
}

function formatRecoveryImpact(monthlyEur: number): string {
  return `Potential recovery Est. ${formatCurrency(monthlyEur)}/mo`;
}

function formatCostExposureImpact(monthlyEur: number): string {
  return `May cost Est. ${formatCurrency(monthlyEur)}/mo if unaddressed`;
}

function minHistoricalUnitPrice(
  ingredientId: string,
  history: PriceHistoryRecord[],
): number | null {
  const prices = history
    .filter((row) => row.ingredient_id === ingredientId)
    .map((row) => numberOrNull(row.new_price))
    .filter((p): p is number => p != null && p > 0);
  if (prices.length === 0) return null;
  return Math.min(...prices);
}

function suggestSellingPriceBump(metric: RecipeMetric): {
  bumpEur: number;
  gapPts: number;
} | null {
  if (metric.grossMargin == null || metric.sellingPrice <= 0) return null;
  const gapPts = TARGET_MARGIN - metric.grossMargin;
  if (gapPts <= 0) return null;
  const targetPrice = metric.foodCost / (1 - TARGET_MARGIN / 100);
  const bumpEur = Math.max(0.5, Math.round((targetPrice - metric.sellingPrice) * 100) / 100);
  return { bumpEur, gapPts };
}

function recommendationToCard(rec: OperationalRecommendation): RecommendedActionCard {
  const estimatedImpact =
    [rec.perPortionImpact, rec.monthlyImpact].filter(Boolean).join(" · ") || rec.monthlyImpact;
  return {
    id: rec.id,
    category: rec.category,
    categoryLabel: RECOMMENDATION_CATEGORY_LABELS[rec.category],
    monthlyImpactEur: rec.monthlyImpactEur,
    priority: rec.priority,
    urgency: rec.urgency,
    urgencyLabel: urgencyLabel(rec.urgency),
    title: rec.title,
    why: rec.why,
    action: rec.action,
    perPortionImpact: rec.perPortionImpact,
    monthlyImpact: rec.monthlyImpact,
    estimatedImpact,
    affectedRecipes: rec.affectedRecipes,
    target: rec.target,
    actionLabel: rec.actionLabel,
  };
}

function collectSupplierCompetitivenessRecommendations(
  data: MarginAlertData,
  alerts: MarginAlertItem[],
): OperationalRecommendation[] {
  const usage = getRecipeUsageByIngredient(data.recipes);
  const ingredientById = new Map(data.ingredients.map((i) => [i.id, i]));
  const out: OperationalRecommendation[] = [];
  const seenIngredient = new Set<string>();

  for (const ingredient of data.ingredients) {
    const catalogUnit = effectiveUnitCost(ingredient);
    const minHistorical = minHistoricalUnitPrice(ingredient.id, data.priceHistory);
    if (catalogUnit <= 0 || minHistorical == null || minHistorical <= 0) continue;
    if (catalogUnit <= minHistorical * 1.04) continue;

    const gapPct = ((catalogUnit - minHistorical) / minHistorical) * 100;
    const monthlyEur =
      estimatePriceIncreaseMonthlyEur(data, ingredient.id, gapPct) ?? 0;
    if (monthlyEur < 1) continue;

    const name = ingredient.name?.trim() || "Ingredient";
    const recipeNames = usage.get(ingredient.id)?.recipes ?? [];
    const supplierRow = getLatestHistoryByIngredient(data.priceHistory).find(
      (r) => r.ingredient_id === ingredient.id,
    );
    const supplier = supplierRow?.supplier_name?.trim();

    out.push({
      id: `rec-supplier-catalog-${ingredient.id}`,
      category: "supplier_actions",
      monthlyImpactEur: monthlyEur,
      priority: 180 + Math.min(gapPct, 40),
      dedupeKey: `supplier_actions:${ingredient.id}`,
      title: `Re-quote ${name} — catalog above invoice low`,
      why: supplier
        ? `${name} is modeled at ${formatPercent(Math.round(gapPct))} above the best recent ${supplier} invoice.`
        : `${name} catalog price sits ${formatPercent(Math.round(gapPct))} above your lowest tracked invoice.`,
      action: `Challenge ${supplier ?? "supplier"} pricing or switch to the lower invoice basket before the next buy.`,
      perPortionImpact: null,
      monthlyImpact: formatCostExposureImpact(monthlyEur),
      affectedRecipes: recipeNames.length || null,
      target: "/ingredients",
      actionLabel: "Compare suppliers",
      urgency: urgencyFromImpact(monthlyEur, "high"),
    });
    seenIngredient.add(ingredient.id);
  }

  for (const alert of alerts) {
    if (alert.kind !== "price_increase" && alert.kind !== "ingredient_inflation_spike") continue;
    const ingredientId = extractIngredientIdFromAlert(alert);
    if (!ingredientId || seenIngredient.has(ingredientId)) continue;

    const pct = parseMovementPercent(alert) ?? 0;
    const monthlyEur = estimatePriceIncreaseMonthlyEur(data, ingredientId, pct) ?? 0;
    if (monthlyEur < 1) continue;

    const name = ingredientLabelFromAlert(alert);
    const supplier = metaValue(alert, "Supplier");
    const recipeCount =
      parseRecipesAffected(alert) ?? usage.get(ingredientId)?.recipes.length ?? null;

    out.push({
      id: `rec-supplier-alert-${alert.id}`,
      category: "supplier_actions",
      monthlyImpactEur: monthlyEur,
      priority: alert.priority + (alert.severity === "critical" ? 500 : 0),
      dedupeKey: `supplier_actions:${ingredientId}`,
      title: `Supplier pressure on ${name}`,
      why: supplier
        ? `Latest invoices from ${supplier} lifted ${name} — margin on linked dishes compresses.`
        : `Invoice basket moved up on ${name} — check alternate suppliers before service.`,
      action: `Re-quote ${name} with at least one alternate supplier and pass selective menu updates.`,
      perPortionImpact: null,
      monthlyImpact: formatCostExposureImpact(monthlyEur),
      affectedRecipes: recipeCount,
      target: alert.target,
      actionLabel: alert.actionLabel,
      urgency: urgencyFromImpact(monthlyEur, alert.severity),
    });
    seenIngredient.add(ingredientId);
  }

  for (const alert of alerts) {
    if (alert.kind !== "supplier_trend") continue;
    const supplier = metaValue(alert, "Supplier");
    const key = supplier?.toLowerCase() ?? alert.id;
    if (out.some((r) => r.dedupeKey === `supplier_actions:supplier:${key}`)) continue;

    const monthlyEur = 120;
    out.push({
      id: `rec-supplier-trend-${alert.id}`,
      category: "supplier_actions",
      monthlyImpactEur: monthlyEur,
      priority: alert.priority,
      dedupeKey: `supplier_actions:supplier:${key}`,
      title: supplier ? `Re-quote ${supplier} basket` : "Supplier basket under pressure",
      why: alert.context.split(".")[0]?.trim() || "Repeated invoice increases on this supplier.",
      action: "Consolidate SKUs and negotiate the lines that hit the most recipes first.",
      perPortionImpact: null,
      monthlyImpact: formatCostExposureImpact(monthlyEur),
      affectedRecipes: parseRecipesAffected(alert),
      target: alert.target,
      actionLabel: alert.actionLabel,
      urgency: urgencyFromImpact(monthlyEur, alert.severity),
    });
  }

  return out;
}

function ingredientLabelFromAlert(alert: MarginAlertItem): string {
  return alert.title
    .replace(/\s+cost moved up$/i, "")
    .replace(/\s+spike$/i, "")
    .replace(/\s+pricing is stale$/i, "")
    .replace(/\s+pricing is volatile$/i, "")
    .trim();
}

function collectMarginDeteriorationRecommendations(
  data: MarginAlertData,
  alerts: MarginAlertItem[],
): OperationalRecommendation[] {
  const out: OperationalRecommendation[] = [];
  const menuMetrics = getRecipeMetrics(data.recipes).filter((m) => m.recipe.type !== "prep");

  for (const alert of alerts) {
    if (alert.kind !== "recipe_below_target" && alert.kind !== "recipe_margin_deterioration") {
      continue;
    }
    const recipeId = alert.id.replace(/^recipe-margin-/, "");
    const metric = menuMetrics.find((m) => m.recipe.id === recipeId);
    if (!metric) continue;

    const monthlyEur = estimateRecipeMarginGapMonthlyEur(metric) ?? 0;
    const gapPts =
      metric.grossMargin != null ? Math.max(0, TARGET_MARGIN - metric.grossMargin) : 0;
    const driver = metaValue(alert, "Largest driver") ?? metric.topLine?.ingredientName;

    out.push({
      id: `rec-margin-${recipeId}`,
      category: "margin_deterioration",
      monthlyImpactEur: monthlyEur,
      priority: alert.priority + gapPts * 10,
      dedupeKey: `margin_deterioration:${recipeId}`,
      title:
        alert.kind === "recipe_margin_deterioration"
          ? `Margin slip on ${metric.recipe.name}`
          : `${metric.recipe.name} below margin policy`,
      why:
        alert.kind === "recipe_margin_deterioration"
          ? `Modeled food cost drifted — ${driver ?? "cost lines"} now dominate the plate economics.`
          : `Gross margin is ${formatPercent(Math.round(metric.grossMargin ?? 0))} vs ${TARGET_MARGIN}% target — ${driver ?? "top cost line"} drives the gap.`,
      action:
        alert.kind === "recipe_margin_deterioration"
          ? `Stabilize ${metric.recipe.name} before the slip spreads to weekly covers.`
          : `Rebalance ${metric.recipe.name} cost (portion or supplier) before the next menu cycle.`,
      perPortionImpact: null,
      monthlyImpact:
        monthlyEur >= 1 ? formatRecoveryImpact(monthlyEur) : `~${Math.round(gapPts)} pts under target`,
      affectedRecipes: 1,
      target: "/recipes",
      actionLabel: "Open recipe",
      urgency: urgencyFromImpact(monthlyEur, alert.severity),
    });
  }

  for (const metric of menuMetrics) {
    if (metric.grossMargin == null || metric.grossMargin >= TARGET_MARGIN) continue;
    if (out.some((r) => r.dedupeKey === `margin_deterioration:${metric.recipe.id}`)) continue;

    const monthlyEur = estimateRecipeMarginGapMonthlyEur(metric) ?? 0;
    const gapPts = TARGET_MARGIN - metric.grossMargin;
    out.push({
      id: `rec-margin-metric-${metric.recipe.id}`,
      category: "margin_deterioration",
      monthlyImpactEur: monthlyEur,
      priority: 100 + gapPts * 10,
      dedupeKey: `margin_deterioration:${metric.recipe.id}`,
      title: `${metric.recipe.name} under margin policy`,
      why: `At current portions and price, margin is ${formatPercent(Math.round(metric.grossMargin))} — ${formatPercent(Math.round(gapPts))} below target.`,
      action: `Review costing on ${metric.recipe.name} before it becomes a daily leak.`,
      perPortionImpact: null,
      monthlyImpact: monthlyEur >= 1 ? formatRecoveryImpact(monthlyEur) : null,
      affectedRecipes: 1,
      target: "/recipes",
      actionLabel: "Open recipe",
      urgency: urgencyFromImpact(monthlyEur),
    });
  }

  return out;
}

function collectSellingPriceRecommendations(data: MarginAlertData): OperationalRecommendation[] {
  const out: OperationalRecommendation[] = [];
  const menuMetrics = getRecipeMetrics(data.recipes).filter((m) => m.recipe.type !== "prep");

  for (const metric of menuMetrics) {
    const bump = suggestSellingPriceBump(metric);
    if (!bump) continue;

    const monthlyEur = estimateRecipeMarginGapMonthlyEur(metric) ?? 0;
    out.push({
      id: `rec-price-${metric.recipe.id}`,
      category: "price_actions",
      monthlyImpactEur: monthlyEur,
      priority: 150 + bump.gapPts * 12,
      dedupeKey: `price_actions:${metric.recipe.id}`,
      title: `Raise ${metric.recipe.name} menu price`,
      why: `Selling at ${formatCurrency(metric.sellingPrice)} leaves ${formatPercent(Math.round(bump.gapPts))} margin gap on a high-cover item.`,
      action: `Test +${formatCurrency(bump.bumpEur)} on the menu card (~${formatPercent(Math.round(bump.gapPts))} pts recovery) before trimming portions.`,
      perPortionImpact: `Est. +${formatCurrency(bump.bumpEur)}/portion to target margin`,
      monthlyImpact: monthlyEur >= 1 ? formatRecoveryImpact(monthlyEur) : null,
      affectedRecipes: 1,
      target: "/recipes",
      actionLabel: "Adjust price",
      urgency: urgencyFromImpact(monthlyEur),
    });
  }

  return out;
}

function collectPortionOptimizationRecommendations(
  data: MarginAlertData,
): OperationalRecommendation[] {
  const out: OperationalRecommendation[] = [];
  const menuMetrics = getRecipeMetrics(data.recipes).filter((m) => m.recipe.type !== "prep");

  for (const metric of menuMetrics) {
    const topLine = metric.topLine;
    if (!topLine || topLine.contribution < 55) continue;

    const portion = estimatePortionReductionImpact(metric);
    if (portion.monthlyEur < 1) continue;

    out.push({
      id: `rec-portion-${metric.recipe.id}`,
      category: "portion_actions",
      monthlyImpactEur: portion.monthlyEur,
      priority: 120 + topLine.contribution,
      dedupeKey: `portion_actions:${metric.recipe.id}`,
      title: `Trim ${topLine.ingredientName} on ${metric.recipe.name}`,
      why: `${topLine.ingredientName} is ${formatPercent(Math.round(topLine.contribution))} of plate cost — small portion trims move margin fastest.`,
      action: `Reduce ${topLine.ingredientName} by ~10% (${formatCurrency(topLine.lineCost * 0.1)}/portion) and re-weigh once on prep.`,
      perPortionImpact: portion.perPortion,
      monthlyImpact: formatRecoveryImpact(portion.monthlyEur),
      affectedRecipes: 1,
      target: "/recipes",
      actionLabel: "Open recipe",
      urgency: urgencyFromImpact(portion.monthlyEur),
    });
  }

  return out;
}

function collectConcentrationRiskRecommendations(
  data: MarginAlertData,
): OperationalRecommendation[] {
  const out: OperationalRecommendation[] = [];
  const menuMetrics = getRecipeMetrics(data.recipes).filter((m) => m.recipe.type !== "prep");

  for (const metric of menuMetrics) {
    const topLine = metric.topLine;
    if (!topLine || topLine.contribution < 60) continue;

    const monthlyEur = Math.round(topLine.lineCost * 0.05 * ESTIMATED_COVERS_PER_MENU_RECIPE);
    if (monthlyEur < 1) continue;

    out.push({
      id: `rec-concentration-${metric.recipe.id}`,
      category: "concentration_risk",
      monthlyImpactEur: monthlyEur,
      priority: 40 + topLine.contribution,
      dedupeKey: `concentration_risk:${metric.recipe.id}`,
      title: `${metric.recipe.name}: ${topLine.ingredientName} is ${formatPercent(Math.round(topLine.contribution))} of plate cost`,
      why: `One ingredient dominates this dish — invoice moves on ${topLine.ingredientName} move margin immediately.`,
      action: `Negotiate ${topLine.ingredientName} or trim portion before repricing the whole menu item.`,
      perPortionImpact: `~${formatPercent(Math.round(topLine.contribution))} of food cost on this line`,
      monthlyImpact: formatCostExposureImpact(monthlyEur),
      affectedRecipes: 1,
      target: "/recipes",
      actionLabel: "Open recipe",
      urgency: urgencyFromImpact(monthlyEur),
    });
  }

  return out;
}

function collectStabilitySignalRecommendations(
  data: MarginAlertData,
  alerts: MarginAlertItem[],
): OperationalRecommendation[] {
  const out: OperationalRecommendation[] = [];
  const calmAlerts = alerts.filter(
    (a) =>
      a.severity === "positive" ||
      a.temporalLine?.toLowerCase().includes("stable") ||
      a.kind === "price_decrease",
  );

  if (calmAlerts.length === 0) {
    const movements = buildPriceMovementRows(data, 8);
    if (movements.length === 0) {
      out.push({
        id: "rec-stability-quiet-week",
        category: "stability_signals",
        monthlyImpactEur: 0,
        priority: 5,
        dedupeKey: "stability_signals:quiet",
        title: "Quiet week on invoices",
        why: "No material supplier basket moves — margin drivers unchanged.",
        action: "Keep the weekly invoice check; no pricing action required today.",
        perPortionImpact: null,
        monthlyImpact: null,
        affectedRecipes: null,
        target: "/invoices",
        actionLabel: "View invoices",
        urgency: "monitor",
      });
    }
    return out;
  }

  for (const alert of calmAlerts.slice(0, 2)) {
    const ingredientId = extractIngredientIdFromAlert(alert);
    const name = ingredientLabelFromAlert(alert);
    if (ingredientId) {
      const intel = buildSupplierIntelligence(data, ingredientId);
      if (!intel.stabilityLine && alert.kind !== "price_decrease") continue;
    }
    out.push({
      id: `rec-stability-${alert.id}`,
      category: "stability_signals",
      monthlyImpactEur: 0,
      priority: 10,
      dedupeKey: `stability_signals:${alert.id}`,
      title:
        alert.kind === "price_decrease"
          ? `${name} costs easing`
          : `${name} — stable supplier pricing`,
      why:
        alert.kind === "price_decrease"
          ? alert.context.split(".")[0]?.trim() || "Invoice basket moved down — margin headroom improving."
          : ingredientId
            ? buildSupplierIntelligence(data, ingredientId).stabilityLine ??
              "Invoice basket steady on this line."
            : alert.temporalLine ?? "No volatility on recent invoices.",
      action:
        alert.kind === "price_decrease"
          ? "Hold menu price while costs normalize — capture margin recovery on affected recipes."
          : "No action needed — monitor on the next invoice cycle.",
      perPortionImpact: null,
      monthlyImpact: null,
      affectedRecipes: parseRecipesAffected(alert),
      target: alert.target,
      actionLabel: alert.actionLabel,
      urgency: "monitor",
    });
  }

  return out;
}

function collectRecoveryOpportunityRecommendations(
  data: MarginAlertData,
  alerts: MarginAlertItem[],
): OperationalRecommendation[] {
  const out: OperationalRecommendation[] = [];

  for (const alert of alerts) {
    if (alert.kind !== "price_decrease") continue;
    const ingredientId = extractIngredientIdFromAlert(alert);
    if (!ingredientId) continue;

    const pct = Math.abs(parseMovementPercent(alert) ?? 0);
    const monthlyEur = estimatePriceIncreaseMonthlyEur(data, ingredientId, pct) ?? 0;
    const recoveryEur = monthlyEur >= 1 ? monthlyEur : 0;
    const name = ingredientLabelFromAlert(alert);

    out.push({
      id: `rec-recovery-${alert.id}`,
      category: "recovery_opportunities",
      monthlyImpactEur: recoveryEur,
      priority: 130 + pct,
      dedupeKey: `recovery_opportunities:${ingredientId}`,
      title: `Margin recovery — ${name} normalizing`,
      why: `Invoices show ${pct > 0 ? `−${Math.round(pct)}%` : "lower"} pricing — food cost headroom on linked recipes.`,
      action: "Keep menu price steady while costs ease; revisit portions only if quality slipped.",
      perPortionImpact: null,
      monthlyImpact:
        recoveryEur >= 1 ? formatRecoveryImpact(recoveryEur) : "Cost normalization in progress",
      affectedRecipes: parseRecipesAffected(alert),
      target: alert.target,
      actionLabel: alert.actionLabel,
      urgency: "monitor",
    });
  }

  return out;
}

export function collectOperationalRecommendations(
  data: MarginAlertData,
  alerts: MarginAlertItem[],
  _categorySlices: CostCategorySlice[] = [],
): OperationalRecommendation[] {
  return [
    ...collectSupplierCompetitivenessRecommendations(data, alerts),
    ...collectMarginDeteriorationRecommendations(data, alerts),
    ...collectSellingPriceRecommendations(data),
    ...collectPortionOptimizationRecommendations(data),
    ...collectRecoveryOpportunityRecommendations(data, alerts),
    ...collectConcentrationRiskRecommendations(data),
    ...collectStabilitySignalRecommendations(data, alerts),
  ];
}

export function buildRecoveryOpportunities(
  data: MarginAlertData,
  alerts: MarginAlertItem[],
  excludeTitles: string[] = [],
  limit = 5,
): RecoveryOpportunityCard[] {
  const excluded = new Set(excludeTitles.map((t) => t.toLowerCase()));
  const filteredAlerts = alerts.filter((a) => a.kind !== "stale_price");
  const candidates = collectOperationalRecommendations(data, filteredAlerts).filter((rec) => {
    if (rec.category === "stability_signals" || rec.category === "concentration_risk") {
      return false;
    }
    if (rec.category === "recovery_opportunities") return true;
    if (rec.category === "price_actions") return true;
    if (rec.category === "portion_actions") return true;
    if (
      rec.category === "supplier_actions" &&
      rec.title.toLowerCase().includes("catalog above invoice")
    ) {
      return true;
    }
    return false;
  });

  const cards: RecoveryOpportunityCard[] = [];
  for (const rec of finalizeOperationalRecommendations(candidates, limit + 4)) {
    if (cards.length >= limit) break;
    if (excluded.has(rec.title.toLowerCase())) continue;
    excluded.add(rec.title.toLowerCase());

    cards.push({
      id: rec.id,
      title: rec.title,
      why: rec.why,
      savingsLine: rec.monthlyImpact ?? rec.perPortionImpact,
      action: rec.action,
      target: rec.target,
      actionLabel: rec.actionLabel,
      monthlyImpactEur: rec.monthlyImpactEur,
    });
  }

  return cards.sort((a, b) => b.monthlyImpactEur - a.monthlyImpactEur).slice(0, limit);
}

export function buildExecutiveSummary(input: {
  pulseLine: string;
  categoryPressure: CategoryPressureRow[];
  topRisk: TodaysMarginRiskCard | null;
  purchasingCalm: boolean;
}): string {
  const inflating = input.categoryPressure.filter(
    (r) => r.trend === "up" && r.pressureLine !== "Stable" && r.pressureLine !== "Recovering",
  );
  const recovering = input.categoryPressure.filter((r) => r.pressureLine === "Recovering");

  if (input.topRisk && input.topRisk.monthlyImpactEur >= 1) {
    const catBit =
      inflating.length > 0
        ? ` despite ${inflating.map((c) => c.label.toLowerCase()).join(" and ")} inflation`
        : "";
    return `Top risk: ${input.topRisk.event.replace(/\.$/, "")} (~${formatCurrency(input.topRisk.monthlyImpactEur)}/mo)${catBit}.`;
  }

  if (recovering.length > 0 && inflating.length === 0) {
    return `Menu margin recovering as ${recovering.map((c) => c.label.toLowerCase()).join(" and ")} costs ease.`;
  }

  if (inflating.length > 0 && !input.purchasingCalm) {
    const top = inflating[0]!;
    return `Menu margin under ${top.label.toLowerCase()} pressure${top.inflationVs3MoPct != null ? ` (+${Math.round(top.inflationVs3MoPct)}% vs 3mo)` : ""} — prioritize purchasing on dominant lines.`;
  }

  if (input.purchasingCalm) {
    return "Menu margin stable — no meaningful supplier inflation vs recent averages.";
  }

  const stableCats = input.categoryPressure.filter((r) => r.pressureLine === "Stable");
  if (stableCats.length >= 2) {
    return `Menu margin stable despite routine invoice noise — ${stableCats
      .slice(0, 2)
      .map((c) => c.label.toLowerCase())
      .join(" and ")} baskets steady.`;
  }

  return input.pulseLine.replace(/\.$/, "") + ".";
}

/** One calm status line from visit delta, purchasing movements, and margin trends. */
export function buildOperationalPulseLine(input: {
  visitDelta: MarginVisitDelta;
  purchasingMovements?: PurchasingMovementItem[];
  weeklyFeed?: WeeklyChangeFeedItem[];
  alerts: MarginAlertItem[];
  data: MarginAlertData;
}): string {
  const feed: { tone: PurchasingMovementItem["tone"]; line: string }[] =
    input.purchasingMovements
      ? input.purchasingMovements.map((p) => ({ tone: p.tone, line: p.headline }))
      : (input.weeklyFeed ?? []).map((f) => ({ tone: f.tone, line: f.summary }));

  const decreases = input.alerts.filter((a) => a.kind === "price_decrease");
  if (decreases.length > 0) {
    const name = ingredientLabelFromAlert(decreases[0]!);
    return `Margins recovering after ${name} normalization`;
  }

  const unstable = input.alerts.filter(
    (a) =>
      a.kind === "volatile_pricing" ||
      (a.kind === "supplier_trend" &&
        (a.severity === "high" || a.severity === "critical")),
  );
  if (unstable.length >= 2) return "Supplier instability detected — re-quote baskets this week";
  if (unstable.length === 1) {
    const supplier = unstable[0]!.meta.find((m) => m.label === "Supplier")?.value;
    return supplier
      ? `Supplier pressure on ${supplier} — watch invoice basket`
      : unstable[0]!.title.replace(/\.$/, "");
  }

  const upMoves = feed.filter((f) => f.tone === "up");
  if (upMoves.length >= 2) {
    return `${upMoves.length} purchasing price moves — review top supplier lines`;
  }
  if (upMoves.length === 1) return upMoves[0]!.line;

  const marginSlip = input.alerts.filter((a) => a.kind === "recipe_margin_deterioration");
  if (marginSlip.length > 0) {
    return "Menu margins under pressure — check flagged recipes";
  }

  const calmWeek = feed.length === 1 && feed[0]?.tone === "calm";
  if (calmWeek) return "Quiet week on invoices";

  const visitLine = input.visitDelta.lines.find((l) => l.length > 0);
  if (visitLine && !input.visitDelta.isFirstVisit) {
    return visitLine.replace(/^·\s*/, "");
  }

  const recipesAtRisk = getRecipeMetrics(input.data.recipes).filter(
    (m) => m.recipe.type !== "prep" && (m.grossMargin ?? 0) < TARGET_MARGIN,
  ).length;
  if (recipesAtRisk > 0) {
    return `${recipesAtRisk} menu recipe${recipesAtRisk === 1 ? "" : "s"} below ${TARGET_MARGIN}% margin target`;
  }

  return "Portfolio stable — keep the weekly invoice check";
}

export function finalizeOperationalRecommendations(
  candidates: OperationalRecommendation[],
  limit = 6,
): OperationalRecommendation[] {
  const byKey = new Map<string, OperationalRecommendation>();
  for (const rec of candidates) {
    const existing = byKey.get(rec.dedupeKey);
    if (!existing || rec.monthlyImpactEur > existing.monthlyImpactEur) {
      byKey.set(rec.dedupeKey, rec);
    }
  }

  const usedTitles = new Set<string>();
  return [...byKey.values()]
    .filter((rec) => {
      const key = rec.title.toLowerCase();
      if (usedTitles.has(key)) return false;
      usedTitles.add(key);
      return true;
    })
    .sort((a, b) => b.monthlyImpactEur - a.monthlyImpactEur || b.priority - a.priority)
    .slice(0, limit);
}

export function buildRecommendedActions(
  data: MarginAlertData,
  alerts: MarginAlertItem[],
  limit = 6,
  categorySlices: CostCategorySlice[] = [],
  options?: { excludeRecoveryTitles?: string[] },
): RecommendedActionCard[] {
  const filteredAlerts = alerts.filter((a) => a.kind !== "stale_price");
  const excluded = new Set(
    (options?.excludeRecoveryTitles ?? []).map((t) => t.toLowerCase()),
  );
  const candidates = collectOperationalRecommendations(data, filteredAlerts, categorySlices).filter(
    (rec) => {
      if (rec.category === "recovery_opportunities") return false;
      if (excluded.has(rec.title.toLowerCase())) return false;
      return true;
    },
  );
  return finalizeOperationalRecommendations(candidates, limit).map(recommendationToCard);
}
