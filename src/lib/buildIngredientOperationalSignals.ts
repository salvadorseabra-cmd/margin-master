import { formatPercent } from "@/lib/display-format";
import type { IngredientPriceActivity } from "@/lib/ingredient-detail-panel";
import { sortRecentPurchasesByDate } from "@/lib/ingredient-detail-panel";
import { purchaseComparablePrice, type RecentPurchaseRow } from "@/lib/ingredient-purchase-memory";
import type { PriceHistoryRecord } from "@/lib/margin-alert-data";

export type OperationalSignalCategory =
  | "pricing"
  | "recipe_exposure"
  | "supplier"
  | "confidence_staleness";

/** Insight tiers — higher tiers block lower ones in pickTopInsights. */
export type InsightPriorityTier =
  | "operational_risk"
  | "pricing"
  | "supplier"
  | "confidence";

export type OperationalMood = "CALM" | "WATCH" | "RISK" | "UNCERTAIN";

export type IngredientOperationalSignal = {
  id: string;
  category: OperationalSignalCategory;
  label: string;
  detail?: string;
  tone: "muted" | "caution" | "positive" | "negative";
  priority: number;
  tier: InsightPriorityTier;
};

export type OperationalSignalGroup = {
  category: OperationalSignalCategory;
  title: string;
  signals: IngredientOperationalSignal[];
};

export type IngredientOperationalSignalsInput = {
  ingredientId: string;
  ingredientName?: string | null;
  priceHistory?: readonly PriceHistoryRecord[];
  latestHistoryRow?: PriceHistoryRecord | null;
  recentPurchases?: readonly RecentPurchaseRow[];
  priceActivity?: IngredientPriceActivity | null;
  recipeCount?: number;
  recipeNames?: readonly string[];
  maxContributionPct?: number | null;
  primaryRecipeName?: string | null;
  volatileIngredientIds?: ReadonlySet<string>;
  lastPriceUpdateAt?: string | null;
  staleThresholdDays?: number;
  highestWindowDays?: number;
};

const DEFAULT_STALE_DAYS = 45;
const DEFAULT_HIGHEST_WINDOW_DAYS = 90;
const DEFAULT_VISIBLE_SIGNALS = 3;

const CATEGORY_TITLES: Record<OperationalSignalCategory, string> = {
  pricing: "Price",
  recipe_exposure: "On the menu",
  supplier: "Suppliers",
  confidence_staleness: "Data freshness",
};

const TIER_ORDER: readonly InsightPriorityTier[] = [
  "operational_risk",
  "pricing",
  "supplier",
  "confidence",
];

const TIER_BASE_SCORE: Record<InsightPriorityTier, number> = {
  operational_risk: 400,
  pricing: 300,
  supplier: 200,
  confidence: 100,
};

/** Combines tier floor with per-signal priority for stable ordering. */
export function scoreInsightPriority(tier: InsightPriorityTier, signalPriority: number): number {
  return TIER_BASE_SCORE[tier] + signalPriority;
}

export function signalInsightTier(signal: Pick<IngredientOperationalSignal, "id" | "category">): InsightPriorityTier {
  if (
    signal.id === "margin-exposure" ||
    signal.id === "primary-cost-driver" ||
    signal.id === "stale-invoice"
  ) {
    return "operational_risk";
  }
  if (signal.category === "pricing") return "pricing";
  if (signal.category === "supplier") return "supplier";
  if (signal.category === "recipe_exposure") return "operational_risk";
  return "confidence";
}

/**
 * Returns up to `max` items from the highest non-empty tier only; lower tiers appear
 * when every higher tier has no candidates.
 */
export function pickTopInsights<T extends { priority: number; tier: InsightPriorityTier }>(
  items: readonly T[],
  max = 3,
): T[] {
  if (items.length === 0 || max <= 0) return [];

  const byTier = new Map<InsightPriorityTier, T[]>();
  for (const item of items) {
    const list = byTier.get(item.tier) ?? [];
    list.push(item);
    byTier.set(item.tier, list);
  }

  for (const tier of TIER_ORDER) {
    const bucket = byTier.get(tier);
    if (!bucket?.length) continue;
    const sorted = [...bucket].sort(
      (a, b) => scoreInsightPriority(b.tier, b.priority) - scoreInsightPriority(a.tier, a.priority),
    );
    return sorted.slice(0, max);
  }

  return [];
}

export type OperationalMoodContext = {
  signals?: readonly IngredientOperationalSignal[];
  recipeCount?: number;
  marginExposureScore?: number | null;
  recentPurchaseCount?: number;
  hasStalePricing?: boolean;
};

export function deriveOperationalMood(context: OperationalMoodContext): OperationalMood {
  const signals = context.signals ?? [];
  const recipeCount = context.recipeCount ?? 0;
  const purchases = context.recentPurchaseCount ?? 0;
  const exposure = context.marginExposureScore;

  const hasNegative = signals.some((s) => s.tone === "negative");
  const hasCaution = signals.some((s) => s.tone === "caution");
  const priceUp = signals.some(
    (s) => s.category === "pricing" && (s.tone === "negative" || s.tone === "caution"),
  );

  if (
    hasNegative ||
    (priceUp && recipeCount >= 2) ||
    (exposure != null && exposure >= 65) ||
    (context.hasStalePricing && recipeCount > 0)
  ) {
    return "RISK";
  }

  if (purchases === 0 && recipeCount > 0 && !signals.some((s) => s.category === "pricing")) {
    return "UNCERTAIN";
  }

  if (hasCaution || priceUp || (exposure != null && exposure >= 40)) {
    return "WATCH";
  }

  if (signals.length === 0 && purchases === 0) {
    return "UNCERTAIN";
  }

  return "CALM";
}

const MOOD_SUMMARY: Record<OperationalMood, string> = {
  CALM: "Costs look steady",
  WATCH: "Worth a look before the next order",
  RISK: "Menu cost may be affected",
  UNCERTAIN: "Limited purchase data on file",
};

export function formatOperationalMoodLine(mood: OperationalMood): string {
  return MOOD_SUMMARY[mood];
}

export function operationalMoodToneClass(mood: OperationalMood): string {
  switch (mood) {
    case "RISK":
      return "text-destructive/75";
    case "WATCH":
      return "text-warning-foreground/80";
    case "UNCERTAIN":
      return "text-muted-foreground/80";
    default:
      return "text-muted-foreground/70";
  }
}

function numberOrNull(value: number | null | undefined): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** Parses ISO timestamps and pt-PT `dd/mm/yyyy` purchase labels for staleness checks. */
export function parseOperationalRecencyDate(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const isoCandidate = trimmed.includes("T") ? trimmed : `${trimmed}T12:00:00.000Z`;
  const isoParsed = new Date(isoCandidate).getTime();
  if (Number.isFinite(isoParsed)) return isoParsed;

  const ptMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (ptMatch) {
    const [, day, month, year] = ptMatch;
    const ptParsed = new Date(
      `${year}-${month!.padStart(2, "0")}-${day!.padStart(2, "0")}T12:00:00.000Z`,
    ).getTime();
    if (Number.isFinite(ptParsed)) return ptParsed;
  }

  return null;
}

function daysSince(value: string): number {
  const timestamp = parseOperationalRecencyDate(value);
  if (timestamp == null) return DEFAULT_STALE_DAYS;
  return Math.max(0, Math.floor((Date.now() - timestamp) / 86_400_000));
}

function purchasePrices(purchases: readonly RecentPurchaseRow[]): number[] {
  return purchases
    .map((row) => purchaseComparablePrice(row))
    .filter((price): price is number => price != null);
}

function historyPercent(row: PriceHistoryRecord): number | null {
  const explicit = numberOrNull(row.delta_percent);
  if (explicit !== null) return explicit;
  const current = numberOrNull(row.new_price);
  const previous = numberOrNull(row.previous_price);
  if (current === null || previous === null || previous <= 0) return null;
  return ((current - previous) / previous) * 100;
}

function formatSignedPercent(pct: number): string {
  if (Math.abs(pct) < 0.5) return "0%";
  const sign = pct > 0 ? "+" : "";
  return `${sign}${Math.round(pct)}%`;
}

function formatShortDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function displayIngredientName(name: string | null | undefined): string {
  const trimmed = name?.trim();
  return trimmed || "This ingredient";
}

function pushSignal(
  signals: IngredientOperationalSignal[],
  signal: Omit<IngredientOperationalSignal, "tier"> & { tier?: InsightPriorityTier },
): void {
  signals.push({
    ...signal,
    tier: signal.tier ?? signalInsightTier(signal),
  });
}

function costChangeLabel(
  ingredientName: string | null | undefined,
  pct: number,
  sincePhrase: string,
): string {
  const name = displayIngredientName(ingredientName);
  const rounded = Math.abs(Math.round(pct));
  if (rounded < 1) return `${name} cost is about flat ${sincePhrase}`;
  if (pct > 0) return `${name} cost increased ${rounded}% ${sincePhrase}`;
  return `${name} cost decreased ${rounded}% ${sincePhrase}`;
}

function uniqueSupplierLabels(purchases: readonly RecentPurchaseRow[]): string[] {
  const seen = new Set<string>();
  const labels: string[] = [];
  for (const row of purchases) {
    const label = row.supplierLabel.trim();
    if (!label || seen.has(label.toLowerCase())) continue;
    seen.add(label.toLowerCase());
    labels.push(label);
  }
  return labels;
}

function hasMeaningfulPurchaseVolatility(purchases: readonly RecentPurchaseRow[]): boolean {
  const prices = purchasePrices(purchases);
  if (prices.length < 2) return false;
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  if (min <= 0) return max - min >= 0.1;
  return (max - min) / min >= 0.1;
}

function hasSupplierPriceVariation(purchases: readonly RecentPurchaseRow[]): boolean {
  const bySupplier = new Map<string, number[]>();
  for (const row of purchases) {
    const supplier = row.supplierLabel.trim();
    if (!supplier) continue;
    const price = purchaseComparablePrice(row);
    if (price == null) continue;
    const bucket = bySupplier.get(supplier) ?? [];
    bucket.push(price);
    bySupplier.set(supplier, bucket);
  }
  if (bySupplier.size < 2) return false;
  const averages = [...bySupplier.values()].map(
    (prices) => prices.reduce((sum, price) => sum + price, 0) / prices.length,
  );
  const min = Math.min(...averages);
  const max = Math.max(...averages);
  if (min <= 0) return max - min >= 0.1;
  return (max - min) / min >= 0.05;
}

/** Derives margin exposure 0–100 from recipe breadth, cost share, and price movement. */
export function deriveMarginExposureScore(input: {
  recipeCount?: number;
  maxContributionPct?: number | null;
  priceIncreasePct?: number | null;
}): number | null {
  const recipeCount = input.recipeCount ?? 0;
  const contribution = input.maxContributionPct;
  const priceUp = input.priceIncreasePct;
  if (recipeCount === 0 && contribution == null && priceUp == null) return null;

  let score = 0;
  if (recipeCount >= 5) score += 30;
  else if (recipeCount >= 3) score += 20;
  else if (recipeCount >= 1) score += 10;

  if (contribution != null) {
    if (contribution >= 70) score += 35;
    else if (contribution > 60) score += 25;
    else if (contribution >= 40) score += 10;
  }

  if (priceUp != null && priceUp > 10) score += 25;
  else if (priceUp != null && priceUp > 5) score += 10;

  return Math.min(100, score);
}

/**
 * Layered operational signals from existing loaders — returns [] when nothing is computable.
 */
export function buildIngredientOperationalSignals(
  input: IngredientOperationalSignalsInput,
): IngredientOperationalSignal[] {
  const signals: IngredientOperationalSignal[] = [];
  const staleDays = input.staleThresholdDays ?? DEFAULT_STALE_DAYS;
  const highestWindowDays = input.highestWindowDays ?? DEFAULT_HIGHEST_WINDOW_DAYS;
  const recipeCount = input.recipeCount ?? 0;
  const purchases = input.recentPurchases ?? [];
  const sortedPurchases = sortRecentPurchasesByDate(purchases);

  let priceIncreasePct: number | null = null;

  const ingredientName = input.ingredientName;
  const latestHistory = input.latestHistoryRow;
  if (latestHistory) {
    const pct = historyPercent(latestHistory);
    if (pct != null && pct > 0) {
      priceIncreasePct = pct;
      pushSignal(signals, {
        id: "price-vs-previous",
        category: "pricing",
        label: costChangeLabel(ingredientName, pct, "since your last invoice"),
        detail: latestHistory.supplier_name?.trim()
          ? `Latest buy from ${latestHistory.supplier_name.trim()}.`
          : undefined,
        tone: pct >= 10 ? "negative" : "caution",
        priority: 95,
        tier: "pricing",
      });
    } else if (pct != null && pct < 0) {
      pushSignal(signals, {
        id: "price-vs-previous",
        category: "pricing",
        label: costChangeLabel(ingredientName, pct, "since your last invoice"),
        tone: "positive",
        priority: 70,
        tier: "pricing",
      });
    }
  } else if (sortedPurchases.length >= 2) {
    const latest = purchaseComparablePrice(sortedPurchases[0]!);
    const prior = purchaseComparablePrice(sortedPurchases[1]!);
    if (latest != null && prior != null && prior > 0) {
      const pct = ((latest - prior) / prior) * 100;
      if (Math.abs(pct) >= 3) {
        priceIncreasePct = pct > 0 ? pct : null;
        pushSignal(signals, {
          id: "price-vs-previous",
          category: "pricing",
          label: costChangeLabel(ingredientName, pct, "since your last invoice"),
          detail: sortedPurchases[1]!.supplierLabel.trim()
            ? `Previous buy was from ${sortedPurchases[1]!.supplierLabel.trim()}.`
            : undefined,
          tone: pct > 0 ? (pct >= 10 ? "negative" : "caution") : "positive",
          priority: 90,
          tier: "pricing",
        });
      }
    }
  }

  const history = input.priceHistory ?? [];
  if (history.length > 0) {
    const sinceMs = Date.now() - highestWindowDays * 86_400_000;
    const windowRows = history.filter(
      (row) =>
        row.ingredient_id === input.ingredientId &&
        new Date(row.created_at).getTime() >= sinceMs,
    );
    const prices = windowRows
      .map((row) => numberOrNull(row.new_price))
      .filter((price): price is number => price != null);
    const latestPrice =
      numberOrNull(latestHistory?.new_price) ??
      (sortedPurchases[0] ? purchaseComparablePrice(sortedPurchases[0]) : null);
    if (prices.length >= 2 && latestPrice != null && latestPrice >= Math.max(...prices) - 0.001) {
      pushSignal(signals, {
        id: "highest-in-window",
        category: "pricing",
        label: `Paying a ${highestWindowDays}-day high`,
        tone: "caution",
        priority: 85,
        tier: "pricing",
      });
    }
  }

  const activity = input.priceActivity;
  if (
    activity?.created_at &&
    typeof activity.delta_percent === "number" &&
    Math.abs(activity.delta_percent) >= 5
  ) {
    const since = formatShortDate(activity.created_at);
    const pct = activity.delta_percent;
    const sincePhrase = since ? `since ${since}` : "recently";
    pushSignal(signals, {
      id: "catalog-price-trend",
      category: "pricing",
      label: costChangeLabel(ingredientName, pct, sincePhrase),
      tone: pct > 0 ? "caution" : "positive",
      priority: 80,
      tier: "pricing",
    });
  }

  const hasPricingRisk = priceIncreasePct != null && priceIncreasePct >= 5;
  if (recipeCount >= 3 || (recipeCount >= 2 && hasPricingRisk)) {
    pushSignal(signals, {
      id: "recipe-impact",
      category: "recipe_exposure",
      label:
        recipeCount === 1
          ? "On the menu in 1 recipe"
          : `On the menu in ${recipeCount} recipes`,
      detail:
        input.recipeNames && input.recipeNames.length > 0
          ? input.recipeNames.slice(0, 3).join(", ") +
            (input.recipeNames.length > 3 ? ` +${input.recipeNames.length - 3} more` : "")
          : undefined,
      tone: recipeCount >= 3 ? "caution" : "muted",
      priority: recipeCount >= 3 ? 78 : 72,
      tier: "operational_risk",
    });
  }

  const contribution = input.maxContributionPct;
  if (contribution != null && contribution > 60) {
    pushSignal(signals, {
      id: "primary-cost-driver",
      category: "recipe_exposure",
      label: input.primaryRecipeName
        ? `Drives most of ${input.primaryRecipeName}'s food cost`
        : "Drives most of a linked recipe's food cost",
      detail: input.primaryRecipeName
        ? `About ${formatPercent(contribution)} of that dish's cost`
        : `About ${formatPercent(contribution)} of food cost`,
      tone: contribution >= 70 ? "negative" : "caution",
      priority: 88,
      tier: "operational_risk",
    });
  }

  const exposureScore = deriveMarginExposureScore({
    recipeCount,
    maxContributionPct: contribution,
    priceIncreasePct,
  });
  if (exposureScore != null && exposureScore >= 55) {
    pushSignal(signals, {
      id: "margin-exposure",
      category: "recipe_exposure",
      label: "Higher exposure on your menu",
      detail:
        exposureScore >= 65
          ? "Several recipes and recent price movement — worth watching."
          : "Used across recipes with some recent price movement.",
      tone: exposureScore >= 65 ? "negative" : "caution",
      priority: 82,
      tier: "operational_risk",
    });
  }

  const suppliers = uniqueSupplierLabels(purchases);
  if (suppliers.length === 1 && purchases.length >= 2) {
    pushSignal(signals, {
      id: "single-supplier",
      category: "supplier",
      label: `All recent buys from ${suppliers[0]}`,
      tone: "muted",
      priority: 55,
      tier: "supplier",
    });
  } else if (suppliers.length >= 2 && hasSupplierPriceVariation(purchases)) {
    pushSignal(signals, {
      id: "supplier-variance",
      category: "supplier",
      label: "Prices differ across suppliers",
      detail: `${suppliers.length} suppliers on recent invoices — compare before reordering.`,
      tone: "caution",
      priority: 68,
      tier: "supplier",
    });
  }

  const isVolatile =
    input.volatileIngredientIds?.has(input.ingredientId) ||
    hasMeaningfulPurchaseVolatility(purchases);
  if (isVolatile && recipeCount >= 2) {
    pushSignal(signals, {
      id: "volatile-pricing",
      category: "supplier",
      label: "Unit cost has bounced around",
      detail: "Recent invoices show a wide spread — double-check the next order.",
      tone: "caution",
      priority: 74,
      tier: recipeCount >= 3 ? "operational_risk" : "supplier",
    });
  }

  const lastUpdate =
    input.lastPriceUpdateAt ??
    latestHistory?.created_at ??
    sortedPurchases[0]?.dateLabel ??
    null;
  if (lastUpdate) {
    const age = daysSince(lastUpdate);
    if (age >= staleDays) {
      pushSignal(signals, {
        id: "stale-invoice",
        category: "confidence_staleness",
        label: `No new invoice price in ${age} days`,
        detail:
          recipeCount > 0
            ? "Menu costs may be out of date until the next invoice lands."
            : "Upload a recent invoice to refresh cost.",
        tone: age >= staleDays * 2 ? "negative" : "caution",
        priority: 76,
        tier: recipeCount > 0 ? "operational_risk" : "confidence",
      });
    }
  } else if (recipeCount > 0 && purchases.length === 0 && !latestHistory) {
    pushSignal(signals, {
      id: "stale-invoice",
      category: "confidence_staleness",
      label: "No confirmed purchases yet",
      detail: "Menu costing may not reflect what you actually pay.",
      tone: "caution",
      priority: 60,
      tier: "confidence",
    });
  }

  return [...signals].sort((a, b) => b.priority - a.priority);
}

export function groupOperationalSignals(
  signals: readonly IngredientOperationalSignal[],
): OperationalSignalGroup[] {
  const order: OperationalSignalCategory[] = [
    "pricing",
    "recipe_exposure",
    "supplier",
    "confidence_staleness",
  ];
  const buckets = new Map<OperationalSignalCategory, IngredientOperationalSignal[]>();
  for (const signal of signals) {
    const list = buckets.get(signal.category) ?? [];
    list.push(signal);
    buckets.set(signal.category, list);
  }

  return order
    .filter((category) => (buckets.get(category)?.length ?? 0) > 0)
    .map((category) => ({
      category,
      title: CATEGORY_TITLES[category],
      signals: buckets.get(category) ?? [],
    }));
}

export function pickVisibleOperationalSignals(
  signals: readonly IngredientOperationalSignal[],
  expanded: boolean,
  defaultCount = DEFAULT_VISIBLE_SIGNALS,
): IngredientOperationalSignal[] {
  if (expanded || signals.length <= defaultCount) return [...signals];
  return signals.slice(0, defaultCount);
}

export function countHiddenOperationalSignals(
  signals: readonly IngredientOperationalSignal[],
  expanded: boolean,
  defaultCount = DEFAULT_VISIBLE_SIGNALS,
): number {
  if (expanded) return 0;
  return Math.max(0, signals.length - defaultCount);
}

/** Executive headline when a price trend is computable — otherwise undefined. */
export function formatIngredientOperationalHeadline(
  signals: readonly IngredientOperationalSignal[],
): string | undefined {
  const top = pickTopInsights(signals, 1);
  return top[0]?.label;
}

/** Summary signals for the detail panel — tier-gated, max 3. */
export function pickOperationalSummarySignals(
  signals: readonly IngredientOperationalSignal[],
  max = 3,
): IngredientOperationalSignal[] {
  return pickTopInsights(signals, max);
}
