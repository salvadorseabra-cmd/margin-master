import { inferRecipeUsageUnit } from "@/lib/recipe-usage-unit-inference";

const STORAGE_PREFIX = "marginly:ingredient-recipe-usage-unit:";

/** Allowed recipe line usage units (matches persisted `recipe_ingredients.unit` values). */
export const RECIPE_USAGE_UNIT_OPTIONS = ["ml", "L", "g", "kg", "un"] as const;

export type RecipeUsageUnitOption = (typeof RECIPE_USAGE_UNIT_OPTIONS)[number];

export type RecipeUsageUnitMemoryMap = Record<string, RecipeUsageUnitOption>;

export function recipeUsageUnitMemoryStorageKey(userId: string): string {
  return `${STORAGE_PREFIX}${userId}`;
}

export function isRecipeUsageUnitOption(value: unknown): value is RecipeUsageUnitOption {
  return (
    typeof value === "string" &&
    (RECIPE_USAGE_UNIT_OPTIONS as readonly string[]).includes(value)
  );
}

/** Map legacy / variant labels to a select option when loading saved lines. */
export function normalizeRecipeUsageUnitOption(
  unit: string | null | undefined,
): RecipeUsageUnitOption | null {
  const raw = unit?.trim();
  if (!raw) return null;
  if (isRecipeUsageUnitOption(raw)) return raw;
  const lower = raw.toLowerCase();
  if (lower === "l" || lower === "lt" || lower === "ltr" || lower === "litro" || lower === "litros") {
    return "L";
  }
  if (lower === "ml" || lower === "cl") return "ml";
  if (lower === "g" || lower === "gr" || lower === "grs") return "g";
  if (lower === "kg" || lower === "kgs") return "kg";
  if (lower === "un" || lower === "unid" || lower === "unids" || lower === "unit") return "un";
  return null;
}

export function readRecipeUsageUnitMemory(
  userId: string | undefined,
): RecipeUsageUnitMemoryMap {
  if (typeof window === "undefined" || !userId?.trim()) return {};
  try {
    const raw = window.localStorage.getItem(recipeUsageUnitMemoryStorageKey(userId));
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!parsed || typeof parsed !== "object") return {};
    const map: RecipeUsageUnitMemoryMap = {};
    for (const [ingredientId, unit] of Object.entries(parsed)) {
      if (isRecipeUsageUnitOption(unit)) map[ingredientId] = unit;
    }
    return map;
  } catch {
    return {};
  }
}

export function writeRecipeUsageUnitMemory(
  userId: string,
  memory: RecipeUsageUnitMemoryMap,
): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(recipeUsageUnitMemoryStorageKey(userId), JSON.stringify(memory));
}

export function getRememberedRecipeUsageUnit(
  userId: string | undefined,
  ingredientId: string,
): RecipeUsageUnitOption | null {
  if (!userId?.trim() || !ingredientId?.trim()) return null;
  const unit = readRecipeUsageUnitMemory(userId)[ingredientId];
  return unit ?? null;
}

export function rememberRecipeUsageUnit(
  userId: string,
  ingredientId: string,
  unit: string,
): void {
  const normalized = normalizeRecipeUsageUnitOption(unit);
  if (!ingredientId?.trim() || !normalized) return;
  const memory = readRecipeUsageUnitMemory(userId);
  writeRecipeUsageUnitMemory(userId, { ...memory, [ingredientId]: normalized });
}

/**
 * Default unit when adding an ingredient line: saved preference, else name/purchase heuristic.
 */
export function resolveRecipeUsageUnitForIngredient(
  userId: string | undefined,
  ingredientId: string,
  ingredientName: string,
  purchaseUnit?: string | null,
): RecipeUsageUnitOption {
  const remembered = getRememberedRecipeUsageUnit(userId, ingredientId);
  if (remembered) return remembered;
  const inferred = inferRecipeUsageUnit(ingredientName, purchaseUnit);
  return normalizeRecipeUsageUnitOption(inferred) ?? "g";
}
