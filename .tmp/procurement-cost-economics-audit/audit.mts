/**
 * STRICT READ-ONLY Procurement Cost Economics Audit — VL bjhnlrgodcqoyzddbpbd
 * Goal: Does Procurement Cost = A) Invoice Unit Price or B) Effective Cost Paid (line_total÷qty)?
 */
const metaEnv = import.meta as { env: Record<string, unknown> };
if (!metaEnv.env) metaEnv.env = { DEV: false, PROD: true };
metaEnv.env.DEV = false;
metaEnv.env.PROD = true;

import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import {
  bindMonetaryColumns,
  parseMonetaryLineItems,
} from "../../supabase/functions/extract-invoice/invoice-monetary-binding.ts";
import { normalizeInvoiceItemFields } from "../../src/lib/invoice-item-fields.ts";
import {
  computeEffectiveUsableCost,
  formatRowPurchaseQuantityLabel,
  recipeOperationalCostFieldsFromInvoiceLine,
  resolveInvoiceLinePricingPresentation,
  resolveUsablePerPricedUnit,
} from "../../src/lib/invoice-purchase-price-semantics.ts";
import { resolveInvoiceLinePurchaseFormat } from "../../src/lib/invoice-purchase-format.ts";
import {
  operationalCostFieldsFromInvoiceLine,
  defaultIsGenericUnit,
} from "../../src/lib/ingredient-auto-persist.ts";
import { buildLastPurchaseCostPresentation } from "../../src/lib/ingredient-detail-panel.ts";
import {
  effectiveIngredientUnitCostEur,
  resolvedOperationalUnitCostEur,
} from "../../src/lib/ingredient-unit-cost.ts";
import { operationalUnitPriceForPriceHistory } from "../../src/lib/ingredient-price-history.ts";

const VL = "bjhnlrgodcqoyzddbpbd";
const EMPORIO_INVOICE_ID = "ab52796d-de1d-418d-86e7-230c8f056f09";
const OUT = ".tmp/procurement-cost-economics-audit";
const PRICE_TOLERANCE = 0.02;

const PRODUCTS = [
  {
    key: "gorgonzola",
    displayName: "Gorgonzola DOP dolce",
    ingredientPattern: "%Gorgonzola%DOP%dolce%",
    invoicePattern: "%Gorgonzola%",
  },
  {
    key: "prosciutto",
    displayName: "Prosciutto cotto scelto",
    ingredientPattern: "%Prosciutto%Cotto%Scelto%",
    invoicePattern: "%Prosciutto%Cotto%Scelto%",
  },
  {
    key: "mortadella",
    displayName: "Mortadella IGP massima con pistacchio",
    ingredientPattern: "%Mortadella%IGP%Massima%Pistacchio%",
    invoicePattern: "%Mortadella%IGP%Massima%Pistacchio%",
  },
  {
    key: "bresaola",
    displayName: "Bresaola punta d'anca oro",
    ingredientPattern: "%Bresaola%Punta%Anca%Oro%",
    invoicePattern: "%Bresaola%Punta%Anca%Oro%",
  },
] as const;

type MonetaryInput = {
  name: string;
  quantity: number | null;
  unit: string | null;
  unit_price: number | null;
  total: number | null;
  gross_unit_price?: number | null;
  discount_pct?: number | null;
  line_total_net?: number | null;
};

function projectKey(): string {
  const raw = execSync(`supabase projects api-keys --project-ref ${VL} -o json`, {
    encoding: "utf8",
  });
  return (JSON.parse(raw) as { name: string; api_key: string }[]).find(
    (k) => k.name === "service_role",
  )!.api_key;
}

const sb = createClient(`https://${VL}.supabase.co`, projectKey(), {
  auth: { persistSession: false },
});

function bindLine(raw: MonetaryInput) {
  const [bound] = bindMonetaryColumns(
    parseMonetaryLineItems([
      {
        name: raw.name,
        quantity: raw.quantity,
        unit: raw.unit,
        gross_unit_price: raw.gross_unit_price ?? null,
        discount_pct: raw.discount_pct ?? null,
        line_total_net: raw.line_total_net ?? null,
        unit_price: raw.unit_price,
        total: raw.total,
      },
    ]),
  );
  return normalizeInvoiceItemFields(bound);
}

function resolvePurchaseCostLabels(metadata: {
  name: string;
  quantity: number | null;
  unit: string | null;
  unit_price: number | null;
  line_total?: number | null;
}) {
  const presentation = resolveInvoiceLinePricingPresentation(metadata);
  return {
    procurementCostLabel: presentation.priceDisplay,
    operationalCostLabel: presentation.effectiveUsableCostLabel,
    presentation,
  };
}

function eurPerKgFromFields(fields: {
  current_price: number;
  purchase_quantity: number;
  cost_base_unit: string;
}): number | null {
  if (fields.cost_base_unit !== "g") return null;
  const perG = resolvedOperationalUnitCostEur(fields);
  return perG != null ? perG * 1000 : null;
}

function matchesWithinTolerance(a: number, b: number): boolean {
  return Math.abs(a - b) <= PRICE_TOLERANCE;
}

function traceProduct(item: {
  id: string;
  invoice_id: string;
  name: string;
  quantity: number | null;
  unit: string | null;
  unit_price: number | null;
  total: number | null;
  created_at?: string;
  updated_at?: string;
}) {
  const metadata = {
    name: item.name,
    quantity: item.quantity,
    unit: item.unit,
    unit_price: item.unit_price,
    line_total: item.total,
  };
  const structured = resolveInvoiceLinePurchaseFormat(metadata);
  const costLabels = resolvePurchaseCostLabels(metadata);
  const persistFields = operationalCostFieldsFromInvoiceLine(item);
  const recipeFields = recipeOperationalCostFieldsFromInvoiceLine(metadata);
  const perUnit = resolveUsablePerPricedUnit(metadata, structured);
  const effective =
    item.unit_price != null
      ? computeEffectiveUsableCost(item.unit_price, metadata, structured, item.name)
      : null;

  const qty = item.quantity;
  const unitPrice = item.unit_price;
  const lineTotal = item.total;
  const effectivePaidPerKg =
    qty != null && qty > 0 && lineTotal != null && item.unit === "kg"
      ? lineTotal / qty
      : null;

  const displayedProcurementEurPerKg = effective?.cost ?? null;
  const procurementMatchesUnitPrice =
    unitPrice != null &&
    displayedProcurementEurPerKg != null &&
    matchesWithinTolerance(unitPrice, displayedProcurementEurPerKg);
  const procurementMatchesEffectivePaid =
    effectivePaidPerKg != null &&
    displayedProcurementEurPerKg != null &&
    matchesWithinTolerance(effectivePaidPerKg, displayedProcurementEurPerKg);
  const unitPriceMatchesEffectivePaid =
    unitPrice != null &&
    effectivePaidPerKg != null &&
    matchesWithinTolerance(unitPrice, effectivePaidPerKg);
  const qtyTimesUnitEqualsTotal =
    qty != null && unitPrice != null && lineTotal != null
      ? matchesWithinTolerance(qty * unitPrice, lineTotal)
      : null;

  const detailPresentation = buildLastPurchaseCostPresentation({
    itemId: item.id,
    supplierLabel: "Emporio Italia",
    dateLabel: "19/05/2026",
    dateIso: "2026-05-19",
    priceLabel: lineTotal != null ? `€${lineTotal.toFixed(2)}` : null,
    comparablePrice: displayedProcurementEurPerKg,
    purchaseQuantityLabel: formatRowPurchaseQuantityLabel(metadata),
    procurementCostLabel: costLabels.procurementCostLabel,
    operationalCostLabel: costLabels.operationalCostLabel,
    unitCostLabel: costLabels.operationalCostLabel,
    productHint: item.name,
  });

  const recipeEurPerKg = recipeFields ? eurPerKgFromFields(recipeFields) : null;
  const recipeCosting = recipeFields
    ? {
        cost100g: (resolvedOperationalUnitCostEur(recipeFields) ?? 0) * 100,
        cost250g: (resolvedOperationalUnitCostEur(recipeFields) ?? 0) * 250,
        cost500g: (resolvedOperationalUnitCostEur(recipeFields) ?? 0) * 500,
        cost1000g: (resolvedOperationalUnitCostEur(recipeFields) ?? 0) * 1000,
        recipeEurPerKg,
        effectivePaidEurPerKg: effectivePaidPerKg,
        varianceEurPerKg:
          recipeEurPerKg != null && effectivePaidPerKg != null
            ? recipeEurPerKg - effectivePaidPerKg
            : null,
        variancePct:
          recipeEurPerKg != null && effectivePaidPerKg != null && effectivePaidPerKg !== 0
            ? ((recipeEurPerKg - effectivePaidPerKg) / effectivePaidPerKg) * 100
            : null,
      }
    : null;

  return {
    invoiceItem: item,
    metadata,
    structured: {
      kind: structured.kind,
      normalizedUsableQuantity: structured.normalizedUsableQuantity,
      usableQuantityUnit: structured.usableQuantityUnit,
    },
    costLabels,
    persistFields,
    recipeFields,
    perUnit,
    effective,
    effectivePaidPerKg,
    displayedProcurementEurPerKg,
    procurementMatchesUnitPrice,
    procurementMatchesEffectivePaid,
    unitPriceMatchesEffectivePaid,
    qtyTimesUnitEqualsTotal,
    detailPresentation,
    recipeCosting,
    historyStoredNewPrice: recipeFields
      ? operationalUnitPriceForPriceHistory(
          recipeFields.current_price,
          recipeFields.purchase_quantity,
        )
      : null,
  };
}

mkdirSync(OUT, { recursive: true });

const { data: invoice } = await sb
  .from("invoices")
  .select("id,supplier_name,invoice_date,created_at,total")
  .eq("id", EMPORIO_INVOICE_ID)
  .maybeSingle();

const productTraces: Record<string, ReturnType<typeof traceProduct> & { ingredient: unknown; priceHistory: unknown[] }> =
  {};

for (const spec of PRODUCTS) {
  const { data: items } = await sb
    .from("invoice_items")
    .select("id,invoice_id,name,quantity,unit,unit_price,total,created_at,updated_at")
    .eq("invoice_id", EMPORIO_INVOICE_ID)
    .ilike("name", spec.invoicePattern)
    .limit(1);

  const { data: ingredient } = await sb
    .from("ingredients")
    .select(
      "id,name,current_price,purchase_quantity,purchase_unit,base_unit,unit,normalized_name,supplier,created_at,updated_at",
    )
    .ilike("name", spec.ingredientPattern)
    .limit(1)
    .maybeSingle();

  const item = items?.[0];
  if (!item) continue;

  const trace = traceProduct(item);

  const { data: priceHistory } = ingredient
    ? await sb
        .from("ingredient_price_history")
        .select(
          "id,ingredient_id,invoice_id,ingredient_name,previous_price,new_price,delta,delta_percent,created_at,invoices(invoice_date,supplier_name)",
        )
        .eq("ingredient_id", ingredient.id)
        .order("created_at", { ascending: false })
        .limit(5)
    : { data: [] };

  productTraces[spec.key] = {
    ...trace,
    ingredient: ingredient ?? null,
    priceHistory: priceHistory ?? [],
  };
}

// T1 — Gorgonzola full field trace with sources
const gorg = productTraces.gorgonzola;
const gorgBindingScenarios = [
  {
    label: "live_db_as_bound_input",
    input: {
      name: gorg?.invoiceItem.name ?? "",
      quantity: gorg?.invoiceItem.quantity ?? null,
      unit: gorg?.invoiceItem.unit ?? null,
      gross_unit_price: null,
      discount_pct: null,
      line_total_net: gorg?.invoiceItem.total ?? null,
      unit_price: gorg?.invoiceItem.unit_price ?? null,
      total: gorg?.invoiceItem.total ?? null,
    },
  },
  {
    label: "pdf_gross_discount_qty_1_35",
    input: {
      name: gorg?.invoiceItem.name ?? "",
      quantity: 1.35,
      unit: "kg",
      gross_unit_price: 12.9,
      discount_pct: 22.85,
      line_total_net: 13.44,
      unit_price: null,
      total: null,
    },
  },
  {
    label: "pdf_gross_discount_db_qty_1_05",
    input: {
      name: gorg?.invoiceItem.name ?? "",
      quantity: 1.05,
      unit: "kg",
      gross_unit_price: 12.9,
      discount_pct: 22.85,
      line_total_net: 13.44,
      unit_price: null,
      total: null,
    },
  },
  {
    label: "effective_paid_rebind_candidate",
    input: {
      name: gorg?.invoiceItem.name ?? "",
      quantity: 1.05,
      unit: "kg",
      gross_unit_price: null,
      discount_pct: null,
      line_total_net: null,
      unit_price: 10.88,
      total: 13.44,
    },
  },
].map((s) => ({ ...s, bound: bindLine(s.input) }));

// T5 — Discount handling scenarios
const discountScenarios = [
  {
    label: "pre_discount_gross_only",
    input: {
      name: "Test — gross only",
      quantity: 1.05,
      unit: "kg",
      gross_unit_price: 12.9,
      discount_pct: null,
      line_total_net: null,
      unit_price: null,
      total: null,
    },
  },
  {
    label: "post_discount_gross_and_pct",
    input: {
      name: "Test — gross + discount",
      quantity: 1.05,
      unit: "kg",
      gross_unit_price: 12.9,
      discount_pct: 22.85,
      line_total_net: 13.44,
      unit_price: null,
      total: null,
    },
  },
  {
    label: "mixed_db_gorgonzola_no_discount_cols",
    input: {
      name: gorg?.invoiceItem.name ?? "Gorgonzola",
      quantity: 1.05,
      unit: "kg",
      gross_unit_price: null,
      discount_pct: null,
      line_total_net: 13.44,
      unit_price: 10.88,
      total: 13.44,
    },
  },
  {
    label: "effective_paid_when_total_lt_qty_x_unit",
    input: {
      name: "Test — gross unit exceeds net total",
      quantity: 1.05,
      unit: "kg",
      gross_unit_price: null,
      discount_pct: null,
      line_total_net: null,
      unit_price: 12.9,
      total: 13.44,
    },
  },
  {
    label: "effective_paid_when_total_gt_qty_x_unit_gorgonzola_shape",
    input: {
      name: "Gorgonzola shape — total > qty×unit",
      quantity: 1.05,
      unit: "kg",
      gross_unit_price: null,
      discount_pct: null,
      line_total_net: null,
      unit_price: 10.88,
      total: 13.44,
    },
  },
].map((s) => {
  const bound = bindLine(s.input);
  const effectivePaid =
    bound.quantity != null && bound.quantity > 0 && bound.total != null
      ? bound.total / bound.quantity
      : null;
  return {
    scenario: s.label,
    input: s.input,
    bound,
    effectivePaidPerKg: effectivePaid,
    bindingUsesEffectivePaid:
      bound.unit_price != null &&
      effectivePaid != null &&
      matchesWithinTolerance(bound.unit_price, effectivePaid),
    bindingUsesDerivedNet:
      s.input.gross_unit_price != null &&
      s.input.discount_pct != null &&
      bound.unit_price != null &&
      matchesWithinTolerance(
        bound.unit_price,
        Math.round(s.input.gross_unit_price * (1 - s.input.discount_pct / 100) * 100) / 100,
      ),
  };
});

// Required table
const requiredTable = PRODUCTS.map((spec) => {
  const t = productTraces[spec.key];
  if (!t) {
    return {
      product: spec.displayName,
      unitPrice: null,
      effectivePaidCost: null,
      displayedProcurement: null,
      match: "NO_DATA",
    };
  }
  const match =
    t.procurementMatchesUnitPrice && !t.procurementMatchesEffectivePaid
      ? "UNIT_PRICE"
      : t.procurementMatchesEffectivePaid && !t.procurementMatchesUnitPrice
        ? "EFFECTIVE_PAID"
        : t.procurementMatchesUnitPrice && t.procurementMatchesEffectivePaid
          ? "BOTH"
          : "NEITHER";
  return {
    product: spec.displayName,
    unitPrice: t.invoiceItem.unit_price,
    effectivePaidCost:
      t.effectivePaidPerKg != null ? Number(t.effectivePaidPerKg.toFixed(4)) : null,
    displayedProcurement: t.costLabels.procurementCostLabel,
    match,
  };
});

// T2 — Procurement origin classification
const t2 = {
  resolvePurchaseCostLabels: {
    source: "src/lib/ingredient-purchase-memory.ts L94-103",
    procurementCostLabel: "presentation.priceDisplay",
    operationalCostLabel: "presentation.effectiveUsableCostLabel",
    priceDisplaySource: "resolveInvoiceLinePricingPresentation L1239-1243 uses metadata.unit_price",
    effectiveSource:
      "computeEffectiveUsableCost(unitPrice, ...) — same unitPrice numerator for kg rows",
    classification: "A",
    classificationMeaning: "Procurement Cost label = Invoice Unit Price (not line_total÷qty)",
  },
  buildLastPurchaseCostPresentation: {
    source: "src/lib/ingredient-detail-panel.ts L299-334",
    procurementCost: "purchase.procurementCostLabel (passthrough from resolvePurchaseCostLabels)",
    operationalCost: "purchase.operationalCostLabel",
    totalPaid: "purchase.priceLabel = formatCurrency(lineTotal) when present",
    gorgonzolaReplay: gorg?.detailPresentation ?? null,
    classification: "A",
  },
};

// Verdict logic
const allProcurementMatchUnitPrice = PRODUCTS.every((s) => {
  const t = productTraces[s.key];
  return t?.procurementMatchesUnitPrice === true;
});
const anyProcurementMatchEffectivePaid = PRODUCTS.some((s) => {
  const t = productTraces[s.key];
  return t?.procurementMatchesEffectivePaid === true;
});
const gorgonzolaDataInconsistent = gorg?.qtyTimesUnitEqualsTotal === false;
const gorgonzolaBindingWouldBe995 =
  gorgBindingScenarios.find((s) => s.label === "pdf_gross_discount_db_qty_1_05")?.bound
    .unit_price === 9.95;

let finalVerdict: "A" | "B" | "C" | "D";
let verdictRationale: string;

if (allProcurementMatchUnitPrice && !anyProcurementMatchEffectivePaid) {
  finalVerdict = "A";
  verdictRationale =
    "Display pipeline always derives Procurement Cost from invoice_items.unit_price via resolvePurchaseCostLabels → resolveInvoiceLinePricingPresentation.priceDisplay. For all four deli products, displayed €/kg equals unit_price.";
} else if (anyProcurementMatchEffectivePaid && !allProcurementMatchUnitPrice) {
  finalVerdict = "B";
  verdictRationale = "Procurement Cost matches line_total÷qty for at least one product.";
} else if (allProcurementMatchUnitPrice && gorgonzolaDataInconsistent) {
  finalVerdict = "D";
  verdictRationale =
    "Procurement display uses unit_price (A) by design, but Gorgonzola persisted unit_price (€10.88) is arithmetically inconsistent with line_total÷qty (€12.80/kg) and with PDF gross-discount binding (€9.95/kg). Data defect at extraction/persistence; display faithfully mirrors corrupt unit_price.";
} else {
  finalVerdict = "C";
  verdictRationale = "Mixed: extraction bindMonetaryColumns can rebind unit_price to effective paid pre-persist, but post-persist display always uses stored unit_price.";
}

// Override: Gorgonzola is the focal case — unit_price≠effective paid, so not pure A for economics
if (gorgonzolaDataInconsistent && allProcurementMatchUnitPrice) {
  finalVerdict = "D";
  verdictRationale =
    "Architectural basis is A (unit_price), but Gorgonzola invoice_items violate qty×unit_price=total. Displayed €10.88/kg mirrors unit_price; economically paid €12.80/kg (=13.44÷1.05) is not represented. bindMonetaryColumns applyEffectivePaidPrice only fires when total < qty×unit_price (gross-over-net); Gorgonzola has total > qty×unit_price so no rebind. Verdict D: data extraction defect, not intentional effective-paid semantics.";
}

const gorgonzolaAnswer = {
  displayedEurPerKg: gorg?.displayedProcurementEurPerKg ?? null,
  effectivePaidEurPerKg: gorg?.effectivePaidPerKg ?? null,
  unitPriceDb: gorg?.invoiceItem.unit_price ?? null,
  intendedByCode: "€10.88/kg — persisted invoice_items.unit_price passed through kg-row short-circuit",
  economicallyPaid: "€12.80/kg — line_total (13.44) ÷ quantity (1.05 kg)",
  pdfBindingWouldBe: gorgonzolaBindingWouldBe995 ? "€9.95/kg from gross 12.90 × (1−22.85%)" : null,
  conclusion:
    "€10.88/kg is what Marginly displays because the pipeline treats unit_price as net €/kg; it is NOT the effective cost paid (€12.80/kg). The persisted unit_price itself is inconsistent with both PDF discount math and line arithmetic.",
};

const results = {
  validationLab: VL,
  generatedAt: new Date().toISOString(),
  emporioInvoiceId: EMPORIO_INVOICE_ID,
  invoice,
  task1_gorgonzolaFullTrace: gorg
    ? {
        invoice: {
          invoice_id: gorg.invoiceItem.invoice_id,
          invoice_item_id: gorg.invoiceItem.id,
          raw_description: gorg.invoiceItem.name,
          raw_quantity: gorg.invoiceItem.quantity,
          raw_unit: gorg.invoiceItem.unit,
          unit_price: gorg.invoiceItem.unit_price,
          line_total: gorg.invoiceItem.total,
          created_at: gorg.invoiceItem.created_at,
          updated_at: gorg.invoiceItem.updated_at,
        },
        bindingReplays: gorgBindingScenarios,
        parseAndPersistChain: {
          operationalCostFieldsFromInvoiceLine: gorg.persistFields,
          recipeOperationalCostFieldsFromInvoiceLine: gorg.recipeFields,
          storedIngredient: gorg.ingredient,
          resolveUsablePerPricedUnit: gorg.perUnit,
          computeEffectiveUsableCost: gorg.effective,
          resolveInvoiceLinePricingPresentation: gorg.costLabels.presentation,
          buildLastPurchaseCostPresentation: gorg.detailPresentation,
        },
        fieldSources: [
          { field: "Last Purchase qty", value: gorg.detailPresentation?.lastPurchase, source: "formatRowPurchaseQuantityLabel(metadata) → invoice_items.quantity+unit" },
          { field: "Procurement Cost", value: gorg.costLabels.procurementCostLabel, source: "resolvePurchaseCostLabels → presentation.priceDisplay → unit_price" },
          { field: "Operational Cost", value: gorg.costLabels.operationalCostLabel, source: "computeEffectiveUsableCost(unit_price)" },
          { field: "Total Paid", value: gorg.detailPresentation?.totalPaid, source: "invoice_items.total" },
          { field: "current_price", value: (gorg.ingredient as { current_price?: number })?.current_price, source: "ingredients.current_price ← operationalCostFieldsFromInvoiceLine" },
          { field: "purchase_quantity", value: (gorg.ingredient as { purchase_quantity?: number })?.purchase_quantity, source: "recipeOperationalCostFieldsFromInvoiceLine kg short-circuit → 1000g" },
        ],
      }
    : null,
  task2_procurementOrigin: t2,
  task3_effectiveVsDisplayed: PRODUCTS.map((spec) => {
    const t = productTraces[spec.key];
    return {
      product: spec.displayName,
      unitPrice: t?.invoiceItem.unit_price ?? null,
      effectivePaidPerKg: t?.effectivePaidPerKg ?? null,
      displayedProcurement: t?.costLabels.procurementCostLabel ?? null,
      displayedOperational: t?.costLabels.operationalCostLabel ?? null,
      procurementEqualsUnitPrice: t?.procurementMatchesUnitPrice ?? null,
      procurementEqualsEffectivePaid: t?.procurementMatchesEffectivePaid ?? null,
      qtyTimesUnitEqualsTotal: t?.qtyTimesUnitEqualsTotal ?? null,
    };
  }),
  task4_deliFamilyUnitPriceVsEffective: PRODUCTS.map((spec) => {
    const t = productTraces[spec.key];
    return {
      product: spec.displayName,
      quantity: t?.invoiceItem.quantity ?? null,
      unit_price: t?.invoiceItem.unit_price ?? null,
      line_total: t?.invoiceItem.total ?? null,
      line_total_div_qty: t?.effectivePaidPerKg ?? null,
      unit_price_eq_line_total_div_qty: t?.unitPriceMatchesEffectivePaid ?? null,
      qty_times_unit_price: t?.invoiceItem.quantity != null && t?.invoiceItem.unit_price != null
        ? t.invoiceItem.quantity * t.invoiceItem.unit_price
        : null,
    };
  }),
  task5_discountHandling: {
    bindMonetaryColumnsSource: "supabase/functions/extract-invoice/invoice-monetary-binding.ts",
    rules: {
      applyStructuredBinding: "deriveNetUnitPrice(gross × (1−discount%)); prefer line_total_net",
      applyEffectivePaidPrice: "total÷qty when total < qty×unit_price AND discount_pct is null",
      note: "Gorgonzola DB row has no discount columns; total (13.44) > qty×unit_price (11.42) so effective-paid rebind does NOT fire",
    },
    scenarios: discountScenarios,
  },
  task6_gorgonzolaRecipeCosting: gorg?.recipeCosting ?? null,
  task7_historicalPricing: PRODUCTS.map((spec) => {
    const t = productTraces[spec.key];
    const hist = t?.priceHistory ?? [];
    const ing = t?.ingredient as { current_price?: number; purchase_quantity?: number } | null;
    return {
      product: spec.displayName,
      ingredientId: (t?.ingredient as { id?: string })?.id ?? null,
      currentPricePack: ing?.current_price ?? null,
      purchaseQuantity: ing?.purchase_quantity ?? null,
      currentOperationalEurPerG:
        ing?.current_price != null && ing?.purchase_quantity
          ? ing.current_price / ing.purchase_quantity
          : null,
      historyRows: hist.map((r: { new_price: number; created_at: string; invoice_id: string }) => ({
        created_at: r.created_at,
        new_price_eur_per_g: r.new_price,
        new_price_eur_per_kg: r.new_price * 1000,
        invoice_id: r.invoice_id,
        matchesUnitPriceBasis:
          t?.invoiceItem.unit_price != null &&
          matchesWithinTolerance(r.new_price * 1000, t.invoiceItem.unit_price),
        matchesEffectivePaidBasis:
          t?.effectivePaidPerKg != null &&
          matchesWithinTolerance(r.new_price * 1000, t.effectivePaidPerKg),
      })),
      alertsNote:
        "margin-alerts.ts uses ingredient_price_history.new_price (operational €/g), same unit_price÷purchase_quantity basis — not line_total÷qty",
    };
  }),
  requiredTable,
  finalVerdict: {
    letter: finalVerdict,
    options: {
      A: "Procurement Cost = Invoice Unit Price (architectural/display)",
      B: "Procurement Cost = Effective Cost Paid (line_total ÷ qty)",
      C: "Mixed — extraction may rebind pre-persist; display always uses persisted unit_price",
      D: "Data defect — Gorgonzola unit_price inconsistent with line arithmetic and PDF binding",
    },
    rationale: verdictRationale,
    gorgonzolaAnswer,
  },
  codeEvidence: {
    resolvePurchaseCostLabels: "ingredient-purchase-memory.ts:94-103 — procurementCostLabel = presentation.priceDisplay from unit_price",
    resolveInvoiceLinePricingPresentation: "invoice-purchase-price-semantics.ts:1239-1248 — priceDisplay from unitPrice; effective from computeEffectiveUsableCost(same unitPrice)",
    recipeOperationalCostFieldsFromInvoiceLine: "invoice-purchase-price-semantics.ts:665-666 — kg row: current_price=unit_price, purchase_quantity=1000",
    operationalCostFieldsFromInvoiceLine: "ingredient-auto-persist.ts:73-103 — delegates to recipeOperationalCostFieldsFromInvoiceLine",
    buildLastPurchaseCostPresentation: "ingredient-detail-panel.ts:299-334 — passthrough procurementCostLabel",
    bindMonetaryColumns: "invoice-monetary-binding.ts:120-129 — applyEffectivePaidPrice only when total < qty×unit_price",
    operationalUnitPriceForPriceHistory: "ingredient-price-history.ts:149-159 — packPrice/purchase_quantity, not line_total÷qty",
  },
};

writeFileSync(`${OUT}/results.json`, JSON.stringify(results, null, 2));

// Markdown report
const md: string[] = [];
md.push("# Procurement Cost Economics Audit");
md.push("");
md.push(`**Validation Lab:** \`${VL}\` · **Invoice:** \`${EMPORIO_INVOICE_ID}\` (Emporio Italia) · **Read-only** · ${new Date().toISOString().slice(0, 10)}`);
md.push("");
md.push("## Goal");
md.push("");
md.push("Does **Procurement Cost** represent **A) Invoice Unit Price** or **B) Effective Cost Paid** (line_total ÷ qty)?");
md.push("");

md.push("## Required table");
md.push("");
md.push("| Product | Unit Price | Effective Paid Cost | Displayed Procurement | Match? |");
md.push("|---------|------------|---------------------|----------------------|--------|");
for (const row of requiredTable) {
  const eff = row.effectivePaidCost != null ? `€${row.effectivePaidCost.toFixed(2)}/kg` : "—";
  const up = row.unitPrice != null ? `€${row.unitPrice.toFixed(2)}/kg` : "—";
  md.push(`| ${row.product} | ${up} | ${eff} | ${row.displayedProcurement ?? "—"} | ${row.match} |`);
}
md.push("");

md.push("## Task 1 — Gorgonzola full trace");
md.push("");
if (gorg) {
  md.push("### Raw invoice (DB)");
  md.push("");
  md.push("| Field | Value | Source |");
  md.push("|-------|-------|--------|");
  for (const fs of results.task1_gorgonzolaFullTrace!.fieldSources) {
    md.push(`| ${fs.field} | ${fs.value ?? "—"} | ${fs.source} |`);
  }
  md.push("");
  md.push("### Invoice item columns");
  md.push("");
  md.push("```json");
  md.push(JSON.stringify(results.task1_gorgonzolaFullTrace!.invoice, null, 2));
  md.push("```");
  md.push("");
  md.push("### bindMonetaryColumns replays");
  md.push("");
  for (const r of gorgBindingScenarios) {
    md.push(`- **${r.label}** → \`${JSON.stringify(r.bound)}\``);
  }
  md.push("");
  md.push("### Persistence chain");
  md.push("");
  md.push("| Function | Output |");
  md.push("|----------|--------|");
  const chain = results.task1_gorgonzolaFullTrace!.parseAndPersistChain;
  md.push(`| operationalCostFieldsFromInvoiceLine | \`${JSON.stringify(chain.operationalCostFieldsFromInvoiceLine)}\` |`);
  md.push(`| recipeOperationalCostFieldsFromInvoiceLine | \`${JSON.stringify(chain.recipeOperationalCostFieldsFromInvoiceLine)}\` |`);
  md.push(`| resolveUsablePerPricedUnit | \`${JSON.stringify(chain.resolveUsablePerPricedUnit)}\` |`);
  md.push(`| computeEffectiveUsableCost | \`${JSON.stringify(chain.computeEffectiveUsableCost)}\` |`);
  md.push(`| buildLastPurchaseCostPresentation | \`${JSON.stringify(chain.buildLastPurchaseCostPresentation)}\` |`);
}
md.push("");

md.push("## Task 2 — Procurement Cost origin");
md.push("");
md.push("### resolvePurchaseCostLabels");
md.push("");
md.push(`- **Source:** \`${t2.resolvePurchaseCostLabels.source}\``);
md.push(`- **procurementCostLabel** = \`${t2.resolvePurchaseCostLabels.procurementCostLabel}\``);
md.push(`- **Classification:** **${t2.resolvePurchaseCostLabels.classification})** ${t2.resolvePurchaseCostLabels.classificationMeaning}`);
md.push("");
md.push("### buildLastPurchaseCostPresentation");
md.push("");
md.push(`- **Source:** \`${t2.buildLastPurchaseCostPresentation.source}\``);
md.push(`- **procurementCost** = \`${t2.buildLastPurchaseCostPresentation.procurementCost}\``);
md.push(`- **Classification:** **${t2.buildLastPurchaseCostPresentation.classification})** Invoice Unit Price passthrough`);
md.push("");

md.push("## Task 3 — Effective cost paid vs displayed");
md.push("");
md.push("| Product | unit_price | effective paid €/kg | displayed procurement | matches unit_price? | matches effective? | qty×unit=total? |");
md.push("|---------|------------|---------------------|----------------------|---------------------|-------------------|----------------|");
for (const row of results.task3_effectiveVsDisplayed) {
  md.push(
    `| ${row.product} | ${row.unitPrice} | ${row.effectivePaidPerKg?.toFixed(4) ?? "—"} | ${row.displayedProcurement} | ${row.procurementEqualsUnitPrice} | ${row.procurementEqualsEffectivePaid} | ${row.qtyTimesUnitEqualsTotal} |`,
  );
}
md.push("");

md.push("## Task 4 — Deli family: unit_price == line_total÷qty?");
md.push("");
md.push("| Product | qty | unit_price | total | total÷qty | equal? | qty×unit |");
md.push("|---------|-----|------------|-------|----------|--------|---------|");
for (const row of results.task4_deliFamilyUnitPriceVsEffective) {
  md.push(
    `| ${row.product} | ${row.quantity} | ${row.unit_price} | ${row.line_total} | ${row.line_total_div_qty?.toFixed(4)} | ${row.unit_price_eq_line_total_div_qty} | ${row.qty_times_unit_price?.toFixed(4)} |`,
  );
}
md.push("");

md.push("## Task 5 — Discount handling (bindMonetaryColumns)");
md.push("");
md.push(`**Rule:** ${results.task5_discountHandling.rules.applyEffectivePaidPrice}`);
md.push("");
md.push("| Scenario | bound unit_price | bound total | effective paid | uses effective? |");
md.push("|----------|------------------|-------------|----------------|---------------|");
for (const s of discountScenarios) {
  md.push(
    `| ${s.scenario} | ${s.bound.unit_price} | ${s.bound.total} | ${s.effectivePaidPerKg?.toFixed(4)} | ${s.bindingUsesEffectivePaid} |`,
  );
}
md.push("");

md.push("## Task 6 — Gorgonzola recipe costing vs effective paid");
md.push("");
if (gorg?.recipeCosting) {
  const rc = gorg.recipeCosting;
  md.push("| Quantity | Recipe cost (€) | Basis €/kg | Effective paid €/kg | Variance |");
  md.push("|----------|-----------------|------------|---------------------|----------|");
  md.push(`| 100 g | ${rc.cost100g?.toFixed(4)} | ${rc.recipeEurPerKg?.toFixed(2)} | ${rc.effectivePaidEurPerKg?.toFixed(2)} | ${rc.varianceEurPerKg?.toFixed(2)} €/kg (${rc.variancePct?.toFixed(1)}%) |`);
  md.push(`| 250 g | ${rc.cost250g?.toFixed(4)} | | | |`);
  md.push(`| 500 g | ${rc.cost500g?.toFixed(4)} | | | |`);
  md.push(`| 1000 g | ${rc.cost1000g?.toFixed(4)} | | | |`);
  md.push("");
  md.push("Recipe costing uses `current_price` (10.88) ÷ `purchase_quantity` (1000g) = **€10.88/kg**, not effective paid **€12.80/kg**.");
}
md.push("");

md.push("## Task 7 — Historical pricing & alerts");
md.push("");
for (const row of results.task7_historicalPricing) {
  md.push(`### ${row.product}`);
  md.push("");
  if (row.historyRows.length) {
    md.push("| created_at | new_price €/g | €/kg | matches unit_price basis? | matches effective paid? |");
    md.push("|------------|---------------|------|---------------------------|-------------------------|");
    for (const h of row.historyRows) {
      md.push(
        `| ${h.created_at} | ${h.new_price_eur_per_g} | €${h.new_price_eur_per_kg.toFixed(2)} | ${h.matchesUnitPriceBasis} | ${h.matchesEffectivePaidBasis} |`,
      );
    }
  } else {
    md.push("No history rows.");
  }
  md.push("");
}
md.push(`${results.task7_historicalPricing[0]?.alertsNote ?? ""}`);
md.push("");

md.push("## Final verdict");
md.push("");
md.push(`**${finalVerdict})** ${results.finalVerdict.options[finalVerdict]}`);
md.push("");
md.push(results.finalVerdict.rationale);
md.push("");
md.push("### For Gorgonzola: is €10.88/kg intended or should €12.80/kg?");
md.push("");
md.push(`- **Displayed (intended by code):** ${gorgonzolaAnswer.intendedByCode}`);
md.push(`- **Economically paid:** ${gorgonzolaAnswer.economicallyPaid}`);
md.push(`- **PDF gross-discount binding would yield:** ${gorgonzolaAnswer.pdfBindingWouldBe}`);
md.push(`- **Conclusion:** ${gorgonzolaAnswer.conclusion}`);

writeFileSync(`${OUT}/REPORT.md`, md.join("\n"));
console.log(`Wrote ${OUT}/REPORT.md and results.json — verdict ${finalVerdict}`);
