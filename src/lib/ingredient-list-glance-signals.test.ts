import { describe, expect, it } from "vitest";
import {
  formatIngredientListLastPurchaseColumn,
  formatIngredientListRowSubline,
  formatListPurchaseRecency,
  formatOperationalListRowDominantReason,
  pricingSnapshotForListRow,
} from "@/lib/ingredient-list-glance-signals";

describe("ingredient-list-glance-signals", () => {
  it("formats queue-scoped dominant lines without workflow jargon", () => {
    expect(formatOperationalListRowDominantReason({ listReviewMode: "duplicates" })).toBeNull();
    const fourDaysAgo = new Date(Date.now() - 4 * 86_400_000).toISOString().slice(0, 10);
    expect(
      formatOperationalListRowDominantReason({
        listReviewMode: "catalog-confirmation",
        purchaseGlance: { lastPurchaseAt: fourDaysAgo, supplierLabel: "Makro" },
      }),
    ).toMatch(/^Makro · \d+d ago$/);

    const daysAgo = 128;
    const purchaseDate = new Date(Date.now() - daysAgo * 86_400_000).toISOString().slice(0, 10);
    const snapshot = pricingSnapshotForListRow({
      ingredient: { id: "ing-1", current_price: 4 },
      pricingRecency: {
        priceRefreshAt: "2020-01-01T00:00:00Z",
        lastPurchaseAt: purchaseDate,
      },
    });
    expect(
      formatOperationalListRowDominantReason({
        listReviewMode: "stale-prices",
        pricingSnapshot: snapshot,
      }),
    ).toBe(`No purchase in ${snapshot.daysSince}d`);

    expect(
      formatOperationalListRowDominantReason({
        listReviewMode: "unused",
        aliasOnly: false,
      }),
    ).toBe("No recipe usage");
  });

  it("builds browse sublines from supplier only", () => {
    const fiveDaysAgo = new Date(Date.now() - 5 * 86_400_000).toISOString().slice(0, 10);
    expect(
      formatIngredientListRowSubline({
        listReviewMode: null,
        purchaseGlance: { lastPurchaseAt: fiveDaysAgo, supplierLabel: "Frilima" },
      }),
    ).toBe("Frilima");

    expect(
      formatIngredientListRowSubline({
        listReviewMode: null,
      }),
    ).toBeNull();
  });

  it("formats compact purchase recency for list rows", () => {
    const today = new Date().toISOString();
    const fiveDaysAgo = new Date(Date.now() - 5 * 86_400_000).toISOString().slice(0, 10);
    const longAgo = new Date(Date.now() - 128 * 86_400_000).toISOString().slice(0, 10);

    expect(formatListPurchaseRecency(today)).toBe("Today");
    expect(formatListPurchaseRecency(fiveDaysAgo)).toMatch(/^\d+d ago$/);
    expect(formatListPurchaseRecency(longAgo)).toMatch(/^12[78]d ago$/);
    expect(formatListPurchaseRecency(null)).toBe("—");
    expect(
      formatIngredientListLastPurchaseColumn({
        lastPurchaseAt: longAgo,
        supplierLabel: "Makro",
      }),
    ).toMatch(/^12[78]d ago$/);
  });
});
