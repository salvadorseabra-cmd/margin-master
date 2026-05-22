type IngredientGlanceRow = {
  id: string;
  current_price?: number | null;
  updated_at?: string | null;
};

type PriceActivityGlance = {
  created_at?: string | null;
  delta_percent?: number | null;
};

type RecipeLinkGlance = {
  count: number;
  recentlyLinked: boolean;
};

export type IngredientListGlanceSignal =
  | "volatile"
  | "stale-price"
  | "recipe-exposure"
  | "purchase-fresh";

const STALE_DAYS = 90;
const FRESH_PURCHASE_DAYS = 45;
const HIGH_RECIPE_EXPOSURE = 3;

function isRecentIsoDate(value: string | null | undefined, days: number): boolean {
  if (!value) return false;
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return false;
  const ageMs = Date.now() - timestamp;
  return ageMs >= 0 && ageMs <= days * 86_400_000;
}

function isStaleIsoDate(value: string | null | undefined, days: number): boolean {
  if (!value) return true;
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return true;
  return Date.now() - timestamp > days * 86_400_000;
}

function hasCatalogPrice(ingredient: IngredientGlanceRow): boolean {
  const price = Number(ingredient.current_price);
  return Number.isFinite(price) && price > 0;
}

function hasSignificantPriceDelta(activity: PriceActivityGlance | undefined): boolean {
  if (!activity) return false;
  const pct = activity.delta_percent;
  if (typeof pct === "number" && Math.abs(pct) >= 5) return true;
  return false;
}

/** Tiny list-row signals — at most four, only when data supports them. */
export function deriveIngredientListGlanceSignals(input: {
  ingredient: IngredientGlanceRow;
  priceActivity?: PriceActivityGlance;
  recipeLinkActivity?: RecipeLinkGlance;
  volatileIngredientIds?: ReadonlySet<string>;
}): IngredientListGlanceSignal[] {
  const signals: IngredientListGlanceSignal[] = [];
  const { ingredient, priceActivity, recipeLinkActivity, volatileIngredientIds } = input;

  if (
    volatileIngredientIds?.has(ingredient.id) ||
    hasSignificantPriceDelta(priceActivity)
  ) {
    signals.push("volatile");
  }

  const pricingRecency = priceActivity?.created_at ?? ingredient.updated_at ?? null;
  if (hasCatalogPrice(ingredient) && isStaleIsoDate(pricingRecency, STALE_DAYS)) {
    signals.push("stale-price");
  }

  const recipeCount = recipeLinkActivity?.count ?? 0;
  if (recipeCount >= HIGH_RECIPE_EXPOSURE) {
    signals.push("recipe-exposure");
  }

  if (
    isRecentIsoDate(priceActivity?.created_at, FRESH_PURCHASE_DAYS) ||
    recipeLinkActivity?.recentlyLinked
  ) {
    signals.push("purchase-fresh");
  }

  return signals;
}

export function ingredientListGlanceDotClassName(
  signal: IngredientListGlanceSignal,
): string {
  switch (signal) {
    case "volatile":
      return "bg-warning";
    case "stale-price":
      return "bg-muted-foreground/45";
    case "recipe-exposure":
      return "bg-primary/80";
    case "purchase-fresh":
      return "bg-success/90";
  }
}

export function ingredientListGlanceTitle(signal: IngredientListGlanceSignal): string {
  switch (signal) {
    case "volatile":
      return "Volatile or shifting price";
    case "stale-price":
      return "Catalog price may be outdated";
    case "recipe-exposure":
      return "Used in several recipes — margin sensitive";
    case "purchase-fresh":
      return "Recent purchase or price activity";
  }
}
