const STORAGE_PREFIX = "marginly:ingredient-dismissed-insights:";

/** ingredientId → dismissed insight ids */
export type IngredientDismissedInsightsMap = Record<string, string[]>;

export function ingredientDismissedInsightsStorageKey(userId: string): string {
  return `${STORAGE_PREFIX}${userId}`;
}

export function readIngredientDismissedInsights(
  userId: string | undefined,
): IngredientDismissedInsightsMap {
  if (typeof window === "undefined" || !userId?.trim()) return {};
  try {
    const raw = window.localStorage.getItem(ingredientDismissedInsightsStorageKey(userId));
    if (!raw) return {};
    const parsed = JSON.parse(raw) as IngredientDismissedInsightsMap;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function writeIngredientDismissedInsights(
  userId: string,
  map: IngredientDismissedInsightsMap,
): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(ingredientDismissedInsightsStorageKey(userId), JSON.stringify(map));
}

export function dismissIngredientInsight(
  userId: string,
  ingredientId: string,
  insightId: string,
): string[] {
  const trimmedId = insightId.trim();
  if (!trimmedId) return readIngredientDismissedInsights(userId)[ingredientId] ?? [];

  const map = readIngredientDismissedInsights(userId);
  const existing = map[ingredientId] ?? [];
  if (existing.includes(trimmedId)) return existing;

  const next = [...existing, trimmedId];
  writeIngredientDismissedInsights(userId, { ...map, [ingredientId]: next });
  return next;
}
