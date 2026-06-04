import { formatCurrency, formatPercent } from "@/lib/display-format";
import { detectOperationalFamily } from "@/lib/ingredient-operational-families";
import {
  getRecipeMetrics,
  TARGET_MARGIN,
  type MarginAlertData,
  type MarginAlertItem,
  type MarginAlertSeverity,
  type MarginAlertTarget,
  type OperationalHealthPanel,
  type RecipeMetric,
} from "@/lib/margin-alert-data";
import {
  buildCategoryPressureRows,
  buildCostCategorySlices,
  buildPortfolioCostExposure,
  buildRecoveryOpportunities,
  buildTopOperationalExposures,
  estimateTenPercentSensitivityEur,
  buildTodaysMarginRisks,
  collectOperationalRecommendations,
  extractIngredientIdFromAlert,
  finalizeOperationalRecommendations,
  inferCostCategory,
  type CategoryPressureRow,
  type CostCategoryGroup,
  type CostCategorySlice,
  type CostExposureRow,
  type OperationalExposureRow,
  type OperationalRecommendation,
  type OperationalRecommendationCategory,
  type RecoveryOpportunityCard,
  type TodaysMarginRiskCard,
} from "@/lib/operational-intelligence-view";

export type OperationalInsightPriority = "critical" | "warning" | "monitor" | "informational";
export type OperationalInsightTier = "tier_1" | "tier_2" | "tier_3";
/** Operator decision hierarchy — what to do with this signal right now. */
export type OperationalDecisionTier = "now" | "monitor" | "background";

export type RecoveryActionType =
  | "portion_optimization"
  | "supplier_negotiation"
  | "recipe_standardization"
  | "menu_repricing"
  | "prep_optimization";

export type MonthlyMarginPressureSummary = {
  estimatedMarginPressureEur: number;
  estimatedMarginPressureLine: string;
  biggestInflationDriver: string | null;
  mostAffectedCategory: string | null;
  supplierVolatilityLevel: "high" | "medium" | "low" | "stable";
  supplierVolatilityLabel: string;
  recipesBelowTarget: number;
  calmSummaryLine: string;
};

export type GroupedConcentrationInsight = {
  id: string;
  priority: OperationalInsightPriority;
  decisionTier: OperationalDecisionTier;
  groupKey: string;
  storyKey: string;
  primaryIngredientName: string;
  title: string;
  detail: string;
  operatorInsightLine: string;
  consequence?: string;
  affectedRecipes: string[];
  avgConcentrationPct: number;
  estimatedMonthlyImpactEur: number;
  estimatedImpactLine: string | null;
  suggestedAction: string;
  operatorAction: string;
  actionLabel: string;
  target: MarginAlertTarget;
};

export type GroupedRecoveryOpportunity = {
  id: string;
  priority: OperationalInsightPriority;
  tier: OperationalInsightTier;
  decisionTier: OperationalDecisionTier;
  storyKey: string;
  cause: RecoveryActionType;
  causeLabel: string;
  lever: "portion_standardization" | "sauce_spec_audit" | "supplier_consolidation" | "prep_yield_review" | "recipe_dependency_review";
  leverLabel: string;
  title: string;
  why: string;
  operatorInsightLine: string;
  consequence?: string;
  affectedRecipes: string[];
  estimatedMonthlyRecoveryEur: number;
  savingsLine: string | null;
  suggestedActions: string[];
  operatorActions: string[];
  target: MarginAlertTarget;
  actionLabel: string;
};

export type PrioritizedOperationalInsight = {
  id: string;
  priority: OperationalInsightPriority;
  tier: OperationalInsightTier;
  decisionTier: OperationalDecisionTier;
  storyKey: string | null;
  category:
    | "price_inflation"
    | "recipe_spread"
    | "concentration"
    | "supplier_instability"
    | "stale_pricing"
    | "operational_exposure";
  categoryLabel: string;
  title: string;
  detail: string;
  operatorInsightLine: string;
  consequence?: string;
  impactLine: string | null;
  monthlyImpactEur: number;
  suggestedAction: string;
  operatorAction: string;
  actionLabel: string;
  target: MarginAlertTarget;
};

export type OperationalHeroNarrative = {
  tier: OperationalInsightTier;
  title: string;
  narrative: string;
  impactLine: string;
  actionCluster: string[];
};

export type OperationalSnapshotSignalTone = "risk" | "watch" | "info" | "recovery";

export type OperationalSnapshotSignal = {
  id: string;
  label: string;
  line: string;
  tone: OperationalSnapshotSignalTone;
};

export type OperationalSnapshotViewModel = {
  operationalTitle: string;
  synthesisParagraph: string;
  pressureLine: string;
  signals: OperationalSnapshotSignal[];
  keyTakeaway: string;
};

export type OperationalTrendBadge =
  | "HIGH EXPOSURE"
  | "HIGH DEPENDENCY"
  | "STALE PRICE"
  | "SUPPLIER CONCENTRATION"
  | "PRICE CONFIDENCE LOW";

export type OperationalTrendExpandable = {
  bullets: string[];
};

export type OperationalTrendExposureDetail = {
  ingredientName: string;
  recipesAffected: number;
  largestRecipeName: string;
  monthlyExposureEur: number;
  tenPercentImpactEur: number;
  riskLevel: "LOW" | "MEDIUM" | "HIGH";
  currentSupplierName?: string | null;
  latestInvoiceDateLabel?: string | null;
  latestUnitPriceLabel?: string | null;
};

export type OperationalTrendMetricRow = {
  id: string;
  name: string;
  value: string;
  secondary?: string;
  badges?: OperationalTrendBadge[];
  expandable?: OperationalTrendExpandable;
  exposure?: OperationalTrendExposureDetail;
  /** Normalized supplier display name for invoice history deep links. */
  supplierName?: string;
  ingredientId?: string;
  recipeId?: string;
};

export type OperationalTrendMetricSection = {
  title: string;
  rows: OperationalTrendMetricRow[];
};

export type OperationalTrendsWindowMetrics = {
  supplierMovement: OperationalTrendMetricSection;
  ingredientMovement: OperationalTrendMetricSection;
  recipeMarginMovement: OperationalTrendMetricSection;
  exposureConcentration: OperationalTrendMetricSection;
};

export type OperationalTrendPanel = {
  label: string;
  windowKey: OperationalWindowKey;
  metrics: OperationalTrendsWindowMetrics;
};

export type OperationalTrendsPanels = {
  last90Days: OperationalTrendPanel;
  last6Months: OperationalTrendPanel;
};

export type OperationalActionQueueCard = {
  id: string;
  decisionTier: OperationalDecisionTier;
  priority: OperationalInsightPriority;
  category: PrioritizedOperationalInsight["category"];
  categoryLabel: string;
  title: string;
  affectedScope: string | null;
  whyItMatters: string;
  whatToDo: string;
  ifIgnored: string | null;
  estimatedImpact: string | null;
  target: MarginAlertTarget;
  actionLabel: string;
};

export type OwnerReviewWeeklySnapshot = {
  supplierIncreases: number;
  monthlyImpactEur: number;
  supplierDecreases: number;
  pricesNeedingRefresh: number;
};

export type OwnerReviewRow = {
  id: string;
  monthlyImpactEur: number;
  impactLine: string | null;
  title: string;
  whatChanged: string;
  target?: MarginAlertTarget;
  ingredientId?: string;
  recipeId?: string;
  supplierName?: string;
};

export type SupplierWatchDirection = "up" | "down" | "stable";

export type SupplierIngredientChange = {
  ingredientId: string;
  name: string;
  changePct: number;
  priceLine: string | null;
};

export type SupplierWatchRow = {
  id: string;
  supplierName: string;
  direction: SupplierWatchDirection;
  title: string;
  secondary: string | null;
  changeLine: string | null;
  impactLine: string | null;
  ingredientChanges: SupplierIngredientChange[];
};

export type AffectedRecipeRow = {
  id: string;
  recipeName: string;
  recipeId?: string;
  whatChanged: string;
  impactLine: string | null;
  target: MarginAlertTarget;
};

export type AttentionNeededKind = "stale_price" | "missing_confirmation" | "supplier_inactive";

export type AttentionRow = {
  id: string;
  kind: AttentionNeededKind;
  title: string;
  detail: string;
  target: MarginAlertTarget;
  ingredientId?: string;
};

export type OwnerReviewViewModel = {
  weeklySnapshot: OwnerReviewWeeklySnapshot;
  /** Human phrase for empty states, e.g. "the last 30 days". */
  periodPhrase: string;
  selectedWindowKey: OperationalWindowKey;
  financialRisks: OwnerReviewRow[];
  opportunities: OwnerReviewRow[];
  suppliersToWatch: SupplierWatchRow[];
  affectedRecipes: AffectedRecipeRow[];
  attentionNeeded: AttentionRow[];
};

export type CalmOperationalSignal = {
  title: string;
  bullets: string[];
};

export type OperationalWindowKey = "last_30_days" | "last_3_months" | "last_6_months";

export type OperationalWindow = {
  key: OperationalWindowKey;
  label: string;
  days: number;
  startsAtIso: string;
};

export type SupplierMovementSignal =
  | "sustained_increase"
  | "stabilizing_after_volatility"
  | "more_expensive_than_alternatives"
  | "improving_consistency"
  | "stable_pricing";

export type SupplierMovementInsight = {
  supplierName: string;
  normalizedPriority: OperationalInsightPriority;
  decisionTier: OperationalDecisionTier;
  averageChangePct: number;
  changeEvents: number;
  latestEventAt: string | null;
  windowHits: Record<OperationalWindowKey, number>;
  signal: SupplierMovementSignal;
  narrative: string;
  operatorInsightLine: string;
  consequence?: string;
  operatorAction: string;
  dominantWindow: OperationalWindowKey;
  dominantWindowLabel: string;
  temporalTrend: "accelerating" | "easing" | "flat" | null;
  categoryHint: string | null;
  topIngredientLabels: string[];
};

export type SupplierSwitchType =
  | "more_expensive"
  | "cheaper"
  | "stable_transition"
  | "volatility_reduction";

export type SupplierSwitchImpactInsight = {
  ingredientId: string;
  ingredientName: string;
  fromSupplier: string;
  toSupplier: string;
  changePct: number;
  estimatedMonthlyImpactEur: number;
  normalizedPriority: OperationalInsightPriority;
  decisionTier: OperationalDecisionTier;
  switchedAt: string;
  window: OperationalWindowKey;
  switchType: SupplierSwitchType;
  narrative: string;
  operatorInsightLine: string;
  impactLine: string;
  consequence: string;
  operatorAction: string;
};

export type RecipeMarginTrendStatus = "worsening" | "stabilizing" | "recovering" | "improving";

export type RecipeMarginMovementInsight = {
  recipeName: string;
  movement: "worsening" | "improving";
  trendStatus: RecipeMarginTrendStatus;
  headline: string;
  operatorInsightLine: string;
  reason: string;
  estimatedMonthlyImpactEur: number;
  normalizedPriority: OperationalInsightPriority;
  decisionTier: OperationalDecisionTier;
  consequence?: string;
  operatorAction: string;
  window: OperationalWindowKey;
  /** Parsed from alert context when invoice-driven margin slip is modeled. */
  marginFromPct?: number;
  marginToPct?: number;
};

export type StableOperationalCategoryInsight = {
  category: CostCategoryGroup;
  label: string;
  trend: "down" | "flat";
  note: string;
  window: OperationalWindowKey;
};

export type HighOperationalExposureIngredientInsight = {
  ingredientId: string;
  ingredientName: string;
  costSharePct: number;
  recipeCount: number;
  monthlyModeledExposureEur: number;
  normalizedPriority: OperationalInsightPriority;
};

export type OperationalSynthesisGroups = {
  supplierMovements: {
    largestIncreases: SupplierMovementInsight[];
    stablePricing: SupplierMovementInsight[];
  };
  supplierSwitchImpacts: {
    badSwitches: SupplierSwitchImpactInsight[];
    goodSwitches: SupplierSwitchImpactInsight[];
    stableSwitches: SupplierSwitchImpactInsight[];
    volatilityReductions: SupplierSwitchImpactInsight[];
  };
  recipeMarginMovements: {
    worsening: RecipeMarginMovementInsight[];
    improving: RecipeMarginMovementInsight[];
  };
  recoverySignals: GroupedRecoveryOpportunity[];
  stableOperationalAreas: {
    categories: StableOperationalCategoryInsight[];
    highOperationalExposureIngredients: HighOperationalExposureIngredientInsight[];
  };
};

export type SynthesizedCategoryPressureRow = CategoryPressureRow & {
  interpretiveLine: string;
};

export type CommercialExposureKind =
  | "purchasing_impact"
  | "operational_spread"
  | "supplier_ripple"
  | "menu_sensitivity";

export type CuratedOperationalExposure = OperationalExposureRow & {
  whyItMatters: string;
  riskDriver: string;
  monitorHint: string;
  likelyAction: string;
  operatorInsightLine: string;
  operatorAction: string;
  consequence?: string;
  decisionTier: OperationalDecisionTier;
  narrativeLine: string;
  exposureKind: CommercialExposureKind;
  sensitivityLine: string | null;
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

const RECOVERY_CAUSE_LABELS: Record<RecoveryActionType, string> = {
  portion_optimization: "Portion optimization",
  supplier_negotiation: "Supplier negotiation",
  recipe_standardization: "Recipe standardization",
  menu_repricing: "Menu repricing",
  prep_optimization: "Prep optimization",
};

const INSIGHT_CATEGORY_LABELS: Record<PrioritizedOperationalInsight["category"], string> = {
  price_inflation: "Invoice pressure",
  recipe_spread: "Dish margin",
  concentration: "Plate concentration",
  supplier_instability: "Supplier lane",
  stale_pricing: "Awaiting invoice confirmation",
  operational_exposure: "Margin exposed",
};

export const OPERATIONAL_DECISION_TIER_LABELS: Record<OperationalDecisionTier, string> = {
  now: "Act now",
  monitor: "Monitor",
  background: "Background",
};

const ESTIMATED_COVERS_PER_MENU_RECIPE = 30;

const CONCENTRATION_GROUP_MIN_RECIPES = 1;
const CONCENTRATION_THRESHOLD_PCT = 55;
const MIN_VISIBLE_IMPACT_EUR = 10;

/** Presentation-layer thresholds — do not alter underlying metric math. */
export const MIN_MEANINGFUL_SUPPLIER_CHANGE_PCT = 2;
export const MIN_SUPPLIER_SWITCH_IMPACT_PCT = 2;
export const MIN_RECIPE_MARGIN_MOVEMENT_EUR = 10;
export const MIN_CATEGORY_INFLATION_PCT = 3;
export const MIN_TEMPORAL_WINDOW_SPREAD_PCT = 3;
export const MAX_SUPPLIER_MOVEMENTS_VISIBLE = 5;
export const MAX_RECIPE_MARGIN_MOVEMENTS_VISIBLE = 4;
/** Top ingredient movers shown per direction in trend panels. */
export const TREND_INGREDIENT_TOP_N = 2;

const OPERATIONAL_WINDOWS: ReadonlyArray<{ key: OperationalWindowKey; label: string; days: number }> = [
  { key: "last_30_days", label: "Last 30 days", days: 30 },
  { key: "last_3_months", label: "Last 3 months", days: 90 },
  { key: "last_6_months", label: "Last 6 months", days: 180 },
];

const BEEF_NAME_RE =
  /\b(beef|novilho|vazia|acem|acém|angus|steak|bife|lombo|entrecôte|entrecote|brisket|short.?rib)\b/i;

function isBeefIngredientName(name: string): boolean {
  return BEEF_NAME_RE.test(name);
}

/** Finer merge key — category / operational family, not raw ingredient id. */
export function resolveOperationalStoryKey(input: {
  ingredientName: string;
  category: CostCategoryGroup;
  ingredientId?: string;
}): string {
  const family = detectOperationalFamily(input.ingredientName);
  if (family === "cheese_sauce" || family === "ketchup") return `sauces:${family}`;
  if (family === "sliced_cheese") return "dairy:cheese";
  if (family === "burger_bread") return "bakery:bread";
  if (family === "fried_potato_products") return "produce:potato";

  if (input.category === "meat") {
    return isBeefIngredientName(input.ingredientName) ? "meat:beef" : "meat:protein";
  }
  if (input.category === "sauces") return "sauces:dependency";
  if (input.category === "dairy") return "dairy:concentration";
  if (input.category === "produce") return "produce:concentration";
  if (input.category === "bakery") return "bakery:concentration";

  if (family) return `family:${family}`;
  const normalized = input.ingredientName.trim().toLowerCase().replace(/\s+/g, "-");
  return `ingredient:${input.ingredientId ?? normalized}`;
}

export function synthesizeInsightTitle(input: {
  kind: "concentration" | "recovery" | "insight";
  storyKey?: string;
  category?: CostCategoryGroup;
  insightCategory?: PrioritizedOperationalInsight["category"];
  cause?: RecoveryActionType;
  ingredientName?: string;
  staleCount?: number;
}): string {
  const storyKey = input.storyKey ?? "";
  const category = input.category ?? "other";

  if (input.insightCategory === "stale_pricing" || (input.staleCount ?? 0) > 1) {
    return "Pricing confidence degraded on key lines";
  }
  if (
    input.insightCategory === "supplier_instability" ||
    input.cause === "supplier_negotiation"
  ) {
    return "Supplier instability detected";
  }
  if (input.cause === "prep_optimization") {
    return "Prep standardization opportunity";
  }

  const beefStory =
    storyKey.includes("meat:beef") ||
    (category === "meat" && isBeefIngredientName(input.ingredientName ?? ""));

  if (input.kind === "concentration" || input.insightCategory === "concentration") {
    if (beefStory) return "Beef margin compression";
    if (storyKey.startsWith("sauces") || category === "sauces") return "Sauce dependency risk";
    if (category === "dairy" || storyKey.startsWith("dairy")) return "Dairy margin compression";
    if (category === "meat") return "Menu exposure concentration";
    return "Menu exposure concentration";
  }

  if (input.kind === "recovery") {
    if (beefStory && input.cause === "portion_optimization") return "Beef margin compression";
    if (storyKey.startsWith("sauces") && input.cause === "portion_optimization") {
      return "Sauce dependency risk";
    }
    if (input.cause === "recipe_standardization") return "Prep standardization opportunity";
    if (input.cause === "menu_repricing") return "Selective menu repricing opportunity";
    if (input.cause === "portion_optimization") return "Portion standardization opportunity";
  }

  if (input.insightCategory === "recipe_spread") return "Dish margin under target";
  if (input.insightCategory === "price_inflation") {
    if (beefStory) return "Beef margin compression";
    return "Invoice inflation pressure";
  }
  if (input.insightCategory === "operational_exposure") return "Menu exposure concentration";

  return "Operational margin signal";
}

export function compressFinancialImpact(
  amountEur: number,
  context: {
    mode: "exposure" | "recovery" | "pressure";
    storyKey?: string;
    category?: CostCategoryGroup;
    cause?: RecoveryActionType;
  },
): string | null {
  if (amountEur < 1) return null;

  const amount = formatCurrency(amountEur);
  const storyKey = context.storyKey ?? "";
  let lever = "operational review";

  if (storyKey.includes("meat:beef") || (context.category === "meat" && context.mode !== "pressure")) {
    lever =
      context.mode === "recovery" || context.cause === "recipe_standardization"
        ? "beef standardization"
        : "beef portion review";
  } else if (storyKey.startsWith("sauces") || context.category === "sauces") {
    lever = context.mode === "recovery" ? "sauce basket review" : "sauce dependency review";
  } else if (storyKey.startsWith("dairy") || context.category === "dairy") {
    lever = context.mode === "recovery" ? "dairy standardization" : "dairy portion review";
  } else if (context.cause === "supplier_negotiation") {
    lever = "supplier re-quote";
  } else if (context.cause === "portion_optimization") {
    lever = "portion trim";
  } else if (context.cause === "menu_repricing") {
    lever = "selective repricing";
  } else if (context.cause === "prep_optimization" || context.cause === "recipe_standardization") {
    lever = "prep standardization";
  }

  if (context.mode === "recovery") {
    return `~${amount}/mo recoverable through ${lever}`;
  }
  if (context.mode === "exposure") {
    return `A 10% supplier increase would affect ~${amount}/mo; prioritize ${lever}`;
  }
  return `Est. ${amount}/mo`;
}

export function synthesizeCategoryPressureNarrative(
  row: CategoryPressureRow,
  sharePct: number,
  isLargestBucket: boolean,
): string {
  const inflating = row.trend === "up" && (row.inflationVs3MoPct ?? 0) >= 3;
  const stable =
    row.trend === "flat" &&
    (row.pressureLine === "Stable" ||
      row.inflationVs3MoPct == null ||
      Math.abs(row.inflationVs3MoPct) < 3);

  if (row.trend === "down" || row.pressureLine === "Recovering") {
    return "Costs easing — hold menu pricing while the basket normalizes";
  }
  if (inflating) {
    return `Invoice inflation building in ${row.label.toLowerCase()} — re-quote dominant SKUs on next order`;
  }
  if (stable && isLargestBucket && sharePct >= 20) {
    return "Largest menu exposure bucket but stable this period";
  }
  if (stable && sharePct >= 12) {
    return "High recipe dependency with low recent volatility";
  }
  if (stable) {
    return "Low operational concern right now";
  }
  return row.operationalLine;
}

export function enrichCategoryPressureRows(
  rows: CategoryPressureRow[],
  categorySlices: CostCategorySlice[],
): SynthesizedCategoryPressureRow[] {
  const topGroup = categorySlices[0]?.group;
  const shareByGroup = new Map(categorySlices.map((s) => [s.group, s.sharePct]));

  return rows.map((row) => {
    const sharePct = shareByGroup.get(row.group) ?? 0;
    const isLargest = row.group === topGroup;
    const interpretiveLine = synthesizeCategoryPressureNarrative(row, sharePct, isLargest);

    let pressureLine = normalizeCategoryPressureLabel(row.pressureLine);
    if (pressureLine === "Stable" && isLargest && sharePct >= 20) {
      pressureLine = "Stable — largest bucket";
    }

    return {
      ...row,
      pressureLine,
      operationalLine: interpretiveLine,
      interpretiveLine,
    };
  });
}

export function resolveCommercialExposureKind(row: OperationalExposureRow): CommercialExposureKind {
  if (row.recipeCount >= 3) return "menu_sensitivity";
  if (row.supplierSpikeFlag) return "supplier_ripple";
  if (row.costSharePct >= 8 || row.recipeCount >= 2) return "operational_spread";
  return "purchasing_impact";
}

export function formatCommercialExposureLine(
  row: OperationalExposureRow,
  kind: CommercialExposureKind = resolveCommercialExposureKind(row),
): string | null {
  if (row.monthlyModeledExposureEur < 1 && row.costSharePct < 5 && !row.supplierSpikeFlag) {
    return null;
  }

  switch (kind) {
    case "menu_sensitivity":
      return `${row.recipeCount} dishes use ${row.ingredientName} — next invoice moves every plate.`;
    case "supplier_ripple":
      return `Paid price on ${row.ingredientName} jumped vs recent invoices — confirm on next delivery.`;
    case "operational_spread":
      return `${formatPercent(Math.round(row.costSharePct))} of modeled menu cost across ${row.recipeCount || 1} dish${row.recipeCount === 1 ? "" : "es"} — portion discipline matters.`;
    case "purchasing_impact":
      return row.monthlyModeledExposureEur >= 1
        ? `~${formatCurrency(row.monthlyModeledExposureEur)}/mo at current portions if ${row.ingredientName} moves again.`
        : `Procurement sensitive — watch next invoice on ${row.ingredientName}.`;
    default:
      return null;
  }
}

function synthesizeExposureWhyItMatters(
  row: OperationalExposureRow,
  kind: CommercialExposureKind,
): string {
  if (kind === "menu_sensitivity") {
    return `${row.recipeCount} dishes use ${row.ingredientName} — the next invoice will move every plate that includes it.`;
  }
  if (kind === "supplier_ripple") {
    return `Paid invoice on ${row.ingredientName} is above the recent basket — dish costs drift until the next order confirms.`;
  }
  if (kind === "operational_spread") {
    return `${formatPercent(Math.round(row.costSharePct))} of modeled menu cost across ${row.recipeCount || 1} dishes — portion drift on any plate affects margin.`;
  }
  if (row.monthlyModeledExposureEur >= 1) {
    return `~${formatCurrency(row.monthlyModeledExposureEur)}/mo purchasing leverage at current portions.`;
  }
  return `Procurement sensitive — validate ${row.ingredientName} on the next delivery note.`;
}

function synthesizeExposureRiskDriver(row: OperationalExposureRow): string {
  if (row.supplierSpikeFlag) {
    return "Last paid unit is above the 3-month basket on this SKU.";
  }
  if (row.trendPct != null && Math.abs(row.trendPct) >= MIN_TEMPORAL_WINDOW_SPREAD_PCT) {
    return `${row.trendPct > 0 ? "Up" : "Down"} ${Math.abs(Math.round(row.trendPct))}% on recent invoices — flows into every dependent dish.`;
  }
  if (row.recipeCount >= 4) {
    return "One SKU change affects several menu items.";
  }
  return "Invoices steady lately — still on the watch list because several dishes share this line.";
}

function synthesizeExposureMonitorHint(row: OperationalExposureRow): string {
  if (row.supplierSpikeFlag) {
    return "Confirm paid price on the next invoice before the standing order.";
  }
  if (row.trendPct != null && row.trendPct >= MIN_CATEGORY_INFLATION_PCT) {
    return "Watch the next two delivery cycles for the same move.";
  }
  return "Spot-check gram weights on dishes that use this ingredient.";
}

function synthesizeExposureLikelyAction(row: OperationalExposureRow, kind: CommercialExposureKind): string {
  return buildOperatorActionLine({
    exposureKind: kind,
    suggestedAction: undefined,
  });
}

/** Curated exposure rows with operational narrative wrapper — same underlying scores. */
export function buildCuratedOperationalExposures(
  data: MarginAlertData,
  limit = 5,
): CuratedOperationalExposure[] {
  return buildTopOperationalExposures(data, limit + 2)
    .map((row) => {
      const exposureKind = resolveCommercialExposureKind(row);
      const whyItMatters = synthesizeExposureWhyItMatters(row, exposureKind);
      const riskDriver = synthesizeExposureRiskDriver(row);
      const monitorHint = synthesizeExposureMonitorHint(row);
      const likelyAction = synthesizeExposureLikelyAction(row, exposureKind);
      const sensitivityLine = formatCommercialExposureLine(row, exposureKind);
      const priority = mapToInsightPriority({
        monthlyImpactEur: row.monthlyModeledExposureEur,
        contributionPct: row.costSharePct,
      });
      const decisionTier = mapToOperationalDecisionTier({
        priority,
        monthlyImpactEur: row.monthlyModeledExposureEur,
        category: "operational_exposure",
      });
      const operatorInsightLine = buildOperatorInsightLine({
        title: row.ingredientName,
        ingredientName: row.ingredientName,
        recipeCount: row.recipeCount,
        exposureKind,
      });
      const operatorAction = buildOperatorActionLine({ exposureKind, suggestedAction: likelyAction });
      const consequence = buildConsequenceLine({
        priority,
        monthlyImpactEur: row.monthlyModeledExposureEur,
        exposureKind,
      });
      return {
        ...row,
        exposureKind,
        sensitivityLine,
        whyItMatters,
        riskDriver,
        monitorHint,
        likelyAction,
        operatorInsightLine,
        operatorAction,
        consequence,
        decisionTier,
        narrativeLine: `${operatorInsightLine} ${consequence ?? riskDriver}`,
      };
    })
    .slice(0, limit);
}

function suggestedActionForStoryKey(
  storyKey: string,
  category: CostCategoryGroup,
  avgPct: number,
  recipeCount: number,
): string {
  if (storyKey.includes("meat:beef")) {
    return avgPct >= 65
      ? "Re-weigh beef portions on flagged burgers and steaks this prep cycle."
      : "Lock beef gram weights on affected dishes and confirm supplier quote before the next order.";
  }
  if (storyKey.startsWith("sauces") || category === "sauces") {
    return "Check sauce gram weights and dispenser settings on high-cover dishes.";
  }
  if (storyKey.startsWith("dairy") || category === "dairy") {
    return "Align cheese portions across shared dishes and lock one spec sheet.";
  }
  const recipeBit =
    recipeCount <= 2 ? "flagged dishes" : `${recipeCount} affected dishes`;
  return `Spot-check gram weights on ${recipeBit} before changing menu price.`;
}

function priorityRank(p: OperationalInsightPriority): number {
  if (p === "critical") return 0;
  if (p === "warning") return 1;
  if (p === "monitor") return 2;
  return 3;
}

function decisionTierRank(tier: OperationalDecisionTier): number {
  if (tier === "now") return 0;
  if (tier === "monitor") return 1;
  return 2;
}

/**
 * Maps alert priority + modeled € impact to operator decision tiers (deterministic).
 * critical → now; warning + impact ≥50 → now; warning/monitor/stale → monitor; informational/low impact → background.
 */
export function mapToOperationalDecisionTier(input: {
  priority: OperationalInsightPriority;
  monthlyImpactEur?: number;
  category?: PrioritizedOperationalInsight["category"];
  signal?: SupplierMovementSignal;
  forceBackground?: boolean;
}): OperationalDecisionTier {
  if (input.forceBackground) return "background";

  const impact = input.monthlyImpactEur ?? 0;

  if (input.signal === "stable_pricing" || input.signal === "improving_consistency") {
    return "background";
  }

  if (input.priority === "critical") return "now";
  if (input.priority === "warning" && impact >= 50) return "now";
  if (input.category === "concentration" && input.priority === "warning" && impact >= 25) {
    return "now";
  }

  if (input.category === "stale_pricing") return "monitor";
  if (input.priority === "warning") return "monitor";
  if (input.priority === "monitor") return "monitor";

  if (input.priority === "informational" && impact < MIN_VISIBLE_IMPACT_EUR) {
    return "background";
  }

  if (impact < MIN_VISIBLE_IMPACT_EUR) return "background";

  return "monitor";
}

export function normalizeCategoryPressureLabel(pressureLine: string): string {
  if (/^stable$/i.test(pressureLine.trim())) return "Stable";
  if (/flat/i.test(pressureLine)) return pressureLine.replace(/\bflat\b/gi, "Monitoring");
  if (/recovering/i.test(pressureLine)) return "Costs easing";
  return pressureLine;
}

export function buildOperatorInsightLine(input: {
  title: string;
  detail?: string;
  ingredientName?: string;
  recipeCount?: number;
  exposureKind?: CommercialExposureKind;
  signal?: SupplierMovementSignal;
  category?: PrioritizedOperationalInsight["category"];
}): string {
  if (input.category === "stale_pricing") {
    return "Catalog prices are ahead of confirmed invoices — margin math may be temporarily uncertain.";
  }
  if (input.exposureKind === "menu_sensitivity" && input.recipeCount != null) {
    return `${input.ingredientName ?? "This line"} is on ${input.recipeCount} dishes — the next invoice will move every plate that uses it.`;
  }
  if (input.exposureKind === "supplier_ripple") {
    return `Paid invoice on ${input.ingredientName ?? "this SKU"} is above the recent basket — dish costs will drift until the next order confirms.`;
  }
  if (input.exposureKind === "operational_spread" && input.recipeCount != null) {
    return `${input.ingredientName ?? "This line"} shows up on ${input.recipeCount} recipes — portion drift on any dish affects margin.`;
  }
  if (input.signal === "sustained_increase") {
    return `${input.title} — invoice trend is still building; validate on the next delivery before prep scales.`;
  }
  if (input.signal === "stable_pricing") {
    return `${input.title} — pricing held on recent invoices; no immediate kitchen action.`;
  }
  if (input.detail?.trim()) return input.detail.trim();
  return input.title;
}

export function buildConsequenceLine(input: {
  priority: OperationalInsightPriority;
  monthlyImpactEur?: number;
  category?: PrioritizedOperationalInsight["category"];
  exposureKind?: CommercialExposureKind;
  switchType?: SupplierSwitchType;
  trendStatus?: RecipeMarginTrendStatus;
  movement?: RecipeMarginMovementInsight["movement"];
}): string | undefined {
  const impact = input.monthlyImpactEur ?? 0;

  if (input.category === "stale_pricing") {
    return "If ignored, recipe margins use catalog fallback until the next invoice syncs — temporary uncertainty, not a cost spike.";
  }
  if (input.switchType === "more_expensive") {
    return "Dish margin compresses on every recipe using this SKU until portions or menu price adjust.";
  }
  if (input.trendStatus === "worsening" || input.movement === "worsening") {
    return impact >= 25
      ? `If ignored, modeled margin pressure stays ~${formatCurrency(impact)}/mo on this dish.`
      : "If ignored, gross margin keeps slipping vs target on covers sold.";
  }
  if (input.exposureKind === "menu_sensitivity" && impact >= 25) {
    return `A further 10% on this line adds ~${formatCurrency(Math.round(impact * 0.1))}/mo at current portions.`;
  }
  if (input.exposureKind === "supplier_ripple") {
    return "Next prep cycle may run at the higher paid unit until catalog and invoice reconcile.";
  }
  if (input.priority === "critical" || (input.priority === "warning" && impact >= 50)) {
    return "Without a portion, spec, or price change this week, margin stays under pressure on affected dishes.";
  }
  if (input.priority === "monitor") {
    return "Watch the next invoice cycle — no change needed yet if pricing normalizes.";
  }
  return undefined;
}

export function buildOperatorActionLine(input: {
  category?: PrioritizedOperationalInsight["category"];
  storyKey?: string;
  cause?: RecoveryActionType;
  exposureKind?: CommercialExposureKind;
  suggestedAction?: string;
  lever?: GroupedRecoveryOpportunity["lever"];
  switchType?: SupplierSwitchType;
  signal?: SupplierMovementSignal;
}): string {
  if (input.suggestedAction?.trim()) {
    const action = input.suggestedAction.trim();
    if (!/audit basket|review portions|operational review/i.test(action)) {
      return action;
    }
  }

  if (input.category === "stale_pricing") {
    return "Match catalog to the latest paid invoice before scaling prep on affected SKUs.";
  }
  if (input.switchType === "more_expensive") {
    return "Re-weigh portions on dependent dishes or re-quote the lane before the next order.";
  }
  if (input.signal === "sustained_increase") {
    return "Re-quote dominant SKUs on this supplier before the next standing order.";
  }
  if (input.lever === "portion_standardization" || input.cause === "portion_optimization") {
    if (input.storyKey?.includes("meat:beef")) {
      return "Re-weigh beef portions on flagged burgers and steaks this prep cycle.";
    }
    return "Lock gram weights on flagged dishes and spot-check prep output today.";
  }
  if (input.lever === "sauce_spec_audit" || input.storyKey?.startsWith("sauces")) {
    return "Check sauce gram weights and dispenser settings on high-volume dishes.";
  }
  if (input.lever === "supplier_consolidation" || input.cause === "supplier_negotiation") {
    return "Request a fresh quote on the dominant basket lines before reordering.";
  }
  if (input.lever === "prep_yield_review" || input.cause === "prep_optimization") {
    return "Standardize batch yields on prep items feeding the menu this week.";
  }
  if (input.cause === "menu_repricing") {
    return "Raise menu price on the worst-margin dishes before trimming specs elsewhere.";
  }
  if (input.exposureKind === "menu_sensitivity") {
    return "Spot-check portions on every dish that shares this ingredient.";
  }
  if (input.exposureKind === "supplier_ripple") {
    return "Confirm paid price on the next invoice before placing the standing order.";
  }
  if (input.exposureKind === "operational_spread") {
    return "Align specs across dishes that share this SKU — one drift affects several plates.";
  }
  if (input.exposureKind === "purchasing_impact") {
    return "Validate unit price on the next delivery note against catalog.";
  }
  return "Review specs and next invoice before changing menu price.";
}

export function buildOperationalWindows(now = new Date()): OperationalWindow[] {
  const nowMs = now.getTime();
  return OPERATIONAL_WINDOWS.map((windowDef) => ({
    ...windowDef,
    startsAtIso: new Date(nowMs - windowDef.days * 86_400_000).toISOString(),
  }));
}

/** Maps UI date-range selector values to operational window keys. */
export function mapDateRangeToWindowKey(dateRange?: string): OperationalWindowKey {
  if (dateRange === "30") return "last_30_days";
  if (dateRange === "180") return "last_6_months";
  if (dateRange === "90") return "last_3_months";
  return "last_3_months";
}

export function operationalPeriodPhrase(
  windowKey: OperationalWindowKey,
  windows: OperationalWindow[],
): string {
  const label = windows.find((w) => w.key === windowKey)?.label ?? "this period";
  return windowPhraseForNarrative(label);
}

function resolveWindowFromDate(value: string | null | undefined, windows: OperationalWindow[]): OperationalWindowKey {
  if (!value) return "last_6_months";
  const eventMs = new Date(value).getTime();
  if (!Number.isFinite(eventMs)) return "last_6_months";
  for (const windowDef of windows) {
    if (eventMs >= new Date(windowDef.startsAtIso).getTime()) {
      return windowDef.key;
    }
  }
  return "last_6_months";
}

function shortOperationalLine(input: string, maxLen = 110): string {
  const first = input.split(".")[0]?.trim() ?? input.trim();
  return first.length > maxLen ? `${first.slice(0, maxLen - 3)}...` : first;
}

function tierFromInsight(input: {
  priority: OperationalInsightPriority;
  category: PrioritizedOperationalInsight["category"];
  monthlyImpactEur: number;
}): OperationalInsightTier {
  if (input.priority === "critical") return "tier_1";
  if (input.priority === "warning" && input.monthlyImpactEur >= 50) return "tier_1";
  if (input.category === "stale_pricing" || input.category === "supplier_instability") return "tier_2";
  if (input.priority === "warning" || input.priority === "monitor") return "tier_2";
  return "tier_3";
}

/** Maps existing alert severity and modeled € impact to Phase 1 priority tiers. */
export function mapToInsightPriority(input: {
  severity?: MarginAlertSeverity;
  monthlyImpactEur?: number;
  contributionPct?: number;
}): OperationalInsightPriority {
  const impact = input.monthlyImpactEur ?? 0;
  const share = input.contributionPct ?? 0;

  if (input.severity === "critical" || impact >= 250 || share >= 70) {
    return "critical";
  }
  if (input.severity === "high" || impact >= 75 || share >= 60) {
    return "warning";
  }
  if (input.severity === "watch" || impact >= 25 || share >= 55) {
    return "monitor";
  }
  return "informational";
}

function parseConcentrationShareFromAlert(alert: MarginAlertItem): number {
  const share = alert.meta.find((m) => m.label === "Cost share")?.value;
  const match = share?.match(/([\d.]+)/);
  const n = match ? Number(match[1]) : NaN;
  return Number.isFinite(n) ? n : 0;
}

function ingredientNameFromConcentrationAlert(alert: MarginAlertItem): string {
  const fromTitle = alert.title.split(/\s+is\s+/i)[0]?.trim();
  return fromTitle || "Ingredient";
}

function estimateConcentrationMonthlyEur(metric: RecipeMetric): number {
  const topLine = metric.topLine;
  if (!topLine || topLine.lineCost <= 0) return 0;
  return Math.round(topLine.lineCost * 0.05 * ESTIMATED_COVERS_PER_MENU_RECIPE);
}

/** Groups per-recipe concentration alerts by operational story (category / family). */
export function buildGroupedConcentrationInsights(
  data: MarginAlertData,
  alerts: MarginAlertItem[] = [],
  limit = 4,
): GroupedConcentrationInsight[] {
  const menuMetrics = getRecipeMetrics(data.recipes).filter((m) => m.recipe.type !== "prep");
  const metricByRecipeId = new Map(menuMetrics.map((m) => [m.recipe.id, m]));

  type IngredientAcc = {
    ingredientId: string;
    ingredientName: string;
    category: CostCategoryGroup;
    recipes: { name: string; contribution: number; monthlyEur: number }[];
  };

  const byIngredient = new Map<string, IngredientAcc>();

  for (const alert of alerts) {
    if (alert.kind !== "cost_concentration") continue;
    const parts = alert.id.split("|");
    const recipeId = parts[1];
    const ingredientId = parts[2];
    if (!recipeId || !ingredientId) continue;

    const contribution = parseConcentrationShareFromAlert(alert);
    if (contribution < CONCENTRATION_THRESHOLD_PCT) continue;

    const recipeName =
      alert.meta.find((m) => m.label === "Recipe")?.value ??
      menuMetrics.find((m) => m.recipe.id === recipeId)?.recipe.name ??
      "Recipe";
    const ingredientName =
      data.ingredients.find((i) => i.id === ingredientId)?.name?.trim() ??
      ingredientNameFromConcentrationAlert(alert);
    const category = inferCostCategory(ingredientName);
    const metric = metricByRecipeId.get(recipeId);
    const monthlyEur = metric ? estimateConcentrationMonthlyEur(metric) : 0;

    const current = byIngredient.get(ingredientId) ?? {
      ingredientId,
      ingredientName,
      category,
      recipes: [],
    };
    if (!current.recipes.some((r) => r.name === recipeName)) {
      current.recipes.push({ name: recipeName, contribution, monthlyEur });
    }
    byIngredient.set(ingredientId, current);
  }

  for (const metric of menuMetrics) {
    const topLine = metric.topLine;
    if (!topLine || topLine.contribution < CONCENTRATION_THRESHOLD_PCT) continue;

    const key = topLine.ingredientId;
    const existing = byIngredient.get(key);
    if (existing?.recipes.some((r) => r.name === metric.recipe.name)) continue;

    const category = inferCostCategory(topLine.ingredientName);
    const monthlyEur = estimateConcentrationMonthlyEur(metric);
    const current = existing ?? {
      ingredientId: topLine.ingredientId,
      ingredientName: topLine.ingredientName,
      category,
      recipes: [],
    };
    current.recipes.push({
      name: metric.recipe.name,
      contribution: topLine.contribution,
      monthlyEur,
    });
    byIngredient.set(key, current);
  }

  type StoryAcc = {
    storyKey: string;
    category: CostCategoryGroup;
    representativeName: string;
    ingredientIds: Set<string>;
    recipes: { name: string; contribution: number; monthlyEur: number }[];
  };

  const byStory = new Map<string, StoryAcc>();

  for (const group of byIngredient.values()) {
    const storyKey = resolveOperationalStoryKey({
      ingredientName: group.ingredientName,
      category: group.category,
      ingredientId: group.ingredientId,
    });

    const current = byStory.get(storyKey) ?? {
      storyKey,
      category: group.category,
      representativeName: group.ingredientName,
      ingredientIds: new Set<string>(),
      recipes: [],
    };
    current.ingredientIds.add(group.ingredientId);

    for (const recipe of group.recipes) {
      if (current.recipes.some((r) => r.name === recipe.name)) continue;
      current.recipes.push(recipe);
    }
    byStory.set(storyKey, current);
  }

  const insights: GroupedConcentrationInsight[] = [];

  for (const group of byStory.values()) {
    if (group.recipes.length < CONCENTRATION_GROUP_MIN_RECIPES) continue;

    const avgConcentrationPct = Math.round(
      group.recipes.reduce((s, r) => s + r.contribution, 0) / group.recipes.length,
    );
    const estimatedMonthlyImpactEur = group.recipes.reduce((s, r) => s + r.monthlyEur, 0);
    const recipeNames = group.recipes.map((r) => r.name);
    const title = synthesizeInsightTitle({
      kind: "concentration",
      storyKey: group.storyKey,
      category: group.category,
      ingredientName: group.representativeName,
    });
    const recipeList =
      recipeNames.length <= 3
        ? recipeNames.join(", ")
        : `${recipeNames.slice(0, 2).join(", ")} +${recipeNames.length - 2} more`;

    const priority = mapToInsightPriority({
      contributionPct: avgConcentrationPct,
      monthlyImpactEur: estimatedMonthlyImpactEur,
    });
    const detail = `${formatPercent(avgConcentrationPct)} avg plate share · ${recipeList}`;
    const suggestedAction = suggestedActionForStoryKey(
      group.storyKey,
      group.category,
      avgConcentrationPct,
      recipeNames.length,
    );
    const decisionTier = mapToOperationalDecisionTier({
      priority,
      monthlyImpactEur: estimatedMonthlyImpactEur,
      category: "concentration",
    });

    insights.push({
      id: `concentration-story-${group.storyKey}`,
      groupKey: group.storyKey,
      storyKey: group.storyKey,
      primaryIngredientName: group.representativeName,
      priority,
      decisionTier,
      title,
      detail,
      operatorInsightLine: buildOperatorInsightLine({ title, detail, category: "concentration" }),
      consequence: buildConsequenceLine({
        priority,
        monthlyImpactEur: estimatedMonthlyImpactEur,
        category: "concentration",
      }),
      affectedRecipes: recipeNames,
      avgConcentrationPct,
      estimatedMonthlyImpactEur,
      estimatedImpactLine: compressFinancialImpact(estimatedMonthlyImpactEur, {
        mode: "exposure",
        storyKey: group.storyKey,
        category: group.category,
      }),
      suggestedAction,
      operatorAction: buildOperatorActionLine({
        category: "concentration",
        storyKey: group.storyKey,
        suggestedAction,
      }),
      actionLabel: "Open dishes",
      target: "/recipes",
    });
  }

  return insights
    .sort(
      (a, b) =>
        priorityRank(a.priority) - priorityRank(b.priority) ||
        b.estimatedMonthlyImpactEur - a.estimatedMonthlyImpactEur ||
        b.avgConcentrationPct - a.avgConcentrationPct,
    )
    .slice(0, limit);
}

function resolveBiggestInflationDriver(
  alerts: MarginAlertItem[],
  categoryPressure: CategoryPressureRow[],
): string | null {
  let best: { pct: number; label: string } | null = null;

  for (const row of categoryPressure) {
    if (row.inflationVs3MoPct != null && row.inflationVs3MoPct >= 3) {
      const label = `${row.label} (+${Math.round(row.inflationVs3MoPct)}% vs 3mo)`;
      if (!best || row.inflationVs3MoPct > best.pct) {
        best = { pct: row.inflationVs3MoPct, label };
      }
    }
  }

  for (const alert of alerts) {
    if (alert.kind !== "price_increase" && alert.kind !== "ingredient_inflation_spike") continue;
    const movement = alert.meta.find((m) => m.label === "Movement")?.value;
    const match = movement?.match(/([\d.]+)/);
    const pct = match ? Number(match[1]) : 0;
    if (!Number.isFinite(pct) || pct < 3) continue;
    const name = alert.title
      .replace(/\s+cost moved up$/i, "")
      .replace(/\s+spike$/i, "")
      .trim();
    const label = `${name} (+${Math.round(pct)}% on invoices)`;
    if (!best || pct > best.pct) {
      best = { pct, label };
    }
  }

  return best?.label ?? null;
}

function resolveSupplierVolatility(
  alerts: MarginAlertItem[],
  health: OperationalHealthPanel | undefined,
): Pick<MonthlyMarginPressureSummary, "supplierVolatilityLevel" | "supplierVolatilityLabel"> {
  const volatileCount = alerts.filter(
    (a) =>
      a.kind === "volatile_pricing" ||
      (a.kind === "supplier_trend" && (a.severity === "high" || a.severity === "critical")),
  ).length;

  const stabilityScore = health?.supplierStability?.score ?? null;

  if (volatileCount >= 2 || stabilityScore != null && stabilityScore < 50) {
    return { supplierVolatilityLevel: "high", supplierVolatilityLabel: "Elevated — re-quote baskets" };
  }
  if (volatileCount === 1 || (stabilityScore != null && stabilityScore < 75)) {
    return { supplierVolatilityLevel: "medium", supplierVolatilityLabel: "Watch — selective lines moving" };
  }
  if (stabilityScore != null && stabilityScore >= 85) {
    return { supplierVolatilityLevel: "stable", supplierVolatilityLabel: "Stable across recent invoices" };
  }
  return { supplierVolatilityLevel: "low", supplierVolatilityLabel: "Low — routine invoice noise only" };
}

function buildCalmSummaryLine(input: {
  pressureEur: number;
  inflationDriver: string | null;
  category: string | null;
  recipesBelowTarget: number;
  volatilityLabel: string;
}): string {
  const parts: string[] = [];

  if (input.pressureEur >= 1) {
    parts.push(`Modeled margin pressure ~${formatCurrency(input.pressureEur)}/mo from current signals`);
  } else if (input.recipesBelowTarget === 0) {
    parts.push("No material modeled margin pressure this month");
  } else {
    parts.push(
      `${input.recipesBelowTarget} recipe${input.recipesBelowTarget === 1 ? "" : "s"} below target — portion and pricing levers still open`,
    );
  }

  if (input.inflationDriver) {
    parts.push(`primary inflation on ${input.inflationDriver}`);
  } else if (input.category) {
    parts.push(`${input.category} carries the largest cost bucket`);
  }

  parts.push(`supplier picture: ${input.volatilityLabel.toLowerCase()}`);

  return parts.join("; ") + ".";
}

/** CFO-style monthly margin pressure summary from existing operational metrics. */
export function buildMonthlyMarginPressureSummary(input: {
  data: MarginAlertData;
  alerts: MarginAlertItem[];
  categorySlices: CostCategorySlice[];
  categoryPressure: CategoryPressureRow[];
  marginRisks: TodaysMarginRiskCard[];
  health?: OperationalHealthPanel;
}): MonthlyMarginPressureSummary {
  const menuMetrics = getRecipeMetrics(input.data.recipes).filter((m) => m.recipe.type !== "prep");
  const recipesBelowTarget = menuMetrics.filter(
    (m) => m.grossMargin != null && m.grossMargin < TARGET_MARGIN,
  ).length;

  const estimatedMarginPressureEur = input.marginRisks.reduce(
    (sum, card) => sum + Math.max(0, card.monthlyImpactEur),
    0,
  );

  const topCategory = input.categorySlices[0];
  const mostAffectedCategory =
    topCategory && topCategory.sharePct >= 20
      ? `${topCategory.label} (${formatPercent(Math.round(topCategory.sharePct))} of menu cost)`
      : input.categoryPressure.find((r) => r.trend === "up")?.label ?? topCategory?.label ?? null;

  const biggestInflationDriver = resolveBiggestInflationDriver(input.alerts, input.categoryPressure);
  const volatility = resolveSupplierVolatility(input.alerts, input.health);

  const estimatedMarginPressureLine =
    estimatedMarginPressureEur >= 1
      ? `Est. ${formatCurrency(estimatedMarginPressureEur)}/mo`
      : "Minimal modeled pressure";

  const calmSummaryLine = buildCalmSummaryLine({
    pressureEur: estimatedMarginPressureEur,
    inflationDriver: biggestInflationDriver,
    category: mostAffectedCategory,
    recipesBelowTarget,
    volatilityLabel: volatility.supplierVolatilityLabel,
  });

  return {
    estimatedMarginPressureEur,
    estimatedMarginPressureLine,
    biggestInflationDriver,
    mostAffectedCategory,
    recipesBelowTarget,
    calmSummaryLine,
    ...volatility,
  };
}

function insightCategoryFromRisk(card: TodaysMarginRiskCard): PrioritizedOperationalInsight["category"] {
  const source = card.pressureSource.toLowerCase();
  if (source.includes("supplier")) return "supplier_instability";
  if (source.includes("recipe margin")) return "recipe_spread";
  if (source.includes("category")) return "operational_exposure";
  return "price_inflation";
}

function insightCategoryFromAlert(alert: MarginAlertItem): PrioritizedOperationalInsight["category"] {
  if (alert.kind === "stale_price") return "stale_pricing";
  if (alert.kind === "volatile_pricing" || alert.kind === "supplier_trend") {
    return "supplier_instability";
  }
  if (alert.kind === "recipe_below_target" || alert.kind === "recipe_margin_deterioration") {
    return "recipe_spread";
  }
  if (alert.kind === "cost_concentration") return "concentration";
  return "price_inflation";
}

function severityFromRiskTone(tone: TodaysMarginRiskCard["tone"]): MarginAlertSeverity {
  if (tone === "red") return "critical";
  if (tone === "amber") return "watch";
  return "info";
}

function synthesizeRiskInsightTitle(
  card: TodaysMarginRiskCard,
  matchingAlert: MarginAlertItem | undefined,
  data: MarginAlertData,
): { title: string; storyKey: string | null; category: CostCategoryGroup | undefined } {
  const insightCategory = matchingAlert
    ? insightCategoryFromAlert(matchingAlert)
    : insightCategoryFromRisk(card);

  let storyKey: string | null = null;
  let ingredientName: string | undefined;
  let costCategory: CostCategoryGroup | undefined;

  if (matchingAlert) {
    const ingredientId = extractIngredientIdFromAlert(matchingAlert);
    const ing = ingredientId ? data.ingredients.find((i) => i.id === ingredientId) : null;
    if (ing) {
      ingredientName = ing.name;
      costCategory = inferCostCategory(ing.name);
      storyKey = resolveOperationalStoryKey({
        ingredientName: ing.name,
        category: costCategory,
        ingredientId,
      });
    }
  }

  if (insightCategory === "recipe_spread") {
    return { title: card.event.replace(/\.$/, ""), storyKey, category: costCategory };
  }

  const synthesized = synthesizeInsightTitle({
    kind: "insight",
    insightCategory,
    storyKey: storyKey ?? undefined,
    category: costCategory,
    ingredientName,
  });

  return {
    title: synthesized === "Operational margin signal" ? card.event.replace(/\.$/, "") : synthesized,
    storyKey,
    category: costCategory,
  };
}

function shouldShowInsight(insight: PrioritizedOperationalInsight): boolean {
  if (insight.category === "stale_pricing") return true;
  if (insight.decisionTier === "background" && insight.monthlyImpactEur < MIN_VISIBLE_IMPACT_EUR) {
    return false;
  }
  if (insight.priority === "informational" && insight.monthlyImpactEur < MIN_VISIBLE_IMPACT_EUR) {
    return false;
  }
  return true;
}

function enrichPrioritizedInsight(
  partial: Omit<
    PrioritizedOperationalInsight,
    "decisionTier" | "operatorInsightLine" | "operatorAction" | "tier"
  > & { tier?: OperationalInsightTier },
): PrioritizedOperationalInsight {
  const tier =
    partial.tier ??
    tierFromInsight({
      priority: partial.priority,
      category: partial.category,
      monthlyImpactEur: partial.monthlyImpactEur,
    });
  const decisionTier = mapToOperationalDecisionTier({
    priority: partial.priority,
    monthlyImpactEur: partial.monthlyImpactEur,
    category: partial.category,
  });
  const operatorAction = buildOperatorActionLine({
    category: partial.category,
    storyKey: partial.storyKey ?? undefined,
    suggestedAction: partial.suggestedAction,
  });
  const operatorInsightLine = buildOperatorInsightLine({
    title: partial.title,
    detail: partial.detail,
    category: partial.category,
  });
  const consequence =
    buildConsequenceLine({
      priority: partial.priority,
      monthlyImpactEur: partial.monthlyImpactEur,
      category: partial.category,
    }) ?? undefined;

  return {
    ...partial,
    tier,
    decisionTier,
    operatorInsightLine,
    operatorAction,
    consequence,
  };
}

/** Unified prioritized insights — grouped concentration plus deduped margin risks (no per-recipe concentration cards). */
export function buildPrioritizedOperationalInsights(input: {
  data: MarginAlertData;
  alerts: MarginAlertItem[];
  categorySlices: CostCategorySlice[];
  concentrationGroups?: GroupedConcentrationInsight[];
  marginRisks?: TodaysMarginRiskCard[];
  limit?: number;
}): PrioritizedOperationalInsight[] {
  const limit = input.limit ?? 8;
  const concentration =
    input.concentrationGroups ??
    buildGroupedConcentrationInsights(input.data, input.alerts, 4);
  const marginRisks =
    input.marginRisks ??
    buildTodaysMarginRisks(input.data, input.alerts, input.categorySlices, 6);

  const concentrationStoryKeys = new Set(concentration.map((g) => g.storyKey));

  const insights: PrioritizedOperationalInsight[] = concentration.map((group) =>
    enrichPrioritizedInsight({
      id: group.id,
      storyKey: group.storyKey,
      priority: group.priority,
      category: "concentration",
      categoryLabel: INSIGHT_CATEGORY_LABELS.concentration,
      title: group.title,
      detail: group.detail,
      operatorInsightLine: group.operatorInsightLine,
      consequence: group.consequence,
      impactLine: group.estimatedImpactLine,
      monthlyImpactEur: group.estimatedMonthlyImpactEur,
      suggestedAction: group.suggestedAction,
      operatorAction: group.operatorAction,
      actionLabel: group.actionLabel,
      target: group.target,
    }),
  );

  for (const card of marginRisks) {
    if (card.tone === "green" && card.monthlyImpactEur < 1) continue;

    const matchingAlert = input.alerts.find((a) => a.id === card.id);
    if (matchingAlert?.kind === "cost_concentration") continue;

    const { title, storyKey, category: costCategory } = synthesizeRiskInsightTitle(
      card,
      matchingAlert,
      input.data,
    );
    if (storyKey && concentrationStoryKeys.has(storyKey)) continue;

    const insightCategory = matchingAlert
      ? insightCategoryFromAlert(matchingAlert)
      : insightCategoryFromRisk(card);

    const priority = mapToInsightPriority({
      severity: matchingAlert?.severity ?? severityFromRiskTone(card.tone),
      monthlyImpactEur: card.monthlyImpactEur,
    });
    const detail = shortOperationalLine(`${card.recipesSummary} · ${card.whyItMatters}`);
    const suggestedAction =
      matchingAlert?.suggestedAction?.trim() ||
      buildOperatorActionLine({ category: insightCategory, storyKey: storyKey ?? undefined });

    insights.push(
      enrichPrioritizedInsight({
        id: `risk-${card.id}`,
        storyKey,
        priority,
        category: insightCategory,
        categoryLabel: INSIGHT_CATEGORY_LABELS[insightCategory],
        title,
        detail,
        impactLine:
          card.monthlyImpactEur >= 1
            ? compressFinancialImpact(card.monthlyImpactEur, {
                mode: "exposure",
                storyKey: storyKey ?? undefined,
                category: costCategory,
              }) ?? card.estimatedMonthlyImpact
            : card.estimatedMonthlyImpact,
        monthlyImpactEur: card.monthlyImpactEur,
        suggestedAction,
        actionLabel: card.actionLabel,
        target: card.target,
      }),
    );
  }

  const staleAlerts = input.alerts.filter((a) => a.kind === "stale_price");
  if (staleAlerts.length >= 2) {
    const staleNames = staleAlerts
      .map((a) => a.title.replace(/\s+pricing is stale$/i, "").trim())
      .slice(0, 3);
    const detailSuffix =
      staleAlerts.length > 3 ? ` +${staleAlerts.length - 3} more lines` : "";
    insights.push(
      enrichPrioritizedInsight({
        id: "stale-pricing-cluster",
        storyKey: "stale:cluster",
        priority: mapToInsightPriority({
          severity: staleAlerts.some((a) => a.severity === "high" || a.severity === "critical")
            ? "high"
            : "watch",
          monthlyImpactEur: 0,
        }),
        category: "stale_pricing",
        categoryLabel: INSIGHT_CATEGORY_LABELS.stale_pricing,
        title: synthesizeInsightTitle({
          kind: "insight",
          insightCategory: "stale_pricing",
          staleCount: staleAlerts.length,
        }),
        detail: `${staleNames.join(", ")}${detailSuffix} — temporary pricing uncertainty until invoices sync.`,
        impactLine: null,
        monthlyImpactEur: 0,
        suggestedAction:
          staleAlerts[0]?.suggestedAction ??
          "Match catalog to the latest paid invoice before scaling prep.",
        actionLabel: staleAlerts[0]?.actionLabel ?? "Open ingredients",
        target: staleAlerts[0]?.target ?? "/ingredients",
      }),
    );
  } else {
    for (const alert of staleAlerts) {
      const ingredientId = extractIngredientIdFromAlert(alert);
      const ing = ingredientId ? input.data.ingredients.find((i) => i.id === ingredientId) : null;
      const storyKey = ing
        ? resolveOperationalStoryKey({
            ingredientName: ing.name,
            category: inferCostCategory(ing.name),
            ingredientId,
          })
        : null;
      if (storyKey && concentrationStoryKeys.has(storyKey)) continue;

      insights.push(
        enrichPrioritizedInsight({
          id: `stale-${alert.id}`,
          storyKey: "stale:cluster",
          priority: mapToInsightPriority({ severity: alert.severity, monthlyImpactEur: 0 }),
          category: "stale_pricing",
          categoryLabel: INSIGHT_CATEGORY_LABELS.stale_pricing,
          title: synthesizeInsightTitle({ kind: "insight", insightCategory: "stale_pricing" }),
          detail:
            alert.context.split(".")[0]?.trim() ||
            "Catalog fallback in use — confirm on next invoice.",
          impactLine: null,
          monthlyImpactEur: 0,
          suggestedAction: alert.suggestedAction,
          actionLabel: alert.actionLabel,
          target: alert.target,
        }),
      );
    }
  }

  const seenTitles = new Set<string>();
  const seenStories = new Set<string>();

  return insights
    .filter((insight) => {
      if (!shouldShowInsight(insight)) return false;
      if (insight.storyKey) {
        if (seenStories.has(insight.storyKey)) return false;
        seenStories.add(insight.storyKey);
      }
      const titleKey = insight.title.toLowerCase();
      if (seenTitles.has(titleKey)) return false;
      seenTitles.add(titleKey);
      return true;
    })
    .sort(
      (a, b) =>
        decisionTierRank(a.decisionTier) - decisionTierRank(b.decisionTier) ||
        priorityRank(a.priority) - priorityRank(b.priority) ||
        b.monthlyImpactEur - a.monthlyImpactEur,
    )
    .slice(0, limit);
}

function recoveryCauseFromCategory(
  category: OperationalRecommendationCategory,
): RecoveryActionType {
  switch (category) {
    case "portion_actions":
      return "portion_optimization";
    case "supplier_actions":
      return "supplier_negotiation";
    case "price_actions":
      return "menu_repricing";
    case "margin_deterioration":
      return "recipe_standardization";
    case "recovery_opportunities":
      return "supplier_negotiation";
    default:
      return "recipe_standardization";
  }
}

function recoveryLeverFromRecommendation(rec: OperationalRecommendation): {
  lever: GroupedRecoveryOpportunity["lever"];
  leverLabel: string;
} {
  const text = `${rec.title} ${rec.why} ${rec.action}`.toLowerCase();
  if (text.includes("sauce") || text.includes("dispenser")) {
    return { lever: "sauce_spec_audit", leverLabel: "Sauce spec audit" };
  }
  if (text.includes("supplier") || text.includes("catalog") || text.includes("quote")) {
    return { lever: "supplier_consolidation", leverLabel: "Supplier consolidation" };
  }
  if (text.includes("prep") || text.includes("yield") || text.includes("batch")) {
    return { lever: "prep_yield_review", leverLabel: "Prep yield review" };
  }
  if (text.includes("dependency") || text.includes("same sku") || text.includes("shared")) {
    return { lever: "recipe_dependency_review", leverLabel: "Recipe dependency review" };
  }
  return { lever: "portion_standardization", leverLabel: "Portion standardization" };
}

function extractIngredientNameFromRecTitle(title: string): string | null {
  const trimMatch = title.match(/^Trim (.+?) on /i);
  if (trimMatch?.[1]) return trimMatch[1].trim();
  const supplierMatch = title.match(/(?:on|for|—)\s+([^—]+?)(?:\s+—|$)/i);
  if (supplierMatch?.[1] && !supplierMatch[1].toLowerCase().includes("menu")) {
    return supplierMatch[1].trim();
  }
  const recoveryMatch = title.match(/Margin recovery — (.+?) normalizing/i);
  if (recoveryMatch?.[1]) return recoveryMatch[1].trim();
  return null;
}

function recoveryGroupKey(rec: OperationalRecommendation): string {
  const cause = recoveryCauseFromCategory(rec.category);
  if (cause === "menu_repricing") return `menu_repricing:portfolio`;

  const ingredientName = extractIngredientNameFromRecTitle(rec.title);
  if (!ingredientName) return `${cause}:portfolio`;

  const category = inferCostCategory(ingredientName);
  const storyKey = resolveOperationalStoryKey({ ingredientName, category });
  return `${cause}:${storyKey}`;
}

function recoveryStoryKeyFromGroupKey(groupKey: string): string {
  const idx = groupKey.indexOf(":");
  return idx >= 0 ? groupKey.slice(idx + 1) : groupKey;
}

function mapRecoveryCardToGrouped(
  recs: OperationalRecommendation[],
  cause: RecoveryActionType,
): GroupedRecoveryOpportunity {
  const primary = recs.sort((a, b) => b.monthlyImpactEur - a.monthlyImpactEur)[0]!;
  const groupKey = recoveryGroupKey(primary);
  const storyKey = recoveryStoryKeyFromGroupKey(groupKey);
  const focus =
    extractIngredientNameFromRecTitle(primary.title) ??
    (cause === "menu_repricing" ? "Menu" : "Cost line");
  const category = inferCostCategory(focus);
  const lever = recoveryLeverFromRecommendation(primary);

  const recipeNames = new Set<string>();
  for (const rec of recs) {
    if (rec.affectedRecipes === 1 && rec.title.includes(" on ")) {
      const name = rec.title.split(" on ").pop()?.trim();
      if (name) recipeNames.add(name);
    }
  }

  const estimatedMonthlyRecoveryEur = recs.reduce(
    (sum, r) => sum + Math.max(0, r.monthlyImpactEur),
    0,
  );

  const suggestedActions = [
    ...new Set(
      recs.map((r) =>
        buildOperatorActionLine({
          cause,
          storyKey,
          lever: lever.lever,
          suggestedAction: r.action.replace(/\.$/, ""),
        }),
      ),
    ),
  ].slice(0, 2);
  const priority = mapToInsightPriority({
    severity: primary.urgency === "now" ? "critical" : primary.urgency === "this_week" ? "high" : "info",
    monthlyImpactEur: estimatedMonthlyRecoveryEur,
  });
  const title = synthesizeInsightTitle({
    kind: "recovery",
    cause,
    storyKey,
    category,
    ingredientName: focus,
  });

  return {
    id: `recovery-group-${groupKey}`,
    storyKey,
    priority,
    tier: tierFromInsight({
      priority,
      category: "operational_exposure",
      monthlyImpactEur: estimatedMonthlyRecoveryEur,
    }),
    decisionTier: mapToOperationalDecisionTier({
      priority,
      monthlyImpactEur: estimatedMonthlyRecoveryEur,
    }),
    cause,
    causeLabel: RECOVERY_CAUSE_LABELS[cause],
    lever: lever.lever,
    leverLabel: lever.leverLabel,
    title,
    why: primary.why,
    operatorInsightLine: buildOperatorInsightLine({ title, detail: primary.why }),
    consequence: buildConsequenceLine({
      priority,
      monthlyImpactEur: estimatedMonthlyRecoveryEur,
    }),
    affectedRecipes: [...recipeNames],
    estimatedMonthlyRecoveryEur,
    savingsLine: compressFinancialImpact(estimatedMonthlyRecoveryEur, {
      mode: "recovery",
      storyKey,
      category,
      cause,
    }) ?? primary.monthlyImpact,
    suggestedActions,
    operatorActions: suggestedActions,
    target: primary.target,
    actionLabel: primary.actionLabel,
  };
}

export function buildHeroNarrative(input: {
  prioritizedInsights: PrioritizedOperationalInsight[];
  groupedRecovery: GroupedRecoveryOpportunity[];
  monthlyMarginPressure: MonthlyMarginPressureSummary;
}): OperationalHeroNarrative {
  const primaryInsight = input.prioritizedInsights.find((insight) => insight.tier === "tier_1");
  const pressure = input.monthlyMarginPressure.estimatedMarginPressureEur;
  const impactLine =
    pressure >= 1
      ? `Current modeled pressure is ~${formatCurrency(pressure)}/mo if no operating changes are made.`
      : "Current modeled pressure is limited, but active risks still need execution discipline.";

  if (primaryInsight) {
    const actions = [
      primaryInsight.operatorAction,
      ...input.groupedRecovery.slice(0, 2).flatMap((card) => card.operatorActions),
    ].filter((value, index, arr) => value && arr.indexOf(value) === index).slice(0, 3);
    return {
      tier: "tier_1",
      title: primaryInsight.title,
      narrative: `${primaryInsight.operatorInsightLine} ${primaryInsight.consequence ?? ""}`.trim(),
      impactLine,
      actionCluster: actions,
    };
  }

  const fallbackActions = input.groupedRecovery
    .slice(0, 3)
    .map((card) => card.suggestedActions[0] ?? card.why)
    .filter(Boolean);
  return {
    tier: "tier_1",
    title: "Execution focus: protect stable margin baseline",
    narrative:
      "No single risk dominates today, but clustered levers remain open across supplier terms and recipe standardization.",
    impactLine,
    actionCluster: fallbackActions,
  };
}

export function buildCalmOperationalSignal(input: {
  categoryPressure: SynthesizedCategoryPressureRow[];
  prioritizedInsights: PrioritizedOperationalInsight[];
  monthlyMarginPressure: MonthlyMarginPressureSummary;
}): CalmOperationalSignal {
  const calmCategories = input.categoryPressure
    .filter((row) => row.trend === "flat" || row.trend === "down")
    .slice(0, 2)
    .map((row) => `${row.label} is ${row.trend === "down" ? "easing" : "stable"} this week`);
  const lowNoiseCount = input.prioritizedInsights.filter((insight) => insight.tier === "tier_3").length;
  const bullets = [
    ...calmCategories,
    `Supplier volatility is ${input.monthlyMarginPressure.supplierVolatilityLevel}`,
    lowNoiseCount > 0 ? `${lowNoiseCount} low-volatility signals moved to background monitoring` : null,
  ].filter((bullet): bullet is string => Boolean(bullet));
  return {
    title: "Operationally calm this week",
    bullets: bullets.slice(0, 3),
  };
}

/** Aggregates per-recipe recovery recommendations by operational cause and story key. */
export function buildGroupedRecoveryOpportunities(
  data: MarginAlertData,
  alerts: MarginAlertItem[],
  excludeTitles: string[] = [],
  limit = 5,
  excludeStoryKeys: string[] = [],
): GroupedRecoveryOpportunity[] {
  const excluded = new Set(excludeTitles.map((t) => t.toLowerCase()));
  const excludedStories = new Set(excludeStoryKeys);
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

  const finalized = finalizeOperationalRecommendations(candidates, limit + 8);
  const byGroup = new Map<string, OperationalRecommendation[]>();

  for (const rec of finalized) {
    if (excluded.has(rec.title.toLowerCase())) continue;
    const key = recoveryGroupKey(rec);
    const storyKey = recoveryStoryKeyFromGroupKey(key);
    if (excludedStories.has(storyKey)) continue;
    const bucket = byGroup.get(key) ?? [];
    bucket.push(rec);
    byGroup.set(key, bucket);
  }

  const seenStories = new Set<string>();

  return [...byGroup.values()]
    .map((recs) => mapRecoveryCardToGrouped(recs, recoveryCauseFromCategory(recs[0]!.category)))
    .filter((card) => {
      if (card.priority === "informational" && card.estimatedMonthlyRecoveryEur < MIN_VISIBLE_IMPACT_EUR) {
        return false;
      }
      if (seenStories.has(card.storyKey)) return false;
      seenStories.add(card.storyKey);
      if (excluded.has(card.title.toLowerCase())) return false;
      return true;
    })
    .sort(
      (a, b) =>
        priorityRank(a.priority) - priorityRank(b.priority) ||
        b.estimatedMonthlyRecoveryEur - a.estimatedMonthlyRecoveryEur,
    )
    .slice(0, limit);
}

/** Legacy flat recovery cards — wraps existing builder (calculations unchanged). */
export function buildFlatRecoveryOpportunities(
  data: MarginAlertData,
  alerts: MarginAlertItem[],
  excludeTitles: string[] = [],
  limit = 5,
): RecoveryOpportunityCard[] {
  return buildRecoveryOpportunities(data, alerts, excludeTitles, limit);
}

const GENERIC_OPERATIONAL_TITLES = new Set(
  [
    "concentration risk",
    "sensitivity detected",
    "operational margin signal",
    "menu exposure concentration",
  ].map((t) => t.toLowerCase()),
);

const MATERIAL_SNAPSHOT_INCREASE_PCT = 3;

function isGenericOperationalTitle(title: string): boolean {
  return GENERIC_OPERATIONAL_TITLES.has(title.trim().toLowerCase());
}

function countMaterialIngredientIncreases(alerts: MarginAlertItem[]): number {
  const seen = new Set<string>();
  for (const alert of alerts) {
    if (alert.kind !== "price_increase" && alert.kind !== "ingredient_inflation_spike") continue;
    const movement = alert.meta.find((m) => m.label === "Movement")?.value;
    const match = movement?.match(/([\d.]+)/);
    const pct = match ? Number(match[1]) : 0;
    if (!Number.isFinite(pct) || pct < MATERIAL_SNAPSHOT_INCREASE_PCT) continue;
    const key = extractIngredientIdFromAlert(alert) ?? alert.id;
    seen.add(key);
  }
  return seen.size;
}

function resolveOperationalStatePhrase(input: {
  monthlyMarginPressure: MonthlyMarginPressureSummary;
  worseningRecipeCount: number;
  materialIncreases: number;
}): string {
  const pressure = input.monthlyMarginPressure.estimatedMarginPressureEur;
  const volatile = input.monthlyMarginPressure.supplierVolatilityLevel === "high";
  const inflating = Boolean(input.monthlyMarginPressure.biggestInflationDriver);

  if (pressure >= 75 || input.worseningRecipeCount >= 2 || (volatile && inflating)) {
    return "Pressure is building";
  }
  if (
    pressure < 25 &&
    input.worseningRecipeCount === 0 &&
    input.materialIncreases === 0 &&
    !volatile
  ) {
    return "Operations are stabilizing";
  }
  if (input.worseningRecipeCount > 0 || inflating) {
    return "Mixed signals — selective intervention needed";
  }
  return "Mostly stable with a few lines to watch";
}

function pricingConfidenceLine(alerts: MarginAlertItem[]): { line: string; tone: OperationalSnapshotSignalTone } {
  const stale = alerts.filter((a) => a.kind === "stale_price");
  if (stale.length >= 2) {
    return {
      line: `${stale.length} catalog lines awaiting invoice confirmation`,
      tone: "watch",
    };
  }
  if (stale.length === 1) {
    return { line: "One line on catalog fallback — confirm on next invoice", tone: "watch" };
  }
  return { line: "Pricing confidence aligned with recent paid invoices", tone: "info" };
}

/** Executive snapshot — title, synthesis paragraph, compact signals, key takeaway. */
export function buildOperationalSnapshotViewModel(input: {
  hero: OperationalHeroNarrative;
  monthlyMarginPressure: MonthlyMarginPressureSummary;
  prioritizedInsights: PrioritizedOperationalInsight[];
  concentrationGroups: GroupedConcentrationInsight[];
  operationalSynthesisGroups: OperationalSynthesisGroups;
  alerts: MarginAlertItem[];
  curatedExposures: CuratedOperationalExposure[];
}): OperationalSnapshotViewModel {
  const worsening = input.operationalSynthesisGroups.recipeMarginMovements.worsening.filter(
    (entry) =>
      entry.estimatedMonthlyImpactEur >= MIN_RECIPE_MARGIN_MOVEMENT_EUR ||
      entry.normalizedPriority === "critical" ||
      entry.normalizedPriority === "warning",
  );
  const materialIncreases = countMaterialIngredientIncreases(input.alerts);
  const statePhrase = resolveOperationalStatePhrase({
    monthlyMarginPressure: input.monthlyMarginPressure,
    worseningRecipeCount: worsening.length,
    materialIncreases,
  });

  const primaryInsight = input.prioritizedInsights.find((i) => i.tier === "tier_1") ?? input.prioritizedInsights[0];
  const operationalTitle = input.hero.title;
  const intervention =
    input.monthlyMarginPressure.estimatedMarginPressureEur >= 50 ||
    input.prioritizedInsights.some((i) => i.decisionTier === "now")
      ? "Intervention recommended this week."
      : "Monitor before changing specs or menu price.";

  const synthesisParagraph = [
    `${statePhrase} — ${input.hero.narrative || input.monthlyMarginPressure.calmSummaryLine}`,
    intervention,
  ]
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();

  const topConcentration = input.concentrationGroups[0];
  const pricing = pricingConfidenceLine(input.alerts);

  const signals: OperationalSnapshotSignal[] = [
    {
      id: "supplier-volatility",
      label: "Supplier volatility",
      line: input.monthlyMarginPressure.supplierVolatilityLabel,
      tone:
        input.monthlyMarginPressure.supplierVolatilityLevel === "high"
          ? "risk"
          : input.monthlyMarginPressure.supplierVolatilityLevel === "medium"
            ? "watch"
            : "info",
    },
    {
      id: "plate-concentration",
      label: "Avg plate concentration",
      line: topConcentration
        ? `${formatPercent(topConcentration.avgConcentrationPct)} avg share · ${topConcentration.affectedRecipes.length} dish${topConcentration.affectedRecipes.length === 1 ? "" : "es"}`
        : "No dominant single-ingredient concentration flagged",
      tone: topConcentration?.priority === "critical" ? "risk" : topConcentration ? "watch" : "info",
    },
    {
      id: "inflation-detection",
      label: "Inflation detection",
      line: input.monthlyMarginPressure.biggestInflationDriver
        ? `Primary driver: ${input.monthlyMarginPressure.biggestInflationDriver}`
        : materialIncreases > 0
          ? `${materialIncreases} ingredient line${materialIncreases === 1 ? "" : "s"} up materially on invoices`
          : "No material category inflation this period",
      tone: input.monthlyMarginPressure.biggestInflationDriver ? "risk" : materialIncreases > 0 ? "watch" : "info",
    },
    {
      id: "recipes-deteriorating",
      label: "Recipes deteriorating",
      line:
        worsening.length > 0
          ? `${worsening.length} recipe${worsening.length === 1 ? "" : "s"} below target or slipping (${worsening[0]?.recipeName ?? "flagged"})`
          : `All monitored recipes at or above target (${input.monthlyMarginPressure.recipesBelowTarget} below target in model)`,
      tone: worsening.length > 0 ? "risk" : "recovery",
    },
    {
      id: "dominant-category",
      label: "Dominant category",
      line: input.monthlyMarginPressure.mostAffectedCategory ?? "Cost spread balanced across categories",
      tone: "info",
    },
    {
      id: "pricing-confidence",
      label: "Pricing confidence",
      line: pricing.line,
      tone: pricing.tone,
    },
  ];

  const stableCategories = input.operationalSynthesisGroups.stableOperationalAreas.categories;
  if (
    stableCategories.length >= 2 &&
    input.monthlyMarginPressure.estimatedMarginPressureEur < 50 &&
    worsening.length === 0
  ) {
    signals.push({
      id: "stable-footnote",
      label: "Stable footing",
      line: `${stableCategories
        .slice(0, 2)
        .map((c) => c.label)
        .join(" and ")} holding steady on recent invoices`,
      tone: "recovery",
    });
  }

  const keyTakeaway =
    input.hero.actionCluster[0] ??
    primaryInsight?.operatorAction ??
    input.operationalSynthesisGroups.recoverySignals[0]?.operatorActions[0] ??
    "Review specs and next invoice before changing menu price.";

  return {
    operationalTitle,
    synthesisParagraph,
    pressureLine: input.hero.impactLine || input.monthlyMarginPressure.estimatedMarginPressureLine,
    signals,
    keyTakeaway,
  };
}

function isInOperationalWindow(
  dateIso: string | null | undefined,
  windowKey: OperationalWindowKey,
  windows: OperationalWindow[],
): boolean {
  if (!dateIso) return false;
  const eventMs = new Date(dateIso).getTime();
  if (!Number.isFinite(eventMs)) return false;
  const window = windows.find((w) => w.key === windowKey);
  if (!window) return false;
  return eventMs >= new Date(window.startsAtIso).getTime();
}

function priceHistoryDeltaPct(row: MarginAlertData["priceHistory"][number]): number {
  return (
    row.delta_percent ??
    ((row.new_price ?? 0) > 0 && (row.previous_price ?? 0) > 0
      ? (((row.new_price ?? 0) - (row.previous_price ?? 0)) / (row.previous_price ?? 1)) * 100
      : 0)
  );
}

function ingredientLabel(
  ingredientId: string,
  fallbackName: string | null | undefined,
  ingredients: MarginAlertData["ingredients"],
): string {
  return (
    ingredients.find((i) => i.id === ingredientId)?.name?.trim() ||
    fallbackName?.trim() ||
    "Ingredient"
  );
}

function formatUnitPricePair(
  previous: number | null | undefined,
  current: number | null | undefined,
  unit: string | null | undefined,
): string | null {
  const prev = Number(previous ?? 0);
  const next = Number(current ?? 0);
  if (prev <= 0 && next <= 0) return null;
  const unitLabel = unit?.trim() || "unit";
  const prevLabel = prev > 0 ? formatCurrency(prev) : "—";
  const nextLabel = next > 0 ? formatCurrency(next) : "—";
  return `${prevLabel} → ${nextLabel}/${unitLabel}`;
}

function formatMarginPpDelta(marginFromPct: number, marginToPct: number): string {
  const pp = Math.round(marginToPct - marginFromPct);
  const sign = pp > 0 ? "+" : "";
  return `${sign}${pp} pp`;
}

export function mapExposureRiskLevel(input: {
  monthlyExposureEur: number;
  costSharePct?: number;
}): OperationalTrendExposureDetail["riskLevel"] {
  const priority = mapToInsightPriority({
    monthlyImpactEur: input.monthlyExposureEur,
    contributionPct: input.costSharePct,
  });
  if (priority === "critical" || priority === "warning") return "HIGH";
  if (priority === "monitor") return "MEDIUM";
  return "LOW";
}

export function resolveOperationalTrendBadges(input: {
  ingredientId?: string;
  supplierName?: string;
  monthlyExposureEur?: number;
  costSharePct?: number;
  supplierSpendSharePct?: number;
  alerts?: MarginAlertItem[];
}): OperationalTrendBadge[] {
  const badges: OperationalTrendBadge[] = [];
  const exposure = input.monthlyExposureEur ?? 0;
  const share = input.costSharePct ?? 0;

  if (exposure >= 75 || mapToInsightPriority({ monthlyImpactEur: exposure }) === "warning") {
    badges.push("HIGH EXPOSURE");
  }
  if (share >= 55) {
    badges.push("HIGH DEPENDENCY");
  }
  if ((input.supplierSpendSharePct ?? 0) >= 40) {
    badges.push("SUPPLIER CONCENTRATION");
  }

  const alerts = input.alerts ?? [];
  if (
    input.ingredientId &&
    alerts.some(
      (alert) =>
        alert.kind === "stale_price" &&
        (extractIngredientIdFromAlert(alert) === input.ingredientId ||
          alert.id.includes(input.ingredientId!)),
    )
  ) {
    badges.push("STALE PRICE");
    badges.push("PRICE CONFIDENCE LOW");
  }

  return [...new Set(badges)];
}

type SupplierWindowAggregate = {
  supplierName: string;
  avgPct: number;
  changeEvents: number;
  invoiceCount: number;
  spendEur: number;
  ingredientIds: Set<string>;
  topIncreaseIngredient: { name: string; pct: number } | null;
  topDecreaseIngredient: { name: string; pct: number } | null;
};

function formatSupplierMemorySecondary(stats: {
  invoiceCount: number;
  spendEur: number;
  ingredientCount: number;
  topIngredientName: string | null;
}): string | undefined {
  const parts: string[] = [];
  if (stats.invoiceCount > 0) {
    parts.push(`${stats.invoiceCount} invoice${stats.invoiceCount === 1 ? "" : "s"}`);
  }
  if (stats.spendEur > 0) {
    parts.push(`${formatCurrency(stats.spendEur)} spend`);
  }
  if (stats.ingredientCount > 0) {
    parts.push(`${stats.ingredientCount} ingredient${stats.ingredientCount === 1 ? "" : "s"}`);
  }
  if (stats.topIngredientName) {
    parts.push(`top: ${stats.topIngredientName}`);
  }
  return parts.length > 0 ? parts.join(" · ") : undefined;
}

function resolveSupplierTopIngredientName(input: {
  supplierName: string;
  ingredientIds: Set<string>;
  data: MarginAlertData;
}): string | null {
  const portfolio = buildPortfolioCostExposure(input.data, 50).filter((row) =>
    input.ingredientIds.has(row.ingredientId),
  );
  if (portfolio.length > 0) {
    return portfolio.sort((a, b) => b.monthlyModeledExposureEur - a.monthlyModeledExposureEur)[0]
      ?.ingredientName;
  }
  const names = [...input.ingredientIds]
    .map((id) => input.data.ingredients.find((i) => i.id === id)?.name?.trim())
    .filter((name): name is string => Boolean(name));
  if (names[0]) return names[0];
  return buildPortfolioCostExposure(input.data, 1)[0]?.ingredientName ?? null;
}

function countSupplierIngredients(stats: SupplierWindowAggregate, data: MarginAlertData): number {
  if (stats.ingredientIds.size > 0) return stats.ingredientIds.size;
  if (stats.spendEur <= 0 && stats.invoiceCount <= 0) return 0;
  const recipeIngredientIds = new Set<string>();
  for (const recipe of data.recipes) {
    for (const line of recipe.recipe_ingredients ?? []) {
      if (line.ingredient_id) recipeIngredientIds.add(line.ingredient_id);
    }
  }
  return recipeIngredientIds.size || data.ingredients.length;
}

function formatOperationalDateLabel(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const ms = new Date(iso).getTime();
  if (!Number.isFinite(ms)) return null;
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(ms));
}

function resolveIngredientSupplierContext(
  data: MarginAlertData,
  ingredientId: string,
): Pick<
  OperationalTrendExposureDetail,
  "currentSupplierName" | "latestInvoiceDateLabel" | "latestUnitPriceLabel"
> {
  const history = data.priceHistory
    .filter((row) => row.ingredient_id === ingredientId)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  const latest = history[0];
  if (!latest) {
    return {
      currentSupplierName: null,
      latestInvoiceDateLabel: null,
      latestUnitPriceLabel: null,
    };
  }

  const ingredient = data.ingredients.find((row) => row.id === ingredientId);
  const unit =
    latest.ingredient_unit?.trim() ||
    ingredient?.unit?.trim() ||
    ingredient?.purchase_unit?.trim() ||
    "unit";
  const unitPrice = latest.new_price ?? ingredient?.current_price ?? null;
  const unitPriceLabel =
    unitPrice != null && Number(unitPrice) > 0
      ? `${formatCurrency(Number(unitPrice))}/${unit}`
      : null;

  return {
    currentSupplierName: latest.supplier_name?.trim() || null,
    latestInvoiceDateLabel: formatOperationalDateLabel(latest.created_at),
    latestUnitPriceLabel: unitPriceLabel,
  };
}

function buildExposureDetailFromRow(
  row: Pick<
    CostExposureRow,
    "ingredientId" | "ingredientName" | "recipeCount" | "monthlyModeledExposureEur" | "totalLineCost" | "costSharePct"
  >,
  largestRecipeName: string,
  data: MarginAlertData,
): OperationalTrendExposureDetail {
  const tenPercentImpactEur = estimateTenPercentSensitivityEur(row.totalLineCost, row.recipeCount);
  return {
    ingredientName: row.ingredientName,
    recipesAffected: row.recipeCount,
    largestRecipeName,
    monthlyExposureEur: row.monthlyModeledExposureEur,
    tenPercentImpactEur,
    riskLevel: mapExposureRiskLevel({
      monthlyExposureEur: row.monthlyModeledExposureEur,
      costSharePct: row.costSharePct,
    }),
    ...resolveIngredientSupplierContext(data, row.ingredientId),
  };
}

function recipesUsingIngredient(data: MarginAlertData, ingredientId: string): string[] {
  const names: string[] = [];
  for (const recipe of data.recipes) {
    if (recipe.type === "prep") continue;
    const uses = (recipe.recipe_ingredients ?? []).some((line) => line.ingredient_id === ingredientId);
    if (uses) names.push(recipe.name?.trim() || "Recipe");
  }
  return names;
}

function largestRecipeForIngredient(data: MarginAlertData, ingredientId: string): string {
  const menuMetrics = getRecipeMetrics(data.recipes).filter((m) => m.recipe.type !== "prep");
  let bestName = "—";
  let bestLineCost = -1;

  for (const metric of menuMetrics) {
    const line = metric.recipe.recipe_ingredients?.find((entry) => entry.ingredient_id === ingredientId);
    if (!line?.ingredients) continue;
    const qty = Number(line.quantity ?? 0);
    const unitCost = Number(line.ingredients.current_price ?? 0);
    const lineCost = qty * unitCost;
    if (lineCost > bestLineCost) {
      bestLineCost = lineCost;
      bestName = metric.recipe.name?.trim() || "Recipe";
    }
  }

  return bestName;
}

function trendRowEntityKey(row: OperationalTrendMetricRow): string {
  if (row.recipeId) return `recipe:${row.recipeId}`;
  if (row.ingredientId) return `ingredient:${row.ingredientId}`;
  if (row.supplierName) return `supplier:${row.supplierName.trim().toLowerCase()}`;

  const tail = row.id.split(":").pop() ?? row.id;
  if (row.id.startsWith("supplier-") && !row.id.includes("portfolio-fallback") && !row.id.includes("ingredient-fallback")) {
    return `supplier:${tail.trim().toLowerCase()}`;
  }
  if (row.id.startsWith("ingredient-") || row.id.startsWith("exposure-ingredient")) {
    return `ingredient:${tail}`;
  }
  if (row.id.startsWith("recipe-") || row.id.startsWith("exposure-recipe")) {
    return `recipe:${tail}`;
  }
  return `row:${row.id}`;
}

function trendRowSignalPriority(row: OperationalTrendMetricRow): number {
  if (/fallback|rank-|pad|portfolio/.test(row.id)) return 0;
  if (/increase|decrease|winner|loser|exposure-ingredient:|exposure-supplier:|exposure-recipe:/.test(row.id)) {
    return 2;
  }
  return 1;
}

function mergeTrendMetricRows(
  primary: OperationalTrendMetricRow,
  secondary: OperationalTrendMetricRow,
): OperationalTrendMetricRow {
  const preferred =
    trendRowSignalPriority(primary) >= trendRowSignalPriority(secondary) ? primary : secondary;
  const other = preferred === primary ? secondary : primary;

  const secondaryParts = [preferred.secondary, other.secondary]
    .filter((part): part is string => Boolean(part && part.trim()))
    .filter((part, index, list) => list.indexOf(part) === index);

  const monthlyExposureEur = Math.max(
    preferred.exposure?.monthlyExposureEur ?? 0,
    other.exposure?.monthlyExposureEur ?? 0,
  );
  const exposure =
    preferred.exposure || other.exposure
      ? {
          ...(other.exposure ?? preferred.exposure)!,
          ...(preferred.exposure ?? other.exposure)!,
          monthlyExposureEur:
            monthlyExposureEur > 0
              ? monthlyExposureEur
              : (preferred.exposure ?? other.exposure)!.monthlyExposureEur,
          tenPercentImpactEur: Math.max(
            preferred.exposure?.tenPercentImpactEur ?? 0,
            other.exposure?.tenPercentImpactEur ?? 0,
          ),
        }
      : undefined;

  const badgeSet = new Set<OperationalTrendBadge>([
    ...(preferred.badges ?? []),
    ...(other.badges ?? []),
  ]);

  return {
    ...preferred,
    secondary: secondaryParts.length > 0 ? secondaryParts.join(" · ") : undefined,
    badges: badgeSet.size > 0 ? [...badgeSet] : undefined,
    exposure,
    expandable: preferred.expandable ?? other.expandable,
    ingredientId: preferred.ingredientId ?? other.ingredientId,
    recipeId: preferred.recipeId ?? other.recipeId,
    supplierName: preferred.supplierName ?? other.supplierName,
  };
}

function dedupeTrendMetricRows(rows: OperationalTrendMetricRow[]): OperationalTrendMetricRow[] {
  const merged = new Map<string, OperationalTrendMetricRow>();
  for (const row of rows) {
    const key = trendRowEntityKey(row);
    const existing = merged.get(key);
    merged.set(key, existing ? mergeTrendMetricRows(existing, row) : row);
  }
  return [...merged.values()];
}

function aggregateSuppliersInWindow(input: {
  windowKey: OperationalWindowKey;
  data: MarginAlertData;
  windows: OperationalWindow[];
}): SupplierWindowAggregate[] {
  const historyInWindow = input.data.priceHistory.filter((row) =>
    isInOperationalWindow(row.created_at, input.windowKey, input.windows),
  );

  const invoiceCountBySupplier = new Map<string, number>();
  const spendBySupplier = new Map<string, number>();
  for (const invoice of input.data.invoices) {
    if (!isInOperationalWindow(invoice.created_at, input.windowKey, input.windows)) continue;
    const supplier = invoice.supplier_name?.trim();
    if (!supplier) continue;
    invoiceCountBySupplier.set(supplier, (invoiceCountBySupplier.get(supplier) ?? 0) + 1);
    spendBySupplier.set(supplier, (spendBySupplier.get(supplier) ?? 0) + Number(invoice.total ?? 0));
  }

  const bySupplier = new Map<
    string,
    {
      changes: number[];
      ingredientIds: Set<string>;
      ingredientDeltas: Map<string, { name: string; pct: number }>;
    }
  >();

  for (const row of historyInWindow) {
    const supplier = row.supplier_name?.trim();
    if (!supplier) continue;
    const pct = priceHistoryDeltaPct(row);
    const bucket = bySupplier.get(supplier) ?? {
      changes: [],
      ingredientIds: new Set<string>(),
      ingredientDeltas: new Map(),
    };
    bucket.changes.push(pct);
    bucket.ingredientIds.add(row.ingredient_id);
    const label = ingredientLabel(row.ingredient_id, row.ingredient_name, input.data.ingredients);
    const existing = bucket.ingredientDeltas.get(row.ingredient_id);
    if (!existing || Math.abs(pct) > Math.abs(existing.pct)) {
      bucket.ingredientDeltas.set(row.ingredient_id, { name: label, pct });
    }
    bySupplier.set(supplier, bucket);
  }

  const supplierNames = new Set([
    ...bySupplier.keys(),
    ...invoiceCountBySupplier.keys(),
    ...spendBySupplier.keys(),
  ]);

  return [...supplierNames].map((supplierName) => {
    const bucket = bySupplier.get(supplierName);
    const changes = bucket?.changes ?? [];
    const avgPct =
      changes.length > 0 ? changes.reduce((sum, value) => sum + value, 0) / changes.length : 0;
    const ingredientDeltas = [...(bucket?.ingredientDeltas.values() ?? [])];
    const topIncreaseIngredient =
      ingredientDeltas
        .filter((entry) => entry.pct >= MIN_MEANINGFUL_SUPPLIER_CHANGE_PCT)
        .sort((a, b) => b.pct - a.pct)[0] ?? null;
    const topDecreaseIngredient =
      ingredientDeltas
        .filter((entry) => entry.pct <= -MIN_MEANINGFUL_SUPPLIER_CHANGE_PCT)
        .sort((a, b) => a.pct - b.pct)[0] ?? null;

    const ingredientIds = bucket?.ingredientIds ?? new Set<string>();
    return {
      supplierName,
      avgPct,
      changeEvents: changes.length,
      invoiceCount: invoiceCountBySupplier.get(supplierName) ?? 0,
      spendEur: spendBySupplier.get(supplierName) ?? 0,
      ingredientIds,
      topIncreaseIngredient,
      topDecreaseIngredient,
    };
  });
}

function aggregateSuppliersAllTime(data: MarginAlertData): SupplierWindowAggregate[] {
  const windows = buildOperationalWindows(new Date());
  return aggregateSuppliersInWindow({
    windowKey: "last_6_months",
    data,
    windows,
  });
}

function supplierMemoryForAggregate(
  stats: SupplierWindowAggregate,
  data: MarginAlertData,
): string | undefined {
  return formatSupplierMemorySecondary({
    invoiceCount: stats.invoiceCount,
    spendEur: stats.spendEur,
    ingredientCount: countSupplierIngredients(stats, data),
    topIngredientName: resolveSupplierTopIngredientName({
      supplierName: stats.supplierName,
      ingredientIds: stats.ingredientIds,
      data,
    }),
  });
}

function supplierExpandable(
  stats: SupplierWindowAggregate,
  data: MarginAlertData,
): OperationalTrendExpandable {
  const ingredientNames = [...stats.ingredientIds]
    .map((id) => ingredientLabel(id, null, data.ingredients))
    .slice(0, 8);
  const bullets = [
    `${stats.invoiceCount} invoice${stats.invoiceCount === 1 ? "" : "s"} in period`,
    stats.spendEur > 0 ? `${formatCurrency(stats.spendEur)} spend in period` : "No invoice spend in period",
    stats.changeEvents > 0
      ? `${stats.changeEvents} invoice price change${stats.changeEvents === 1 ? "" : "s"} recorded`
      : "No invoice price changes recorded in this period",
    ingredientNames.length > 0
      ? `Ingredients supplied: ${ingredientNames.join(", ")}`
      : stats.invoiceCount > 0
        ? "Awaiting additional invoice history"
        : "No supplier price movement detected",
  ];
  return { bullets };
}

export function buildSupplierMovementMetrics(input: {
  windowKey: OperationalWindowKey;
  data: MarginAlertData;
  windows: OperationalWindow[];
  alerts?: MarginAlertItem[];
}): OperationalTrendMetricSection {
  const rows: OperationalTrendMetricRow[] = [];
  let aggregates = aggregateSuppliersInWindow(input);
  if (aggregates.length === 0) {
    aggregates = aggregateSuppliersAllTime(input.data);
  }
  const totalSpend = aggregates.reduce((sum, entry) => sum + entry.spendEur, 0);
  const ranked = [...aggregates].sort(
    (a, b) =>
      b.spendEur - a.spendEur ||
      b.invoiceCount - a.invoiceCount ||
      b.changeEvents - a.changeEvents ||
      Math.abs(b.avgPct) - Math.abs(a.avgPct),
  );
  const usedNames = new Set<string>();

  const pushSupplierRow = (
    stats: SupplierWindowAggregate,
    config: {
      idSuffix: string;
      value: string;
      secondary?: string;
    },
  ) => {
    if (rows.length >= 3 || usedNames.has(stats.supplierName)) return;
    rows.push({
      id: `supplier-${config.idSuffix}:${input.windowKey}:${stats.supplierName}`,
      name: stats.supplierName,
      value: config.value,
      secondary: config.secondary ?? supplierMemoryForAggregate(stats, input.data),
      expandable: supplierExpandable(stats, input.data),
      supplierName: stats.supplierName,
      badges: resolveOperationalTrendBadges({
        supplierName: stats.supplierName,
        supplierSpendSharePct: totalSpend > 0 ? (stats.spendEur / totalSpend) * 100 : undefined,
        alerts: input.alerts,
      }),
    });
    usedNames.add(stats.supplierName);
  };

  const topIncrease = aggregates
    .filter((entry) => entry.avgPct >= MIN_MEANINGFUL_SUPPLIER_CHANGE_PCT)
    .sort((a, b) => b.avgPct - a.avgPct)[0];
  const increaseSubject = topIncrease ?? ranked[0];
  if (increaseSubject) {
    const memory = supplierMemoryForAggregate(increaseSubject, input.data);
    pushSupplierRow(increaseSubject, {
      idSuffix: topIncrease ? "increase" : "fallback-spend",
      value: topIncrease
        ? `+${formatPercent(Math.round(topIncrease.avgPct))}`
        : increaseSubject.spendEur > 0
          ? formatCurrency(increaseSubject.spendEur)
          : `${increaseSubject.changeEvents} price event${increaseSubject.changeEvents === 1 ? "" : "s"}`,
      secondary: topIncrease
        ? [
            memory,
            topIncrease.topIncreaseIngredient
              ? `top ↑ ${topIncrease.topIncreaseIngredient.name} +${formatPercent(Math.round(topIncrease.topIncreaseIngredient.pct))}`
              : null,
          ]
            .filter((part): part is string => Boolean(part))
            .join(" · ")
        : memory,
    });
  }

  const topDecrease = aggregates
    .filter((entry) => entry.avgPct <= -MIN_MEANINGFUL_SUPPLIER_CHANGE_PCT)
    .sort((a, b) => a.avgPct - b.avgPct)[0];
  const decreaseSubject =
    topDecrease ??
    ranked.find((entry) => !usedNames.has(entry.supplierName)) ??
    ranked[0];
  if (decreaseSubject) {
    pushSupplierRow(decreaseSubject, {
      idSuffix: topDecrease ? "decrease" : "fallback-memory",
      value: topDecrease
        ? formatPercent(Math.round(topDecrease.avgPct))
        : decreaseSubject.invoiceCount > 0
          ? `${decreaseSubject.invoiceCount} invoice${decreaseSubject.invoiceCount === 1 ? "" : "s"}`
          : decreaseSubject.changeEvents > 0
            ? `${decreaseSubject.changeEvents} price event${decreaseSubject.changeEvents === 1 ? "" : "s"}`
            : formatCurrency(decreaseSubject.spendEur),
      secondary: topDecrease
        ? [
            supplierMemoryForAggregate(decreaseSubject, input.data),
            decreaseSubject.topDecreaseIngredient
              ? `top ↓ ${decreaseSubject.topDecreaseIngredient.name} ${formatPercent(Math.round(decreaseSubject.topDecreaseIngredient.pct))}`
              : null,
          ]
            .filter((part): part is string => Boolean(part))
            .join(" · ")
        : supplierMemoryForAggregate(decreaseSubject, input.data),
    });
  }

  const topSpend = [...aggregates]
    .filter((entry) => entry.spendEur > 0)
    .sort((a, b) => b.spendEur - a.spendEur)[0];
  const spendSubject = topSpend ?? ranked.find((entry) => entry.spendEur > 0) ?? ranked[0];
  if (spendSubject && rows.length < 3) {
    pushSupplierRow(spendSubject, {
      idSuffix: "spend",
      value:
        spendSubject.spendEur > 0
          ? formatCurrency(spendSubject.spendEur)
          : `${spendSubject.changeEvents} price event${spendSubject.changeEvents === 1 ? "" : "s"}`,
      secondary: supplierMemoryForAggregate(spendSubject, input.data),
    });
  }

  for (const stats of ranked) {
    if (rows.length >= 3) break;
    if (usedNames.has(stats.supplierName) && ranked.length > 1) continue;
    pushSupplierRow(stats, {
      idSuffix: `rank-${rows.length}`,
      value:
        stats.spendEur > 0
          ? formatCurrency(stats.spendEur)
          : stats.changeEvents > 0
            ? `${stats.changeEvents} price events`
            : formatPercent(Math.round(stats.avgPct)),
    });
  }

  if (rows.length < 3) {
    const portfolio = buildPortfolioCostExposure(input.data, 6);
    for (const row of portfolio) {
      if (rows.length >= 3) break;
      if (rows.some((existing) => existing.id.includes(row.ingredientId))) continue;
      rows.push({
        id: `supplier-portfolio-fallback:${input.windowKey}:${row.ingredientId}`,
        name: row.ingredientName,
        value: `${formatCurrency(row.monthlyModeledExposureEur)}/mo`,
        secondary: `${row.recipeCount} recipe${row.recipeCount === 1 ? "" : "s"} · ${formatPercent(Math.round(row.costSharePct))} cost share`,
        ingredientId: row.ingredientId,
        expandable: ingredientExpandable(
          { ingredientId: row.ingredientId, name: row.ingredientName },
          input.data,
        ),
        badges: resolveOperationalTrendBadges({
          ingredientId: row.ingredientId,
          monthlyExposureEur: row.monthlyModeledExposureEur,
          costSharePct: row.costSharePct,
          alerts: input.alerts,
        }),
      });
    }
    for (const ingredient of input.data.ingredients) {
      if (rows.length >= 3) break;
      if (rows.some((existing) => existing.id.includes(ingredient.id))) continue;
      const exposure = buildPortfolioCostExposure(input.data, 50).find(
        (row) => row.ingredientId === ingredient.id,
      );
      rows.push({
        id: `supplier-ingredient-fallback:${input.windowKey}:${ingredient.id}`,
        name: ingredient.name?.trim() || "Ingredient",
        value: exposure
          ? `${formatCurrency(exposure.monthlyModeledExposureEur)}/mo`
          : formatCurrency(Number(ingredient.current_price ?? 0)),
        secondary: exposure
          ? `${exposure.recipeCount} recipes in menu`
          : "No supplier price movement detected",
        ingredientId: ingredient.id,
        expandable: ingredientExpandable(
          { ingredientId: ingredient.id, name: ingredient.name?.trim() || "Ingredient" },
          input.data,
        ),
      });
    }
    const menuMetric = getRecipeMetrics(input.data.recipes).find((m) => m.recipe.type !== "prep");
    if (rows.length < 3 && menuMetric) {
      const recipeName = menuMetric.recipe.name?.trim() || "Recipe";
      if (!rows.some((row) => row.name === recipeName)) {
        rows.push({
          id: `supplier-menu-fallback:${input.windowKey}:${menuMetric.recipe.id}`,
          name: recipeName,
          value: formatCurrency(menuMetric.foodCost),
          secondary: `Menu food cost · ${menuMetric.ingredientCount} ingredients`,
          recipeId: menuMetric.recipe.id,
          expandable: recipeMetricExpandable(menuMetric),
        });
      }
    }
  }

  return { title: "Supplier Movement", rows: dedupeTrendMetricRows(rows).slice(0, 3) };
}

type IngredientPriceMovement = {
  ingredientId: string;
  name: string;
  pct: number;
  previousPrice: number | null;
  currentPrice: number | null;
  unit: string | null;
};

function rankIngredientPriceMovements(input: {
  windowKey: OperationalWindowKey;
  data: MarginAlertData;
  windows: OperationalWindow[];
}): IngredientPriceMovement[] {
  const historyInWindow = input.data.priceHistory.filter((row) =>
    isInOperationalWindow(row.created_at, input.windowKey, input.windows),
  );

  const byIngredient = new Map<string, IngredientPriceMovement>();
  for (const row of historyInWindow) {
    const pct = priceHistoryDeltaPct(row);
    if (Math.abs(pct) < MIN_MEANINGFUL_SUPPLIER_CHANGE_PCT) continue;
    const label = ingredientLabel(row.ingredient_id, row.ingredient_name, input.data.ingredients);
    const existing = byIngredient.get(row.ingredient_id);
    if (!existing || Math.abs(pct) > Math.abs(existing.pct)) {
      byIngredient.set(row.ingredient_id, {
        ingredientId: row.ingredient_id,
        name: label,
        pct,
        previousPrice: row.previous_price,
        currentPrice: row.new_price,
        unit: row.ingredient_unit,
      });
    }
  }

  return [...byIngredient.values()];
}

function ingredientExpandable(
  entry: { ingredientId: string; name: string },
  data: MarginAlertData,
): OperationalTrendExpandable {
  const exposure = buildPortfolioCostExposure(data, 50).find(
    (row) => row.ingredientId === entry.ingredientId,
  );
  const recipes = recipesUsingIngredient(data, entry.ingredientId);
  const supplierContext = resolveIngredientSupplierContext(data, entry.ingredientId);
  const catalogPrice =
    data.ingredients.find((i) => i.id === entry.ingredientId)?.current_price ?? null;
  const latestPrice =
    supplierContext.latestUnitPriceLabel ??
    (catalogPrice != null && catalogPrice > 0
      ? `${formatCurrency(catalogPrice)}/${data.ingredients.find((i) => i.id === entry.ingredientId)?.unit?.trim() || "unit"}`
      : "—");

  return {
    bullets: [
      recipes.length > 0
        ? `Recipes using: ${recipes.slice(0, 6).join(", ")}${recipes.length > 6 ? ` +${recipes.length - 6} more` : ""}`
        : "No menu recipes linked",
      supplierContext.currentSupplierName
        ? `Current supplier: ${supplierContext.currentSupplierName}`
        : "No supplier price movement detected",
      supplierContext.latestInvoiceDateLabel
        ? `Latest invoice: ${supplierContext.latestInvoiceDateLabel}`
        : "Awaiting additional invoice history",
      `Latest known price: ${latestPrice}`,
      exposure
        ? `Exposure: ${formatCurrency(exposure.monthlyModeledExposureEur)}/mo across ${exposure.recipeCount} recipe${exposure.recipeCount === 1 ? "" : "s"}`
        : "Exposure not modeled for this line",
    ],
  };
}

function pushIngredientFallbackRows(
  rows: OperationalTrendMetricRow[],
  input: {
    windowKey: OperationalWindowKey;
    data: MarginAlertData;
    alerts?: MarginAlertItem[];
    mode: "spend" | "purchased" | "exposure";
    excludeIds?: Set<string>;
  },
): void {
  const portfolio = buildPortfolioCostExposure(input.data, 50);
  const sorted =
    input.mode === "purchased"
      ? [...portfolio].sort((a, b) => b.recipeCount - a.recipeCount)
      : input.mode === "exposure"
        ? [...portfolio].sort(
            (a, b) =>
              b.monthlyModeledExposureEur - a.monthlyModeledExposureEur ||
              b.recipeCount - a.recipeCount,
          )
        : [...portfolio].sort((a, b) => b.monthlyModeledExposureEur - a.monthlyModeledExposureEur);

  const row = sorted.find((entry) => !input.excludeIds?.has(entry.ingredientId));
  if (!row) return;

  rows.push({
    id: `ingredient-fallback-${input.mode}:${input.windowKey}:${row.ingredientId}`,
    name: row.ingredientName,
    value: `${formatCurrency(row.monthlyModeledExposureEur)}/mo`,
    secondary: `${row.recipeCount} recipe${row.recipeCount === 1 ? "" : "s"} · ${formatPercent(Math.round(row.costSharePct))} cost share`,
    ingredientId: row.ingredientId,
    expandable: ingredientExpandable({ ingredientId: row.ingredientId, name: row.ingredientName }, input.data),
    badges: resolveOperationalTrendBadges({
      ingredientId: row.ingredientId,
      monthlyExposureEur: row.monthlyModeledExposureEur,
      costSharePct: row.costSharePct,
      alerts: input.alerts,
    }),
  });
}

export function buildIngredientMovementMetrics(input: {
  windowKey: OperationalWindowKey;
  data: MarginAlertData;
  windows: OperationalWindow[];
  alerts?: MarginAlertItem[];
}): OperationalTrendMetricSection {
  const rows: OperationalTrendMetricRow[] = [];
  const ranked = rankIngredientPriceMovements(input);
  const usedIds = new Set<string>();

  const increases = ranked
    .filter((entry) => entry.pct >= MIN_MEANINGFUL_SUPPLIER_CHANGE_PCT)
    .sort((a, b) => b.pct - a.pct)
    .slice(0, TREND_INGREDIENT_TOP_N);

  const decreases = ranked
    .filter((entry) => entry.pct <= -MIN_MEANINGFUL_SUPPLIER_CHANGE_PCT)
    .sort((a, b) => a.pct - b.pct)
    .slice(0, TREND_INGREDIENT_TOP_N);

  if (increases.length > 0) {
    for (const entry of increases) {
      usedIds.add(entry.ingredientId);
      const priceLine = formatUnitPricePair(entry.previousPrice, entry.currentPrice, entry.unit);
      const exposure = buildPortfolioCostExposure(input.data, 50).find(
        (row) => row.ingredientId === entry.ingredientId,
      );
      rows.push({
        id: `ingredient-increase:${input.windowKey}:${entry.ingredientId}`,
        name: entry.name,
        value: `+${formatPercent(Math.round(entry.pct))}`,
        secondary: priceLine ?? undefined,
        ingredientId: entry.ingredientId,
        expandable: ingredientExpandable(entry, input.data),
        badges: resolveOperationalTrendBadges({
          ingredientId: entry.ingredientId,
          monthlyExposureEur: exposure?.monthlyModeledExposureEur,
          costSharePct: exposure?.costSharePct,
          alerts: input.alerts,
        }),
      });
    }
  } else {
    pushIngredientFallbackRows(rows, {
      windowKey: input.windowKey,
      data: input.data,
      alerts: input.alerts,
      mode: "spend",
      excludeIds: usedIds,
    });
    const fallback = rows[rows.length - 1];
    if (fallback) usedIds.add(fallback.id.split(":").pop() ?? "");
  }

  if (decreases.length > 0) {
    for (const entry of decreases) {
      usedIds.add(entry.ingredientId);
      const priceLine = formatUnitPricePair(entry.previousPrice, entry.currentPrice, entry.unit);
      const exposure = buildPortfolioCostExposure(input.data, 50).find(
        (row) => row.ingredientId === entry.ingredientId,
      );
      rows.push({
        id: `ingredient-decrease:${input.windowKey}:${entry.ingredientId}`,
        name: entry.name,
        value: formatPercent(Math.round(entry.pct)),
        secondary: priceLine ?? undefined,
        ingredientId: entry.ingredientId,
        expandable: ingredientExpandable(entry, input.data),
        badges: resolveOperationalTrendBadges({
          ingredientId: entry.ingredientId,
          monthlyExposureEur: exposure?.monthlyModeledExposureEur,
          costSharePct: exposure?.costSharePct,
          alerts: input.alerts,
        }),
      });
    }
  } else {
    pushIngredientFallbackRows(rows, {
      windowKey: input.windowKey,
      data: input.data,
      alerts: input.alerts,
      mode: increases.length > 0 ? "purchased" : "exposure",
      excludeIds: usedIds,
    });
  }

  while (rows.length < TREND_INGREDIENT_TOP_N * 2) {
    const before = rows.length;
    pushIngredientFallbackRows(rows, {
      windowKey: input.windowKey,
      data: input.data,
      alerts: input.alerts,
      mode: rows.length % 2 === 0 ? "purchased" : "exposure",
      excludeIds: new Set(
        rows.flatMap((row) => {
          const parts = row.id.split(":");
          return parts[parts.length - 1] ? [parts[parts.length - 1]!] : [];
        }),
      ),
    });
    if (rows.length === before) break;
  }

  return {
    title: "Ingredient Movement",
    rows: dedupeTrendMetricRows(rows).slice(0, TREND_INGREDIENT_TOP_N * 2),
  };
}

function recipeMetricExpandable(metric: RecipeMetric): OperationalTrendExpandable {
  const driver = metric.topLine?.ingredientName ?? "Mixed ingredients";
  const margin =
    metric.grossMargin != null
      ? `${formatPercent(Math.round(metric.grossMargin))} margin`
      : "Margin n/a";
  return {
    bullets: [
      `Top cost driver: ${driver}${metric.topLine?.contribution ? ` (${formatPercent(Math.round(metric.topLine.contribution))} of dish)` : ""}`,
      `Food cost: ${formatCurrency(metric.foodCost)} per portion`,
      margin,
    ],
  };
}

function recipeFallbackRow(
  metric: RecipeMetric,
  input: { windowKey: OperationalWindowKey; suffix: string },
): OperationalTrendMetricRow {
  const marginPct =
    metric.grossMargin != null
      ? formatPercent(Math.round(metric.grossMargin))
      : formatCurrency(metric.foodCost);
  return {
    id: `recipe-fallback-${input.suffix}:${input.windowKey}:${metric.recipe.id}`,
    name: metric.recipe.name?.trim() || "Recipe",
    value: marginPct,
    secondary: [
      metric.topLine
        ? `largest: ${metric.topLine.ingredientName} (${formatPercent(Math.round(metric.topLine.contribution))})`
        : null,
      `food cost ${formatCurrency(metric.foodCost)}`,
    ]
      .filter((part): part is string => Boolean(part))
      .join(" · "),
    recipeId: metric.recipe.id,
    expandable: recipeMetricExpandable(metric),
    badges: resolveOperationalTrendBadges({
      ingredientId: metric.topLine?.ingredientId,
      costSharePct: metric.topLine?.contribution,
      monthlyExposureEur: estimateConcentrationMonthlyEur(metric),
    }),
  };
}

export function buildRecipeMarginMovementMetrics(input: {
  windowKey: OperationalWindowKey;
  groups: OperationalSynthesisGroups;
  data: MarginAlertData;
}): OperationalTrendMetricSection {
  const rows: OperationalTrendMetricRow[] = [];
  const menuMetrics = getRecipeMetrics(input.data.recipes).filter((m) => m.recipe.type !== "prep");
  const winners = input.groups.recipeMarginMovements.improving
    .filter((entry) => entry.window === input.windowKey)
    .slice(0, 2);
  const losers = input.groups.recipeMarginMovements.worsening
    .filter((entry) => entry.window === input.windowKey)
    .slice(0, 2);

  if (winners.length > 0) {
    for (const entry of winners) {
      const marginValue =
        entry.marginFromPct != null && entry.marginToPct != null
          ? `${Math.round(entry.marginFromPct)}% → ${Math.round(entry.marginToPct)}%`
          : entry.headline;
      const ppLine =
        entry.marginFromPct != null && entry.marginToPct != null
          ? formatMarginPpDelta(entry.marginFromPct, entry.marginToPct)
          : null;
      const metric = menuMetrics.find((m) => m.recipe.name === entry.recipeName);
      const secondaryParts = [
        ppLine,
        entry.estimatedMonthlyImpactEur > 0
          ? `~${formatCurrency(entry.estimatedMonthlyImpactEur)}/mo`
          : entry.marginFromPct == null
            ? "Margin improved (no historical snapshot)"
            : null,
      ].filter((part): part is string => Boolean(part));
      rows.push({
        id: `recipe-winner:${input.windowKey}:${entry.recipeName}`,
        name: entry.recipeName,
        value: marginValue,
        secondary: secondaryParts.length > 0 ? secondaryParts.join(" · ") : undefined,
        recipeId: metric?.recipe.id,
        expandable: metric ? recipeMetricExpandable(metric) : undefined,
      });
    }
  } else {
    const best = [...menuMetrics]
      .filter((m) => m.grossMargin != null)
      .sort((a, b) => (b.grossMargin ?? 0) - (a.grossMargin ?? 0))[0];
    if (best) rows.push(recipeFallbackRow(best, { windowKey: input.windowKey, suffix: "high-margin" }));
  }

  if (losers.length > 0) {
    for (const entry of losers) {
      const marginValue =
        entry.marginFromPct != null && entry.marginToPct != null
          ? `${Math.round(entry.marginFromPct)}% → ${Math.round(entry.marginToPct)}%`
          : entry.headline;
      const ppLine =
        entry.marginFromPct != null && entry.marginToPct != null
          ? formatMarginPpDelta(entry.marginFromPct, entry.marginToPct)
          : null;
      const metric = menuMetrics.find((m) => m.recipe.name === entry.recipeName);
      const secondaryParts = [
        ppLine,
        entry.estimatedMonthlyImpactEur > 0
          ? `~${formatCurrency(entry.estimatedMonthlyImpactEur)}/mo`
          : entry.marginFromPct == null
            ? "Alert-only estimate (no margin snapshot)"
            : null,
      ].filter((part): part is string => Boolean(part));
      rows.push({
        id: `recipe-loser:${input.windowKey}:${entry.recipeName}`,
        name: entry.recipeName,
        value: marginValue,
        secondary: secondaryParts.length > 0 ? secondaryParts.join(" · ") : undefined,
        recipeId: metric?.recipe.id,
        expandable: metric ? recipeMetricExpandable(metric) : undefined,
      });
    }
  } else {
    const worst = [...menuMetrics]
      .filter((m) => m.grossMargin != null)
      .sort((a, b) => (a.grossMargin ?? 0) - (b.grossMargin ?? 0))[0];
    if (worst) rows.push(recipeFallbackRow(worst, { windowKey: input.windowKey, suffix: "low-margin" }));
  }

  if (rows.length < 2) {
    const best = [...menuMetrics]
      .filter((m) => m.grossMargin != null)
      .sort((a, b) => (b.grossMargin ?? 0) - (a.grossMargin ?? 0))[0];
    const worst = [...menuMetrics]
      .filter((m) => m.grossMargin != null)
      .sort((a, b) => (a.grossMargin ?? 0) - (b.grossMargin ?? 0))[0];
    if (best && !rows.some((row) => row.name === best.recipe.name)) {
      rows.push(recipeFallbackRow(best, { windowKey: input.windowKey, suffix: "high-margin" }));
    }
    if (worst && !rows.some((row) => row.name === worst.recipe.name)) {
      rows.push(recipeFallbackRow(worst, { windowKey: input.windowKey, suffix: "low-margin" }));
    }
  }

  if (rows.length < 2) {
    const concentrated = [...menuMetrics].sort(
      (a, b) => (b.topLine?.contribution ?? 0) - (a.topLine?.contribution ?? 0),
    )[0];
    if (concentrated) {
      if (!rows.some((row) => row.id.includes("concentration"))) {
        rows.push(
          recipeFallbackRow(concentrated, {
            windowKey: input.windowKey,
            suffix: "concentration",
          }),
        );
      }
    }
  }

  if (rows.length < 2 && menuMetrics[0]) {
    const metric = menuMetrics[0];
    rows.push({
      id: `recipe-fallback-food-cost:${input.windowKey}:${metric.recipe.id}`,
      name: metric.recipe.name?.trim() || "Recipe",
      value: formatCurrency(metric.foodCost),
      secondary: [
        metric.grossMargin != null
          ? `${formatPercent(Math.round(metric.grossMargin))} margin`
          : null,
        metric.topLine ? `driver: ${metric.topLine.ingredientName}` : null,
      ]
        .filter((part): part is string => Boolean(part))
        .join(" · "),
      recipeId: metric.recipe.id,
      expandable: recipeMetricExpandable(metric),
    });
  }

  return { title: "Recipe Margin Movement", rows: dedupeTrendMetricRows(rows).slice(0, 4) };
}

function pickRecipeConcentrationFallback(data: MarginAlertData): {
  recipeId: string;
  recipeName: string;
  dependencyName: string;
  lineCost: number;
  contributionPct: number;
  foodCost: number;
} | null {
  let best: {
    recipeId: string;
    recipeName: string;
    dependencyName: string;
    lineCost: number;
    contributionPct: number;
    foodCost: number;
  } | null = null;

  for (const recipe of data.recipes) {
    if (recipe.type === "prep") continue;
    const lines: { name: string; lineCost: number }[] = [];
    for (const line of recipe.recipe_ingredients ?? []) {
      if (!line.ingredients) continue;
      const qty = Number(line.quantity ?? 0);
      const unitCost = Number(line.ingredients.current_price ?? 0);
      if (qty <= 0 || unitCost <= 0) continue;
      lines.push({
        name: line.ingredients.name?.trim() || "Ingredient",
        lineCost: qty * unitCost,
      });
    }
    const foodCost = lines.reduce((sum, entry) => sum + entry.lineCost, 0);
    if (foodCost <= 0) continue;
    const topLine = [...lines].sort((a, b) => b.lineCost - a.lineCost)[0];
    if (!topLine) continue;
    const contributionPct = (topLine.lineCost / foodCost) * 100;
    if (!best || topLine.lineCost > best.lineCost) {
      best = {
        recipeId: recipe.id,
        recipeName: recipe.name?.trim() || "Recipe",
        dependencyName: topLine.name,
        lineCost: topLine.lineCost,
        contributionPct,
        foodCost,
      };
    }
  }

  return best;
}

export function buildExposureConcentrationMetrics(input: {
  windowKey: OperationalWindowKey;
  data: MarginAlertData;
  windows: OperationalWindow[];
  alerts?: MarginAlertItem[];
}): OperationalTrendMetricSection {
  const rows: OperationalTrendMetricRow[] = [];
  const portfolioExposure = buildPortfolioCostExposure(input.data, 50);

  const topIngredientExposure =
    buildTopOperationalExposures(input.data, 1)[0] ?? portfolioExposure[0];
  if (topIngredientExposure) {
    const largestRecipeName = largestRecipeForIngredient(input.data, topIngredientExposure.ingredientId);
    const exposure = buildExposureDetailFromRow(topIngredientExposure, largestRecipeName, input.data);
    rows.push({
      id: `exposure-ingredient:${input.windowKey}:${topIngredientExposure.ingredientId}`,
      name: topIngredientExposure.ingredientName,
      value: `${formatCurrency(exposure.monthlyExposureEur)}/mo`,
      secondary: `${exposure.recipesAffected} recipe${exposure.recipesAffected === 1 ? "" : "s"} · largest: ${exposure.largestRecipeName} · 10% → +${formatCurrency(exposure.tenPercentImpactEur)}/mo · ${exposure.riskLevel}`,
      exposure,
      ingredientId: topIngredientExposure.ingredientId,
      expandable: ingredientExpandable(
        {
          ingredientId: topIngredientExposure.ingredientId,
          name: topIngredientExposure.ingredientName,
        },
        input.data,
      ),
      badges: resolveOperationalTrendBadges({
        ingredientId: topIngredientExposure.ingredientId,
        monthlyExposureEur: topIngredientExposure.monthlyModeledExposureEur,
        costSharePct: topIngredientExposure.costSharePct,
        alerts: input.alerts,
      }),
    });
  } else if (portfolioExposure[0]) {
    const row = portfolioExposure[0];
    const exposure = buildExposureDetailFromRow(
      row,
      largestRecipeForIngredient(input.data, row.ingredientId),
      input.data,
    );
    rows.push({
      id: `exposure-ingredient-fallback:${input.windowKey}:${row.ingredientId}`,
      name: row.ingredientName,
      value: `${formatCurrency(exposure.monthlyExposureEur)}/mo`,
      exposure,
      ingredientId: row.ingredientId,
      secondary: `${exposure.recipesAffected} recipes · ${exposure.riskLevel} risk`,
      expandable: ingredientExpandable({ ingredientId: row.ingredientId, name: row.ingredientName }, input.data),
    });
  }

  const aggregates = aggregateSuppliersInWindow(input);
  const totalSpend = aggregates.reduce((sum, entry) => sum + entry.spendEur, 0);
  const topSupplierSpend = aggregates
    .filter((entry) => entry.spendEur > 0 || entry.invoiceCount > 0)
    .sort((a, b) => b.spendEur - a.spendEur)[0];
  if (topSupplierSpend) {
    const historyInWindow = input.data.priceHistory.filter((row) =>
      isInOperationalWindow(row.created_at, input.windowKey, input.windows),
    );
    const supplierIngredientIds = new Set(
      historyInWindow
        .filter((row) => row.supplier_name?.trim() === topSupplierSpend.supplierName)
        .map((row) => row.ingredient_id),
    );
    const linkedExposure = portfolioExposure
      .filter((row) => supplierIngredientIds.has(row.ingredientId))
      .sort((a, b) => b.monthlyModeledExposureEur - a.monthlyModeledExposureEur)[0];

    const impactEur = linkedExposure
      ? estimateTenPercentSensitivityEur(linkedExposure.totalLineCost, linkedExposure.recipeCount)
      : 0;
    rows.push({
      id: `exposure-supplier:${input.windowKey}:${topSupplierSpend.supplierName}`,
      name: topSupplierSpend.supplierName,
      value: linkedExposure
        ? `${formatCurrency(linkedExposure.monthlyModeledExposureEur)}/mo`
        : formatCurrency(topSupplierSpend.spendEur),
      secondary: supplierMemoryForAggregate(topSupplierSpend, input.data),
      supplierName: topSupplierSpend.supplierName,
      expandable: supplierExpandable(topSupplierSpend, input.data),
      badges: resolveOperationalTrendBadges({
        supplierName: topSupplierSpend.supplierName,
        monthlyExposureEur: linkedExposure?.monthlyModeledExposureEur,
        supplierSpendSharePct:
          totalSpend > 0 ? (topSupplierSpend.spendEur / totalSpend) * 100 : undefined,
        alerts: input.alerts,
      }),
      exposure: linkedExposure
        ? buildExposureDetailFromRow(
            linkedExposure,
            largestRecipeForIngredient(input.data, linkedExposure.ingredientId),
            input.data,
          )
        : undefined,
      ingredientId: linkedExposure?.ingredientId,
    });
    if (linkedExposure && impactEur > 0) {
      const last = rows[rows.length - 1];
      if (last) {
        last.secondary = [
          last.secondary,
          `10% increase → +${formatCurrency(impactEur)}/mo`,
          mapExposureRiskLevel({
            monthlyExposureEur: linkedExposure.monthlyModeledExposureEur,
            costSharePct: linkedExposure.costSharePct,
          }),
        ]
          .filter(Boolean)
          .join(" · ");
      }
    }
  }

  const menuMetrics = getRecipeMetrics(input.data.recipes).filter((m) => m.recipe.type !== "prep");
  const topRecipe = menuMetrics
    .filter((metric) => metric.foodCost > 0)
    .sort((a, b) => {
      const aShare = a.topLine?.contribution ?? 0;
      const bShare = b.topLine?.contribution ?? 0;
      return bShare - aShare || b.foodCost - a.foodCost;
    })[0];
  const recipeFallback = topRecipe ? null : pickRecipeConcentrationFallback(input.data);

  if (topRecipe) {
    const lineCost = topRecipe.topLine?.lineCost ?? topRecipe.foodCost;
    const dependencyName = topRecipe.topLine?.ingredientName ?? "Mixed ingredients";
    const contributionPct = topRecipe.topLine?.contribution ?? 0;
    const monthlyEur = estimateConcentrationMonthlyEur(topRecipe);
    const impactEur = estimateTenPercentSensitivityEur(lineCost, 1);
    rows.push({
      id: `exposure-recipe:${input.windowKey}:${topRecipe.recipe.id}`,
      name: topRecipe.recipe.name?.trim() || "Recipe",
      value:
        monthlyEur > 0
          ? `${formatCurrency(monthlyEur)}/mo`
          : contributionPct > 0
            ? formatPercent(Math.round(contributionPct))
            : formatCurrency(lineCost),
      secondary: [
        "1 recipe",
        `largest: ${dependencyName}`,
        impactEur > 0 ? `10% → +${formatCurrency(impactEur)}/mo` : null,
        mapExposureRiskLevel({ monthlyExposureEur: monthlyEur, costSharePct: contributionPct }),
      ]
        .filter((part): part is string => Boolean(part))
        .join(" · "),
      recipeId: topRecipe.recipe.id,
      expandable: recipeMetricExpandable(topRecipe),
      badges: resolveOperationalTrendBadges({
        ingredientId: topRecipe.topLine?.ingredientId,
        costSharePct: contributionPct,
        monthlyExposureEur: monthlyEur,
        alerts: input.alerts,
      }),
    });
  } else if (recipeFallback) {
    const monthlyEur = Math.round(recipeFallback.lineCost * 0.05 * ESTIMATED_COVERS_PER_MENU_RECIPE);
    const impactEur = estimateTenPercentSensitivityEur(recipeFallback.lineCost, 1);
    rows.push({
      id: `exposure-recipe-fallback:${input.windowKey}:${recipeFallback.recipeId}`,
      name: recipeFallback.recipeName,
      value: monthlyEur > 0 ? `${formatCurrency(monthlyEur)}/mo` : formatCurrency(recipeFallback.lineCost),
      recipeId: recipeFallback.recipeId,
      secondary: [
        "1 recipe",
        `largest: ${recipeFallback.dependencyName}`,
        impactEur > 0 ? `10% → +${formatCurrency(impactEur)}/mo` : null,
        mapExposureRiskLevel({
          monthlyExposureEur: monthlyEur,
          costSharePct: recipeFallback.contributionPct,
        }),
      ]
        .filter((part): part is string => Boolean(part))
        .join(" · "),
    });
  }

  if (rows.length < 3) {
    const portfolio = portfolioExposure.slice(0, 6);
    for (const row of portfolio) {
      if (rows.length >= 3) break;
      if (rows.some((existing) => existing.id.includes(row.ingredientId))) continue;
      const largestRecipeName = largestRecipeForIngredient(input.data, row.ingredientId);
      const exposure = buildExposureDetailFromRow(row, largestRecipeName, input.data);
      rows.push({
        id: `exposure-portfolio-fallback:${input.windowKey}:${row.ingredientId}`,
        name: row.ingredientName,
        value: `${formatCurrency(exposure.monthlyExposureEur)}/mo`,
        exposure,
        ingredientId: row.ingredientId,
        secondary: `${exposure.recipesAffected} recipes · ${exposure.riskLevel}`,
        expandable: ingredientExpandable(
          { ingredientId: row.ingredientId, name: row.ingredientName },
          input.data,
        ),
        badges: resolveOperationalTrendBadges({
          ingredientId: row.ingredientId,
          monthlyExposureEur: row.monthlyModeledExposureEur,
          costSharePct: row.costSharePct,
          alerts: input.alerts,
        }),
      });
    }
    const menuMetrics = getRecipeMetrics(input.data.recipes).filter((m) => m.recipe.type !== "prep");
    const extraRecipe = menuMetrics.sort(
      (a, b) => (b.topLine?.contribution ?? 0) - (a.topLine?.contribution ?? 0),
    )[0];
    if (rows.length < 3 && extraRecipe) {
      const recipeName = extraRecipe.recipe.name?.trim() || "Recipe";
      if (!rows.some((row) => row.name === recipeName)) {
        const monthlyEur = estimateConcentrationMonthlyEur(extraRecipe);
        rows.push({
          id: `exposure-recipe-pad:${input.windowKey}:${extraRecipe.recipe.id}`,
          name: recipeName,
          value: monthlyEur > 0 ? `${formatCurrency(monthlyEur)}/mo` : formatCurrency(extraRecipe.foodCost),
          recipeId: extraRecipe.recipe.id,
          secondary: `1 recipe · ${extraRecipe.topLine?.ingredientName ?? "Mixed"}`,
          expandable: recipeMetricExpandable(extraRecipe),
        });
      }
    }
  }

  return { title: "Exposure & Concentration", rows: dedupeTrendMetricRows(rows).slice(0, 3) };
}

export function buildOperationalTrendsWindowMetrics(input: {
  windowKey: OperationalWindowKey;
  data: MarginAlertData;
  windows: OperationalWindow[];
  groups: OperationalSynthesisGroups;
  alerts?: MarginAlertItem[];
}): OperationalTrendsWindowMetrics {
  return {
    supplierMovement: buildSupplierMovementMetrics({
      windowKey: input.windowKey,
      data: input.data,
      windows: input.windows,
      alerts: input.alerts,
    }),
    ingredientMovement: buildIngredientMovementMetrics({
      windowKey: input.windowKey,
      data: input.data,
      windows: input.windows,
      alerts: input.alerts,
    }),
    recipeMarginMovement: buildRecipeMarginMovementMetrics({
      windowKey: input.windowKey,
      groups: input.groups,
      data: input.data,
    }),
    exposureConcentration: buildExposureConcentrationMetrics({
      windowKey: input.windowKey,
      data: input.data,
      windows: input.windows,
      alerts: input.alerts,
    }),
  };
}

export function parseRecipeMarginRangeFromAlert(
  alert: MarginAlertItem,
): { marginFromPct: number; marginToPct: number } | null {
  const marginMeta = alert.meta.find((meta) => meta.label === "Margin")?.value;
  const metaMatch = marginMeta?.match(/([\d.]+)%\s*(?:→|->)\s*([\d.]+)%/);
  if (metaMatch?.[1] && metaMatch[2]) {
    const marginFromPct = Number(metaMatch[1]);
    const marginToPct = Number(metaMatch[2]);
    if (Number.isFinite(marginFromPct) && Number.isFinite(marginToPct)) {
      return { marginFromPct, marginToPct };
    }
  }

  const match =
    alert.context.match(/fell from about ([\d.]+)% to ([\d.]+)%/i) ??
    alert.context.match(/from ([\d.]+)% to ([\d.]+)%/i);
  if (!match?.[1] || !match[2]) return null;
  const marginFromPct = Number(match[1]);
  const marginToPct = Number(match[2]);
  if (!Number.isFinite(marginFromPct) || !Number.isFinite(marginToPct)) return null;
  return { marginFromPct, marginToPct };
}

function buildOperationalTrendPanel(input: {
  label: string;
  windowKey: OperationalWindowKey;
  groups: OperationalSynthesisGroups;
  data: MarginAlertData;
  windows: OperationalWindow[];
  alerts?: MarginAlertItem[];
}): OperationalTrendPanel {
  return {
    label: input.label,
    windowKey: input.windowKey,
    metrics: buildOperationalTrendsWindowMetrics({
      windowKey: input.windowKey,
      data: input.data,
      windows: input.windows,
      groups: input.groups,
      alerts: input.alerts,
    }),
  };
}

/** Side-by-side trend panels for 90-day and 6-month windows — structured metric rows only. */
export function buildOperationalTrendsPanels(input: {
  operationalSynthesisGroups: OperationalSynthesisGroups;
  data: MarginAlertData;
  operationalWindows: OperationalWindow[];
  alerts?: MarginAlertItem[];
}): OperationalTrendsPanels {
  const base = {
    groups: input.operationalSynthesisGroups,
    data: input.data,
    windows: input.operationalWindows,
    alerts: input.alerts,
  };

  return {
    last90Days: buildOperationalTrendPanel({
      ...base,
      label: "Last 90 days",
      windowKey: "last_3_months",
    }),
    last6Months: buildOperationalTrendPanel({
      ...base,
      label: "Last 6 months",
      windowKey: "last_6_months",
    }),
  };
}

function parseAffectedScopeFromDetail(detail: string): string | null {
  const recipesMatch = detail.match(/·\s*(.+)$/);
  if (recipesMatch?.[1]) return recipesMatch[1].trim();
  return detail.length > 12 ? detail : null;
}

function recoveryCardToActionQueue(card: GroupedRecoveryOpportunity): OperationalActionQueueCard {
  return {
    id: card.id,
    decisionTier: card.decisionTier,
    priority: card.priority,
    category: "operational_exposure",
    categoryLabel: card.causeLabel,
    title: card.title,
    affectedScope:
      card.affectedRecipes.length > 0
        ? card.affectedRecipes.join(", ")
        : card.why.split(".")[0]?.trim() ?? null,
    whyItMatters: card.operatorInsightLine,
    whatToDo: card.operatorActions[0] ?? card.suggestedActions[0] ?? card.why,
    ifIgnored: card.consequence ?? null,
    estimatedImpact: card.savingsLine,
    target: card.target,
    actionLabel: card.actionLabel,
  };
}

function insightToActionQueue(
  insight: PrioritizedOperationalInsight,
  concentrationByStory: Map<string, GroupedConcentrationInsight>,
): OperationalActionQueueCard {
  const grouped = insight.storyKey ? concentrationByStory.get(insight.storyKey) : undefined;
  const affectedScope = grouped
    ? grouped.affectedRecipes.length <= 3
      ? grouped.affectedRecipes.join(", ")
      : `${grouped.affectedRecipes.slice(0, 2).join(", ")} +${grouped.affectedRecipes.length - 2} more`
    : parseAffectedScopeFromDetail(insight.detail);

  return {
    id: insight.id,
    decisionTier: insight.decisionTier,
    priority: insight.priority,
    category: insight.category,
    categoryLabel: insight.categoryLabel,
    title: isGenericOperationalTitle(insight.title)
      ? grouped?.title ?? insight.categoryLabel
      : insight.title,
    affectedScope,
    whyItMatters: insight.operatorInsightLine,
    whatToDo: insight.operatorAction,
    ifIgnored: insight.consequence ?? null,
    estimatedImpact: insight.impactLine,
    target: insight.target,
    actionLabel: insight.actionLabel,
  };
}

/** Merges act-now and monitor insights with recovery levers — grouped by operational story. */
export function buildOperationalActionQueue(input: {
  nowInsights: PrioritizedOperationalInsight[];
  monitorInsights: PrioritizedOperationalInsight[];
  groupedRecovery: GroupedRecoveryOpportunity[];
  concentrationGroups: GroupedConcentrationInsight[];
  limit?: number;
}): OperationalActionQueueCard[] {
  const limit = input.limit ?? 8;
  const concentrationByStory = new Map(
    input.concentrationGroups.map((group) => [group.storyKey, group]),
  );
  const insightStoryKeys = new Set(
    [...input.nowInsights, ...input.monitorInsights]
      .map((insight) => insight.storyKey)
      .filter((key): key is string => key != null),
  );

  type StoryBucket = {
    storyKey: string;
    insight?: PrioritizedOperationalInsight;
    recovery?: GroupedRecoveryOpportunity;
  };

  const buckets = new Map<string, StoryBucket>();

  const upsertInsight = (insight: PrioritizedOperationalInsight) => {
    const storyKey = insight.storyKey ?? insight.id;
    const current = buckets.get(storyKey) ?? { storyKey };
    if (
      !current.insight ||
      priorityRank(insight.priority) < priorityRank(current.insight.priority) ||
      decisionTierRank(insight.decisionTier) < decisionTierRank(current.insight.decisionTier)
    ) {
      current.insight = insight;
    }
    buckets.set(storyKey, current);
  };

  for (const insight of [...input.nowInsights, ...input.monitorInsights]) {
    upsertInsight(insight);
  }

  for (const recovery of input.groupedRecovery) {
    if (recovery.decisionTier !== "now" && recovery.decisionTier !== "monitor") continue;
    if (insightStoryKeys.has(recovery.storyKey) && recovery.decisionTier !== "now") continue;
    const current = buckets.get(recovery.storyKey) ?? { storyKey: recovery.storyKey };
    if (
      !current.recovery ||
      priorityRank(recovery.priority) < priorityRank(current.recovery.priority)
    ) {
      current.recovery = recovery;
    }
    buckets.set(recovery.storyKey, current);
  }

  const cards = [...buckets.values()].map((bucket) => {
    if (bucket.insight) {
      return insightToActionQueue(bucket.insight, concentrationByStory);
    }
    return recoveryCardToActionQueue(bucket.recovery!);
  });

  return cards
    .sort(
      (a, b) =>
        decisionTierRank(a.decisionTier) - decisionTierRank(b.decisionTier) ||
        priorityRank(a.priority) - priorityRank(b.priority),
    )
    .slice(0, limit);
}

export function buildSynthesisViewModel(input: {
  data: MarginAlertData;
  alerts: MarginAlertItem[];
  health?: OperationalHealthPanel;
  dateRange?: string;
}) {
  const windows = buildOperationalWindows();
  const selectedWindowKey = mapDateRangeToWindowKey(input.dateRange);
  const fullExposure = buildPortfolioCostExposure(input.data, 50);
  const categorySlices = buildCostCategorySlices(fullExposure, { homepageOnly: true });
  const categoryPressure = enrichCategoryPressureRows(
    buildCategoryPressureRows(input.data, fullExposure),
    categorySlices,
  );
  const marginRisks = buildTodaysMarginRisks(input.data, input.alerts, categorySlices, 6);
  const concentrationGroups = buildGroupedConcentrationInsights(input.data, input.alerts, 4);

  const monthlyMarginPressure = buildMonthlyMarginPressureSummary({
    data: input.data,
    alerts: input.alerts,
    categorySlices,
    categoryPressure,
    marginRisks,
    health: input.health,
  });

  const prioritizedInsights = buildPrioritizedOperationalInsights({
    data: input.data,
    alerts: input.alerts,
    categorySlices,
    concentrationGroups,
    marginRisks,
    limit: 8,
  });

  const insightStoryKeys = prioritizedInsights
    .map((i) => i.storyKey)
    .filter((key): key is string => key != null);

  const recoveryOpportunityTitles = [
    ...prioritizedInsights.map((i) => i.title),
    ...marginRisks.map((c) => c.event),
  ];

  const groupedRecovery = buildGroupedRecoveryOpportunities(
    input.data,
    input.alerts,
    recoveryOpportunityTitles,
    5,
    insightStoryKeys,
  );

  const curatedExposures = buildCuratedOperationalExposures(input.data, 5);
  const supplierSwitchImpacts = buildSupplierSwitchImpactGroups(input.data, windows);
  const supplierMovements = buildSupplierMovementGroups(
    input.data,
    windows,
    suppliersWithExpensiveSwitches(supplierSwitchImpacts.badSwitches),
  );
  const recipeMarginMovements = buildRecipeMarginMovementGroups(
    input.data,
    input.alerts,
    windows,
  );
  const stableOperationalAreas = buildStableOperationalAreas(
    categoryPressure,
    curatedExposures,
    windows,
  );
  const operationalSynthesisGroups: OperationalSynthesisGroups = {
    supplierMovements,
    supplierSwitchImpacts,
    recipeMarginMovements,
    recoverySignals: groupedRecovery,
    stableOperationalAreas,
  };
  const hero = buildHeroNarrative({
    prioritizedInsights,
    groupedRecovery,
    monthlyMarginPressure,
  });
  const calmSignals = buildCalmOperationalSignal({
    categoryPressure,
    prioritizedInsights,
    monthlyMarginPressure,
  });
  const tierOneInsights = prioritizedInsights.filter((insight) => insight.tier === "tier_1").slice(0, 1);
  const tierTwoInsights = prioritizedInsights.filter((insight) => insight.tier === "tier_2");
  const tierThreeInsights = prioritizedInsights.filter((insight) => insight.tier === "tier_3");
  const nowInsights = prioritizedInsights.filter((insight) => insight.decisionTier === "now");
  const monitorInsights = prioritizedInsights.filter((insight) => insight.decisionTier === "monitor");
  const backgroundInsights = prioritizedInsights.filter(
    (insight) => insight.decisionTier === "background",
  );

  const snapshot = buildOperationalSnapshotViewModel({
    hero,
    monthlyMarginPressure,
    prioritizedInsights,
    concentrationGroups,
    operationalSynthesisGroups,
    alerts: input.alerts,
    curatedExposures,
  });

  const actionQueue = buildOperationalActionQueue({
    nowInsights,
    monitorInsights,
    groupedRecovery,
    concentrationGroups,
  });

  const trendsPanels = buildOperationalTrendsPanels({
    operationalSynthesisGroups,
    data: input.data,
    operationalWindows: windows,
    alerts: input.alerts,
  });

  const ownerReview = buildOwnerReviewViewModel({
    data: input.data,
    alerts: input.alerts,
    monthlyMarginPressure,
    prioritizedInsights,
    concentrationGroups,
    operationalSynthesisGroups,
    monitorInsights,
    operationalWindows: windows,
    selectedWindowKey,
  });

  return {
    categorySlices,
    categoryPressure,
    monthlyMarginPressure,
    concentrationGroups,
    prioritizedInsights,
    groupedRecovery,
    operationalWindows: windows,
    operationalSynthesisGroups,
    hero,
    calmSignals,
    snapshot,
    actionQueue,
    trendsPanels,
    tierOneInsights,
    tierTwoInsights,
    tierThreeInsights,
    nowInsights,
    monitorInsights,
    backgroundInsights,
    marginRisks,
    curatedExposures,
    excludeRecommendedTitles: [
      ...prioritizedInsights.map((i) => i.title),
      ...groupedRecovery.map((o) => o.title),
      ...marginRisks.map((c) => c.event),
    ],
    ownerReview,
  };
}

const BEVERAGE_NAME_RE = /\b(beverage|bebida|drink|beer|cerveja|wine|vinho|soda|cola|water|água|agua|juice|sumo)\b/i;
const SAUCE_NAME_RE = /\b(sauce|molho|ketchup|mayo|maionese|mustard|mostarda)\b/i;
const BAKERY_NAME_RE = /\b(bread|pão|pao|brioche|bun|bolo|bakery)\b/i;

function inferProcurementCategoryHint(name: string): string | null {
  if (isBeefIngredientName(name)) return "beef";
  if (BEVERAGE_NAME_RE.test(name)) return "beverage";
  if (SAUCE_NAME_RE.test(name)) return "sauce";
  if (BAKERY_NAME_RE.test(name)) return "bakery";
  if (/\b(cheese|queijo)\b/i.test(name)) return "dairy";
  if (/\b(chicken|frango|pork|porco|lamb|borrego)\b/i.test(name)) return "protein";
  return null;
}

function dominantWindowFromHits(
  hits: Record<OperationalWindowKey, number>,
  windows: OperationalWindow[],
): { key: OperationalWindowKey; label: string } {
  const topKey = (Object.entries(hits).sort((a, b) => b[1] - a[1])[0]?.[0] ??
    "last_3_months") as OperationalWindowKey;
  const label = windows.find((w) => w.key === topKey)?.label ?? "Recent period";
  return { key: topKey, label };
}

function windowPhraseForNarrative(label: string): string {
  if (label === "Last 30 days") return "the last 30 days";
  if (label === "Last 3 months") return "3 months";
  if (label === "Last 6 months") return "6 months";
  return label.toLowerCase();
}

function stdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function computeSupplierTemporalTrend(
  rows: MarginAlertData["priceHistory"],
  supplier: string,
  windows: OperationalWindow[],
): { trend: SupplierMovementInsight["temporalTrend"]; recentAvg: number | null; priorAvg: number | null } {
  const supplierRows = rows.filter((r) => r.supplier_name?.trim() === supplier);
  const recentWindow = windows.find((w) => w.key === "last_30_days");
  const priorWindow = windows.find((w) => w.key === "last_3_months");
  if (!recentWindow || !priorWindow) {
    return { trend: null, recentAvg: null, priorAvg: null };
  }

  const recentStart = new Date(recentWindow.startsAtIso).getTime();
  const priorStart = new Date(priorWindow.startsAtIso).getTime();

  const recent: number[] = [];
  const prior: number[] = [];

  for (const row of supplierRows) {
    const pct =
      row.delta_percent ??
      ((row.new_price ?? 0) > 0 && (row.previous_price ?? 0) > 0
        ? (((row.new_price ?? 0) - (row.previous_price ?? 0)) / (row.previous_price ?? 1)) * 100
        : 0);
    const ms = new Date(row.created_at).getTime();
    if (!Number.isFinite(ms)) continue;
    if (ms >= recentStart) recent.push(pct);
    else if (ms >= priorStart && ms < recentStart) prior.push(pct);
  }

  if (recent.length === 0 && prior.length === 0) {
    return { trend: null, recentAvg: null, priorAvg: null };
  }

  const recentAvg =
    recent.length > 0 ? recent.reduce((s, v) => s + v, 0) / recent.length : null;
  const priorAvg = prior.length > 0 ? prior.reduce((s, v) => s + v, 0) / prior.length : null;

  if (recentAvg == null || priorAvg == null) {
    return { trend: "flat", recentAvg, priorAvg };
  }

  const spread = recentAvg - priorAvg;
  if (Math.abs(spread) < MIN_TEMPORAL_WINDOW_SPREAD_PCT) {
    return { trend: "flat", recentAvg, priorAvg };
  }
  return { trend: spread > 0 ? "accelerating" : "easing", recentAvg, priorAvg };
}

export function classifySupplierMovementSignal(input: {
  averageChangePct: number;
  changeEvents: number;
  changes: number[];
  temporalTrend: SupplierMovementInsight["temporalTrend"];
  expensiveSwitchOnSupplier?: boolean;
}): SupplierMovementSignal {
  const absAvg = Math.abs(input.averageChangePct);

  if (absAvg < MIN_MEANINGFUL_SUPPLIER_CHANGE_PCT && input.changeEvents >= 2) {
    if (input.temporalTrend === "easing" && stdDev(input.changes) >= 4) {
      return "stabilizing_after_volatility";
    }
    if (stdDev(input.changes) <= 1.5) {
      return "improving_consistency";
    }
    return "stable_pricing";
  }

  if (input.expensiveSwitchOnSupplier) {
    return "more_expensive_than_alternatives";
  }

  if (
    input.averageChangePct >= MIN_MEANINGFUL_SUPPLIER_CHANGE_PCT &&
    (input.temporalTrend === "accelerating" || input.changeEvents >= 2)
  ) {
    return "sustained_increase";
  }

  if (input.temporalTrend === "easing" && absAvg >= MIN_MEANINGFUL_SUPPLIER_CHANGE_PCT) {
    return "stabilizing_after_volatility";
  }

  return input.averageChangePct >= MIN_MEANINGFUL_SUPPLIER_CHANGE_PCT
    ? "sustained_increase"
    : "stable_pricing";
}

export function buildSupplierMovementNarrative(input: {
  supplierName: string;
  averageChangePct: number;
  changeEvents: number;
  signal: SupplierMovementSignal;
  dominantWindowLabel: string;
  categoryHint: string | null;
  temporalTrend: SupplierMovementInsight["temporalTrend"];
}): string {
  const categoryPrefix = input.categoryHint ? `${input.categoryHint} ` : "";
  const windowText = windowPhraseForNarrative(input.dominantWindowLabel);
  const pctLabel = formatPercent(Math.round(Math.abs(input.averageChangePct)));

  switch (input.signal) {
    case "stable_pricing":
      return input.changeEvents >= 2
        ? `${input.supplierName} ${categoryPrefix}pricing remained stable across ${input.changeEvents} invoices.`
        : `${input.supplierName} ${categoryPrefix}pricing held steady over ${windowText}.`;
    case "improving_consistency":
      return `${input.supplierName} ${categoryPrefix}invoices are settling into a tighter price band (${windowText}).`;
    case "stabilizing_after_volatility":
      return `${input.supplierName} ${categoryPrefix}pricing is stabilizing after earlier invoice swings (${windowText}).`;
    case "more_expensive_than_alternatives":
      return `Current ${categoryPrefix || ""}sourcing at ${input.supplierName} runs above the previous supplier by ${pctLabel}.`.replace(
        /\s+/g,
        " ",
      );
    case "sustained_increase":
    default:
      if (input.temporalTrend === "accelerating") {
        return `${input.supplierName} ${categoryPrefix}pricing increased ${pctLabel} and is still building over ${windowText}.`;
      }
      return `${input.supplierName} ${categoryPrefix}pricing increased ${pctLabel} over ${windowText}.`;
  }
}

function collectSupplierIngredientLabels(
  supplierName: string,
  priceHistory: MarginAlertData["priceHistory"],
  ingredients: MarginAlertData["ingredients"],
): string[] {
  const labels = new Set<string>();
  for (const row of priceHistory) {
    if (row.supplier_name?.trim() !== supplierName) continue;
    const label =
      ingredients.find((i) => i.id === row.ingredient_id)?.name?.trim() ??
      row.ingredient_name?.trim();
    if (label) labels.add(label);
  }
  return [...labels].slice(0, 4);
}

function suppliersWithExpensiveSwitches(
  switchImpacts: SupplierSwitchImpactInsight[],
): Set<string> {
  return new Set(
    switchImpacts
      .filter((i) => i.switchType === "more_expensive")
      .map((i) => i.toSupplier),
  );
}

export function classifySupplierSwitchType(changePct: number): SupplierSwitchType {
  if (changePct >= MIN_SUPPLIER_SWITCH_IMPACT_PCT) return "more_expensive";
  if (changePct <= -MIN_SUPPLIER_SWITCH_IMPACT_PCT) return "cheaper";
  return "stable_transition";
}

export function buildSupplierSwitchNarrative(impact: {
  ingredientName: string;
  fromSupplier: string;
  toSupplier: string;
  changePct: number;
  switchType: SupplierSwitchType;
}): { narrative: string; impactLine: string; consequence: string } {
  const pct = formatPercent(Math.round(Math.abs(impact.changePct)));

  switch (impact.switchType) {
    case "more_expensive":
      return {
        narrative: `Switched ${impact.ingredientName} from ${impact.fromSupplier} to ${impact.toSupplier} at +${pct} unit cost.`,
        impactLine: `Estimated +${pct} on this SKU vs the prior supplier lane.`,
        consequence: "Margin on dependent recipes will compress unless portions or menu price adjust.",
      };
    case "cheaper":
      return {
        narrative: `Moved ${impact.ingredientName} from ${impact.fromSupplier} to ${impact.toSupplier} at ${formatPercent(Math.round(impact.changePct))} unit cost.`,
        impactLine: `Procurement saving of ~${pct} on the paid unit vs the prior supplier.`,
        consequence: "Protect margin by locking spec sizes before the basket drifts again.",
      };
    case "volatility_reduction":
      return {
        narrative: `After switching ${impact.ingredientName} to ${impact.toSupplier}, invoice noise on this line eased.`,
        impactLine: "Post-switch invoices are clustering closer to paid price.",
        consequence: "Easier to forecast COGS — keep spec discipline while the lane is calm.",
      };
    case "stable_transition":
    default:
      return {
        narrative: `Moved ${impact.ingredientName} from ${impact.fromSupplier} to ${impact.toSupplier} with minimal unit-price change.`,
        impactLine: "Lane change without material unit-cost shift.",
        consequence: "Validate next invoice matches catalog before scaling orders.",
      };
  }
}

function detectVolatilityReductionAfterSwitch(
  sorted: MarginAlertData["priceHistory"],
  switchIndex: number,
  toSupplier: string,
): boolean {
  const before = sorted
    .slice(0, switchIndex)
    .map(
      (r) =>
        r.delta_percent ??
        ((r.new_price ?? 0) > 0 && (r.previous_price ?? 0) > 0
          ? (((r.new_price ?? 0) - (r.previous_price ?? 0)) / (r.previous_price ?? 1)) * 100
          : 0),
    );
  const after = sorted
    .slice(switchIndex)
    .filter((r) => r.supplier_name?.trim() === toSupplier)
    .map(
      (r) =>
        r.delta_percent ??
        ((r.new_price ?? 0) > 0 && (r.previous_price ?? 0) > 0
          ? (((r.new_price ?? 0) - (r.previous_price ?? 0)) / (r.previous_price ?? 1)) * 100
          : 0),
    );

  if (before.length < 2 || after.length < 2) return false;
  const beforeStd = stdDev(before);
  const afterStd = stdDev(after);
  return beforeStd >= 4 && afterStd <= beforeStd * 0.55 && afterStd <= 2.5;
}

export function classifyRecipeMarginTrend(input: {
  movement: RecipeMarginMovementInsight["movement"];
  reason: string;
  estimatedMonthlyImpactEur: number;
}): RecipeMarginTrendStatus {
  const reason = input.reason.toLowerCase();
  if (input.movement === "worsening") {
    if (/\bstabiliz|\bsteady\b|\bholding\b|\bflat\b/i.test(reason)) return "stabilizing";
    return "worsening";
  }
  if (/recover|normalized|bounced|rebound/i.test(reason)) return "recovering";
  if (/above target|at target|improv/i.test(reason)) return "improving";
  if (input.estimatedMonthlyImpactEur < MIN_RECIPE_MARGIN_MOVEMENT_EUR) return "stabilizing";
  return "improving";
}

export function buildRecipeMarginHeadline(input: {
  recipeName: string;
  trendStatus: RecipeMarginTrendStatus;
  reason: string;
}): string {
  const reasonSnippet = shortOperationalLine(input.reason, 56)
    .replace(/^Cost increase /i, "")
    .replace(/^Modeled margin slip[—-]?\s*/i, "")
    .replace(/\.$/, "")
    .trim();
  const causal =
    reasonSnippet.length > 8
      ? reasonSnippet.charAt(0).toLowerCase() + reasonSnippet.slice(1)
      : "recent cost pressure";

  switch (input.trendStatus) {
    case "worsening":
      return `${input.recipeName} margin compressed after ${causal}.`;
    case "stabilizing":
      return `${input.recipeName} margin is stabilizing after ${causal}.`;
    case "recovering":
      return `${input.recipeName} recovered margin after ${causal}.`;
    case "improving":
    default:
      return `${input.recipeName} margin is improving — ${causal}.`;
  }
}

function enrichRecipeMarginMovement(
  base: Omit<
    RecipeMarginMovementInsight,
    "trendStatus" | "headline" | "operatorInsightLine" | "decisionTier" | "consequence" | "operatorAction"
  >,
): RecipeMarginMovementInsight {
  const trendStatus = classifyRecipeMarginTrend(base);
  const headline = buildRecipeMarginHeadline({
    recipeName: base.recipeName,
    trendStatus,
    reason: base.reason,
  });
  const decisionTier = mapToOperationalDecisionTier({
    priority: base.normalizedPriority,
    monthlyImpactEur: base.estimatedMonthlyImpactEur,
    forceBackground:
      base.movement === "improving" &&
      base.estimatedMonthlyImpactEur < MIN_RECIPE_MARGIN_MOVEMENT_EUR &&
      base.normalizedPriority === "informational",
  });

  return {
    ...base,
    trendStatus,
    headline,
    operatorInsightLine: headline,
    decisionTier,
    consequence: buildConsequenceLine({
      priority: base.normalizedPriority,
      monthlyImpactEur: base.estimatedMonthlyImpactEur,
      trendStatus,
      movement: base.movement,
    }),
    operatorAction: buildOperatorActionLine({
      suggestedAction:
        base.movement === "worsening"
          ? `Re-check portions and selling price on ${base.recipeName} before the next service.`
          : undefined,
      trendStatus,
      movement: base.movement,
    }),
  };
}

function isMeaningfulRecipeMarginMovement(entry: RecipeMarginMovementInsight): boolean {
  if (entry.trendStatus === "improving" && entry.estimatedMonthlyImpactEur < MIN_RECIPE_MARGIN_MOVEMENT_EUR) {
    return entry.normalizedPriority === "critical" || entry.normalizedPriority === "warning";
  }
  if (entry.movement === "worsening") {
    return (
      entry.estimatedMonthlyImpactEur >= MIN_RECIPE_MARGIN_MOVEMENT_EUR ||
      entry.normalizedPriority === "critical" ||
      entry.normalizedPriority === "warning"
    );
  }
  return true;
}

type SupplierMovementAccumulator = {
  supplierName: string;
  changes: number[];
  latestEventAt: string | null;
  windowHits: Record<OperationalWindowKey, number>;
};

function buildSupplierMovementGroups(
  data: MarginAlertData,
  windows: OperationalWindow[],
  expensiveSuppliers: Set<string> = new Set(),
): OperationalSynthesisGroups["supplierMovements"] {
  const bySupplier = new Map<string, SupplierMovementAccumulator>();
  for (const row of data.priceHistory) {
    const supplier = row.supplier_name?.trim();
    if (!supplier) continue;
    const pct =
      row.delta_percent ??
      ((row.new_price ?? 0) > 0 && (row.previous_price ?? 0) > 0
        ? (((row.new_price ?? 0) - (row.previous_price ?? 0)) / (row.previous_price ?? 1)) * 100
        : 0);
    const current = bySupplier.get(supplier) ?? {
      supplierName: supplier,
      changes: [],
      latestEventAt: null,
      windowHits: { last_30_days: 0, last_3_months: 0, last_6_months: 0 },
    };
    current.changes.push(pct);
    const window = resolveWindowFromDate(row.created_at, windows);
    current.windowHits[window] += 1;
    if (!current.latestEventAt || row.created_at.localeCompare(current.latestEventAt) > 0) {
      current.latestEventAt = row.created_at;
    }
    bySupplier.set(supplier, current);
  }

  const summarized = [...bySupplier.values()]
    .filter((entry) => entry.changes.length > 0)
    .map((entry): SupplierMovementInsight => {
      const avg = entry.changes.reduce((sum, value) => sum + value, 0) / entry.changes.length;
      const { key: dominantWindow, label: dominantWindowLabel } = dominantWindowFromHits(
        entry.windowHits,
        windows,
      );
      const { trend: temporalTrend } = computeSupplierTemporalTrend(
        data.priceHistory,
        entry.supplierName,
        windows,
      );
      const topIngredientLabels = collectSupplierIngredientLabels(
        entry.supplierName,
        data.priceHistory,
        data.ingredients,
      );
      const categoryHint =
        topIngredientLabels
          .map((name) => inferProcurementCategoryHint(name))
          .find((hint): hint is string => hint != null) ?? null;
      const signal = classifySupplierMovementSignal({
        averageChangePct: avg,
        changeEvents: entry.changes.length,
        changes: entry.changes,
        temporalTrend,
        expensiveSwitchOnSupplier: expensiveSuppliers.has(entry.supplierName),
      });
      const narrative = buildSupplierMovementNarrative({
        supplierName: entry.supplierName,
        averageChangePct: avg,
        changeEvents: entry.changes.length,
        signal,
        dominantWindowLabel,
        categoryHint,
        temporalTrend,
      });
      const normalizedPriority = mapToInsightPriority({
        monthlyImpactEur: Math.abs(avg) * 10,
      });
      const decisionTier = mapToOperationalDecisionTier({
        priority: normalizedPriority,
        monthlyImpactEur: Math.abs(avg) * 10,
        signal,
      });
      const operatorAction = buildOperatorActionLine({ signal, suggestedAction: undefined });
      const operatorInsightLine = buildOperatorInsightLine({
        title: entry.supplierName,
        detail: narrative,
        signal,
      });

      return {
        supplierName: entry.supplierName,
        normalizedPriority,
        decisionTier,
        averageChangePct: Number(avg.toFixed(2)),
        changeEvents: entry.changes.length,
        latestEventAt: entry.latestEventAt,
        windowHits: entry.windowHits,
        signal,
        narrative,
        operatorInsightLine,
        consequence:
          signal === "sustained_increase"
            ? buildConsequenceLine({
                priority: normalizedPriority,
                monthlyImpactEur: Math.abs(avg) * 10,
              })
            : undefined,
        operatorAction,
        dominantWindow,
        dominantWindowLabel,
        temporalTrend,
        categoryHint,
        topIngredientLabels,
      };
    });

  const meaningfulIncreases = summarized.filter(
    (entry) =>
      entry.averageChangePct >= MIN_MEANINGFUL_SUPPLIER_CHANGE_PCT &&
      entry.signal !== "stable_pricing" &&
      entry.signal !== "improving_consistency",
  );

  return {
    largestIncreases: meaningfulIncreases
      .sort((a, b) => b.averageChangePct - a.averageChangePct)
      .slice(0, MAX_SUPPLIER_MOVEMENTS_VISIBLE),
    stablePricing: summarized
      .filter(
        (entry) =>
          entry.signal === "stable_pricing" ||
          entry.signal === "improving_consistency" ||
          entry.signal === "stabilizing_after_volatility",
      )
      .sort((a, b) => b.changeEvents - a.changeEvents)
      .slice(0, MAX_SUPPLIER_MOVEMENTS_VISIBLE),
  };
}

function enrichSupplierSwitchImpact(
  base: Omit<
    SupplierSwitchImpactInsight,
    "switchType" | "narrative" | "impactLine" | "consequence"
  > & { switchType?: SupplierSwitchType },
): SupplierSwitchImpactInsight {
  const switchType = base.switchType ?? classifySupplierSwitchType(base.changePct);
  const copy = buildSupplierSwitchNarrative({
    ingredientName: base.ingredientName,
    fromSupplier: base.fromSupplier,
    toSupplier: base.toSupplier,
    changePct: base.changePct,
    switchType,
  });
  const impactLine =
    base.estimatedMonthlyImpactEur >= MIN_VISIBLE_IMPACT_EUR
      ? `~${formatCurrency(base.estimatedMonthlyImpactEur)}/mo modeled procurement impact · ${copy.impactLine}`
      : copy.impactLine;

  const normalizedPriority = base.normalizedPriority;
  const decisionTier = mapToOperationalDecisionTier({
    priority: normalizedPriority,
    monthlyImpactEur: base.estimatedMonthlyImpactEur,
    forceBackground: switchType === "stable_transition" && base.estimatedMonthlyImpactEur < MIN_VISIBLE_IMPACT_EUR,
  });
  const operatorAction = buildOperatorActionLine({ switchType });

  return {
    ...base,
    switchType,
    narrative: copy.narrative,
    operatorInsightLine: copy.narrative,
    impactLine,
    consequence: copy.consequence,
    decisionTier,
    operatorAction,
  };
}

function buildSupplierSwitchImpactGroups(
  data: MarginAlertData,
  windows: OperationalWindow[],
): OperationalSynthesisGroups["supplierSwitchImpacts"] {
  const historyByIngredient = new Map<string, typeof data.priceHistory>();
  for (const row of data.priceHistory) {
    const bucket = historyByIngredient.get(row.ingredient_id) ?? [];
    bucket.push(row);
    historyByIngredient.set(row.ingredient_id, bucket);
  }

  const rawImpacts: Array<
    Omit<SupplierSwitchImpactInsight, "switchType" | "narrative" | "impactLine" | "consequence">
  > = [];

  for (const [ingredientId, rows] of historyByIngredient.entries()) {
    const ingredientName =
      data.ingredients.find((ingredient) => ingredient.id === ingredientId)?.name?.trim() ??
      "Ingredient";
    const sorted = [...rows].sort((a, b) => a.created_at.localeCompare(b.created_at));
    for (let index = 1; index < sorted.length; index += 1) {
      const prev = sorted[index - 1];
      const next = sorted[index];
      if (!prev || !next) continue;
      const fromSupplier = prev.supplier_name?.trim();
      const toSupplier = next.supplier_name?.trim();
      if (!fromSupplier || !toSupplier || fromSupplier === toSupplier) continue;
      if ((prev.new_price ?? 0) <= 0 || (next.new_price ?? 0) <= 0) continue;
      const changePct = (((next.new_price ?? 0) - (prev.new_price ?? 0)) / (prev.new_price ?? 1)) * 100;
      const monthlyImpact = Math.round(Math.abs(changePct) * 8);
      const switchWindow = resolveWindowFromDate(next.created_at, windows);
      const volatilityReduction = detectVolatilityReductionAfterSwitch(sorted, index, toSupplier);
      const switchType: SupplierSwitchType = volatilityReduction
        ? "volatility_reduction"
        : classifySupplierSwitchType(changePct);

      rawImpacts.push({
        ingredientId,
        ingredientName,
        fromSupplier,
        toSupplier,
        changePct: Number(changePct.toFixed(2)),
        estimatedMonthlyImpactEur: monthlyImpact,
        normalizedPriority: mapToInsightPriority({
          monthlyImpactEur: monthlyImpact,
          contributionPct: Math.abs(changePct),
        }),
        switchedAt: next.created_at,
        window: switchWindow,
        switchType,
      });
    }
  }

  const deduped = new Map<string, (typeof rawImpacts)[number]>();
  for (const impact of rawImpacts) {
    const key = `${impact.ingredientId}:${impact.fromSupplier}:${impact.toSupplier}:${impact.window}`;
    const existing = deduped.get(key);
    if (!existing || impact.estimatedMonthlyImpactEur > existing.estimatedMonthlyImpactEur) {
      deduped.set(key, impact);
    }
  }

  const enriched = [...deduped.values()]
    .map((impact) => enrichSupplierSwitchImpact(impact))
    .filter(
      (impact) =>
        impact.switchType !== "stable_transition" ||
        impact.estimatedMonthlyImpactEur >= MIN_VISIBLE_IMPACT_EUR,
    );

  return {
    badSwitches: enriched
      .filter((impact) => impact.switchType === "more_expensive")
      .sort((a, b) => b.changePct - a.changePct)
      .slice(0, MAX_SUPPLIER_MOVEMENTS_VISIBLE),
    goodSwitches: enriched
      .filter((impact) => impact.switchType === "cheaper")
      .sort((a, b) => a.changePct - b.changePct)
      .slice(0, MAX_SUPPLIER_MOVEMENTS_VISIBLE),
    stableSwitches: enriched
      .filter((impact) => impact.switchType === "stable_transition")
      .slice(0, MAX_SUPPLIER_MOVEMENTS_VISIBLE),
    volatilityReductions: enriched
      .filter((impact) => impact.switchType === "volatility_reduction")
      .slice(0, MAX_SUPPLIER_MOVEMENTS_VISIBLE),
  };
}

function buildRecipeMarginMovementGroups(
  data: MarginAlertData,
  alerts: MarginAlertItem[],
  windows: OperationalWindow[],
): OperationalSynthesisGroups["recipeMarginMovements"] {
  const byRecipe = new Map<string, RecipeMarginMovementInsight>();
  for (const alert of alerts) {
    if (alert.kind !== "recipe_margin_deterioration" && alert.kind !== "recipe_below_target") {
      continue;
    }
    const recipeName = alert.title
      .replace(/^Modeled margin slip — /i, "")
      .replace(/\s+below target margin$/i, "")
      .trim();
    const impact = Math.max(MIN_RECIPE_MARGIN_MOVEMENT_EUR, Math.round((alert.priority || 0) / 100));
    const detectedAt = alert.meta.find((m) => m.label === "Detected")?.value;
    const alertWindow = alert.meta.find((m) => m.label === "Window")?.value;
    const window = alertWindow
      ? (windows.find((w) => w.label === alertWindow)?.key ??
        resolveWindowFromDate(detectedAt, windows))
      : resolveWindowFromDate(detectedAt, windows);

    const marginRange = parseRecipeMarginRangeFromAlert(alert);
    const movement = enrichRecipeMarginMovement({
      recipeName,
      movement: "worsening",
      reason: shortOperationalLine(alert.context),
      estimatedMonthlyImpactEur: impact,
      normalizedPriority: mapToInsightPriority({
        severity: alert.severity,
        monthlyImpactEur: impact,
      }),
      window,
      marginFromPct: marginRange?.marginFromPct,
      marginToPct: marginRange?.marginToPct,
    });

    const existing = byRecipe.get(recipeName);
    if (!existing || movement.estimatedMonthlyImpactEur > existing.estimatedMonthlyImpactEur) {
      byRecipe.set(recipeName, movement);
    }
  }

  const improvingCandidates: RecipeMarginMovementInsight[] = getRecipeMetrics(data.recipes)
    .filter((metric) => metric.recipe.type !== "prep" && (metric.grossMargin ?? 0) >= TARGET_MARGIN)
    .slice(0, MAX_RECIPE_MARGIN_MOVEMENTS_VISIBLE + 2)
    .map((metric) =>
      enrichRecipeMarginMovement({
        recipeName: metric.recipe.name,
        movement: "improving",
        reason: "Gross margin at or above target after recent sourcing discipline",
        estimatedMonthlyImpactEur: 0,
        normalizedPriority: "informational",
        window: "last_3_months",
      }),
    );

  const worsening = [...byRecipe.values()]
    .filter(isMeaningfulRecipeMarginMovement)
    .sort((a, b) => b.estimatedMonthlyImpactEur - a.estimatedMonthlyImpactEur)
    .slice(0, MAX_RECIPE_MARGIN_MOVEMENTS_VISIBLE);

  const improving = improvingCandidates
    .filter(isMeaningfulRecipeMarginMovement)
    .slice(0, MAX_RECIPE_MARGIN_MOVEMENTS_VISIBLE);

  return { worsening, improving };
}

function buildStableOperationalAreas(
  categoryPressure: SynthesizedCategoryPressureRow[],
  curatedExposures: CuratedOperationalExposure[],
  windows: OperationalWindow[],
): OperationalSynthesisGroups["stableOperationalAreas"] {
  const categories: StableOperationalCategoryInsight[] = categoryPressure
    .filter((row) => row.trend === "flat" || row.trend === "down")
    .slice(0, 5)
    .map((row) => ({
      category: row.group,
      label: row.label,
      trend: row.trend,
      note: shortOperationalLine(row.interpretiveLine),
      window: resolveWindowFromDate(undefined, windows),
    }));

  const highOperationalExposureIngredients: HighOperationalExposureIngredientInsight[] = curatedExposures
    .slice(0, 5)
    .map((row) => ({
      ingredientId: row.ingredientId,
      ingredientName: row.ingredientName,
      costSharePct: row.costSharePct,
      recipeCount: row.recipeCount,
      monthlyModeledExposureEur: row.monthlyModeledExposureEur,
      normalizedPriority: mapToInsightPriority({
        monthlyImpactEur: row.monthlyModeledExposureEur,
        contributionPct: row.costSharePct,
      }),
    }));

  return { categories, highOperationalExposureIngredients };
}

function ownerReviewImpactLine(monthlyImpactEur: number, prefix = "+"): string | null {
  if (monthlyImpactEur < 1) return null;
  return `${prefix}${formatCurrency(monthlyImpactEur)}/month`;
}

function formatIngredientPctChangeTitle(name: string, pct: number): string {
  const rounded = Math.round(Math.abs(pct));
  const sign = pct >= 0 ? "+" : "−";
  return `${name} ${sign}${formatPercent(rounded)}`;
}

function buildIngredientMovementInterpretation(
  ingredientId: string,
  data: MarginAlertData,
  monthlyImpactEur: number,
): string {
  const exposure = buildPortfolioCostExposure(data, 50).find(
    (row) => row.ingredientId === ingredientId,
  );
  const parts: string[] = [];
  if (exposure && exposure.recipeCount > 0) {
    parts.push(
      `Hits ${exposure.recipeCount} ${exposure.recipeCount === 1 ? "dish" : "dishes"}`,
    );
  }
  if (monthlyImpactEur >= 1) {
    parts.push(`~${formatCurrency(monthlyImpactEur)}/mo`);
  }
  return parts.join(" · ");
}

function buildFactualConcentrationTitle(group: GroupedConcentrationInsight): string {
  const recipe = group.affectedRecipes[0] ?? "Menu";
  return `${recipe} depends ${formatPercent(group.avgConcentrationPct)} on ${group.primaryIngredientName}`;
}

function buildConcentrationInterpretation(group: GroupedConcentrationInsight): string {
  const recipeCount = group.affectedRecipes.length;
  const parts = [
    recipeCount > 0
      ? `${recipeCount} ${recipeCount === 1 ? "dish" : "dishes"}`
      : null,
    group.estimatedImpactLine,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : shortOperationalLine(group.detail, 72);
}

function buildSupplierWatchTitle(supplierName: string, avgPct: number): string {
  if (Math.abs(avgPct) >= MIN_MEANINGFUL_SUPPLIER_CHANGE_PCT) {
    return formatIngredientPctChangeTitle(supplierName, avgPct);
  }
  return supplierName;
}

function buildSupplierWatchSecondary(
  ingredientChanges: SupplierIngredientChange[],
  direction: SupplierWatchDirection,
): string | null {
  if (ingredientChanges.length === 0) return null;
  const names = ingredientChanges.slice(0, 3).map((change) => change.name);
  const suffix =
    direction === "down"
      ? "lines easing on recent invoices"
      : "lines on last invoices";
  if (names.length === 1) return `${names[0]} ${suffix}`;
  if (names.length === 2) return `${names[0]} and ${names[1]} ${suffix}`;
  return `${names.slice(0, 2).join(", ")} +${names.length - 2} more ${suffix}`;
}

function ingredientNameFromAlertTitle(title: string): string {
  return title
    .replace(/\s+pricing is stale$/i, "")
    .replace(/\s+price rose$/i, "")
    .replace(/\s+price increased$/i, "")
    .trim();
}

function formatStalePriceFactTitle(title: string): string {
  const name = ingredientNameFromAlertTitle(title);
  return `${name} · catalog not confirmed`;
}

function lookupIngredientPctChange(
  ingredientName: string,
  data: MarginAlertData,
  windows: OperationalWindow[],
  windowKey: OperationalWindowKey,
): string | null {
  const normalized = ingredientName.trim().toLowerCase();
  const movement = rankIngredientPriceMovements({
    windowKey,
    data,
    windows,
  }).find((entry) => entry.name.trim().toLowerCase() === normalized);
  if (!movement || movement.pct < MIN_MEANINGFUL_SUPPLIER_CHANGE_PCT) return null;
  return formatIngredientPctChangeTitle(movement.name, movement.pct);
}

function recipeIngredientFactTitle(
  entry: RecipeMarginMovementInsight,
  data: MarginAlertData,
  windows: OperationalWindow[],
  windowKey: OperationalWindowKey,
): string | null {
  const fromReason = entry.reason.match(/Cost increase on (.+?)(?:\.|$)/i);
  if (fromReason?.[1]) {
    return lookupIngredientPctChange(fromReason[1].trim(), data, windows, windowKey);
  }
  const spike = entry.reason.match(/(.+?) price (?:rose|increased|up)/i);
  if (spike?.[1]) {
    return lookupIngredientPctChange(spike[1].trim(), data, windows, windowKey);
  }
  return null;
}

function ownerReviewRowIsMaterial(row: OwnerReviewRow): boolean {
  return row.monthlyImpactEur >= MIN_VISIBLE_IMPACT_EUR;
}

function buildSupplierWatchChangeLine(
  avgPct: number,
  ingredientChanges: SupplierIngredientChange[],
): string | null {
  const top = ingredientChanges[0];
  if (top) {
    return `${top.name} ${top.changePct >= 0 ? "+" : ""}${formatPercent(top.changePct)}`;
  }
  if (Math.abs(avgPct) >= MIN_MEANINGFUL_SUPPLIER_CHANGE_PCT) {
    return `Avg ${avgPct >= 0 ? "+" : ""}${formatPercent(Math.round(avgPct))}`;
  }
  return null;
}

function formatRecipeMarginImpactLine(
  marginFromPct?: number,
  marginToPct?: number,
): string | null {
  if (marginFromPct == null || marginToPct == null) return null;
  const deltaPp = marginToPct - marginFromPct;
  if (!Number.isFinite(deltaPp) || Math.abs(deltaPp) < 0.05) return null;
  const sign = deltaPp >= 0 ? "+" : "−";
  return `Margin ${sign}${Math.abs(deltaPp).toFixed(1)}pp`;
}

function formatRecipeWhatChangedLine(entry: RecipeMarginMovementInsight): string {
  const fromReason = ingredientIncreaseLineFromReason(entry.reason);
  if (fromReason) return fromReason.replace(/^Affected by /i, "");
  const headline = entry.headline.replace(new RegExp(`^${entry.recipeName}\\s+`, "i"), "").trim();
  return shortOperationalLine(headline || entry.reason, 72);
}

function countSupplierMovementDirections(
  data: MarginAlertData,
  windows: OperationalWindow[],
  windowKey: OperationalWindowKey,
): { increases: number; decreases: number } {
  const aggregates = aggregateSuppliersInWindow({
    windowKey,
    data,
    windows,
  });
  return {
    increases: aggregates.filter((entry) => entry.avgPct >= MIN_MEANINGFUL_SUPPLIER_CHANGE_PCT).length,
    decreases: aggregates.filter((entry) => entry.avgPct <= -MIN_MEANINGFUL_SUPPLIER_CHANGE_PCT).length,
  };
}

function collectSupplierIngredientChanges(
  supplierName: string,
  data: MarginAlertData,
  windowKey: OperationalWindowKey,
  windows: OperationalWindow[],
): SupplierIngredientChange[] {
  const byIngredient = new Map<string, SupplierIngredientChange>();
  for (const row of data.priceHistory) {
    if (row.supplier_name?.trim() !== supplierName) continue;
    if (!isInOperationalWindow(row.created_at, windowKey, windows)) continue;
    const pct = priceHistoryDeltaPct(row);
    if (Math.abs(pct) < MIN_MEANINGFUL_SUPPLIER_CHANGE_PCT) continue;
    const name = ingredientLabel(row.ingredient_id, row.ingredient_name, data.ingredients);
    const existing = byIngredient.get(row.ingredient_id);
    if (!existing || Math.abs(pct) > Math.abs(existing.changePct)) {
      byIngredient.set(row.ingredient_id, {
        ingredientId: row.ingredient_id,
        name,
        changePct: Number(pct.toFixed(1)),
        priceLine: formatUnitPricePair(row.previous_price, row.new_price, row.ingredient_unit),
      });
    }
  }
  return [...byIngredient.values()].sort(
    (a, b) => Math.abs(b.changePct) - Math.abs(a.changePct) || b.changePct - a.changePct,
  );
}

function supplierWatchDirection(avgPct: number): SupplierWatchDirection {
  if (avgPct >= MIN_MEANINGFUL_SUPPLIER_CHANGE_PCT) return "up";
  if (avgPct <= -MIN_MEANINGFUL_SUPPLIER_CHANGE_PCT) return "down";
  return "stable";
}

function supplierImpactFromSwitches(
  supplierName: string,
  groups: OperationalSynthesisGroups,
  windowKey?: OperationalWindowKey,
): number {
  return groups.supplierSwitchImpacts.badSwitches
    .filter(
      (entry) =>
        (windowKey == null || entry.window === windowKey) &&
        (entry.fromSupplier === supplierName || entry.toSupplier === supplierName),
    )
    .reduce((sum, entry) => sum + entry.estimatedMonthlyImpactEur, 0);
}

function recipeIdForName(data: MarginAlertData, recipeName: string): string | undefined {
  return getRecipeMetrics(data.recipes).find(
    (metric) => metric.recipe.name?.trim() === recipeName.trim(),
  )?.recipe.id;
}

function ingredientIncreaseLineFromReason(reason: string): string | null {
  const trimmed = reason.trim();
  if (!trimmed) return null;
  const costIncrease = trimmed.match(/Cost increase on (.+?)(?:\.|$)/i);
  if (costIncrease?.[1]) return `Affected by ${costIncrease[1].trim()} increase`;
  const spike = trimmed.match(/(.+?) price (?:rose|increased|up)/i);
  if (spike?.[1]) return `Affected by ${spike[1].trim()} increase`;
  if (/ingredient|supplier|price/i.test(trimmed)) {
    return shortOperationalLine(trimmed, 72);
  }
  return null;
}

function buildOwnerReviewFinancialRisks(input: {
  data: MarginAlertData;
  prioritizedInsights: PrioritizedOperationalInsight[];
  concentrationGroups: GroupedConcentrationInsight[];
  groups: OperationalSynthesisGroups;
  operationalWindows: OperationalWindow[];
  selectedWindowKey: OperationalWindowKey;
}): OwnerReviewRow[] {
  const rows: OwnerReviewRow[] = [];
  const seen = new Set<string>();

  const push = (row: OwnerReviewRow) => {
    if (seen.has(row.id)) return;
    seen.add(row.id);
    rows.push(row);
  };

  for (const entry of input.groups.recipeMarginMovements.worsening) {
    if (entry.window !== input.selectedWindowKey) continue;
    if (!isMeaningfulRecipeMarginMovement(entry)) continue;
    const factTitle = recipeIngredientFactTitle(
      entry,
      input.data,
      input.operationalWindows,
      input.selectedWindowKey,
    );
    const impact = ownerReviewImpactLine(entry.estimatedMonthlyImpactEur);
    const marginLine = formatRecipeMarginImpactLine(entry.marginFromPct, entry.marginToPct);
    push({
      id: `risk-recipe:${entry.recipeName}`,
      monthlyImpactEur: entry.estimatedMonthlyImpactEur,
      impactLine: impact,
      title: factTitle ?? entry.recipeName,
      whatChanged: factTitle
        ? [entry.recipeName, impact, marginLine].filter(Boolean).join(" · ")
        : formatRecipeWhatChangedLine(entry),
      target: "/recipes",
      recipeId: recipeIdForName(input.data, entry.recipeName),
    });
  }

  for (const entry of input.groups.supplierSwitchImpacts.badSwitches) {
    if (entry.window !== input.selectedWindowKey) continue;
    if (entry.estimatedMonthlyImpactEur < MIN_VISIBLE_IMPACT_EUR) continue;
    push({
      id: `risk-switch:${entry.ingredientId}:${entry.switchedAt}`,
      monthlyImpactEur: entry.estimatedMonthlyImpactEur,
      impactLine: ownerReviewImpactLine(entry.estimatedMonthlyImpactEur),
      title: formatIngredientPctChangeTitle(entry.ingredientName, entry.changePct),
      whatChanged: `${entry.fromSupplier} → ${entry.toSupplier}`,
      target: "/ingredients",
      ingredientId: entry.ingredientId,
      supplierName: entry.toSupplier,
    });
  }

  for (const group of input.concentrationGroups) {
    if (group.estimatedMonthlyImpactEur < MIN_VISIBLE_IMPACT_EUR) continue;
    push({
      id: `risk-concentration:${group.id}`,
      monthlyImpactEur: group.estimatedMonthlyImpactEur,
      impactLine: group.estimatedImpactLine,
      title: buildFactualConcentrationTitle(group),
      whatChanged: buildConcentrationInterpretation(group),
      target: group.target,
    });
  }

  const ingredientIncreases = rankIngredientPriceMovements({
    windowKey: input.selectedWindowKey,
    data: input.data,
    windows: input.operationalWindows,
  }).filter((entry) => entry.pct >= MIN_MEANINGFUL_SUPPLIER_CHANGE_PCT);

  for (const entry of ingredientIncreases.slice(0, 6)) {
    const exposure = buildPortfolioCostExposure(input.data, 50).find(
      (row) => row.ingredientId === entry.ingredientId,
    );
    const monthlyImpactEur = exposure
      ? Math.round(exposure.monthlyModeledExposureEur * (entry.pct / 100))
      : 0;
    if (monthlyImpactEur < MIN_VISIBLE_IMPACT_EUR) continue;
    const interpretation = buildIngredientMovementInterpretation(
      entry.ingredientId,
      input.data,
      monthlyImpactEur,
    );
    push({
      id: `risk-ingredient:${entry.ingredientId}`,
      monthlyImpactEur,
      impactLine: ownerReviewImpactLine(monthlyImpactEur),
      title: formatIngredientPctChangeTitle(entry.name, entry.pct),
      whatChanged:
        interpretation ||
        formatUnitPricePair(entry.previousPrice, entry.currentPrice, entry.unit) ||
        `Unit price up ${formatPercent(Math.round(entry.pct))}`,
      target: "/ingredients",
      ingredientId: entry.ingredientId,
    });
  }

  return rows.filter(ownerReviewRowIsMaterial).sort(
    (a, b) =>
      b.monthlyImpactEur - a.monthlyImpactEur ||
      a.title.localeCompare(b.title),
  );
}

function buildOwnerReviewOpportunities(input: {
  data: MarginAlertData;
  groups: OperationalSynthesisGroups;
  operationalWindows: OperationalWindow[];
  selectedWindowKey: OperationalWindowKey;
}): OwnerReviewRow[] {
  const rows: OwnerReviewRow[] = [];
  const seen = new Set<string>();

  const push = (row: OwnerReviewRow) => {
    if (seen.has(row.id)) return;
    seen.add(row.id);
    rows.push(row);
  };

  for (const entry of input.groups.supplierSwitchImpacts.goodSwitches) {
    if (entry.window !== input.selectedWindowKey) continue;
    if (entry.estimatedMonthlyImpactEur < MIN_VISIBLE_IMPACT_EUR) continue;
    push({
      id: `opp-switch:${entry.ingredientId}:${entry.switchedAt}`,
      monthlyImpactEur: entry.estimatedMonthlyImpactEur,
      impactLine: ownerReviewImpactLine(entry.estimatedMonthlyImpactEur, "−"),
      title: formatIngredientPctChangeTitle(entry.ingredientName, entry.changePct),
      whatChanged: `${entry.fromSupplier} → ${entry.toSupplier}`,
      target: "/ingredients",
      ingredientId: entry.ingredientId,
      supplierName: entry.toSupplier,
    });
  }

  const ingredientDecreases = rankIngredientPriceMovements({
    windowKey: input.selectedWindowKey,
    data: input.data,
    windows: input.operationalWindows,
  }).filter((entry) => entry.pct <= -MIN_MEANINGFUL_SUPPLIER_CHANGE_PCT);

  for (const entry of ingredientDecreases.slice(0, 6)) {
    const exposure = buildPortfolioCostExposure(input.data, 50).find(
      (row) => row.ingredientId === entry.ingredientId,
    );
    const monthlyImpactEur = exposure
      ? Math.round(exposure.monthlyModeledExposureEur * (Math.abs(entry.pct) / 100))
      : 0;
    const interpretation = buildIngredientMovementInterpretation(
      entry.ingredientId,
      input.data,
      monthlyImpactEur,
    );
    push({
      id: `opp-ingredient:${entry.ingredientId}`,
      monthlyImpactEur,
      impactLine:
        monthlyImpactEur >= 1 ? ownerReviewImpactLine(monthlyImpactEur, "−") : null,
      title: formatIngredientPctChangeTitle(entry.name, entry.pct),
      whatChanged:
        interpretation ||
        formatUnitPricePair(entry.previousPrice, entry.currentPrice, entry.unit) ||
        `Unit price down ${formatPercent(Math.round(Math.abs(entry.pct)))}`,
      target: "/ingredients",
      ingredientId: entry.ingredientId,
    });
  }

  return rows
    .filter(
      (row) =>
        row.monthlyImpactEur >= MIN_VISIBLE_IMPACT_EUR ||
        /€[\d,.]/.test(row.whatChanged) ||
        /unit price down/i.test(row.whatChanged),
    )
    .sort(
      (a, b) =>
        b.monthlyImpactEur - a.monthlyImpactEur ||
        a.title.localeCompare(b.title),
    );
}

function buildOwnerReviewSuppliersToWatch(input: {
  data: MarginAlertData;
  groups: OperationalSynthesisGroups;
  operationalWindows: OperationalWindow[];
  selectedWindowKey: OperationalWindowKey;
}): SupplierWatchRow[] {
  const aggregates = aggregateSuppliersInWindow({
    windowKey: input.selectedWindowKey,
    data: input.data,
    windows: input.operationalWindows,
  });

  const inSelectedWindow = (entry: SupplierMovementInsight) =>
    entry.dominantWindow === input.selectedWindowKey ||
    entry.windowHits[input.selectedWindowKey] > 0;

  const supplierNames = new Set<string>([
    ...aggregates.map((entry) => entry.supplierName),
    ...input.groups.supplierMovements.largestIncreases
      .filter(inSelectedWindow)
      .map((entry) => entry.supplierName),
    ...input.groups.supplierMovements.stablePricing
      .filter(inSelectedWindow)
      .map((entry) => entry.supplierName),
  ]);

  const rows: SupplierWatchRow[] = [];
  for (const supplierName of supplierNames) {
    const stats = aggregates.find((entry) => entry.supplierName === supplierName);
    const avgPct = stats?.avgPct ?? 0;
    const direction = supplierWatchDirection(avgPct);
    const switchImpact = supplierImpactFromSwitches(
      supplierName,
      input.groups,
      input.selectedWindowKey,
    );
    const ingredientChanges = collectSupplierIngredientChanges(
      supplierName,
      input.data,
      input.selectedWindowKey,
      input.operationalWindows,
    );
    if (
      direction === "stable" &&
      switchImpact < 1 &&
      ingredientChanges.length === 0 &&
      !input.groups.supplierMovements.largestIncreases.some(
        (entry) =>
          entry.supplierName === supplierName && inSelectedWindow(entry),
      )
    ) {
      continue;
    }

    const changeLine = buildSupplierWatchChangeLine(avgPct, ingredientChanges);
    if (!changeLine && direction === "stable" && switchImpact < 1) continue;

    rows.push({
      id: `supplier-watch:${supplierName}`,
      supplierName,
      direction,
      title: buildSupplierWatchTitle(supplierName, avgPct),
      secondary: buildSupplierWatchSecondary(ingredientChanges, direction),
      changeLine,
      impactLine: switchImpact >= 1 ? ownerReviewImpactLine(switchImpact) : null,
      ingredientChanges,
    });
  }

  return rows.sort((a, b) => {
    const directionRank = { up: 0, down: 1, stable: 2 };
    const impactValue = (row: SupplierWatchRow) =>
      row.impactLine ? 1 : 0;
    return (
      directionRank[a.direction] - directionRank[b.direction] ||
      impactValue(b) - impactValue(a) ||
      a.supplierName.localeCompare(b.supplierName)
    );
  });
}

function buildOwnerReviewAffectedRecipes(input: {
  data: MarginAlertData;
  alerts: MarginAlertItem[];
  groups: OperationalSynthesisGroups;
  operationalWindows: OperationalWindow[];
  selectedWindowKey: OperationalWindowKey;
}): AffectedRecipeRow[] {
  const rows: AffectedRecipeRow[] = [];
  const seen = new Set<string>();

  for (const entry of input.groups.recipeMarginMovements.worsening) {
    if (entry.window !== input.selectedWindowKey) continue;
    if (!isMeaningfulRecipeMarginMovement(entry)) continue;
    if (entry.trendStatus === "stabilizing" && entry.estimatedMonthlyImpactEur < MIN_RECIPE_MARGIN_MOVEMENT_EUR) {
      continue;
    }
    const recipeId = recipeIdForName(input.data, entry.recipeName);
    const factChange = recipeIngredientFactTitle(
      entry,
      input.data,
      input.operationalWindows,
      input.selectedWindowKey,
    );
    rows.push({
      id: `affected-recipe:${entry.recipeName}`,
      recipeName: entry.recipeName,
      recipeId,
      whatChanged: factChange ?? formatRecipeWhatChangedLine(entry),
      impactLine: formatRecipeMarginImpactLine(entry.marginFromPct, entry.marginToPct),
      target: "/recipes",
    });
    seen.add(entry.recipeName);
  }

  return rows.sort((a, b) => a.recipeName.localeCompare(b.recipeName));
}

function buildOwnerReviewAttentionNeeded(input: {
  alerts: MarginAlertItem[];
  monitorInsights: PrioritizedOperationalInsight[];
}): AttentionRow[] {
  const rows: AttentionRow[] = [];
  const seen = new Set<string>();

  const push = (row: AttentionRow) => {
    if (seen.has(row.id)) return;
    seen.add(row.id);
    rows.push(row);
  };

  for (const alert of input.alerts.filter((entry) => entry.kind === "stale_price")) {
    const ingredientId = extractIngredientIdFromAlert(alert);
    push({
      id: `attention-stale:${alert.id}`,
      kind: "stale_price",
      title: formatStalePriceFactTitle(alert.title),
      detail: shortOperationalLine(alert.context || "Pricing not confirmed by a recent invoice."),
      target: alert.target,
      ingredientId: ingredientId ?? undefined,
    });
  }

  for (const insight of input.monitorInsights.filter(
    (entry) => entry.category === "stale_pricing",
  )) {
    push({
      id: `attention-monitor:${insight.id}`,
      kind: "missing_confirmation",
      title: isGenericOperationalTitle(insight.title)
        ? formatStalePriceFactTitle(insight.detail)
        : formatStalePriceFactTitle(insight.title),
      detail: shortOperationalLine(insight.detail),
      target: insight.target,
    });
  }

  for (const insight of input.monitorInsights.filter(
    (entry) => entry.category === "supplier_instability",
  )) {
    push({
      id: `attention-supplier:${insight.id}`,
      kind: "supplier_inactive",
      title: insight.detail.split(".")[0]?.trim() || insight.title,
      detail: shortOperationalLine(insight.operatorInsightLine || insight.detail),
      target: insight.target,
    });
  }

  return rows;
}

export function buildOwnerReviewViewModel(input: {
  data: MarginAlertData;
  alerts: MarginAlertItem[];
  monthlyMarginPressure: MonthlyMarginPressureSummary;
  prioritizedInsights: PrioritizedOperationalInsight[];
  concentrationGroups: GroupedConcentrationInsight[];
  operationalSynthesisGroups: OperationalSynthesisGroups;
  monitorInsights: PrioritizedOperationalInsight[];
  operationalWindows: OperationalWindow[];
  selectedWindowKey: OperationalWindowKey;
}): OwnerReviewViewModel {
  const supplierCounts = countSupplierMovementDirections(
    input.data,
    input.operationalWindows,
    input.selectedWindowKey,
  );
  const staleCount = input.alerts.filter((alert) => alert.kind === "stale_price").length;
  const periodPhrase = operationalPeriodPhrase(input.selectedWindowKey, input.operationalWindows);

  return {
    weeklySnapshot: {
      supplierIncreases: supplierCounts.increases,
      monthlyImpactEur: input.monthlyMarginPressure.estimatedMarginPressureEur,
      supplierDecreases: supplierCounts.decreases,
      pricesNeedingRefresh: staleCount,
    },
    periodPhrase,
    selectedWindowKey: input.selectedWindowKey,
    financialRisks: buildOwnerReviewFinancialRisks({
      data: input.data,
      prioritizedInsights: input.prioritizedInsights,
      concentrationGroups: input.concentrationGroups,
      groups: input.operationalSynthesisGroups,
      operationalWindows: input.operationalWindows,
      selectedWindowKey: input.selectedWindowKey,
    }),
    opportunities: buildOwnerReviewOpportunities({
      data: input.data,
      groups: input.operationalSynthesisGroups,
      operationalWindows: input.operationalWindows,
      selectedWindowKey: input.selectedWindowKey,
    }),
    suppliersToWatch: buildOwnerReviewSuppliersToWatch({
      data: input.data,
      groups: input.operationalSynthesisGroups,
      operationalWindows: input.operationalWindows,
      selectedWindowKey: input.selectedWindowKey,
    }),
    affectedRecipes: buildOwnerReviewAffectedRecipes({
      data: input.data,
      alerts: input.alerts,
      groups: input.operationalSynthesisGroups,
      operationalWindows: input.operationalWindows,
      selectedWindowKey: input.selectedWindowKey,
    }),
    attentionNeeded: buildOwnerReviewAttentionNeeded({
      alerts: input.alerts,
      monitorInsights: input.monitorInsights,
    }),
  };
}
