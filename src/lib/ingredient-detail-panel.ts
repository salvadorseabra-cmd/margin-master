import { formatCurrency, formatPercent, formatUnitCostCurrency } from "@/lib/display-format";
import {
  effectiveIngredientUnitCostEur,
  ingredientDisplayBaseUnit,
} from "@/lib/ingredient-unit-cost";
import type { RecentPurchaseRow } from "@/lib/ingredient-purchase-memory";
import type { IngredientPriceHistoryRow } from "@/lib/ingredient-price-history";
import type { Tables } from "@/integrations/supabase/types";

type IngredientRow = Pick<
  Tables<"ingredients">,
  "current_price" | "purchase_quantity" | "base_unit" | "unit" | "purchase_unit"
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
};

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
  const showPriceHistory =
    input.priceHistoryReady && input.priceHistoryCount > 0;
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

/** Soft chip shell — semantic color is carried by the status dot and label tint. */
export function insightChipClassName(tone: IngredientInsightTone): string {
  const shell = "border-border/50 bg-muted/15";
  switch (tone) {
    case "positive":
      return `${shell} text-success/90`;
    case "caution":
      return `${shell} text-warning/90`;
    case "negative":
      return `${shell} text-destructive/90`;
    case "info":
      return `${shell} text-primary/90`;
    default:
      return `${shell} text-muted-foreground`;
  }
}

/** Solid semantic status dot — independent of parent text tint. */
export function insightChipDotClassName(tone: IngredientInsightTone): string {
  switch (tone) {
    case "positive":
      return "bg-success opacity-100";
    case "caution":
      return "bg-warning opacity-100";
    case "negative":
      return "bg-destructive opacity-100";
    case "info":
      return "bg-primary opacity-100";
    default:
      return "bg-muted-foreground/55 opacity-100";
  }
}

/** Pack price (`current_price` on catalog row). */
export function formatIngredientPackPrice(ingredient: IngredientRow): string {
  const pack = Number(ingredient.current_price);
  return formatCurrency(Number.isFinite(pack) ? pack : 0);
}

/** Compact unit cost for KPI tile. */
export function formatIngredientUnitCostKpi(ingredient: IngredientRow): string {
  const base = ingredientDisplayBaseUnit(ingredient);
  const perBase = formatUnitCostCurrency(effectiveIngredientUnitCostEur(ingredient));
  const normalized = base.trim().toLowerCase();
  if (normalized === "kg" || normalized === "kilogram" || normalized === "kilograms") {
    const perGram = effectiveIngredientUnitCostEur(ingredient) / 1000;
    return `${perBase}/kg · ${formatUnitCostCurrency(perGram)}/g`;
  }
  return `${perBase}/${base}`;
}

export function formatRecipesLinkedKpi(recipeCount: number): string {
  if (recipeCount <= 0) return "—";
  return String(recipeCount);
}

export function formatLastPurchaseDateKpi(
  purchases: readonly RecentPurchaseRow[],
): string {
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

export function buildIngredientDetailKpis(input: {
  ingredient: IngredientRow;
  recipeCount: number;
  recentPurchases: readonly RecentPurchaseRow[];
}): IngredientDetailKpi[] {
  return [
    { label: "Pack price", value: formatIngredientPackPrice(input.ingredient) },
    { label: "Unit cost", value: formatIngredientUnitCostKpi(input.ingredient) },
    { label: "Recipes linked", value: formatRecipesLinkedKpi(input.recipeCount) },
    {
      label: "Last purchase",
      value: formatLastPurchaseDateKpi(input.recentPurchases),
    },
  ];
}

/** €/base unit, plus €/g when the base unit is mass-based. */
export function formatIngredientCostHeaderLine(ingredient: IngredientRow): string {
  return formatIngredientUnitCostKpi(ingredient);
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

export function formatPurchaseProductHint(
  purchase: RecentPurchaseRow,
  maxLength = 48,
): string | null {
  const hint = purchase.productHint?.trim();
  if (!hint) return null;
  if (hint.length <= maxLength) return hint;
  return `${hint.slice(0, maxLength - 1).trim()}…`;
}

export function findCheapestPurchaseItemId(
  purchases: readonly RecentPurchaseRow[],
): string | null {
  let bestId: string | null = null;
  let bestPrice: number | null = null;
  for (const row of purchases) {
    const price = parsePriceLabel(row.priceLabel);
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
    const price = parsePriceLabel(row.priceLabel);
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
    return itemId === cheapestId
      ? insightChipDotClassName("neutral")
      : "bg-border";
  }
  if (itemId === cheapestId) return insightChipDotClassName("positive");
  if (itemId === priciestId) return insightChipDotClassName("negative");
  return "bg-border";
}

export function purchasePriceExtentsDiffer(
  purchases: readonly RecentPurchaseRow[],
): boolean {
  const cheapestId = findCheapestPurchaseItemId(purchases);
  const priciestId = findMostExpensivePurchaseItemId(purchases);
  return (
    cheapestId != null &&
    priciestId != null &&
    cheapestId !== priciestId
  );
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

export function formatLastPurchaseAgo(
  purchases: readonly RecentPurchaseRow[],
): string | null {
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

/** Operational insight chips from purchase memory and recipe linkage. */
export function buildOperationalInsights(input: {
  recentPurchases: readonly RecentPurchaseRow[];
  recipeCount: number;
}): IngredientDetailInsightChip[] {
  const chips: IngredientDetailInsightChip[] = [];
  const purchases = input.recentPurchases;
  const supplierCount = uniqueSupplierLabels(purchases).length;
  const volatile = hasMeaningfulPurchaseVolatility(purchases);
  const stable =
    purchases.length >= 2 && isStableAcrossPurchases(purchases) && !volatile;

  if (stable) {
    chips.push({ id: "price-stable", label: "Price stable", tone: "positive" });
  } else if (volatile) {
    chips.push({ id: "volatility", label: "High volatility", tone: "caution" });
  }

  if (supplierCount === 1 && purchases.length > 0) {
    chips.push({
      id: "single-supplier",
      label: "Single supplier dependency",
      tone: "caution",
    });
  } else if (supplierCount >= 2) {
    if (hasSupplierPriceVariation(purchases)) {
      chips.push({
        id: "supplier-variation",
        label: "Supplier variation detected",
        tone: "info",
      });
    } else {
      chips.push({
        id: "multi-supplier",
        label: "Multiple suppliers available",
        tone: "positive",
      });
    }
  }

  if (input.recipeCount >= 3) {
    chips.push({
      id: "recipe-exposure",
      label: "High recipe exposure",
      tone: "caution",
    });
  }

  if (bestSupplierChangedRecently(purchases)) {
    chips.push({
      id: "best-supplier-changed",
      label: "Best supplier changed recently",
      tone: "info",
    });
  }

  return chips;
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
    const price = parsePriceLabel(row.priceLabel);
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

  const showWorstPurchase =
    bestPrice != null && worstPrice != null && worstPrice > bestPrice;
  return { best, worst, showWorstPurchase };
}

export function formatPurchaseInsightLine(row: IngredientPurchaseInsightRow): string {
  const date = formatShortPurchaseDate(row.dateLabel);
  return `${row.supplierLabel} — ${row.priceLabel} — ${date}`;
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
    .map((row) => parsePriceLabel(row.priceLabel))
    .filter((price): price is number => price != null);
  if (prices.length === 0) return { min: null, max: null };
  return { min: Math.min(...prices), max: Math.max(...prices) };
}

function hasMeaningfulPurchaseVolatility(
  purchases: readonly RecentPurchaseRow[],
): boolean {
  const prices = purchases
    .map((row) => parsePriceLabel(row.priceLabel))
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
    .map((row) => parsePriceLabel(row.priceLabel))
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
    const price = parsePriceLabel(row.priceLabel);
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
    const price = parsePriceLabel(row.priceLabel);
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

function parsePriceLabel(label: string): number | null {
  const match = label.replace(/\s/g, "").match(/[\d,.]+/);
  if (!match) return null;
  const normalized = match[0].replace(",", ".");
  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
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
