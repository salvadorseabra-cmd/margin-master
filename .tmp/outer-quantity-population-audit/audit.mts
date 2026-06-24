/**
 * STRICT READ-ONLY Outer Quantity Population Audit — VL bjhnlrgodcqoyzddbpbd
 * Classifies qty>1 structured invoice lines: SAFE / BROKEN / SUSPICIOUS
 */
const metaEnv = import.meta as { env?: Record<string, unknown> };
if (!metaEnv.env) metaEnv.env = {};
metaEnv.env.DEV = false;
metaEnv.env.PROD = true;

import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import {
  bindMonetaryColumns,
  parseMonetaryLineItems,
} from "../../supabase/functions/extract-invoice/invoice-monetary-binding.ts";
import { normalizeInvoiceItemFields } from "../../src/lib/invoice-item-fields.ts";
import { resolveInvoiceLinePurchaseFormat } from "../../src/lib/invoice-purchase-format.ts";
import {
  computeUsableFromPurchaseStructure,
  isGenericPurchaseUnit,
  parsePurchaseStructureFromText,
  resolveStructurePurchaseQuantity,
  summarizePurchaseStructure,
  type PurchaseStructure,
} from "../../src/lib/stock-normalization.ts";

const VL = "bjhnlrgodcqoyzddbpbd";
const OUT = ".tmp/outer-quantity-population-audit";

const VL_INVOICES = [
  "da472b7f-0fd9-4a26-a37c-80ad335f7f7e",
  "c2f52357-0f80-491a-ba14-c97ff4837472",
  "3b4cb21f-8b3f-45f3-9f2d-6f15e9f438a2",
  "f0aa5a08-86a3-4938-99f0-711e86073968",
  "ab52796d-de1d-418d-86e7-230c8f056f09",
  "36c99d19-6f9f-413f-8c2d-ae3526291a2d",
  "17aa3591-ec98-4c21-89c9-5ae946bc97bb",
];

type Status = "SAFE" | "BROKEN" | "SUSPICIOUS";

function projectKey(): string {
  const raw = execSync(`supabase projects api-keys --project-ref ${VL} -o json`, {
    encoding: "utf8",
  });
  return (JSON.parse(raw) as { name: string; api_key: string }[]).find(
    (k) => k.name === "service_role",
  )!.api_key;
}

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
  return bound;
}

function formatUsable(qty: number, unit: string): string {
  if (unit === "g") return qty >= 1000 ? `${(qty / 1000).toFixed(qty % 1000 === 0 ? 0 : 2)} kg` : `${qty} g`;
  if (unit === "ml") return qty >= 1000 ? `${(qty / 1000).toFixed(2)} L` : `${qty} ml`;
  return `${qty} ${unit}`;
}

function structureLabel(s: PurchaseStructure): string {
  const inner =
    s.innerUnitCount != null
      ? `${s.innerUnitCount}×${s.unitSize}${s.unitMeasurement}`
      : `${s.purchaseQuantity}×${s.unitSize}${s.unitMeasurement}`;
  return `${s.tier} [${s.matchedText?.trim()}] ${inner}`;
}

function structureTotalIsFinalForGenericRow(structure: PurchaseStructure, rowUnit: string | null): boolean {
  if (!isGenericPurchaseUnit(rowUnit)) return false;
  if (structure.tier === "count_size" || structure.tier === "units_size") return true;
  const hasInner = (structure.innerUnitCount ?? 1) > 1;
  return hasInner || structure.tier === "caixa_units_size" || structure.tier === "caixa_compact_size";
}

function shouldScaleOuterPackForSizeCountGenericRow(
  structure: PurchaseStructure,
  rowQuantity: number | null,
  rowUnit: string | null,
): boolean {
  if (structure.tier !== "size_count") return false;
  if (!isGenericPurchaseUnit(rowUnit)) return false;
  if (rowQuantity == null || !Number.isFinite(rowQuantity) || rowQuantity <= 1) return false;
  const inner = structure.innerUnitCount ?? 1;
  if (Math.abs(rowQuantity - inner) < 0.01) return false;
  return structure.unitMeasurement === "g";
}

/** Commercial outer-pack expectation: rowQty outer containers × one-pack structure total */
function expectedUsableWhenOuterPacks(
  structure: PurchaseStructure,
  rowQty: number,
  rowUnit: string | null,
): number | null {
  if (rowQty <= 1) return null;
  const inner = structure.innerUnitCount ?? structure.purchaseQuantity;
  // rowQty equals inner count → line is counted in inner units (Peroni 24 bottles)
  if (Math.abs(rowQty - inner) < 0.01) return structure.totalUsableAmount;
  if (!isGenericPurchaseUnit(rowUnit)) return null;
  // Guanciale-style billed kg — not outer-pack multiplication
  if (
    structure.tier === "size_count" &&
    structure.unitMeasurement === "kg" &&
    rowQty < inner &&
    Math.abs(rowQty - Math.round(rowQty)) > 0.001
  ) {
    return null;
  }
  return Math.round(structure.totalUsableAmount * rowQty);
}

function classifyRow(
  structure: PurchaseStructure,
  rowQty: number,
  rowUnit: string | null,
  currentUsable: number,
  usableChain: ReturnType<typeof computeUsableFromPurchaseStructure>,
): { status: Status; expected: number | null; reason: string } {
  const inner = structure.innerUnitCount ?? structure.purchaseQuantity;
  const isFinal = structureTotalIsFinalForGenericRow(structure, rowUnit);
  const wouldScaleG = shouldScaleOuterPackForSizeCountGenericRow(structure, rowQty, rowUnit);
  const expected = expectedUsableWhenOuterPacks(structure, rowQty, rowUnit);

  // Peroni pattern: row counted in inner units
  if (Math.abs(rowQty - inner) < 0.01 && structure.tier === "size_count") {
    if (Math.abs(currentUsable - structure.totalUsableAmount) < 1) {
      return { status: "SAFE", expected: structure.totalUsableAmount, reason: "rowQty === innerCount; structure_total is full line" };
    }
    return { status: "BROKEN", expected: structure.totalUsableAmount, reason: "rowQty === innerCount but usable mismatch" };
  }

  // qty=1 — one outer pack
  if (rowQty <= 1) {
    if (Math.abs(currentUsable - structure.totalUsableAmount) < 1) {
      return { status: "SAFE", expected: structure.totalUsableAmount, reason: "rowQty=1; one-pack structure_total" };
    }
    return { status: "BROKEN", expected: structure.totalUsableAmount, reason: "rowQty=1 but usable ≠ structure total" };
  }

  // g-scaling path fires → would be correct if implemented
  if (wouldScaleG && usableChain.usableSource === "structure_scaled_outer") {
    const exp = Math.round(structure.totalUsableAmount * rowQty);
    if (Math.abs(currentUsable - exp) < 1) {
      return { status: "SAFE", expected: exp, reason: "g outer-pack scaled" };
    }
  }

  if (expected == null) {
    return { status: "SUSPICIOUS", expected: null, reason: "non-outer-pack semantics (billed weight / ambiguous)" };
  }

  if (Math.abs(currentUsable - expected) < 1) {
    return { status: "SAFE", expected, reason: "rowQty × structure total matches" };
  }

  // Confirmed: structure_total gate + rowQty>1 + rowQty≠inner → under-count
  if (
    isFinal &&
    usableChain.usableSource === "structure_total" &&
    rowQty > 1 &&
    Math.abs(rowQty - inner) >= 0.01
  ) {
    return {
      status: "BROKEN",
      expected,
      reason: `structureTotalIsFinal gate; usable=${currentUsable} vs expected rowQty×pack=${expected}`,
    };
  }

  // Mezzi-style: extraction qty may be wrong — can't prove without PDF
  if (structure.tier === "size_count" && structure.unitMeasurement === "kg" && rowQty < inner) {
    return {
      status: "SUSPICIOUS",
      expected,
      reason: `rowQty(${rowQty}) < inner(${inner}); extraction ambiguity — usable may match 1 case`,
    };
  }

  if (Math.abs(currentUsable - structure.totalUsableAmount) < 1 && expected > structure.totalUsableAmount) {
    return {
      status: "BROKEN",
      expected,
      reason: "one-pack usable persisted; commercial expects outer multiplication",
    };
  }

  return { status: "SUSPICIOUS", expected, reason: "pattern inconclusive without re-ingest" };
}

const sb = createClient(`https://${VL}.supabase.co`, projectKey(), {
  auth: { persistSession: false },
});

const { data: items, error: itemsError } = await sb
  .from("invoice_items")
  .select("id,invoice_id,name,quantity,unit,unit_price,total")
  .in("invoice_id", VL_INVOICES);
if (itemsError) throw new Error(itemsError.message);

const { data: invoices } = await sb
  .from("invoices")
  .select("id,supplier_name")
  .in("id", VL_INVOICES);
const invById = new Map((invoices ?? []).map((i) => [i.id, i.supplier_name ?? i.id.slice(0, 8)]));

type AuditRow = {
  product: string;
  invoice: string;
  invoiceItemId: string;
  rowQty: number;
  rowUnit: string | null;
  structure: string;
  tier: string;
  innerUnitCount: number | null;
  unitMeasurement: string;
  currentUsable: string;
  currentUsableRaw: number;
  expectedUsable: string | null;
  expectedUsableRaw: number | null;
  status: Status;
  reason: string;
  usableSource: string;
  structureTotalIsFinal: boolean;
  shouldScaleG: boolean;
  focusProduct: boolean;
};

const rows: AuditRow[] = [];
const FOCUS = /pellegrino|peroni|açúcar|açucar|acucar|pomodori|nata|chocolate|mozzarella|mezzi|guanciale/i;

for (const item of items ?? []) {
  const norm = normalizeInvoiceItemFields(item as never);
  const bound = bindLine({
    name: norm.name,
    quantity: norm.quantity,
    unit: norm.unit,
    unit_price: norm.unit_price,
    total: norm.total,
  });
  const rowQty = bound.quantity ?? 0;
  if (rowQty <= 1) continue;

  const structure = parsePurchaseStructureFromText(bound.name);
  if (!structure) continue;

  const structured = resolveInvoiceLinePurchaseFormat({
    name: bound.name,
    quantity: bound.quantity,
    unit: bound.unit,
    unit_price: bound.unit_price,
    line_total: bound.total,
  });
  const usableChain = computeUsableFromPurchaseStructure(structure, bound.quantity, bound.unit);
  const currentRaw = structured.normalizedUsableQuantity ?? usableChain.usableQuantity;
  const currentUnit = structured.usableQuantityUnit ?? usableChain.usableUnit;
  if (currentRaw == null || !currentUnit) continue;

  const { status, expected, reason } = classifyRow(
    structure,
    rowQty,
    bound.unit,
    currentRaw,
    usableChain,
  );

  rows.push({
    product: bound.name,
    invoice: invById.get(item.invoice_id) ?? item.invoice_id.slice(0, 8),
    invoiceItemId: item.id,
    rowQty,
    rowUnit: bound.unit,
    structure: structureLabel(structure),
    tier: structure.tier,
    innerUnitCount: structure.innerUnitCount ?? null,
    unitMeasurement: structure.unitMeasurement,
    currentUsable: formatUsable(currentRaw, currentUnit),
    currentUsableRaw: currentRaw,
    expectedUsable: expected != null ? formatUsable(expected, currentUnit) : null,
    expectedUsableRaw: expected,
    status,
    reason,
    usableSource: usableChain.usableSource,
    structureTotalIsFinal: structureTotalIsFinalForGenericRow(structure, bound.unit),
    shouldScaleG: shouldScaleOuterPackForSizeCountGenericRow(structure, rowQty, bound.unit),
    focusProduct: FOCUS.test(bound.name),
  });
}

rows.sort((a, b) => {
  const order = { BROKEN: 0, SUSPICIOUS: 1, SAFE: 2 };
  return order[a.status] - order[b.status] || a.product.localeCompare(b.product);
});

const summary = {
  SAFE: rows.filter((r) => r.status === "SAFE").length,
  BROKEN: rows.filter((r) => r.status === "BROKEN").length,
  SUSPICIOUS: rows.filter((r) => r.status === "SUSPICIOUS").length,
  total: rows.length,
};

const familyByTier = {
  size_count: rows.filter((r) => r.tier === "size_count"),
  count_size: rows.filter((r) => r.tier === "count_size"),
  other: rows.filter((r) => r.tier !== "size_count" && r.tier !== "count_size"),
};

const brokenGatePattern = rows.filter(
  (r) =>
    r.status === "BROKEN" &&
    r.structureTotalIsFinal &&
    r.usableSource === "structure_total" &&
    r.rowQty > 1,
);

const results = {
  generatedAt: new Date().toISOString(),
  validationLab: VL,
  mode: "STRICT_READ_ONLY_OUTER_QUANTITY_POPULATION_AUDIT",
  hypothesis:
    "rowQty>1 + structured pack + structureTotalIsFinalForGenericRow → one-pack usable instead of rowQty×pack",
  scope: {
    invoiceItemsScanned: (items ?? []).length,
    qtyGt1StructuredLines: rows.length,
    invoices: VL_INVOICES.length,
  },
  familySummary: summary,
  familyByTier: {
    size_count: {
      total: familyByTier.size_count.length,
      SAFE: familyByTier.size_count.filter((r) => r.status === "SAFE").length,
      BROKEN: familyByTier.size_count.filter((r) => r.status === "BROKEN").length,
      SUSPICIOUS: familyByTier.size_count.filter((r) => r.status === "SUSPICIOUS").length,
    },
    count_size: {
      total: familyByTier.count_size.length,
      SAFE: familyByTier.count_size.filter((r) => r.status === "SAFE").length,
      BROKEN: familyByTier.count_size.filter((r) => r.status === "BROKEN").length,
      SUSPICIOUS: familyByTier.count_size.filter((r) => r.status === "SUSPICIOUS").length,
    },
  },
  brokenGatePattern: {
    count: brokenGatePattern.length,
    ids: brokenGatePattern.map((r) => r.invoiceItemId),
  },
  focusProducts: rows.filter((r) => r.focusProduct),
  classificationTable: rows.map((r) => ({
    product: r.product,
    invoice: r.invoice,
    rowQty: r.rowQty,
    structure: r.structure,
    currentUsable: r.currentUsable,
    expectedUsable: r.expectedUsable ?? "—",
    status: r.status,
  })),
  rows,
  verdict: {
    scope: "FAMILY — not Pellegrino-isolated",
    rationale:
      "BROKEN spans size_count (cl volume, g mass) and count_size (cx outer qty) when rowQty>1 and rowQty≠innerCount; structureTotalIsFinalForGenericRow prevents outer multiplication",
    ready: true,
  },
  priorAudits: [
    ".tmp/pellegrino-root-cause-audit/",
    ".tmp/stock-normalization-population-audit/",
    ".tmp/size-count-discriminator-audit/",
    ".tmp/mozzarella-vs-pellegrino-separation/",
  ],
};

mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, "results.json"), JSON.stringify(results, null, 2));
console.log(JSON.stringify({ summary, broken: brokenGatePattern.length, focus: results.focusProducts.length }, null, 2));
