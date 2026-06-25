import { describe, expect, it } from "vitest";
import {
  buildCategoryExposureDrillDown,
  buildIngredientExposureDrillDown,
  computePriceWindowStats,
  PRICE_WINDOW_180_DAYS,
  PRICE_WINDOW_90_DAYS,
} from "@/lib/exposure-drill-down";
import type { MarginAlertData, MarginAlertItem, PriceHistoryRecord } from "@/lib/margin-alert-data";

const NOW = new Date("2026-05-20T12:00:00Z").getTime();

function historyRow(
  overrides: Partial<PriceHistoryRecord> & { ingredient_id: string; new_price: number; created_at: string },
): PriceHistoryRecord {
  return {
    id: overrides.id ?? `h-${overrides.created_at}`,
    ingredient_id: overrides.ingredient_id,
    invoice_id: overrides.invoice_id ?? "inv-fixture",
    ingredient_name: overrides.ingredient_name ?? "Novilho",
    supplier_name: overrides.supplier_name ?? "Metro",
    ingredient_unit: "kg",
    previous_price: overrides.previous_price ?? null,
    new_price: overrides.new_price,
    delta: null,
    delta_percent: overrides.delta_percent ?? null,
    created_at: overrides.created_at,
  };
}

describe("exposure-drill-down", () => {
  it("computes min max avg over 90 and 180 day windows", () => {
    const rows: PriceHistoryRecord[] = [
      historyRow({
        ingredient_id: "ing-1",
        new_price: 10,
        created_at: new Date(NOW - 10 * 86_400_000).toISOString(),
      }),
      historyRow({
        ingredient_id: "ing-1",
        new_price: 12,
        created_at: new Date(NOW - 40 * 86_400_000).toISOString(),
      }),
      historyRow({
        ingredient_id: "ing-1",
        new_price: 8,
        created_at: new Date(NOW - 100 * 86_400_000).toISOString(),
      }),
      historyRow({
        ingredient_id: "ing-1",
        new_price: 14,
        created_at: new Date(NOW - 200 * 86_400_000).toISOString(),
      }),
    ];

    const stats90 = computePriceWindowStats(rows, PRICE_WINDOW_90_DAYS, "kg", NOW);
    expect(stats90.sampleCount).toBe(2);
    expect(stats90.min).toBe(10);
    expect(stats90.max).toBe(12);
    expect(stats90.avg).toBeCloseTo(11, 2);

    const stats180 = computePriceWindowStats(rows, PRICE_WINDOW_180_DAYS, "kg", NOW);
    expect(stats180.sampleCount).toBe(3);
    expect(stats180.min).toBe(8);
    expect(stats180.max).toBe(12);
    expect(stats180.avg).toBeCloseTo(10, 2);
  });

  it("returns empty stats when no rows in window", () => {
    const stats = computePriceWindowStats(
      [
        historyRow({
          ingredient_id: "ing-1",
          new_price: 9,
          created_at: new Date(NOW - 400 * 86_400_000).toISOString(),
        }),
      ],
      PRICE_WINDOW_90_DAYS,
      "kg",
      NOW,
    );
    expect(stats.sampleCount).toBe(0);
    expect(stats.min).toBeNull();
    expect(stats.avg).toBeNull();
  });

  it("builds ingredient drill-down with competitiveness copy when above recent low", () => {
    const data: MarginAlertData = {
      ingredients: [
        {
          id: "ing-1",
          name: "Novilho Vazia",
          unit: "kg",
          base_unit: "kg",
          current_price: 12.2,
          purchase_quantity: 1,
        },
      ],
      recipes: [
        {
          id: "r1",
          name: "Burger",
          selling_price: 15,
          type: "menu",
          recipe_ingredients: [
            {
              id: "l1",
              recipe_id: "r1",
              ingredient_id: "ing-1",
              quantity: 0.2,
              unit: "kg",
              created_at: "",
              ingredients: {
                id: "ing-1",
                name: "Novilho Vazia",
                unit: "kg",
                current_price: 12.2,
                purchase_quantity: 1,
              },
            },
          ],
        },
      ],
      priceHistory: [
        historyRow({
          ingredient_id: "ing-1",
          new_price: 10,
          created_at: new Date(NOW - 5 * 86_400_000).toISOString(),
          supplier_name: "Supplier A",
        }),
        historyRow({
          ingredient_id: "ing-1",
          new_price: 11,
          created_at: new Date(NOW - 30 * 86_400_000).toISOString(),
          supplier_name: "Supplier B",
        }),
      ],
      invoices: [],
    };

    const model = buildIngredientExposureDrillDown({
      data,
      alerts: [],
      ingredientId: "ing-1",
    });

    expect(model?.kind).toBe("ingredient");
    expect(model?.competitivenessCopy).toMatch(/above recent lowest/);
    expect(model?.stats90d.min).toBe(10);
    expect(model?.affectedRecipes[0]?.recipeName).toBe("Burger");
  });

  it("builds category drill-down with top ingredients and deduped signals", () => {
    const data: MarginAlertData = {
      ingredients: [
        { id: "i1", name: "Novilho", unit: "kg", current_price: 10, purchase_quantity: 1 },
        { id: "i2", name: "Queijo", unit: "kg", current_price: 5, purchase_quantity: 1 },
      ],
      recipes: [
        {
          id: "r1",
          name: "Burger",
          selling_price: 20,
          type: "menu",
          recipe_ingredients: [
            {
              id: "l1",
              recipe_id: "r1",
              ingredient_id: "i1",
              quantity: 2,
              unit: "kg",
              created_at: "",
              ingredients: {
                id: "i1",
                name: "Novilho",
                unit: "kg",
                current_price: 10,
                purchase_quantity: 1,
              },
            },
          ],
        },
      ],
      priceHistory: [
        historyRow({
          ingredient_id: "i1",
          new_price: 10.5,
          previous_price: 10,
          delta_percent: 5,
          created_at: new Date(Date.now() - 1 * 86_400_000).toISOString(),
        }),
      ],
      invoices: [],
    };

    const alerts: MarginAlertItem[] = [
      {
        id: "price-increase-i1",
        kind: "price_increase",
        sectionId: "supplier_anomalies",
        severity: "high",
        title: "Novilho cost moved up",
        context: "ctx",
        suggestedAction: "Re-quote",
        actionLabel: "Go",
        target: "/ingredients",
        meta: [{ label: "Movement", value: "Up 5%" }],
        signals: [],
        priority: 200,
      },
    ];

    const model = buildCategoryExposureDrillDown({
      data,
      alerts,
      category: "meat",
      categorySharePct: 80,
    });

    expect(model.topIngredients[0]?.name).toBe("Novilho");
    expect(model.supplierMovements.length).toBeGreaterThan(0);
    expect(model.marginSignals.some((s) => s.title.includes("Novilho"))).toBe(true);
    expect(model.recommendations.length).toBeGreaterThan(0);
  });

  it("excludes homepage briefing ids from drill-down margin signals", () => {
    const data: MarginAlertData = {
      ingredients: [{ id: "i1", name: "Novilho", unit: "kg", current_price: 10, purchase_quantity: 1 }],
      recipes: [],
      priceHistory: [],
      invoices: [],
    };
    const alerts: MarginAlertItem[] = [
      {
        id: "price-increase-i1",
        kind: "price_increase",
        sectionId: "supplier_anomalies",
        severity: "high",
        title: "Novilho cost moved up",
        context: "ctx",
        suggestedAction: "act",
        actionLabel: "Go",
        target: "/ingredients",
        meta: [],
        signals: [],
        priority: 200,
      },
    ];

    const withHomepage = buildIngredientExposureDrillDown({
      data,
      alerts,
      ingredientId: "i1",
      homepageAlertIds: new Set(["price-increase-i1"]),
    });
    const withoutHomepage = buildIngredientExposureDrillDown({
      data,
      alerts,
      ingredientId: "i1",
    });

    expect(withHomepage?.marginSignals).toHaveLength(0);
    expect(withoutHomepage?.marginSignals).toHaveLength(1);
  });
});
