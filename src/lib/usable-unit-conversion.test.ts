import { describe, expect, it } from "vitest";
import { operationalCostFieldsFromInvoiceLine } from "@/lib/ingredient-auto-persist";
import { ingredientLineCostEur } from "@/lib/recipe-prep-cost";
import {
  countableToWeightLineCostEur,
  directCountableLineCostEur,
  recipeLineCostViaDensityConversion,
  recipeLineCostViaUsableConversion,
  resolveUsablePerCountableUnit,
} from "@/lib/usable-unit-conversion";

describe("countableToWeightLineCostEur", () => {
  it("Alface: (30g / 500g) × €1.39 per unit", () => {
    expect(
      countableToWeightLineCostEur({
        recipeQuantityGrams: 30,
        packPriceEur: 1.39,
        purchaseQuantityUnits: 1,
        usableGramsPerUnit: 500,
      }),
    ).toBeCloseTo(0.0834, 3);
  });

  it("Brioche pack: (80g / 80g) × (€25.20 / 120 un)", () => {
    expect(
      countableToWeightLineCostEur({
        recipeQuantityGrams: 80,
        packPriceEur: 25.2,
        purchaseQuantityUnits: 120,
        usableGramsPerUnit: 80,
      }),
    ).toBeCloseTo(0.21, 2);
  });
});

describe("recipeLineCostViaUsableConversion", () => {
  it("resolves 30g recipe from countable un + usable_weight_grams", () => {
    const ing = {
      current_price: 1.39,
      purchase_quantity: 1,
      cost_base_unit: "un" as const,
      usable_weight_grams: 500,
    };
    const result = recipeLineCostViaUsableConversion(30, "g", ing);
    expect(result.converted).toBe(true);
    expect(result.lineCostEur).toBeCloseTo(0.0834, 3);
  });

  it("returns null without usable metadata", () => {
    const ing = {
      current_price: 1.5,
      purchase_quantity: 1,
      cost_base_unit: "un" as const,
    };
    expect(recipeLineCostViaUsableConversion(30, "g", ing).converted).toBe(false);
  });

  it("brioche 1 un recipe uses direct countable path (not weight conversion)", () => {
    const ing = {
      current_price: 25.2,
      purchase_quantity: 120,
      cost_base_unit: "un" as const,
      usable_weight_grams: 80,
    };
    expect(ingredientLineCostEur(1, ing, { recipeUnit: "un" })).toBeCloseTo(0.21, 2);
  });

  it("brioche 80g recipe via usable conversion matches per-un cost", () => {
    const ing = {
      current_price: 25.2,
      purchase_quantity: 120,
      cost_base_unit: "un" as const,
      usable_weight_grams: 80,
    };
    expect(ingredientLineCostEur(80, ing, { recipeUnit: "g" })).toBeCloseTo(0.21, 2);
  });

  it("450 ml jar mis-tagged un+450ml: 30 ml recipe without double ÷450", () => {
    const ing = {
      current_price: 4.59,
      purchase_quantity: 450,
      cost_base_unit: "un" as const,
      usable_volume_ml: 450,
    };
    const result = recipeLineCostViaUsableConversion(30, "ml", ing, {
      ingredientName: "MAIONESE HELLMANN'S 450ML",
    });
    expect(result.converted).toBe(true);
    expect(result.lineCostEur).toBeCloseTo(0.306, 2);
    expect(result.lineCostEur).not.toBeCloseTo(0.306 / 450, 5);
  });
});

describe("invoice overlay usable fields", () => {
  it("Alface 1 un invoice carries 500g usable per unit", () => {
    const fields = operationalCostFieldsFromInvoiceLine({
      name: "ALFACE ICEBERG 1 un",
      quantity: 1,
      unit: "un",
      unit_price: 1.39,
    });
    expect(fields?.cost_base_unit).toBe("un");
    expect(fields?.usable_weight_grams).toBe(500);
    expect(ingredientLineCostEur(30, fields!, { recipeUnit: "g" })).toBeCloseTo(0.0834, 3);
  });

  it("Brioche 120 un uses 80g per piece from name, not pack total", () => {
    const fields = operationalCostFieldsFromInvoiceLine({
      name: "Pão brioche 80g",
      quantity: 120,
      unit: "un",
      unit_price: 25.2,
    });
    expect(fields?.purchase_quantity).toBe(120);
    expect(fields?.usable_weight_grams).toBe(80);
    expect(resolveUsablePerCountableUnit(fields!, { ingredientName: "Pão brioche 80g" }).usableWeightGrams).toBe(
      80,
    );
  });

  it("Pão de hambúrguer brioche 80g pack: 1 un @ €0.21 (120 un invoice)", () => {
    const fields = operationalCostFieldsFromInvoiceLine({
      name: "Pão de hambúrguer brioche 80g",
      quantity: 120,
      unit: "un",
      unit_price: 25.2,
    })!;
    expect(fields.cost_base_unit).toBe("un");
    expect(directCountableLineCostEur(1, "un", fields)).toBeCloseTo(0.21, 2);
    expect(ingredientLineCostEur(1, fields, { recipeUnit: "un" })).toBeCloseTo(0.21, 2);
    expect(recipeLineCostViaUsableConversion(1, "un", fields).converted).toBe(false);
  });
});

describe("recipeLineCostViaDensityConversion", () => {
  it("ketchup with density 1.0: 350 ml vs 1 kg @ €5 resolves", () => {
    const ing = {
      current_price: 5,
      purchase_quantity: 1000,
      cost_base_unit: "g" as const,
      grams_per_ml: 1,
    };
    const result = recipeLineCostViaDensityConversion(350, "ml", ing);
    expect(result.converted).toBe(true);
    expect(result.lineCostEur).toBeCloseTo(1.75, 2);
    expect(ingredientLineCostEur(350, ing, { recipeUnit: "ml" })).toBeCloseTo(1.75, 2);
  });

  it("ketchup without density stays unresolved", () => {
    const ing = {
      current_price: 5,
      purchase_quantity: 1000,
      cost_base_unit: "g" as const,
    };
    expect(recipeLineCostViaDensityConversion(350, "ml", ing).converted).toBe(false);
    expect(ingredientLineCostEur(350, ing, { recipeUnit: "ml" })).toBeNull();
  });

  it("meat g recipe vs kg invoice unchanged without density", () => {
    const ing = {
      current_price: 11.9,
      purchase_quantity: 1000,
      cost_base_unit: "g" as const,
    };
    expect(ingredientLineCostEur(220, ing, { recipeUnit: "g" })).toBeCloseTo(2.62, 1);
    expect(recipeLineCostViaDensityConversion(220, "g", ing).converted).toBe(false);
  });

  it("ketchup 15 g kg invoice: repairs 0.015 mis-tag and costs as 15 g", () => {
    const ing = {
      current_price: 3.25,
      purchase_quantity: 1000,
      cost_base_unit: "g" as const,
    };
    const lineCost = ingredientLineCostEur(0.015, ing, {
      recipeUnit: "g",
      ingredientName: "Ketchup",
    });
    expect(lineCost).toBeCloseTo(0.05, 2);
    expect(lineCost).not.toBeCloseTo(0.00005, 6);
  });

  it("ketchup 15 ml kg invoice with density 1.0 costs as 15 ml", () => {
    const ing = {
      current_price: 3.25,
      purchase_quantity: 1000,
      cost_base_unit: "g" as const,
      grams_per_ml: 1,
    };
    const lineCost = ingredientLineCostEur(0.015, ing, {
      recipeUnit: "ml",
      ingredientName: "Ketchup",
    });
    expect(lineCost).toBeCloseTo(0.05, 2);
  });
});

describe("directCountableLineCostEur", () => {
  it("does not treat omitted recipe unit as grams when cost base is g", () => {
    const contaminated = {
      current_price: 25.2,
      purchase_quantity: 80,
      cost_base_unit: "g" as const,
      usable_weight_grams: 80,
    };
    expect(directCountableLineCostEur(1, null, contaminated)).toBeNull();
    expect(ingredientLineCostEur(1, contaminated, { recipeUnit: "un" })).toBeNull();
  });
});
