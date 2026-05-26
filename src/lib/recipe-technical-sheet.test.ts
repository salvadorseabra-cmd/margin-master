import { describe, expect, it } from "vitest";
import { formatOperationalPriceContext } from "@/lib/pricing-source-presentation";
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

  it("maps supplier and invoice date to PDF footnote without resolver codes", () => {
    const presentation = formatOperationalPriceContext({
      source: "invoice_direct",
      supplier: "Recheio",
      date: "2026-05-27",
      unitCostEur: 0.0139,
      costFields: { current_price: 13.9, purchase_quantity: 1000, cost_base_unit: "g" },
      costSource: "invoice",
      costBaseUnit: "g",
    });

    const [row] = buildTechnicalSheetIngredientsFromCostLines([
      {
        line: { ingredient_id: "beef", unit: "g" },
        ingredient: { unit: "kg" },
        displayName: "Beef",
        quantity: 180,
        unitCost: 0.0119,
        lineCost: 2.14,
        pricingUnresolved: false,
        pricePresentation: presentation,
      },
    ]);

    expect(row?.priceSourceFootnote).toBe("Recheio · 27 May 2026");
    expect(row?.priceSourceFootnote).not.toMatch(/invoice_direct/);
  });

  it("keeps provenance before packaged-pack context in PDF metadata", () => {
    const presentation = formatOperationalPriceContext({
      source: "invoice_direct",
      supplier: "Recheio",
      date: "2026-05-27",
      unitCostEur: 0.0139,
      costFields: { current_price: 13.9, purchase_quantity: 1000, cost_base_unit: "g" },
      costSource: "invoice",
      costBaseUnit: "g",
    });

    const [row] = buildTechnicalSheetIngredientsFromCostLines([
      {
        line: { ingredient_id: "mayo", unit: "ml" },
        ingredient: { unit: "ml" },
        displayName: "Hellmann's",
        quantity: 20,
        unitCost: 0.0102,
        lineCost: 0.204,
        pricingUnresolved: false,
        packagedLiquidSubtitle: "450ml pack · €4.59",
        pricePresentation: presentation,
      },
    ]);

    expect(row?.priceSourceFootnote).toBe("Recheio · 27 May 2026");
    expect(row?.packagedLiquidCompactLabel).toBe("450ml pack · €4.59");
  });
});
