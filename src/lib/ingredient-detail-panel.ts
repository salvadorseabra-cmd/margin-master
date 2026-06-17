import { formatCanonicalIngredientDisplayName } from "@/lib/canonical-ingredient-display-name";
import { formatCurrency, formatPercent, formatQuantityWithUnit } from "@/lib/display-format";
import { formatDisplayUnitCost } from "@/lib/display-unit-cost";
import { formatPackagedLiquidContextFromCostFields } from "@/lib/packaged-liquid-context";
import type { IngredientMergeCluster } from "@/lib/ingredient-merge-hooks";
import {
  isAliasOnlyOperationalDependency,
  isIngredientOperationallyOrphaned,
  type IngredientOrphanReport,
} from "@/lib/ingredient-orphan-detection";
import {
  effectiveIngredientUnitCostEur,
  inferIngredientCostBaseUnit,
  isOperationalPricingResolved,
  purchaseQuantityDenom,
  type IngredientCostFields,
} from "@/lib/ingredient-unit-cost";
import { formatPurchaseStructureSummary } from "@/lib/ingredient-operational-intelligence";
import { purchaseComparablePrice, type RecentPurchaseRow } from "@/lib/ingredient-purchase-memory";
import { parsePurchaseStructureFromText } from "@/lib/stock-normalization";
import {
  daysSinceRecency,
  derivePricingFreshnessSnapshot,
  formatCatalogConfirmationListExplanation,
  formatPricingFreshnessPositiveLine,
  formatPricingReviewPrimaryIssue,
  formatPricingReviewSecondaryContext,
  formatPricingRowExplanation,
  formatStaleReviewListExplanation,
  pricingFreshnessBadgeHint,
  pricingFreshnessBadgeLabel,
  STALE_REVIEW_THRESHOLD_DAYS,
  type PricingFreshnessLevel,
  type PricingFreshnessQueueMode,
  type PricingFreshnessSnapshot,
  type PricingRecencySource,
} from "@/lib/ingredient-pricing-freshness";
import type { OperationalListFilter } from "@/lib/operational-review-queue";
import type { IngredientPriceHistoryRow } from "@/lib/ingredient-price-history";
import type { Tables } from "@/integrations/supabase/types";

type IngredientRow = Pick<
  Tables<"ingredients">,
  "name" | "current_price" | "purchase_quantity" | "base_unit" | "unit" | "purchase_unit"
>;

export type IngredientPriceActivity = Pick<
  Tables<"ingredient_price_history">,
  "created_at" | "delta" | "delta_percent"
>;

export type IngredientInsightTone = "neutral" | "positive" | "caution" | "negative" | "info";

export type IngredientDetailInsightChip = {
  id: string;
  label: string;
  tone: IngredientInsightTone;
};

export type IngredientPurchaseInsightRow = {
  supplierLabel: string;
  priceLabel: string;
  dateLabel: string;
};

export type IngredientPurchaseInsights = {
  best: IngredientPurchaseInsightRow | null;
  worst: IngredientPurchaseInsightRow | null;
  showWorstPurchase: boolean;
};

export type IngredientDetailKpi = {
  label: string;
  value: string;
  hint?: string | null;
};

export type IngredientDeltaLine = {
  id: string;
  text: string;
  tone: IngredientInsightTone;
};

export type PurchaseTimelineLabel =
  | "best-purchase"
  | "highest-recorded"
  | "vs-previous-purchase"
  | "above-recent-average"
  | "supplier-switch";

export type IngredientCompactTrendState =
  | "stable"
  | "rising"
  | "improving"
  | "volatile"
  | "recently-increased";

const MAX_OPERATIONAL_INSIGHT_CHIPS = 3;

export type IngredientDetailSections = {
  showRecentPurchases: boolean;
  showRecipeImpact: boolean;
  showPriceHistory: boolean;
  showInsights: boolean;
  showPurchaseInsights: boolean;
  showSummaryNotes: boolean;
};

export function buildIngredientDetailSections(input: {
  recentPurchaseCount: number;
  recipeCount: number;
  priceHistoryReady: boolean;
  priceHistoryCount: number;
  insightCount: number;
  purchaseInsightReady: boolean;
  summaryNoteCount: number;
}): IngredientDetailSections {
  const showRecentPurchases = input.recentPurchaseCount > 0;
  const showRecipeImpact = input.recipeCount > 0;
  const showPriceHistory = input.priceHistoryReady && input.priceHistoryCount > 0;
  const showInsights = input.insightCount > 0;
  const showPurchaseInsights = input.purchaseInsightReady;
  const showSummaryNotes = input.summaryNoteCount > 0;
  return {
    showRecentPurchases,
    showRecipeImpact,
    showPriceHistory,
    showInsights,
    showPurchaseInsights,
    showSummaryNotes,
  };
}

/** Soft chip shell — muted fill; semantic color via dot and label tint only. */
export function insightChipClassName(tone: IngredientInsightTone): string {
  const shell = "border-border/45 bg-muted/12";
  switch (tone) {
    case "positive":
      return `${shell} text-success/80`;
    case "caution":
      return `${shell} text-warning/85`;
    case "negative":
      return `${shell} text-destructive/70`;
    case "info":
      return `${shell} text-primary/80`;
    default:
      return `${shell} text-muted-foreground`;
  }
}

/** Semantic status dot — softer reds; reserve strong red for strongest negatives. */
export function insightChipDotClassName(tone: IngredientInsightTone): string {
  switch (tone) {
    case "positive":
      return "bg-success/75";
    case "caution":
      return "bg-warning/80";
    case "negative":
      return "bg-destructive/55";
    case "info":
      return "bg-primary/70";
    default:
      return "bg-muted-foreground/45";
  }
}

export function compactTrendStateLabel(state: IngredientCompactTrendState): string {
  switch (state) {
    case "stable":
      return "Stable";
    case "rising":
      return "Rising";
    case "improving":
      return "Improving";
    case "volatile":
      return "Inconsistent";
    case "recently-increased":
      return "Recently increased";
  }
}

export function compactTrendStateTone(state: IngredientCompactTrendState): IngredientInsightTone {
  switch (state) {
    case "stable":
    case "improving":
      return "positive";
    case "volatile":
      return "caution";
    case "rising":
    case "recently-increased":
      return "negative";
  }
}

/** Compact trend from purchase memory and catalog activity — no new analytics. */
export function deriveIngredientCompactTrendState(input: {
  recentPurchases: readonly RecentPurchaseRow[];
  priceActivity?: IngredientPriceActivity | null;
}): IngredientCompactTrendState | null {
  const purchases = input.recentPurchases;
  if (purchases.length === 0) {
    const activity = input.priceActivity;
    if (activity?.created_at && isRecentIsoDate(activity.created_at, 14)) {
      const pct = activity.delta_percent;
      if (typeof pct === "number" && pct > 0) return "recently-increased";
      if (typeof pct === "number" && pct < 0) return "improving";
    }
    return null;
  }

  const volatile = hasMeaningfulPurchaseVolatility(purchases);
  if (volatile) return "volatile";

  const sorted = sortRecentPurchasesByDate(purchases);
  const current = sorted[0] ? purchaseComparablePrice(sorted[0]) : null;
  const prior = sorted.length >= 2 ? purchaseComparablePrice(sorted[1]!) : null;
  if (current != null && prior != null && current > prior * 1.03) {
    return "recently-increased";
  }

  const average = averagePurchasePrice(purchases);
  if (current != null && average != null && purchases.length >= 3) {
    if (current > average * 1.05) return "rising";
    if (current < average * 0.95) return "improving";
  }

  const lowest = lowestPurchasePrice(purchases);
  if (current != null && lowest != null && current > lowest + 0.001) {
    return "rising";
  }

  if (purchases.length >= 2 && isStableAcrossPurchases(purchases)) {
    return "stable";
  }

  const activity = input.priceActivity;
  if (activity?.created_at && isRecentIsoDate(activity.created_at, 14)) {
    const pct = activity.delta_percent;
    if (typeof pct === "number" && pct > 0) return "recently-increased";
    if (typeof pct === "number" && pct < 0) return "improving";
  }

  return purchases.length >= 2 ? "stable" : null;
}

/** Pack price (`current_price` on catalog row). */
export function formatIngredientPackPrice(ingredient: IngredientRow): string {
  const pack = Number(ingredient.current_price);
  return formatCurrency(Number.isFinite(pack) ? pack : 0);
}

/** Latest invoice line total for list/detail purchase columns. */
export function formatLastPaidTotalGlance(lastPaidTotal: number | null | undefined): string {
  if (lastPaidTotal == null || !Number.isFinite(lastPaidTotal)) return "—";
  return formatCurrency(lastPaidTotal);
}

export type IngredientOperationalCostLine = {
  label: string;
  value: string;
};

export type IngredientOperationalCostPresentation = {
  lines: IngredientOperationalCostLine[];
};

function formatIngredientPackMeasureLabel(
  size: number,
  unit: string,
): string {
  if (unit === "ml" && size >= 10 && size < 1000 && size % 10 === 0) {
    return `${size / 10}cl`;
  }
  return formatQuantityWithUnit(size, unit as "g" | "ml" | "un");
}

function inferCountableUnitNoun(
  ingredient: IngredientRow,
  count: number,
): string {
  const purchaseUnit = ingredient.purchase_unit?.trim().toLowerCase() ?? "";
  const name = ingredient.name?.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase() ?? "";

  if (/\b(garrafa|garrafas|bottle|bottles)\b/.test(name) || purchaseUnit.includes("garrafa") || purchaseUnit.includes("bottle")) {
    return count === 1 ? "bottle" : "bottles";
  }
  if (/\b(lata|latas|can|cans)\b/.test(name) || purchaseUnit.includes("lata") || purchaseUnit.includes("can")) {
    return count === 1 ? "can" : "cans";
  }
  if (purchaseUnit === "un" || purchaseUnit === "unit" || purchaseUnit === "units") {
    return count === 1 ? "unit" : "units";
  }
  if (purchaseUnit) return purchaseUnit;
  return count === 1 ? "unit" : "units";
}

function formatIngredientOperationalPackDetail(ingredient: IngredientRow): string | null {
  const structure = parsePurchaseStructureFromText(ingredient.name?.trim() ?? "");
  if (structure?.innerUnitCount != null && structure.innerUnitCount > 1 && structure.unitSize != null) {
    const sizeLabel = formatIngredientPackMeasureLabel(
      structure.unitSize,
      structure.unitMeasurement,
    );
    return `Pack ${structure.innerUnitCount} x ${sizeLabel}`;
  }

  const summary = formatPurchaseStructureSummary(structure);
  if (summary) return summary;

  const purchaseUnit = ingredient.purchase_unit?.trim();
  const purchaseQty = purchaseQuantityDenom(ingredient.purchase_quantity);
  if (purchaseUnit && purchaseQty > 1) {
    return `Pack ${purchaseQty} ${purchaseUnit}`;
  }
  if (purchaseQty > 1) {
    return `Pack ${purchaseQty}`;
  }
  return null;
}

/** Normalized operational costs from catalog costing fields (presentation only). */
export function buildIngredientOperationalCostPresentation(
  ingredient: IngredientRow,
): IngredientOperationalCostPresentation | null {
  if (!isOperationalPricingResolved(ingredient)) return null;

  const lines: IngredientOperationalCostLine[] = [];
  const packDetail = formatIngredientOperationalPackDetail(ingredient);
  if (packDetail) {
    lines.push({ label: "Pack", value: packDetail });
  }

  const purchaseQty = purchaseQuantityDenom(ingredient.purchase_quantity);
  const purchaseUnit = ingredient.purchase_unit?.trim();
  if (purchaseUnit) {
    lines.push({
      label: "Quantity purchased",
      value: `${purchaseQty} ${purchaseUnit}`,
    });
  } else if (purchaseQty > 1) {
    lines.push({
      label: "Quantity purchased",
      value: String(purchaseQty),
    });
  }

  const structure = parsePurchaseStructureFromText(ingredient.name?.trim() ?? "");
  if (structure?.totalUsableAmount != null && structure.usableUnit) {
    lines.push({
      label: "Usable quantity",
      value: formatQuantityWithUnit(structure.totalUsableAmount, structure.usableUnit),
    });
  } else {
    const baseUnit = inferIngredientCostBaseUnit(ingredient);
    if ((baseUnit === "g" || baseUnit === "ml") && purchaseQty > 0) {
      lines.push({
        label: "Usable quantity",
        value: formatQuantityWithUnit(purchaseQty, baseUnit),
      });
    }
  }

  const baseUnit = inferIngredientCostBaseUnit(ingredient);
  const unitCost = effectiveIngredientUnitCostEur(ingredient);
  const packPrice = Number(ingredient.current_price);

  const pieceCount =
    structure?.innerUnitCount != null && structure.innerUnitCount > 1
      ? structure.innerUnitCount
      : baseUnit === "un"
        ? purchaseQty
        : null;

  if (pieceCount != null && pieceCount > 1 && Number.isFinite(packPrice) && packPrice > 0) {
    const noun = inferCountableUnitNoun(ingredient, pieceCount).replace(/s$/, "");
    lines.push({
      label: `Cost per ${noun}`,
      value: formatCurrency(packPrice / pieceCount),
    });
  } else if (baseUnit === "un") {
    lines.push({
      label: "Cost per unit",
      value: formatDisplayUnitCost(unitCost, "un").formattedLabel,
    });
  }

  if (baseUnit === "g") {
    lines.push({
      label: "Cost per kg",
      value: formatDisplayUnitCost(unitCost, "g").formattedLabel,
    });
  }

  if (baseUnit === "ml") {
    lines.push({
      label: "Cost per litre",
      value: formatDisplayUnitCost(unitCost, "ml").formattedLabel,
    });
  }

  return lines.length > 0 ? { lines } : null;
}

/** Compact unit cost for KPI tile. */
export function formatIngredientUnitCostKpi(ingredient: IngredientRow): string {
  const internalBase = inferIngredientCostBaseUnit(ingredient);
  return formatDisplayUnitCost(effectiveIngredientUnitCostEur(ingredient), internalBase)
    .formattedLabel;
}

export function formatRecipesLinkedKpi(recipeCount: number): string {
  if (recipeCount <= 0) return "—";
  return String(recipeCount);
}

export function formatLastPurchaseDateKpi(purchases: readonly RecentPurchaseRow[]): string {
  const latest = purchases[0];
  if (!latest?.dateLabel?.trim()) return "—";
  const parsed = parsePurchaseDateLabel(latest.dateLabel);
  if (parsed) {
    return parsed.toLocaleDateString("pt-PT", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  }
  return formatShortPurchaseDate(latest.dateLabel);
}

export function formatIngredientPackagedLiquidSubtitle(
  costFields: IngredientCostFields | null | undefined,
): string | null {
  return formatPackagedLiquidContextFromCostFields(costFields);
}

export function buildIngredientDetailKpis(input: {
  ingredient: IngredientRow;
  recipeCount: number;
  recentPurchases: readonly RecentPurchaseRow[];
  costFields?: IngredientCostFields | null;
}): IngredientDetailKpi[] {
  const packagedLiquidHint = formatIngredientPackagedLiquidSubtitle(input.costFields);
  return [
    { label: "Pack price", value: formatIngredientPackPrice(input.ingredient) },
    {
      label: "Unit cost",
      value: formatIngredientUnitCostKpi(input.ingredient),
      hint: packagedLiquidHint,
    },
    { label: "Recipes linked", value: formatRecipesLinkedKpi(input.recipeCount) },
    {
      label: "Last purchase",
      value: formatLastPurchaseDateKpi(input.recentPurchases),
    },
  ];
}

/** €/base unit, plus €/g when the base unit is mass-based. */
export function formatIngredientCostHeaderLine(
  ingredient: IngredientRow,
  costFields?: IngredientCostFields | null,
): string {
  const primary = formatIngredientUnitCostKpi(ingredient);
  const packContext = formatIngredientPackagedLiquidSubtitle(costFields);
  if (!packContext) return primary;
  return `${primary} · ${packContext}`;
}

export function formatRecentPurchaseLine(purchase: RecentPurchaseRow): string {
  const date = formatShortPurchaseDate(purchase.dateLabel);
  return `${purchase.supplierLabel} ${purchase.priceLabel} — ${date}`;
}

export function formatShortPurchaseDate(value: string): string {
  if (!value?.trim()) return "—";
  const parsed = parsePurchaseDateLabel(value);
  if (parsed) {
    return parsed.toLocaleDateString("pt-PT", { day: "2-digit", month: "2-digit" });
  }
  const slash = value.match(/(\d{1,2})[/.-](\d{1,2})/);
  if (slash) return `${slash[1]!.padStart(2, "0")}/${slash[2]!.padStart(2, "0")}`;
  return value;
}

export function formatPurchaseTimelineDate(purchase: RecentPurchaseRow): string {
  return formatShortPurchaseDate(purchase.dateLabel);
}

function formatPurchaseTimelineMonthDayLabel(date: Date): string {
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

/** Compact month-day for purchase history rows (e.g. "18 May"). */
export function formatPurchaseTimelineMonthDay(value: string): string {
  const trimmed = value?.trim();
  if (!trimmed) return "—";

  const iso = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    const direct = new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]), 12, 0, 0);
    if (!Number.isNaN(direct.getTime())) {
      return formatPurchaseTimelineMonthDayLabel(direct);
    }
  }

  const twoPart = trimmed.match(/^(\d{1,2})[/.-](\d{1,2})$/);
  if (twoPart) {
    const day = Number(twoPart[1]);
    const month = Number(twoPart[2]) - 1;
    const assumed = new Date(new Date().getFullYear(), month, day, 12, 0, 0);
    if (!Number.isNaN(assumed.getTime())) {
      return formatPurchaseTimelineMonthDayLabel(assumed);
    }
  }

  const parsed = parsePurchaseDateLabel(trimmed);
  if (parsed) {
    return formatPurchaseTimelineMonthDayLabel(parsed);
  }
  return formatShortPurchaseDate(trimmed);
}

/** Single-line purchase row: `Supplier · 18 May · €7.80`. */
export function formatPurchaseHistoryRowLine(purchase: RecentPurchaseRow): string {
  const date = formatPurchaseTimelineMonthDay(purchase.dateLabel);
  const parts = [purchase.supplierLabel.trim(), date, purchase.priceLabel.trim()].filter(
    (part) => part.length > 0 && part !== "—",
  );
  return parts.join(" · ");
}

/** Primary supplier line for stacked purchase history rows. */
export function formatPurchaseHistorySupplierLine(purchase: RecentPurchaseRow): string {
  const label = purchase.supplierLabel.trim();
  return label.length > 0 ? label : "Unknown supplier";
}

export function formatPurchaseHistoryEntryDate(purchase: RecentPurchaseRow): string {
  return formatPurchaseTimelineMonthDay(purchase.dateLabel);
}

export function formatPurchaseHistoryEntryPrice(purchase: RecentPurchaseRow): string {
  return purchase.priceLabel.trim();
}

/** Secondary `date · price` line for stacked purchase history rows. */
export function formatPurchaseHistoryDatePriceLine(purchase: RecentPurchaseRow): string {
  const date = formatPurchaseHistoryEntryDate(purchase);
  const price = formatPurchaseHistoryEntryPrice(purchase);
  const parts = [date, price].filter((part) => part.length > 0 && part !== "—");
  return parts.join(" · ");
}

export function purchaseHistoryPriceTextClassName(
  itemId: string,
  purchases: readonly RecentPurchaseRow[],
): string {
  const cheapestId = findCheapestPurchaseItemId(purchases);
  const priciestId = findMostExpensivePurchaseItemId(purchases);
  if (cheapestId != null && itemId === cheapestId) {
    return priciestId === cheapestId ? "text-foreground/85" : "text-success/80";
  }
  if (priciestId != null && itemId === priciestId && priciestId !== cheapestId) {
    return "text-destructive/80";
  }
  return "text-muted-foreground/75";
}

/** @deprecated Prefer stacked rows with {@link purchaseHistoryPriceTextClassName}. */
export function purchaseHistoryRowTextClassName(
  itemId: string,
  purchases: readonly RecentPurchaseRow[],
): string {
  return purchaseHistoryPriceTextClassName(itemId, purchases);
}

/** Optional catalog subline under a purchase row. */
export function formatPurchaseHistoryCatalogLine(purchase: RecentPurchaseRow): string | null {
  const hint = formatPurchaseProductHint(purchase);
  if (!hint) return null;
  return `catalog: ${hint}`;
}

export type MatchCatalogIntelligenceInput = {
  aliasCount: number;
  duplicateCandidateCount: number;
  pricingSnapshot: PricingFreshnessSnapshot | null;
  listReviewMode?: OperationalListFilter | null;
};

/** Terse match/catalog lines for the intelligence panel (possible rows only). */
export function buildMatchCatalogIntelligenceLines(input: MatchCatalogIntelligenceInput): string[] {
  const lines: string[] = [];

  if (input.aliasCount > 0) {
    lines.push(
      input.aliasCount === 1 ? "1 alias detected" : `${input.aliasCount} aliases detected`,
    );
  }

  if (input.duplicateCandidateCount > 1) {
    const others = input.duplicateCandidateCount - 1;
    lines.push(others === 1 ? "1 duplicate candidate" : `${others} duplicate candidates`);
  }

  const snap = input.pricingSnapshot;
  if (snap && input.listReviewMode) {
    if (input.listReviewMode === "catalog-confirmation") {
      lines.push(formatCatalogConfirmationListExplanation(snap));
    } else if (input.listReviewMode === "stale-prices") {
      if (!snap.recencyAt) {
        lines.push(`No confirmed purchase in ${STALE_REVIEW_THRESHOLD_DAYS}+ days`);
      } else if (snap.daysSince != null) {
        lines.push(`No confirmed purchase in ${snap.daysSince} days`);
      } else {
        lines.push(formatStaleReviewListExplanation(snap));
      }
    }
  }

  return lines;
}

/** Single inline context line — alias / duplicate signals without a section header. */
export function formatIngredientWorkspaceMatchLine(
  input: MatchCatalogIntelligenceInput,
): string | null {
  const lines = buildMatchCatalogIntelligenceLines(input);
  if (lines.length === 0) return null;
  return lines.join(" · ");
}

export function buildPanelOperationalNotes(input: {
  deltaLines: readonly IngredientDeltaLine[];
  reviewLines: readonly IngredientDeltaLine[];
  recipeCount: number;
  latestPurchaseDate: string | null;
  duplicateClusterSize: number;
  catalogConfirmationPending: boolean;
  inListReview: boolean;
}): string[] {
  const notes: string[] = [];
  const seen = new Set<string>();

  const push = (text: string) => {
    const key = text.trim().toLowerCase();
    if (!key || seen.has(key)) return;
    seen.add(key);
    notes.push(text);
  };

  const sourceLines = input.inListReview ? input.reviewLines : input.deltaLines;
  for (const line of sourceLines) {
    const text = line.text.trim();
    if (!text) continue;
    if (/trending high|pack price increased|supplier changed|best-value supplier shifted/i.test(text)) {
      continue;
    }
    if (/inconsistent|volatile|stable pricing/i.test(text)) {
      continue;
    }
    push(text);
  }

  return notes.slice(0, 5);
}

export function formatPurchaseProductHint(
  purchase: RecentPurchaseRow,
  maxLength = 48,
): string | null {
  const hint = purchase.productHint?.trim();
  if (!hint) return null;
  if (hint.length <= maxLength) return hint;
  return `${hint.slice(0, maxLength - 1).trim()}…`;
}

export function findCheapestPurchaseItemId(purchases: readonly RecentPurchaseRow[]): string | null {
  let bestId: string | null = null;
  let bestPrice: number | null = null;
  for (const row of purchases) {
    const price = purchaseComparablePrice(row);
    if (price == null) continue;
    if (bestPrice == null || price < bestPrice) {
      bestPrice = price;
      bestId = row.itemId;
    }
  }
  return bestId;
}

export function findMostExpensivePurchaseItemId(
  purchases: readonly RecentPurchaseRow[],
): string | null {
  let worstId: string | null = null;
  let worstPrice: number | null = null;
  for (const row of purchases) {
    const price = purchaseComparablePrice(row);
    if (price == null) continue;
    if (worstPrice == null || price > worstPrice) {
      worstPrice = price;
      worstId = row.itemId;
    }
  }
  return worstId;
}

/** Timeline row dot — reuses insight chip semantic colors. */
export function purchaseRowDotClassName(
  itemId: string,
  purchases: readonly RecentPurchaseRow[],
): string {
  const cheapestId = findCheapestPurchaseItemId(purchases);
  const priciestId = findMostExpensivePurchaseItemId(purchases);
  if (cheapestId == null && priciestId == null) {
    return "bg-border";
  }
  if (cheapestId === priciestId) {
    return itemId === cheapestId ? insightChipDotClassName("neutral") : "bg-border";
  }
  if (itemId === cheapestId) return insightChipDotClassName("positive");
  if (itemId === priciestId) return insightChipDotClassName("negative");
  return "bg-border";
}

export function purchasePriceExtentsDiffer(purchases: readonly RecentPurchaseRow[]): boolean {
  const cheapestId = findCheapestPurchaseItemId(purchases);
  const priciestId = findMostExpensivePurchaseItemId(purchases);
  return cheapestId != null && priciestId != null && cheapestId !== priciestId;
}

export function buildRecipeImpactLabel(
  recipeCount: number,
  recipeNames: readonly string[],
): string | null {
  if (recipeCount <= 0) return null;
  if (recipeCount === 1) {
    const name = recipeNames[0]?.trim();
    return name ? `Used in: ${name}` : "Used in 1 recipe";
  }
  if (recipeCount <= 3 && recipeNames.length > 0) {
    const listed = recipeNames.slice(0, recipeCount).filter(Boolean).join(", ");
    if (listed) return `Used in: ${listed}`;
  }
  return `Used in ${recipeCount} recipes`;
}

export function formatLastPurchaseAgo(purchases: readonly RecentPurchaseRow[]): string | null {
  const latest = purchases[0];
  if (!latest?.dateLabel?.trim()) return null;
  const parsed = parsePurchaseDateLabel(latest.dateLabel);
  if (!parsed) return null;

  const ageMs = Date.now() - parsed.getTime();
  if (ageMs < 0) return null;
  const days = Math.floor(ageMs / (24 * 60 * 60 * 1000));
  if (days <= 0) return "Last purchase today";
  if (days === 1) return "Last purchase yesterday";
  if (days < 14) return `Last purchase ${days} days ago`;
  if (days < 60) {
    const weeks = Math.floor(days / 7);
    return `Last purchase ${weeks} ${weeks === 1 ? "week" : "weeks"} ago`;
  }
  const months = Math.floor(days / 30);
  if (months < 12) {
    return `Last purchase ${months} ${months === 1 ? "month" : "months"} ago`;
  }
  return `Last purchase ${parsed.toLocaleDateString("pt-PT", { month: "short", year: "numeric" })}`;
}

export function sortRecentPurchasesByDate(
  purchases: readonly RecentPurchaseRow[],
): RecentPurchaseRow[] {
  return [...purchases].sort((a, b) => {
    const left = parsePurchaseSortKey(a.dateLabel);
    const right = parsePurchaseSortKey(b.dateLabel);
    return right - left;
  });
}

function parsePurchaseSortKey(value: string): number {
  const parsed = parsePurchaseDateLabel(value);
  return parsed ? parsed.getTime() : 0;
}

function parsePurchaseDateLabel(value: string): Date | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  if (trimmed.includes("T")) {
    const direct = new Date(trimmed);
    return Number.isNaN(direct.getTime()) ? null : direct;
  }
  const slash = trimmed.match(/(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/);
  if (slash) {
    const day = Number(slash[1]);
    const month = Number(slash[2]) - 1;
    let year = Number(slash[3]);
    if (year < 100) year += 2000;
    const d = new Date(year, month, day, 12, 0, 0);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const parsed = new Date(`${trimmed}T12:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

const STABLE_PRICE_DAYS = 60;

function daysSincePurchaseDate(value: string): number | null {
  const parsed = parsePurchaseDateLabel(value);
  if (!parsed) return null;
  const ageMs = Date.now() - parsed.getTime();
  if (ageMs < 0) return null;
  return Math.floor(ageMs / (24 * 60 * 60 * 1000));
}

function purchasePrices(purchases: readonly RecentPurchaseRow[]): number[] {
  return purchases
    .map((row) => purchaseComparablePrice(row))
    .filter((price): price is number => price != null);
}

function averagePurchasePrice(purchases: readonly RecentPurchaseRow[]): number | null {
  const prices = purchasePrices(purchases);
  if (prices.length === 0) return null;
  return prices.reduce((sum, price) => sum + price, 0) / prices.length;
}

function latestPurchasePrice(purchases: readonly RecentPurchaseRow[]): number | null {
  const sorted = sortRecentPurchasesByDate(purchases);
  const latest = sorted[0];
  if (!latest) return null;
  return purchaseComparablePrice(latest);
}

function lowestPurchasePrice(purchases: readonly RecentPurchaseRow[]): number | null {
  const prices = purchasePrices(purchases);
  if (prices.length === 0) return null;
  return Math.min(...prices);
}

function formatDeltaPercent(current: number, baseline: number): string {
  const pct = Math.round(((current - baseline) / baseline) * 100);
  if (pct === 0) return "0%";
  return `${pct > 0 ? "+" : ""}${pct}%`;
}

function hasRecentSupplierSwitch(purchases: readonly RecentPurchaseRow[]): boolean {
  const sorted = sortRecentPurchasesByDate(purchases);
  if (sorted.length < 2) return false;
  const latest = sorted[0]!.supplierLabel.trim();
  const previous = sorted[1]!.supplierLabel.trim();
  return Boolean(latest && previous && latest !== previous);
}

/** Lightweight delta copy — executive wording, no duplicate % signals. */
export function buildIngredientDeltaIntelligence(input: {
  recentPurchases: readonly RecentPurchaseRow[];
  priceActivity?: IngredientPriceActivity | null;
}): IngredientDeltaLine[] {
  const lines: IngredientDeltaLine[] = [];
  const purchases = input.recentPurchases;
  const current = latestPurchasePrice(purchases);
  const lowest = lowestPurchasePrice(purchases);
  const average = averagePurchasePrice(purchases);
  const volatile = hasMeaningfulPurchaseVolatility(purchases);
  const aboveLowest = current != null && lowest != null && current > lowest + 0.001;
  const vsAverageSignificant =
    current != null &&
    average != null &&
    purchases.length >= 3 &&
    Math.abs(((current - average) / average) * 100) >= 5;

  if (aboveLowest) {
    lines.push({
      id: "trending-high",
      text: `Trending high (${formatDeltaPercent(current!, lowest!)} vs best purchase)`,
      tone: "caution",
    });
  } else if (current != null && lowest != null && Math.abs(current - lowest) < 0.001) {
    lines.push({
      id: "at-best",
      text: "At best historical purchase",
      tone: "positive",
    });
  } else if (
    vsAverageSignificant &&
    current != null &&
    average != null &&
    current > average &&
    !aboveLowest
  ) {
    lines.push({
      id: "above-average",
      text: "Above recent purchase average",
      tone: "caution",
    });
  } else if (vsAverageSignificant && current != null && average != null && current < average) {
    lines.push({
      id: "below-average",
      text: "Below recent purchase average",
      tone: "positive",
    });
  }

  const stable = purchases.length >= 2 && isStableAcrossPurchases(purchases) && !volatile;
  if (stable) {
    const latest = sortRecentPurchasesByDate(purchases)[0];
    const days = latest ? daysSincePurchaseDate(latest.dateLabel) : null;
    const span =
      days != null && days >= STABLE_PRICE_DAYS
        ? `${STABLE_PRICE_DAYS}+ days`
        : days != null && days >= 14
          ? `${days} days`
          : "recent purchases";
    lines.push({
      id: "price-stable-span",
      text: `Stable pricing · ${span}`,
      tone: "positive",
    });
  } else if (volatile) {
    lines.push({
      id: "volatile",
      text: "Inconsistent across recent purchases",
      tone: "caution",
    });
  }

  if (hasRecentSupplierSwitch(purchases)) {
    lines.push({
      id: "supplier-switch",
      text: "Supplier changed on latest purchase",
      tone: "info",
    });
  } else if (bestSupplierChangedRecently(purchases)) {
    lines.push({
      id: "best-supplier-shift",
      text: "Best-value supplier shifted",
      tone: "info",
    });
  }

  const activity = input.priceActivity;
  if (activity?.created_at && isRecentIsoDate(activity.created_at, 14)) {
    const pct = activity.delta_percent;
    if (typeof pct === "number" && pct !== 0) {
      lines.push({
        id: "catalog-change",
        text:
          pct > 0
            ? `Pack price increased ${formatPercent(pct, { signDisplay: "always" })} in last 14 days`
            : `Pack price decreased ${formatPercent(Math.abs(pct), { signDisplay: "never" })} in last 14 days`,
        tone: pct > 0 ? "negative" : "positive",
      });
    }
  }

  return lines.slice(0, 4);
}

function isRecentIsoDate(value: string | null | undefined, days: number): boolean {
  if (!value) return false;
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return false;
  const ageMs = Date.now() - timestamp;
  return ageMs >= 0 && ageMs <= days * 86_400_000;
}

const PURCHASE_LABELS_FORBIDDEN_BY_QUEUE: Record<
  OperationalListFilter,
  ReadonlySet<PurchaseTimelineLabel>
> = {
  duplicates: new Set([
    "best-purchase",
    "highest-recorded",
    "vs-previous-purchase",
    "above-recent-average",
    "supplier-switch",
  ]),
  unused: new Set([
    "best-purchase",
    "highest-recorded",
    "vs-previous-purchase",
    "above-recent-average",
    "supplier-switch",
  ]),
  "catalog-confirmation": new Set([
    "best-purchase",
    "highest-recorded",
    "vs-previous-purchase",
    "above-recent-average",
  ]),
  "stale-prices": new Set(["supplier-switch"]),
};

/** Labels for purchase timeline rows (best, highest, spike, supplier switch). */
export function derivePurchaseTimelineLabels(
  purchase: RecentPurchaseRow,
  index: number,
  purchases: readonly RecentPurchaseRow[],
  options?: { listReviewMode?: OperationalListFilter | null },
): PurchaseTimelineLabel[] {
  const labels: PurchaseTimelineLabel[] = [];
  const sorted = sortRecentPurchasesByDate(purchases);
  const cheapestId = findCheapestPurchaseItemId(sorted);
  const priciestId = findMostExpensivePurchaseItemId(sorted);
  const showExtents = purchasePriceExtentsDiffer(sorted);

  if (showExtents && purchase.itemId === cheapestId) {
    labels.push("best-purchase");
  }
  if (showExtents && purchase.itemId === priciestId) {
    labels.push("highest-recorded");
  }

  if (index === 0 && sorted.length >= 2) {
    const current = purchaseComparablePrice(purchase);
    const prior = purchaseComparablePrice(sorted[1]!);
    if (current != null && prior != null && current > prior * 1.03) {
      labels.push("vs-previous-purchase");
    }
    const average = averagePurchasePrice(sorted);
    if (current != null && average != null && current > average * 1.03) {
      labels.push("above-recent-average");
    }
    const latestSupplier = purchase.supplierLabel.trim();
    const priorSupplier = sorted[1]!.supplierLabel.trim();
    if (latestSupplier && priorSupplier && latestSupplier !== priorSupplier) {
      labels.push("supplier-switch");
    }
  }

  const mode = options?.listReviewMode;
  if (!mode) return labels;
  const forbidden = PURCHASE_LABELS_FORBIDDEN_BY_QUEUE[mode];
  return labels.filter((label) => !forbidden.has(label));
}

export function purchaseTimelineLabelText(
  label: PurchaseTimelineLabel,
  purchase?: RecentPurchaseRow,
  purchases?: readonly RecentPurchaseRow[],
): string {
  switch (label) {
    case "best-purchase":
      return "Best recorded purchase";
    case "highest-recorded":
      return "Highest recorded purchase";
    case "vs-previous-purchase": {
      if (!purchase || !purchases || purchases.length < 2) return "Higher than previous purchase";
      const sorted = sortRecentPurchasesByDate(purchases);
      const current = purchaseComparablePrice(purchase);
      const prior = purchaseComparablePrice(sorted[1]!);
      if (current == null || prior == null || prior <= 0) return "Higher than previous purchase";
      const pct = Math.round(((current - prior) / prior) * 100);
      return `↑ ${pct}% vs previous purchase`;
    }
    case "above-recent-average":
      return "Higher than recent average";
    case "supplier-switch":
      return "Supplier switch";
  }
}

/** Operational insight chips — max 3, no duplicate of cost intelligence lines. */
export function buildOperationalInsights(input: {
  recentPurchases: readonly RecentPurchaseRow[];
  recipeCount: number;
  priceActivity?: IngredientPriceActivity | null;
  /** When set, chips are suppressed (queue review uses dedicated panels). */
  listReviewMode?: OperationalListFilter | null;
}): IngredientDetailInsightChip[] {
  if (input.listReviewMode != null) return [];

  const chips: IngredientDetailInsightChip[] = [];
  const purchases = input.recentPurchases;
  const supplierCount = uniqueSupplierLabels(purchases).length;
  const volatile = hasMeaningfulPurchaseVolatility(purchases);
  const stable = purchases.length >= 2 && isStableAcrossPurchases(purchases) && !volatile;
  const trend = deriveIngredientCompactTrendState({
    recentPurchases: purchases,
    priceActivity: input.priceActivity,
  });

  if (stable && !trend) {
    chips.push({ id: "price-stable", label: "Stable purchase pricing", tone: "positive" });
  } else if (volatile) {
    chips.push({
      id: "volatility",
      label: "Pricing has been inconsistent",
      tone: "caution",
    });
  }

  if (supplierCount >= 2 && hasSupplierPriceVariation(purchases)) {
    chips.push({
      id: "supplier-variation",
      label: "Supplier pricing varies significantly",
      tone: "info",
    });
  }

  if (input.recipeCount >= 3) {
    chips.push({
      id: "recipe-exposure",
      label: "Used in many recipes",
      tone: "caution",
    });
  }

  return chips.slice(0, MAX_OPERATIONAL_INSIGHT_CHIPS);
}

/** @deprecated Prefer {@link buildOperationalInsights}. */
export const buildIngredientDetailInsights = buildOperationalInsights;

/** Best / worst purchase lines from recent purchase memory (min / max unit price). */
export function buildIngredientPurchaseInsights(
  purchases: readonly RecentPurchaseRow[],
): IngredientPurchaseInsights {
  let best: IngredientPurchaseInsightRow | null = null;
  let worst: IngredientPurchaseInsightRow | null = null;
  let bestPrice: number | null = null;
  let worstPrice: number | null = null;

  for (const row of purchases) {
    const price = purchaseComparablePrice(row);
    if (price == null) continue;
    const snapshot: IngredientPurchaseInsightRow = {
      supplierLabel: row.supplierLabel,
      priceLabel: row.priceLabel,
      dateLabel: row.dateLabel,
    };
    if (bestPrice == null || price < bestPrice) {
      bestPrice = price;
      best = snapshot;
    }
    if (worstPrice == null || price > worstPrice) {
      worstPrice = price;
      worst = snapshot;
    }
  }

  const showWorstPurchase = bestPrice != null && worstPrice != null && worstPrice > bestPrice;
  return { best, worst, showWorstPurchase };
}

export function formatPurchaseInsightLine(row: IngredientPurchaseInsightRow): string {
  const date = formatPurchaseTimelineMonthDay(row.dateLabel);
  return `${row.supplierLabel} · ${date} · ${row.priceLabel}`;
}

/** Calm inline best / highest purchase summary (`Best purchase: Supplier · €x · date`). */
export function formatPurchaseExtentLine(
  kind: "best" | "worst",
  row: IngredientPurchaseInsightRow,
): string {
  const date = formatPurchaseTimelineMonthDay(row.dateLabel);
  const label = kind === "best" ? "Best purchase" : "Highest purchase";
  return `${label}: ${row.supplierLabel.trim()} · ${row.priceLabel.trim()} · ${date}`;
}

export function purchaseExtentPriceTextClassName(kind: "best" | "worst"): string {
  return kind === "best" ? "text-success/80" : "text-destructive/80";
}

export function buildIngredientDetailSummaryNotes(input: {
  recentPurchases: readonly RecentPurchaseRow[];
  priceActivity?: IngredientPriceActivity | null;
}): string[] {
  const notes: string[] = [];
  const supplierLabels = uniqueSupplierLabels(input.recentPurchases);

  if (
    supplierLabels.length >= 2 &&
    isStableAcrossPurchases(input.recentPurchases) &&
    !hasSignificantPriceActivity(input.priceActivity)
  ) {
    notes.push(`Stable pricing across ${supplierLabels.length} suppliers`);
  }

  const ago = formatLastPurchaseAgo(input.recentPurchases);
  if (ago) notes.push(ago);

  return notes.slice(0, 3);
}

function hasSignificantPriceActivity(
  activity: IngredientPriceActivity | null | undefined,
): boolean {
  if (!activity) return false;
  const pct = activity.delta_percent;
  if (typeof pct === "number" && Math.abs(pct) >= 0.5) return true;
  const delta = activity.delta;
  return typeof delta === "number" && Math.abs(delta) >= 0.01;
}

function purchasePriceExtents(purchases: readonly RecentPurchaseRow[]): {
  min: number | null;
  max: number | null;
} {
  const prices = purchases
    .map((row) => purchaseComparablePrice(row))
    .filter((price): price is number => price != null);
  if (prices.length === 0) return { min: null, max: null };
  return { min: Math.min(...prices), max: Math.max(...prices) };
}

function hasMeaningfulPurchaseVolatility(purchases: readonly RecentPurchaseRow[]): boolean {
  const prices = purchases
    .map((row) => purchaseComparablePrice(row))
    .filter((price): price is number => price != null);
  if (prices.length < 2) return false;
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  if (min <= 0) return max - min >= 0.1;
  return (max - min) / min >= 0.1;
}

function uniqueSupplierLabels(purchases: readonly RecentPurchaseRow[]): string[] {
  const labels = new Set<string>();
  for (const row of purchases) {
    if (row.supplierLabel.trim()) labels.add(row.supplierLabel);
  }
  return [...labels];
}

function isStableAcrossPurchases(purchases: readonly RecentPurchaseRow[]): boolean {
  const prices = purchases
    .map((row) => purchaseComparablePrice(row))
    .filter((price): price is number => price != null);
  if (prices.length < 2) return false;
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  if (min <= 0) return max - min < 0.05;
  return (max - min) / min <= 0.05;
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

function cheapestSupplierLabel(purchases: readonly RecentPurchaseRow[]): string | null {
  let bestLabel: string | null = null;
  let bestPrice: number | null = null;
  for (const row of purchases) {
    const price = purchaseComparablePrice(row);
    if (price == null || !row.supplierLabel.trim()) continue;
    if (bestPrice == null || price < bestPrice) {
      bestPrice = price;
      bestLabel = row.supplierLabel.trim();
    }
  }
  return bestLabel;
}

function bestSupplierChangedRecently(purchases: readonly RecentPurchaseRow[]): boolean {
  const sorted = sortRecentPurchasesByDate(purchases);
  if (sorted.length < 2) return false;
  const latest = sorted[0]!;
  const priorCheapest = cheapestSupplierLabel(sorted.slice(1));
  const overallCheapest = cheapestSupplierLabel(sorted);
  if (!priorCheapest || !overallCheapest || priorCheapest === overallCheapest) {
    return false;
  }
  return latest.supplierLabel.trim() === overallCheapest;
}

export type IngredientReviewDetailSection = {
  id: string;
  title: string;
  lines: IngredientDeltaLine[];
  guidance: string | null;
};

type ReviewCatalogEntry = {
  id: string;
  name: string | null;
  normalized_name?: string | null;
  created_at?: string | null;
};

export function buildDuplicateReviewDetail(input: {
  cluster: IngredientMergeCluster;
  catalog: readonly ReviewCatalogEntry[];
  recipeCountById: Readonly<Record<string, number>>;
}): IngredientReviewDetailSection {
  const members = input.cluster.ingredientIds
    .map((id) => {
      const entry = input.catalog.find((row) => row.id === id);
      if (!entry) return null;
      const recipes = input.recipeCountById[id] ?? 0;
      return {
        id,
        displayName: formatCanonicalIngredientDisplayName(entry.name ?? id),
        recipes,
      };
    })
    .filter((row): row is NonNullable<typeof row> => row != null);

  const recipeTotals = members.map((member) => member.recipes);
  const sharedRecipes = recipeTotals.every((count) => count === recipeTotals[0] && count > 0);

  const count = members.length;
  const lines: IngredientDeltaLine[] = [
    {
      id: "primary",
      text: `${count} catalog ${count === 1 ? "entry" : "entries"} may be the same ingredient`,
      tone: "caution",
    },
  ];

  if (sharedRecipes) {
    lines.push({
      id: "secondary",
      text: "All rows share the same recipe exposure",
      tone: "caution",
    });
  } else if (recipeTotals.some((recipeCount) => recipeCount > 0)) {
    const withRecipes = recipeTotals.filter((recipeCount) => recipeCount > 0).length;
    lines.push({
      id: "secondary",
      text: `Recipe usage varies across ${withRecipes} rows`,
      tone: "info",
    });
  }

  return {
    id: "duplicate-review",
    title: "Possible duplicates",
    lines: lines.slice(0, 2),
    guidance: "Review duplicate cluster before merging.",
  };
}

export function buildPricingFreshnessReviewDetail(input: {
  ingredientName: string;
  currentPrice?: number | null;
  priceRefreshAt?: string | null;
  lastPurchaseAt?: string | null;
  recipeCount: number;
  /** When set, copy targets catalog confirmation queue instead of stale pricing. */
  reviewMode?: "catalog-confirmation" | "stale-prices";
}): IngredientReviewDetailSection {
  const snapshot = derivePricingFreshnessSnapshot({
    currentPrice: input.currentPrice,
    priceRefreshAt: input.priceRefreshAt,
    lastPurchaseAt: input.lastPurchaseAt,
  });
  const reviewMode = input.reviewMode;
  const inCatalogQueue = reviewMode === "catalog-confirmation";
  const inStaleQueue = reviewMode === "stale-prices";

  const lines: IngredientDeltaLine[] = [];

  if (reviewMode != null) {
    const primaryTone: IngredientInsightTone = inCatalogQueue
      ? "caution"
      : snapshot.level === "critical"
        ? "negative"
        : "caution";
    lines.push({
      id: "primary",
      text: formatPricingReviewPrimaryIssue(snapshot, reviewMode),
      tone: primaryTone,
    });

    const secondary = formatPricingReviewSecondaryContext(snapshot, reviewMode, input.recipeCount);
    if (secondary) {
      lines.push({
        id: "secondary",
        text: secondary,
        tone: inStaleQueue && input.recipeCount >= 3 ? "caution" : "neutral",
      });
    }
  } else {
    const statusLine =
      formatPricingFreshnessPositiveLine(snapshot) ??
      (snapshot.catalogConfirmationPending
        ? formatCatalogConfirmationListExplanation(snapshot)
        : formatStaleReviewListExplanation(snapshot));
    const statusTone: IngredientInsightTone =
      snapshot.level === "critical" ? "negative" : "caution";
    lines.push({
      id: "primary",
      text: statusLine,
      tone: statusTone,
    });
  }

  const guidance = inCatalogQueue
    ? "Confirm latest supplier price from recent invoice."
    : "Confirm latest supplier price from recent invoice.";

  return {
    id: "pricing-freshness-review",
    title: inCatalogQueue ? "Confirm latest prices" : "Outdated pricing",
    lines: lines.slice(0, 2),
    guidance: reviewMode != null ? guidance : lines.length > 0 ? guidance : null,
  };
}

/** @deprecated Use buildPricingFreshnessReviewDetail */
export function buildStalePriceReviewDetail(input: {
  ingredientName: string;
  updatedAt: string | null;
  recipeCount: number;
}): IngredientReviewDetailSection {
  return buildPricingFreshnessReviewDetail({
    ingredientName: input.ingredientName,
    priceRefreshAt: input.updatedAt,
    recipeCount: input.recipeCount,
  });
}

export function pricingFreshnessLevelLabel(
  level: PricingFreshnessLevel,
  catalogConfirmationPending = false,
  queue?: PricingFreshnessQueueMode,
): string {
  return pricingFreshnessBadgeLabel(level, catalogConfirmationPending, queue);
}

export function pricingFreshnessLevelHint(
  level: PricingFreshnessLevel,
  source?: PricingRecencySource,
  catalogConfirmationPending = false,
  queue?: PricingFreshnessQueueMode,
): string {
  return pricingFreshnessBadgeHint(level, source ?? "none", catalogConfirmationPending, queue);
}

export function buildUnusedEntryReviewDetail(
  report: IngredientOrphanReport,
): IngredientReviewDetailSection {
  const orphan = isIngredientOperationallyOrphaned(report);
  const aliasOnly = isAliasOnlyOperationalDependency(report);
  const lines: IngredientDeltaLine[] = [];

  if (orphan) {
    lines.push({
      id: "primary",
      text: "No operational links — safe to remove",
      tone: "info",
    });
  } else if (aliasOnly) {
    lines.push({
      id: "primary",
      text: `${report.invoiceAliasCount} invoice ${report.invoiceAliasCount === 1 ? "alias" : "aliases"} only · not used in recipes`,
      tone: "caution",
    });
  }

  if (report.recipeIngredientCount > 0) {
    lines.push({
      id: "secondary",
      text: `${report.recipeIngredientCount} recipe lines still reference this row`,
      tone: "negative",
    });
  }

  return {
    id: "unused-review",
    title: orphan ? "Unused catalog entry" : "Low use",
    lines: lines.slice(0, 2),
    guidance: orphan
      ? "Delete or archive when nothing should reference this row."
      : "Archive alias-only ingredient if no longer operational.",
  };
}

export function formatPriceHistoryRow(row: IngredientPriceHistoryRow): string {
  const pct = row.delta_percent;
  if (typeof pct === "number" && pct !== 0) {
    return formatPercent(pct, { signDisplay: "always" });
  }
  const delta = row.delta;
  if (typeof delta === "number" && delta !== 0) {
    return delta > 0 ? `+€${Math.abs(delta).toFixed(2)}` : `−€${Math.abs(delta).toFixed(2)}`;
  }
  return "Updated";
}

export function formatPriceHistoryDate(value: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("pt-PT", { day: "2-digit", month: "short" });
}
