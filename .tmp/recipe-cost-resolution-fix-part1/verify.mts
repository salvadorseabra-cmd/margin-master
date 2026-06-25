if (!(import.meta as { env?: Record<string, unknown> }).env) {
  Object.defineProperty(import.meta, "env", {
    value: { DEV: false, PROD: true, MODE: "production" },
    writable: true,
    configurable: true,
  });
}

const { buildOperationalIngredientCostById, resolveRecipeLineOperationalCost } = await import(
  "../../src/lib/resolve-operational-ingredient-cost.ts"
);
import type { OperationalInvoiceCostEntry } from "../../src/lib/ingredient-operational-intelligence.ts";

const cases = [
  {
    id: "manjericao",
    qty: 12,
    unit: "g",
    name: "Manjericão",
    catalog: { current_price: 2.06, purchase_quantity: 100, cost_base_unit: "g" as const },
    expectResolved: true,
    expectLineCost: 0.2472,
  },
  {
    id: "salada",
    qty: 100,
    unit: "g",
    name: "Salada ibérica",
    catalog: { current_price: 2.19, purchase_quantity: 250, cost_base_unit: "g" as const },
    expectResolved: true,
    expectLineCost: 0.876,
  },
  {
    id: "ginger",
    qty: 6,
    unit: "un",
    name: "Ginger Beer",
    catalog: { current_price: 0.81, purchase_quantity: 24, cost_base_unit: "un" as const },
    invoice: { current_price: 0.81, purchase_quantity: 200, cost_base_unit: "ml" as const },
    expectResolved: false,
    expectLineCost: null,
  },
];

const results = cases.map((c) => {
  const catalogById = buildOperationalIngredientCostById([{ id: c.id, ...c.catalog }]);
  const invoiceFields = c.invoice ?? c.catalog;
  const invoiceById = new Map<string, OperationalInvoiceCostEntry>([
    [
      c.id,
      {
        fields: invoiceFields,
        invoiceDate: "2026-05-25",
        latestInvoiceUnitCost: null,
        supplierLabel: null,
      },
    ],
  ]);
  const r = resolveRecipeLineOperationalCost(c.id, c.qty, catalogById, c.catalog, invoiceById, {
    recipeUnit: c.unit,
    ingredientName: c.name,
  });
  const lineOk =
    c.expectLineCost == null
      ? r.lineCostEur == null
      : r.lineCostEur != null && Math.abs(r.lineCostEur - c.expectLineCost) < 0.01;
  return {
    name: c.name,
    lineCost: r.lineCostEur,
    pricingResolved: r.pricingResolved,
    costBase: r.fields.cost_base_unit,
    expectResolved: c.expectResolved,
    pass: r.pricingResolved === c.expectResolved && lineOk,
  };
});

const recipeFailCount = results.filter((r) => !r.pass).length;
console.log(JSON.stringify({ results, recipeFailCount }, null, 2));
process.exit(recipeFailCount > 0 ? 1 : 0);
