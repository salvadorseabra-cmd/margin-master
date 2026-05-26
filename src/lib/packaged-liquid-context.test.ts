import { describe, expect, it } from "vitest";
import {
  buildPackagedLiquidContext,
  formatPackagedLiquidContext,
  formatPackagedLiquidContextFromCostFields,
  shouldShowPackagedLiquidContext,
} from "@/lib/packaged-liquid-context";
import { formatDisplayUnitCost } from "@/lib/display-unit-cost";
import { ingredientLineCostEur } from "@/lib/recipe-prep-cost";
import { recipeOperationalCostFieldsFromInvoiceLine } from "@/lib/invoice-purchase-price-semantics";

describe("formatPackagedLiquidContext", () => {
  it("compact line includes pack size and pack price only", () => {
    const compact = formatPackagedLiquidContext({
      price: 4.59,
      ml: 450,
      purchaseDate: "2026-05-13",
    });
    expect(compact).toBe("450ml pack · €4.59");
    expect(compact).not.toMatch(/operational/i);
  });

  it("primary display formatter still returns €/L", () => {
    const unitCostPerMl = 4.59 / 450;
    expect(formatDisplayUnitCost(unitCostPerMl, "ml").formattedLabel).toBe("€10.20/L");
  });

  it("does not change lineCost math", () => {
    const fields = recipeOperationalCostFieldsFromInvoiceLine({
      name: "MAIONESE HELLMANN'S 450ML",
      quantity: 1,
      unit: "un",
      unit_price: 4.59,
    })!;
    const lineCost = ingredientLineCostEur(20, fields, { recipeUnit: "ml" });
    expect(lineCost).toBeCloseTo(0.204, 3);
    expect(buildPackagedLiquidContext(fields)?.subtitle).toMatch(/450ml/);
  });

  it("shows context for mis-tagged un jar with usable_volume_ml", () => {
    const fields = {
      current_price: 4.59,
      purchase_quantity: 450,
      cost_base_unit: "un" as const,
      usable_volume_ml: 450,
    };
    expect(shouldShowPackagedLiquidContext(fields)).toBe(true);
    expect(formatPackagedLiquidContextFromCostFields(fields)).toContain("€4.59");
  });
});
