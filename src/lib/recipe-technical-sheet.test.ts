import { describe, expect, it } from "vitest";
import { buildTechnicalSheetIngredientsFromCostLines } from "./recipe-technical-sheet";

describe("buildTechnicalSheetIngredientsFromCostLines", () => {
  it("passes the same priced lines as the recipe modal (including cheddar)", () => {
    const modalLines = [
      {
        line: { ingredient_id: "beef", unit: "g" },
        ingredient: { unit: "kg" },
        displayName: "Beef",
        quantity: 180,
        unitCost: 0.0119,
        lineCost: 2.14,
        pricingUnresolved: false,
      },
      {
        line: { ingredient_id: "cheddar", unit: "g" },
        ingredient: { unit: "kg" },
        displayName: "Cheddar",
        quantity: 40,
        unitCost: 0.008,
        lineCost: 0.32,
        pricingUnresolved: false,
      },
      {
        line: { ingredient_id: "", sub_recipe_id: "" },
        ingredient: null,
        displayName: "",
        quantity: 0,
        unitCost: null,
        lineCost: null,
        pricingUnresolved: true,
      },
    ];

    const pdfIngredients = buildTechnicalSheetIngredientsFromCostLines(modalLines);

    expect(pdfIngredients).toHaveLength(2);
    expect(pdfIngredients.map((row) => row.name)).toEqual(["Beef", "Cheddar"]);
    expect(pdfIngredients[1]).toMatchObject({
      name: "Cheddar",
      quantity: 40,
      lineCost: 0.32,
      unitCost: 0.008,
      pricingUnresolved: false,
    });
  });

  it("ignores operational pricing metadata in PDF ingredient rows", () => {
    const [row] = buildTechnicalSheetIngredientsFromCostLines([
      {
        line: { ingredient_id: "beef", unit: "g" },
        ingredient: { unit: "kg" },
        displayName: "Beef",
        quantity: 180,
        unitCost: 0.0119,
        lineCost: 2.14,
        pricingUnresolved: false,
      },
    ]);

    expect(row).toEqual({
      name: "Beef",
      quantity: 180,
      unit: "g",
      unitCost: 0.0119,
      lineCost: 2.14,
      pricingUnresolved: false,
    });
  });
});
