import { describe, expect, it } from "vitest";
import { formatRecipeQuantityDisplay } from "@/lib/recipe-quantity-input";
import { repairRecipeQuantityDoubleNormalization } from "@/lib/recipe-unit-normalization";
import { operationalCostFieldsFromInvoiceLine } from "@/lib/ingredient-auto-persist";
import type { OperationalInvoiceCostEntry } from "@/lib/ingredient-operational-intelligence";
import {
  buildOperationalIngredientCostById,
  resolveRecipeLineOperationalCost,
} from "@/lib/resolve-operational-ingredient-cost";
import {
  computeRecipePricingSummaryFromRecipe,
  deriveRecipePricingSummary,
  deriveRecipePricingSummaryFromCostLines,
  formatContributionFooterLabel,
  formatPartialMarginDisplay,
  formatRecipeFoodCostDisplay,
  formatRecipeMarginDisplay,
  isRecipeLineCostUnresolved,
  recipeLineCostDisplayCell,
  resolvedContributionSumPct,
} from "./recipe-pricing-state";
import { MISSING_OPERATIONAL_PRICING_LABEL, UNRESOLVED_COST_CELL } from "./ingredient-unit-cost";
import { buildLinesByRecipeId, buildRecipesById } from "./recipe-prep-cost";

describe("deriveRecipePricingSummaryFromCostLines", () => {
  it("ignores blank form lines so a priced ketchup row yields resolved summary", () => {
    const invoiceFields = operationalCostFieldsFromInvoiceLine({
      name: "KETCHUP GULOSO 1KG",
      quantity: 1,
      unit: "kg",
      unit_price: 3.25,
    })!;
    const ketchup = resolveRecipeLineOperationalCost(
      "ketchup-1",
      15,
      buildOperationalIngredientCostById([]),
      undefined,
      new Map<string, OperationalInvoiceCostEntry>([
        [
          "ketchup-1",
          {
            fields: invoiceFields,
            invoiceDate: "2026-05-20",
            latestInvoiceUnitCost: 3.25,
            supplierLabel: null,
          },
        ],
      ]),
      { recipeUnit: "g", ingredientName: "Ketchup" },
    );

    expect(ketchup.lineCostEur).toBeCloseTo(0.05, 2);
    expect(isRecipeLineCostUnresolved(ketchup.lineCostEur)).toBe(false);
    expect(ketchup.pricingResolved).toBe(true);

    const summary = deriveRecipePricingSummaryFromCostLines([
      {
        line: { ingredient_id: "ketchup-1", sub_recipe_id: null },
        lineCost: ketchup.lineCostEur,
      },
      {
        line: { ingredient_id: "", sub_recipe_id: "" },
        lineCost: null,
      },
    ]);
    expect(summary.status).toBe("resolved");
    expect(summary.unresolvedLineCount).toBe(0);
    expect(summary.resolvedLineCount).toBe(1);
    expect(summary.totalActiveLineCount).toBe(1);
    expect(formatRecipeFoodCostDisplay(summary)).toBe("€0.05");
  });

  it("double-normalized 0.015 g ketchup row yields resolved summary after repair", () => {
    const invoiceFields = operationalCostFieldsFromInvoiceLine({
      name: "KETCHUP GULOSO 1KG",
      quantity: 1,
      unit: "kg",
      unit_price: 3.25,
    })!;
    const ketchup = resolveRecipeLineOperationalCost(
      "ketchup-1",
      0.015,
      buildOperationalIngredientCostById([]),
      undefined,
      new Map<string, OperationalInvoiceCostEntry>([
        [
          "ketchup-1",
          {
            fields: invoiceFields,
            invoiceDate: "2026-05-20",
            latestInvoiceUnitCost: 3.25,
            supplierLabel: null,
          },
        ],
      ]),
      { recipeUnit: "g", ingredientName: "Ketchup" },
    );

    expect(ketchup.lineCostEur).toBeCloseTo(0.05, 2);
    expect(ketchup.pricingResolved).toBe(true);
    const displayQty = formatRecipeQuantityDisplay(
      repairRecipeQuantityDoubleNormalization(0.015, "g"),
    );
    expect(displayQty).toBe("15");
    expect(displayQty).not.toMatch(/0\.015/);

    const summary = deriveRecipePricingSummaryFromCostLines([
      {
        line: { ingredient_id: "ketchup-1", sub_recipe_id: null },
        lineCost: ketchup.lineCostEur,
      },
    ]);
    expect(summary.status).toBe("resolved");
  });
});

describe("deriveRecipePricingSummary", () => {
  it("marks 3 resolved + 1 unresolved as partial with resolved total", () => {
    const summary = deriveRecipePricingSummary([
      { lineCost: 1.2 },
      { lineCost: 1.5 },
      { lineCost: 0.92 },
      { lineCost: null },
    ]);
    expect(summary.status).toBe("partial");
    expect(summary.resolvedFoodCostEur).toBeCloseTo(3.62);
    expect(summary.resolvedLineCount).toBe(3);
    expect(summary.unresolvedLineCount).toBe(1);
    expect(summary.costIncomplete).toBe(true);
  });

  it("marks all unresolved lines as unresolved with null total", () => {
    const summary = deriveRecipePricingSummary([
      { lineCost: null },
      { lineCost: null },
    ]);
    expect(summary.status).toBe("unresolved");
    expect(summary.resolvedFoodCostEur).toBeNull();
    expect(summary.costIncomplete).toBe(true);
  });

  it("marks fully resolved recipe as resolved", () => {
    const summary = deriveRecipePricingSummary([
      { lineCost: 2 },
      { lineCost: 2.2 },
    ]);
    expect(summary.status).toBe("resolved");
    expect(summary.resolvedFoodCostEur).toBeCloseTo(4.2);
    expect(summary.costIncomplete).toBe(false);
  });
});

describe("formatRecipeFoodCostDisplay", () => {
  it("shows partial label for partial recipes", () => {
    const summary = deriveRecipePricingSummary([
      { lineCost: 3.62 },
      { lineCost: null },
    ]);
    expect(formatRecipeFoodCostDisplay(summary)).toBe("€3.62 (partial)");
  });

  it("shows missing label when fully unresolved", () => {
    const summary = deriveRecipePricingSummary([{ lineCost: null }]);
    expect(formatRecipeFoodCostDisplay(summary)).toBe(MISSING_OPERATIONAL_PRICING_LABEL);
  });

  it("shows normal currency when fully resolved", () => {
    const summary = deriveRecipePricingSummary([{ lineCost: 4.2 }]);
    expect(formatRecipeFoodCostDisplay(summary)).toBe("€4.20");
  });
});

describe("formatRecipeMarginDisplay", () => {
  it("shows partial margin indicator when costing is incomplete", () => {
    const summary = deriveRecipePricingSummary([
      { lineCost: 3 },
      { lineCost: null },
    ]);
    expect(formatRecipeMarginDisplay(summary, 10)).toBe("70.0% (partial)");
  });

  it("returns em dash when fully unresolved", () => {
    const summary = deriveRecipePricingSummary([{ lineCost: null }]);
    expect(formatRecipeMarginDisplay(summary, 10)).toBe("—");
  });
});

describe("contribution partial semantics", () => {
  it("resolved lines sum to 100% of resolved total only", () => {
    const lines = [
      { lineCost: 3, contribution: 75 },
      { lineCost: 1, contribution: 25 },
      { lineCost: null, contribution: 0 },
    ];
    expect(resolvedContributionSumPct(lines)).toBeCloseTo(100);
  });

  it("footer note explains partial contribution basis", () => {
    const summary = deriveRecipePricingSummary([
      { lineCost: 1 },
      { lineCost: 2 },
      { lineCost: null },
    ]);
    expect(formatContributionFooterLabel(summary)).toMatch(/resolved lines only/i);
    expect(formatContributionFooterLabel(summary)).toMatch(/2 of 3 priced/);
  });

  it("no footer note when fully resolved", () => {
    const summary = deriveRecipePricingSummary([{ lineCost: 1 }, { lineCost: 2 }]);
    expect(formatContributionFooterLabel(summary)).toBeNull();
  });
});

describe("computeRecipePricingSummaryFromRecipe", () => {
  it("returns partial when one ingredient line lacks pricing", () => {
    const dishId = "burger";
    const linesByRecipe = buildLinesByRecipeId([
      {
        id: dishId,
        recipe_ingredients: [
          {
            ingredient_id: "beef",
            sub_recipe_id: null,
            quantity: 1,
            ingredients: { current_price: 2, purchase_quantity: 1 },
          },
          {
            ingredient_id: "bun",
            sub_recipe_id: null,
            quantity: 1,
            ingredients: { current_price: null, purchase_quantity: null },
          },
        ],
      },
    ]);
    const recipesById = buildRecipesById([{ id: dishId, output_quantity: null, output_unit: null }]);
    const summary = computeRecipePricingSummaryFromRecipe(dishId, linesByRecipe, recipesById);
    expect(summary.status).toBe("partial");
    expect(summary.resolvedFoodCostEur).toBeCloseTo(2);
    expect(summary.unresolvedLineCount).toBe(1);
    expect(formatRecipeFoodCostDisplay(summary)).toBe("€2.00 (partial)");
  });
});

describe("formatPartialMarginDisplay", () => {
  it("appends partial suffix when requested", () => {
    expect(formatPartialMarginDisplay(65, true)).toBe("65.0% (partial)");
    expect(formatPartialMarginDisplay(65, false)).toBe("65.0%");
  });
});

describe("recipe modal surface vs totals", () => {
  it("shows currency for resolved brioche 1un line (not em dash)", () => {
    const invoiceFields = operationalCostFieldsFromInvoiceLine({
      name: "Pão brioche 80g",
      quantity: 120,
      unit: "un",
      unit_price: 25.2,
    })!;
    const invoiceById = new Map<string, OperationalInvoiceCostEntry>([
      [
        "brioche",
        {
          fields: invoiceFields,
          invoiceDate: "2026-05-25",
          latestInvoiceUnitCost: 25.2,
          supplierLabel: null,
        },
      ],
    ]);

    const resolved = resolveRecipeLineOperationalCost(
      "brioche",
      1,
      buildOperationalIngredientCostById([]),
      null,
      invoiceById,
      { recipeUnit: "un", ingredientName: "Pão brioche 80g" },
    );

    expect(resolved.lineCostEur).toBeCloseTo(0.21, 2);
    expect(isRecipeLineCostUnresolved(resolved.lineCostEur)).toBe(false);
    expect(recipeLineCostDisplayCell(resolved.lineCostEur)).not.toBe(UNRESOLVED_COST_CELL);
    expect(recipeLineCostDisplayCell(resolved.lineCostEur)).toBe("€0.21");
  });

  it("countable 1 un row: display unit cost €0.21/un not gram-scale €0.0026", () => {
    const invoiceFields = operationalCostFieldsFromInvoiceLine({
      name: "Pão de hambúrguer sésamo 80g",
      quantity: 120,
      unit: "un",
      unit_price: 25.2,
    })!;
    const invoiceById = new Map<string, OperationalInvoiceCostEntry>([
      [
        "bun",
        {
          fields: invoiceFields,
          invoiceDate: "2026-05-25",
          latestInvoiceUnitCost: 25.2,
          supplierLabel: null,
        },
      ],
    ]);
    const resolved = resolveRecipeLineOperationalCost(
      "bun",
      1,
      buildOperationalIngredientCostById([]),
      null,
      invoiceById,
      { recipeUnit: "un", ingredientName: "Pão de hambúrguer sésamo 80g" },
    );
    const displayUnitCost = resolved.lineCostEur! / 1;
    expect(displayUnitCost).toBeCloseTo(0.21, 2);
    expect(recipeLineCostDisplayCell(resolved.lineCostEur)).toBe("€0.21");
    expect(displayUnitCost).not.toBeCloseTo(0.0026, 4);
  });

  it("summary is resolved when all lines including brioche have line cost", () => {
    const invoiceFields = operationalCostFieldsFromInvoiceLine({
      name: "Pão brioche 80g",
      quantity: 120,
      unit: "un",
      unit_price: 25.2,
    })!;
    const invoiceById = new Map<string, OperationalInvoiceCostEntry>([
      [
        "brioche",
        {
          fields: invoiceFields,
          invoiceDate: "2026-05-25",
          latestInvoiceUnitCost: 25.2,
          supplierLabel: null,
        },
      ],
    ]);
    const brioche = resolveRecipeLineOperationalCost(
      "brioche",
      1,
      buildOperationalIngredientCostById([]),
      null,
      invoiceById,
      { recipeUnit: "un", ingredientName: "Pão brioche 80g" },
    );
    const summary = deriveRecipePricingSummary([
      { lineCost: 2 },
      { lineCost: brioche.lineCostEur },
    ]);
    expect(summary.status).toBe("resolved");
    expect(summary.unresolvedLineCount).toBe(0);
    expect(formatRecipeFoodCostDisplay(summary)).toBe("€2.21");
  });
});
