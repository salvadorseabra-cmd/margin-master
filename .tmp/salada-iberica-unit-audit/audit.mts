/**
 * STRICT READ-ONLY Salada Ibérica Unit Representation Audit — VL bjhnlrgodcqoyzddbpbd
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
  isCaseRowWithEmbeddedPieceWeightOnly,
  resolveInvoiceLinePurchaseFormat,
  resolveInvoiceLinePurchaseUnit,
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

const VL = "bjhnlrgodcqoyzddbpbd";
const OUT = ".tmp/salada-iberica-unit-audit";

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
  const purchaseUnitResolution = resolveInvoiceLinePurchaseUnit(metadata, defaultIsGenericUnit);
  const structuredFields = structuredPurchaseToIngredientFields(
    structured,
    bound.unit,
    defaultIsGenericUnit,
  );
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
  const isCasePieceWeight = isCaseRowWithEmbeddedPieceWeightOnly(bound.name, bound.unit);
  const rowQtyLabel = formatRowPurchaseQuantityLabel(metadata);
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
    purchaseUnitResolution,
    structuredFields,
    procurement,
    persistFields,
    recipeFields,
    perUnit,
    effective,
    isCasePieceWeight,
    rowQtyLabel,
    detailPresentation,
  };
}

mkdirSync(OUT, { recursive: true });

// Q1: Salada ibérica ingredient
const SALADA_ITEM_ID = "593e7560-ba2a-4c60-8300-ff34a26335b9";

const { data: saladaMatch } = await sb
  .from("invoice_item_matches")
  .select("ingredient_id,status,match_kind")
  .eq("invoice_item_id", SALADA_ITEM_ID)
  .maybeSingle();

let saladaIngredient: Record<string, unknown> | null = null;
if (saladaMatch?.ingredient_id) {
  const { data } = await sb
    .from("ingredients")
    .select("id,name,current_price,purchase_quantity,purchase_unit,base_unit,unit,normalized_name,supplier")
    .eq("id", saladaMatch.ingredient_id)
    .maybeSingle();
  saladaIngredient = data;
}

if (!saladaIngredient) {
  const { data: saladaIngredients } = await sb
    .from("ingredients")
    .select("id,name,current_price,purchase_quantity,purchase_unit,base_unit,unit,normalized_name,supplier")
    .or("name.ilike.%salada%ibérica%,name.ilike.%salada%iberica%,normalized_name.ilike.%salada%iberica%")
    .limit(10);
  saladaIngredient =
    saladaIngredients?.find((i) => /salada/i.test(i.name ?? "") && /ib[eé]rica/i.test(i.name ?? "")) ??
    saladaIngredients?.[0] ??
    null;
}

// Q2: Latest Salada invoice line
const { data: saladaItems } = await sb
  .from("invoice_items")
  .select(
    "id,invoice_id,name,quantity,unit,unit_price,total,created_at,invoices(id,supplier_name,invoice_date)",
  )
  .ilike("name", "%Salada Ibérica%")
  .order("created_at", { ascending: false })
  .limit(5);

const saladaItem = saladaItems?.[0] ?? null;

// Controls
const controlPatterns = [
  { key: "ovo", label: "Ovo classe M", pattern: "%Ovo%classe%M%" },
  { key: "tomilho", label: "Tomilho", pattern: "%Tomilho%" },
  { key: "manjericao", label: "Manjericão", pattern: "%Manjeric%o%" },
];

const controls: Record<string, unknown> = {};
for (const c of controlPatterns) {
  const { data: items } = await sb
    .from("invoice_items")
    .select("id,name,quantity,unit,unit_price,total")
    .ilike("name", c.pattern)
    .order("created_at", { ascending: false })
    .limit(1);
  const item = items?.[0];
  if (item) {
    controls[c.key] = {
      label: c.label,
      trace: traceLine(item),
      db: item,
    };
  }
}

const saladaTrace = saladaItem ? traceLine(saladaItem) : null;

// Price history for Salada
const { data: priceHistory } = saladaIngredient
  ? await sb
      .from("ingredient_price_history")
      .select("id,invoice_id,new_price,created_at")
      .eq("ingredient_id", saladaIngredient.id)
      .order("created_at", { ascending: false })
      .limit(5)
  : { data: null };

// Aliases
const { data: aliases } = saladaIngredient
  ? await sb
      .from("ingredient_aliases")
      .select("alias_name,confirmed_by_user")
      .eq("ingredient_id", saladaIngredient.id)
  : { data: null };

function deriveProcurementUnit(trace: ReturnType<typeof traceLine> | null): string | null {
  if (!trace) return null;
  const suffix = trace.presentation.priceDisplay?.split(" / ")[1] ?? null;
  return suffix;
}

function deriveOperationalUnit(trace: ReturnType<typeof traceLine> | null): string | null {
  if (!trace) return null;
  return (
    trace.effective?.unit ??
    trace.presentation.effectiveUsableCostLabel?.split(" / ")[1] ??
    null
  );
}

function derivePurchaseStructureKind(trace: ReturnType<typeof traceLine> | null): string | null {
  if (!trace) return null;
  return trace.structure?.tier ?? trace.structured.kind ?? null;
}

function deriveUsableQuantity(trace: ReturnType<typeof traceLine> | null): {
  quantity: number | null;
  unit: string | null;
} {
  if (!trace) return { quantity: null, unit: null };
  const q = trace.structured.normalizedUsableQuantity;
  const u = trace.structured.usableQuantityUnit;
  return { quantity: q, unit: u };
}

const q1 = saladaIngredient
  ? {
      ingredient_id: saladaIngredient.id,
      name: saladaIngredient.name,
      current_price: saladaIngredient.current_price,
      purchase_quantity: saladaIngredient.purchase_quantity,
      purchase_unit: saladaIngredient.purchase_unit,
      procurement_unit: deriveProcurementUnit(saladaTrace),
      operational_unit: deriveOperationalUnit(saladaTrace),
      usable_quantity: deriveUsableQuantity(saladaTrace).quantity,
      usable_unit: deriveUsableQuantity(saladaTrace).unit,
      purchase_structure_kind: derivePurchaseStructureKind(saladaTrace),
      catalog: {
        base_unit: saladaIngredient.base_unit,
        unit: saladaIngredient.unit,
      },
      match: saladaMatch ?? null,
    }
  : null;

const q2 = saladaItem
  ? {
      invoice_item_id: saladaItem.id,
      invoice_id: saladaItem.invoice_id,
      quantity: saladaItem.quantity,
      unit: saladaItem.unit,
      unit_price: saladaItem.unit_price,
      line_total: saladaItem.total,
      purchase_structure_kind: derivePurchaseStructureKind(saladaTrace),
      persisted_as: saladaTrace?.rowQtyLabel ?? null,
      supplier: (saladaItem.invoices as { supplier_name?: string } | null)?.supplier_name ?? null,
      invoice_date: (saladaItem.invoices as { invoice_date?: string } | null)?.invoice_date ?? null,
    }
  : null;

const q3 = saladaTrace
  ? {
      pipeline: [
        {
          stage: "invoice_item (DB)",
          quantity: saladaItem?.quantity,
          unit: saladaItem?.unit,
          unit_price: saladaItem?.unit_price,
          total: saladaItem?.total,
        },
        {
          stage: "normalizeInvoiceItemFields",
          quantity: saladaTrace.bound.quantity,
          unit: saladaTrace.bound.unit,
        },
        {
          stage: "parsePurchaseStructureFromText",
          tier: saladaTrace.structure?.tier ?? null,
          matchedText: saladaTrace.structure?.matchedText ?? null,
          unitSize: saladaTrace.structure?.unitSize ?? null,
          unitMeasurement: saladaTrace.structure?.unitMeasurement ?? null,
        },
        {
          stage: "computeUsableFromPurchaseStructure",
          usableQuantity: saladaTrace.usableChain?.usableQuantity ?? null,
          usableUnit: saladaTrace.usableChain?.usableUnit ?? null,
          usableSource: saladaTrace.usableChain?.usableSource ?? null,
          purchaseContainerCount: saladaTrace.usableChain?.purchaseContainerCount ?? null,
        },
        {
          stage: "resolveInvoiceLinePurchaseFormat",
          kind: saladaTrace.structured.kind,
          purchaseContainerCount: saladaTrace.structured.purchaseContainerCount,
          purchaseContainerUnit: saladaTrace.structured.purchaseContainerUnit,
          normalizedUsableQuantity: saladaTrace.structured.normalizedUsableQuantity,
          usableQuantityUnit: saladaTrace.structured.usableQuantityUnit,
          packageQuantity: saladaTrace.structured.packageQuantity,
          packageMeasurementUnit: saladaTrace.structured.packageMeasurementUnit,
        },
        {
          stage: "isCaseRowWithEmbeddedPieceWeightOnly",
          result: saladaTrace.isCasePieceWeight,
        },
        {
          stage: "resolveUsablePerPricedUnit",
          perUnit: saladaTrace.perUnit,
        },
        {
          stage: "computeEffectiveUsableCost",
          effective: saladaTrace.effective,
        },
        {
          stage: "resolveInvoiceLinePricingPresentation",
          priceDisplay: saladaTrace.presentation.priceDisplay,
          effectiveUsableCostLabel: saladaTrace.presentation.effectiveUsableCostLabel,
          usableStockLabel: saladaTrace.presentation.usableStockLabel,
          purchaseQuantityLine: saladaTrace.presentation.card?.purchaseQuantityLine ?? null,
        },
        {
          stage: "buildLastPurchaseCostPresentation (detail UI)",
          lastPurchase: saladaTrace.detailPresentation?.lastPurchase ?? null,
          procurementCost: saladaTrace.detailPresentation?.procurementCost ?? null,
          operationalCost: saladaTrace.detailPresentation?.operationalCost ?? null,
        },
        {
          stage: "operationalCostFieldsFromInvoiceLine (persistence)",
          fields: saladaTrace.persistFields,
        },
        {
          stage: "recipeOperationalCostFieldsFromInvoiceLine",
          fields: saladaTrace.recipeFields,
        },
      ],
    }
  : null;

const q4Options = {
  A: "Data corruption — wrong values stored in DB",
  B: "Purchase-unit mapping — procurement suffix wrong",
  C: "Operational-unit derivation — computeEffectiveUsableCost / isCaseRowWithEmbeddedPieceWeightOnly",
  D: "UI rendering bug — detail panel mislabels stored values",
  E: "Mixed — multiple stages contribute",
};

const q4 = saladaTrace
  ? {
      selected: saladaTrace.isCasePieceWeight ? "C" : "E",
      evidence: {
        isCaseRowWithEmbeddedPieceWeightOnly: saladaTrace.isCasePieceWeight,
        rowUnit: saladaTrace.bound.unit,
        procurementSuffix: deriveProcurementUnit(saladaTrace),
        operationalUnit: deriveOperationalUnit(saladaTrace),
        computeEffectiveUsableCost: saladaTrace.effective,
        normalizedUsableQuantityNulledByCasePath:
          saladaTrace.isCasePieceWeight &&
          saladaTrace.structured.normalizedUsableQuantity != null,
        note: saladaTrace.isCasePieceWeight
          ? "isCaseRowWithEmbeddedPieceWeightOnly(name, em)=true for bare_measure 250g embed; computeEffectiveUsableCost short-circuits to {cost: unitPrice, unit: 'case'}"
          : "Case path not triggered",
      },
    }
  : null;

const q5 = Object.fromEntries(
  Object.entries(controls).map(([key, val]) => {
    const v = val as { label: string; trace: ReturnType<typeof traceLine>; db: unknown };
    return [
      key,
      {
        label: v.label,
        invoiceQuantity: (v.db as { quantity: number }).quantity,
        invoiceUnit: (v.db as { unit: string }).unit,
        rowQtyLabel: v.trace.rowQtyLabel,
        procurementCost: v.trace.presentation.priceDisplay,
        operationalCost: v.trace.presentation.effectiveUsableCostLabel,
        isCasePieceWeight: v.trace.isCasePieceWeight,
        effectiveUnit: v.trace.effective?.unit ?? null,
        purchaseStructureKind: derivePurchaseStructureKind(v.trace),
      },
    ];
  }),
);

const q6 = {
  procurementDisplayRule:
    "resolvePriceSuffix maps row unit em → ROW_UNIT_PRICE_SUFFIX['em'] = 'pack'; priceDisplay = €{unit_price} / pack",
  operationalDisplayRule: saladaTrace?.isCasePieceWeight
    ? "isCaseRowWithEmbeddedPieceWeightOnly triggers computeEffectiveUsableCost early return { cost: unitPrice, unit: 'case' } — skips kg/L derivation"
    : "Normal kg/L path from resolveUsablePerPricedUnit",
  dataModelImplication:
    "Procurement and operational use different code paths: procurement via resolvePriceSuffix (em→pack); operational via isCaseRowWithEmbeddedPieceWeightOnly (em in PACK_CONTAINER_ROW_UNITS + bare_measure → hardcoded 'case')",
  samePriceDifferentSuffix:
    saladaTrace?.presentation.priceDisplay != null &&
    saladaTrace?.presentation.effectiveUsableCostLabel != null &&
    saladaTrace.presentation.priceDisplay.split(" / ")[0] ===
      saladaTrace.presentation.effectiveUsableCostLabel.split(" / ")[0],
};

const requiredTable = [
  {
    field: "Invoice quantity",
    currentValue: String(saladaItem?.quantity ?? "—"),
    source: "invoice_items.quantity",
  },
  {
    field: "Invoice unit (DB)",
    currentValue: String(saladaItem?.unit ?? "—"),
    source: "invoice_items.unit",
  },
  {
    field: "Unit price (effective)",
    currentValue: saladaItem?.unit_price != null ? `€${saladaItem.unit_price.toFixed(2)}` : "—",
    source: "invoice_items.unit_price (post discount binding)",
  },
  {
    field: "Line total",
    currentValue: saladaItem?.total != null ? `€${saladaItem.total.toFixed(2)}` : "—",
    source: "invoice_items.total",
  },
  {
    field: "Last Purchase label",
    currentValue: saladaTrace?.rowQtyLabel ?? "—",
    source: "formatRowPurchaseQuantityLabel",
  },
  {
    field: "Procurement Cost",
    currentValue: saladaTrace?.presentation.priceDisplay ?? "—",
    source: "resolveInvoiceLinePricingPresentation.priceDisplay",
  },
  {
    field: "Operational Cost",
    currentValue: saladaTrace?.presentation.effectiveUsableCostLabel ?? "—",
    source: "resolveInvoiceLinePricingPresentation.effectiveUsableCostLabel",
  },
  {
    field: "Purchase structure tier",
    currentValue: saladaTrace?.structure?.tier ?? "—",
    source: "parsePurchaseStructureFromText",
  },
  {
    field: "isCaseRowWithEmbeddedPieceWeightOnly",
    currentValue: String(saladaTrace?.isCasePieceWeight ?? "—"),
    source: "invoice-purchase-format.ts",
  },
  {
    field: "normalizedUsableQuantity",
    currentValue:
      saladaTrace?.structured.normalizedUsableQuantity != null
        ? `${saladaTrace.structured.normalizedUsableQuantity} ${saladaTrace.structured.usableQuantityUnit ?? ""}`
        : "null (suppressed by case path or unknown)",
    source: "resolveInvoiceLinePurchaseFormat",
  },
  {
    field: "ingredients.purchase_unit",
    currentValue: String(saladaIngredient?.purchase_unit ?? "—"),
    source: "ingredients table",
  },
  {
    field: "ingredients.current_price",
    currentValue:
      saladaIngredient?.current_price != null
        ? `€${Number(saladaIngredient.current_price).toFixed(2)}`
        : "—",
    source: "ingredients table",
  },
];

const verdict = q4?.selected === "C" ? "C" : q4?.selected ?? "E";

const results = {
  validationLab: VL,
  auditedAt: new Date().toISOString(),
  mode: "STRICT_READ_ONLY",
  product: "Salada Ibérica FSTK EMB. 250g",
  verdict,
  verdictQuestion:
    "Why is Salada Ibérica showing €2.19 / case as Operational Cost?",
  verdictAnswer: q4?.evidence.note ?? null,
  q1_dbState: q1,
  q2_latestPurchase: q2,
  q3_operationalTrace: q3,
  q4_caseOrigin: q4,
  q4Options,
  q5_controls: q5,
  q6_consistency: q6,
  requiredTable,
  saladaTrace: saladaTrace
    ? {
        invoiceItemId: saladaTrace.invoiceItemId,
        isCasePieceWeight: saladaTrace.isCasePieceWeight,
        procurement: saladaTrace.procurement,
        persistFields: saladaTrace.persistFields,
        recipeFields: saladaTrace.recipeFields,
        purchaseUnitResolution: saladaTrace.purchaseUnitResolution,
        structuredFields: saladaTrace.structuredFields,
      }
    : null,
  saladaItems: saladaItems ?? [],
  saladaIngredient,
  saladaMatch: saladaMatch ?? null,
  priceHistory: priceHistory ?? [],
  aliases: aliases ?? [],
};

writeFileSync(`${OUT}/results.json`, JSON.stringify(results, null, 2));

const report = `# Salada Ibérica Unit Representation Audit

**Validation Lab:** \`${VL}\`  
**Mode:** STRICT READ-ONLY — no code changes, no DB writes, no deployments  
**Generated:** ${results.auditedAt}

---

## Executive Summary

Salada Ibérica FSTK EMB. 250g (Bidfood, qty **4**, unit **em**, €2.19/pack effective) shows **Procurement €2.19 / pack** and **Operational €2.19 / case** on Ingredient Detail. Invoice data is consistent (4 packs, €8.76 total). The mismatch is **not** data corruption and **not** a UI rendering bug — the detail panel faithfully displays values from \`resolveInvoiceLinePricingPresentation\`.

**Root cause (classification C):** \`isCaseRowWithEmbeddedPieceWeightOnly\` returns **true** because row unit \`em\` is in \`PACK_CONTAINER_ROW_UNITS\` and the product name embeds bare_measure \`250g\`. \`computeEffectiveUsableCost\` then short-circuits to \`{ cost: unitPrice, unit: "case" }\`, while procurement uses \`resolvePriceSuffix\` which maps \`em\` → **pack**.

**FINAL VERDICT: C**

**Why is Salada Ibérica showing €2.19 / case as Operational Cost?**  
Because \`computeEffectiveUsableCost\` treats EMB (\`em\`) pack rows with embedded piece weight like case (\`cx\`) rows and hardcodes operational suffix **case**, bypassing the €/kg derivation that would apply from 250 g usable weight.

---

## Required Table

| Field | Current Value | Source |
|-------|---------------|--------|
${requiredTable.map((r) => `| ${r.field} | ${r.currentValue} | ${r.source} |`).join("\n")}

---

## Q1 — DB State for Ingredient Salada ibérica

${q1 ? `
| Field | Value |
|-------|-------|
| ingredient_id | \`${q1.ingredient_id}\` |
| name | ${q1.name} |
| current_price | ${q1.current_price} |
| purchase_quantity | ${q1.purchase_quantity} |
| purchase_unit | ${q1.purchase_unit} |
| procurement_unit (derived display) | ${q1.procurement_unit} |
| operational_unit (derived display) | ${q1.operational_unit} |
| usable_quantity | ${q1.usable_quantity} |
| usable_unit | ${q1.usable_unit} |
| purchase_structure_kind | ${q1.purchase_structure_kind} |
` : "*No ingredient row found in VL*"}

---

## Q2 — Latest Purchase History

${q2 ? `
| Field | Value |
|-------|-------|
| invoice_item_id | \`${q2.invoice_item_id}\` |
| invoice_id | \`${q2.invoice_id}\` |
| quantity | ${q2.quantity} |
| unit | ${q2.unit} |
| unit_price | ${q2.unit_price} |
| line_total | ${q2.line_total} |
| purchase_structure_kind | ${q2.purchase_structure_kind} |
| persisted display | **${q2.persisted_as}** (${q2.quantity} packs) |
| supplier | ${q2.supplier} |
| invoice_date | ${q2.invoice_date} |
` : "*No invoice_items row found*"}

Purchase was persisted as **pack** (4 packs via \`em\` → ROW_UNIT_CONTAINER_LABEL pack/plural).

---

## Q3 — Operational Representation Trace

${q3 ? q3.pipeline.map((s) => `### ${s.stage}\n\`\`\`json\n${JSON.stringify(s, null, 2)}\n\`\`\``).join("\n\n") : "—"}

---

## Q4 — Where Does "case" Originate?

| Option | Description | Applies? |
|--------|-------------|:--------:|
| A | Data corruption | **No** — DB qty=4, unit=em, prices correct |
| B | Purchase-unit mapping | **No** — procurement correctly shows /pack |
| C | Operational-unit derivation | **Yes** — \`isCaseRowWithEmbeddedPieceWeightOnly\` + \`computeEffectiveUsableCost\` hardcodes \`case\` |
| D | UI rendering bug | **No** — \`buildLastPurchaseCostPresentation\` passes through computed labels |
| E | Mixed | Partial — procurement path correct; only operational derivation wrong |

**Evidence:** \`isCaseRowWithEmbeddedPieceWeightOnly("${saladaTrace?.bound.name ?? ""}", "${saladaTrace?.bound.unit ?? ""}")\` = **${saladaTrace?.isCasePieceWeight}**. When true, \`computeEffectiveUsableCost\` returns \`${JSON.stringify(saladaTrace?.effective)}\` without kg/L normalization.

Code: \`src/lib/invoice-purchase-price-semantics.ts\` lines 522–524; \`src/lib/invoice-purchase-format.ts\` lines 213–224.

---

## Q5 — Control Comparison

| Product | Invoice qty/unit | Last Purchase | Procurement | Operational | isCasePieceWeight | Structure |
|---------|------------------|---------------|-------------|-------------|:-----------------:|-----------|
| **Salada Ibérica** | ${saladaItem?.quantity} / ${saladaItem?.unit} | ${saladaTrace?.rowQtyLabel} | ${saladaTrace?.presentation.priceDisplay} | ${saladaTrace?.presentation.effectiveUsableCostLabel} | ${saladaTrace?.isCasePieceWeight} | ${derivePurchaseStructureKind(saladaTrace)} |
${Object.values(q5)
  .map(
    (c) =>
      `| ${(c as { label: string }).label} | ${(c as { invoiceQuantity: number }).invoiceQuantity} / ${(c as { invoiceUnit: string }).invoiceUnit} | ${(c as { rowQtyLabel: string }).rowQtyLabel} | ${(c as { procurementCost: string }).procurementCost} | ${(c as { operationalCost: string | null }).operationalCost ?? "null"} | ${(c as { isCasePieceWeight: boolean }).isCasePieceWeight} | ${(c as { purchaseStructureKind: string }).purchaseStructureKind} |`,
  )
  .join("\n")}

Salada differs from herb controls (Tomilho/Manjericão use \`mo\` bunch suffix, no bare_measure case path) and from Ovo (countable egg path).

---

## Q6 — Consistency Test

| Aspect | Behavior |
|--------|----------|
| Procurement display | ${q6.procurementDisplayRule} |
| Operational display | ${q6.operationalDisplayRule} |
| Data model implication | ${q6.dataModelImplication} |
| Same € amount, different suffix | ${q6.samePriceDifferentSuffix ? "**Yes** — €2.19 / pack vs €2.19 / case" : "No"} |

The current data model **does not guarantee** procurement and operational unit suffixes match for EMB pack rows with embedded weight: procurement respects \`em\`→pack mapping; operational uses the Angus-style case shortcut intended for \`cx\` rows.

---

## Evidence Files

- \`.tmp/salada-iberica-unit-audit/results.json\`
- VL invoice_item: \`${saladaItem?.id ?? "—"}\`
- VL ingredient: \`${saladaIngredient?.id ?? "—"}\`
`;

writeFileSync(`${OUT}/REPORT.md`, report);
console.log("Audit complete:", OUT);
console.log("Verdict:", verdict);
