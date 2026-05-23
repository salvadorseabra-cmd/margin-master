import type { IngredientCanonicalMatchKind } from "@/lib/ingredient-canonical";
import { buildIngredientAliasLookupKey } from "@/lib/ingredient-alias-lookup";
import {
  derivePricingFreshnessSnapshot,
  isCatalogConfirmationPending,
  isStaleForPriceReview,
} from "@/lib/ingredient-pricing-freshness";
import { normalizeSupplierDisplayName } from "@/lib/supplier-identity";

export type OperationalSignalTone = "muted" | "review" | "success" | "increase" | "decrease";

export type OperationalSignal = {
  kind: string;
  label: string;
  title?: string;
  tone: OperationalSignalTone;
  priority: number;
};

export type InvoiceLineForSignals = {
  id: string;
  name: string;
  unit_price: number | null;
};

export type IngredientForSignals = {
  id: string;
  name?: string | null;
  current_price?: number | null;
  updated_at?: string | null;
};

export type InvoiceLineOperationalContext = {
  previousInvoiceLinePrice?: number;
  recipeCountByIngredientId?: Record<string, number>;
  volatileIngredientIds?: ReadonlySet<string>;
  priceHistoryLatestAtByIngredientId?: Record<string, string | null>;
  lastPurchaseAtByIngredientId?: Record<string, string | null>;
  aliasCreatedAtByLookupKey?: Record<string, string>;
  knownSupplierNames?: ReadonlySet<string>;
  currentSupplierName?: string | null;
  isNewSupplier?: boolean;
  matchKind?: IngredientCanonicalMatchKind | null;
  normalizedItemName?: string;
  highImportanceRecipeThreshold?: number;
  stalePricingDays?: number;
  recentAliasDays?: number;
};

const DEFAULT_STALE_DAYS = 90;
const DEFAULT_RECENT_ALIAS_DAYS = 14;
const DEFAULT_HIGH_IMPORTANCE_RECIPES = 3;

function finitePrice(value: number | null | undefined): number | null {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function priceDeltaPercent(current: number, baseline: number): number | null {
  if (!Number.isFinite(baseline) || baseline <= 0) return null;
  return Math.round(((current - baseline) / baseline) * 100);
}

function isRecentIsoDate(value: string | null | undefined, days: number): boolean {
  if (!value) return false;
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return false;
  const ageMs = Date.now() - timestamp;
  return ageMs >= 0 && ageMs <= days * 86_400_000;
}

function formatPercentLabel(percent: number): string {
  if (percent === 0) return "0%";
  return `${percent > 0 ? "+" : ""}${percent}%`;
}

/**
 * Derives presentation-only operational signals for an invoice line.
 * Only emits signals backed by supplied context; never invents data.
 */
export function deriveInvoiceLineOperationalSignals(
  item: InvoiceLineForSignals,
  ingredient: IngredientForSignals | null | undefined,
  context: InvoiceLineOperationalContext = {},
): OperationalSignal[] {
  const signals: OperationalSignal[] = [];
  const current = finitePrice(item.unit_price);
  const staleDays = context.stalePricingDays ?? DEFAULT_STALE_DAYS;
  const recentAliasDays = context.recentAliasDays ?? DEFAULT_RECENT_ALIAS_DAYS;
  const highImportanceThreshold =
    context.highImportanceRecipeThreshold ?? DEFAULT_HIGH_IMPORTANCE_RECIPES;

  const previousInvoice = finitePrice(context.previousInvoiceLinePrice);
  if (current != null && previousInvoice != null) {
    const percent = priceDeltaPercent(current, previousInvoice);
    if (percent != null && percent > 0) {
      signals.push({
        kind: "price-increased",
        label: "Price up vs last invoice",
        title: `Was €${previousInvoice.toFixed(2)} on the last purchase of this line (${formatPercentLabel(percent)}).`,
        tone: "increase",
        priority: 100,
      });
    } else if (percent != null && percent < 0) {
      signals.push({
        kind: "price-decreased",
        label: "Price down vs last invoice",
        title: `Was €${previousInvoice.toFixed(2)} on the last purchase of this line (${formatPercentLabel(percent)}).`,
        tone: "decrease",
        priority: 95,
      });
    }
  } else if (current != null && ingredient) {
    const catalog = finitePrice(ingredient.current_price);
    if (catalog != null) {
      const percent = priceDeltaPercent(current, catalog);
      if (percent != null && percent > 0) {
        signals.push({
          kind: "catalog-price-up",
          label: "Above catalog pack price",
          title: `Catalog pack price is €${catalog.toFixed(2)} (${formatPercentLabel(percent)} vs this line).`,
          tone: "increase",
          priority: 88,
        });
      } else if (percent != null && percent < 0) {
        signals.push({
          kind: "catalog-price-down",
          label: "Below catalog pack price",
          title: `Catalog pack price is €${catalog.toFixed(2)} (${formatPercentLabel(percent)} vs this line).`,
          tone: "decrease",
          priority: 40,
        });
      }
    }
  }

  if (ingredient?.id) {
    const recipeCount = context.recipeCountByIngredientId?.[ingredient.id] ?? 0;
    if (recipeCount > 0) {
      signals.push({
        kind: "recipe-impact",
        label: recipeCount === 1 ? "In 1 recipe" : `In ${recipeCount} recipes`,
        title: "This ingredient is linked to recipes; price changes may affect food cost.",
        tone: "muted",
        priority: recipeCount >= highImportanceThreshold ? 78 : 72,
      });
    }

    if (context.volatileIngredientIds?.has(ingredient.id)) {
      signals.push({
        kind: "volatile",
        label: "Inconsistent pricing",
        title: "Purchase prices have varied for this ingredient in the last 90 days.",
        tone: "review",
        priority: 70,
      });
    }

    const catalogPrice = finitePrice(ingredient.current_price);
    if (catalogPrice != null) {
      const pricingInput = {
        currentPrice: ingredient.current_price,
        priceRefreshAt: context.priceHistoryLatestAtByIngredientId?.[ingredient.id] ?? null,
        lastPurchaseAt: context.lastPurchaseAtByIngredientId?.[ingredient.id] ?? null,
      };
      if (isCatalogConfirmationPending(pricingInput)) {
        signals.push({
          kind: "catalog-confirmation",
          label: "Confirm latest price",
          title: "Latest purchase on file — confirm pack price matches.",
          tone: "review",
          priority: 84,
        });
      } else if (isStaleForPriceReview(pricingInput, staleDays)) {
        const snapshot = derivePricingFreshnessSnapshot(pricingInput, staleDays);
        signals.push({
          kind: "stale-pricing",
          label: "Outdated pricing",
          title: snapshot.recencyAt
            ? `No pricing update in ${staleDays}+ days.`
            : "No pricing update on record.",
          tone: "review",
          priority: 82,
        });
      }
    }

    if (recipeCount >= highImportanceThreshold) {
      signals.push({
        kind: "high-importance",
        label: "Used in many recipes",
        title: `Used in ${recipeCount} recipes — prioritize confirming price and supplier wording.`,
        tone: "review",
        priority: 76,
      });
    }
  }

  if (context.isNewSupplier) {
    signals.push({
      kind: "new-supplier",
      label: "New supplier",
      title: "First invoice from this supplier in your workspace.",
      tone: "muted",
      priority: 55,
    });
  }

  if (ingredient?.id && context.matchKind === "confirmed-alias" && context.normalizedItemName) {
    const aliasKey = buildIngredientAliasLookupKey(
      context.normalizedItemName,
      context.currentSupplierName,
    );
    const aliasAt =
      context.aliasCreatedAtByLookupKey?.[aliasKey] ??
      context.aliasCreatedAtByLookupKey?.[context.normalizedItemName];
    if (aliasAt && isRecentIsoDate(aliasAt, recentAliasDays)) {
      signals.push({
        kind: "alias-memory",
        label: "Recent alias match",
        title: "Matched from supplier wording you confirmed recently.",
        tone: "success",
        priority: 45,
      });
    }
  }

  return pickTopOperationalSignals(signals, 3);
}

export function pickTopOperationalSignals(
  signals: OperationalSignal[],
  max = 3,
): OperationalSignal[] {
  if (signals.length <= max) return signals;
  return [...signals].sort((a, b) => b.priority - a.priority).slice(0, max);
}

/** Build normalized supplier names seen on other invoices (for “new supplier” detection). */
export function buildKnownSupplierNames(
  supplierNames: Iterable<string | null | undefined>,
  excludeNormalized?: string | null,
): Set<string> {
  const known = new Set<string>();
  for (const raw of supplierNames) {
    const normalized = normalizeSupplierDisplayName(raw).toLocaleLowerCase();
    if (!normalized) continue;
    if (excludeNormalized && normalized === excludeNormalized) continue;
    known.add(normalized);
  }
  return known;
}

export function isNewSupplierForInvoice(
  currentSupplierName: string | null | undefined,
  knownSupplierNames: ReadonlySet<string>,
): boolean {
  const normalized = normalizeSupplierDisplayName(currentSupplierName).toLocaleLowerCase();
  if (!normalized) return false;
  return !knownSupplierNames.has(normalized);
}
