const STORAGE_PREFIX = "marginly:ingredient-operational-notes:";

export type IngredientOperationalNotesMap = Record<string, string[]>;

export function ingredientOperationalNotesStorageKey(userId: string): string {
  return `${STORAGE_PREFIX}${userId}`;
}

export function readIngredientOperationalNotes(userId: string | undefined): IngredientOperationalNotesMap {
  if (typeof window === "undefined" || !userId?.trim()) return {};
  try {
    const raw = window.localStorage.getItem(ingredientOperationalNotesStorageKey(userId));
    if (!raw) return {};
    const parsed = JSON.parse(raw) as IngredientOperationalNotesMap;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function writeIngredientOperationalNotes(
  userId: string,
  notes: IngredientOperationalNotesMap,
): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(ingredientOperationalNotesStorageKey(userId), JSON.stringify(notes));
}

export function appendIngredientOperationalNote(
  userId: string,
  ingredientId: string,
  text: string,
): string[] {
  const trimmed = text.trim();
  if (!trimmed) return readIngredientOperationalNotes(userId)[ingredientId] ?? [];
  const map = readIngredientOperationalNotes(userId);
  const existing = map[ingredientId] ?? [];
  const next = [...existing, trimmed];
  writeIngredientOperationalNotes(userId, { ...map, [ingredientId]: next });
  return next;
}

export function removeIngredientOperationalNote(
  userId: string,
  ingredientId: string,
  noteIndex: number,
): string[] {
  const map = readIngredientOperationalNotes(userId);
  const existing = map[ingredientId] ?? [];
  if (noteIndex < 0 || noteIndex >= existing.length) return existing;
  const next = existing.filter((_, index) => index !== noteIndex);
  if (next.length === 0) {
    const { [ingredientId]: _removed, ...rest } = map;
    writeIngredientOperationalNotes(userId, rest);
  } else {
    writeIngredientOperationalNotes(userId, { ...map, [ingredientId]: next });
  }
  return next;
}
