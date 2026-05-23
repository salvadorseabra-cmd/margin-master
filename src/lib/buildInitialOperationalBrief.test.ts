import { describe, expect, it } from "vitest";
import {
  buildInitialOperationalBrief,
  HIGH_PRICING_RISK_DAYS,
} from "@/lib/buildInitialOperationalBrief";

describe("buildInitialOperationalBrief", () => {
  it("returns stable brief when catalog has no operational issues", () => {
    const purchaseAt = new Date(Date.now() - 10 * 86_400_000).toISOString().slice(0, 10);
    const refreshAt = new Date(Date.now() - 3 * 86_400_000).toISOString();
    const brief = buildInitialOperationalBrief({
      catalog: [{ id: "a", name: "Salt", current_price: 1 }],
      recipeCountById: { a: 0 },
      priceRefreshAtByIngredientId: { a: refreshAt },
      lastPurchaseAtByIngredientId: { a: purchaseAt },
      duplicateIngredientIds: new Set(),
      unusedReviewIds: new Set(),
    });
    expect(brief.catalogStable).toBe(true);
    expect(brief.suggestedReviews).toHaveLength(0);
    expect(brief.highestRisks).toHaveLength(0);
    expect(brief.priorityRisks).toHaveLength(0);
    expect(brief.catalogConfirmationTeaser).toHaveLength(0);
  });

  it("prioritizes catalog confirmation and stale pricing in suggested reviews", () => {
    const recentPurchase = new Date(Date.now() - 5 * 86_400_000).toISOString().slice(0, 10);
    const oldPurchase = new Date(Date.now() - 130 * 86_400_000).toISOString().slice(0, 10);

    const brief = buildInitialOperationalBrief({
      catalog: [
        { id: "stale", name: "Olive oil", current_price: 4 },
        { id: "confirm", name: "Butter", current_price: 2 },
      ],
      recipeCountById: { stale: 1, confirm: 0 },
      priceRefreshAtByIngredientId: {
        stale: "2020-01-01T00:00:00Z",
        confirm: "2020-01-01T00:00:00Z",
      },
      lastPurchaseAtByIngredientId: {
        stale: oldPurchase,
        confirm: recentPurchase,
      },
      duplicateIngredientIds: new Set(),
      unusedReviewIds: new Set(),
    });

    expect(brief.catalogStable).toBe(false);
    expect(brief.suggestedReviews[0]?.queue).toBe("catalog-confirmation");
    expect(brief.suggestedReviews.some((r) => r.queue === "stale-prices")).toBe(true);
    expect(brief.highestRisks.some((r) => r.text.includes("120+"))).toBe(true);
    expect(brief.priorityRisks.length).toBeGreaterThan(0);
    expect(brief.catalogConfirmationTeaser.some((t) => t.name === "Butter")).toBe(true);
    expect(HIGH_PRICING_RISK_DAYS).toBe(120);
  });
});
