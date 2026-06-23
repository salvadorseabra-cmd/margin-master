/**
 * Post-implementation replay — gated embedded-measure un inference
 * Validation Lab: bjhnlrgodcqoyzddbpbd (52 invoice_items)
 */
const metaEnv = import.meta as { env?: Record<string, unknown> };
if (!metaEnv.env) metaEnv.env = {};
metaEnv.env.DEV = false;
metaEnv.env.PROD = true;

import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { defaultIsGenericUnit } from "../../src/lib/ingredient-auto-persist.ts";
import { normalizeInvoiceItemFields } from "../../src/lib/invoice-item-fields.ts";
import {
  resolveInvoiceLinePurchaseFormat,
  resolveInvoiceLinePurchaseUnit,
  resolveInvoicePersistedItemUnit,
} from "../../src/lib/invoice-purchase-format.ts";
import {
  computeEffectiveUsableCost,
  formatRowPurchaseQuantityLabel,
  recipeOperationalCostFieldsFromInvoiceLine,
  resolveCountablePurchaseQuantityForCost,
} from "../../src/lib/invoice-purchase-price-semantics.ts";
import {
  computeUsableFromPurchaseStructure,
  parsePurchaseStructureFromText,
} from "../../src/lib/stock-normalization.ts";

const VL = "bjhnlrgodcqoyzddbpbd";
const OUT = ".tmp/embedded-measure-un-inference-validation";

const MUST_NOT_REGRESS = [
  { key: "peroni", pattern: /peroni.*33cl/i, label: "Peroni 33cl*24" },
  { key: "pellegrino", pattern: /pellegrino.*75cl/i, label: "Pellegrino 75cl×15" },
  { key: "acucar", pattern: /açúcar.*10x1|acucar.*10x1/i, label: "Açúcar 10x1kg" },
  { key: "pomodori", pattern: /pomodori.*2[.,]5.*kg/i, label: "Pomodori 2.5kg×6" },
  { key: "mozzarella", pattern: /mozzarella.*125/i, label: "Mozzarella 125g×8" },
  { key: "guanciale", pattern: /guanciale/i, label: "Guanciale" },
];

const EXPECTED_FIXES = [
  { key: "paccheri", pattern: /paccheri.*lisci/i, label: "Paccheri 500g" },
  { key: "ginger", pattern: /ginger\s*beer/i, label: "Ginger Beer 0.20cl" },
];

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

type Line = {
  id: string;
  invoice_id: string;
  name: string;
  quantity: number | null;
  unit: string | null;
  unit_price: number | null;
  total: number | null;
};

/** Baseline: resolver before gated un inference (fallback_null stays null). */
function baselineResolveUnit(item: { name: string; quantity: number | null; unit: string | null }): string | null {
  const resolution = resolveInvoiceLinePurchaseUnit(item, defaultIsGenericUnit);
  if (resolution.unit) return resolution.unit;
  const extractedUnit = item.unit?.trim() || null;
  if (extractedUnit) {
    const u = extractedUnit.toLowerCase();
    if (u !== "g" && u !== "gr" && u !== "grs" && u !== "ml") {
      return extractedUnit;
    }
  }
  return null;
}

function assessCalcImpact(
  norm: ReturnType<typeof normalizeInvoiceItemFields>,
  beforeUnit: string | null,
  afterUnit: string | null,
) {
  const structuredBefore = resolveInvoiceLinePurchaseFormat({
    name: norm.name,
    quantity: norm.quantity,
    unit: beforeUnit,
  });
  const structuredAfter = resolveInvoiceLinePurchaseFormat({
    name: norm.name,
    quantity: norm.quantity,
    unit: afterUnit,
  });

  const metaBefore = {
    name: norm.name,
    quantity: norm.quantity,
    unit: beforeUnit,
    unit_price: norm.unit_price,
    line_total: norm.total,
  };
  const metaAfter = { ...metaBefore, unit: afterUnit };

  const labelBefore = formatRowPurchaseQuantityLabel(metaBefore);
  const labelAfter = formatRowPurchaseQuantityLabel(metaAfter);

  const costBefore =
    norm.unit_price != null
      ? computeEffectiveUsableCost(norm.unit_price, metaBefore, structuredBefore, norm.name)
      : null;
  const costAfter =
    norm.unit_price != null
      ? computeEffectiveUsableCost(norm.unit_price, metaAfter, structuredAfter, norm.name)
      : null;

  const procBefore = recipeOperationalCostFieldsFromInvoiceLine(metaBefore);
  const procAfter = recipeOperationalCostFieldsFromInvoiceLine(metaAfter);

  const purchaseQtyBefore = resolveCountablePurchaseQuantityForCost(metaBefore, structuredBefore);
  const purchaseQtyAfter = resolveCountablePurchaseQuantityForCost(metaAfter, structuredAfter);

  const usableBefore = structuredBefore.normalizedUsableQuantity;
  const usableAfter = structuredAfter.normalizedUsableQuantity;

  const structure = parsePurchaseStructureFromText(norm.name);
  let usableChainBefore = null;
  let usableChainAfter = null;
  if (structure) {
    usableChainBefore = computeUsableFromPurchaseStructure(structure, norm.quantity, beforeUnit);
    usableChainAfter = computeUsableFromPurchaseStructure(structure, norm.quantity, afterUnit);
  }

  const displayDiffers = labelBefore !== labelAfter;
  const usableDiffers =
    usableBefore !== usableAfter ||
    structuredBefore.usableQuantityUnit !== structuredAfter.usableQuantityUnit ||
    (usableChainBefore &&
      usableChainAfter &&
      (usableChainBefore.usableQuantity !== usableChainAfter.usableQuantity ||
        usableChainBefore.usableUnit !== usableChainAfter.usableUnit));
  const costDiffers =
    (costBefore?.cost ?? null) !== (costAfter?.cost ?? null) ||
    (costBefore?.unit ?? null) !== (costAfter?.unit ?? null);
  const procDiffers =
    (procBefore?.purchase_quantity ?? null) !== (procAfter?.purchase_quantity ?? null) ||
    (procBefore?.cost_base_unit ?? null) !== (procAfter?.cost_base_unit ?? null) ||
    (procBefore?.current_price ?? null) !== (procAfter?.current_price ?? null);
  const purchaseQtyDiffers = purchaseQtyBefore !== purchaseQtyAfter;

  let impact = "NONE";
  if (usableDiffers || costDiffers || procDiffers || purchaseQtyDiffers) {
    impact = "CALCULATION_RISK";
  } else if (displayDiffers) {
    impact = "DISPLAY_ONLY";
  }

  return { impact, labelBefore, labelAfter, displayDiffers, usableDiffers, costDiffers };
}

async function fetchAllInvoiceItems(): Promise<Line[]> {
  const pageSize = 1000;
  let offset = 0;
  const all: Line[] = [];
  for (;;) {
    const { data, error } = await sb
      .from("invoice_items")
      .select("id,invoice_id,name,quantity,unit,unit_price,total")
      .range(offset, offset + pageSize - 1);
    if (error) throw new Error(error.message);
    if (!data?.length) break;
    all.push(...data);
    if (data.length < pageSize) break;
    offset += pageSize;
  }
  return all;
}

async function fetchInvoices(ids: string[]) {
  const invById = new Map<string, { supplier_name: string | null }>();
  const chunk = 50;
  for (let i = 0; i < ids.length; i += chunk) {
    const slice = ids.slice(i, i + chunk);
    const { data, error } = await sb.from("invoices").select("id,supplier_name").in("id", slice);
    if (error) throw new Error(error.message);
    for (const inv of data ?? []) {
      invById.set(inv.id, { supplier_name: inv.supplier_name });
    }
  }
  return invById;
}

function findFocus(
  rows: RowResult[],
  patterns: { key: string; pattern: RegExp; label: string }[],
) {
  return patterns.map((p) => {
    const row = rows.find((r) => p.pattern.test(r.product));
    return row ? { ...p, row } : { ...p, row: null };
  });
}

type RowResult = {
  invoiceItemId: string;
  supplier: string;
  product: string;
  dbQuantity: number | null;
  dbUnit: string | null;
  structuredKind: string;
  beforeResolvedUnit: string | null;
  afterResolvedUnit: string | null;
  resolutionSource: string;
  unitChanged: boolean;
  impact: string;
};

mkdirSync(OUT, { recursive: true });

const allItems = await fetchAllInvoiceItems();
const invById = await fetchInvoices([...new Set(allItems.map((i) => i.invoice_id))]);

const rows: RowResult[] = [];

for (const item of allItems) {
  const norm = normalizeInvoiceItemFields(item);
  const line = { name: norm.name, quantity: norm.quantity, unit: norm.unit };

  const before = baselineResolveUnit(line);
  const after = resolveInvoicePersistedItemUnit(line, defaultIsGenericUnit);
  const resolution = resolveInvoiceLinePurchaseUnit(line, defaultIsGenericUnit);
  const structured = resolveInvoiceLinePurchaseFormat(line);
  const impact = assessCalcImpact(norm, before, after);

  rows.push({
    invoiceItemId: item.id,
    supplier: invById.get(item.invoice_id)?.supplier_name ?? "unknown",
    product: norm.name,
    dbQuantity: norm.quantity == null ? null : Number(norm.quantity),
    dbUnit: norm.unit,
    structuredKind: structured.kind,
    beforeResolvedUnit: before,
    afterResolvedUnit: after,
    resolutionSource: resolution.source,
    unitChanged: before !== after,
    impact: impact.impact,
  });
}

const changedRows = rows.filter((r) => r.unitChanged);
const expectedFixes = findFocus(rows, EXPECTED_FIXES);
const mustNotRegress = findFocus(rows, MUST_NOT_REGRESS);
const calcRiskChanges = changedRows.filter((r) => r.impact === "CALCULATION_RISK");

const allFixesOk = expectedFixes.every(
  (f) => f.row?.beforeResolvedUnit == null && f.row?.afterResolvedUnit === "un",
);
const noRegressions = mustNotRegress.every((m) => !m.row?.unitChanged);
const blastRadiusOk = changedRows.length === 2 && calcRiskChanges.length === 0;

let verdict: "A" | "B" | "C";
let verdictLabel: string;
if (allFixesOk && noRegressions && blastRadiusOk) {
  verdict = "A";
  verdictLabel = "Safe to merge";
} else if (calcRiskChanges.length > 0) {
  verdict = "C";
  verdictLabel = "Rejected";
} else {
  verdict = "B";
  verdictLabel = "Needs adjustment";
}

const output = {
  generatedAt: new Date().toISOString(),
  validationLab: VL,
  implementation: "gated embedded-measure un inference in resolveInvoicePersistedItemUnit",
  gateConditions: [
    "OCR unit is null",
    "resolveInvoiceLinePurchaseFormat().kind === weight_or_volume",
    "quantity is integer and > 1",
    "name embeds retail g/ml/cl measure (not kg/L purchase denomination)",
    "name lacks pack-denomination markers (EMB, CX, CAIXA, PACK)",
    "resolveInvoiceLinePurchaseUnit() returns fallback_null",
    "then infer un",
  ],
  corpus: {
    totalItems: rows.length,
    changedRows: changedRows.length,
    displayOnlyChanges: changedRows.filter((r) => r.impact === "DISPLAY_ONLY").length,
    calculationRiskChanges: calcRiskChanges.length,
  },
  expectedFixes: expectedFixes.map((f) => ({
    product: f.label,
    found: f.row != null,
    before: f.row?.beforeResolvedUnit ?? null,
    after: f.row?.afterResolvedUnit ?? null,
    fixesGap: f.row?.beforeResolvedUnit == null && f.row?.afterResolvedUnit === "un",
  })),
  regressionMatrix: mustNotRegress.map((m) => ({
    product: m.label,
    found: m.row != null,
    dbUnit: m.row?.dbUnit ?? null,
    before: m.row?.beforeResolvedUnit ?? null,
    after: m.row?.afterResolvedUnit ?? null,
    unitChanged: m.row?.unitChanged ?? null,
  })),
  changedRows,
  allRows: rows,
  verdict: { code: verdict, label: verdictLabel },
};

writeFileSync(`${OUT}/results.json`, JSON.stringify(output, null, 2));
console.log(
  JSON.stringify(
    {
      total: rows.length,
      changed: changedRows.length,
      calcRisk: calcRiskChanges.length,
      verdict,
      changedProducts: changedRows.map((r) => r.product),
    },
    null,
    2,
  ),
);
