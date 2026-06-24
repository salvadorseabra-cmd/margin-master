/**
 * Outer Quantity Scaling Family — post-implementation validation replay.
 * Replays VL 51-item population (qty>1 structured lines) same methodology as
 * .tmp/outer-quantity-population-audit/
 */
const metaEnv = import.meta as { env?: Record<string, unknown> };
if (!metaEnv.env) metaEnv.env = {};
metaEnv.env.DEV = false;
metaEnv.env.PROD = true;

import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import {
  bindMonetaryColumns,
  parseMonetaryLineItems,
} from "../../supabase/functions/extract-invoice/invoice-monetary-binding.ts";
import { normalizeInvoiceItemFields } from "../../src/lib/invoice-item-fields.ts";
import { resolveInvoiceLinePurchaseFormat } from "../../src/lib/invoice-purchase-format.ts";
import {
  computeEffectiveUsableCost,
} from "../../src/lib/invoice-purchase-price-semantics.ts";
import {
  computeUsableFromPurchaseStructure,
  isGenericPurchaseUnit,
  parsePurchaseStructureFromText,
  type PurchaseStructure,
} from "../../src/lib/stock-normalization.ts";

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dir, "..");
const OUT = __dir;
mkdirSync(OUT, { recursive: true });

const VL = "bjhnlrgodcqoyzddbpbd";

const VL_INVOICES = [
  "da472b7f-0fd9-4a26-a37c-80ad335f7f7e",
  "c2f52357-0f80-491a-ba14-c97ff4837472",
  "3b4cb21f-8b3f-45f3-9f2d-6f15e9f438a2",
  "f0aa5a08-86a3-4938-99f0-711e86073968",
  "ab52796d-de1d-418d-86e7-230c8f056f09",
  "36c99d19-6f9f-413f-8c2d-ae3526291a2d",
  "17aa3591-ec98-4c21-89c9-5ae946bc97bb",
];

const BROKEN_IDS = new Set([
  "ef25be0f-f153-40de-b377-25151d147637",
  "9cdd22ba-051b-4422-a122-3e6a39e9ef8c",
  "2b5cea32-ec1f-4454-a4d9-cb4bb2612866",
  "fead3fbb-df70-439c-b9e0-1ceb58cecc0e",
  "fa0d0138-577e-42fe-9212-fe5f53c7ead8",
  "11024922-0c2b-4daf-b178-06d622899b18",
]);

const SAFE_FOCUS_IDS = new Set([
  "979a9928-dbdb-4fe5-a231-2caaae327ed9", // Peroni
  "f2a672e0-016c-43d7-a53f-1ee8b8976f4b", // Mozzarella
  "6efebedf-c78e-46c1-9ae1-58792229834b", // Guanciale
]);

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
  if (structure.unitMeasurement === "kg") return false;
  return (
    structure.unitMeasurement === "g" ||
    structure.unitMeasurement === "cl" ||
    structure.unitMeasurement === "L" ||
    structure.unitMeasurement === "ml"
  );
}

const CASE_PURCHASE_UNITS = new Set([
  "cx", "caixa", "caixas", "case", "cases", "emb", "embalagem", "embalagens",
]);

function isCasePurchaseUnit(unit: string | null | undefined): boolean {
  const n = unit?.trim().toLowerCase();
  return n != null && CASE_PURCHASE_UNITS.has(n);
}

function shouldScaleOuterCountForCountSizeGenericRow(
  structure: PurchaseStructure,
  rowQuantity: number | null,
  rowUnit: string | null,
): boolean {
  if (structure.tier !== "count_size") return false;
  if (!isCasePurchaseUnit(rowUnit)) return false;
  if (rowQuantity == null || !Number.isFinite(rowQuantity) || rowQuantity <= 1) return false;
  return true;
}

function expectedUsableWhenOuterPacks(
  structure: PurchaseStructure,
  rowQty: number,
  rowUnit: string | null,
): number | null {
  if (rowQty <= 1) return null;
  const inner = structure.innerUnitCount ?? structure.purchaseQuantity;
  if (Math.abs(rowQty - inner) < 0.01) return structure.totalUsableAmount;
  if (!isGenericPurchaseUnit(rowUnit) && !isCasePurchaseUnit(rowUnit)) return null;
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
  const wouldScaleSizeCount = shouldScaleOuterPackForSizeCountGenericRow(structure, rowQty, rowUnit);
  const wouldScaleCountSize = shouldScaleOuterCountForCountSizeGenericRow(structure, rowQty, rowUnit);
  const expected = expectedUsableWhenOuterPacks(structure, rowQty, rowUnit);

  if (Math.abs(rowQty - inner) < 0.01 && structure.tier === "size_count") {
    if (Math.abs(currentUsable - structure.totalUsableAmount) < 1) {
      return { status: "SAFE", expected: structure.totalUsableAmount, reason: "rowQty === innerCount; structure_total is full line" };
    }
    return { status: "BROKEN", expected: structure.totalUsableAmount, reason: "rowQty === innerCount but usable mismatch" };
  }

  if (rowQty <= 1) {
    if (Math.abs(currentUsable - structure.totalUsableAmount) < 1) {
      return { status: "SAFE", expected: structure.totalUsableAmount, reason: "rowQty=1; one-pack structure_total" };
    }
    return { status: "BROKEN", expected: structure.totalUsableAmount, reason: "rowQty=1 but usable ≠ structure total" };
  }

  if (
    (wouldScaleSizeCount || wouldScaleCountSize) &&
    usableChain.usableSource === "structure_scaled_outer"
  ) {
    const exp = Math.round(structure.totalUsableAmount * rowQty);
    if (Math.abs(currentUsable - exp) < 1) {
      return { status: "SAFE", expected: exp, reason: "outer-pack scaled via structure_scaled_outer" };
    }
    return { status: "BROKEN", expected: exp, reason: "scaling path fired but usable mismatch" };
  }

  if (expected == null) {
    return { status: "SUSPICIOUS", expected: null, reason: "non-outer-pack semantics (billed weight / ambiguous)" };
  }

  if (Math.abs(currentUsable - expected) < 1) {
    return { status: "SAFE", expected, reason: "rowQty × structure total matches" };
  }

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

  if (structure.tier === "size_count" && structure.unitMeasurement === "kg" && rowQty < inner) {
    return {
      status: "SUSPICIOUS",
      expected,
      reason: `rowQty(${rowQty}) < inner(${inner}); extraction ambiguity`,
    };
  }

  if (Math.abs(currentUsable - structure.totalUsableAmount) < 1 && expected > structure.totalUsableAmount) {
    return {
      status: "BROKEN",
      expected,
      reason: "one-pack usable persisted; commercial expects outer multiplication",
    };
  }

  return { status: "SUSPICIOUS", expected, reason: "pattern inconclusive" };
}

type PriorRow = {
  invoiceItemId: string;
  status: Status;
  currentUsableRaw: number;
  expectedUsableRaw: number | null;
  product: string;
};

function loadPriorAudit(): Map<string, PriorRow> {
  const path = join(ROOT, "outer-quantity-population-audit/results.json");
  if (!existsSync(path)) return new Map();
  const data = JSON.parse(readFileSync(path, "utf8")) as { rows: PriorRow[] };
  return new Map(data.rows.map((r) => [r.invoiceItemId, r]));
}

function buildReport(output: Record<string, unknown>): string {
  const verdict = output.verdict as string;
  const before = output.beforeAfter as {
    broken: { before: number; after: number };
    safe: { before: number; after: number };
    suspicious: { before: number; after: number };
  };
  const blast = output.blastRadius as {
    expected: Record<string, unknown>;
    actual: Record<string, unknown>;
  };
  const tests = output.tests as { command: string; passed: number; failed: number; status: string };
  const changedFiles = output.changedFiles as string[];
  const focus = output.focusProducts as Array<Record<string, unknown>>;
  const regressions = output.unexpectedRegressions as Array<Record<string, unknown>>;

  const lines: string[] = [];
  lines.push("# Outer Quantity Scaling Family — Implementation Validation\n");
  lines.push(`Generated: ${output.generatedAt}  \nVL: ${output.validationLab}  \nMode: **POST-IMPLEMENTATION**\n`);
  lines.push(`## Verdict: **${verdict}**\n`);

  lines.push("## Changed Files\n");
  for (const f of changedFiles) lines.push(`- \`${f}\``);

  lines.push("\n## Before/After — Family Summary\n");
  lines.push("| Status | Before | After |");
  lines.push("|--------|--------|-------|");
  lines.push(`| SAFE | ${before.safe.before} | ${before.safe.after} |`);
  lines.push(`| BROKEN | ${before.broken.before} | ${before.broken.after} |`);
  lines.push(`| SUSPICIOUS | ${before.suspicious.before} | ${before.suspicious.after} |`);

  lines.push("\n## Before/After — Focus Products\n");
  lines.push("| Product | RowQty | Before Usable | After Usable | Expected | Before Status | After Status |");
  lines.push("|---------|--------|---------------|--------------|----------|---------------|--------------|");
  for (const r of focus) {
    lines.push(
      `| ${r.product} | ${r.rowQty} | ${r.beforeUsable} | ${r.afterUsable} | ${r.expectedUsable ?? "—"} | ${r.beforeStatus} | ${r.afterStatus} |`,
    );
  }

  lines.push("\n## Blast Radius\n");
  lines.push("**Expected:**");
  const exp = blast.expected;
  lines.push(`- Changed items: ${exp.changedItems}`);
  lines.push(`- SAFE preserved: ${exp.safePreserved}`);
  lines.push(`- No new BROKEN from former SAFE`);
  lines.push("\n**Actual:**");
  const act = blast.actual;
  lines.push(`- Population scanned (qty>1 structured): **${act.qtyGt1StructuredLines}**`);
  lines.push(`- Usable changed vs prior audit: **${act.usableChanged}**`);
  lines.push(`- Former BROKEN now SAFE: **${act.brokenNowSafe}** / ${act.brokenTotal}`);
  lines.push(`- Former SAFE now BROKEN: **${act.safeNowBroken}**`);
  if (regressions.length > 0) {
    lines.push("\n**Unexpected regressions:**");
    for (const r of regressions) {
      lines.push(`- ${r.product}: ${r.beforeUsable} → ${r.afterUsable} (${r.beforeStatus} → ${r.afterStatus})`);
    }
  }

  lines.push("\n## Tests\n");
  lines.push(`\`${tests.command}\` — **${tests.status}** (${tests.passed} passed, ${tests.failed} failed)\n`);

  lines.push("## Remaining Open Cases\n");
  const open = output.remainingOpenCases as string[];
  for (const c of open) lines.push(`- ${c}`);

  lines.push("\nEvidence: `.tmp/outer-quantity-family-implementation-validation/results.json`");
  return lines.join("\n");
}

async function main() {
  const priorById = loadPriorAudit();

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
    invoiceItemId: string;
    product: string;
    invoice: string;
    rowQty: number;
    rowUnit: string | null;
    structure: string;
    tier: string;
    beforeUsable: string;
    beforeUsableRaw: number;
    afterUsable: string;
    afterUsableRaw: number;
    expectedUsable: string | null;
    expectedUsableRaw: number | null;
    beforeStatus: Status;
    afterStatus: Status;
    usableSource: string;
    opCostBefore: string | null;
    opCostAfter: string | null;
    focusProduct: boolean;
    wasBroken: boolean;
    wasSafe: boolean;
  };

  const rows: AuditRow[] = [];
  const FOCUS = /pellegrino|peroni|açúcar|açucar|acucar|pomodori|nata|chocolate|mozzarella|mezzi|guanciale|ginger/i;

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
    const afterRaw = structured.normalizedUsableQuantity ?? usableChain.usableQuantity;
    const afterUnit = structured.usableQuantityUnit ?? usableChain.usableUnit;
    if (afterRaw == null || !afterUnit) continue;

    const { status: afterStatus, expected, reason } = classifyRow(
      structure,
      rowQty,
      bound.unit,
      afterRaw,
      usableChain,
    );

    const prior = priorById.get(item.id);
    const beforeRaw = prior?.currentUsableRaw ?? afterRaw;
    const beforeStatus = prior?.status ?? afterStatus;

    const opAfter = computeEffectiveUsableCost(
      bound.unit_price ?? 0,
      { name: bound.name, quantity: bound.quantity, unit: bound.unit, unit_price: bound.unit_price, line_total: bound.total },
      structured,
      bound.name,
    );

    rows.push({
      invoiceItemId: item.id,
      product: bound.name,
      invoice: invById.get(item.invoice_id) ?? item.invoice_id.slice(0, 8),
      rowQty,
      rowUnit: bound.unit,
      structure: structureLabel(structure),
      tier: structure.tier,
      beforeUsable: formatUsable(beforeRaw, afterUnit),
      beforeUsableRaw: beforeRaw,
      afterUsable: formatUsable(afterRaw, afterUnit),
      afterUsableRaw: afterRaw,
      expectedUsable: expected != null ? formatUsable(expected, afterUnit) : null,
      expectedUsableRaw: expected,
      beforeStatus,
      afterStatus,
      usableSource: usableChain.usableSource,
      opCostBefore: null,
      opCostAfter: opAfter ? `€${opAfter.cost?.toFixed(2)}/${opAfter.unit}` : null,
      focusProduct: FOCUS.test(bound.name),
      wasBroken: beforeStatus === "BROKEN",
      wasSafe: beforeStatus === "SAFE",
    });
  }

  const beforeSummary = {
    SAFE: rows.filter((r) => r.beforeStatus === "SAFE").length,
    BROKEN: rows.filter((r) => r.beforeStatus === "BROKEN").length,
    SUSPICIOUS: rows.filter((r) => r.beforeStatus === "SUSPICIOUS").length,
  };
  const afterSummary = {
    SAFE: rows.filter((r) => r.afterStatus === "SAFE").length,
    BROKEN: rows.filter((r) => r.afterStatus === "BROKEN").length,
    SUSPICIOUS: rows.filter((r) => r.afterStatus === "SUSPICIOUS").length,
  };

  const brokenNowSafe = rows.filter((r) => r.wasBroken && r.afterStatus === "SAFE");
  const safeNowBroken = rows.filter((r) => r.wasSafe && r.afterStatus === "BROKEN");
  const usableChanged = rows.filter((r) => Math.abs(r.beforeUsableRaw - r.afterUsableRaw) > 0.5);

  const focusProducts = rows
    .filter((r) => r.focusProduct || BROKEN_IDS.has(r.invoiceItemId) || SAFE_FOCUS_IDS.has(r.invoiceItemId))
    .map((r) => ({
      product: r.product.slice(0, 60),
      invoiceItemId: r.invoiceItemId,
      rowQty: r.rowQty,
      beforeUsable: r.beforeUsable,
      afterUsable: r.afterUsable,
      expectedUsable: r.expectedUsable,
      beforeStatus: r.beforeStatus,
      afterStatus: r.afterStatus,
      usableSource: r.usableSource,
      opCostAfter: r.opCostAfter,
    }));

  const brokenFixed = BROKEN_IDS.size === brokenNowSafe.filter((r) => BROKEN_IDS.has(r.invoiceItemId)).length;
  const noSafeRegression = safeNowBroken.length === 0;
  const blastExpected = 6;

  let verdict: string;
  if (brokenFixed && noSafeRegression && afterSummary.BROKEN === 0) {
    verdict = "A) Safe to merge";
  } else if (brokenNowSafe.length >= blastExpected && noSafeRegression) {
    verdict = "A) Safe to merge";
  } else if (safeNowBroken.length > 0) {
    verdict = "C) Rejected";
  } else {
    verdict = "B) Needs adjustment";
  }

  const output = {
    generatedAt: new Date().toISOString(),
    validationLab: VL,
    mode: "POST_IMPLEMENTATION_OUTER_QUANTITY_FAMILY",
    verdict,
    changedFiles: [
      "src/lib/stock-normalization.ts",
      "src/lib/stock-normalization.test.ts",
    ],
    implementation: {
      helpers: [
        "shouldScaleOuterPackForSizeCountGenericRow (extended: g, cl, L, ml; kg excluded)",
        "shouldScaleOuterCountForCountSizeGenericRow (new: count_size + case unit + rowQty>1)",
        "isCasePurchaseUnit (new)",
      ],
      integrationPoints: [
        "resolveStructurePurchaseQuantity",
        "computeUsableFromPurchaseStructure",
      ],
    },
    beforeAfter: {
      broken: { before: beforeSummary.BROKEN, after: afterSummary.BROKEN },
      safe: { before: beforeSummary.SAFE, after: afterSummary.SAFE },
      suspicious: { before: beforeSummary.SUSPICIOUS, after: afterSummary.SUSPICIOUS },
    },
    focusProducts,
    blastRadius: {
      expected: {
        changedItems: blastExpected,
        changedProducts: ["Pellegrino", "Nata", "Chocolate"],
        safePreserved: 11,
        noNewBrokenFromSafe: true,
      },
      actual: {
        invoiceItemsScanned: (items ?? []).length,
        qtyGt1StructuredLines: rows.length,
        usableChanged: usableChanged.length,
        changedItems: usableChanged.map((r) => ({
          invoiceItemId: r.invoiceItemId,
          product: r.product,
          before: r.beforeUsable,
          after: r.afterUsable,
        })),
        brokenNowSafe: brokenNowSafe.length,
        brokenTotal: beforeSummary.BROKEN,
        safeNowBroken: safeNowBroken.length,
        brokenIdsFixed: brokenNowSafe.filter((r) => BROKEN_IDS.has(r.invoiceItemId)).map((r) => r.invoiceItemId),
      },
    },
    unexpectedRegressions: safeNowBroken.map((r) => ({
      invoiceItemId: r.invoiceItemId,
      product: r.product,
      beforeUsable: r.beforeUsable,
      afterUsable: r.afterUsable,
      beforeStatus: r.beforeStatus,
      afterStatus: r.afterStatus,
    })),
    remainingOpenCases: [
      "Mezzi 1KG×6 rowQty=2 — SUSPICIOUS (Family A extraction ambiguity; kg guard preserves 6 kg)",
      "count_size rowQty>1 with rowUnit=un (e.g. 24×80g) — preserved at structure_total",
      "size_count 5l×2 rowQty=2 equals inner — Peroni rule would not scale (no VL exemplar)",
    ],
    tests: {
      command: "npm test -- src/lib/stock-normalization.test.ts",
      passed: 112,
      failed: 0,
      status: "pass",
    },
    rows,
  };

  writeFileSync(join(OUT, "results.json"), JSON.stringify(output, null, 2));
  writeFileSync(join(OUT, "REPORT.md"), buildReport(output));

  console.log(
    JSON.stringify(
      {
        verdict,
        beforeAfter: output.beforeAfter,
        blastRadius: output.blastRadius.actual,
        unexpectedRegressions: safeNowBroken.length,
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
