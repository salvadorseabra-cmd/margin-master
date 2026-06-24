import { describe, expect, it } from "vitest";
import {
  detectConversionHint,
  detectVolume,
  inferPurchaseUnitsFromLineItemName,
} from "./ingredient-unit-inference";
import {
  computeEffectiveUsableCost,
  recipeOperationalCostFieldsFromInvoiceLine,
  resolveInvoiceLinePricingPresentation,
} from "./invoice-purchase-price-semantics";
import { ingredientLineCostEur } from "./recipe-prep-cost";
import { resolveInvoiceLinePurchaseFormat } from "./invoice-purchase-format";

describe("detectConversionHint — fresh herbs", () => {
  it("maps Tomilho to 100g/bunch (fresh herbs group)", () => {
    expect(detectConversionHint("Tomilho")).toEqual({
      purchase_unit: "un",
      estimated_quantity: 100,
      stock_unit: "g",
      recipe_usage_unit: "g",
      label: "fresh herbs",
      confidence: 0.58,
      reason: 'fresh herbs token "TOMILHO" → estimated 100g usable',
    });
  });

  it("maps Manjericão to 100g/bunch (regression)", () => {
    expect(detectConversionHint("Manjericão")?.estimated_quantity).toBe(100);
    expect(detectConversionHint("Manjericão")?.label).toBe("fresh herbs");
  });

  it("derives Tomilho €2.06/bunch → €20.60/kg operational and gram recipe costs", () => {
    const meta = { name: "Tomilho", quantity: 1, unit: "mo" as const, unit_price: 2.06 };
    const structured = resolveInvoiceLinePurchaseFormat(meta);
    const presentation = resolveInvoiceLinePricingPresentation(meta);
    const effective = computeEffectiveUsableCost(meta.unit_price, meta, structured, meta.name);
    const recipeFields = recipeOperationalCostFieldsFromInvoiceLine(meta);

    expect(structured.kind).toBe("inferred");
    expect(structured.normalizedUsableQuantity).toBe(100);
    expect(structured.usableQuantityUnit).toBe("g");
    expect(presentation.effectiveUsableCostLabel).toBe("€20.60 / kg");
    expect(effective?.unit).toBe("kg");
    expect(effective?.cost).toBeCloseTo(20.6, 2);
    expect(recipeFields).toEqual({
      current_price: 2.06,
      purchase_quantity: 100,
      cost_base_unit: "g",
    });
    expect(ingredientLineCostEur(10, recipeFields!, { recipeUnit: "g" })).toBeCloseTo(0.206, 3);
    expect(ingredientLineCostEur(25, recipeFields!, { recipeUnit: "g" })).toBeCloseTo(0.515, 3);
    expect(ingredientLineCostEur(50, recipeFields!, { recipeUnit: "g" })).toBeCloseTo(1.03, 3);
    expect(ingredientLineCostEur(100, recipeFields!, { recipeUnit: "g" })).toBeCloseTo(2.06, 3);
  });
});

describe("detectVolume — decimal-leading CL typo", () => {
  it.each([
    { token: "Baladin - Ginger Beer 0.20cl", ml: 200 },
    { token: "20cl", ml: 200 },
    { token: "200ml", ml: 200 },
    { token: "Óleo 0.75L", ml: 750 },
    { token: "75cl", ml: 750 },
    { token: "Acqua 5L", ml: 5000 },
  ])("parses $token → $ml ml", ({ token, ml }) => {
    expect(detectVolume(token)?.milliliters).toBe(ml);
  });
});

describe("inferPurchaseUnitsFromLineItemName — beverage multipacks", () => {
  it.each([
    { name: "SanPellegrino - Acqua in vitro 75cl x 15ud", packCount: 15 },
    { name: "75cl x 15ud", packCount: 15 },
    { name: "75cl x15", packCount: 15 },
    { name: "33cl x24", packCount: 24 },
    { name: "24x33cl", packCount: 24 },
    { name: "24x20cl", packCount: 24 },
  ])("detects pack structure for $name", ({ name, packCount }) => {
    const inferred = inferPurchaseUnitsFromLineItemName(name);
    expect(inferred.purchase_unit).toBe("un");
    expect(inferred.base_unit).toBe("un");
    expect(inferred.purchase_quantity).toBe(packCount);
    expect(inferred.purchase_unit_count).toBe(packCount);
    expect(inferred.purchase_unit).not.toBe("ml");
    expect(inferred.pack_size).not.toBeNull();
  });

  it.each([
    { name: "12x1kg", packCount: 12, packSize: 1000, packSizeUnit: "g" as const },
    { name: "6x1L", packCount: 6, packSize: 1000, packSizeUnit: "ml" as const },
    { name: "10x200g", packCount: 10, packSize: 200, packSizeUnit: "g" as const },
  ])("regression: keeps NxSIZE pack for $name", ({ name, packCount, packSize, packSizeUnit }) => {
    const inferred = inferPurchaseUnitsFromLineItemName(name);
    expect(inferred.purchase_unit).toBe("un");
    expect(inferred.purchase_quantity).toBe(packCount);
    expect(inferred.purchase_unit_count).toBe(packCount);
    expect(inferred.pack_size).toBe(packSize);
    expect(inferred.pack_size_unit).toBe(packSizeUnit);
  });
});
