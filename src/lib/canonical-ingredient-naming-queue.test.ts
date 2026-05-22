import { beforeEach, describe, expect, it, vi } from "vitest";
import type { IngredientCanonicalInput } from "./ingredient-canonical";
import { buildActionableCanonicalNamingQueue } from "./canonical-ingredient-naming-queue";
import {
  dismissCanonicalSuggestion,
  markIntentionalCanonicalName,
} from "./canonical-ingredient-quality-storage";

function ingredient(
  id: string,
  name: string,
  normalized_name?: string,
): IngredientCanonicalInput {
  return { id, name, normalized_name: normalized_name ?? name.toLowerCase() };
}

const storage = new Map<string, string>();

describe("buildActionableCanonicalNamingQueue", () => {
  beforeEach(() => {
    storage.clear();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => {
        storage.set(key, value);
      },
      removeItem: (key: string) => {
        storage.delete(key);
      },
      clear: () => storage.clear(),
    });
    vi.stubGlobal("window", { localStorage });
  });

  it("includes shorthand names with high-confidence suggestions", () => {
    const queue = buildActionableCanonicalNamingQueue({
      catalog: [ingredient("shoe-1", "BAT SHOESTR")],
      userId: "user-1",
    });
    expect(queue.map((entry) => entry.ingredientId)).toEqual(["shoe-1"]);
    expect(queue[0]?.suggestion.suggestedName).toBe("Batata shoestring");
  });

  it("excludes operationally readable catalog names", () => {
    const queue = buildActionableCanonicalNamingQueue({
      catalog: [
        ingredient("beef-1", "Acém novilho extra s/ osso", "acem novilho extra s osso"),
        ingredient("shoe-1", "BAT SHOESTR"),
      ],
      userId: "user-1",
    });
    expect(queue.map((entry) => entry.ingredientId)).toEqual(["shoe-1"]);
  });

  it("excludes dismissed and intentional ingredients", () => {
    dismissCanonicalSuggestion("user-1", "dismissed");
    markIntentionalCanonicalName("user-1", "intentional");
    const queue = buildActionableCanonicalNamingQueue({
      catalog: [
        ingredient("dismissed", "BAC FAT"),
        ingredient("intentional", "OREG"),
        ingredient("active", "BAT SHOESTR"),
      ],
      userId: "user-1",
    });
    expect(queue.map((entry) => entry.ingredientId)).toEqual(["active"]);
  });

  it("uses confirmed alias lines as suggestion memory", () => {
    const queue = buildActionableCanonicalNamingQueue({
      catalog: [ingredient("shoe-1", "BAT SHOESTR")],
      userId: "user-1",
      confirmedAliases: { "BAT SHOESTR LINE": "shoe-1" },
    });
    expect(queue).toHaveLength(1);
    expect(queue[0]?.suggestion.suggestedName).toBe("Batata shoestring");
  });
});
