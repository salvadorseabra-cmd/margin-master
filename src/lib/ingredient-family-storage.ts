/**
 * Per-user local overrides for ingredient family classification (Ingredients detail panel).
 */

const STORAGE_PREFIX = "marginly:ingredient-families:";

export type IngredientFamilyUserOverrides = {
  /** ingredientId → forced familyId */
  byIngredientId: Record<string, string>;
};

export function ingredientFamiliesStorageKey(userId: string): string {
  return `${STORAGE_PREFIX}${userId}`;
}

function emptyOverrides(): IngredientFamilyUserOverrides {
  return { byIngredientId: {} };
}

function parseOverrides(raw: string | null): IngredientFamilyUserOverrides {
  if (!raw?.trim()) return emptyOverrides();
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return emptyOverrides();
    const byIngredientId = (parsed as { byIngredientId?: unknown }).byIngredientId;
    if (!byIngredientId || typeof byIngredientId !== "object") return emptyOverrides();
    const out: Record<string, string> = {};
    for (const [id, familyId] of Object.entries(byIngredientId)) {
      const key = id.trim();
      const value = String(familyId ?? "").trim();
      if (key && value) out[key] = value;
    }
    return { byIngredientId: out };
  } catch {
    return emptyOverrides();
  }
}

export function loadIngredientFamilyUserOverrides(userId: string): IngredientFamilyUserOverrides {
  if (typeof window === "undefined" || !userId?.trim()) return emptyOverrides();
  return parseOverrides(window.localStorage.getItem(ingredientFamiliesStorageKey(userId)));
}

export function getIngredientFamilyOverride(
  userId: string | undefined,
  ingredientId: string,
): string | null {
  if (!userId?.trim() || !ingredientId?.trim()) return null;
  return loadIngredientFamilyUserOverrides(userId).byIngredientId[ingredientId.trim()] ?? null;
}

export function setIngredientFamilyOverride(
  userId: string,
  ingredientId: string,
  familyId: string,
): void {
  const id = ingredientId?.trim();
  if (!id || typeof window === "undefined" || !userId?.trim()) return;
  const prefs = loadIngredientFamilyUserOverrides(userId);
  prefs.byIngredientId[id] = familyId;
  window.localStorage.setItem(ingredientFamiliesStorageKey(userId), JSON.stringify(prefs));
}

export function clearIngredientFamilyOverride(userId: string, ingredientId: string): void {
  const id = ingredientId?.trim();
  if (!id || typeof window === "undefined" || !userId?.trim()) return;
  const prefs = loadIngredientFamilyUserOverrides(userId);
  if (!(id in prefs.byIngredientId)) return;
  delete prefs.byIngredientId[id];
  window.localStorage.setItem(ingredientFamiliesStorageKey(userId), JSON.stringify(prefs));
}
