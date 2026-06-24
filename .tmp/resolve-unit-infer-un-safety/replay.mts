/**
 * STRICT READ-ONLY safety replay — infer "un" for weight_or_volume + null OCR + qty>1
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
const OUT = ".tmp/resolve-unit-infer-un-safety";

const MUST_NOT_REGRESS = [
  { key: "peroni", pattern: /peroni.*33cl/i, label: "Peroni 33cl*24" },
  { key: "pellegrino", pattern: /pellegrino.*75cl/i, label: "Pellegrino 75cl×15" },
  { key: "acucar", pattern: /açúcar.*10x1|acucar.*10x1/i, label: "Açúcar 10x1kg" },
  { key: "pomodori", pattern: /pomodori.*2[.,]5.*kg/i, label: "Pomodori 2.5kg×6" },
  { key: "mozzarella", pattern: /mozzarella.*125/i, label: "Mozzarella 125g×8" },
  { key: "guanciale", pattern: /guanciale/i, label: "Guanciale" },
];

const NEEDS_FIX = [
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

function isCounterWeightPriced(qty: number | null): boolean {
  return qty != null && Number.isFinite(qty) && qty > 0 && !Number.isInteger(qty);
}

/** Proposed minimal rule under test */
function simulateProposedInferUn(
  item: { name: string; quantity: number | null; unit: string | null },
  structuredKind: string,
): string | null {
  const ocrUnit = item.unit?.trim() || null;
  const qty = item.quantity == null ? null : Number(item.quantity);
  if (ocrUnit) {
    return resolveInvoicePersistedItemUnit(item, defaultIsGenericUnit);
  }
  if (structuredKind === "weight_or_volume" && qty != null && qty > 1) {
    return "un";
  }
  return resolveInvoicePersistedItemUnit(item, defaultIsGenericUnit);
}

function assessCalcImpact(
  norm: ReturnType<typeof normalizeInvoiceItemFields>,
  currentUnit: string | null,
  proposedUnit: string | null,
) {
  const structuredCurrent = resolveInvoiceLinePurchaseFormat({
    name: norm.name,
    quantity: norm.quantity,
    unit: currentUnit,
  });
  const structuredProposed = resolveInvoiceLinePurchaseFormat({
    name: norm.name,
    quantity: norm.quantity,
    unit: proposedUnit,
  });

  const metaCurrent = {
    name: norm.name,
    quantity: norm.quantity,
    unit: currentUnit,
    unit_price: norm.unit_price,
    line_total: norm.total,
  };
  const metaProposed = { ...metaCurrent, unit: proposedUnit };

  const labelCurrent = formatRowPurchaseQuantityLabel(metaCurrent);
  const labelProposed = formatRowPurchaseQuantityLabel(metaProposed);

  const costCurrent =
    norm.unit_price != null
      ? computeEffectiveUsableCost(norm.unit_price, metaCurrent, structuredCurrent, norm.name)
      : null;
  const costProposed =
    norm.unit_price != null
      ? computeEffectiveUsableCost(norm.unit_price, metaProposed, structuredProposed, norm.name)
      : null;

  const procCurrent = recipeOperationalCostFieldsFromInvoiceLine(metaCurrent);
  const procProposed = recipeOperationalCostFieldsFromInvoiceLine(metaProposed);

  const purchaseQtyCurrent = resolveCountablePurchaseQuantityForCost(metaCurrent, structuredCurrent);
  const purchaseQtyProposed = resolveCountablePurchaseQuantityForCost(metaProposed, structuredProposed);

  const usableCurrent = structuredCurrent.normalizedUsableQuantity;
  const usableProposed = structuredProposed.normalizedUsableQuantity;
  const usableUnitCurrent = structuredCurrent.usableQuantityUnit;
  const usableUnitProposed = structuredProposed.usableQuantityUnit;

  const structure = parsePurchaseStructureFromText(norm.name);
  let usableChainCurrent = null;
  let usableChainProposed = null;
  if (structure) {
    usableChainCurrent = computeUsableFromPurchaseStructure(structure, norm.quantity, currentUnit);
    usableChainProposed = computeUsableFromPurchaseStructure(structure, norm.quantity, proposedUnit);
  }

  const displayDiffers = labelCurrent !== labelProposed;
  const usableDiffers =
    usableCurrent !== usableProposed ||
    usableUnitCurrent !== usableUnitProposed ||
    (usableChainCurrent &&
      usableChainProposed &&
      (usableChainCurrent.usableQuantity !== usableChainProposed.usableQuantity ||
        usableChainCurrent.usableUnit !== usableChainProposed.usableUnit));
  const costDiffers =
    (costCurrent?.cost ?? null) !== (costProposed?.cost ?? null) ||
    (costCurrent?.unit ?? null) !== (costProposed?.unit ?? null);
  const procDiffers =
    (procCurrent?.purchase_quantity ?? null) !== (procProposed?.purchase_quantity ?? null) ||
    (procCurrent?.cost_base_unit ?? null) !== (procProposed?.cost_base_unit ?? null) ||
    (procCurrent?.current_price ?? null) !== (procProposed?.current_price ?? null);
  const purchaseQtyDiffers = purchaseQtyCurrent !== purchaseQtyProposed;

  let impact = "NONE";
  if (usableDiffers || costDiffers || procDiffers || purchaseQtyDiffers) {
    impact = "CALCULATION_RISK";
  } else if (displayDiffers) {
    impact = "DISPLAY_ONLY";
  }

  return {
    impact,
    labelCurrent,
    labelProposed,
    usableCurrent,
    usableProposed,
    usableUnitCurrent,
    usableUnitProposed,
    costCurrent,
    costProposed,
    procCurrent,
    procProposed,
    purchaseQtyCurrent,
    purchaseQtyProposed,
    displayDiffers,
    usableDiffers,
    costDiffers,
    procDiffers,
    purchaseQtyDiffers,
  };
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
    const { data, error } = await sb
      .from("invoices")
      .select("id,supplier_name")
      .in("id", slice);
    if (error) throw new Error(error.message);
    for (const inv of data ?? []) {
      invById.set(inv.id, { supplier_name: inv.supplier_name });
    }
  }
  return invById;
}

mkdirSync(OUT, { recursive: true });

const allItems = await fetchAllInvoiceItems();
const invById = await fetchInvoices([...new Set(allItems.map((i) => i.invoice_id))]);

type RowResult = {
  invoiceItemId: string;
  invoiceId: string;
  supplier: string;
  product: string;
  dbQuantity: number | null;
  dbUnit: string | null;
  structuredKind: string;
  currentResolvedUnit: string | null;
  currentResolutionSource: string;
  nullOcrResolvedUnit: string | null;
  nullOcrResolutionSource: string;
  proposedInferUnUnit: string | null;
  unitWouldChangeVsCurrent: boolean;
  unitWouldChangeVsNullOcrBaseline: boolean;
  isCounterWeightPriced: boolean;
  isIntegerQtyGt1: boolean;
  matchesProposedGate: boolean;
  incorrectlyGetsUn: boolean;
  impactIfProposed: string;
  impactDetails: Record<string, unknown>;
};

const rows: RowResult[] = [];

for (const item of allItems) {
  const norm = normalizeInvoiceItemFields(item);
  const qty = norm.quantity == null ? null : Number(norm.quantity);

  const structuredDb = resolveInvoiceLinePurchaseFormat({
    name: norm.name,
    quantity: norm.quantity,
    unit: norm.unit,
  });
  const structuredNullOcr = resolveInvoiceLinePurchaseFormat({
    name: norm.name,
    quantity: norm.quantity,
    unit: null,
  });

  const currentResolved = resolveInvoicePersistedItemUnit(
    { name: norm.name, quantity: norm.quantity, unit: norm.unit },
    defaultIsGenericUnit,
  );
  const currentRes = resolveInvoiceLinePurchaseUnit(
    { name: norm.name, quantity: norm.quantity, unit: norm.unit },
    defaultIsGenericUnit,
  );

  const nullOcrItem = { name: norm.name, quantity: norm.quantity, unit: null as string | null };
  const nullOcrResolved = resolveInvoicePersistedItemUnit(nullOcrItem, defaultIsGenericUnit);
  const nullOcrRes = resolveInvoiceLinePurchaseUnit(nullOcrItem, defaultIsGenericUnit);

  const proposedUnit = simulateProposedInferUn(nullOcrItem, structuredNullOcr.kind);

  const matchesGate =
    (norm.unit == null || norm.unit.trim() === "") &&
    structuredNullOcr.kind === "weight_or_volume" &&
    qty != null &&
    qty > 1;

  const impact = assessCalcImpact(norm, currentResolved, proposedUnit);

  const incorrectlyGetsUn =
    proposedUnit === "un" &&
    structuredNullOcr.kind === "weight_or_volume" &&
    qty != null &&
    qty > 1 &&
    // would be wrong if row is actually weight-denominated purchase (kg bulk, counter-weight)
    (isCounterWeightPriced(qty) ||
      /\b\d+(?:[.,]\d+)?\s*kg\b/i.test(norm.name) && !/\*\d+|\d+\s*x\s*\d/i.test(norm.name));

  rows.push({
    invoiceItemId: item.id,
    invoiceId: item.invoice_id,
    supplier: invById.get(item.invoice_id)?.supplier_name ?? "unknown",
    product: norm.name,
    dbQuantity: qty,
    dbUnit: norm.unit,
    structuredKind: structuredDb.kind,
    structuredKindNullOcr: structuredNullOcr.kind,
    currentResolvedUnit: currentResolved,
    currentResolutionSource: currentRes.source,
    nullOcrResolvedUnit: nullOcrResolved,
    nullOcrResolutionSource: nullOcrRes.source,
    proposedInferUnUnit: proposedUnit,
    unitWouldChangeVsCurrent: currentResolved !== proposedUnit,
    unitWouldChangeVsNullOcrBaseline: nullOcrResolved !== proposedUnit,
    isCounterWeightPriced: isCounterWeightPriced(qty),
    isIntegerQtyGt1: qty != null && Number.isInteger(qty) && qty > 1,
    matchesProposedGate: matchesGate,
    incorrectlyGetsUn,
    impactIfProposed: impact.impact,
    impactDetails: impact,
  } as RowResult & { structuredKindNullOcr: string });
}

// Focus products
function findFocus(patterns: { key: string; pattern: RegExp; label: string }[]) {
  return patterns.map((p) => {
    const row = rows.find((r) => p.pattern.test(r.product));
    return row ? { ...p, row } : { ...p, row: null };
  });
}

const needsFix = findFocus(NEEDS_FIX);
const mustNotRegress = findFocus(MUST_NOT_REGRESS);

// Corpus analysis: rows that would get "un" under proposed rule with null OCR
const proposedUnRows = rows.filter((r) => r.proposedInferUnUnit === "un" && r.nullOcrResolvedUnit !== "un");
const proposedUnFromGate = rows.filter(
  (r) =>
    r.structuredKindNullOcr === "weight_or_volume" &&
    r.dbQuantity != null &&
    r.dbQuantity > 1 &&
    (r.dbUnit == null || r.dbUnit.trim() === ""),
);

// Simulate null OCR across full corpus for weight_or_volume + qty>1
const nullOcrWeightVolGt1 = rows.filter((r) => {
  const qty = r.dbQuantity;
  return (
    (r as RowResult & { structuredKindNullOcr: string }).structuredKindNullOcr ===
      "weight_or_volume" && qty != null && qty > 1
  );
});

const calcRiskRows = rows.filter((r) => r.impactIfProposed === "CALCULATION_RISK" && r.unitWouldChangeVsCurrent);

const regressionMatrix = mustNotRegress.map((m) => ({
  product: m.label,
  key: m.key,
  found: m.row != null,
  dbUnit: m.row?.dbUnit ?? null,
  dbQuantity: m.row?.dbQuantity ?? null,
  structuredKind: m.row?.structuredKind ?? null,
  structuredKindNullOcr: (m.row as (typeof rows)[0] & { structuredKindNullOcr?: string })
    ?.structuredKindNullOcr ?? null,
  currentResolvedUnit: m.row?.currentResolvedUnit ?? null,
  nullOcrResolvedUnit: m.row?.nullOcrResolvedUnit ?? null,
  proposedInferUnUnit: m.row?.proposedInferUnUnit ?? null,
  wouldChangeVsCurrent: m.row?.unitWouldChangeVsCurrent ?? null,
  wouldChangeUnderNullOcr: m.row?.nullOcrResolvedUnit !== m.row?.proposedInferUnUnit,
  impactIfProposed: m.row?.impactIfProposed ?? null,
  isCounterWeightPriced: m.row?.isCounterWeightPriced ?? null,
}));

const needsFixMatrix = needsFix.map((m) => ({
  product: m.label,
  key: m.key,
  found: m.row != null,
  dbUnit: m.row?.dbUnit ?? null,
  currentResolvedUnit: m.row?.currentResolvedUnit ?? null,
  proposedInferUnUnit: m.row?.proposedInferUnUnit ?? null,
  fixesGap: m.row?.proposedInferUnUnit === "un" && m.row?.currentResolvedUnit == null,
}));

// Verdict logic
const guanciale = rows.find((r) => /guanciale/i.test(r.product));
const falsePositiveCandidates = nullOcrWeightVolGt1.filter(
  (r) =>
    r.proposedInferUnUnit === "un" &&
    !NEEDS_FIX.some((n) => n.pattern.test(r.product)) &&
    r.currentResolvedUnit !== "un",
);

const output = {
  generatedAt: new Date().toISOString(),
  validationLab: VL,
  mode: "STRICT_READ_ONLY_INFER_UN_SAFETY",
  proposedRule:
    "OCR unit null AND structured.kind === weight_or_volume AND quantity > 1 → infer un",
  corpus: {
    totalItems: rows.length,
    weightOrVolumeNullOcrQtyGt1: nullOcrWeightVolGt1.length,
    proposedWouldInferUn: proposedUnRows.length,
    dbRowsMatchingGate: proposedUnFromGate.length,
    calcRiskIfProposed: calcRiskRows.length,
    displayOnlyChanges: rows.filter((r) => r.impactIfProposed === "DISPLAY_ONLY" && r.unitWouldChangeVsCurrent)
      .length,
  },
  needsFixMatrix,
  regressionMatrix,
  guancialeDeepDive: guanciale
    ? {
        product: guanciale.product,
        dbQuantity: guanciale.dbQuantity,
        dbUnit: guanciale.dbUnit,
        isCounterWeightPriced: guanciale.isCounterWeightPriced,
        structuredKindDb: guanciale.structuredKind,
        structuredKindNullOcr: (guanciale as RowResult & { structuredKindNullOcr: string })
          .structuredKindNullOcr,
        currentResolvedUnit: guanciale.currentResolvedUnit,
        nullOcrResolvedUnit: guanciale.nullOcrResolvedUnit,
        proposedInferUnUnit: guanciale.proposedInferUnUnit,
        gateWouldFireUnderNullOcr:
          (guanciale as RowResult & { structuredKindNullOcr: string }).structuredKindNullOcr ===
            "weight_or_volume" && guanciale.dbQuantity != null && guanciale.dbQuantity > 1,
        impactIfProposed: guanciale.impactIfProposed,
        impactDetails: guanciale.impactDetails,
        note: "Billed-weight path: non-integer qty 5.996 kg; name embeds 1,5kg*7 multipack marker",
      }
    : null,
  falsePositiveCandidates: falsePositiveCandidates.map((r) => ({
    product: r.product,
    supplier: r.supplier,
    dbQuantity: r.dbQuantity,
    dbUnit: r.dbUnit,
    structuredKindNullOcr: (r as RowResult & { structuredKindNullOcr: string }).structuredKindNullOcr,
    currentResolvedUnit: r.currentResolvedUnit,
    proposedInferUnUnit: r.proposedInferUnUnit,
    isCounterWeightPriced: r.isCounterWeightPriced,
    impactIfProposed: r.impactIfProposed,
  })),
  allRows: rows,
};

writeFileSync(`${OUT}/results.json`, JSON.stringify(output, null, 2));
console.log(JSON.stringify({
  total: rows.length,
  proposedUnRows: proposedUnRows.length,
  dbGateMatches: proposedUnFromGate.length,
  calcRisk: calcRiskRows.length,
  guancialeKind: guanciale?.structuredKind,
  guancialeProposed: guanciale?.proposedInferUnUnit,
}, null, 2));
