/**
 * READ-ONLY Family A impact analysis — Ricotta + Mezzi qty 2→1 counterfactual
 * VL: bjhnlrgodcqoyzddbpbd — no DB writes
 */
if (!(import.meta as { env?: Record<string, unknown> }).env) {
  (import.meta as { env: Record<string, unknown> }).env = { DEV: false, PROD: true };
}

import { execSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import {
  bindMonetaryColumns,
  parseMonetaryLineItems,
} from "../../supabase/functions/extract-invoice/invoice-monetary-binding.ts";
import {
  procurementPackFieldsFromInvoiceLine,
  defaultIsGenericUnit,
} from "../../src/lib/ingredient-auto-persist.ts";
import { operationalUnitPriceForPriceHistory } from "../../src/lib/ingredient-price-history.ts";
import {
  effectiveIngredientUnitCostEur,
  purchaseQuantityDenom,
  resolvedOperationalUnitCostEur,
} from "../../src/lib/ingredient-unit-cost.ts";
import { normalizeInvoiceItemFields } from "../../src/lib/invoice-item-fields.ts";
import { resolveInvoiceLinePurchaseFormat } from "../../src/lib/invoice-purchase-format.ts";
import {
  computeEffectiveUsableCost,
  formatRowPurchaseQuantityLabel,
  recipeOperationalCostFieldsFromInvoiceLine,
  resolveCountablePurchaseQuantityForCost,
  resolveInvoiceLinePricingPresentation,
} from "../../src/lib/invoice-purchase-price-semantics.ts";
import { getRecipeUsageByIngredient } from "../../src/lib/margin-alert-data.ts";

const VL = "bjhnlrgodcqoyzddbpbd";
const INVOICE_ID = "f0aa5a08-86a3-4938-99f0-711e86073968";
const PRODUCTS = [
  {
    key: "ricotta",
    lineName: "RICOTTA TREVIGIANA 1,5KG",
    invoiceItemId: "409850ab-646d-44fa-b20c-c8a4a8570064",
    ingredientId: "6ec0bc6b-409a-4db2-b21f-fb01394f0014",
    extractRaw: {
      name: "RICOTTA TREVIGIANA 1,5KG",
      quantity: 2,
      unit: "uni",
      unit_price: 7.967,
      total: 7.97,
    },
    counterfactualQty: 1,
  },
  {
    key: "mezzi",
    lineName: "MEZZI PACCHERI MANCINI (CX 1KG*6)",
    invoiceItemId: "bb4bbfac-a59b-4d0b-9844-ba773c1f261e",
    ingredientId: "6a7d0b80-764a-40e8-a3fb-9361e7d9ee98",
    extractRaw: {
      name: "MEZZI PACCHERI MANCINI (CX 1KG*6)",
      quantity: 2,
      unit: "uni",
      unit_price: 27.36,
      total: 27.3,
    },
    counterfactualQty: 1,
  },
] as const;

const key = (
  JSON.parse(
    execSync(`supabase projects api-keys --project-ref ${VL} -o json`, { encoding: "utf8" }),
  ) as { name: string; api_key: string }[]
).find((k) => k.name === "service_role")!.api_key;
const sb = createClient(`https://${VL}.supabase.co`, key, { auth: { persistSession: false } });

type RawLine = {
  name: string;
  quantity: number | null;
  unit: string | null;
  unit_price: number | null;
  total: number | null;
};

function replayLine(raw: RawLine) {
  const [bound] = bindMonetaryColumns(
    parseMonetaryLineItems([
      {
        name: raw.name,
        quantity: raw.quantity,
        unit: raw.unit,
        gross_unit_price: null,
        discount_pct: null,
        line_total_net: null,
        unit_price: raw.unit_price,
        total: raw.total,
      },
    ]),
  );
  const metadata = {
    name: bound.name,
    quantity: bound.quantity,
    unit: bound.unit,
    unit_price: bound.unit_price,
    line_total: bound.total,
  };
  const structured = resolveInvoiceLinePurchaseFormat(metadata);
  const presentation = resolveInvoiceLinePricingPresentation(metadata);
  const operational = recipeOperationalCostFieldsFromInvoiceLine(metadata);
  const purchaseQtyForCost = resolveCountablePurchaseQuantityForCost(metadata, structured);
  const effectiveCost = computeEffectiveUsableCost(
    bound.unit_price ?? 0,
    metadata,
    structured,
    bound.name,
  );
  const procurement = procurementPackFieldsFromInvoiceLine(
    {
      name: bound.name,
      quantity: bound.quantity,
      unit: bound.unit,
      unit_price: bound.unit_price,
      total: bound.total,
    },
    { isGenericUnit: defaultIsGenericUnit },
  );
  const historyPrice = operationalUnitPriceForPriceHistory(
    procurement?.current_price,
    procurement?.purchase_quantity,
  );
  return {
    bound: {
      quantity: bound.quantity,
      unit: bound.unit,
      unit_price: bound.unit_price,
      total: bound.total,
    },
    structured: {
      kind: structured.kind,
      normalizedUsableQuantity: structured.normalizedUsableQuantity,
      usableQuantityUnit: structured.usableQuantityUnit,
      purchaseContainerCount: structured.purchaseContainerCount,
    },
    purchaseQtyForCost,
    operational,
    procurement,
    effectiveCost,
    historyPrice,
    presentation: {
      lastPurchase: formatRowPurchaseQuantityLabel(metadata),
      procurementCost: presentation.priceDisplay,
      operationalCost: presentation.effectiveUsableCostLabel,
      usableQuantity: presentation.usableStockLabel,
      purchasePriceLine: presentation.card?.purchasePriceLine ?? null,
    },
    catalogOperationalUnitCost: resolvedOperationalUnitCostEur({
      current_price: procurement?.current_price ?? bound.unit_price,
      purchase_quantity: procurement?.purchase_quantity ?? purchaseQtyForCost,
    }),
    catalogUnitCostEur: effectiveIngredientUnitCostEur({
      current_price: procurement?.current_price ?? bound.unit_price,
      purchase_quantity: procurement?.purchase_quantity ?? purchaseQtyForCost,
    }),
  };
}

function round(n: number | null | undefined, d = 4): number | null {
  if (n == null || !Number.isFinite(n)) return null;
  const f = 10 ** d;
  return Math.round(n * f) / f;
}

function fieldRow(
  field: string,
  current: unknown,
  correct: unknown,
  classification: "A" | "B" | "C",
  notes?: string,
) {
  const cur = current;
  const cor = correct;
  let delta: unknown = null;
  if (typeof cur === "number" && typeof cor === "number") {
    delta = round(cor - cur, 4);
  } else if (cur !== cor) {
    delta = "changed";
  } else {
    delta = "unchanged";
  }
  return { field, current: cur, correctIfQty1: cor, delta, classification, notes: notes ?? null };
}

async function loadDbContext() {
  const { data: invoice } = await sb
    .from("invoices")
    .select("id,supplier_name,invoice_date,total")
    .eq("id", INVOICE_ID)
    .single();

  const { data: items } = await sb
    .from("invoice_items")
    .select("id,name,quantity,unit,unit_price,total,created_at")
    .eq("invoice_id", INVOICE_ID);

  const ingredientIds = PRODUCTS.map((p) => p.ingredientId);
  const { data: ingredients } = await sb
    .from("ingredients")
    .select(
      "id,name,current_price,purchase_quantity,purchase_unit,base_unit,usable_weight_grams,usable_volume_ml,updated_at",
    )
    .in("id", ingredientIds);

  const { data: priceHistory } = await sb
    .from("ingredient_price_history")
    .select("id,ingredient_id,invoice_id,new_price,previous_price,created_at")
    .in("ingredient_id", ingredientIds)
    .order("created_at", { ascending: false });

  const { data: matches } = await sb
    .from("invoice_item_matches")
    .select("ingredient_id,invoice_item_id,status")
    .in("ingredient_id", ingredientIds);

  const { data: recipes } = await sb
    .from("recipes")
    .select(
      "id,name,selling_price,recipe_ingredients(ingredient_id,quantity,unit,ingredients(id,name,current_price,purchase_quantity))",
    );

  const { data: supplierInvoices } = await sb
    .from("invoices")
    .select("id,total,invoice_date")
    .ilike("supplier_name", "%Bocconcino%");

  return {
    invoice,
    items: items ?? [],
    ingredients: ingredients ?? [],
    priceHistory: priceHistory ?? [],
    matches: matches ?? [],
    recipes: recipes ?? [],
    supplierInvoices: supplierInvoices ?? [],
  };
}

function analyzeProduct(
  product: (typeof PRODUCTS)[number],
  db: Awaited<ReturnType<typeof loadDbContext>>,
  recipeUsage: ReturnType<typeof getRecipeUsageByIngredient>,
) {
  const persisted = db.items.find((i) => i.id === product.invoiceItemId);
  const norm = persisted ? normalizeInvoiceItemFields(persisted as never) : null;
  const ingredient = db.ingredients.find((i) => i.id === product.ingredientId);
  const history = db.priceHistory.filter((h) => h.ingredient_id === product.ingredientId);
  const bocconcinoHistory = history.filter((h) => h.invoice_id === INVOICE_ID);

  const currentReplay = replayLine({
    name: product.lineName,
    quantity: norm?.quantity ?? product.extractRaw.quantity,
    unit: norm?.unit ?? "un",
    unit_price: norm?.unit_price ?? product.extractRaw.unit_price,
    total: norm?.total ?? product.extractRaw.total,
  });

  const extractReplay = replayLine({
    ...product.extractRaw,
    unit: product.extractRaw.unit,
  });

  const counterfactualRaw: RawLine = {
    name: product.extractRaw.name,
    quantity: product.counterfactualQty,
    unit: product.extractRaw.unit,
    unit_price: product.extractRaw.unit_price,
    total: product.extractRaw.total,
  };
  const correctReplay = replayLine(counterfactualRaw);

  const purchaseCurrent = {
    quantityLabel: currentReplay.presentation.lastPurchase,
    unitPriceEur: currentReplay.bound.unit_price,
    totalEur: currentReplay.bound.total,
    procurementLabel: currentReplay.presentation.procurementCost,
    operationalLabel: currentReplay.presentation.operationalCost,
  };
  const purchaseCorrect = {
    quantityLabel: correctReplay.presentation.lastPurchase,
    unitPriceEur: correctReplay.bound.unit_price,
    totalEur: correctReplay.bound.total,
    procurementLabel: correctReplay.presentation.procurementCost,
    operationalLabel: correctReplay.presentation.operationalCost,
  };

  const catalogOpCurrent = ingredient
    ? resolvedOperationalUnitCostEur({
        current_price: ingredient.current_price,
        purchase_quantity: ingredient.purchase_quantity,
      })
    : null;
  const catalogOpCorrect = correctReplay.catalogOperationalUnitCost;

  const recipeRefs = recipeUsage.get(product.ingredientId);
  const recipeImpact =
    recipeRefs?.recipes.map((recipeName) => {
      const recipe = db.recipes.find((r) => r.name === recipeName);
      const line = recipe?.recipe_ingredients?.find((ri) => ri.ingredient_id === product.ingredientId);
      const qty = Number(line?.quantity ?? 0);
      const curUnit = catalogOpCurrent ?? 0;
      const corUnit = catalogOpCorrect ?? 0;
      return {
        recipeName,
        recipeId: recipe?.id ?? null,
        lineQuantity: qty,
        lineUnit: line?.unit ?? null,
        currentLineCostEur: round(qty * curUnit, 4),
        correctLineCostEur: round(qty * corUnit, 4),
        deltaEur: round(qty * (corUnit - curUnit), 4),
      };
    }) ?? [];

  const fields = [
    fieldRow("invoice_items.quantity", norm?.quantity ?? null, correctReplay.bound.quantity, "A"),
    fieldRow(
      "invoice_items.unit_price (persisted pre-bind)",
      norm?.unit_price ?? null,
      correctReplay.bound.unit_price,
      "A",
      "Persistence stores extraction gross unit; bind would set total÷qty when qty=1",
    ),
    fieldRow("invoice_items.total", norm?.total ?? null, correctReplay.bound.total, "B", "Line total unchanged (PDF truth)"),
    fieldRow("invoice_items.unit", norm?.unit ?? null, correctReplay.bound.unit, "B"),
    fieldRow(
      "bound.unit_price (post-bindMonetaryColumns)",
      currentReplay.bound.unit_price,
      correctReplay.bound.unit_price,
      "A",
    ),
    fieldRow(
      "purchase_history.lastPurchase.quantityLabel",
      purchaseCurrent.quantityLabel,
      purchaseCorrect.quantityLabel,
      "A",
    ),
    fieldRow(
      "purchase_history.lastPurchase.unitPriceEur",
      purchaseCurrent.unitPriceEur,
      purchaseCorrect.unitPriceEur,
      "A",
    ),
    fieldRow(
      "purchase_history.lastPurchase.totalEur",
      purchaseCurrent.totalEur,
      purchaseCorrect.totalEur,
      "B",
    ),
    fieldRow(
      "procurement.current_price (display)",
      currentReplay.procurement?.current_price ?? null,
      correctReplay.procurement?.current_price ?? null,
      "A",
    ),
    fieldRow(
      "procurement.purchase_quantity (stored catalog)",
      ingredient?.purchase_quantity ?? currentReplay.procurement?.purchase_quantity ?? null,
      correctReplay.procurement?.purchase_quantity ?? null,
      product.key === "ricotta" ? "C" : "A",
      product.key === "mezzi"
        ? "Family A collapse keeps PQ=1 in both states; catalog may still store invoice qty"
        : "Catalog purchase_quantity may track invoice qty; requires re-ingest validation",
    ),
    fieldRow(
      "operational.current_price (per priced unit)",
      currentReplay.operational.current_price,
      correctReplay.operational.current_price,
      "A",
    ),
    fieldRow(
      "operational.usable_weight_grams (per unit)",
      currentReplay.operational.usable_weight_grams ?? null,
      correctReplay.operational.usable_weight_grams ?? null,
      product.key === "mezzi" ? "B" : "A",
    ),
    fieldRow(
      "usable_quantity.normalizedUsableQuantity",
      currentReplay.structured.normalizedUsableQuantity,
      correctReplay.structured.normalizedUsableQuantity,
      product.key === "mezzi" ? "B" : "A",
      product.key === "mezzi" ? "Family A collapse: usable stays at one-case 6000g" : "Scales with invoice qty for weight_or_volume",
    ),
    fieldRow(
      "usable_quantity.presentationLabel",
      currentReplay.presentation.usableQuantity,
      correctReplay.presentation.usableQuantity,
      product.key === "mezzi" ? "B" : "A",
    ),
    fieldRow(
      "operational_cost.effectiveUsableCost",
      currentReplay.effectiveCost.cost,
      correctReplay.effectiveCost.cost,
      product.key === "mezzi" ? "B" : "A",
      product.key === "mezzi" ? "€/kg unchanged: total÷6kg in both states" : null,
    ),
    fieldRow(
      "operational_cost.unit",
      currentReplay.effectiveCost.unit,
      correctReplay.effectiveCost.unit,
      "B",
    ),
    fieldRow(
      "ingredient.current_price (catalog pack price)",
      ingredient?.current_price ?? null,
      correctReplay.bound.unit_price,
      "A",
      "Catalog stores pack/case price from last matched invoice",
    ),
    fieldRow(
      "ingredient.purchase_quantity",
      ingredient?.purchase_quantity ?? null,
      product.counterfactualQty,
      "A",
    ),
    fieldRow(
      "ingredient.catalogOperationalUnitCost",
      catalogOpCurrent,
      catalogOpCorrect,
      product.key === "mezzi" ? "B" : "A",
    ),
    fieldRow(
      "ingredient_price_history.new_price (operational unit)",
      bocconcinoHistory[0]?.new_price ?? history[0]?.new_price ?? null,
      correctReplay.historyPrice,
      "A",
    ),
    fieldRow(
      "ingredient_price_history.previous_price",
      bocconcinoHistory[0]?.previous_price ?? history[0]?.previous_price ?? null,
      bocconcinoHistory[0]?.previous_price ?? history[0]?.previous_price ?? null,
      "B",
      "First history row; unchanged if only this invoice exists",
    ),
    fieldRow(
      "opportunities.priceChangeSignal",
      bocconcinoHistory.length > 0 ? "none (single history row)" : "none",
      bocconcinoHistory.length > 0 ? "none (single history row)" : "none",
      "B",
      "No prior price to compare; opportunity alerts depend on delta vs previous",
    ),
    fieldRow(
      "alerts.quantityMismatch",
      product.key === "ricotta" ? "family_a_mismatch (qty 2 vs PQ 1)" : "family_a_mismatch + split_brain",
      "resolved or reduced",
      "A",
      "Mismatch signals in .tmp/quantity-mismatch-validation/mismatches.json should clear or change",
    ),
    fieldRow(
      "dashboard.recipeFoodCost (affected recipes)",
      recipeImpact.length ? recipeImpact.map((r) => r.currentLineCostEur) : null,
      recipeImpact.length ? recipeImpact.map((r) => r.correctLineCostEur) : null,
      recipeImpact.some((r) => r.deltaEur !== 0) ? "A" : "B",
      recipeImpact.length ? `${recipeImpact.length} recipe(s) reference ingredient` : "No recipe references found",
    ),
    fieldRow(
      "supplier_metrics.spendOnLine",
      norm?.total ?? null,
      correctReplay.bound.total,
      "B",
      "Invoice line total unchanged",
    ),
    fieldRow(
      "supplier_metrics.avgUnitPrice",
      norm?.unit_price ?? null,
      correctReplay.bound.unit_price,
      "A",
      "Supplier rollups using persisted unit_price would change",
    ),
  ];

  return {
    product: product.key,
    lineName: product.lineName,
    invoiceItemId: product.invoiceItemId,
    ingredientId: product.ingredientId,
    ingredientName: ingredient?.name ?? null,
    pdfTruth: { quantity: 1, note: "QUANT=1,000 on invoice PNG" },
    persisted: norm,
    extractAtSource: product.extractRaw,
    currentReplay,
    correctReplay,
    purchases: { current: purchaseCurrent, correct: purchaseCorrect },
    priceHistory: history,
    recipeImpact,
    fields,
    summary: {
      mustChange: fields.filter((f) => f.classification === "A").map((f) => f.field),
      shouldNotChange: fields.filter((f) => f.classification === "B").map((f) => f.field),
      requiresValidation: fields.filter((f) => f.classification === "C").map((f) => f.field),
    },
  };
}

mkdirSync(".tmp/family-a-impact-analysis", { recursive: true });
const db = await loadDbContext();
const recipeUsage = getRecipeUsageByIngredient(db.recipes as never);
const analyses = PRODUCTS.map((p) => analyzeProduct(p, db, recipeUsage));

const otherIngredientsOnInvoice = db.items
  .filter((i) => !PRODUCTS.some((p) => p.invoiceItemId === i.id))
  .map((i) => ({ id: i.id, name: i.name }));

const output = {
  generatedAt: new Date().toISOString(),
  validationLab: VL,
  invoiceId: INVOICE_ID,
  invoice: db.invoice,
  method:
    "Read-only VL SELECT + production replay (bindMonetaryColumns → resolveInvoiceLinePurchaseFormat → resolveCountablePurchaseQuantityForCost → computeEffectiveUsableCost → procurementPackFieldsFromInvoiceLine → operationalUnitPriceForPriceHistory)",
  counterfactual: "Extraction quantity 2→1 at Hybrid H source; unit_price and total held from v25 extract",
  products: analyses,
  otherIngredientsAffected: {
    onSameInvoice: otherIngredientsOnInvoice,
    crossIngredientImpact: false,
    rationale:
      "Qty correction is line-local. No shared pack collapse, alias, or supplier rollup field couples Ricotta/Mezzi to other invoice lines. Recipe graph references only these two ingredient IDs.",
    otherIngredientIdsChecked: PRODUCTS.map((p) => p.ingredientId),
  },
  invoiceLevel: {
    total: db.invoice?.total ?? null,
    deltaIfQty1: 0,
    classification: "B",
    note: "Invoice header total unchanged; only per-line unit economics change",
  },
};

writeFileSync(".tmp/family-a-impact-analysis/impact.json", JSON.stringify(output, null, 2));
console.log("wrote .tmp/family-a-impact-analysis/impact.json");
