import { formatPercent } from "@/lib/display-format";
import type { IngredientPriceActivity } from "@/lib/ingredient-detail-panel";
import {
  findCheapestPurchaseItemId,
  purchasePriceExtentsDiffer,
  sortRecentPurchasesByDate,
} from "@/lib/ingredient-detail-panel";
import { purchaseComparablePrice, type RecentPurchaseRow } from "@/lib/ingredient-purchase-memory";
import {
  pickTopInsights,
  type InsightPriorityTier,
} from "@/lib/buildIngredientOperationalSignals";

export type OperationalInsightCardKind =
  | "supplier-price-up"
  | "no-longer-cheapest"
  | "lower-historical-price"
  | "supplier-changed"
  | "pack-size-changed"
  | "catalog-mapping-changed"
  | "multiple-aliases"
  | "unused-in-recipes"
  | "price-spread"
  | "recipe-usage";

export type OperationalInsightCard = {
  id: string;
  text: string;
  detail?: string;
  kind: OperationalInsightCardKind;
};

type InsightCandidate = {
  id: string;
  priority: number;
  tier: InsightPriorityTier;
  kind: OperationalInsightCardKind;
  text: string;
  detail?: string;
  suppresses?: readonly string[];
};

function displayIngredientName(name: string | null | undefined): string {
  const trimmed = name?.trim();
  return trimmed || "This ingredient";
}

function costChangeSinceInvoice(
  ingredientName: string | null | undefined,
  pct: number,
): string {
  const name = displayIngredientName(ingredientName);
  const rounded = Math.abs(Math.round(pct));
  if (rounded < 1) return `${name} cost is about flat since your last invoice`;
  if (pct > 0) return `${name} cost increased ${rounded}% since last invoice`;
  return `${name} cost decreased ${rounded}% since last invoice`;
}

function formatDeltaPercent(current: number, baseline: number): number {
  return Math.round(((current - baseline) / baseline) * 100);
}

function normalizeProductHint(hint: string | null | undefined): string | null {
  const trimmed = hint?.trim();
  if (!trimmed) return null;
  return trimmed.toLowerCase().replace(/\s+/g, " ");
}

function purchasePrices(purchases: readonly RecentPurchaseRow[]): number[] {
  return purchases
    .map((row) => purchaseComparablePrice(row))
    .filter((price): price is number => price != null);
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

function hasRecentSupplierSwitch(purchases: readonly RecentPurchaseRow[]): boolean {
  const sorted = sortRecentPurchasesByDate(purchases);
  if (sorted.length < 2) return false;
  const latest = sorted[0]!.supplierLabel.trim();
  const previous = sorted[1]!.supplierLabel.trim();
  return Boolean(latest && previous && latest !== previous);
}

function cheapestSupplierLabel(purchases: readonly RecentPurchaseRow[]): string | null {
  const cheapestId = findCheapestPurchaseItemId(purchases);
  if (!cheapestId) return null;
  const row = purchases.find((p) => p.itemId === cheapestId);
  return row?.supplierLabel.trim() || null;
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

function hintLooksLikePackSize(hint: string): boolean {
  return /\d+\s*(kg|g|ml|l|lt)\b|\b(kg|g|ml|l|lt|pack|x\s*\d|unit)\b/i.test(hint);
}

function buildPurchaseInsightCandidates(
  purchases: readonly RecentPurchaseRow[],
  priceActivity: IngredientPriceActivity | null | undefined,
  ingredientName: string | null | undefined,
): InsightCandidate[] {
  const candidates: InsightCandidate[] = [];
  if (purchases.length === 0) return candidates;

  const sorted = sortRecentPurchasesByDate(purchases);
  const latest = sorted[0]!;
  const previous = sorted[1];
  const current = latestPurchasePrice(purchases);
  const lowest = lowestPurchasePrice(purchases);
  const latestSupplier = latest.supplierLabel.trim();
  const cheapestSupplier = cheapestSupplierLabel(purchases);
  const priorPrice = previous ? purchaseComparablePrice(previous) : null;
  const priorSupplier = previous?.supplierLabel.trim() || null;

  if (current != null && priorPrice != null && priorPrice > 0 && current > priorPrice * 1.03) {
    const pct = formatDeltaPercent(current, priorPrice);
    candidates.push({
      id: "insight:supplier-price-up",
      priority: 90,
      tier: "pricing",
      kind: "supplier-price-up",
      text: costChangeSinceInvoice(ingredientName, pct),
      detail: latestSupplier
        ? `Latest buy from ${latestSupplier}${priorSupplier ? ` — up from ${priorSupplier}` : ""}.`
        : priorSupplier
          ? `Up from your ${priorSupplier} buy.`
          : undefined,
      suppresses: ["insight:lower-historical-price", "insight:pack-price-activity"],
    });
  }

  if (
    priceActivity?.delta_percent != null &&
    typeof priceActivity.delta_percent === "number" &&
    priceActivity.delta_percent > 0 &&
    !candidates.some((c) => c.id === "insight:supplier-price-up")
  ) {
    const pctLabel = formatPercent(priceActivity.delta_percent, { signDisplay: "always" });
    candidates.push({
      id: "insight:pack-price-activity",
      priority: 85,
      tier: "pricing",
      kind: "supplier-price-up",
      text: costChangeSinceInvoice(ingredientName, priceActivity.delta_percent),
      detail: `Tracked pack price is ${pctLabel} vs two weeks ago.`,
      suppresses: ["insight:lower-historical-price"],
    });
  }

  const noLongerCheapest =
    latestSupplier &&
    cheapestSupplier &&
    latestSupplier !== cheapestSupplier &&
    current != null &&
    lowest != null &&
    current > lowest + 0.001;

  if (noLongerCheapest) {
    candidates.push({
      id: "insight:no-longer-cheapest",
      priority: 80,
      tier: "pricing",
      kind: "no-longer-cheapest",
      text: `Latest buy isn't your best price`,
      detail: `${cheapestSupplier} was cheaper on a recent order — you're with ${latestSupplier} now.`,
      suppresses: ["insight:supplier-changed", "insight:lower-historical-price"],
    });
  }

  if (
    current != null &&
    lowest != null &&
    current > lowest + 0.001 &&
    !noLongerCheapest
  ) {
    const bestRow = sorted.find((row) => purchaseComparablePrice(row) === lowest);
    const bestSupplier = bestRow?.supplierLabel.trim();
    candidates.push({
      id: "insight:lower-historical-price",
      priority: 70,
      tier: "pricing",
      kind: "lower-historical-price",
      text: "You've paid less for this before",
      detail: bestSupplier
        ? `Best recent price was from ${bestSupplier}.`
        : "A past purchase beat your latest price.",
    });
  }

  if (hasRecentSupplierSwitch(purchases) && latestSupplier && priorSupplier) {
    candidates.push({
      id: "insight:supplier-changed",
      priority: 60,
      tier: "supplier",
      kind: "supplier-changed",
      text: `Now buying from ${latestSupplier}`,
      detail: `Previous invoice was ${priorSupplier}.`,
    });
  }

  if (previous) {
    const latestHint = normalizeProductHint(latest.productHint);
    const priorHint = normalizeProductHint(previous.productHint);
    if (latestHint && priorHint && latestHint !== priorHint) {
      const packChanged =
        hintLooksLikePackSize(latestHint) || hintLooksLikePackSize(priorHint);
      if (packChanged) {
        candidates.push({
          id: "insight:pack-size-changed",
          priority: 55,
          tier: "supplier",
          kind: "pack-size-changed",
          text: "Pack size looks different on the last invoice",
          detail: "Line wording changed — confirm the unit price still matches what you expect.",
          suppresses: ["insight:catalog-mapping-changed"],
        });
      } else {
        candidates.push({
          id: "insight:catalog-mapping-changed",
          priority: 50,
          tier: "confidence",
          kind: "catalog-mapping-changed",
          text: "Invoice line wording changed",
          detail: "Description differs from your previous buy — worth a quick check.",
        });
      }
    }
  }

  if (
    purchasePriceExtentsDiffer(purchases) &&
    hasMeaningfulPurchaseVolatility(purchases) &&
    hasSupplierPriceVariation(purchases)
  ) {
    const prices = purchasePrices(purchases);
    const spreadPct =
      prices.length >= 2 && Math.min(...prices) > 0
        ? Math.round(
            ((Math.max(...prices) - Math.min(...prices)) / Math.min(...prices)) * 100,
          )
        : null;
    if (spreadPct != null && spreadPct >= 10) {
      candidates.push({
        id: "insight:price-spread",
        priority: 40,
        tier: "supplier",
        kind: "price-spread",
        text: `About ${spreadPct}% spread across recent buys`,
        detail: "Compare suppliers before the next order.",
      });
    }
  }

  return candidates;
}

function selectInsightCards(candidates: InsightCandidate[], maxCards: number): OperationalInsightCard[] {
  const suppressed = new Set<string>();
  const seenText = new Set<string>();
  const filtered: InsightCandidate[] = [];

  const sorted = [...candidates].sort((a, b) => b.priority - a.priority);
  for (const candidate of sorted) {
    if (suppressed.has(candidate.id)) continue;
    const textKey = `${candidate.text}|${candidate.detail ?? ""}`.toLowerCase();
    if (seenText.has(textKey)) continue;
    for (const id of candidate.suppresses ?? []) {
      suppressed.add(id);
    }
    seenText.add(textKey);
    filtered.push(candidate);
  }

  const picked = pickTopInsights(filtered, maxCards);
  return picked.map((candidate) => ({
    id: candidate.id,
    text: candidate.text,
    detail: candidate.detail,
    kind: candidate.kind,
  }));
}

/** Calm insight cards for Notes & insights — pastel shells, operational copy. */
export function buildOperationalInsightCards(input: {
  recentPurchases?: readonly RecentPurchaseRow[];
  priceActivity?: IngredientPriceActivity | null;
  aliasCount?: number;
  recipeCount: number;
  ingredientName?: string | null;
  maxCards?: number;
}): OperationalInsightCard[] {
  const maxCards = input.maxCards ?? 3;
  const purchases = input.recentPurchases ?? [];
  const purchaseCandidates = buildPurchaseInsightCandidates(
    purchases,
    input.priceActivity,
    input.ingredientName,
  );
  const candidates: InsightCandidate[] = [...purchaseCandidates];

  const aliasCount = input.aliasCount ?? 0;
  if (aliasCount >= 2) {
    candidates.push({
      id: "insight:multiple-aliases",
      priority: 30,
      tier: "confidence",
      kind: "multiple-aliases",
      text: "Several invoice names point here",
      detail: `${aliasCount} line names match this ingredient — confirm totals if something looks off.`,
    });
  }

  if (input.recipeCount === 0 && purchases.length > 0) {
    candidates.push({
      id: "insight:unused-in-recipes",
      priority: 35,
      tier: "confidence",
      kind: "unused-in-recipes",
      text: "Buying this but it's not on the menu",
      detail: "Safe to tidy pricing without moving recipe cost.",
    });
  } else if (input.recipeCount === 0) {
    candidates.push({
      id: "insight:unused-in-recipes",
      priority: 20,
      tier: "confidence",
      kind: "unused-in-recipes",
      text: "Not on any recipe yet",
      detail: "Won't change menu cost until you link it.",
    });
  } else if (input.recipeCount >= 3) {
    candidates.push({
      id: "insight:recipe-usage",
      priority: 10,
      tier: "confidence",
      kind: "recipe-usage",
      text: `On the menu in ${input.recipeCount} recipes`,
      detail: "Price moves here will show up in dish cost.",
    });
  }

  return selectInsightCards(candidates, maxCards);
}

export function operationalInsightCardClassName(kind: OperationalInsightCardKind): string {
  const shell = "relative flex min-w-0 items-start gap-2 rounded-lg border px-2 py-1.5";
  switch (kind) {
    case "supplier-price-up":
      return `${shell} border-destructive/20 bg-destructive/5`;
    case "no-longer-cheapest":
    case "lower-historical-price":
      return `${shell} border-warning/25 bg-warning/5`;
    case "supplier-changed":
      return `${shell} border-primary/20 bg-primary/5`;
    case "pack-size-changed":
    case "catalog-mapping-changed":
      return `${shell} border-border/40 bg-muted/20`;
    case "multiple-aliases":
      return `${shell} border-border/40 bg-muted/15`;
    case "unused-in-recipes":
      return `${shell} border-border/35 bg-muted/10`;
    case "price-spread":
      return `${shell} border-warning/20 bg-warning/5`;
    case "recipe-usage":
      return `${shell} border-border/40 bg-muted/15`;
    default:
      return `${shell} border-border/35 bg-muted/10`;
  }
}

export function operationalInsightIconClassName(kind: OperationalInsightCardKind): string {
  switch (kind) {
    case "supplier-price-up":
    case "price-spread":
      return "text-destructive/70";
    case "no-longer-cheapest":
    case "lower-historical-price":
      return "text-warning/75";
    case "supplier-changed":
      return "text-primary/70";
    case "pack-size-changed":
    case "catalog-mapping-changed":
    case "multiple-aliases":
    case "unused-in-recipes":
    case "recipe-usage":
      return "text-muted-foreground/65";
    default:
      return "text-muted-foreground/60";
  }
}
