import { describe, expect, it } from "vitest";
import { buildOperationalInsightCards } from "@/lib/buildOperationalInsightCards";
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
  it("surfaces supplier price increase with percentage", () => {
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
      recipeCount: 0,
    });
    const priceUp = cards.find((c) => c.id === "insight:supplier-price-up");
    expect(priceUp?.text).toMatch(/Frilima raised prices/i);
    expect(priceUp?.detail).toMatch(/12%/);
  });

  it("prefers no-longer-cheapest over supplier-changed when redundant", () => {
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
    expect(cards.some((c) => c.id === "insight:no-longer-cheapest")).toBe(true);
    expect(cards.some((c) => c.id === "insight:supplier-changed")).toBe(false);
  });

  it("skips vague invoice and volatility copy", () => {
    const cards = buildOperationalInsightCards({
      recentPurchases: [
        purchase({ itemId: "a", priceLabel: "€5.00", dateLabel: "01/05/2026" }),
        purchase({ itemId: "b", priceLabel: "€5.10", dateLabel: "01/04/2026" }),
      ],
      recipeCount: 2,
    });
    const joined = cards.map((c) => `${c.text} ${c.detail ?? ""}`).join(" ");
    expect(joined).not.toMatch(/volatility detected/i);
    expect(joined).not.toMatch(/invoice not confirmed/i);
    expect(joined).not.toMatch(/needs review/i);
  });

  it("shows multiple aliases and unused recipe insights when data supports", () => {
    const cards = buildOperationalInsightCards({
      recentPurchases: [],
      aliasCount: 3,
      recipeCount: 0,
    });
    expect(cards.some((c) => c.id === "insight:multiple-aliases")).toBe(true);
    expect(cards.some((c) => c.id === "insight:unused-in-recipes")).toBe(true);
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

  it("detects catalog mapping change from invoice line hints", () => {
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
          priceLabel: "€3.80",
          productHint: "OLEO GIRASSOL 5L",
        }),
      ],
      recipeCount: 0,
    });
    expect(
      cards.some(
        (c) =>
          c.id === "insight:pack-size-changed" || c.id === "insight:catalog-mapping-changed",
      ),
    ).toBe(true);
  });
});
