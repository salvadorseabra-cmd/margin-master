/** Read-only Ginger Beer / Multipack trace — VL bjhnlrgodcqoyzddbpbd */
Object.defineProperty(import.meta, "env", {
  value: { DEV: false, PROD: true, MODE: "production" },
  writable: true,
  configurable: true,
});

import { execSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";

const { operationalCostFieldsFromInvoiceLine } = await import(
  "../../src/lib/ingredient-auto-persist.ts"
);
const {
  buildOperationalIngredientCostById,
  enrichRecipeLinesForOperationalCost,
  resolveOperationalIngredientCostFields,
  resolveRecipeLineOperationalCost,
} = await import("../../src/lib/resolve-operational-ingredient-cost.ts");
const {
  buildLinesByRecipeId,
  buildRecipesById,
  computeRecipeLineCostEur,
  computeRecipeTotalCostEur,
  ingredientLineCostEur,
} = await import("../../src/lib/recipe-prep-cost.ts");
const { computeRecipePricingSummaryFromRecipe } = await import(
  "../../src/lib/recipe-pricing-state.ts"
);
const { inferIngredientCostBaseUnit, purchaseQuantityDenom } = await import(
  "../../src/lib/ingredient-unit-cost.ts"
);
import type { OperationalInvoiceCostEntry } from "../../src/lib/ingredient-operational-intelligence.ts";

const VL = "bjhnlrgodcqoyzddbpbd";
const GINGER_ID = "7aa5dd9e-44c2-43e3-b673-890ad6d6da41";
const PREFIX = "VL-E2E";

function projectKey(): string {
  const raw = execSync(`supabase projects api-keys --project-ref ${VL} -o json`, {
    encoding: "utf8",
    timeout: 60_000,
  });
  return (JSON.parse(raw) as { name: string; api_key: string }[]).find(
    (k) => k.name === "service_role",
  )!.api_key;
}

function buildInvoiceOverlay(input: {
  catalogIds: Set<string>;
  items: Array<{
    id: string;
    invoice_id: string;
    name: string;
    quantity: number | null;
    unit: string | null;
    unit_price: number | null;
    total: number | null;
    created_at: string | null;
  }>;
  matches: Array<{ ingredient_id: string; invoice_item_id: string; status: string }>;
  invoices: Array<{ id: string; supplier_name: string | null; invoice_date: string | null }>;
}): Map<string, OperationalInvoiceCostEntry> {
  const itemById = new Map(input.items.map((i) => [i.id, i]));
  const latest = new Map<string, OperationalInvoiceCostEntry>();
  for (const match of input.matches) {
    if (match.status !== "confirmed") continue;
    const ingId = match.ingredient_id?.trim();
    if (!ingId || !input.catalogIds.has(ingId)) continue;
    const item = itemById.get(match.invoice_item_id);
    if (!item) continue;
    const inv = input.invoices.find((i) => i.id === item.invoice_id);
    const invoiceDate = inv?.invoice_date ?? item.created_at ?? null;
    if (!invoiceDate) continue;
    const fields = operationalCostFieldsFromInvoiceLine(item);
    if (!fields) continue;
    const prev = latest.get(ingId)?.invoiceDate ?? null;
    if (!prev || invoiceDate.localeCompare(prev) > 0) {
      latest.set(ingId, {
        fields,
        invoiceDate,
        latestInvoiceUnitCost:
          item.unit_price == null ? null : Number(item.unit_price),
        supplierLabel: inv?.supplier_name ?? null,
      });
    }
  }
  return latest;
}

const sb = createClient(`https://${VL}.supabase.co`, projectKey(), {
  auth: { persistSession: false },
});

const [
  { data: recipesRaw },
  { data: recipeLinesRaw },
  { data: ingredientsRaw },
  { data: matchRows },
] = await Promise.all([
  sb.from("recipes").select("*").like("name", `${PREFIX}%`).order("name"),
  sb.from("recipe_ingredients").select("*"),
  sb
    .from("ingredients")
    .select("id, name, current_price, purchase_quantity, purchase_unit, base_unit, unit, density_g_per_ml"),
  sb.from("invoice_item_matches").select("*"),
]);

const multipack = (recipesRaw ?? []).find((r) => r.name.includes("Multipack"));
if (!multipack) throw new Error("Multipack recipe not found");

const gingerIng = (ingredientsRaw ?? []).find((i) => i.id === GINGER_ID);
const gingerLine = (recipeLinesRaw ?? []).find(
  (l) => l.recipe_id === multipack.id && l.ingredient_id === GINGER_ID,
);

const catalogRows = (ingredientsRaw ?? []).map((i) => ({
  id: i.id,
  current_price: i.current_price,
  purchase_quantity: i.purchase_quantity,
  density_g_per_ml: i.density_g_per_ml,
}));
const operationalCostById = buildOperationalIngredientCostById(catalogRows);
const catalogIds = new Set(catalogRows.map((r) => r.id));

const { data: items } = await sb
  .from("invoice_items")
  .select("id, invoice_id, name, quantity, unit, unit_price, total, created_at");
const { data: invoices } = await sb
  .from("invoices")
  .select("id, supplier_name, invoice_date, created_at");

const invoiceOverlay = buildInvoiceOverlay({
  catalogIds,
  items: items ?? [],
  matches: (matchRows ?? []).map((m) => ({
    ingredient_id: m.ingredient_id,
    invoice_item_id: m.invoice_item_id,
    status: m.status,
  })),
  invoices: invoices ?? [],
});

const overlay = invoiceOverlay.get(GINGER_ID);
const catalog = operationalCostById.get(GINGER_ID);

const resolvedFields = resolveOperationalIngredientCostFields(
  GINGER_ID,
  operationalCostById,
  gingerIng
    ? {
        current_price: gingerIng.current_price,
        purchase_quantity: gingerIng.purchase_quantity,
      }
    : null,
  invoiceOverlay,
);

const recipeResolved = resolveRecipeLineOperationalCost(
  GINGER_ID,
  gingerLine?.quantity ?? 6,
  operationalCostById,
  gingerIng
    ? {
        current_price: gingerIng.current_price,
        purchase_quantity: gingerIng.purchase_quantity,
      }
    : null,
  invoiceOverlay,
  { recipeUnit: gingerLine?.unit ?? "un", ingredientName: gingerIng?.name },
);

const enriched = enrichRecipeLinesForOperationalCost(
  [
    {
      ingredient_id: GINGER_ID,
      quantity: gingerLine?.quantity ?? 6,
      unit: gingerLine?.unit ?? "un",
      ingredients: gingerIng
        ? {
            current_price: gingerIng.current_price,
            purchase_quantity: gingerIng.purchase_quantity,
          }
        : null,
    },
  ],
  operationalCostById,
  invoiceOverlay,
);

const enrichedFields = enriched[0]!.ingredients!;
const directLineCost = ingredientLineCostEur(gingerLine?.quantity ?? 6, enrichedFields, {
  recipeUnit: gingerLine?.unit ?? "un",
  ingredientName: gingerIng?.name,
});
const harnessExpected = ingredientLineCostEur(
  gingerLine?.quantity ?? 6,
  resolvedFields.fields,
  { recipeUnit: gingerLine?.unit ?? "un", ingredientName: gingerIng?.name },
);

const certRecipeIds = new Set((recipesRaw ?? []).map((r) => r.id));
const certLines = (recipeLinesRaw ?? []).filter((l) => certRecipeIds.has(l.recipe_id));
const ingredientById = new Map((ingredientsRaw ?? []).map((i) => [i.id, i]));
const recipeLinesByRecipe = new Map<string, typeof certLines>();
for (const line of certLines) {
  const arr = recipeLinesByRecipe.get(line.recipe_id) ?? [];
  arr.push(line);
  recipeLinesByRecipe.set(line.recipe_id, arr);
}

const allEnriched = (recipesRaw ?? []).map((recipe) => {
  const rawLines = recipeLinesByRecipe.get(recipe.id) ?? [];
  const enrichedLines = enrichRecipeLinesForOperationalCost(
    rawLines.map((row) => ({
      ingredient_id: row.ingredient_id,
      sub_recipe_id: row.sub_recipe_id,
      quantity: row.quantity,
      unit: row.unit,
      ingredients: row.ingredient_id ? ingredientById.get(row.ingredient_id) ?? null : null,
    })),
    operationalCostById,
    invoiceOverlay,
  );
  return { recipe, enrichedLines };
});

const linesByRecipe = buildLinesByRecipeId(
  allEnriched.map(({ recipe, enrichedLines }) => ({
    id: recipe.id,
    recipe_ingredients: enrichedLines,
  })),
);
const recipesById = buildRecipesById(
  (recipesRaw ?? []).map((r) => ({
    id: r.id,
    output_quantity: r.output_quantity,
    output_unit: r.output_unit,
  })),
);

const path = new Set<string>();
const memo = new Map<string, number>();
const engineTotal = computeRecipeTotalCostEur(
  multipack.id,
  linesByRecipe,
  recipesById,
  path,
  memo,
);
const pricingSummary = computeRecipePricingSummaryFromRecipe(
  multipack.id,
  linesByRecipe,
  recipesById,
);

const multipackLines = linesByRecipe.get(multipack.id) ?? [];
const gingerEnrichedLine = multipackLines.find((l) => l.ingredient_id === GINGER_ID);
const computeLineCost = gingerEnrichedLine
  ? computeRecipeLineCostEur(gingerEnrichedLine, linesByRecipe, recipesById, new Set(), new Map())
  : null;

const trace = {
  gingerIngredient: {
    id: GINGER_ID,
    name: gingerIng?.name,
    catalog: {
      current_price: gingerIng?.current_price,
      purchase_quantity: gingerIng?.purchase_quantity,
      cost_base_unit: catalog ? inferIngredientCostBaseUnit(catalog) : null,
    },
    invoiceOverlay: overlay
      ? {
          current_price: overlay.fields.current_price,
          purchase_quantity: overlay.fields.purchase_quantity,
          cost_base_unit: overlay.fields.cost_base_unit,
          pqDenom: purchaseQuantityDenom(overlay.fields.purchase_quantity),
          invoiceDate: overlay.invoiceDate,
        }
      : null,
    recipeLine: {
      quantity: gingerLine?.quantity,
      unit: gingerLine?.unit,
    },
  },
  resolveOperationalIngredientCostFields: {
    source: resolvedFields.source,
    fields_cost_base_unit: resolvedFields.fields.cost_base_unit,
    fields_pq: resolvedFields.fields.purchase_quantity,
  },
  resolveRecipeLineOperationalCost: {
    lineCostEur: recipeResolved.lineCostEur,
    unitCostEur: recipeResolved.unitCostEur,
    pricingResolved: recipeResolved.pricingResolved,
    displayFields_cost_base_unit: recipeResolved.fields.cost_base_unit,
  },
  ingredientLineCostEur_on_enrichedFields: directLineCost,
  ingredientLineCostEur_on_resolvedFields_harnessExpected: harnessExpected,
  computeRecipeLineCostEur_aggregationPath: computeLineCost,
  multipackTotals: {
    computeRecipeTotalCostEur: engineTotal,
    computeRecipePricingSummary_resolvedFoodCostEur: pricingSummary.resolvedFoodCostEur,
    resolveRecipeLineOperationalCost_sum: recipeResolved.lineCostEur,
  },
  bridgeActiveInResolveRecipeLine: recipeResolved.lineCostEur === 4.86,
  bridgeMissingInAggregation: computeLineCost !== recipeResolved.lineCostEur,
  harnessFalseNegative:
    recipeResolved.lineCostEur != null && harnessExpected !== recipeResolved.lineCostEur,
};

console.log(JSON.stringify(trace, null, 2));
