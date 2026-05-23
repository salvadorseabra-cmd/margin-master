import { formatCanonicalIngredientDisplayName } from "@/lib/canonical-ingredient-display-name";
import { findOperationalDuplicateClusters } from "@/lib/ingredient-identity-diagnostics";
import {
  buildPricingFreshnessInputForRow,
  derivePricingFreshnessSnapshot,
  isCatalogConfirmationForReview,
  isStaleForPriceReview,
} from "@/lib/ingredient-pricing-freshness";
import type { OperationalListFilter } from "@/lib/operational-review-queue";

/** Highlight pricing drift before the 90-day stale queue threshold. */
export const HIGH_PRICING_RISK_DAYS = 120;

const MAX_SUGGESTED_REVIEWS = 6;
const MAX_RISK_LINES = 4;
const MAX_PRIORITY_RISKS = 5;
const MAX_CATALOG_TEASER = 4;
const HIGH_RECIPE_EXPOSURE_MIN = 3;

type CatalogRow = {
  id: string;
  name: string;
  current_price?: number | null;
};

export type SuggestedOperationalReview = {
  ingredientId: string;
  name: string;
  action: string;
  detail: string;
  queue: OperationalListFilter;
};

export type OperationalRiskLine = {
  id: string;
  text: string;
};

export type OperationalPriorityRisk = {
  id: string;
  ingredientId: string;
  name: string;
  context: string;
  highImpact: boolean;
  queue: OperationalListFilter;
};

export type CatalogConfirmationTeaserItem = {
  ingredientId: string;
  name: string;
  detail: string;
};

export type InitialOperationalBrief = {
  catalogStable: boolean;
  suggestedReviews: SuggestedOperationalReview[];
  highestRisks: OperationalRiskLine[];
  priorityRisks: OperationalPriorityRisk[];
  catalogConfirmationTeaser: CatalogConfirmationTeaserItem[];
};

export type BuildInitialOperationalBriefInput = {
  catalog: readonly CatalogRow[];
  recipeCountById: Record<string, number>;
  priceRefreshAtByIngredientId: Record<string, string | null>;
  lastPurchaseAtByIngredientId: Record<string, string | null>;
  duplicateIngredientIds: ReadonlySet<string>;
  unusedReviewIds: ReadonlySet<string>;
};

type ScoredSuggestion = SuggestedOperationalReview & { score: number };

function pricingInputForRow(
  row: CatalogRow,
  priceRefreshAtByIngredientId: Record<string, string | null>,
  lastPurchaseAtByIngredientId: Record<string, string | null>,
) {
  return buildPricingFreshnessInputForRow(
    row,
    priceRefreshAtByIngredientId,
    lastPurchaseAtByIngredientId,
  );
}

function hasPricingRisk120Plus(
  row: CatalogRow,
  priceRefreshAtByIngredientId: Record<string, string | null>,
  lastPurchaseAtByIngredientId: Record<string, string | null>,
): boolean {
  const snap = derivePricingFreshnessSnapshot(
    pricingInputForRow(row, priceRefreshAtByIngredientId, lastPurchaseAtByIngredientId),
  );
  return snap.daysSince != null && snap.daysSince >= HIGH_PRICING_RISK_DAYS;
}

function buildSuggestedReviews(input: BuildInitialOperationalBriefInput): SuggestedOperationalReview[] {
  const scored: ScoredSuggestion[] = [];

  for (const row of input.catalog) {
    const pricingInput = pricingInputForRow(
      row,
      input.priceRefreshAtByIngredientId,
      input.lastPurchaseAtByIngredientId,
    );
    const snap = derivePricingFreshnessSnapshot(pricingInput);
    const displayName = formatCanonicalIngredientDisplayName(row.name);

    if (isCatalogConfirmationForReview(pricingInput)) {
      const days = snap.daysSince;
      scored.push({
        score: 0,
        ingredientId: row.id,
        name: displayName,
        action: "Confirm catalog price",
        detail:
          days != null
            ? `Recent purchase ${days} day${days === 1 ? "" : "s"} ago · pack not applied`
            : "Recent invoice · pack not applied",
        queue: "catalog-confirmation",
      });
      continue;
    }

    if (input.duplicateIngredientIds.has(row.id)) {
      scored.push({
        score: 2,
        ingredientId: row.id,
        name: displayName,
        action: "Compare duplicate cluster",
        detail: "Similar names in catalog",
        queue: "duplicates",
      });
      continue;
    }

    if (isStaleForPriceReview(pricingInput)) {
      const days = snap.daysSince;
      const critical = snap.level === "critical";
      scored.push({
        score: critical ? 1 : 3,
        ingredientId: row.id,
        name: displayName,
        action: "Refresh stale pricing",
        detail:
          days != null
            ? `No confirmed purchase in ${days} days`
            : "No confirmed purchase on record",
        queue: "stale-prices",
      });
      continue;
    }

    if (input.unusedReviewIds.has(row.id)) {
      scored.push({
        score: 4,
        ingredientId: row.id,
        name: displayName,
        action: "Review unused entry",
        detail: "No recipes or recent purchases",
        queue: "unused",
      });
    }
  }

  const seen = new Set<string>();
  const deduped: ScoredSuggestion[] = [];
  for (const item of scored.sort((a, b) => a.score - b.score || a.name.localeCompare(b.name))) {
    if (seen.has(item.ingredientId)) continue;
    seen.add(item.ingredientId);
    deduped.push(item);
    if (deduped.length >= MAX_SUGGESTED_REVIEWS) break;
  }

  return deduped.map(({ score: _score, ...rest }) => rest);
}

function buildHighestRisks(input: BuildInitialOperationalBriefInput): OperationalRiskLine[] {
  const lines: OperationalRiskLine[] = [];

  const pricing120Count = input.catalog.filter((row) =>
    hasPricingRisk120Plus(
      row,
      input.priceRefreshAtByIngredientId,
      input.lastPurchaseAtByIngredientId,
    ),
  ).length;

  if (pricing120Count > 0) {
    lines.push({
      id: "pricing-120",
      text:
        pricing120Count === 1
          ? "1 ingredient · pricing signal 120+ days old"
          : `${pricing120Count} ingredients · pricing signals 120+ days old`,
    });
  }

  const clusters = findOperationalDuplicateClusters(
    input.catalog.map((row) => ({
      id: row.id,
      name: row.name,
      normalized_name: row.name.toLowerCase(),
    })),
  );
  if (clusters.length > 0) {
    const ingredientCount = clusters.reduce((sum, c) => sum + c.ingredientIds.length, 0);
    lines.push({
      id: "duplicate-clusters",
      text:
        clusters.length === 1
          ? `1 duplicate cluster · ${ingredientCount} ingredient${ingredientCount === 1 ? "" : "s"}`
          : `${clusters.length} duplicate clusters · ${ingredientCount} ingredients`,
    });
  }

  const atRiskIds = new Set<string>();
  for (const row of input.catalog) {
    const pricingInput = pricingInputForRow(
      row,
      input.priceRefreshAtByIngredientId,
      input.lastPurchaseAtByIngredientId,
    );
    if (
      input.duplicateIngredientIds.has(row.id) ||
      isStaleForPriceReview(pricingInput) ||
      hasPricingRisk120Plus(
        row,
        input.priceRefreshAtByIngredientId,
        input.lastPurchaseAtByIngredientId,
      )
    ) {
      atRiskIds.add(row.id);
    }
  }

  const highExposure = input.catalog
    .filter(
      (row) =>
        (input.recipeCountById[row.id] ?? 0) >= HIGH_RECIPE_EXPOSURE_MIN && atRiskIds.has(row.id),
    )
    .sort(
      (a, b) =>
        (input.recipeCountById[b.id] ?? 0) - (input.recipeCountById[a.id] ?? 0) ||
        a.name.localeCompare(b.name),
    )
    .slice(0, 3);

  if (highExposure.length > 0) {
    const names = highExposure
      .map((row) => formatCanonicalIngredientDisplayName(row.name))
      .join(", ");
    const recipeCounts = highExposure.map((row) => input.recipeCountById[row.id] ?? 0);
    const maxRecipes = Math.max(...recipeCounts);
    lines.push({
      id: "recipe-exposure",
      text: `${names} — ${maxRecipes}+ recipes each with pricing risk`,
    });
  }

  return lines.slice(0, MAX_RISK_LINES);
}

function isHighImpactReview(
  ingredientId: string,
  queue: OperationalListFilter,
  input: BuildInitialOperationalBriefInput,
  pricingInput: ReturnType<typeof pricingInputForRow>,
): boolean {
  if ((input.recipeCountById[ingredientId] ?? 0) >= HIGH_RECIPE_EXPOSURE_MIN) return true;
  if (queue === "stale-prices") {
    return derivePricingFreshnessSnapshot(pricingInput).level === "critical";
  }
  return false;
}

function buildPriorityRisks(
  suggestedReviews: SuggestedOperationalReview[],
  input: BuildInitialOperationalBriefInput,
): OperationalPriorityRisk[] {
  return suggestedReviews.slice(0, MAX_PRIORITY_RISKS).map((item) => {
    const pricingInput = pricingInputForRow(
      input.catalog.find((row) => row.id === item.ingredientId) ?? {
        id: item.ingredientId,
        name: item.name,
      },
      input.priceRefreshAtByIngredientId,
      input.lastPurchaseAtByIngredientId,
    );
    return {
      id: `priority-${item.ingredientId}`,
      ingredientId: item.ingredientId,
      name: item.name,
      context: item.detail,
      highImpact: isHighImpactReview(item.ingredientId, item.queue, input, pricingInput),
      queue: item.queue,
    };
  });
}

function buildCatalogConfirmationTeaser(
  input: BuildInitialOperationalBriefInput,
): CatalogConfirmationTeaserItem[] {
  const items: CatalogConfirmationTeaserItem[] = [];
  for (const row of input.catalog) {
    const pricingInput = pricingInputForRow(
      row,
      input.priceRefreshAtByIngredientId,
      input.lastPurchaseAtByIngredientId,
    );
    if (!isCatalogConfirmationForReview(pricingInput)) continue;
    const snap = derivePricingFreshnessSnapshot(pricingInput);
    const days = snap.daysSince;
    items.push({
      ingredientId: row.id,
      name: formatCanonicalIngredientDisplayName(row.name),
      detail:
        days != null
          ? `Recent purchase ${days} day${days === 1 ? "" : "s"} ago · pack not applied`
          : "Recent invoice · pack not applied",
    });
  }
  return items
    .sort((a, b) => a.name.localeCompare(b.name))
    .slice(0, MAX_CATALOG_TEASER);
}

export function buildInitialOperationalBrief(
  input: BuildInitialOperationalBriefInput,
): InitialOperationalBrief {
  const suggestedReviews = buildSuggestedReviews(input);
  const highestRisks = buildHighestRisks(input);
  const priorityRisks = buildPriorityRisks(suggestedReviews, input);
  const catalogConfirmationTeaser = buildCatalogConfirmationTeaser(input);
  const catalogStable = suggestedReviews.length === 0 && highestRisks.length === 0;
  return {
    catalogStable,
    suggestedReviews,
    highestRisks,
    priorityRisks,
    catalogConfirmationTeaser,
  };
}
