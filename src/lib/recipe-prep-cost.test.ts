import { describe, expect, it } from "vitest";
import {
  buildLinesByRecipeId,
  buildRecipesById,
  computePrepLineCost,
  computePrepUnitCost,
  computeRecipeLineCostEur,
  computeRecipeTotalCostEur,
  formatPrepUnitCostLabel,
  prepLineCostEur,
  prepUnitCostEur,
  recipeLineContributionPct,
} from "./recipe-prep-cost";

describe("prepUnitCostEur", () => {
  it("divides total cost by output quantity in the same unit", () => {
    expect(prepUnitCostEur(10, 250, "ml")).toBeCloseTo(0.04);
  });

  it("normalizes liter output to €/L", () => {
    expect(prepUnitCostEur(21.49, 3, "L")).toBeCloseTo(21.49 / 3);
  });

  it("returns 0 when output quantity is missing or non-positive", () => {
    expect(prepUnitCostEur(10, null, "ml")).toBe(0);
    expect(prepUnitCostEur(10, 0, "ml")).toBe(0);
    expect(prepUnitCostEur(10, -1, "L")).toBe(0);
  });
});

describe("prepLineCostEur", () => {
  it("multiplies usage quantity by unit cost in the same unit group", () => {
    expect(prepLineCostEur(30, "ml", 10, 250, "ml")).toBeCloseTo(1.2);
  });

  it("normalizes 25 ml usage from a 3 L prep batch", () => {
    expect(prepLineCostEur(25, "ml", 21.49, 3, "L")).toBeCloseTo(0.179, 2);
  });

  it("returns null for incompatible units", () => {
    expect(prepLineCostEur(25, "ml", 21.49, 2, "kg")).toBeNull();
  });
});

describe("computePrepLineCost", () => {
  it("exposes a warning for incompatible units", () => {
    const result = computePrepLineCost(25, "ml", 21.49, 2, "kg");
    expect(result.cost).toBeNull();
    expect(result.warning).toMatch(/Incompatible units/i);
  });
});

describe("computeRecipeTotalCostEur", () => {
  const molhoId = "prep-molho";
  const dishId = "dish-1";

  const recipes = buildRecipesById([
    { id: molhoId, output_quantity: 250, output_unit: "ml" },
    { id: dishId, output_quantity: null, output_unit: null },
  ]);

  const linesByRecipe = buildLinesByRecipeId([
    {
      id: molhoId,
      recipe_ingredients: [
        {
          ingredient_id: "ing-tomato",
          sub_recipe_id: null,
          quantity: 1,
          ingredients: { current_price: 5, purchase_quantity: 1 },
        },
      ],
    },
    {
      id: dishId,
      recipe_ingredients: [
        {
          ingredient_id: null,
          sub_recipe_id: molhoId,
          quantity: 30,
          unit: "ml",
          ingredients: null,
        },
      ],
    },
  ]);

  it("sums ingredient lines on a prep recipe", () => {
    const path = new Set<string>();
    const memo = new Map<string, number>();
    expect(computeRecipeTotalCostEur(molhoId, linesByRecipe, recipes, path, memo)).toBe(5);
  });

  it("charges dish prep usage by prep unit cost", () => {
    const path = new Set<string>();
    const memo = new Map<string, number>();
    expect(computeRecipeTotalCostEur(dishId, linesByRecipe, recipes, path, memo)).toBeCloseTo(0.6);
  });

  it("returns null on cyclic sub-recipe reference", () => {
    const cyclic = buildLinesByRecipeId([
      {
        id: "a",
        recipe_ingredients: [{ ingredient_id: null, sub_recipe_id: "b", quantity: 1, ingredients: null }],
      },
      {
        id: "b",
        recipe_ingredients: [{ ingredient_id: null, sub_recipe_id: "a", quantity: 1, ingredients: null }],
      },
    ]);
    const path = new Set<string>();
    const memo = new Map<string, number>();
    expect(computeRecipeTotalCostEur("a", cyclic, buildRecipesById([]), path, memo)).toBeNull();
  });
});

describe("computePrepUnitCost", () => {
  it("returns total ÷ output for a prep recipe", () => {
    const molhoId = "prep-molho";
    const linesByRecipe = buildLinesByRecipeId([
      {
        id: molhoId,
        recipe_ingredients: [
          {
            ingredient_id: "ing-tomato",
            sub_recipe_id: null,
            quantity: 1,
            ingredients: { current_price: 5, purchase_quantity: 1 },
          },
        ],
      },
    ]);
    const recipesById = buildRecipesById([
      { id: molhoId, output_quantity: 250, output_unit: "ml" },
    ]);
    expect(computePrepUnitCost(molhoId, linesByRecipe, recipesById)).toBeCloseTo(0.02);
  });
});

describe("formatPrepUnitCostLabel", () => {
  it("formats currency per output unit", () => {
    expect(formatPrepUnitCostLabel(0.00094, "ml")).toBe("€0.0009 / ml");
  });

  it("formats €/ml for partial prep usage rows", () => {
    const lineCost = prepLineCostEur(25, "ml", 21.49, 3, "L")!;
    const unitCost = lineCost / 25;
    expect(unitCost).toBeCloseTo(21.49 / 3000, 5);
    expect(formatPrepUnitCostLabel(unitCost, "ml")).toBe("€0.0072 / ml");
  });
});

describe("recipeLineContributionPct", () => {
  it("returns share of total food cost", () => {
    expect(recipeLineContributionPct(0.179, 0.5)).toBeCloseTo(35.8, 1);
  });

  it("returns 0 when total is zero", () => {
    expect(recipeLineContributionPct(1, 0)).toBe(0);
  });
});

describe("computeRecipeLineCostEur", () => {
  it("uses ingredient unit cost for ingredient lines", () => {
    const path = new Set<string>();
    const memo = new Map<string, number>();
    const cost = computeRecipeLineCostEur(
      {
        ingredient_id: "i1",
        sub_recipe_id: null,
        quantity: 2,
        ingredients: { current_price: 4, purchase_quantity: 2 },
      },
      new Map(),
      new Map(),
      path,
      memo,
    );
    expect(cost).toBe(4);
  });
});
