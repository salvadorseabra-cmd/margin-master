import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getRememberedRecipeUsageUnit,
  normalizeRecipeUsageUnitOption,
  readRecipeUsageUnitMemory,
  recipeUsageUnitMemoryStorageKey,
  rememberRecipeUsageUnit,
  resolveRecipeUsageUnitForIngredient,
} from "./recipe-usage-unit-memory";

describe("recipe-usage-unit-memory", () => {
  const userId = "user-test";
  let store: Record<string, string>;

  beforeEach(() => {
    store = {};
    const localStorage = {
      getItem: (key: string) => store[key] ?? null,
      setItem: (key: string, value: string) => {
        store[key] = value;
      },
      removeItem: (key: string) => {
        delete store[key];
      },
      clear: () => {
        store = {};
      },
    };
    vi.stubGlobal("localStorage", localStorage);
    vi.stubGlobal("window", { localStorage });
  });

  it("uses a marginly-prefixed storage key", () => {
    expect(recipeUsageUnitMemoryStorageKey(userId)).toBe(
      "marginly:ingredient-recipe-usage-unit:user-test",
    );
  });

  it("normalizes legacy unit labels for select options", () => {
    expect(normalizeRecipeUsageUnitOption("l")).toBe("L");
    expect(normalizeRecipeUsageUnitOption("ML")).toBe("ml");
    expect(normalizeRecipeUsageUnitOption("kg")).toBe("kg");
    expect(normalizeRecipeUsageUnitOption("cx")).toBeNull();
  });

  it("remembers and reads a unit per ingredient", () => {
    rememberRecipeUsageUnit(userId, "ing-1", "ml");
    expect(getRememberedRecipeUsageUnit(userId, "ing-1")).toBe("ml");
    expect(readRecipeUsageUnitMemory(userId)).toEqual({ "ing-1": "ml" });
  });

  it("ignores invalid units when remembering", () => {
    rememberRecipeUsageUnit(userId, "ing-1", "cx");
    expect(readRecipeUsageUnitMemory(userId)).toEqual({});
  });

  it("prefers memory over inference when resolving defaults", () => {
    rememberRecipeUsageUnit(userId, "ing-1", "un");
    expect(
      resolveRecipeUsageUnitForIngredient(userId, "ing-1", "MAIONESE HELLMANN'S 450ML", "un"),
    ).toBe("un");
  });

  it("falls back to inference when no memory exists", () => {
    expect(
      resolveRecipeUsageUnitForIngredient(userId, "ing-2", "MAIONESE HELLMANN'S 450ML", "un"),
    ).toBe("ml");
  });

  it("round-trips through localStorage", () => {
    rememberRecipeUsageUnit(userId, "ing-1", "L");
    expect(store[recipeUsageUnitMemoryStorageKey(userId)]).toContain('"ing-1":"L"');

    store = {};
    expect(getRememberedRecipeUsageUnit(userId, "ing-1")).toBeNull();

    store[recipeUsageUnitMemoryStorageKey(userId)] = JSON.stringify({ "ing-1": "kg" });
    expect(getRememberedRecipeUsageUnit(userId, "ing-1")).toBe("kg");
  });
});
