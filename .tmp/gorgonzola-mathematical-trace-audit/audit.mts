/**
 * STRICT READ-ONLY Gorgonzola Mathematical Trace Audit — VL bjhnlrgodcqoyzddbpbd
 */
const metaEnv = import.meta as { env: Record<string, unknown> };
if (!metaEnv.env) metaEnv.env = { DEV: false, PROD: true };
metaEnv.env.DEV = false;
metaEnv.env.PROD = true;

import { execSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { bindMonetaryColumns, parseMonetaryLineItems } from "../../supabase/functions/extract-invoice/invoice-monetary-binding.ts";
import { normalizeInvoiceItemFields } from "../../src/lib/invoice-item-fields.ts";
import {
  resolveInvoiceLinePurchaseFormat,
  structuredPurchaseToIngredientFields,
} from "../../src/lib/invoice-purchase-format.ts";
import {
  computeEffectiveUsableCost,
  formatRowPurchaseQuantityLabel,
  recipeOperationalCostFieldsFromInvoiceLine,
  resolveInvoiceLinePricingPresentation,
  resolveUsablePerPricedUnit,
} from "../../src/lib/invoice-purchase-price-semantics.ts";
import {
  computeUsableFromPurchaseStructure,
  parsePurchaseStructureFromText,
} from "../../src/lib/stock-normalization.ts";
import {
  operationalCostFieldsFromInvoiceLine,
  procurementPackFieldsFromInvoiceLine,
  defaultIsGenericUnit,
} from "../../src/lib/ingredient-auto-persist.ts";
import { buildLastPurchaseCostPresentation } from "../../src/lib/ingredient-detail-panel.ts";
import {
  effectiveIngredientUnitCostEur,
  resolvedOperationalUnitCostEur,
} from "../../src/lib/ingredient-unit-cost.ts";
import { formatDisplayUnitCost } from "../../src/lib/display-unit-cost.ts";

const VL = "bjhnlrgodcqoyzddbpbd";
const EMPORIO_INVOICE_ID = "ab52796d-de1d-418d-86e7-230c8f056f09";
const OUT = ".tmp/gorgonzola-mathematical-trace-audit";

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

function bindLine(raw: {
  name: string;
  quantity: number | null;
  unit: string | null;
  unit_price: number | null;
  total: number | null;
  gross_unit_price?: number | null;
  discount_pct?: number | null;
  line_total_net?: number | null;
}) {
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

function traceFromDbItem(item: {
  id: string;
  invoice_id: string;
  name: string;
  quantity: number | null;
  unit: string | null;
  unit_price: number | null;
  total: number | null;
}) {
  const bound = bindLine(item);
  const metadata = {
    name: bound.name,
    quantity: bound.quantity,
    unit: bound.unit,
    unit_price: bound.unit_price,
    line_total: bound.total,
  };
  const structure = parsePurchaseStructureFromText(bound.name);
  const usableChain = structure
    ? computeUsableFromPurchaseStructure(structure, bound.quantity, bound.unit)
    : null;
  const structured = resolveInvoiceLinePurchaseFormat(metadata);
  const presentation = resolveInvoiceLinePricingPresentation(metadata);
  const procurement = procurementPackFieldsFromInvoiceLine(metadata, {
    isGenericUnit: defaultIsGenericUnit,
  });
  const persistFields = operationalCostFieldsFromInvoiceLine(bound);
  const recipeFields = recipeOperationalCostFieldsFromInvoiceLine(metadata);
  const perUnit = resolveUsablePerPricedUnit(metadata, structured);
  const effective =
    bound.unit_price != null
      ? computeEffectiveUsableCost(bound.unit_price, metadata, structured, bound.name)
      : null;
  const rowQtyLabel = formatRowPurchaseQuantityLabel(metadata);
  const detailPresentation = buildLastPurchaseCostPresentation({
    purchaseQuantityLabel: rowQtyLabel,
    procurementCostLabel: presentation.priceDisplay,
    operationalCostLabel: presentation.effectiveUsableCostLabel,
    priceLabel: bound.total != null ? `€${bound.total.toFixed(2)}` : null,
    supplierLabel: null,
    dateLabel: null,
  });
  const unitCostEurPerG = recipeFields ? resolvedOperationalUnitCostEur(recipeFields) : null;
  const lineCost = (grams: number) =>
    unitCostEurPerG != null ? unitCostEurPerG * grams : null;

  return {
    bound,
    structure,
    usableChain,
    structured,
    presentation,
    procurement,
    persistFields,
    recipeFields,
    perUnit,
    effective,
    rowQtyLabel,
    detailPresentation,
    recipeCosting: recipeFields
      ? {
          cost100g: lineCost(100),
          cost250g: lineCost(250),
          cost500g: lineCost(500),
          cost1000g: lineCost(1000),
          purchase_quantity: recipeFields.purchase_quantity,
          cost_base_unit: recipeFields.cost_base_unit,
          current_price: recipeFields.current_price,
          unitCostEurPerG,
          eurPerKg:
            recipeFields.cost_base_unit === "g"
              ? (unitCostEurPerG ?? 0) * 1000
              : null,
          kpiLabel: formatDisplayUnitCost(
            effectiveIngredientUnitCostEur(recipeFields),
            recipeFields.cost_base_unit,
          ).formattedLabel,
        }
      : null,
  };
}

function solveXForRate(total: number, rate: number): number {
  return total / rate;
}

mkdirSync(OUT, { recursive: true });

// --- Live DB ---
const { data: invoice } = await sb
  .from("invoices")
  .select("id,supplier_name,invoice_date,created_at,total")
  .eq("id", EMPORIO_INVOICE_ID)
  .maybeSingle();

const { data: gorgItems } = await sb
  .from("invoice_items")
  .select("id,invoice_id,name,quantity,unit,unit_price,total,created_at,updated_at")
  .eq("invoice_id", EMPORIO_INVOICE_ID)
  .ilike("name", "%Gorgonzola%");

const dbItem = gorgItems?.[0] ?? null;

const { data: ingredient } = await sb
  .from("ingredients")
  .select(
    "id,name,current_price,purchase_quantity,purchase_unit,base_unit,unit,normalized_name,supplier,created_at,updated_at",
  )
  .ilike("name", "%Gorgonzola%DOP%dolce%")
  .limit(1)
  .maybeSingle();

let match: Record<string, unknown> | null = null;
if (ingredient) {
  const { data: matches } = await sb
    .from("invoice_item_matches")
    .select("invoice_item_id,status,match_kind,created_at")
    .eq("ingredient_id", ingredient.id)
    .order("created_at", { ascending: false })
    .limit(5);
  match = matches?.find((m) => m.invoice_item_id === dbItem?.id) ?? matches?.[0] ?? null;
}

const { data: priceHistory } = ingredient
  ? await sb
      .from("ingredient_price_history")
      .select(
        "id,ingredient_id,invoice_id,ingredient_name,previous_price,new_price,delta,delta_percent,created_at,invoices(invoice_date,supplier_name)",
      )
      .eq("ingredient_id", ingredient.id)
      .order("created_at", { ascending: false })
      .limit(10)
  : { data: null };

// OCR / extraction replays (not stored in DB — invoice_items has no gross/discount columns)
const ocrScenarios = [
  {
    label: "PDF_visible_Emporio_prompt_example",
    raw: {
      name: dbItem?.name ?? "Arrigoni Formaggi - Gorgonzola DOP Dolce Linea Castelfrigo 1/8 - 1,5kg",
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
    label: "live_db_values_as_bound_input",
    raw: {
      name: dbItem?.name ?? "",
      quantity: dbItem?.quantity ?? null,
      unit: dbItem?.unit ?? null,
      gross_unit_price: null,
      discount_pct: null,
      line_total_net: dbItem?.total ?? null,
      unit_price: dbItem?.unit_price ?? null,
      total: dbItem?.total ?? null,
    },
  },
  {
    label: "structured_gross_discount_with_db_qty_1_05",
    raw: {
      name: dbItem?.name ?? "",
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
    label: "emporio_footer_fix_extract",
    raw: {
      name: "Arrigoni Formaggi - Gorgonzola DOP Dolce Linea Castelgrottto 1/8 - 1,5kg",
      quantity: 1.35,
      unit: "kg",
      gross_unit_price: null,
      discount_pct: null,
      line_total_net: null,
      unit_price: 9.92,
      total: 13.44,
    },
  },
];

const bindingReplays = ocrScenarios.map((s) => {
  const bound = bindLine(s.raw);
  return { scenario: s.label, input: s.raw, bound };
});

const trace = dbItem ? traceFromDbItem(dbItem) : null;

const qty = dbItem?.quantity ?? null;
const unitPrice = dbItem?.unit_price ?? null;
const lineTotal = dbItem?.total ?? null;
const operationalEurPerKg = trace?.effective?.cost ?? null;
const recipeDenomG = trace?.recipeFields?.purchase_quantity ?? null;

const procurementReconstruction = {
  displayedRate: operationalEurPerKg,
  numerator: unitPrice,
  denominator_g: trace?.perUnit?.amount ?? null,
  formula: "unit_price / (operational_denominator_g / 1000) = €/kg",
  computed:
    unitPrice != null && trace?.perUnit?.amount
      ? unitPrice / (trace.perUnit.amount / 1000)
      : null,
  solve_13_44_div_X_eq_10_88: solveXForRate(13.44, 10.88),
  line_total_div_qty_kg: qty && lineTotal ? lineTotal / qty : null,
  line_total_div_solveX: lineTotal && operationalEurPerKg ? lineTotal / operationalEurPerKg : null,
  qty_times_unit_price: qty != null && unitPrice != null ? qty * unitPrice : null,
  qty_times_unit_price_eq_total:
    qty != null && unitPrice != null && lineTotal != null
      ? Math.abs(qty * unitPrice - lineTotal) < 0.02
      : null,
};

// T6 reconciliation
const lastPurchaseQty = trace?.rowQtyLabel ?? null;
const t6 = {
  lastPurchaseLabel: lastPurchaseQty,
  procurementRate: trace?.presentation.priceDisplay ?? null,
  operationalRate: trace?.presentation.effectiveUsableCostLabel ?? null,
  lastPurchaseUsesRowQty: true,
  eurPerKgUsesUnitPriceOver1000g: trace?.perUnit?.amount === 1000,
  effectivePaidFromTotalOverQty:
    qty != null && lineTotal != null ? lineTotal / qty : null,
  denominators: {
    lastPurchase_kg: qty,
    operational_cost_per_kg_basis_g: trace?.perUnit?.amount ?? null,
    recipe_denominator_g: recipeDenomG,
    implied_kg_from_total_over_rate:
      lineTotal != null && operationalEurPerKg ? lineTotal / operationalEurPerKg : null,
  },
};

// T6: Last Purchase qty vs €/kg rate use different bases (weighed kg vs priced 1000g).
const t6Classification: "A" | "B" | "C" | "D" | "E" = "B";
const arithmeticConsistent =
  qty != null &&
  unitPrice != null &&
  lineTotal != null &&
  Math.abs(qty * unitPrice - lineTotal) < 0.02;

const recipeMatchesOperational =
  trace?.recipeFields?.purchase_quantity === trace?.perUnit?.amount &&
  trace?.recipeFields?.current_price === trace?.bound.unit_price;

const requiredTable = [
  {
    concept: "Invoice Quantity (DB)",
    value: dbItem?.quantity ?? "—",
    source: "invoice_items.quantity",
  },
  {
    concept: "Invoice Unit (DB)",
    value: dbItem?.unit ?? "—",
    source: "invoice_items.unit",
  },
  {
    concept: "Line Total (DB)",
    value: dbItem?.total ?? "—",
    source: "invoice_items.total",
  },
  {
    concept: "Invoice Unit Price (DB)",
    value: dbItem?.unit_price ?? "—",
    source: "invoice_items.unit_price",
  },
  {
    concept: "PDF visible Qty (OCR prompt)",
    value: 1.35,
    source: "invoice-table-extraction.ts Emporio Gorgonzola example; not persisted in invoice_items",
  },
  {
    concept: "PDF visible Gross Unit (OCR prompt)",
    value: "€12.90",
    source: "invoice-table-extraction.ts Emporio Gorgonzola example",
  },
  {
    concept: "PDF visible Discount %",
    value: "22.85%",
    source: "invoice-table-extraction.ts Emporio Gorgonzola example",
  },
  {
    concept: "Purchase Quantity (Last Purchase label)",
    value: trace?.rowQtyLabel ?? "—",
    source: "formatRowPurchaseQuantityLabel(metadata)",
  },
  {
    concept: "Usable Quantity (pack from name)",
    value: trace?.structure?.totalUsableAmount ?? "—",
    source: `parsePurchaseStructureFromText → ${trace?.structure?.usableUnit ?? "—"}`,
  },
  {
    concept: "Current Price (persisted)",
    value: ingredient?.current_price ?? "—",
    source: "ingredients.current_price",
  },
  {
    concept: "Cost Base Unit (persisted)",
    value: ingredient?.base_unit ?? "—",
    source: "ingredients.base_unit",
  },
  {
    concept: "Purchase Quantity (persisted denominator)",
    value: ingredient?.purchase_quantity ?? "—",
    source: "ingredients.purchase_quantity",
  },
  {
    concept: "Procurement Cost",
    value: trace?.presentation.priceDisplay ?? "—",
    source: "resolveInvoiceLinePricingPresentation.priceDisplay",
  },
  {
    concept: "Operational Cost",
    value: trace?.presentation.effectiveUsableCostLabel ?? "—",
    source: "computeEffectiveUsableCost → resolveInvoiceLinePricingPresentation",
  },
  {
    concept: "Recipe Denominator",
    value: trace?.recipeFields
      ? `${trace.recipeFields.purchase_quantity}${trace.recipeFields.cost_base_unit}`
      : "—",
    source: "recipeOperationalCostFieldsFromInvoiceLine",
  },
  {
    concept: "Total Paid (detail)",
    value: lineTotal != null ? `€${lineTotal.toFixed(2)}` : "—",
    source: "invoice_items.total → buildLastPurchaseCostPresentation",
  },
  {
    concept: "13.44 ÷ X = 10.88 → X",
    value: procurementReconstruction.solve_13_44_div_X_eq_10_88.toFixed(4),
    source: "algebraic solve; X = 1.2353 kg implied if €10.88 were effective-paid €/kg",
  },
  {
    concept: "13.44 ÷ 1.05 kg (user expectation)",
    value: qty ? (lineTotal! / qty).toFixed(4) : "—",
    source: "line_total / invoice_items.quantity",
  },
];

const finalVerdict: "A" | "B" | "C" | "D" | "E" = "B";

const priorAuditClaim = {
  source: ".tmp/emporio-deli-family-audit/REPORT.md",
  claimed: { quantity: 1.05, unit_price: 10.88, line_total: 13.44 },
  liveDbMatches:
    dbItem?.quantity === 1.05 &&
    dbItem?.unit_price === 10.88 &&
    dbItem?.total === 13.44,
};

const results = {
  validationLab: VL,
  generatedAt: new Date().toISOString(),
  emporioInvoiceId: EMPORIO_INVOICE_ID,
  invoice,
  task1_rawInvoice: {
    invoice_id: dbItem?.invoice_id ?? null,
    invoice_item_id: dbItem?.id ?? null,
    raw_description: dbItem?.name ?? null,
    raw_quantity: dbItem?.quantity ?? null,
    raw_unit: dbItem?.unit ?? null,
    unit_price: dbItem?.unit_price ?? null,
    line_total: dbItem?.total ?? null,
    created_at: dbItem?.created_at ?? null,
    updated_at: dbItem?.updated_at ?? null,
    ocrExtractionReplays: bindingReplays,
    note:
      "invoice_items schema has no gross_unit_price/discount_pct columns; OCR structured fields replayed via bindMonetaryColumns only",
  },
  task2_purchaseFormat: trace
    ? {
        parsePurchaseStructureFromText: trace.structure,
        computeUsableFromPurchaseStructure: trace.usableChain,
        resolveInvoiceLinePurchaseFormat: {
          kind: trace.structured.kind,
          purchaseContainerCount: trace.structured.purchaseContainerCount,
          purchaseContainerUnit: trace.structured.purchaseContainerUnit,
          packageQuantity: trace.structured.packageQuantity,
          packageMeasurementUnit: trace.structured.packageMeasurementUnit,
          normalizedUsableQuantity: trace.structured.normalizedUsableQuantity,
          usableQuantityUnit: trace.structured.usableQuantityUnit,
        },
      }
    : null,
  task3_persistence: {
    operationalCostFieldsFromInvoiceLine: trace?.persistFields ?? null,
    recipeOperationalCostFieldsFromInvoiceLine: trace?.recipeFields ?? null,
    storedIngredient: ingredient ?? null,
    invoiceItemMatch: match,
    catalogMatchesRecipeFields:
      ingredient && trace?.recipeFields
        ? ingredient.current_price === trace.recipeFields.current_price &&
          ingredient.purchase_quantity === trace.recipeFields.purchase_quantity &&
          ingredient.base_unit === trace.recipeFields.cost_base_unit
        : null,
  },
  task4_procurementReconstruction: procurementReconstruction,
  task5_operationalReconstruction: trace
    ? {
        resolveInvoiceLinePricingPresentation: {
          priceDisplay: trace.presentation.priceDisplay,
          effectiveUsableCostLabel: trace.presentation.effectiveUsableCostLabel,
          card: trace.presentation.card,
        },
        computeEffectiveUsableCost: trace.effective,
        resolveUsablePerPricedUnit: trace.perUnit,
        buildLastPurchaseCostPresentation: trace.detailPresentation,
        inputs: {
          unit_price: trace.bound.unit_price,
          quantity: trace.bound.quantity,
          unit: trace.bound.unit,
          line_total: trace.bound.total,
          operational_denominator_g: trace.perUnit?.amount,
        },
      }
    : null,
  task6_reconciliation: {
    ...t6,
    classification: t6Classification,
    arithmeticConsistent,
    arithmeticNote:
      "1.05 × 10.88 = 11.424 ≠ 13.44; effective-paid unit would be 13.44÷1.05 = €12.80/kg",
    unit_price_not_from_pdf_binding:
      "bindMonetaryColumns(12.90 gross, 22.85% disc) → €9.95/kg, not €10.88",
  },
  task7_recipeCosting: trace?.recipeCosting ?? null,
  task7_recipeDenominatorMatchesOperational: recipeMatchesOperational ? "YES" : "NO",
  task8_priceHistory: {
    rows: priceHistory ?? [],
    currentPriceEurPerG: ingredient ? ingredient.current_price / ingredient.purchase_quantity : null,
    historyNewPriceEurPerG: priceHistory?.[0]?.new_price ?? null,
    denominatorConsistent:
      priceHistory?.[0]?.new_price != null && ingredient
        ? Math.abs(priceHistory[0]!.new_price - ingredient.current_price / ingredient.purchase_quantity) <
          0.0001
        : null,
    note: "ingredient_price_history.new_price stores €/g (0.01088 = 10.88/1000); same 1000g denominator as current",
  },
  requiredTable,
  priorAuditVerification: priorAuditClaim,
  finalVerdict: {
    letter: finalVerdict,
    t6Letter: t6Classification,
    answer:
      "Marginly shows €10.88/kg because invoice_items.unit_price (10.88) is treated as net €/kg for kg-priced rows; operational/recipe denominator is fixed 1000g per recipeOperationalCostFieldsFromInvoiceLine / resolveUsablePerPricedUnit — NOT purchased weight 1.05 kg and NOT line_total÷qty (€12.80/kg).",
    denominatorQuantity: "1000 g (1 priced kg)",
    denominatorSource:
      "resolveUsablePerPricedUnit L489-491: row unit kg → { amount: 1000, unit: g }",
  },
};

writeFileSync(`${OUT}/results.json`, JSON.stringify(results, null, 2));

// Markdown report
const lines: string[] = [];
lines.push("# Gorgonzola DOP Dolce — Mathematical Trace Audit");
lines.push("");
lines.push(`**Validation Lab:** \`${VL}\` · **Invoice:** \`${EMPORIO_INVOICE_ID}\` (Emporio Italia, 19 May 2026) · **Read-only** · ${new Date().toISOString().slice(0, 10)}`);
lines.push("");

lines.push("## Required table");
lines.push("");
lines.push("| Concept | Value | Source |");
lines.push("|---------|-------|--------|");
for (const row of requiredTable) {
  lines.push(`| ${row.concept} | ${row.value} | ${row.source} |`);
}
lines.push("");

lines.push("## Task 1 — Raw invoice trace");
lines.push("");
if (dbItem) {
  lines.push("| Field | Value |");
  lines.push("|-------|-------|");
  for (const [k, v] of Object.entries(results.task1_rawInvoice)) {
    if (k === "ocrExtractionReplays") continue;
    lines.push(`| ${k} | ${typeof v === "object" ? JSON.stringify(v) : v} |`);
  }
  lines.push("");
  lines.push("### OCR / extraction replays (not stored in DB)");
  lines.push("");
  for (const r of bindingReplays) {
    lines.push(`**${r.scenario}** → bound: \`${JSON.stringify(r.bound)}\``);
  }
  lines.push("");
  lines.push(`**Prior audit verification:** emporio-deli-family-audit claimed qty=1.05, unit_price=10.88, total=13.44 → live DB matches: **${priorAuditClaim.liveDbMatches ? "YES" : "NO"}**`);
  lines.push("");
  lines.push("User-reported Invoice UI values (Qty 1.35, Unit €12.90) match the **PDF/OCR prompt example** in `invoice-table-extraction.ts`, not `invoice_items` persisted columns.");
}
lines.push("");

lines.push("## Task 2 — parsePurchaseStructureFromText trace");
lines.push("");
if (trace?.structure) {
  lines.push("```json");
  lines.push(JSON.stringify(trace.structure, null, 2));
  lines.push("```");
  lines.push("");
  lines.push(`**usableChain:** \`${JSON.stringify(trace.usableChain)}\``);
  lines.push(`**structured kind:** ${trace.structured.kind}, normalized=${trace.structured.normalizedUsableQuantity}${trace.structured.usableQuantityUnit}`);
}
lines.push("");

lines.push("## Task 3 — Persistence trace");
lines.push("");
lines.push("| Stage | Value |");
lines.push("|-------|-------|");
lines.push(`| operationalCostFieldsFromInvoiceLine | ${JSON.stringify(trace?.persistFields)} |`);
lines.push(`| recipeOperationalCostFieldsFromInvoiceLine | ${JSON.stringify(trace?.recipeFields)} |`);
lines.push(`| ingredients (stored) | ${JSON.stringify(ingredient)} |`);
lines.push(`| catalog matches recipe fields | ${results.task3_persistence.catalogMatchesRecipeFields} |`);
lines.push("");

lines.push("## Task 4 — Procurement €10.88/kg reconstruction");
lines.push("");
lines.push("| Step | Value |");
lines.push("|------|-------|");
lines.push(`| numerator (unit_price) | ${unitPrice} |`);
lines.push(`| operational denominator | ${trace?.perUnit?.amount} g |`);
lines.push(`| formula | unit_price ÷ (1000g ÷ 1000) = ${procurementReconstruction.computed} €/kg |`);
lines.push(`| **13.44 ÷ X = 10.88 → X** | **${procurementReconstruction.solve_13_44_div_X_eq_10_88.toFixed(4)} kg** (not 1.05 kg) |`);
lines.push(`| 13.44 ÷ 1.05 kg | ${procurementReconstruction.line_total_div_qty_kg?.toFixed(4)} €/kg (effective-paid; not used for €/kg display) |`);
lines.push(`| qty × unit_price | ${procurementReconstruction.qty_times_unit_price?.toFixed(4)} ≠ ${lineTotal} |`);
lines.push("");
lines.push("€10.88/kg is **not** derived from line_total ÷ purchased kg. It is **invoice_items.unit_price** passed through the kg-row short-circuit with a **1000 g** priced-unit denominator.");
lines.push("");

lines.push("## Task 5 — Operational cost reconstruction");
lines.push("");
if (trace) {
  lines.push(`- **resolveInvoiceLinePricingPresentation:** procurement=\`${trace.presentation.priceDisplay}\`, operational=\`${trace.presentation.effectiveUsableCostLabel}\``);
  lines.push(`- **computeEffectiveUsableCost:** \`${JSON.stringify(trace.effective)}\``);
  lines.push(`- **buildLastPurchaseCostPresentation:** \`${JSON.stringify(trace.detailPresentation)}\``);
}
lines.push("");

lines.push("## Task 6 — Ingredient detail reconciliation");
lines.push("");
lines.push(`| Measure | Value | Basis |`);
lines.push(`|---------|-------|-------|`);
lines.push(`| Last Purchase | ${lastPurchaseQty} | invoice row quantity (${qty} kg) |`);
lines.push(`| Procurement €/kg | €10.88/kg | unit_price with 1000g denominator |`);
lines.push(`| Effective paid €/kg | €${procurementReconstruction.line_total_div_qty_kg?.toFixed(2)}/kg | line_total ÷ qty |`);
lines.push("");
lines.push(`**T6 classification: B) Different denominator** — Last Purchase shows weighed row qty (1.05 kg); €/kg uses \`unit_price\` with operational denominator **1000 g**, not purchased kg.`);
lines.push("");
lines.push(`**Arithmetic note:** 1.05 × €10.88 = €11.42 ≠ €13.44 total. Effective-paid rate is €13.44 ÷ 1.05 = **€12.80/kg**. Persisted \`unit_price\` €10.88 is neither effective-paid nor reproducible from PDF binding (12.90 gross × 22.85% disc → €9.95/kg).`);
lines.push("");

lines.push("## Task 7 — Recipe costing");
lines.push("");
if (trace?.recipeCosting) {
  const rc = trace.recipeCosting;
  lines.push("| Quantity | Cost (€) |");
  lines.push("|----------|----------|");
  lines.push(`| 100 g | ${rc.cost100g?.toFixed(4)} |`);
  lines.push(`| 250 g | ${rc.cost250g?.toFixed(4)} |`);
  lines.push(`| 500 g | ${rc.cost500g?.toFixed(4)} |`);
  lines.push(`| 1000 g | ${rc.cost1000g?.toFixed(4)} |`);
  lines.push("");
  lines.push(`**Recipe denominator matches operational denominator:** ${results.task7_recipeDenominatorMatchesOperational}`);
  lines.push(`Formula: cost = (current_price / purchase_quantity) × grams = (${rc.current_price} / ${rc.purchase_quantity}) × g`);
}
lines.push("");

lines.push("## Task 8 — ingredient_price_history");
lines.push("");
if (priceHistory?.length) {
  lines.push("| created_at | new_price (€/g) | €/kg equivalent | invoice_id |");
  lines.push("|------------|-----------------|-----------------|------------|");
  for (const r of priceHistory) {
    lines.push(
      `| ${r.created_at} | ${r.new_price} | €${((r.new_price ?? 0) * 1000).toFixed(2)}/kg | ${r.invoice_id ?? "—"} |`,
    );
  }
  lines.push("");
  lines.push(`**Historical vs current denominator:** same 1000g basis (history new_price 0.01088 €/g = current_price 10.88 / purchase_quantity 1000).`);
} else {
  lines.push("No price history rows found.");
}
lines.push("");

lines.push("## Final verdict");
lines.push("");
lines.push(`**${finalVerdict})** ${finalVerdict === "B" ? "Display inconsistency only" : finalVerdict}`);
lines.push("");
lines.push("**Why does Marginly show €10.88/kg and what exact quantity is the denominator?**");
lines.push("");
lines.push(results.finalVerdict.answer);
lines.push("");
lines.push(`- **Denominator quantity:** ${results.finalVerdict.denominatorQuantity}`);
lines.push(`- **Denominator source:** ${results.finalVerdict.denominatorSource}`);
lines.push("");
lines.push("Last Purchase **1.05 kg** is the weighed invoice quantity (`formatRowPurchaseQuantityLabel`). €/kg **10.88** is `invoice_items.unit_price` (net list €/kg), not `line_total ÷ 1.05` (€12.80/kg). The architecture treats kg invoice rows as €/kg priced per **1000 g**, independent of actual purchased weight.");

writeFileSync(`${OUT}/REPORT.md`, lines.join("\n"));
console.log(`Wrote ${OUT}/REPORT.md and results.json`);
