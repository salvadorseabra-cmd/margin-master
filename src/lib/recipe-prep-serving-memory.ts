import {
  normalizeRecipeUsageUnitOption,
  type RecipeUsageUnitOption,
} from "@/lib/recipe-usage-unit-memory";

const STORAGE_PREFIX = "marginly:prep-serving-size:";

export type PrepServingSizeMemory = {
  quantity: number;
  unit: RecipeUsageUnitOption;
};

export type PrepServingSizeMemoryMap = Record<string, PrepServingSizeMemory>;

export function prepServingSizeMemoryStorageKey(userId: string): string {
  return `${STORAGE_PREFIX}${userId}`;
}

export function readPrepServingSizeMemory(userId: string | undefined): PrepServingSizeMemoryMap {
  if (typeof window === "undefined" || !userId?.trim()) return {};
  try {
    const raw = window.localStorage.getItem(prepServingSizeMemoryStorageKey(userId));
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!parsed || typeof parsed !== "object") return {};
    const map: PrepServingSizeMemoryMap = {};
    for (const [recipeId, entry] of Object.entries(parsed)) {
      if (!entry || typeof entry !== "object") continue;
      const row = entry as { quantity?: unknown; unit?: unknown };
      const quantity = Number(row.quantity);
      const unit = normalizeRecipeUsageUnitOption(
        typeof row.unit === "string" ? row.unit : null,
      );
      if (!recipeId?.trim() || !Number.isFinite(quantity) || quantity <= 0 || !unit) continue;
      map[recipeId] = { quantity, unit };
    }
    return map;
  } catch {
    return {};
  }
}

export function writePrepServingSizeMemory(
  userId: string,
  memory: PrepServingSizeMemoryMap,
): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(prepServingSizeMemoryStorageKey(userId), JSON.stringify(memory));
}

export function getRememberedPrepServingSize(
  userId: string | undefined,
  recipeId: string,
): PrepServingSizeMemory | null {
  if (!userId?.trim() || !recipeId?.trim()) return null;
  return readPrepServingSizeMemory(userId)[recipeId] ?? null;
}

export function rememberPrepServingSize(
  userId: string,
  recipeId: string,
  quantity: number,
  unit: string,
): void {
  const normalizedUnit = normalizeRecipeUsageUnitOption(unit);
  if (!recipeId?.trim() || !normalizedUnit) return;
  const qty = Number(quantity);
  if (!Number.isFinite(qty) || qty <= 0) return;
  const memory = readPrepServingSizeMemory(userId);
  writePrepServingSizeMemory(userId, {
    ...memory,
    [recipeId]: { quantity: qty, unit: normalizedUnit },
  });
}
