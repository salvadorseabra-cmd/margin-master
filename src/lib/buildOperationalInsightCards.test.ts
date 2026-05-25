import { describe, expect, it } from "vitest";
import {
  buildOperationalInsightCards,
  operationalInsightCardClassName,
} from "@/lib/buildOperationalInsightCards";
import type { RecentPurchaseRow } from "@/lib/ingredient-purchase-memory";

function purchase(
  partial: Partial<RecentPurchaseRow> & Pick<RecentPurchaseRow, "itemId" | "priceLabel">,
): RecentPurchaseRow {
  return {
    supplierLabel: "Supplier A",
    dateLabel: "01/05/2026",
    productHint: null,
    ...partial,
  };
}

describe("buildOperationalInsightCards", () => {
  it("uses relative positioning shell for dismiss control overlay", () => {
    const className = operationalInsightCardClassName("recipe-usage");
    expect(className).toContain("relative");
    expect(className).not.toContain("group");
  });

  it("surfaces change-oriented copy with ingredient name and percent", () => {
    const cards = buildOperationalInsightCards({
      ingredientName: "Beef",
      recentPurchases: [
        purchase({
          itemId: "latest",
          supplierLabel: "Frilima",
          dateLabel: "18/05/2026",
          priceLabel: "€11.80",
        }),
        purchase({
          itemId: "prior",
          supplierLabel: "Makro",
          dateLabel: "01/04/2026",
          priceLabel: "€10.00",
        }),
      ],
      recipeCount: 2,
    });
    const priceUp = cards.find((c) => c.id === "insight:supplier-price-up");
    expect(priceUp?.text).toBe("Beef cost increased 18% since last invoice");
    expect(priceUp?.detail).toMatch(/Frilima/i);
  });

  it("caps visible insights at three by default", () => {
    const cards = buildOperationalInsightCards({
      ingredientName: "Beef",
      recentPurchases: [
        purchase({
          itemId: "latest",
          supplierLabel: "Frilima",
          dateLabel: "18/05/2026",
          priceLabel: "€12.00",
        }),
        purchase({
          itemId: "prior",
          supplierLabel: "Makro",
          dateLabel: "01/04/2026",
          priceLabel: "€8.00",
        }),
      ],
      aliasCount: 3,
      recipeCount: 4,
    });
    expect(cards.length).toBeLessThanOrEqual(3);
  });

  it("prefers pricing tier over supplier-changed when redundant", () => {
    const cards = buildOperationalInsightCards({
      recentPurchases: [
        purchase({
          itemId: "latest",
          supplierLabel: "Frilima",
          dateLabel: "18/05/2026",
          priceLabel: "€12.00",
        }),
        purchase({
          itemId: "prior",
          supplierLabel: "Makro",
          dateLabel: "01/04/2026",
          priceLabel: "€8.00",
        }),
      ],
      recipeCount: 0,
    });
    expect(cards.some((c) => c.id === "insight:supplier-price-up")).toBe(true);
    expect(cards.some((c) => c.id === "insight:supplier-changed")).toBe(false);
    expect(cards.every((c) => c.kind !== "supplier-changed")).toBe(true);
  });

  it("skips marginal recipe-usage and engine jargon", () => {
    const cards = buildOperationalInsightCards({
      recentPurchases: [
        purchase({ itemId: "a", priceLabel: "€5.00", dateLabel: "01/05/2026" }),
        purchase({ itemId: "b", priceLabel: "€5.10", dateLabel: "01/04/2026" }),
      ],
      recipeCount: 1,
    });
    const joined = cards.map((c) => `${c.text} ${c.detail ?? ""}`).join(" ");
    expect(cards.some((c) => c.id === "insight:recipe-usage")).toBe(false);
    expect(joined).not.toMatch(/aliases detected/i);
    expect(joined).not.toMatch(/catalog mapping/i);
    expect(joined).not.toMatch(/semantic/i);
    expect(joined).not.toMatch(/volatility detected/i);
  });

  it("shows aliases and unused when only confidence-tier data exists", () => {
    const cards = buildOperationalInsightCards({
      recentPurchases: [],
      aliasCount: 3,
      recipeCount: 0,
    });
    expect(cards.some((c) => c.id === "insight:multiple-aliases")).toBe(true);
    expect(cards.some((c) => c.id === "insight:unused-in-recipes")).toBe(true);
    expect(cards.some((c) => /Several invoice names/i.test(c.text))).toBe(true);
  });

  it("assigns stable insight-prefixed ids for dismiss persistence", () => {
    const cards = buildOperationalInsightCards({
      recentPurchases: [
        purchase({
          itemId: "latest",
          supplierLabel: "Frilima",
          dateLabel: "18/05/2026",
          priceLabel: "€11.20",
        }),
        purchase({
          itemId: "prior",
          supplierLabel: "Makro",
          dateLabel: "01/04/2026",
          priceLabel: "€10.00",
        }),
      ],
      aliasCount: 3,
      recipeCount: 0,
    });
    const ids = cards.map((c) => c.id);
    expect(ids.every((id) => id.startsWith("insight:") && id.length > "insight:".length)).toBe(
      true,
    );
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("filters out dismissed stable ids like the detail panel", () => {
    const cards = buildOperationalInsightCards({
      recentPurchases: [],
      aliasCount: 3,
      recipeCount: 0,
    });
    const dismissed = new Set(["insight:multiple-aliases"]);
    const visible = cards.filter((card) => !dismissed.has(card.id));
    expect(visible.some((c) => c.id === "insight:multiple-aliases")).toBe(false);
    expect(visible.some((c) => c.id === "insight:unused-in-recipes")).toBe(true);
  });

  it("detects pack size change from invoice line hints", () => {
    const cards = buildOperationalInsightCards({
      recentPurchases: [
        purchase({
          itemId: "latest",
          dateLabel: "18/05/2026",
          priceLabel: "€4.00",
          productHint: "OLEO GIRASSOL 1L",
        }),
        purchase({
          itemId: "prior",
          dateLabel: "01/04/2026",
          priceLabel: "€4.00",
          productHint: "OLEO GIRASSOL 5L",
        }),
      ],
      recipeCount: 0,
    });
    expect(cards.some((c) => c.id === "insight:pack-size-changed")).toBe(true);
    expect(cards.some((c) => /catalog mapping/i.test(c.text))).toBe(false);
  });
});
