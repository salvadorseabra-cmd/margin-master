import { describe, expect, it } from "vitest";
import {
  formatDisplayUnitCost,
  formatDisplayUnitCostForContext,
} from "@/lib/display-unit-cost";
import { formatPackagedLiquidContext } from "@/lib/packaged-liquid-context";
import { ingredientLineCostEur } from "@/lib/recipe-prep-cost";
import { operationalCostFieldsFromInvoiceLine } from "@/lib/ingredient-auto-persist";
import { recipeOperationalCostFieldsFromInvoiceLine } from "@/lib/invoice-purchase-price-semantics";

describe("formatDisplayUnitCost", () => {
  it("scales €/g to €/kg for display", () => {
    expect(formatDisplayUnitCost(0.0114, "g").formattedLabel).toBe("€11.40/kg");
    expect(formatDisplayUnitCost(0.0114, "g").displayValue).toBeCloseTo(11.4, 2);
    expect(formatDisplayUnitCost(0.0114, "g").displayUnit).toBe("kg");
  });

  it("scales €/ml to €/L for display", () => {
    expect(formatDisplayUnitCost(0.0102, "ml").formattedLabel).toBe("€10.20/L");
    expect(formatDisplayUnitCost(0.0102, "ml").displayUnit).toBe("L");
  });

  it("keeps €/un unchanged", () => {
    expect(formatDisplayUnitCost(0.21, "un").formattedLabel).toBe("€0.21/un");
    expect(formatDisplayUnitCost(0.21, "un").displayValue).toBe(0.21);
  });

  it("does not change lineCost math (internal €/g)", () => {
    const fields = operationalCostFieldsFromInvoiceLine({
      name: "Acém novilho",
      quantity: 1,
      unit: "kg",
      unit_price: 11.9,
    })!;
    const unitCost = fields.current_price! / fields.purchase_quantity!;
    const lineCost = ingredientLineCostEur(220, fields, { recipeUnit: "g" });
    expect(unitCost).toBeCloseTo(0.0119, 4);
    expect(lineCost).toBeCloseTo(2.62, 1);
    expect(lineCost! / 220).toBeCloseTo(unitCost, 4);
    expect(formatDisplayUnitCost(unitCost, "g").formattedLabel).toBe("€11.90/kg");
  });
});

describe("formatDisplayUnitCostForContext", () => {
  it("Alface 30g line: €/g from lineCost/qty shows €/kg, not €/un", () => {
    const fields = recipeOperationalCostFieldsFromInvoiceLine({
      name: "ALFACE ICEBERG 1 un",
      quantity: 1,
      unit: "un",
      unit_price: 1.39,
    })!;
    const lineCost = ingredientLineCostEur(30, fields!, { recipeUnit: "g" });
    expect(lineCost).toBeCloseTo(0.0834, 3);
    const unitCostPerGram = lineCost! / 30;
    expect(unitCostPerGram).toBeCloseTo(0.00278, 4);
    expect(
      formatDisplayUnitCostForContext(unitCostPerGram, "g", { costFields: fields }),
    ).toBe("€2.78/kg");
  });

  it("meat protein on g recipe shows €/kg", () => {
    const fields = operationalCostFieldsFromInvoiceLine({
      name: "Acém novilho",
      quantity: 1,
      unit: "kg",
      unit_price: 11.9,
    })!;
    const unitCost = fields.current_price! / fields.purchase_quantity!;
    expect(formatDisplayUnitCostForContext(unitCost, "g", { costFields: fields })).toBe(
      "€11.90/kg",
    );
  });

  it("mayo on ml recipe shows €/L", () => {
    const unitCostPerMl = 0.0102;
    expect(
      formatDisplayUnitCostForContext(unitCostPerMl, "ml", {
        costFields: {
          current_price: 10.2,
          purchase_quantity: 1000,
          cost_base_unit: "ml",
        },
      }),
    ).toBe("€10.20/L");
  });

  it("packaged liquid subtitle complements €/L primary label", () => {
    const unitCostPerMl = 4.59 / 450;
    expect(formatDisplayUnitCostForContext(unitCostPerMl, "ml")).toBe("€10.20/L");
    expect(formatPackagedLiquidContext({ price: 4.59, ml: 450 })).toBe("450ml pack · €4.59");
  });

  it("brioche countable line shows €/un", () => {
    const fields = operationalCostFieldsFromInvoiceLine({
      name: "Pão brioche 80g",
      quantity: 120,
      unit: "un",
      unit_price: 25.2,
    })!;
    const unitCost = fields.current_price! / fields.purchase_quantity!;
    expect(formatDisplayUnitCostForContext(unitCost, "un", { costFields: fields })).toBe(
      "€0.21/un",
    );
  });

  it("recipe g + explicit cost_base_unit g uses kg display, not un", () => {
    const fields = {
      current_price: 11.9,
      purchase_quantity: 1,
      cost_base_unit: "g" as const,
    };
    const unitCost = 0.0119;
    expect(formatDisplayUnitCostForContext(unitCost, "g", { costFields: fields })).toBe(
      "€11.90/kg",
    );
    expect(formatDisplayUnitCostForContext(unitCost, "g", { costFields: fields })).not.toContain(
      "/un",
    );
  });
});
