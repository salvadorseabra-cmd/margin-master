import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  dismissIngredientInsight,
  ingredientDismissedInsightsStorageKey,
  readIngredientDismissedInsights,
} from "./ingredient-dismissed-insights";

describe("ingredient-dismissed-insights", () => {
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
    expect(ingredientDismissedInsightsStorageKey(userId)).toBe(
      "marginly:ingredient-dismissed-insights:user-test",
    );
  });

  it("persists dismissed insight ids per ingredient", () => {
    const first = dismissIngredientInsight(userId, "ing-1", "insight:supplier-price-up");
    expect(first).toEqual(["insight:supplier-price-up"]);

    dismissIngredientInsight(userId, "ing-1", "insight:price-spread");
    expect(readIngredientDismissedInsights(userId)["ing-1"]).toEqual([
      "insight:supplier-price-up",
      "insight:price-spread",
    ]);
    expect(readIngredientDismissedInsights(userId)["ing-2"]).toBeUndefined();
  });

  it("does not duplicate ids when dismissing the same insight twice", () => {
    dismissIngredientInsight(userId, "ing-1", "insight:recipe-usage");
    dismissIngredientInsight(userId, "ing-1", "insight:recipe-usage");
    expect(readIngredientDismissedInsights(userId)["ing-1"]).toEqual(["insight:recipe-usage"]);
  });

  it("ignores blank insight ids", () => {
    dismissIngredientInsight(userId, "ing-1", "   ");
    expect(readIngredientDismissedInsights(userId)["ing-1"]).toBeUndefined();
  });
});
