import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  appendIngredientOperationalNote,
  ingredientOperationalNotesStorageKey,
  readIngredientOperationalNotes,
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
});
