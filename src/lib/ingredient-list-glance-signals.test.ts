import { describe, expect, it } from "vitest";
import {
  deriveIngredientListGlanceSignals,
  ingredientListGlanceTitle,
} from "@/lib/ingredient-list-glance-signals";

describe("ingredient-list-glance-signals", () => {
  it("returns at most four glance signals with titles", () => {
    const signals = deriveIngredientListGlanceSignals({
      ingredient: {
        id: "ing-1",
        current_price: 4.5,
        updated_at: "2020-01-01T00:00:00Z",
      },
      priceActivity: {
        created_at: new Date().toISOString(),
        delta_percent: 12,
      },
      recipeLinkActivity: { count: 4, recentlyLinked: true },
      volatileIngredientIds: new Set(["ing-1"]),
    });

    expect(signals.length).toBeLessThanOrEqual(4);
    expect(signals).toContain("volatile");
    expect(signals).toContain("recipe-exposure");
    expect(signals).toContain("purchase-fresh");
    expect(ingredientListGlanceTitle("stale-price")).toMatch(/outdated/i);
  });
});
