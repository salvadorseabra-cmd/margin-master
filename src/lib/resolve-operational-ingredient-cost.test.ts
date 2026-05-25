import { describe, expect, it } from "vitest";
import { operationalCostFieldsFromInvoiceLine } from "@/lib/ingredient-auto-persist";
import type { OperationalInvoiceCostEntry } from "@/lib/ingredient-operational-intelligence";
import { effectiveIngredientUnitCostEur } from "@/lib/ingredient-unit-cost";
import { ingredientLineCostEur } from "./recipe-prep-cost";
import {
  buildOperationalIngredientCostById,
  enrichRecipeIngredientLineForCost,
  operationalIngredientCostFieldsForLine,
  resolveOperationalIngredientCostFields,
  resolveOperationalIngredientUnitCostEur,
} from "./resolve-operational-ingredient-cost";

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
    expect(fields).toEqual({ current_price: 11.9, purchase_quantity: 1000 });
    expect(effectiveIngredientUnitCostEur(fields!)).toBeCloseTo(0.0119, 4);
    expect(ingredientLineCostEur(180, fields!)).toBeCloseTo(2.14, 2);
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
    const lineCost = ingredientLineCostEur(180, fields);
    expect(lineCost).toBeCloseTo(2.14, 2);
    expect(lineCost).toBeGreaterThan(1.5);
  });

  it("costs 220g beef at live €11.90/kg not stale embed (~€2.62 vs ~€2.26)", () => {
    const novilhoCatalog = buildOperationalIngredientCostById([
      { id: "novilho", current_price: 10.27, purchase_quantity: 1 },
    ]);
    const invoiceById = new Map<string, OperationalInvoiceCostEntry>([
      [
        "novilho",
        {
          fields: { current_price: 11.9, purchase_quantity: 1 },
          invoiceDate: "2026-05-25",
          latestInvoiceUnitCost: 11.9,
          supplierLabel: "Carnes Premium Norte",
        },
      ],
    ]);
    const staleEmbed = { current_price: 10.27, purchase_quantity: 1 };
    const quantityKg = 0.22;

    const fields = operationalIngredientCostFieldsForLine(
      "novilho",
      novilhoCatalog,
      staleEmbed,
      invoiceById,
    );
    const liveLineCost = ingredientLineCostEur(quantityKg, fields);
    const staleLineCost = ingredientLineCostEur(quantityKg, staleEmbed);

    expect(liveLineCost).toBeCloseTo(2.62, 2);
    expect(staleLineCost).toBeCloseTo(2.26, 2);
    expect(liveLineCost).toBeGreaterThan(staleLineCost);
  });
});
