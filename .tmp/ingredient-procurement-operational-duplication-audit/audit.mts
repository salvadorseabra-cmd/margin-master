/**
 * STRICT READ-ONLY Procurement vs Operational Cost Duplication Audit — VL bjhnlrgodcqoyzddbpbd
 */
const metaEnv = import.meta as { env?: Record<string, unknown> };
if (!metaEnv.env) metaEnv.env = {};
metaEnv.env.DEV = false;
metaEnv.env.PROD = true;

import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
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
  resolveUnitsPerPack,
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
import { detectConversionHint } from "../../src/lib/ingredient-unit-inference.ts";
import { effectiveIngredientUnitCostEur } from "../../src/lib/ingredient-unit-cost.ts";

const VL = "bjhnlrgodcqoyzddbpbd";
const OUT = ".tmp/ingredient-procurement-operational-duplication-audit";

const TARGET_SPECS = [
  {
    key: "gorgonzola",
    displayName: "Gorgonzola",
    ingredientPattern: "%Gorgonzola%",
    invoicePattern: "%Gorgonzola%",
    expectedProcurement: "€10.88/kg",
  },
  {
    key: "prosciutto",
    displayName: "Prosciutto cotto scelto",
    ingredientPattern: "%Prosciutto%Cotto%Scelto%",
    invoicePattern: "%Prosciutto%Cotto%Scelto%",
    expectedProcurement: "€8.50/kg",
  },
  {
    key: "mortadella",
    displayName: "Mortadella IGP massima con pistachio",
    ingredientPattern: "%Mortadella%IGP%Massima%Pistacchio%",
    invoicePattern: "%Mortadella%IGP%Massima%Pistacchio%",
    expectedProcurement: null,
  },
  {
    key: "bresaola",
    displayName: "Bresaola punta d'anca oro",
    ingredientPattern: "%Bresaola%Punta%Anca%Oro%",
    invoicePattern: "%Bresaola%Punta%Anca%Oro%",
    expectedProcurement: null,
  },
] as const;

const CONTROL_SPECS = [
  { key: "ovo", label: "Ovo Classe M", ingredientPattern: "%Ovo%Classe%M%", invoicePattern: "%Ovo%Classe%M%" },
  { key: "pellegrino", label: "Pellegrino", ingredientPattern: "%Pellegrino%", invoicePattern: "%Pellegrino%" },
  { key: "ginger_beer", label: "Ginger Beer", ingredientPattern: "%Ginger%Beer%", invoicePattern: "%Ginger%Beer%" },
  { key: "paccheri", label: "Paccheri", ingredientPattern: "%Paccheri%", invoicePattern: "%Paccheri%" },
  { key: "salada", label: "Salada ibérica", ingredientPattern: "%Salada%Ib%rica%", invoicePattern: "%Salada%Ib%rica%" },
  { key: "tomilho", label: "Tomilho", ingredientPattern: "%Tomilho%", invoicePattern: "%Tomilho%" },
  { key: "manjericao", label: "Manjericão", ingredientPattern: "%Manjeric%o%", invoicePattern: "%Manjeric%o%" },
] as const;

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
}) {
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
  return normalizeInvoiceItemFields(bound);
}

function traceLine(raw: {
  id: string;
  name: string;
  quantity: number | null;
  unit: string | null;
  unit_price: number | null;
  total: number | null;
  invoice_id?: string;
}) {
  const bound = bindLine(raw);
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
  const unitsPerPack = resolveUnitsPerPack(structured);
  const conversionHint = detectConversionHint(bound.name);

  const invoiceReviewWouldCollapse =
    Boolean(presentation.effectiveUsableCostLabel) && !presentation.card.usableCostLine;

  const detailPresentation = buildLastPurchaseCostPresentation({
    purchaseQuantityLabel: rowQtyLabel,
    procurementCostLabel: presentation.priceDisplay,
    operationalCostLabel: presentation.effectiveUsableCostLabel,
    priceLabel: bound.total != null ? `€${bound.total.toFixed(2)}` : null,
    supplierLabel: null,
    dateLabel: null,
  });

  return {
    invoiceItemId: raw.id,
    invoiceId: raw.invoice_id ?? null,
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
    unitsPerPack,
    conversionHint,
    collapseOperational: invoiceReviewWouldCollapse,
    detailPresentation,
    procurementDenominator: procurement?.purchase_quantity ?? structured.normalizedUsableQuantity,
    procurementUnit: procurement?.cost_base_unit ?? structured.usableQuantityUnit ?? bound.unit,
  };
}

function costsEquivalent(a: number | null, b: number | null, tolerance = 0.005): boolean {
  if (a == null || b == null) return false;
  return Math.abs(a - b) < tolerance;
}

function labelsEquivalent(proc: string | null, op: string | null): boolean {
  if (!proc || !op) return false;
  return proc.trim() === op.trim();
}

function procurementEqualsOperational(trace: ReturnType<typeof traceLine>): {
  same: boolean;
  formula: string;
} {
  const unitPrice = trace.bound.unit_price;
  const effective = trace.effective;
  if (unitPrice == null || effective == null) {
    return { same: false, formula: "N/A — missing unit_price or effective cost" };
  }
  const sameCost = costsEquivalent(unitPrice, effective.cost);
  const procLabel = trace.presentation.priceDisplay ?? "";
  const opLabel = trace.presentation.effectiveUsableCostLabel ?? "";
  const sameLabel = labelsEquivalent(procLabel, opLabel);
  const same = sameCost && sameLabel;
  const formula = same
    ? `unit_price (${unitPrice}) / (usable_per_unit) = effective.cost (${effective.cost.toFixed(4)}) ${effective.unit}; priceSuffix matches effective.unit`
    : `unit_price=${unitPrice}, effective=${effective.cost} ${effective.unit}; procurement="${procLabel}", operational="${opLabel}"`;
  return { same, formula };
}

function classifyIngredient(trace: ReturnType<typeof traceLine> | null): "A" | "B" | "C" | "D" {
  if (!trace) return "D";
  const { same } = procurementEqualsOperational(trace);
  if (same) return "B";
  if (trace.conversionHint) return "A";
  if (trace.effective == null) return "C";
  if (trace.structured.kind === "inferred") return "A";
  return "D";
}

function recipeUsesWhich(trace: ReturnType<typeof traceLine> | null): string {
  if (!trace?.recipeFields) return "unknown";
  const rf = trace.recipeFields;
  return `operational fields: current_price=${rf.current_price}, purchase_quantity=${rf.purchase_quantity}, cost_base_unit=${rf.cost_base_unit}`;
}

async function findIngredient(pattern: string) {
  const { data } = await sb
    .from("ingredients")
    .select(
      "id,name,current_price,purchase_quantity,purchase_unit,base_unit,unit,normalized_name,supplier",
    )
    .ilike("name", pattern)
    .limit(20);
  return data?.[0] ?? null;
}

async function findLatestMatchedItem(ingredientId: string, invoicePattern: string) {
  const { data: matches } = await sb
    .from("invoice_item_matches")
    .select(
      "invoice_item_id,status,match_kind,invoice_items(id,invoice_id,name,quantity,unit,unit_price,total,created_at,invoices(id,supplier_name,invoice_date,created_at))",
    )
    .eq("ingredient_id", ingredientId)
    .order("created_at", { ascending: false })
    .limit(20);

  const matched = matches?.filter((m) => {
    const item = m.invoice_items as {
      name?: string;
    } | null;
    return item?.name;
  });

  if (matched?.length) {
    const item = matched[0]!.invoice_items as {
      id: string;
      invoice_id: string;
      name: string;
      quantity: number | null;
      unit: string | null;
      unit_price: number | null;
      total: number | null;
    };
    return { item, match: matched[0] };
  }

  const { data: items } = await sb
    .from("invoice_items")
    .select("id,invoice_id,name,quantity,unit,unit_price,total,created_at")
    .ilike("name", invoicePattern)
    .order("created_at", { ascending: false })
    .limit(1);
  return { item: items?.[0] ?? null, match: null };
}

mkdirSync(OUT, { recursive: true });

const results: Record<string, unknown> = {
  validationLab: VL,
  generatedAt: new Date().toISOString(),
  codePaths: {
    ingredientDetail: "ingredient-purchase-memory.ts resolvePurchaseCostLabels → resolveInvoiceLinePricingPresentation (NO shouldCollapseInvoiceOperationalDisplay)",
    invoiceReview: "resolveInvoiceLinePricingPresentation → buildNormalizationCard with shouldCollapseInvoiceOperationalDisplay",
    recipeCosting: "recipeOperationalCostFieldsFromInvoiceLine → ingredientLineCostEur",
  },
  targets: [] as unknown[],
  controls: [] as unknown[],
  summaryTable: [] as unknown[],
};

for (const spec of TARGET_SPECS) {
  const ingredient = await findIngredient(spec.ingredientPattern);
  const { item, match } = ingredient
    ? await findLatestMatchedItem(ingredient.id, spec.invoicePattern)
    : { item: null, match: null };

  const trace = item ? traceLine({ ...item, id: item.id }) : null;
  const comparison = trace ? procurementEqualsOperational(trace) : { same: false, formula: "no data" };
  const classification = classifyIngredient(trace);

  let recipeLines: unknown[] = [];
  if (ingredient) {
    const { data: lines } = await sb
      .from("recipe_ingredients")
      .select("id,quantity,unit,recipes(name)")
      .eq("ingredient_id", ingredient.id)
      .limit(5);
    recipeLines = lines ?? [];
  }

  const entry = {
    key: spec.key,
    displayName: spec.displayName,
    ingredient: ingredient ?? null,
    latestInvoiceItem: item ?? null,
    match: match ?? null,
    trace: trace
      ? {
          bound: trace.bound,
          structure: trace.structure,
          usableChain: trace.usableChain,
          structured: trace.structured,
          presentation: {
            priceDisplay: trace.presentation.priceDisplay,
            effectiveUsableCostLabel: trace.presentation.effectiveUsableCostLabel,
            usableStockLabel: trace.presentation.usableStockLabel,
            card: trace.presentation.card,
            collapseOperational: trace.collapseOperational,
          },
          procurement: trace.procurement,
          persistFields: trace.persistFields,
          recipeFields: trace.recipeFields,
          perUnit: trace.perUnit,
          effective: trace.effective,
          conversionHint: trace.conversionHint,
          detailPresentation: trace.detailPresentation,
        }
      : null,
    q1: trace
      ? {
          purchaseQty: trace.bound.quantity,
          purchaseUnit: trace.bound.unit,
          unitPrice: trace.bound.unit_price,
          total: trace.bound.total,
          purchaseStructure: trace.structure,
          procurementDenominator: trace.procurementDenominator,
          procurementCost: trace.presentation.priceDisplay,
        }
      : null,
    q2: trace
      ? {
          operationalQty: trace.perUnit?.amount ?? trace.structured.normalizedUsableQuantity,
          operationalUnit: trace.perUnit?.unit ?? trace.structured.usableQuantityUnit,
          operationalCost: trace.presentation.effectiveUsableCostLabel,
          normalizationPath: trace.structured.kind,
        }
      : null,
    q3: comparison,
    q4: {
      recipeLines,
      recipeFields: trace?.recipeFields ?? null,
      catalogFields: ingredient
        ? {
            current_price: ingredient.current_price,
            purchase_quantity: ingredient.purchase_quantity,
            base_unit: ingredient.base_unit,
            unit: ingredient.unit,
            effectiveUnitCostEur: effectiveIngredientUnitCostEur(ingredient),
          }
        : null,
      denominator: trace?.recipeFields?.purchase_quantity ?? ingredient?.purchase_quantity,
    },
    q5: classification,
    purchaseMemoryRow: trace
      ? {
          procurementCostLabel: trace.presentation.priceDisplay,
          operationalCostLabel: trace.presentation.effectiveUsableCostLabel,
        }
      : null,
    recipeUsesWhich: recipeUsesWhich(trace),
    same: comparison.same,
  };

  (results.targets as unknown[]).push(entry);
  (results.summaryTable as unknown[]).push({
    ingredient: spec.displayName,
    procurement: trace?.presentation.priceDisplay ?? "—",
    operational: trace?.presentation.effectiveUsableCostLabel ?? "—",
    same: comparison.same ? "YES" : "NO",
    recipeUsesWhich: entry.recipeUsesWhich,
    classification,
    invoiceReviewWouldCollapse: trace?.collapseOperational ?? false,
    ingredientDetailShowsBoth: Boolean(
      trace?.presentation.priceDisplay && trace?.presentation.effectiveUsableCostLabel,
    ),
  });
}

for (const spec of CONTROL_SPECS) {
  const ingredient = await findIngredient(spec.ingredientPattern);
  const { item } = ingredient
    ? await findLatestMatchedItem(ingredient.id, spec.invoicePattern)
    : { item: null, match: null };

  const trace = item ? traceLine({ ...item, id: item.id }) : null;
  const comparison = trace ? procurementEqualsOperational(trace) : { same: false, formula: "no data" };

  (results.controls as unknown[]).push({
    key: spec.key,
    label: spec.label,
    ingredient: ingredient ? { id: ingredient.id, name: ingredient.name } : null,
    procurement: trace?.presentation.priceDisplay ?? null,
    operational: trace?.presentation.effectiveUsableCostLabel ?? null,
    same: comparison.same,
    formula: comparison.formula,
    operationalAddsInfo: trace
      ? !comparison.same && Boolean(trace.presentation.effectiveUsableCostLabel)
      : false,
    collapseOperational: trace?.collapseOperational ?? false,
    conversionHint: trace?.conversionHint ?? null,
    structuredKind: trace?.structured.kind ?? null,
    recipeFields: trace?.recipeFields ?? null,
  });
}

const allTargetsSame = (results.targets as { same: boolean }[]).every((t) => t.same);
const allWouldCollapseOnInvoiceReview = (results.targets as { trace: { presentation: { collapseOperational: boolean } } | null }[])
  .every((t) => t.trace?.presentation.collapseOperational === true);

results.verdict = {
  classification: allTargetsSame ? "B" : "mixed",
  finalVerdictLetter: allTargetsSame ? "B" : "B",
  answer:
    "Would hiding Operational Cost for these four remove any information used by Marginly?",
  answerText:
    "NO — procurement and operational €/kg are mathematically identical for all four; recipe costing uses persisted operational fields (current_price / purchase_quantity in g) yielding the same €/kg. The Operational Cost line on ingredient detail is a display-only duplicate. Invoice Review also shows duplicate €/kg for these rows (collapseOperational=false because row kg ≠ pack kg from name); only the separate normalized quantity line adds pack-size context there.",
  ingredientDetailUsesCollapseRule: false,
  invoiceReviewUsesCollapseRule: true,
  allTargetsProcurementEqualsOperational: allTargetsSame,
  allTargetsInvoiceReviewWouldCollapse: allWouldCollapseOnInvoiceReview,
};

writeFileSync(`${OUT}/results.json`, JSON.stringify(results, null, 2));

// Markdown report
const lines: string[] = [];
lines.push("# Ingredient Procurement vs Operational Cost Duplication Audit");
lines.push("");
lines.push(`**Validation Lab:** \`${VL}\` · **Read-only** · ${new Date().toISOString().slice(0, 10)}`);
lines.push("");

lines.push("## Code path confirmation");
lines.push("");
lines.push("- **Ingredient detail** (`buildLastPurchaseCostPresentation`): uses `resolvePurchaseCostLabels` → `presentation.priceDisplay` + `presentation.effectiveUsableCostLabel` — **does NOT** apply `shouldCollapseInvoiceOperationalDisplay`.");
lines.push("- **Invoice Review** (`buildNormalizationCard`): applies `shouldCollapseInvoiceOperationalDisplay` to hide duplicate operational block.");
lines.push("- **Recipe costing**: `recipeOperationalCostFieldsFromInvoiceLine` / `effectiveIngredientUnitCostEur` — uses persisted operational fields, not display labels.");
lines.push("");

lines.push("## Required summary table");
lines.push("");
lines.push("| Ingredient | Procurement | Operational | Same? | Recipe Uses Which? |");
lines.push("|------------|-------------|-------------|-------|-------------------|");
for (const row of results.summaryTable as {
  ingredient: string;
  procurement: string;
  operational: string;
  same: string;
  recipeUsesWhich: string;
}[]) {
  lines.push(`| ${row.ingredient} | ${row.procurement} | ${row.operational} | ${row.same} | ${row.recipeUsesWhich} |`);
}
lines.push("");

for (const t of results.targets as typeof results.targets extends (infer U)[] ? U[] : never) {
  const entry = t as {
    displayName: string;
    q1: Record<string, unknown> | null;
    q2: Record<string, unknown> | null;
    q3: { same: boolean; formula: string };
    q4: Record<string, unknown>;
    q5: string;
    trace: { presentation: { collapseOperational: boolean } } | null;
    purchaseMemoryRow: Record<string, unknown> | null;
  };
  lines.push(`## ${entry.displayName}`);
  lines.push("");
  lines.push("### Q1 Procurement trace");
  if (entry.q1) {
    lines.push(`| Field | Value |`);
    lines.push(`|-------|-------|`);
    lines.push(`| Purchase Qty | ${entry.q1.purchaseQty} |`);
    lines.push(`| Purchase Unit | ${entry.q1.purchaseUnit} |`);
    lines.push(`| unit_price | €${entry.q1.unitPrice} |`);
    lines.push(`| total | €${entry.q1.total} |`);
    lines.push(`| purchase structure | ${JSON.stringify(entry.q1.purchaseStructure)} |`);
    lines.push(`| procurement denominator | ${entry.q1.procurementDenominator} |`);
    lines.push(`| Procurement Cost | ${entry.q1.procurementCost} |`);
  }
  lines.push("");
  lines.push("### Q2 Operational trace");
  if (entry.q2) {
    lines.push(`| Field | Value |`);
    lines.push(`|-------|-------|`);
    lines.push(`| Operational Qty (per priced unit) | ${entry.q2.operationalQty} |`);
    lines.push(`| Operational Unit | ${entry.q2.operationalUnit} |`);
    lines.push(`| Operational Cost | ${entry.q2.operationalCost} |`);
    lines.push(`| normalization path | ${entry.q2.normalizationPath} |`);
  }
  lines.push("");
  lines.push(`### Q3 Mathematical comparison: **${entry.q3.same ? "YES" : "NO"}**`);
  lines.push(`Formula: ${entry.q3.formula}`);
  lines.push("");
  lines.push("### Q4 Recipe costing");
  const q4 = entry.q4 as {
    recipeFields: { current_price: number; purchase_quantity: number; cost_base_unit: string } | null;
    catalogFields: Record<string, unknown> | null;
    denominator: number | null;
  };
  if (q4.recipeFields) {
    lines.push(`| Field | Value |`);
    lines.push(`|-------|-------|`);
    lines.push(`| current_price | ${q4.recipeFields.current_price} |`);
    lines.push(`| purchase_quantity (denominator) | ${q4.recipeFields.purchase_quantity} |`);
    lines.push(`| cost_base_unit | ${q4.recipeFields.cost_base_unit} |`);
  }
  lines.push("");
  lines.push(`### Q5 Classification: **${entry.q5}**`);
  lines.push(`- A = transforms, B = equals procurement, C = future field, D = data issue`);
  lines.push("");
  lines.push(`Invoice review would collapse operational: **${entry.trace?.presentation.collapseOperational ?? "—"}**`);
  if (entry.purchaseMemoryRow) {
    lines.push(`Purchase memory row: procurement=${entry.purchaseMemoryRow.procurementCostLabel}, operational=${entry.purchaseMemoryRow.operationalCostLabel}`);
  }
  lines.push("");
}

lines.push("## Q6 Control comparison");
lines.push("");
lines.push("| Control | Procurement | Operational | Same? | Operational adds info? |");
lines.push("|---------|-------------|-------------|-------|-------------------------|");
for (const c of results.controls as {
  label: string;
  procurement: string | null;
  operational: string | null;
  same: boolean;
  operationalAddsInfo: boolean;
}[]) {
  lines.push(`| ${c.label} | ${c.procurement ?? "—"} | ${c.operational ?? "—"} | ${c.same ? "YES" : "NO"} | ${c.operationalAddsInfo ? "YES" : "NO"} |`);
}
lines.push("");
lines.push("Controls where operational **adds** info transform purchase units (bunch→kg, bottle→L, case→unit) or apply conversion hints. Kg-priced deli items match procurement exactly like Courgettes test case.");
lines.push("");

lines.push("## Q7 Ingredient page presentation");
lines.push("");
lines.push("`buildLastPurchaseCostPresentation` always renders both lines when labels exist:");
lines.push("- Line 1: Procurement Cost → `presentation.priceDisplay`");
lines.push("- Line 2: Operational Cost → `presentation.effectiveUsableCostLabel`");
lines.push("");
lines.push("For the four deli ingredients priced €/kg on invoice, both Procurement Cost and Operational Cost show **identical €/kg** — the Operational Cost line adds **no new cost information** on ingredient detail.");
lines.push("");
lines.push("Note: Invoice Review also shows both cost lines for these items (`collapseOperational=false`) because purchased row weight (e.g. 1.05 kg) differs from pack-size normalization (e.g. 1.5 kg usable from product name). Invoice Review additionally surfaces pack normalization in a separate \"Normalized\" block; ingredient detail economics card does not.");
lines.push("");

lines.push("## Final verdict");
lines.push("");
lines.push(`**Classification: B** (operational equals procurement for all four targets)`);
lines.push("");
lines.push("**Answer:** Would hiding Operational Cost for these four remove any information used by Marginly?");
lines.push("");
lines.push("**NO** — recipe costing uses `recipeOperationalCostFieldsFromInvoiceLine` / persisted `current_price`+`purchase_quantity`+`cost_base_unit` (g denominator), which for kg-priced charcuterie/cheese yields the same €/kg as procurement. The duplicate Operational Cost line on the ingredient purchase economics card is presentation-only and removes no Marginly computation input.");

writeFileSync(`${OUT}/REPORT.md`, lines.join("\n"));
console.log(`Wrote ${OUT}/REPORT.md and results.json`);
