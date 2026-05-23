import {
  daysSinceRecency,
  derivePricingFreshnessSnapshot,
  type PricingFreshnessSnapshot,
  STALE_REVIEW_THRESHOLD_DAYS,
} from "@/lib/ingredient-pricing-freshness";
import type { OperationalListFilter } from "@/lib/operational-review-queue";

type IngredientGlanceRow = {
  id: string;
  current_price?: number | null;
};

type PriceActivityGlance = {
  created_at?: string | null;
  delta_percent?: number | null;
};

type PricingRecencyGlance = {
  priceRefreshAt?: string | null;
  lastPurchaseAt?: string | null;
};

export type IngredientListPurchaseGlance = {
  lastPurchaseAt?: string | null;
  supplierLabel?: string | null;
};

function buildPricingInput(input: {
  ingredient: IngredientGlanceRow;
  priceActivity?: PriceActivityGlance;
  pricingRecency?: PricingRecencyGlance;
}) {
  const pricingRecency = input.pricingRecency ?? {
    priceRefreshAt: input.priceActivity?.created_at ?? null,
    lastPurchaseAt: null,
  };
  return {
    currentPrice: input.ingredient.current_price,
    priceRefreshAt: pricingRecency.priceRefreshAt ?? null,
    lastPurchaseAt: pricingRecency.lastPurchaseAt ?? null,
  };
}

/** Build pricing snapshot for list-row copy from glance inputs. */
export function pricingSnapshotForListRow(input: {
  ingredient: IngredientGlanceRow;
  priceActivity?: PriceActivityGlance;
  pricingRecency?: PricingRecencyGlance;
}): PricingFreshnessSnapshot {
  return derivePricingFreshnessSnapshot(buildPricingInput(input));
}

function formatPurchaseTimingPhrase(lastPurchaseAt: string | null | undefined): string | null {
  const days = daysSinceRecency(lastPurchaseAt);
  if (days == null) return null;
  if (days === 0) return "today";
  if (days === 1) return "1d ago";
  return `${days}d ago`;
}

/** Queue-scoped subline when a hygiene filter is active (browse stays supplier-only). */
export function formatOperationalListRowDominantReason(input: {
  listReviewMode: OperationalListFilter | null;
  pricingSnapshot?: PricingFreshnessSnapshot | null;
  aliasOnly?: boolean;
  purchaseGlance?: IngredientListPurchaseGlance | null;
}): string | null {
  const mode = input.listReviewMode;
  if (!mode) return null;

  switch (mode) {
    case "duplicates":
      return null;
    case "catalog-confirmation": {
      const timing = formatPurchaseTimingPhrase(input.purchaseGlance?.lastPurchaseAt);
      const supplier = input.purchaseGlance?.supplierLabel?.trim();
      if (supplier && timing) return `${supplier} · ${timing}`;
      if (timing) return timing;
      return null;
    }
    case "stale-prices": {
      const snap = input.pricingSnapshot;
      const days = snap?.daysSince;
      if (days != null) return `No purchase in ${days}d`;
      return `No purchase in ${STALE_REVIEW_THRESHOLD_DAYS}+d`;
    }
    case "unused":
      return input.aliasOnly ? "Alias only · no recipes" : "No recipe usage";
  }
}

/** One-line subline under ingredient name — recent supplier in browse; queue context when filtered. */
export function formatIngredientListRowSubline(input: {
  listReviewMode: OperationalListFilter | null;
  dominantReason?: string | null;
  purchaseGlance?: IngredientListPurchaseGlance | null;
}): string | null {
  if (input.dominantReason?.trim()) return input.dominantReason.trim();

  const supplier = input.purchaseGlance?.supplierLabel?.trim() || null;
  if (supplier) return supplier;

  return null;
}

/** Human-readable purchase timing for the Last purchase column. */
export function formatListPurchaseRecency(lastPurchaseAt: string | null | undefined): string {
  const days = daysSinceRecency(lastPurchaseAt);
  if (days == null) return "—";
  if (days === 0) return "Today";
  if (days === 1) return "1d ago";
  return `${days}d ago`;
}

/** Last purchase column — timing only; supplier stays on the ingredient subline. */
export function formatIngredientListLastPurchaseColumn(
  purchaseGlance?: IngredientListPurchaseGlance | null,
): string {
  return formatListPurchaseRecency(purchaseGlance?.lastPurchaseAt);
}
