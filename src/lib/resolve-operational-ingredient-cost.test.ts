import { describe, expect, it } from "vitest";
import { operationalCostFieldsFromInvoiceLine } from "@/lib/ingredient-auto-persist";
import type { OperationalInvoiceCostEntry } from "@/lib/ingredient-operational-intelligence";
import { formatUnitCostCurrency } from "@/lib/display-format";
import {
  effectiveIngredientUnitCostEur,
  MISSING_OPERATIONAL_PRICING_LABEL,
} from "@/lib/ingredient-unit-cost";
import {
  buildLinesByRecipeId,
  buildRecipesById,
  ingredientLineCostEur,
  resolvePrepUsageLineOperationalCost,
} from "./recipe-prep-cost";
import {
  buildOperationalIngredientCostById,
  enrichRecipeIngredientLineForCost,
  operationalIngredientCostFieldsForLine,
  preferInvoiceCountableOverlayFields,
  resolveOperationalIngredientCostFields,
  resolveOperationalIngredientUnitCostEur,
  resolveRecipeLineOperationalCost,
} from "./resolve-operational-ingredient-cost";
import { pricingConfidenceFromResolve } from "./pricing-trace";
import { isRecipeLineCostUnresolved, recipeLineCostDisplayCell } from "./recipe-pricing-state";
import { UNRESOLVED_COST_CELL } from "./ingredient-unit-cost";

describe("resolveOperationalIngredientCostFields", () => {
  const catalogById = buildOperationalIngredientCostById([
    { id: "ing-a", current_price: 10, purchase_quantity: 2 },
  ]);

  it("prefers catalog over stale embed snapshot", () => {
    const result = resolveOperationalIngredientCostFields("ing-a", catalogById, {
      current_price: 3,
      purchase_quantity: 1,
    });
    expect(result.source).toBe("catalog");
    expect(result.fields.current_price).toBe(10);
    expect(resolveOperationalIngredientUnitCostEur("ing-a", catalogById, {
      current_price: 3,
      purchase_quantity: 1,
    })).toBe(5);
  });

  it("prefers latest invoice overlay over stale catalog and embed", () => {
    const invoiceById = new Map<string, OperationalInvoiceCostEntry>([
      [
        "ing-a",
        {
          fields: { current_price: 11.9, purchase_quantity: 1 },
          invoiceDate: "2026-05-25",
          latestInvoiceUnitCost: 11.9,
          supplierLabel: "Carnes Premium Norte",
        },
      ],
    ]);
    const result = resolveOperationalIngredientCostFields("ing-a", catalogById, {
      current_price: 3,
      purchase_quantity: 1,
    }, invoiceById);
    expect(result.source).toBe("invoice");
    expect(result.chosenDate).toBe("2026-05-25");
    expect(result.latestInvoiceUnitCost).toBe(11.9);
    expect(result.fields.current_price).toBe(11.9);
    expect(resolveOperationalIngredientUnitCostEur("ing-a", catalogById, {
      current_price: 3,
      purchase_quantity: 1,
    }, invoiceById)).toBeCloseTo(11.9, 2);
  });

  it("falls back to embed when ingredient is absent from catalog and invoice", () => {
    const result = resolveOperationalIngredientCostFields("ing-orphan", catalogById, {
      current_price: 4,
      purchase_quantity: 2,
    });
    expect(result.source).toBe("embed");
    expect(result.fields.current_price).toBe(4);
  });

  it("enriches recipe lines with invoice pricing when provided", () => {
    const invoiceById = new Map<string, OperationalInvoiceCostEntry>([
      [
        "ing-a",
        {
          fields: { current_price: 11.9, purchase_quantity: 1 },
          invoiceDate: "2026-05-25",
          latestInvoiceUnitCost: 11.9,
          supplierLabel: null,
        },
      ],
    ]);
    const line = enrichRecipeIngredientLineForCost(
      {
        ingredient_id: "ing-a",
        sub_recipe_id: null,
        quantity: 1,
        ingredients: { current_price: 1, purchase_quantity: 1 },
      },
      catalogById,
      invoiceById,
    );
    expect(line.ingredients?.current_price).toBe(11.9);
  });

  it("maps multi-kg invoice lines to per-kg denominator (not total row grams)", () => {
    const fields = operationalCostFieldsFromInvoiceLine({
      name: "NOVILHO ACÉM",
      quantity: 10,
      unit: "kg",
      unit_price: 11.9,
    });
    expect(fields).toEqual({
      current_price: 11.9,
      purchase_quantity: 1000,
      cost_base_unit: "g",
    });
    expect(effectiveIngredientUnitCostEur(fields!)).toBeCloseTo(0.0119, 4);
    expect(ingredientLineCostEur(180, fields!, { recipeUnit: "g" })).toBeCloseTo(2.14, 2);
  });

  it("180g at €11.90/kg via invoice overlay is ~€2.14 not ~€0.21", () => {
    const invoiceById = new Map<string, OperationalInvoiceCostEntry>([
      [
        "beef",
        {
          fields: operationalCostFieldsFromInvoiceLine({
            name: "Acém novilho extra s/ osso",
            quantity: 10,
            unit: "kg",
            unit_price: 11.9,
          })!,
          invoiceDate: "2026-05-25",
          latestInvoiceUnitCost: 11.9,
          supplierLabel: null,
        },
      ],
    ]);
    const catalogById = buildOperationalIngredientCostById([
      { id: "beef", current_price: 10.27, purchase_quantity: 1000 },
    ]);
    const embed = { current_price: 10.27, purchase_quantity: 1000 };
    const fields = operationalIngredientCostFieldsForLine("beef", catalogById, embed, invoiceById);
    const lineCost = ingredientLineCostEur(180, fields, { recipeUnit: "g" });
    expect(lineCost).toBeCloseTo(2.14, 2);
    expect(lineCost).toBeGreaterThan(1.5);
  });

  it("costs 220g beef at live €11.90/kg not stale embed (~€2.62 vs ~€2.26)", () => {
    const novilhoCatalog = buildOperationalIngredientCostById([
      { id: "novilho", current_price: 10.27, purchase_quantity: 1000, cost_base_unit: "g" },
    ]);
    const invoiceFields = operationalCostFieldsFromInvoiceLine({
      name: "Acém novilho extra s/ osso",
      quantity: 1,
      unit: "kg",
      unit_price: 11.9,
    })!;
    const invoiceById = new Map<string, OperationalInvoiceCostEntry>([
      [
        "novilho",
        {
          fields: invoiceFields,
          invoiceDate: "2026-05-25",
          latestInvoiceUnitCost: 11.9,
          supplierLabel: "Carnes Premium Norte",
        },
      ],
    ]);
    const staleEmbed = { current_price: 10.27, purchase_quantity: 1000, cost_base_unit: "g" as const };

    const fields = operationalIngredientCostFieldsForLine(
      "novilho",
      novilhoCatalog,
      staleEmbed,
      invoiceById,
    );
    const liveLineCost = ingredientLineCostEur(220, fields, { recipeUnit: "g" });
    const staleLineCost = ingredientLineCostEur(220, staleEmbed, { recipeUnit: "g" });

    expect(liveLineCost).toBeCloseTo(2.62, 2);
    expect(staleLineCost).toBeCloseTo(2.26, 2);
    expect(liveLineCost).toBeGreaterThan(staleLineCost);
  });

  it("resolveRecipeLineOperationalCost returns unresolved for missing catalog (bun/fries)", () => {
    const result = resolveRecipeLineOperationalCost(
      "bun-no-price",
      1,
      buildOperationalIngredientCostById([]),
      { current_price: null, purchase_quantity: null },
      undefined,
      { recipeUnit: "un", ingredientName: "Pão brioche" },
    );
    expect(result.source).toBe("embed");
    expect(result.pricingResolved).toBe(false);
    expect(result.lineCostEur).toBeNull();
    expect(result.unitCostEur).toBeNull();
    expect(result.unresolvedReason).toBe(MISSING_OPERATIONAL_PRICING_LABEL);
  });

  it("keeps iceberg lettuce unresolved without usable metadata (HYBRID_CONVERSION_MISSING)", () => {
    const catalogById = buildOperationalIngredientCostById([
      { id: "iceberg", current_price: 1.5, purchase_quantity: 1, cost_base_unit: "un" as const },
    ]);

    const result = resolveRecipeLineOperationalCost(
      "iceberg",
      30,
      catalogById,
      undefined,
      undefined,
      { recipeUnit: "g", ingredientName: "Alface iceberg" },
    );

    expect(result.pricingResolved).toBe(false);
    expect(result.lineCostEur).toBeNull();
    expect(result.unitCostEur).not.toBeNull();
    expect(result.unresolvedReason).toBe("HYBRID_CONVERSION_MISSING");
  });

  it("resolves Alface 30g when catalog carries usable_weight_grams from normalization", () => {
    const catalogById = buildOperationalIngredientCostById([
      {
        id: "iceberg",
        current_price: 1.39,
        purchase_quantity: 1,
        cost_base_unit: "un" as const,
        usable_weight_grams: 500,
      },
    ]);

    const result = resolveRecipeLineOperationalCost(
      "iceberg",
      30,
      catalogById,
      undefined,
      undefined,
      { recipeUnit: "g", ingredientName: "Alface iceberg" },
    );

    expect(result.pricingResolved).toBe(true);
    expect(result.lineCostEur).toBeCloseTo(0.0834, 3);
    expect(result.unresolvedReason).toBeNull();
  });

  it("prefers invoice un overlay over legacy catalog mass base for countable bun", () => {
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
          fields: { ...invoiceFields, cost_base_unit: "g" },
          invoiceDate: "2026-05-25",
          latestInvoiceUnitCost: 25.2,
          supplierLabel: null,
        },
      ],
    ]);
    const catalogById = buildOperationalIngredientCostById([
      {
        id: "brioche",
        current_price: 20,
        purchase_quantity: 80,
        cost_base_unit: "g",
      },
    ]);

    const fields = operationalIngredientCostFieldsForLine(
      "brioche",
      catalogById,
      { current_price: 20, purchase_quantity: 80, cost_base_unit: "g" },
      invoiceById,
    );
    expect(preferInvoiceCountableOverlayFields(invoiceById.get("brioche")!.fields).cost_base_unit).toBe(
      "un",
    );
    expect(fields.cost_base_unit).toBe("un");

    const mayoFields = operationalCostFieldsFromInvoiceLine({
      name: "MAIONESE HELLMANN'S 450ML",
      quantity: 1,
      unit: "un",
      unit_price: 4.59,
    })!;
    expect(preferInvoiceCountableOverlayFields(mayoFields).cost_base_unit).toBe("ml");
    const mayoInvoice = new Map<string, OperationalInvoiceCostEntry>([
      [
        "mayo",
        {
          fields: mayoFields,
          invoiceDate: "2026-05-01",
          latestInvoiceUnitCost: 4.59 / 450,
          supplierLabel: null,
        },
      ],
    ]);
    const mayoResolved = resolveRecipeLineOperationalCost(
      "mayo",
      30,
      buildOperationalIngredientCostById([]),
      null,
      mayoInvoice,
      { recipeUnit: "ml", ingredientName: "MAIONESE HELLMANN'S 450ML" },
    );
    expect(mayoResolved.lineCostEur).toBeCloseTo(0.306, 2);

    const resolved = resolveRecipeLineOperationalCost(
      "brioche",
      1,
      catalogById,
      { current_price: 20, purchase_quantity: 80, cost_base_unit: "g" },
      invoiceById,
      { recipeUnit: "un", ingredientName: "Pão brioche 80g" },
    );
    expect(resolved.lineCostEur).toBeCloseTo(0.21, 2);
    expect(isRecipeLineCostUnresolved(resolved.lineCostEur)).toBe(false);
    expect(recipeLineCostDisplayCell(resolved.lineCostEur)).not.toBe(UNRESOLVED_COST_CELL);
    expect(
      pricingConfidenceFromResolve({
        source: resolved.source,
        pricingResolved: !isRecipeLineCostUnresolved(resolved.lineCostEur),
      }),
    ).toBe("invoice_direct");
    expect(resolved.unresolvedReason).toBeNull();
  });

  it("catalog-only brioche with pq=80 unit price repairs to €0.21/un", () => {
    const catalogById = buildOperationalIngredientCostById([
      {
        id: "brioche",
        current_price: 0.21,
        purchase_quantity: 80,
        cost_base_unit: "un",
      },
    ]);
    const resolved = resolveRecipeLineOperationalCost(
      "brioche",
      1,
      catalogById,
      null,
      undefined,
      { recipeUnit: "un", ingredientName: "Pão brioche 80g" },
    );
    expect(resolved.lineCostEur).toBeCloseTo(0.21, 2);
    expect(resolved.unitCostEur).toBeCloseTo(0.21, 2);
    expect(resolved.lineCostEur! / 1).toBeCloseTo(resolved.unitCostEur!, 6);
  });

  it("resolved lineCost equals unitCost times recipe quantity", () => {
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
    expect(brioche.lineCostEur).toBeCloseTo(0.21, 2);
    expect(brioche.unitCostEur! * 1).toBeCloseTo(brioche.lineCostEur!, 6);
  });

  it("resolves brioche via invoice overlay with 80g usable per unit", () => {
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

    const gResult = resolveRecipeLineOperationalCost(
      "brioche",
      80,
      buildOperationalIngredientCostById([]),
      undefined,
      invoiceById,
      { recipeUnit: "g", ingredientName: "Pão brioche 80g" },
    );
    expect(gResult.pricingResolved).toBe(true);
    expect(gResult.lineCostEur).toBeCloseTo(0.21, 2);

    const unResult = resolveRecipeLineOperationalCost(
      "brioche",
      1,
      buildOperationalIngredientCostById([]),
      undefined,
      invoiceById,
      { recipeUnit: "un", ingredientName: "Pão brioche 80g" },
    );
    expect(unResult.lineCostEur).toBeCloseTo(0.21, 2);
  });

  it("adaptive unit cost formatting avoids fake €0.00 for sub-cent values", () => {
    expect(formatUnitCostCurrency(0.0068)).toBe("€0.0068");
    expect(formatUnitCostCurrency(0.0068)).not.toBe("€0.00");
    expect(formatUnitCostCurrency(0.0139)).not.toBe("€0.01");
    expect(formatUnitCostCurrency(0.0139)).toBe("€0.0139");
  });

  it("Ketchup: kg invoice + ml recipe without grams_per_ml → HYBRID_CONVERSION_MISSING", () => {
    const invoiceFields = operationalCostFieldsFromInvoiceLine({
      name: "KETCHUP GULOSO 1KG",
      quantity: 1,
      unit: "kg",
      unit_price: 5,
    })!;
    const resolved = resolveRecipeLineOperationalCost(
      "ketchup-1",
      350,
      buildOperationalIngredientCostById([]),
      undefined,
      new Map([
        [
          "ketchup-1",
          {
            fields: invoiceFields,
            invoiceDate: "2026-05-20",
            latestInvoiceUnitCost: 5,
          },
        ],
      ]),
      { recipeUnit: "ml", ingredientName: "Ketchup" },
    );
    expect(resolved.source).toBe("invoice");
    expect(resolved.fields.cost_base_unit).toBe("g");
    expect(resolved.fields.grams_per_ml).toBeUndefined();
    expect(resolved.pricingResolved).toBe(false);
    expect(resolved.unresolvedReason).toBe("HYBRID_CONVERSION_MISSING");
    expect(resolved.lineCostEur).toBeNull();
    expect(resolved.unitCostEur).toBeCloseTo(0.005, 4);
  });

  it("Molho BBQ purchased ingredient: kg invoice + ml recipe needs density metadata", () => {
    const invoiceFields = operationalCostFieldsFromInvoiceLine({
      name: "MOLHO BBQ 1KG",
      quantity: 1,
      unit: "kg",
      unit_price: 8,
    })!;
    const resolved = resolveRecipeLineOperationalCost(
      "bbq-ing",
      15,
      buildOperationalIngredientCostById([]),
      undefined,
      new Map([
        [
          "bbq-ing",
          {
            fields: invoiceFields,
            invoiceDate: "2026-05-20",
            latestInvoiceUnitCost: 8,
          },
        ],
      ]),
      { recipeUnit: "ml", ingredientName: "Molho BBQ" },
    );
    expect(resolved.pricingResolved).toBe(false);
    expect(resolved.unresolvedReason).toBe("HYBRID_CONVERSION_MISSING");
  });

  it("Molho BBQ prep usage: unresolved when batch yield (output) is missing", () => {
    const ketchupInvoice = operationalCostFieldsFromInvoiceLine({
      name: "KETCHUP 1KG",
      quantity: 1,
      unit: "kg",
      unit_price: 5,
    })!;
    const linesByRecipe = buildLinesByRecipeId([
      {
        id: "prep-molho-bbq",
        recipe_ingredients: [
          {
            ingredient_id: "ketchup-1",
            sub_recipe_id: null,
            quantity: 500,
            unit: "g",
            ingredients: ketchupInvoice,
          },
        ],
      },
    ]);
    const recipesById = buildRecipesById([
      { id: "prep-molho-bbq", output_quantity: null, output_unit: null },
    ]);
    const prep = resolvePrepUsageLineOperationalCost(
      "prep-molho-bbq",
      15,
      "ml",
      linesByRecipe,
      recipesById,
      { prepName: "Molho BBQ" },
    );
    expect(prep.batchTotalEur).toBeGreaterThan(0);
    expect(prep.pricingResolved).toBe(false);
    expect(prep.lineCostEur).toBeNull();
  });

  it("Molho BBQ prep usage: batch null when child ketchup is ml without density", () => {
    const ketchupInvoice = operationalCostFieldsFromInvoiceLine({
      name: "KETCHUP 1KG",
      quantity: 1,
      unit: "kg",
      unit_price: 5,
    })!;
    const linesByRecipe = buildLinesByRecipeId([
      {
        id: "prep-molho-bbq",
        recipe_ingredients: [
          {
            ingredient_id: "ketchup-1",
            sub_recipe_id: null,
            quantity: 500,
            unit: "ml",
            ingredients: ketchupInvoice,
          },
        ],
      },
    ]);
    const recipesById = buildRecipesById([
      { id: "prep-molho-bbq", output_quantity: 3, output_unit: "L" },
    ]);
    const prep = resolvePrepUsageLineOperationalCost(
      "prep-molho-bbq",
      15,
      "ml",
      linesByRecipe,
      recipesById,
      { prepName: "Molho BBQ" },
    );
    expect(prep.batchTotalEur).toBeNull();
    expect(prep.pricingResolved).toBe(false);
    expect(prep.lineCostEur).toBeNull();
  });

  it("merges catalog density_g_per_ml onto invoice overlay for ml recipe lines", () => {
    const catalogById = buildOperationalIngredientCostById([
      {
        id: "bbq",
        current_price: 4,
        purchase_quantity: 1,
        density_g_per_ml: 1.15,
      },
    ]);
    const invoiceById = new Map([
      [
        "bbq",
        {
          fields: operationalCostFieldsFromInvoiceLine({
            name: "Molho BBQ",
            quantity: 1,
            unit: "kg",
            unit_price: 5,
          })!,
          invoiceDate: "2026-05-20",
          latestInvoiceUnitCost: 5,
        },
      ],
    ]);
    const resolved = resolveRecipeLineOperationalCost(
      "bbq",
      350,
      catalogById,
      undefined,
      invoiceById,
      { recipeUnit: "ml", ingredientName: "Molho BBQ" },
    );
    expect(resolved.source).toBe("invoice");
    expect(resolved.fields.density_g_per_ml).toBe(1.15);
    // 350 × 1.15 = 402.5 g × €0.005/g
    expect(resolved.lineCostEur).toBeCloseTo(2.0125, 4);
    expect(resolved.pricingResolved).toBe(true);
  });

  it("Molho Casa ketchup: 350 ml recipe resolves with catalog density 1.15", () => {
    const invoiceFields = operationalCostFieldsFromInvoiceLine({
      name: "KETCHUP GULOSO 1KG",
      quantity: 1,
      unit: "kg",
      unit_price: 5,
    })!;
    const catalogById = buildOperationalIngredientCostById([
      {
        id: "ketchup-1",
        current_price: 5,
        purchase_quantity: 1000,
        density_g_per_ml: 1.15,
      },
    ]);
    const resolved = resolveRecipeLineOperationalCost(
      "ketchup-1",
      350,
      catalogById,
      undefined,
      new Map([
        [
          "ketchup-1",
          {
            fields: invoiceFields,
            invoiceDate: "2026-05-20",
            latestInvoiceUnitCost: 5,
          },
        ],
      ]),
      { recipeUnit: "ml", ingredientName: "Molho Casa Ketchup" },
    );
    expect(resolved.pricingResolved).toBe(true);
    expect(resolved.lineCostEur).toBeCloseTo(2.0125, 4);
  });

  it("Smash Menu Cola Molho BBQ: 15 ml with density 1.12 on kg invoice", () => {
    const invoiceFields = operationalCostFieldsFromInvoiceLine({
      name: "MOLHO BBQ 1KG",
      quantity: 1,
      unit: "kg",
      unit_price: 8,
    })!;
    const catalogById = buildOperationalIngredientCostById([
      {
        id: "bbq-ing",
        density_g_per_ml: 1.12,
      },
    ]);
    const resolved = resolveRecipeLineOperationalCost(
      "bbq-ing",
      15,
      catalogById,
      undefined,
      new Map([
        [
          "bbq-ing",
          {
            fields: invoiceFields,
            invoiceDate: "2026-05-20",
            latestInvoiceUnitCost: 8,
          },
        ],
      ]),
      { recipeUnit: "ml", ingredientName: "Cola Molho BBQ" },
    );
    expect(resolved.pricingResolved).toBe(true);
    // 15 ml × 1.12 g/ml = 16.8 g × €0.008/g = €0.1344
    expect(resolved.lineCostEur).toBeCloseTo(0.1344, 4);
  });

  it("merges catalog grams_per_ml onto invoice overlay for ml recipe lines (legacy alias)", () => {
    const catalogById = buildOperationalIngredientCostById([
      {
        id: "bbq",
        current_price: 4,
        purchase_quantity: 1,
        grams_per_ml: 1,
      },
    ]);
    const invoiceById = new Map([
      [
        "bbq",
        {
          fields: operationalCostFieldsFromInvoiceLine({
            name: "Molho BBQ",
            quantity: 1,
            unit: "kg",
            unit_price: 5,
          })!,
          invoiceDate: "2026-05-20",
          latestInvoiceUnitCost: 5,
        },
      ],
    ]);
    const resolved = resolveRecipeLineOperationalCost(
      "bbq",
      350,
      catalogById,
      undefined,
      invoiceById,
      { recipeUnit: "ml", ingredientName: "Molho BBQ" },
    );
    expect(resolved.source).toBe("invoice");
    expect(resolved.fields.grams_per_ml).toBe(1);
    expect(resolved.lineCostEur).toBeCloseTo(1.75, 2);
  });

  it("220g novilho line uses resolved €/g unit cost for display, not €0.01", () => {
    const fields = operationalCostFieldsFromInvoiceLine({
      name: "Acém novilho",
      quantity: 1,
      unit: "kg",
      unit_price: 11.9,
    })!;
    const unitCost = fields.current_price! / fields.purchase_quantity!;
    const lineCost = ingredientLineCostEur(220, fields, { recipeUnit: "g" });
    expect(lineCost).toBeCloseTo(2.62, 1);
    expect(unitCost).toBeCloseTo(0.0119, 4);
    expect(formatUnitCostCurrency(unitCost)).toBe("€0.0119");
    expect(formatUnitCostCurrency(lineCost! / 220)).toBe("€0.0119");
  });
});
