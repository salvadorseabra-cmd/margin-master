/** Vitest harness — Ginger Beer aggregation vs resolveRecipeLineOperationalCost */
import { describe, expect, it } from "vitest";
import {
  buildOperationalIngredientCostById,
  enrichRecipeLinesForOperationalCost,
  resolveRecipeLineOperationalCost,
} from "../../src/lib/resolve-operational-ingredient-cost";
import {
  buildLinesByRecipeId,
  buildRecipesById,
  computeRecipeLineCostEur,
  computeRecipeTotalCostEur,
  ingredientLineCostEur,
} from "../../src/lib/recipe-prep-cost";
import { computeRecipePricingSummaryFromRecipe } from "../../src/lib/recipe-pricing-state";
import type { OperationalInvoiceCostEntry } from "../../src/lib/ingredient-operational-intelligence";

const GINGER_ID = "7aa5dd9e-44c2-43e3-b673-890ad6d6da41";
const ARROZ_ID = "07a55cf5-b98d-4aae-b330-b4944882e4d3";
const RECIPE_ID = "26237fee-c4d9-493c-b50b-5ec02dada6d5";

/** Live VL snapshot from 2026-06-25 E2E results.json trace */
const gingerCatalog = { current_price: 0.81, purchase_quantity: 24, cost_base_unit: "un" as const };
const gingerInvoice = { current_price: 0.81, purchase_quantity: 200, cost_base_unit: "ml" as const };
const arrozCatalog = { current_price: 1.1625, purchase_quantity: 12, cost_base_unit: "un" as const };

function buildOverlay(
  id: string,
  fields: typeof gingerInvoice,
): Map<string, OperationalInvoiceCostEntry> {
  return new Map([
    [id, { fields, invoiceDate: "2026-05-19", latestInvoiceUnitCost: fields.current_price, supplierLabel: null }],
  ]);
}

describe("Ginger Beer E2E aggregation gap", () => {
  it("resolveRecipeLineOperationalCost and aggregation path both resolve 6 un → €4.86", () => {
    const catalogById = buildOperationalIngredientCostById([
      { id: GINGER_ID, ...gingerCatalog },
      { id: ARROZ_ID, ...arrozCatalog },
    ]);
    const invoiceOverlay = buildOverlay(GINGER_ID, gingerInvoice);

    const resolved = resolveRecipeLineOperationalCost(
      GINGER_ID,
      6,
      catalogById,
      gingerCatalog,
      invoiceOverlay,
      { recipeUnit: "un", ingredientName: "Baladin - Ginger Beer 0.20cl" },
    );
    expect(resolved.lineCostEur).toBeCloseTo(4.86, 2);
    expect(resolved.fields.cost_base_unit).toBe("ml");

    const enriched = enrichRecipeLinesForOperationalCost(
      [
        { ingredient_id: GINGER_ID, quantity: 6, unit: "un", ingredients: gingerCatalog },
        { ingredient_id: ARROZ_ID, quantity: 2, unit: "un", ingredients: arrozCatalog },
      ],
      catalogById,
      invoiceOverlay,
    );

    const harnessExpected = ingredientLineCostEur(6, resolved.fields, {
      recipeUnit: "un",
      ingredientName: "Baladin - Ginger Beer 0.20cl",
    });
    expect(harnessExpected).toBeNull();

    const aggregationLineCost = ingredientLineCostEur(6, enriched[0]!.lineCostFields!, {
      recipeUnit: "un",
      ingredientName: "Baladin - Ginger Beer 0.20cl",
    });
    expect(aggregationLineCost).toBeCloseTo(4.86, 2);

    const linesByRecipe = buildLinesByRecipeId([
      { id: RECIPE_ID, recipe_ingredients: enriched },
    ]);
    const recipesById = buildRecipesById([
      { id: RECIPE_ID, output_quantity: 1, output_unit: "un" },
    ]);
    const path = new Set<string>();
    const memo = new Map<string, number>();
    const engineTotal = computeRecipeTotalCostEur(
      RECIPE_ID,
      linesByRecipe,
      recipesById,
      path,
      memo,
    );
    const gingerCompute = computeRecipeLineCostEur(
      enriched[0]!,
      linesByRecipe,
      recipesById,
      new Set(),
      new Map(),
    );
    const summary = computeRecipePricingSummaryFromRecipe(RECIPE_ID, linesByRecipe, recipesById);

    expect(gingerCompute).toBeCloseTo(4.86, 2);
    expect(engineTotal).toBeCloseTo(7.185, 2);
    expect(summary.resolvedFoodCostEur).toBeCloseTo(7.185, 2);
    expect(resolved.lineCostEur! + 2.325).toBeCloseTo(7.185, 2);
  });
});
