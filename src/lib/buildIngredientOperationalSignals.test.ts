import { describe, expect, it } from "vitest";
import {
  buildIngredientOperationalSignals,
  countHiddenOperationalSignals,
  deriveMarginExposureScore,
  deriveOperationalMood,
  groupOperationalSignals,
  pickTopInsights,
  pickVisibleOperationalSignals,
} from "@/lib/buildIngredientOperationalSignals";

function purchaseRow(
  price: number,
  supplier: string,
  date = "2026-05-01",
): { itemId: string; supplierLabel: string; priceLabel: string; dateLabel: string } {
  return {
    itemId: `line-${price}-${supplier}`,
    supplierLabel: supplier,
    priceLabel: `€${price.toFixed(2)} / kg`,
    dateLabel: date,
  };
}

describe("buildIngredientOperationalSignals", () => {
  it("returns empty when no backing data", () => {
    expect(buildIngredientOperationalSignals({ ingredientId: "ing-1" })).toEqual([]);
  });

  it("emits recipe impact when recipes linked", () => {
    const signals = buildIngredientOperationalSignals({
      ingredientId: "ing-1",
      recipeCount: 4,
      recipeNames: ["Burger", "Wrap", "Salad"],
      maxContributionPct: 62,
      primaryRecipeName: "Burger",
    });
    expect(signals.some((s) => s.label === "On the menu in 4 recipes")).toBe(true);
    expect(signals.some((s) => s.id === "primary-cost-driver")).toBe(true);
  });

  it("emits change-oriented headline from history row", () => {
    const signals = buildIngredientOperationalSignals({
      ingredientId: "ing-1",
      ingredientName: "Beef",
      latestHistoryRow: {
        id: "h1",
        ingredient_id: "ing-1",
        invoice_id: null,
        ingredient_name: "Beef",
        supplier_name: "Metro",
        ingredient_unit: "kg",
        previous_price: 10,
        new_price: 12,
        delta: 2,
        delta_percent: 20,
        created_at: new Date().toISOString(),
      },
    });
    expect(signals.some((s) => s.label === "Beef cost increased 20% since your last invoice")).toBe(
      true,
    );
  });

  it("flags stale invoice pricing", () => {
    const staleDate = new Date(Date.now() - 60 * 86_400_000).toISOString();
    const signals = buildIngredientOperationalSignals({
      ingredientId: "ing-1",
      recipeCount: 2,
      lastPriceUpdateAt: staleDate,
      staleThresholdDays: 45,
    });
    expect(signals.some((s) => s.id === "stale-invoice")).toBe(true);
  });

  it("detects single supplier without volatility when not on menu", () => {
    const signals = buildIngredientOperationalSignals({
      ingredientId: "ing-1",
      recentPurchases: [
        purchaseRow(5, "Metro", "2026-05-10"),
        purchaseRow(8, "Metro", "2026-04-01"),
      ],
    });
    expect(signals.some((s) => s.id === "single-supplier")).toBe(true);
    expect(signals.some((s) => s.id === "volatile-pricing")).toBe(false);
  });

  it("skips recipe impact for a single recipe without price risk", () => {
    const signals = buildIngredientOperationalSignals({
      ingredientId: "ing-1",
      recipeCount: 1,
    });
    expect(signals.some((s) => s.id === "recipe-impact")).toBe(false);
  });
});

describe("pickTopInsights", () => {
  it("returns only pricing tier when pricing signals exist", () => {
    const picked = pickTopInsights(
      [
        { id: "a", priority: 90, tier: "pricing" as const },
        { id: "b", priority: 30, tier: "confidence" as const },
      ],
      3,
    );
    expect(picked.map((p) => p.id)).toEqual(["a"]);
  });

  it("falls through to lower tiers when higher is empty", () => {
    const picked = pickTopInsights(
      [{ id: "b", priority: 30, tier: "confidence" as const }],
      3,
    );
    expect(picked.map((p) => p.id)).toEqual(["b"]);
  });
});

describe("deriveOperationalMood", () => {
  it("returns RISK when negative pricing signals hit the menu", () => {
    const mood = deriveOperationalMood({
      signals: [
        {
          id: "price-vs-previous",
          category: "pricing",
          label: "Beef cost increased 20% since your last invoice",
          tone: "negative",
          priority: 95,
          tier: "pricing",
        },
      ],
      recipeCount: 3,
      marginExposureScore: 70,
    });
    expect(mood).toBe("RISK");
  });
});

describe("groupOperationalSignals", () => {
  it("groups by category with stable order", () => {
    const signals = buildIngredientOperationalSignals({
      ingredientId: "ing-1",
      recipeCount: 2,
      recentPurchases: [purchaseRow(5, "A"), purchaseRow(7, "B")],
      latestHistoryRow: {
        id: "h1",
        ingredient_id: "ing-1",
        invoice_id: null,
        ingredient_name: "X",
        supplier_name: null,
        ingredient_unit: "kg",
        previous_price: 5,
        new_price: 6,
        delta: 1,
        delta_percent: 20,
        created_at: new Date().toISOString(),
      },
    });
    const groups = groupOperationalSignals(signals);
    expect(groups.length).toBeGreaterThan(0);
    expect(groups[0]?.category).toBe("pricing");
  });

  it("limits visible signals until expanded", () => {
    const signals = buildIngredientOperationalSignals({
      ingredientId: "ing-1",
      recipeCount: 5,
      maxContributionPct: 65,
      primaryRecipeName: "Burger",
      recentPurchases: [purchaseRow(5, "A"), purchaseRow(8, "B"), purchaseRow(6, "C")],
      latestHistoryRow: {
        id: "h1",
        ingredient_id: "ing-1",
        invoice_id: null,
        ingredient_name: "X",
        supplier_name: null,
        ingredient_unit: "kg",
        previous_price: 5,
        new_price: 7,
        delta: 2,
        delta_percent: 40,
        created_at: new Date().toISOString(),
      },
      volatileIngredientIds: new Set(["ing-1"]),
      lastPriceUpdateAt: new Date(Date.now() - 50 * 86_400_000).toISOString(),
    });
    expect(pickVisibleOperationalSignals(signals, false)).toHaveLength(3);
    expect(countHiddenOperationalSignals(signals, false)).toBeGreaterThan(0);
    expect(pickVisibleOperationalSignals(signals, true).length).toBe(signals.length);
  });
});

describe("deriveMarginExposureScore", () => {
  it("returns null without inputs", () => {
    expect(deriveMarginExposureScore({})).toBeNull();
  });

  it("scores combined exposure", () => {
    const score = deriveMarginExposureScore({
      recipeCount: 5,
      maxContributionPct: 72,
      priceIncreasePct: 15,
    });
    expect(score).toBeGreaterThanOrEqual(65);
  });
});
