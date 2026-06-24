/**
 * STRICT READ-ONLY Missing Purchase Unit Population Audit — VL bjhnlrgodcqoyzddbpbd
 * Scans ALL invoice_items: quantity > 1 AND unit IS NULL
 */
const metaEnv = import.meta as { env?: Record<string, unknown> };
if (!metaEnv.env) metaEnv.env = {};
metaEnv.env.DEV = false;
metaEnv.env.PROD = true;

import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
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
  resolveInvoiceLinePricingPresentation,
} from "../../src/lib/invoice-purchase-price-semantics.ts";
import {
  computeUsableFromPurchaseStructure,
  isGenericPurchaseUnit,
  parsePurchaseStructureFromText,
} from "../../src/lib/stock-normalization.ts";

const VL = "bjhnlrgodcqoyzddbpbd";
const OUT = ".tmp/missing-unit-population-audit";
const EMPORIO_LIVE = "ab52796d-de1d-418d-86e7-230c8f056f09";

type UnitClassification = "correctly_null" | "expected_un" | "expected_cx" | "unknown";
type ImpactLevel = "NONE" | "DISPLAY_ONLY" | "CALCULATION_RISK";

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

async function fetchAllInvoiceItems() {
  const pageSize = 1000;
  let offset = 0;
  const all: Array<{
    id: string;
    invoice_id: string;
    name: string;
    quantity: number | null;
    unit: string | null;
    unit_price: number | null;
    total: number | null;
  }> = [];

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
  const invById = new Map<string, { supplier_name: string | null; invoice_date: string | null }>();
  const chunk = 50;
  for (let i = 0; i < ids.length; i += chunk) {
    const slice = ids.slice(i, i + chunk);
    const { data, error } = await sb
      .from("invoices")
      .select("id,supplier_name,invoice_date")
      .in("id", slice);
    if (error) throw new Error(error.message);
    for (const inv of data ?? []) {
      invById.set(inv.id, { supplier_name: inv.supplier_name, invoice_date: inv.invoice_date });
    }
  }
  return invById;
}

function normalizeToken(unit: string | null | undefined): string | null {
  if (!unit?.trim()) return null;
  return unit.trim().toLowerCase().replace(/\./g, "");
}

const PACK_ROW_UNITS = new Set(["cx", "caixa", "caixas", "case", "cases", "pack", "packs"]);
const COUNTABLE_EMBEDDED = /\d+(?:[.,]\d+)?\s*(?:g|kg|ml|cl|l|lt|litro)\b/i;
const MULTIPACK_MARKER = /(?:\d+\s*(?:x|×|\*)\s*\d+|\d+\s*(?:cl|ml|g|kg)\s*[*×x]\s*\d+|cx\s+\d+)/i;
const BILLED_WEIGHT = /\b(?:kg|kilo)\b/i;

function detectFamilyPattern(name: string, structuredKind: string): string {
  if (/\d+\s*kg\b/i.test(name) && !MULTIPACK_MARKER.test(name)) return "kg_bulk";
  if (/\d+\s*g\b/i.test(name) && !MULTIPACK_MARKER.test(name)) return "embedded_g";
  if (/\d+(?:[.,]\d+)?\s*cl\b/i.test(name)) return "embedded_cl";
  if (MULTIPACK_MARKER.test(name)) return "multipack_named";
  if (/\b(?:cx|caixa|case)\b/i.test(name)) return "packaged_cx";
  if (structuredKind === "multi_unit_pack") return "multipack_structured";
  if (structuredKind === "unit_count") return "countable";
  if (structuredKind === "weight_or_volume") return "weight_or_volume";
  return "other";
}

function classifyNullUnitRow(
  name: string,
  qty: number,
  structured: ReturnType<typeof resolveInvoiceLinePurchaseFormat>,
  purchaseUnitRes: ReturnType<typeof resolveInvoiceLinePurchaseUnit>,
): { classification: UnitClassification; reason: string } {
  const kind = structured.kind;
  const rowUnitWouldBe = purchaseUnitRes.unit;
  const rowUnitSource = purchaseUnitRes.source;

  // Billed-by-weight rows: qty is kg, null unit may be correct
  if (BILLED_WEIGHT.test(name) && qty < 50 && !/\d+\s*x\s*\d+/i.test(name)) {
    const structure = parsePurchaseStructureFromText(name);
    if (structure?.tier === "size_count" && structure.unitMeasurement === "kg") {
      return { classification: "correctly_null", reason: "billed weight (kg) row; measure in name not purchase denomination" };
    }
  }

  // multi_unit_pack with cx container but null OCR — likely cx
  if (kind === "multi_unit_pack") {
    const container = structured.purchaseContainerUnit?.toLowerCase();
    if (container && PACK_ROW_UNITS.has(container)) {
      return { classification: "expected_cx", reason: `multi_unit_pack container=${container}; OCR unit null` };
    }
    if (qty > 1 && qty <= 10) {
      return { classification: "expected_cx", reason: "multi_unit_pack low outer qty; likely cases" };
    }
    return { classification: "expected_un", reason: "multi_unit_pack infers countable units" };
  }

  // Countable with embedded measure, no multipack marker — Paccheri/Ginger family
  if (
    kind === "weight_or_volume" &&
    COUNTABLE_EMBEDDED.test(name) &&
    !MULTIPACK_MARKER.test(name) &&
    qty >= 2 &&
    rowUnitSource === "fallback_null"
  ) {
    return {
      classification: "expected_un",
      reason: "embedded measure in name + qty>1 countable; resolver fallback_null",
    };
  }

  if (kind === "unit_count" && rowUnitSource === "fallback_null") {
    return { classification: "expected_un", reason: "unit_count structured row; OCR unit null" };
  }

  if (/\b(?:cx|caixa|case)\b/i.test(name) && qty >= 1) {
    return { classification: "expected_cx", reason: "name mentions case/cx container" };
  }

  if (kind === "container_with_size" && qty > 1) {
    return { classification: "expected_un", reason: "container_with_size countable outer qty" };
  }

  if (kind === "inferred" || kind === "row_only") {
    return { classification: "unknown", reason: `weak structure kind=${kind}` };
  }

  return { classification: "unknown", reason: `kind=${kind}; no strong signal` };
}

function assessImpact(
  item: { name: string; quantity: number | null; unit: string | null; unit_price: number | null; total: number | null },
): {
  impact: ImpactLevel;
  details: Record<string, unknown>;
} {
  const norm = normalizeInvoiceItemFields(item);
  const structuredNull = resolveInvoiceLinePurchaseFormat({
    name: norm.name,
    quantity: norm.quantity,
    unit: norm.unit,
  });
  const structuredUn = resolveInvoiceLinePurchaseFormat({
    name: norm.name,
    quantity: norm.quantity,
    unit: "un",
  });

  const labelNull = formatRowPurchaseQuantityLabel({
    name: norm.name,
    quantity: norm.quantity,
    unit: norm.unit,
    unit_price: norm.unit_price,
    line_total: norm.total,
  });
  const labelUn = formatRowPurchaseQuantityLabel({
    name: norm.name,
    quantity: norm.quantity,
    unit: "un",
    unit_price: norm.unit_price,
    line_total: norm.total,
  });

  const metaNull = {
    name: norm.name,
    quantity: norm.quantity,
    unit: norm.unit,
    unit_price: norm.unit_price,
    line_total: norm.total,
  };
  const metaUn = { ...metaNull, unit: "un" };

  const usableNull = structuredNull.normalizedUsableQuantity;
  const usableUn = structuredUn.normalizedUsableQuantity;
  const usableUnitNull = structuredNull.usableQuantityUnit;
  const usableUnitUn = structuredUn.usableQuantityUnit;

  const costNull = norm.unit_price != null
    ? computeEffectiveUsableCost(norm.unit_price, metaNull, structuredNull, norm.name)
    : null;
  const costUn = norm.unit_price != null
    ? computeEffectiveUsableCost(norm.unit_price, metaUn, structuredUn, norm.name)
    : null;

  const procNull = recipeOperationalCostFieldsFromInvoiceLine(metaNull);
  const procUn = recipeOperationalCostFieldsFromInvoiceLine(metaUn);

  const purchaseQtyNull = resolveCountablePurchaseQuantityForCost(metaNull, structuredNull);
  const purchaseQtyUn = resolveCountablePurchaseQuantityForCost(metaUn, structuredUn);

  const structure = parsePurchaseStructureFromText(norm.name);
  let usableChainNull = null;
  let usableChainUn = null;
  if (structure) {
    usableChainNull = computeUsableFromPurchaseStructure(structure, norm.quantity, norm.unit);
    usableChainUn = computeUsableFromPurchaseStructure(structure, norm.quantity, "un");
  }

  const displayDiffers = labelNull !== labelUn;
  const usableDiffers =
    usableNull !== usableUn ||
    usableUnitNull !== usableUnitUn ||
    (usableChainNull && usableChainUn &&
      (usableChainNull.usableQuantity !== usableChainUn.usableQuantity ||
        usableChainNull.usableUnit !== usableChainUn.usableUnit));
  const costDiffers =
    (costNull?.cost ?? null) !== (costUn?.cost ?? null) ||
    (costNull?.unit ?? null) !== (costUn?.unit ?? null);
  const procDiffers =
    (procNull?.purchase_quantity ?? null) !== (procUn?.purchase_quantity ?? null) ||
    (procNull?.cost_base_unit ?? null) !== (procUn?.cost_base_unit ?? null) ||
    (procNull?.current_price ?? null) !== (procUn?.current_price ?? null);
  const purchaseQtyDiffers = purchaseQtyNull !== purchaseQtyUn;

  let impact: ImpactLevel = "NONE";
  if (usableDiffers || costDiffers || procDiffers || purchaseQtyDiffers) {
    impact = "CALCULATION_RISK";
  } else if (displayDiffers) {
    impact = "DISPLAY_ONLY";
  }

  return {
    impact,
    details: {
      labelNull,
      labelUn,
      usableNull,
      usableUn,
      usableUnitNull,
      usableUnitUn,
      usableChainNull: usableChainNull
        ? { qty: usableChainNull.usableQuantity, unit: usableChainNull.usableUnit, source: usableChainNull.usableSource }
        : null,
      usableChainUn: usableChainUn
        ? { qty: usableChainUn.usableQuantity, unit: usableChainUn.usableUnit, source: usableChainUn.usableSource }
        : null,
      costNull,
      costUn,
      procNull,
      procUn,
      purchaseQtyNull,
      purchaseQtyUn,
      displayDiffers,
      usableDiffers,
      costDiffers,
      procDiffers,
      purchaseQtyDiffers,
    },
  };
}

mkdirSync(OUT, { recursive: true });

const allItems = await fetchAllInvoiceItems();
const invoiceIds = [...new Set(allItems.map((i) => i.invoice_id))];
const invById = await fetchInvoices(invoiceIds);

const nullUnitGt1 = allItems.filter((i) => {
  const qty = i.quantity == null ? 0 : Number(i.quantity);
  return qty > 1 && (i.unit == null || i.unit.trim() === "");
});

type AuditRow = {
  invoiceItemId: string;
  invoiceId: string;
  invoice: string;
  supplier: string;
  product: string;
  quantity: number;
  unit: string | null;
  structuredKind: string;
  purchaseUnitResolution: string;
  classification: UnitClassification;
  classificationReason: string;
  familyPattern: string;
  impact: ImpactLevel;
  impactDetails: Record<string, unknown>;
  wouldResolveUn: string | null;
  emporioKey: boolean;
};

const auditRows: AuditRow[] = [];

for (const item of nullUnitGt1) {
  const norm = normalizeInvoiceItemFields(item);
  const qty = Number(norm.quantity);
  const structured = resolveInvoiceLinePurchaseFormat({
    name: norm.name,
    quantity: norm.quantity,
    unit: norm.unit,
  });
  const purchaseUnitRes = resolveInvoiceLinePurchaseUnit(
    { name: norm.name, quantity: norm.quantity, unit: norm.unit },
    defaultIsGenericUnit,
  );
  const { classification, reason } = classifyNullUnitRow(norm.name, qty, structured, purchaseUnitRes);
  const { impact, details } = assessImpact(item);
  const wouldResolveUn = resolveInvoicePersistedItemUnit(
    { name: norm.name, quantity: norm.quantity, unit: "un" },
    defaultIsGenericUnit,
  );
  const inv = invById.get(item.invoice_id);

  auditRows.push({
    invoiceItemId: item.id,
    invoiceId: item.invoice_id,
    invoice: item.invoice_id.slice(0, 8),
    supplier: inv?.supplier_name ?? "unknown",
    product: norm.name,
    quantity: qty,
    unit: norm.unit,
    structuredKind: structured.kind,
    purchaseUnitResolution: purchaseUnitRes.source,
    classification,
    classificationReason: reason,
    familyPattern: detectFamilyPattern(norm.name, structured.kind),
    impact,
    impactDetails: details,
    wouldResolveUn,
    emporioKey: item.invoice_id === EMPORIO_LIVE,
  });
}

// Frequency across ALL items
const totalItems = allItems.length;
const unitPresent = allItems.filter((i) => i.unit != null && i.unit.trim() !== "").length;
const unitNull = allItems.filter((i) => i.unit == null || i.unit.trim() === "").length;
const unitNullGt1 = nullUnitGt1.length;

// Classify all null-unit rows (any qty) for extended stats
const allNullRows = allItems.filter((i) => i.unit == null || i.unit.trim() === "");
let allNullExpectedUn = 0;
let allNullExpectedCx = 0;
let allNullCorrect = 0;
let allNullUnknown = 0;
for (const item of allNullRows) {
  const norm = normalizeInvoiceItemFields(item);
  const structured = resolveInvoiceLinePurchaseFormat({
    name: norm.name,
    quantity: norm.quantity,
    unit: norm.unit,
  });
  const purchaseUnitRes = resolveInvoiceLinePurchaseUnit(
    { name: norm.name, quantity: norm.quantity, unit: norm.unit },
    defaultIsGenericUnit,
  );
  const qty = norm.quantity == null ? 0 : Number(norm.quantity);
  const { classification } = classifyNullUnitRow(norm.name, qty, structured, purchaseUnitRes);
  if (classification === "expected_un") allNullExpectedUn++;
  else if (classification === "expected_cx") allNullExpectedCx++;
  else if (classification === "correctly_null") allNullCorrect++;
  else allNullUnknown++;
}

const freqTable = {
  category: "ALL invoice_items (VL)",
  totalItems,
  unitPresent,
  unitNull,
  unitNullQtyGt1: unitNullGt1,
  nullExpectedUn: auditRows.filter((r) => r.classification === "expected_un").length,
  nullExpectedCx: auditRows.filter((r) => r.classification === "expected_cx").length,
  nullCorrectlyNull: auditRows.filter((r) => r.classification === "correctly_null").length,
  nullUnknown: auditRows.filter((r) => r.classification === "unknown").length,
  allNullRows: {
    total: allNullRows.length,
    expectedUn: allNullExpectedUn,
    expectedCx: allNullExpectedCx,
    correctlyNull: allNullCorrect,
    unknown: allNullUnknown,
  },
};

// Family analysis
const familyGroups = new Map<string, AuditRow[]>();
for (const row of auditRows) {
  const key = row.familyPattern;
  if (!familyGroups.has(key)) familyGroups.set(key, []);
  familyGroups.get(key)!.push(row);
}

const familyAnalysis = Object.fromEntries(
  [...familyGroups.entries()]
    .sort((a, b) => b[1].length - a[1].length)
    .map(([pattern, rows]) => [
      pattern,
      {
        count: rows.length,
        products: rows.map((r) => r.product),
        invoices: [...new Set(rows.map((r) => r.supplier))],
        classifications: Object.fromEntries(
          ["expected_un", "expected_cx", "correctly_null", "unknown"].map((c) => [
            c,
            rows.filter((r) => r.classification === c).length,
          ]),
        ),
        impacts: Object.fromEntries(
          ["NONE", "DISPLAY_ONLY", "CALCULATION_RISK"].map((c) => [
            c,
            rows.filter((r) => r.impact === c).length,
          ]),
        ),
      },
    ]),
);

const impactSummary = {
  NONE: auditRows.filter((r) => r.impact === "NONE").length,
  DISPLAY_ONLY: auditRows.filter((r) => r.impact === "DISPLAY_ONLY").length,
  CALCULATION_RISK: auditRows.filter((r) => r.impact === "CALCULATION_RISK").length,
};

// Verdict logic
const expectedUnRows = auditRows.filter((r) => r.classification === "expected_un");
const paccheriGingerFamily = expectedUnRows.filter(
  (r) => r.familyPattern === "embedded_g" || r.familyPattern === "embedded_cl",
);
const uniqueInvoicesAffected = new Set(expectedUnRows.map((r) => r.invoiceId)).size;
const uniqueSuppliersAffected = new Set(expectedUnRows.map((r) => r.supplier)).size;

let scopeVerdict: "Isolated" | "Small family" | "Widespread";
let scopeRationale: string;

if (unitNullGt1 <= 2 && expectedUnRows.length <= 2) {
  scopeVerdict = "Isolated";
  scopeRationale = `Only ${unitNullGt1} qty>1 null-unit rows; all expected_un are Paccheri/Ginger pattern on Emporio`;
} else if (
  unitNullGt1 <= 10 &&
  uniqueInvoicesAffected <= 2 &&
  paccheriGingerFamily.length === expectedUnRows.length
) {
  scopeVerdict = "Small family";
  scopeRationale = `${unitNullGt1} qty>1 null-unit rows across ${uniqueInvoicesAffected} invoice(s); embedded measure countable pattern`;
} else if (unitNullGt1 > 10 || uniqueInvoicesAffected > 3) {
  scopeVerdict = "Widespread";
  scopeRationale = `${unitNullGt1} qty>1 null-unit rows across ${uniqueInvoicesAffected} invoices / ${uniqueSuppliersAffected} suppliers`;
} else {
  scopeVerdict = expectedUnRows.length <= 3 && uniqueInvoicesAffected <= 1 ? "Isolated" : "Small family";
  scopeRationale = `${unitNullGt1} affected rows, ${expectedUnRows.length} expected_un, ${uniqueInvoicesAffected} invoices`;
}

// Priority
let priority: "A" | "B" | "C";
let priorityRationale: string;
if (impactSummary.CALCULATION_RISK > 0) {
  priority = "A";
  priorityRationale = `${impactSummary.CALCULATION_RISK} row(s) show usable/cost divergence null vs un — fix before Invoice Editing`;
} else if (impactSummary.DISPLAY_ONLY > 0 && expectedUnRows.length > 0) {
  priority = "B";
  priorityRationale = `All impacts DISPLAY_ONLY (Last Purchase label); no calculation divergence — fix after Invoice Editing`;
} else {
  priority = "C";
  priorityRationale = "No material impact detected on audited rows";
}

const results = {
  generatedAt: new Date().toISOString(),
  validationLab: VL,
  mode: "STRICT_READ_ONLY_MISSING_UNIT_POPULATION_AUDIT",
  scope: {
    totalInvoiceItems: totalItems,
    totalInvoices: invoiceIds.length,
    qtyGt1UnitNull: unitNullGt1,
    emporioInvoice: EMPORIO_LIVE,
  },
  task1_nullUnitGt1Scan: auditRows.map((r) => ({
    invoice: r.invoice,
    invoiceId: r.invoiceId,
    supplier: r.supplier,
    product: r.product,
    quantity: r.quantity,
    unit: r.unit,
  })),
  task2_classification: auditRows.map((r) => ({
    invoiceItemId: r.invoiceItemId,
    product: r.product,
    quantity: r.quantity,
    classification: r.classification,
    reason: r.classificationReason,
    structuredKind: r.structuredKind,
    purchaseUnitResolution: r.purchaseUnitResolution,
  })),
  task3_frequencyTable: freqTable,
  task4_familyAnalysis: familyAnalysis,
  task5_impactPerRow: auditRows.map((r) => ({
    invoiceItemId: r.invoiceItemId,
    product: r.product,
    impact: r.impact,
    labelNull: r.impactDetails.labelNull,
    labelUn: r.impactDetails.labelUn,
    usableDiffers: r.impactDetails.usableDiffers,
    costDiffers: r.impactDetails.costDiffers,
    procDiffers: r.impactDetails.procDiffers,
  })),
  task5_impactSummary: impactSummary,
  task6_priority: {
    choice: priority,
    label:
      priority === "A"
        ? "Fix before Invoice Editing"
        : priority === "B"
          ? "Fix after Invoice Editing"
          : "Backlog only",
    rationale: priorityRationale,
  },
  verdict: {
    scope: scopeVerdict,
    rationale: scopeRationale,
    paccheriGingerInLargerFamily:
      paccheriGingerFamily.length > 0 && expectedUnRows.length > paccheriGingerFamily.length,
    paccheriGingerCount: paccheriGingerFamily.length,
    totalExpectedUn: expectedUnRows.length,
    uniqueInvoicesWithNullGt1: uniqueInvoicesAffected,
    uniqueSuppliersWithNullGt1: uniqueSuppliersAffected,
  },
  priorAudits: [
    ".tmp/invoice-unit-persistence-audit/",
    ".tmp/purchase-unit-representation-audit/",
    ".tmp/outer-quantity-population-audit/",
  ],
  rows: auditRows,
};

writeFileSync(join(OUT, "results.json"), JSON.stringify(results, null, 2));
console.log(
  JSON.stringify(
    {
      totalItems,
      nullGt1: unitNullGt1,
      verdict: scopeVerdict,
      priority,
      impactSummary,
      families: Object.keys(familyAnalysis),
    },
    null,
    2,
  ),
);
