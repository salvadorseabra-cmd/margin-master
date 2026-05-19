import { describe, expect, it } from "vitest";
import {
  buildKnownSupplierNames,
  deriveInvoiceLineOperationalSignals,
  isNewSupplierForInvoice,
  pickTopOperationalSignals,
} from "@/lib/ingredient-operational-signals";
import { normalizeSupplierDisplayName } from "@/lib/supplier-identity";

const item = {
  id: "line-1",
  name: "Tomate cherry 1kg",
  unit_price: 12,
};

const ingredient = {
  id: "ing-1",
  name: "Tomate cherry",
  current_price: 10,
  updated_at: "2024-01-01T00:00:00.000Z",
};

describe("deriveInvoiceLineOperationalSignals", () => {
  it("returns price increase vs previous invoice line", () => {
    const signals = deriveInvoiceLineOperationalSignals(item, ingredient, {
      previousInvoiceLinePrice: 10,
    });
    expect(signals.some((s) => s.kind === "price-increased")).toBe(true);
  });

  it("prefers invoice history over catalog price when both exist", () => {
    const signals = deriveInvoiceLineOperationalSignals(item, ingredient, {
      previousInvoiceLinePrice: 10,
    });
    expect(signals.some((s) => s.kind === "catalog-price-up")).toBe(false);
  });

  it("compares to catalog when no invoice history", () => {
    const signals = deriveInvoiceLineOperationalSignals(item, ingredient, {});
    expect(signals.some((s) => s.kind === "catalog-price-up")).toBe(true);
  });

  it("reports recipe impact and high exposure", () => {
    const freshIngredient = {
      ...ingredient,
      current_price: 12,
      updated_at: new Date().toISOString(),
    };
    const signals = deriveInvoiceLineOperationalSignals(item, freshIngredient, {
      recipeCountByIngredientId: { "ing-1": 4 },
      highImportanceRecipeThreshold: 3,
      priceHistoryLatestAtByIngredientId: { "ing-1": new Date().toISOString() },
    });
    expect(signals.some((s) => s.kind === "recipe-impact")).toBe(true);
    expect(signals.some((s) => s.kind === "high-importance")).toBe(true);
  });

  it("flags volatile and stale catalog pricing", () => {
    const signals = deriveInvoiceLineOperationalSignals(item, ingredient, {
      volatileIngredientIds: new Set(["ing-1"]),
      priceHistoryLatestAtByIngredientId: { "ing-1": "2024-01-01T00:00:00.000Z" },
      stalePricingDays: 30,
    });
    expect(signals.some((s) => s.kind === "volatile")).toBe(true);
    expect(signals.some((s) => s.kind === "stale-pricing")).toBe(true);
  });

  it("shows recent alias match only with timestamp", () => {
    const recent = new Date(Date.now() - 2 * 86_400_000).toISOString();
    const signals = deriveInvoiceLineOperationalSignals(item, ingredient, {
      matchKind: "confirmed-alias",
      normalizedItemName: "tomate cherry 1kg",
      aliasCreatedAtByLookupKey: { "tomate cherry 1kg": recent },
    });
    expect(signals.some((s) => s.kind === "alias-memory")).toBe(true);
  });

  it("skips alias signal without recent timestamp", () => {
    const signals = deriveInvoiceLineOperationalSignals(item, ingredient, {
      matchKind: "confirmed-alias",
      normalizedItemName: "tomate cherry 1kg",
    });
    expect(signals.some((s) => s.kind === "alias-memory")).toBe(false);
  });

  it("limits to three highest-priority signals", () => {
    const signals = deriveInvoiceLineOperationalSignals(item, ingredient, {
      previousInvoiceLinePrice: 10,
      recipeCountByIngredientId: { "ing-1": 5 },
      volatileIngredientIds: new Set(["ing-1"]),
      priceHistoryLatestAtByIngredientId: { "ing-1": "2024-01-01T00:00:00.000Z" },
      isNewSupplier: true,
      stalePricingDays: 30,
    });
    expect(signals).toHaveLength(3);
  });

  it("returns empty when no backing data", () => {
    expect(deriveInvoiceLineOperationalSignals({ ...item, unit_price: null }, null, {})).toEqual(
      [],
    );
  });
});

describe("pickTopOperationalSignals", () => {
  it("sorts by priority descending", () => {
    const picked = pickTopOperationalSignals(
      [
        { kind: "a", label: "a", tone: "muted", priority: 1 },
        { kind: "b", label: "b", tone: "muted", priority: 99 },
      ],
      1,
    );
    expect(picked[0]?.kind).toBe("b");
  });
});

describe("supplier helpers", () => {
  it("detects new supplier", () => {
    const exclude = normalizeSupplierDisplayName("FreshCo").toLocaleLowerCase();
    const known = buildKnownSupplierNames(["Metro", "Makro"], exclude);
    expect(isNewSupplierForInvoice("FreshCo", known)).toBe(true);
    expect(isNewSupplierForInvoice("Metro", known)).toBe(false);
  });
});
