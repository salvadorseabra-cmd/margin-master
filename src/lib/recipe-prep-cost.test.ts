import { describe, expect, it } from "vitest";
import {
  buildLinesByRecipeId,
  buildRecipesById,
  computePrepLineCost,
  computePrepUnitCost,
  computeRecipeLineCostEur,
  computeRecipeTotalCostEur,
  formatPrepUnitCostLabel,
  recipeLineDisplayUnitCostEur,
  prepLineCostEur,
  prepUnitCostEur,
  recipeLineContributionPct,
  resolvePrepUsageLineOperationalCost,
} from "./recipe-prep-cost";

describe("prepUnitCostEur", () => {
  it("divides total cost by output quantity in the same unit", () => {
    expect(prepUnitCostEur(10, 250, "ml")).toBeCloseTo(0.04);
  });

  it("normalizes liter output to €/L", () => {
    expect(prepUnitCostEur(21.49, 3, "L")).toBeCloseTo(21.49 / 3);
  });

  it("returns null when output quantity is missing or non-positive", () => {
    expect(prepUnitCostEur(10, null, "ml")).toBeNull();
    expect(prepUnitCostEur(10, 0, "ml")).toBeNull();
    expect(prepUnitCostEur(10, -1, "L")).toBeNull();
  });

  it("Molho Casa: €20.42 batch over 3 L → €/L; 25 ml usage ≈ €0.17", () => {
    expect(prepUnitCostEur(20.42, 3, "L")).toBeCloseTo(20.42 / 3, 4);
    expect(prepLineCostEur(25, "ml", 20.42, 3, "L")).toBeCloseTo(0.17, 2);
  });

  it("Molho Casa: €21.55 batch over 1000 ml → €0.02155/ml", () => {
    expect(prepUnitCostEur(21.55, 1000, "ml")).toBeCloseTo(0.02155, 5);
  });
});

describe("prepLineCostEur", () => {
  it("multiplies usage quantity by unit cost in the same unit group", () => {
    expect(prepLineCostEur(30, "ml", 10, 250, "ml")).toBeCloseTo(1.2);
  });

  it("normalizes 25 ml usage from a 3 L prep batch", () => {
    expect(prepLineCostEur(25, "ml", 21.49, 3, "L")).toBeCloseTo(0.179, 2);
  });

  it("normalizes 15 ml burger usage from Molho 3L prep batch", () => {
    expect(prepLineCostEur(15, "ml", 21.49, 3, "L")).toBeCloseTo(0.107, 2);
  });

  it("Molho Casa: 15 ml from €21.55 / 1000 ml batch ≈ €0.32 (not batch total)", () => {
    expect(prepLineCostEur(15, "ml", 21.55, 1000, "ml")).toBeCloseTo(0.32325, 3);
    expect(prepLineCostEur(15, "ml", 21.55, 1000, "ml")).toBeLessThan(1);
    expect(prepLineCostEur(15, "ml", 21.55, 1, "ml")).toBeCloseTo(323.25, 1);
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

  it("charges burger 15 ml Molho from 1000 ml batch at batch unit cost", () => {
    const molhoId = "prep-molho-casa";
    const burgerId = "burger-1";
    const recipes = buildRecipesById([
      { id: molhoId, output_quantity: 1000, output_unit: "ml" },
      { id: burgerId, output_quantity: null, output_unit: null },
    ]);
    const linesByRecipe = buildLinesByRecipeId([
      {
        id: molhoId,
        recipe_ingredients: [
          {
            ingredient_id: "ing-base",
            sub_recipe_id: null,
            quantity: 1,
            ingredients: { current_price: 21.55, purchase_quantity: 1 },
          },
        ],
      },
      {
        id: burgerId,
        recipe_ingredients: [
          {
            ingredient_id: null,
            sub_recipe_id: molhoId,
            quantity: 15,
            unit: "ml",
            ingredients: null,
          },
        ],
      },
    ]);
    const path = new Set<string>();
    const memo = new Map<string, number>();
    expect(computeRecipeTotalCostEur(burgerId, linesByRecipe, recipes, path, memo)).toBeCloseTo(
      0.32325,
      3,
    );
  });

  it("cascades prep price change into burger line cost (Molho 3L, 15 ml)", () => {
    const molho3L = buildRecipesById([{ id: molhoId, output_quantity: 3, output_unit: "L" }]);
    const lines3L = buildLinesByRecipeId([
      {
        id: molhoId,
        recipe_ingredients: [
          {
            ingredient_id: "ing-tomato",
            sub_recipe_id: null,
            quantity: 1,
            ingredients: { current_price: 21.49, purchase_quantity: 1 },
          },
        ],
      },
      {
        id: dishId,
        recipe_ingredients: [
          {
            ingredient_id: null,
            sub_recipe_id: molhoId,
            quantity: 15,
            unit: "ml",
            ingredients: null,
          },
        ],
      },
    ]);
    const path = new Set<string>();
    const memo = new Map<string, number>();
    expect(computeRecipeTotalCostEur(dishId, lines3L, molho3L, path, memo)).toBeCloseTo(0.107, 2);

    const pricierLines = buildLinesByRecipeId([
      {
        id: molhoId,
        recipe_ingredients: [
          {
            ingredient_id: "ing-tomato",
            sub_recipe_id: null,
            quantity: 1,
            ingredients: { current_price: 30, purchase_quantity: 1 },
          },
        ],
      },
      {
        id: dishId,
        recipe_ingredients: [
          {
            ingredient_id: null,
            sub_recipe_id: molhoId,
            quantity: 15,
            unit: "ml",
            ingredients: null,
          },
        ],
      },
    ]);
    const path2 = new Set<string>();
    const memo2 = new Map<string, number>();
    expect(computeRecipeTotalCostEur(dishId, pricierLines, molho3L, path2, memo2)).toBeCloseTo(0.15, 2);
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

describe("recipeLineDisplayUnitCostEur", () => {
  it("shows €/un from line cost for countable bakery lines, not internal €/g", () => {
    const lineCostEur = 0.21;
    const quantity = 1;
    const resolvedUnitCostEur = 0.21 / 80;
    const display = recipeLineDisplayUnitCostEur({
      lineCostEur,
      quantity,
      recipeUsageUnit: "un",
      resolvedUnitCostEur,
      costFields: {
        current_price: 0.21,
        purchase_quantity: 80,
        cost_base_unit: "un",
      },
    });
    expect(display).toBeCloseTo(0.21, 2);
    expect(formatPrepUnitCostLabel(display!, "un")).toBe("€0.21/un");
    expect(formatPrepUnitCostLabel(display!, "un")).not.toContain("0.0026");
  });
});

describe("formatPrepUnitCostLabel", () => {
  it("formats currency per output unit", () => {
    expect(formatPrepUnitCostLabel(0.00094, "ml")).toBe("€0.94/L");
  });

  it("formats €/L for partial prep usage rows", () => {
    const lineCost = prepLineCostEur(25, "ml", 21.49, 3, "L")!;
    const unitCost = lineCost / 25;
    expect(unitCost).toBeCloseTo(21.49 / 3000, 5);
    expect(formatPrepUnitCostLabel(unitCost, "ml")).toBe("€7.16/L");
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

describe("resolvePrepUsageLineOperationalCost", () => {
  it("treats zero batch total as unresolved (not €0.00 line cost)", () => {
    const molhoId = "prep-empty";
    const parentId = "dish-1";
    const linesByRecipe = buildLinesByRecipeId([
      {
        id: molhoId,
        recipe_ingredients: [
          {
            ingredient_id: "ing-missing",
            sub_recipe_id: null,
            quantity: 1,
            ingredients: { current_price: null, purchase_quantity: null },
          },
        ],
      },
      {
        id: parentId,
        recipe_ingredients: [
          {
            ingredient_id: null,
            sub_recipe_id: molhoId,
            quantity: 25,
            unit: "ml",
            ingredients: null,
          },
        ],
      },
    ]);
    const recipesById = buildRecipesById([
      { id: molhoId, output_quantity: 3, output_unit: "L" },
      { id: parentId, output_quantity: null, output_unit: null },
    ]);
    const result = resolvePrepUsageLineOperationalCost(
      molhoId,
      25,
      "ml",
      linesByRecipe,
      recipesById,
    );
    expect(result.pricingResolved).toBe(false);
    expect(result.lineCostEur).toBeNull();
    expect(result.unitCostEur).toBeNull();
  });

  it("propagates 15 ml usage when prep batch is only partially priced", () => {
    const molhoId = "prep-partial";
    const parentId = "burger-partial";
    const linesByRecipe = buildLinesByRecipeId([
      {
        id: molhoId,
        recipe_ingredients: [
          {
            ingredient_id: "priced",
            sub_recipe_id: null,
            quantity: 1,
            ingredients: { current_price: 20.42, purchase_quantity: 1 },
          },
          {
            ingredient_id: "unpriced",
            sub_recipe_id: null,
            quantity: 1,
            ingredients: { current_price: null, purchase_quantity: null },
          },
        ],
      },
      {
        id: parentId,
        recipe_ingredients: [
          {
            ingredient_id: null,
            sub_recipe_id: molhoId,
            quantity: 15,
            unit: "ml",
            ingredients: null,
          },
        ],
      },
    ]);
    const recipesById = buildRecipesById([
      { id: molhoId, output_quantity: 3, output_unit: "L" },
      { id: parentId, output_quantity: null, output_unit: null },
    ]);
    const result = resolvePrepUsageLineOperationalCost(
      molhoId,
      15,
      "ml",
      linesByRecipe,
      recipesById,
    );
    expect(result.pricingResolved).toBe(true);
    expect(result.batchTotalEur).toBeCloseTo(20.42, 2);
    expect(result.lineCostEur).toBeCloseTo(0.102, 2);
  });

  it("15 ml Molho from €20.42 / 3 L batch: lineCost equals unitCost × qty", () => {
    const molhoId = "prep-molho-15";
    const parentId = "burger-15";
    const linesByRecipe = buildLinesByRecipeId([
      {
        id: molhoId,
        recipe_ingredients: [
          {
            ingredient_id: "ing-base",
            sub_recipe_id: null,
            quantity: 1,
            ingredients: { current_price: 20.42, purchase_quantity: 1 },
          },
        ],
      },
      {
        id: parentId,
        recipe_ingredients: [
          {
            ingredient_id: null,
            sub_recipe_id: molhoId,
            quantity: 15,
            unit: "ml",
            ingredients: null,
          },
        ],
      },
    ]);
    const recipesById = buildRecipesById([
      { id: molhoId, output_quantity: 3, output_unit: "L" },
      { id: parentId, output_quantity: null, output_unit: null },
    ]);
    const result = resolvePrepUsageLineOperationalCost(
      molhoId,
      15,
      "ml",
      linesByRecipe,
      recipesById,
    );
    expect(result.lineCostEur).toBeCloseTo(0.102, 2);
    expect(result.unitCostEur! * 15).toBeCloseTo(result.lineCostEur!, 6);
  });

  it("parent 25 ml Molho from €20.42 / 3 L batch ≈ €0.17", () => {
    const molhoId = "prep-molho-casa";
    const parentId = "burger-1";
    const linesByRecipe = buildLinesByRecipeId([
      {
        id: molhoId,
        recipe_ingredients: [
          {
            ingredient_id: "ing-base",
            sub_recipe_id: null,
            quantity: 1,
            ingredients: { current_price: 20.42, purchase_quantity: 1 },
          },
        ],
      },
      {
        id: parentId,
        recipe_ingredients: [
          {
            ingredient_id: null,
            sub_recipe_id: molhoId,
            quantity: 25,
            unit: "ml",
            ingredients: null,
          },
        ],
      },
    ]);
    const recipesById = buildRecipesById([
      { id: molhoId, output_quantity: 3, output_unit: "L" },
      { id: parentId, output_quantity: null, output_unit: null },
    ]);
    const result = resolvePrepUsageLineOperationalCost(
      molhoId,
      25,
      "ml",
      linesByRecipe,
      recipesById,
      { parentRecipeId: parentId },
    );
    expect(result.pricingResolved).toBe(true);
    expect(result.lineCostEur).toBeCloseTo(0.17, 2);
    expect(result.batchTotalEur).toBeCloseTo(20.42, 2);
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

  it("uses lineCostFields from enrichment when invoice volume overlays catalog countable", () => {
    const path = new Set<string>();
    const memo = new Map<string, number>();
    const cost = computeRecipeLineCostEur(
      {
        ingredient_id: "ginger-beer",
        sub_recipe_id: null,
        quantity: 6,
        unit: "un",
        ingredients: { current_price: 0.81, purchase_quantity: 200, cost_base_unit: "ml" },
        lineCostFields: { current_price: 0.81, purchase_quantity: 1, cost_base_unit: "un" },
      },
      new Map(),
      new Map(),
      path,
      memo,
    );
    expect(cost).toBeCloseTo(4.86, 2);
  });
});
