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
  buildTodaysMarginRisks,
  collectOperationalRecommendations,
  extractIngredientIdFromAlert,
  finalizeOperationalRecommendations,
  inferCostCategory,
  type CategoryPressureRow,
  type CostCategoryGroup,
  type CostCategorySlice,
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

export type OperationalTrendExpandable = {
  bullets: string[];
  sparklinePoints?: number[];
};

export type OperationalTrendItem = {
  id: string;
  label: string;
  detail?: string;
  window?: OperationalWindowKey;
  temporalTrend?: SupplierMovementInsight["temporalTrend"];
  direction?: "up" | "down" | "flat";
  expandable?: OperationalTrendExpandable;
};

export type OperationalTrendSubsection = {
  title: string;
  /** Display labels — mirrors `items[].label` for tests and simple consumers. */
  bullets: string[];
  items: OperationalTrendItem[];
};

export type OperationalTrendPanel = {
  label: string;
  windowKeys: OperationalWindowKey[];
  supplierMovement: OperationalTrendSubsection;
  marginMovement: OperationalTrendSubsection;
  procurementSignals: OperationalTrendSubsection;
  operationalRecommendation: OperationalTrendSubsection;
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

function trendMatchesPanel(windowKey: OperationalWindowKey, panelKeys: OperationalWindowKey[]): boolean {
  return panelKeys.includes(windowKey);
}

function trendSubsection(title: string, items: OperationalTrendItem[]): OperationalTrendSubsection {
  return {
    title,
    items,
    bullets: items.map((item) => item.label),
  };
}

function supplierDirectionFromChange(
  changePct: number,
): OperationalTrendItem["direction"] {
  if (changePct > 0.5) return "up";
  if (changePct < -0.5) return "down";
  return "flat";
}

function collectSupplierSparklinePoints(
  supplierName: string,
  priceHistory: MarginAlertData["priceHistory"],
  panelKeys: OperationalWindowKey[],
  windows: OperationalWindow[],
): number[] {
  const allowedStarts = panelKeys
    .map((key) => windows.find((w) => w.key === key)?.startsAtIso)
    .filter((iso): iso is string => Boolean(iso))
    .map((iso) => new Date(iso).getTime());
  const cutoff = allowedStarts.length > 0 ? Math.min(...allowedStarts) : null;

  const points = priceHistory
    .filter((row) => row.supplier_name?.trim() === supplierName)
    .filter((row) => {
      if (cutoff == null) return true;
      const ms = new Date(row.created_at).getTime();
      return Number.isFinite(ms) && ms >= cutoff;
    })
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .map(
      (row) =>
        row.delta_percent ??
        ((row.new_price ?? 0) > 0 && (row.previous_price ?? 0) > 0
          ? (((row.new_price ?? 0) - (row.previous_price ?? 0)) / (row.previous_price ?? 1)) * 100
          : 0),
    );

  if (points.length <= 8) return points;
  const step = Math.ceil(points.length / 8);
  return points.filter((_, index) => index % step === 0).slice(-8);
}

function supplierIncreaseToTrendItem(
  entry: SupplierMovementInsight,
  priceHistory: MarginAlertData["priceHistory"],
  windows: OperationalWindow[],
  panelKeys: OperationalWindowKey[],
): OperationalTrendItem {
  const sparklinePoints = collectSupplierSparklinePoints(
    entry.supplierName,
    priceHistory,
    panelKeys,
    windows,
  );
  const expandableBullets = [
    entry.operatorInsightLine,
    entry.topIngredientLabels.length > 0
      ? `Affected ingredients: ${entry.topIngredientLabels.join(", ")}`
      : null,
    entry.categoryHint ? `Lane: ${entry.categoryHint}` : null,
    entry.consequence ? `If ignored: ${entry.consequence}` : null,
    `Next step: ${entry.operatorAction}`,
  ].filter((line): line is string => Boolean(line));

  return {
    id: `supplier-increase:${entry.supplierName}:${entry.dominantWindow}`,
    label: entry.narrative,
    detail:
      entry.averageChangePct >= MIN_MEANINGFUL_SUPPLIER_CHANGE_PCT
        ? `${entry.averageChangePct > 0 ? "+" : ""}${formatPercent(Math.round(entry.averageChangePct))} avg · ${entry.changeEvents} invoice event${entry.changeEvents === 1 ? "" : "s"} · ${entry.dominantWindowLabel}`
        : `${entry.changeEvents} invoice event${entry.changeEvents === 1 ? "" : "s"} · ${entry.dominantWindowLabel}`,
    window: entry.dominantWindow,
    temporalTrend: entry.temporalTrend,
    direction: supplierDirectionFromChange(entry.averageChangePct),
    expandable: {
      bullets: expandableBullets,
      sparklinePoints: sparklinePoints.length >= 2 ? sparklinePoints : undefined,
    },
  };
}

function supplierSwitchToTrendItem(entry: SupplierSwitchImpactInsight): OperationalTrendItem {
  const expandableBullets = [
    entry.impactLine,
    `Prior supplier: ${entry.fromSupplier}`,
    `Current supplier: ${entry.toSupplier}`,
    `If ignored: ${entry.consequence}`,
    `Next step: ${entry.operatorAction}`,
  ];

  return {
    id: `supplier-switch:${entry.ingredientId}:${entry.fromSupplier}:${entry.toSupplier}:${entry.window}`,
    label: entry.narrative,
    detail: `${formatPercent(Math.round(Math.abs(entry.changePct)))} unit cost · ${entry.ingredientName}`,
    window: entry.window,
    direction: supplierDirectionFromChange(entry.changePct),
    expandable: { bullets: expandableBullets },
  };
}

function buildTrendSupplierItems(input: {
  groups: OperationalSynthesisGroups;
  panelKeys: OperationalWindowKey[];
  priceHistory: MarginAlertData["priceHistory"];
  windows: OperationalWindow[];
}): OperationalTrendItem[] {
  const items: OperationalTrendItem[] = [];

  for (const entry of input.groups.supplierMovements.largestIncreases.filter((row) =>
    trendMatchesPanel(row.dominantWindow, input.panelKeys),
  ).slice(0, 3)) {
    items.push(
      supplierIncreaseToTrendItem(entry, input.priceHistory, input.windows, input.panelKeys),
    );
  }

  const switches = [
    ...input.groups.supplierSwitchImpacts.badSwitches,
    ...input.groups.supplierSwitchImpacts.goodSwitches,
    ...input.groups.supplierSwitchImpacts.volatilityReductions,
  ]
    .filter((entry) => trendMatchesPanel(entry.window, input.panelKeys))
    .slice(0, 2);

  for (const entry of switches) {
    items.push(supplierSwitchToTrendItem(entry));
  }

  for (const entry of input.groups.supplierMovements.stablePricing
    .filter((row) => trendMatchesPanel(row.dominantWindow, input.panelKeys))
    .slice(0, 2)) {
    items.push({
      id: `supplier-stable:${entry.supplierName}:${entry.dominantWindow}`,
      label: entry.narrative,
      detail: `${entry.changeEvents} invoice event${entry.changeEvents === 1 ? "" : "s"} · ${entry.dominantWindowLabel}`,
      window: entry.dominantWindow,
      temporalTrend: entry.temporalTrend,
      direction: "flat",
      expandable: {
        bullets: [
          entry.operatorInsightLine,
          entry.topIngredientLabels.length > 0
            ? `Ingredients: ${entry.topIngredientLabels.join(", ")}`
            : "No ingredient-level spikes in this lane.",
        ],
      },
    });
  }

  if (items.length === 0) {
    return [
      {
        id: `supplier-empty:${input.panelKeys.join("-")}`,
        label: "Supplier invoice lanes held steady in this window — no sustained increases or switches recorded.",
      },
    ];
  }

  return items.slice(0, 5);
}

export function parseRecipeMarginRangeFromAlert(
  alert: MarginAlertItem,
): { marginFromPct: number; marginToPct: number } | null {
  const match =
    alert.context.match(/fell from about ([\d.]+)% to ([\d.]+)%/i) ??
    alert.context.match(/from ([\d.]+)% to ([\d.]+)%/i);
  if (!match?.[1] || !match[2]) return null;
  const marginFromPct = Number(match[1]);
  const marginToPct = Number(match[2]);
  if (!Number.isFinite(marginFromPct) || !Number.isFinite(marginToPct)) return null;
  return { marginFromPct, marginToPct };
}

function buildTrendMarginLabel(
  entry: RecipeMarginMovementInsight,
  panelLabel: string,
): string {
  if (entry.marginFromPct != null && entry.marginToPct != null) {
    const windowPhrase = panelLabel === "Last 90 days" ? "90 days" : "6 months";
    return `${entry.recipeName} margin ${Math.round(entry.marginFromPct)}% → ${Math.round(entry.marginToPct)}% over ${windowPhrase}`;
  }
  return entry.headline;
}

function recipeMarginToTrendItem(
  entry: RecipeMarginMovementInsight,
  panelLabel: string,
): OperationalTrendItem {
  const label = buildTrendMarginLabel(entry, panelLabel);
  const expandableBullets = [
    entry.reason.length > 8 ? `Cause: ${entry.reason}` : null,
    entry.consequence ? `If ignored: ${entry.consequence}` : null,
    `Next step: ${entry.operatorAction}`,
  ].filter((line): line is string => Boolean(line));

  return {
    id: `recipe-margin:${entry.recipeName}:${entry.movement}:${entry.window}`,
    label,
    detail:
      entry.estimatedMonthlyImpactEur > 0
        ? `~${formatCurrency(entry.estimatedMonthlyImpactEur)}/mo modeled impact`
        : undefined,
    window: entry.window,
    direction: entry.movement === "worsening" ? "down" : "up",
    expandable: expandableBullets.length > 0 ? { bullets: expandableBullets } : undefined,
  };
}

function buildTrendMarginItems(
  groups: OperationalSynthesisGroups,
  panelKeys: OperationalWindowKey[],
  panelLabel: string,
): OperationalTrendItem[] {
  const items: OperationalTrendItem[] = [];

  for (const entry of groups.recipeMarginMovements.worsening.filter((row) =>
    trendMatchesPanel(row.window, panelKeys),
  ).slice(0, 3)) {
    items.push(recipeMarginToTrendItem(entry, panelLabel));
  }

  for (const entry of groups.recipeMarginMovements.improving.filter((row) =>
    trendMatchesPanel(row.window, panelKeys),
  ).slice(0, 2)) {
    items.push(recipeMarginToTrendItem(entry, panelLabel));
  }

  if (items.length === 0) {
    return [
      {
        id: `margin-empty:${panelKeys.join("-")}`,
        label: "Recipe margins held in band — no modeled slips or recoveries flagged in this window.",
      },
    ];
  }

  return items.slice(0, 5);
}

function buildTrendProcurementItems(input: {
  panelKeys: OperationalWindowKey[];
  monthlyMarginPressure: MonthlyMarginPressureSummary;
  groups: OperationalSynthesisGroups;
  categoryPressure: SynthesizedCategoryPressureRow[];
  alerts: MarginAlertItem[];
}): OperationalTrendItem[] {
  const items: OperationalTrendItem[] = [];

  if (input.monthlyMarginPressure.biggestInflationDriver && input.panelKeys.includes("last_3_months")) {
    items.push({
      id: "procurement-inflation-driver",
      label: `Invoice pressure: ${input.monthlyMarginPressure.biggestInflationDriver}`,
      expandable: {
        bullets: [
          input.monthlyMarginPressure.estimatedMarginPressureLine,
          input.monthlyMarginPressure.mostAffectedCategory
            ? `Most affected category: ${input.monthlyMarginPressure.mostAffectedCategory}`
            : "Review category mix on the next invoice cycle.",
        ],
      },
    });
  }

  const materialIncreases = countMaterialIngredientIncreases(input.alerts);
  if (materialIncreases > 0) {
    items.push({
      id: "procurement-material-increases",
      label: `${materialIncreases} SKU${materialIncreases === 1 ? "" : "s"} with material invoice increases in the lookback.`,
    });
  }

  for (const row of input.categoryPressure.filter((entry) => entry.trend === "up").slice(0, 2)) {
    items.push({
      id: `procurement-category-up:${row.group}`,
      label: `${row.label}: ${row.pressureLine}`,
      detail: shortOperationalLine(row.interpretiveLine, 72),
      expandable: {
        bullets: [row.operationalLine, row.interpretiveLine].filter(
          (line) => line.trim().length > 0,
        ),
      },
    });
  }

  const switchMemory = [
    ...input.groups.supplierSwitchImpacts.badSwitches,
    ...input.groups.supplierSwitchImpacts.goodSwitches,
    ...input.groups.supplierSwitchImpacts.stableSwitches,
  ]
    .filter((entry) => trendMatchesPanel(entry.window, input.panelKeys))
    .slice(0, 2);

  for (const entry of switchMemory) {
    items.push({
      id: `procurement-switch-memory:${entry.ingredientId}:${entry.switchedAt}`,
      label: `Switch memory — ${entry.ingredientName}: ${entry.fromSupplier} → ${entry.toSupplier}`,
      detail: entry.impactLine,
      window: entry.window,
      direction: supplierDirectionFromChange(entry.changePct),
      expandable: {
        bullets: [entry.narrative, entry.consequence, entry.operatorAction],
      },
    });
  }

  for (const exposure of input.groups.stableOperationalAreas.highOperationalExposureIngredients.slice(
    0,
    2,
  )) {
    items.push({
      id: `procurement-concentration:${exposure.ingredientId}`,
      label: `${exposure.ingredientName} concentrated across ${exposure.recipeCount} recipe${exposure.recipeCount === 1 ? "" : "s"} (${formatPercent(Math.round(exposure.costSharePct))} cost share)`,
      detail: `~${formatCurrency(exposure.monthlyModeledExposureEur)}/mo modeled exposure`,
      expandable: {
        bullets: [
          "High plate concentration — portion and supplier discipline on this line moves menu margin.",
        ],
      },
    });
  }

  for (const category of input.groups.stableOperationalAreas.categories
    .filter((entry) => trendMatchesPanel(entry.window, input.panelKeys))
    .slice(0, 2)) {
    items.push({
      id: `procurement-stable-category:${category.category}`,
      label: `${category.label}: ${category.note}`,
      window: category.window,
      direction: category.trend === "down" ? "down" : "flat",
    });
  }

  if (items.length === 0) {
    return [
      {
        id: `procurement-empty:${input.panelKeys.join("-")}`,
        label:
          "Procurement basket steady — no dominant inflation, switch history, or concentration shifts in this window.",
      },
    ];
  }

  return items.slice(0, 5);
}

function buildTrendRecommendationItems(input: {
  panelKeys: OperationalWindowKey[];
  prioritizedInsights: PrioritizedOperationalInsight[];
  recoverySignals: GroupedRecoveryOpportunity[];
  monthlyMarginPressure: MonthlyMarginPressureSummary;
}): OperationalTrendItem[] {
  const items: OperationalTrendItem[] = [];

  for (const insight of input.prioritizedInsights
    .filter((row) => row.decisionTier === "now")
    .slice(0, 2)) {
    items.push({
      id: `recommendation-insight:${insight.id}`,
      label: insight.operatorAction,
      detail: insight.title,
      expandable: {
        bullets: [
          insight.operatorInsightLine,
          insight.consequence ? `If ignored: ${insight.consequence}` : insight.impactLine,
        ].filter((line) => line.length > 0),
      },
    });
  }

  for (const card of input.recoverySignals
    .filter((row) => row.decisionTier === "now" || row.decisionTier === "monitor")
    .slice(0, 2)) {
    items.push({
      id: `recommendation-recovery:${card.id}`,
      label: card.operatorActions[0] ?? card.why,
      detail: card.title,
      expandable: {
        bullets: [card.why, card.savingsLine].filter((line) => line.length > 0),
      },
    });
  }

  if (items.length === 0) {
    if (input.monthlyMarginPressure.estimatedMarginPressureEur < 25) {
      items.push({
        id: "recommendation-hold-pricing",
        label: "Hold menu pricing — validate next invoices before prep or spec changes.",
      });
    } else {
      items.push({
        id: "recommendation-watch-suppliers",
        label: "Watch supplier lanes on the next two delivery cycles before repricing the menu.",
      });
    }
  }

  return items.slice(0, 3);
}

function buildOperationalTrendPanel(input: {
  label: string;
  windowKeys: OperationalWindowKey[];
  groups: OperationalSynthesisGroups;
  monthlyMarginPressure: MonthlyMarginPressureSummary;
  prioritizedInsights: PrioritizedOperationalInsight[];
  alerts: MarginAlertItem[];
  categoryPressure: SynthesizedCategoryPressureRow[];
  data: MarginAlertData;
  windows: OperationalWindow[];
}): OperationalTrendPanel {
  return {
    label: input.label,
    windowKeys: input.windowKeys,
    supplierMovement: trendSubsection(
      "Supplier movement",
      buildTrendSupplierItems({
        groups: input.groups,
        panelKeys: input.windowKeys,
        priceHistory: input.data.priceHistory,
        windows: input.windows,
      }),
    ),
    marginMovement: trendSubsection(
      "Margin movement",
      buildTrendMarginItems(input.groups, input.windowKeys, input.label),
    ),
    procurementSignals: trendSubsection(
      "Procurement memory",
      buildTrendProcurementItems({
        panelKeys: input.windowKeys,
        monthlyMarginPressure: input.monthlyMarginPressure,
        groups: input.groups,
        categoryPressure: input.categoryPressure,
        alerts: input.alerts,
      }),
    ),
    operationalRecommendation: trendSubsection(
      "Operational recommendation",
      buildTrendRecommendationItems({
        panelKeys: input.windowKeys,
        prioritizedInsights: input.prioritizedInsights,
        recoverySignals: input.groups.recoverySignals,
        monthlyMarginPressure: input.monthlyMarginPressure,
      }),
    ),
  };
}

/** Side-by-side trend synthesis for 90-day and 6-month windows — deterministic copy only. */
export function buildOperationalTrendsPanels(input: {
  operationalSynthesisGroups: OperationalSynthesisGroups;
  monthlyMarginPressure: MonthlyMarginPressureSummary;
  prioritizedInsights: PrioritizedOperationalInsight[];
  alerts: MarginAlertItem[];
  categoryPressure: SynthesizedCategoryPressureRow[];
  data: MarginAlertData;
  operationalWindows: OperationalWindow[];
}): OperationalTrendsPanels {
  const base = {
    groups: input.operationalSynthesisGroups,
    monthlyMarginPressure: input.monthlyMarginPressure,
    prioritizedInsights: input.prioritizedInsights,
    alerts: input.alerts,
    categoryPressure: input.categoryPressure,
    data: input.data,
    windows: input.operationalWindows,
  };

  return {
    last90Days: buildOperationalTrendPanel({
      ...base,
      label: "Last 90 days",
      windowKeys: ["last_30_days", "last_3_months"],
    }),
    last6Months: buildOperationalTrendPanel({
      ...base,
      label: "Last 6 months",
      windowKeys: ["last_30_days", "last_3_months", "last_6_months"],
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
}) {
  const windows = buildOperationalWindows();
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
    monthlyMarginPressure,
    prioritizedInsights,
    alerts: input.alerts,
    categoryPressure,
    data: input.data,
    operationalWindows: windows,
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
