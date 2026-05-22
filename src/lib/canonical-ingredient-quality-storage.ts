/**
 * Per-user local preferences for canonical name improvement suggestions (Ingredients page).
 */

const DISMISSED_PREFIX = "marginly:canonical-suggestions-dismissed:";
const INTENTIONAL_PREFIX = "marginly:canonical-intentional-names:";

export type CanonicalSuggestionUserPrefs = {
  dismissedIngredientIds: string[];
  intentionalIngredientIds: string[];
};

export function dismissedCanonicalSuggestionsStorageKey(userId: string): string {
  return `${DISMISSED_PREFIX}${userId}`;
}

export function intentionalCanonicalNamesStorageKey(userId: string): string {
  return `${INTENTIONAL_PREFIX}${userId}`;
}

function parseIdList(raw: string | null): string[] {
  if (!raw?.trim()) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return [...new Set(parsed.map((id) => String(id).trim()).filter(Boolean))];
  } catch {
    return [];
  }
}

function readPrefs(userId: string): CanonicalSuggestionUserPrefs {
  if (typeof window === "undefined" || !userId?.trim()) {
    return { dismissedIngredientIds: [], intentionalIngredientIds: [] };
  }
  return {
    dismissedIngredientIds: parseIdList(
      window.localStorage.getItem(dismissedCanonicalSuggestionsStorageKey(userId)),
    ),
    intentionalIngredientIds: parseIdList(
      window.localStorage.getItem(intentionalCanonicalNamesStorageKey(userId)),
    ),
  };
}

function writeDismissed(userId: string, ids: string[]): void {
  if (typeof window === "undefined" || !userId?.trim()) return;
  window.localStorage.setItem(
    dismissedCanonicalSuggestionsStorageKey(userId),
    JSON.stringify([...new Set(ids.map((id) => id.trim()).filter(Boolean))]),
  );
}

function writeIntentional(userId: string, ids: string[]): void {
  if (typeof window === "undefined" || !userId?.trim()) return;
  window.localStorage.setItem(
    intentionalCanonicalNamesStorageKey(userId),
    JSON.stringify([...new Set(ids.map((id) => id.trim()).filter(Boolean))]),
  );
}

export function loadCanonicalSuggestionUserPrefs(userId: string): CanonicalSuggestionUserPrefs {
  return readPrefs(userId);
}

export function isCanonicalSuggestionDismissed(userId: string, ingredientId: string): boolean {
  const id = ingredientId?.trim();
  if (!id) return false;
  return readPrefs(userId).dismissedIngredientIds.includes(id);
}

export function dismissCanonicalSuggestion(userId: string, ingredientId: string): void {
  const id = ingredientId?.trim();
  if (!id) return;
  const prefs = readPrefs(userId);
  if (prefs.dismissedIngredientIds.includes(id)) return;
  writeDismissed(userId, [...prefs.dismissedIngredientIds, id]);
}

export function isIntentionalCanonicalName(userId: string, ingredientId: string): boolean {
  const id = ingredientId?.trim();
  if (!id) return false;
  return readPrefs(userId).intentionalIngredientIds.includes(id);
}

export function markIntentionalCanonicalName(userId: string, ingredientId: string): void {
  const id = ingredientId?.trim();
  if (!id) return;
  const prefs = readPrefs(userId);
  if (prefs.intentionalIngredientIds.includes(id)) return;
  writeIntentional(userId, [...prefs.intentionalIngredientIds, id]);
}

export function clearIntentionalCanonicalName(userId: string, ingredientId: string): void {
  const id = ingredientId?.trim();
  if (!id) return;
  const prefs = readPrefs(userId);
  writeIntentional(
    userId,
    prefs.intentionalIngredientIds.filter((entry) => entry !== id),
  );
}

export function shouldHideCanonicalNameSuggestion(userId: string, ingredientId: string): boolean {
  return (
    isCanonicalSuggestionDismissed(userId, ingredientId) ||
    isIntentionalCanonicalName(userId, ingredientId)
  );
}
