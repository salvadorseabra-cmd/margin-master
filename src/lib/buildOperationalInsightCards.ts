import { formatPercent } from "@/lib/display-format";
import type { IngredientPriceActivity } from "@/lib/ingredient-detail-panel";
import {
  findCheapestPurchaseItemId,
  purchasePriceExtentsDiffer,
  sortRecentPurchasesByDate,
} from "@/lib/ingredient-detail-panel";
import type { RecentPurchaseRow } from "@/lib/ingredient-purchase-memory";

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
  kind: OperationalInsightCardKind;
  text: string;
  detail?: string;
  suppresses?: readonly string[];
};

function parsePriceLabel(label: string): number | null {
  const match = label.replace(/\s/g, "").match(/[\d,.]+/);
  if (!match) return null;
  const normalized = match[0].replace(",", ".");
  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}

function normalizeProductHint(hint: string | null | undefined): string | null {
  const trimmed = hint?.trim();
  if (!trimmed) return null;
  return trimmed.toLowerCase().replace(/\s+/g, " ");
}

function formatDeltaPercent(current: number, baseline: number): string {
  const pct = Math.round(((current - baseline) / baseline) * 100);
  if (pct === 0) return "0%";
  return `${pct > 0 ? "+" : ""}${pct}%`;
}

function purchasePrices(purchases: readonly RecentPurchaseRow[]): number[] {
  return purchases
    .map((row) => parsePriceLabel(row.priceLabel))
    .filter((price): price is number => price != null);
}

function latestPurchasePrice(purchases: readonly RecentPurchaseRow[]): number | null {
  const sorted = sortRecentPurchasesByDate(purchases);
  const latest = sorted[0];
  if (!latest) return null;
  return parsePriceLabel(latest.priceLabel);
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

function hintLooksLikePackSize(hint: string): boolean {
  return /\d/.test(hint) && /\b(kg|g|ml|l|lt|pack|x\s*\d|unit)/i.test(hint);
}

function buildPurchaseInsightCandidates(
  purchases: readonly RecentPurchaseRow[],
  priceActivity?: IngredientPriceActivity | null,
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
  const priorPrice = previous ? parsePriceLabel(previous.priceLabel) : null;
  const priorSupplier = previous?.supplierLabel.trim() || null;

  if (current != null && priorPrice != null && priorPrice > 0 && current > priorPrice * 1.03) {
    const pct = formatDeltaPercent(current, priorPrice);
    const supplierPhrase = latestSupplier || "Latest supplier";
    const comparePhrase = priorSupplier ? `your ${priorSupplier} buy` : "your previous buy";
    candidates.push({
      id: "insight:supplier-price-up",
      priority: 90,
      kind: "supplier-price-up",
      text: `${supplierPhrase} raised prices`,
      detail: `Last invoice was ${pct} higher than ${comparePhrase}.`,
      suppresses: ["insight:lower-historical-price"],
    });
  }

  if (
    priceActivity?.delta_percent != null &&
    typeof priceActivity.delta_percent === "number" &&
    priceActivity.delta_percent > 0
  ) {
    const pctLabel = formatPercent(priceActivity.delta_percent, { signDisplay: "always" });
    candidates.push({
      id: "insight:pack-price-activity",
      priority: 85,
      kind: "supplier-price-up",
      text: "Pack price moved up recently",
      detail: `Catalog pack price is ${pctLabel} vs two weeks ago.`,
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
      kind: "no-longer-cheapest",
      text: `You're buying from ${latestSupplier} now`,
      detail: `${cheapestSupplier} was cheaper on your recent orders.`,
      suppresses: ["insight:supplier-changed", "insight:lower-historical-price"],
    });
  }

  if (
    current != null &&
    lowest != null &&
    current > lowest + 0.001 &&
    !noLongerCheapest
  ) {
    const bestRow = sorted.find((row) => parsePriceLabel(row.priceLabel) === lowest);
    const bestSupplier = bestRow?.supplierLabel.trim();
    candidates.push({
      id: "insight:lower-historical-price",
      priority: 70,
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
      kind: "supplier-changed",
      text: `Supplier changed — now ${latestSupplier}`,
      detail: `Previous purchase was from ${priorSupplier}.`,
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
          kind: "pack-size-changed",
          text: "Pack size changed on recent purchase",
          detail: "Invoice line wording differs from your previous buy.",
          suppresses: ["insight:catalog-mapping-changed"],
        });
      } else {
        candidates.push({
          id: "insight:catalog-mapping-changed",
          priority: 50,
          kind: "catalog-mapping-changed",
          text: "Recent purchase uses different catalog mapping",
          detail: "Invoice line wording differs from your previous buy.",
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
    candidates.push({
      id: "insight:price-spread",
      priority: 40,
      kind: "price-spread",
      text: "Large price variation across purchases",
      detail:
        spreadPct != null && spreadPct >= 10
          ? `Spread is about ${spreadPct}% across suppliers — worth comparing before the next order.`
          : "Prices differ noticeably across suppliers.",
    });
  }

  return candidates;
}

function selectInsightCards(candidates: InsightCandidate[], maxCards: number): OperationalInsightCard[] {
  const sorted = [...candidates].sort((a, b) => b.priority - a.priority);
  const suppressed = new Set<string>();
  const seenText = new Set<string>();
  const cards: OperationalInsightCard[] = [];

  for (const candidate of sorted) {
    if (suppressed.has(candidate.id)) continue;
    const textKey = `${candidate.text}|${candidate.detail ?? ""}`.toLowerCase();
    if (seenText.has(textKey)) continue;

    for (const id of candidate.suppresses ?? []) {
      suppressed.add(id);
    }

    seenText.add(textKey);
    cards.push({
      id: candidate.id,
      text: candidate.text,
      detail: candidate.detail,
      kind: candidate.kind,
    });
    if (cards.length >= maxCards) break;
  }

  return cards;
}

/** Calm insight cards for Notes & insights — pastel shells, operational copy. */
export function buildOperationalInsightCards(input: {
  recentPurchases?: readonly RecentPurchaseRow[];
  priceActivity?: IngredientPriceActivity | null;
  aliasCount?: number;
  recipeCount: number;
  maxCards?: number;
}): OperationalInsightCard[] {
  const maxCards = input.maxCards ?? 6;
  const candidates: InsightCandidate[] = [
    ...buildPurchaseInsightCandidates(input.recentPurchases ?? [], input.priceActivity),
  ];

  const aliasCount = input.aliasCount ?? 0;
  if (aliasCount >= 2) {
    candidates.push({
      id: "insight:multiple-aliases",
      priority: 30,
      kind: "multiple-aliases",
      text: "Multiple invoice aliases detected",
      detail: `${aliasCount} names map to this ingredient — check mappings if totals look off.`,
    });
  }

  if (input.recipeCount === 0) {
    candidates.push({
      id: "insight:unused-in-recipes",
      priority: 20,
      kind: "unused-in-recipes",
      text: "Not used in any recipe yet",
      detail: "Safe to review pricing without affecting menu cost.",
    });
  } else if (input.recipeCount > 0) {
    const recipeText =
      input.recipeCount === 1
        ? "Used in 1 recipe"
        : `Used in ${input.recipeCount} recipes`;
    candidates.push({
      id: "insight:recipe-usage",
      priority: 10,
      kind: "recipe-usage",
      text: recipeText,
      detail: "Price changes here will move menu cost.",
    });
  }

  return selectInsightCards(candidates, maxCards);
}

export function operationalInsightCardClassName(kind: OperationalInsightCardKind): string {
  const shell = "group relative flex min-w-0 items-start gap-2 rounded-lg border px-2.5 py-2";
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
