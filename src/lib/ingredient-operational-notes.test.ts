import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  appendIngredientOperationalNote,
  ingredientOperationalNotesStorageKey,
  readIngredientOperationalNotes,
  removeIngredientOperationalNote,
} from "./ingredient-operational-notes";

describe("ingredient-operational-notes", () => {
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
    expect(ingredientOperationalNotesStorageKey(userId)).toBe(
      "marginly:ingredient-operational-notes:user-test",
    );
  });

  it("appends notes per ingredient", () => {
    const first = appendIngredientOperationalNote(userId, "ing-1", "Watch Metro pricing");
    expect(first).toEqual(["Watch Metro pricing"]);

    const second = appendIngredientOperationalNote(userId, "ing-1", "  Seasonal spike  ");
    expect(second).toEqual(["Watch Metro pricing", "Seasonal spike"]);

    expect(readIngredientOperationalNotes(userId)["ing-1"]).toEqual(second);
    expect(readIngredientOperationalNotes(userId)["ing-2"]).toBeUndefined();
  });

  it("removes a note by index and persists the rest", () => {
    appendIngredientOperationalNote(userId, "ing-1", "First");
    appendIngredientOperationalNote(userId, "ing-1", "Second");
    appendIngredientOperationalNote(userId, "ing-1", "Third");

    const remaining = removeIngredientOperationalNote(userId, "ing-1", 1);
    expect(remaining).toEqual(["First", "Third"]);
    expect(readIngredientOperationalNotes(userId)["ing-1"]).toEqual(["First", "Third"]);
  });

  it("drops the ingredient key when the last note is removed", () => {
    appendIngredientOperationalNote(userId, "ing-1", "Only note");

    const remaining = removeIngredientOperationalNote(userId, "ing-1", 0);
    expect(remaining).toEqual([]);
    expect(readIngredientOperationalNotes(userId)["ing-1"]).toBeUndefined();
  });

  it("ignores out-of-range indices", () => {
    appendIngredientOperationalNote(userId, "ing-1", "Stable");

    expect(removeIngredientOperationalNote(userId, "ing-1", -1)).toEqual(["Stable"]);
    expect(removeIngredientOperationalNote(userId, "ing-1", 3)).toEqual(["Stable"]);
    expect(readIngredientOperationalNotes(userId)["ing-1"]).toEqual(["Stable"]);
  });
});
