/**
 * STRICT READ-ONLY Gorgonzola Re-Read Validation Audit
 * VL: bjhnlrgodcqoyzddbpbd
 */
const metaEnv = import.meta as { env: Record<string, unknown> };
if (!metaEnv.env) metaEnv.env = { DEV: false, PROD: true };
metaEnv.env.DEV = false;
metaEnv.env.PROD = true;

import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import {
  resolveInvoiceLinePricingPresentation,
  formatRowPurchaseQuantityLabel,
} from "../../src/lib/invoice-purchase-price-semantics.ts";
import { needsMathematicalReconciliationReview } from "../../src/lib/invoice-extraction-review.ts";

const VL = "bjhnlrgodcqoyzddbpbd";
const EMPORIO_INVOICE_ID = "ab52796d-de1d-418d-86e7-230c8f056f09";
const ORIGINAL_ITEM_ID = "bece238e-fd6d-493c-8555-6921b164f97c";
const GEOMETRY_FIXTURE = "17aa3591-ec98-4c21-89c9-5ae946bc97bb";
const OUT = ".tmp/gorgonzola-reread-validation-audit";
const TOL = 0.02;

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

function readJson<T>(path: string): T | null {
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

function reconciles(qty: number | null, unitPrice: number | null, total: number | null) {
  if (qty == null || unitPrice == null || total == null) return null;
  return Math.abs(qty * unitPrice - total) <= TOL;
}

function fieldMatch(pdf: unknown, persisted: unknown, tol = 0) {
  if (pdf == null || persisted == null) return false;
  if (typeof pdf === "number" && typeof persisted === "number") {
    return tol > 0 ? Math.abs(pdf - persisted) <= tol : pdf === persisted;
  }
  return String(pdf).toLowerCase().trim() === String(persisted).toLowerCase().trim();
}

mkdirSync(OUT, { recursive: true });

// --- Live VL ---
const { data: invoice } = await sb
  .from("invoices")
  .select("id,supplier_name,invoice_date,created_at,updated_at,total,storage_path")
  .eq("id", EMPORIO_INVOICE_ID)
  .maybeSingle();

const { data: gorgItem } = await sb
  .from("invoice_items")
  .select("*")
  .eq("invoice_id", EMPORIO_INVOICE_ID)
  .ilike("name", "%Gorgonzola%")
  .maybeSingle();

const { data: originalItemRow } = await sb
  .from("invoice_items")
  .select("id")
  .eq("id", ORIGINAL_ITEM_ID)
  .maybeSingle();

const { data: allItems } = await sb
  .from("invoice_items")
  .select("id,name,quantity,unit,unit_price,total,created_at,updated_at")
  .eq("invoice_id", EMPORIO_INVOICE_ID)
  .order("name");

const { data: ingredient } = await sb
  .from("ingredients")
  .select("id,name,current_price,purchase_quantity,base_unit,updated_at")
  .ilike("name", "%Gorgonzola%DOP%")
  .limit(1)
  .maybeSingle();

const { data: priceHistory } = ingredient
  ? await sb
      .from("price_history")
      .select("*")
      .eq("ingredient_id", ingredient.id)
      .order("created_at", { ascending: false })
      .limit(5)
  : { data: null };

// --- PDF ground truth ---
const stageTrace = readJson<{
  visibleInvoice: Record<string, string>;
  groundTruth: { qty: number; unit: string; unit_price: number; total: number };
}>(`.tmp/gorgonzola-root-cause/stage-trace.json`);

const pdfNet = round2(12.9 * (1 - 22.85 / 100));
const t1Pdf = {
  description:
    stageTrace?.visibleInvoice?.description ??
    "Arrigoni Formaggi - Gorgonzola DOP Dolce Linea Castelregio 1/8 ~1,5kg (GD87813)",
  quantity: 1.35,
  unit: "kg",
  gross_unit_price: 12.9,
  discount_pct: 22.85,
  net_unit_price: pdfNet,
  line_total: 13.44,
  source: ".tmp/gorgonzola-root-cause/stage-trace.json visibleInvoice",
};

// --- Original persisted (prior audit snapshot) ---
const priorAudit = readJson<{ gorgItem: Record<string, unknown> }>(
  ".tmp/gorgonzola-persistence-reconciliation-audit/results.json",
);
const original = {
  quantity: 1.05,
  unit_price: 10.88,
  total: 13.44,
  unit: "kg",
  created_at: priorAudit?.gorgItem?.created_at ?? "2026-06-23T10:41:31.22202+00:00",
  updated_at: priorAudit?.gorgItem?.updated_at ?? "2026-06-23T10:41:31.22202+00:00",
  source: ".tmp/gorgonzola-persistence-reconciliation-audit/results.json",
};

const current = gorgItem
  ? {
      quantity: gorgItem.quantity as number | null,
      unit_price: gorgItem.unit_price as number | null,
      total: gorgItem.total as number | null,
      unit: gorgItem.unit as string | null,
      name: gorgItem.name as string,
      created_at: gorgItem.created_at as string,
      updated_at: gorgItem.updated_at as string,
      gross_unit_price: (gorgItem as Record<string, unknown>).gross_unit_price ?? null,
      discount_pct: (gorgItem as Record<string, unknown>).discount_pct ?? null,
      structure: (gorgItem as Record<string, unknown>).structure ?? null,
      usable: (gorgItem as Record<string, unknown>).usable ?? null,
    }
  : null;

// --- Re-read trace artifacts ---
const artifactPaths = [
  ".tmp/final-validation-lab-rerun-v28/extracts/17aa3591-ec98-4c21-89c9-5ae946bc97bb.json",
  ".tmp/final-stability-audit/extracts/17aa3591-ec98-4c21-89c9-5ae946bc97bb-run2.json",
  ".tmp/final-stability-audit/extracts/17aa3591-ec98-4c21-89c9-5ae946bc97bb-all-runs.json",
  ".tmp/persistence-audit/pass-c-raw/17aa3591-ec98-4c21-89c9-5ae946bc97bb-extract-invoice.json",
  ".tmp/mathematical-reconciliation-implementation/results.json",
];

type GorgExtract = {
  source: string;
  quantity: number | null;
  unit_price: number | null;
  total: number | null;
  name?: string;
  extractedAt?: string;
  reconciles: boolean | null;
};

function findGorgonzolaInExtract(path: string, data: unknown): GorgExtract | null {
  if (!data) return null;
  const d = data as Record<string, unknown>;
  let item: Record<string, unknown> | undefined;
  if (Array.isArray(d.items)) {
    item = (d.items as Record<string, unknown>[]).find((i) =>
      /gorgonzola/i.test(String(i.name)),
    );
  } else if (d.body && typeof d.body === "object") {
    const body = d.body as { items?: Record<string, unknown>[] };
    item = body.items?.find((i) => /gorgonzola/i.test(String(i.name)));
  } else if (d.gorgonzola) {
    item = d.gorgonzola as Record<string, unknown>;
  }
  if (!item) return null;
  const qty = item.quantity as number | null;
  const up = item.unit_price as number | null;
  const total = item.total as number | null;
  return {
    source: path,
    name: String(item.name ?? ""),
    quantity: qty,
    unit_price: up,
    total,
    extractedAt: (d.extractedAt as string) ?? (d.generatedAt as string) ?? undefined,
    reconciles: reconciles(qty, up, total),
  };
}

const extractionTraces: GorgExtract[] = [];
for (const p of artifactPaths) {
  const data = readJson<unknown>(p);
  const g = findGorgonzolaInExtract(p, data);
  if (g) extractionTraces.push(g);
}

// Scan stability all-runs for each run
const allRuns = readJson<{ runs?: Array<{ run: number; items: Record<string, unknown>[] }> }>(
  ".tmp/final-stability-audit/extracts/17aa3591-ec98-4c21-89c9-5ae946bc97bb-all-runs.json",
);
if (allRuns?.runs) {
  for (const run of allRuns.runs) {
    const item = run.items?.find((i) => /gorgonzola/i.test(String(i.name)));
    if (item) {
      extractionTraces.push({
        source: `all-runs run ${run.run}`,
        name: String(item.name),
        quantity: item.quantity as number,
        unit_price: item.unit_price as number,
        total: item.total as number,
        reconciles: reconciles(
          item.quantity as number,
          item.unit_price as number,
          item.total as number,
        ),
      });
    }
  }
}

// Find first appearance of current trio values
const TARGET_QTY = current?.quantity ?? 2;
const TARGET_UP = current?.unit_price ?? 9.35;
const TARGET_TOTAL = current?.total ?? 18.72;

function matchesTrio(e: GorgExtract) {
  return (
    e.quantity === TARGET_QTY && e.unit_price === TARGET_UP && e.total === TARGET_TOTAL
  );
}

const firstCurrentTrio = extractionTraces.find(matchesTrio) ?? null;

// T3 side-by-side
const t3 = {
  description: {
    pdf: t1Pdf.description,
    persisted: current?.name ?? "—",
    match: fieldMatch(t1Pdf.description.split("(")[0].trim(), (current?.name ?? "").split("(")[0].trim()),
  },
  quantity: {
    pdf: t1Pdf.quantity,
    persisted: current?.quantity ?? null,
    match: fieldMatch(t1Pdf.quantity, current?.quantity, TOL),
  },
  gross_unit_price: {
    pdf: t1Pdf.gross_unit_price,
    persisted: current?.gross_unit_price ?? null,
    match: current?.gross_unit_price != null ? fieldMatch(t1Pdf.gross_unit_price, current.gross_unit_price, TOL) : false,
  },
  discount_pct: {
    pdf: t1Pdf.discount_pct,
    persisted: current?.discount_pct ?? null,
    match: current?.discount_pct != null ? fieldMatch(t1Pdf.discount_pct, current.discount_pct, TOL) : false,
  },
  net_unit_price: {
    pdf: t1Pdf.net_unit_price,
    persisted: current?.unit_price ?? null,
    match: fieldMatch(t1Pdf.net_unit_price, current?.unit_price, TOL),
  },
  line_total: {
    pdf: t1Pdf.line_total,
    persisted: current?.total ?? null,
    match: fieldMatch(t1Pdf.line_total, current?.total, TOL),
  },
};

// T4 math
const qty = current?.quantity ?? null;
const up = current?.unit_price ?? null;
const total = current?.total ?? null;
const expected = qty != null && up != null ? round2(qty * up) : null;
const variance = expected != null && total != null ? round2(total - expected) : null;
const variancePct =
  expected != null && total != null && expected !== 0
    ? round2((Math.abs(variance!) / expected) * 100)
    : null;

const mathReview = needsMathematicalReconciliationReview({
  quantity: qty,
  unit_price: up,
  total,
});

// Presentation / usable
const presentation = current
  ? resolveInvoiceLinePricingPresentation({
      name: current.name,
      quantity: current.quantity,
      unit: current.unit,
      unit_price: current.unit_price,
      total: current.total,
    })
  : null;

// T5 semantic A/B/C/D/E
// A: Correct per PDF
// B: Merely mathematically consistent (qty×unit=total but wrong vs PDF)
// C: Still wrong extraction (doesn't match PDF, may or may not reconcile)
// D: Partial correction (some fields match PDF)
// E: Cannot determine (missing data)
let semantic: "A" | "B" | "C" | "D" | "E" = "E";
if (current) {
  const pdfQtyMatch = fieldMatch(t1Pdf.quantity, current.quantity, TOL);
  const pdfNetMatch = fieldMatch(t1Pdf.net_unit_price, current.unit_price, TOL);
  const pdfTotalMatch = fieldMatch(t1Pdf.line_total, current.total, TOL);
  const mathOk = reconciles(current.quantity, current.unit_price, current.total) === true;
  const allPdfMatch = pdfQtyMatch && pdfNetMatch && pdfTotalMatch;
  if (allPdfMatch) semantic = "A";
  else if (mathOk && !pdfQtyMatch && !pdfNetMatch && !pdfTotalMatch) semantic = "B";
  else if (pdfQtyMatch || pdfNetMatch || pdfTotalMatch) semantic = "D";
  else semantic = "C";
}

// Distance to PDF
function pdfDistance(row: { quantity: number | null; unit_price: number | null; total: number | null }) {
  const dq = row.quantity != null ? Math.abs(row.quantity - t1Pdf.quantity) : 99;
  const du = row.unit_price != null ? Math.abs(row.unit_price - t1Pdf.net_unit_price) : 99;
  const dt = row.total != null ? Math.abs(row.total - t1Pdf.line_total) : 99;
  return round2(dq + du + dt);
}

const originalDistance = pdfDistance(original);
const currentDistance = current ? pdfDistance(current) : null;

const rereadOccurred =
  current != null &&
  (current.quantity !== original.quantity ||
    current.unit_price !== original.unit_price ||
    current.total !== original.total ||
    current.updated_at !== original.updated_at);

// T8 answers
const correctPerPdf =
  fieldMatch(t1Pdf.quantity, current?.quantity, TOL) &&
  fieldMatch(t1Pdf.net_unit_price, current?.unit_price, TOL) &&
  fieldMatch(t1Pdf.line_total, current?.total, TOL);

const merelyMathConsistent =
  reconciles(current?.quantity ?? null, current?.unit_price ?? null, current?.total ?? null) ===
    true && !correctPerPdf;

const closerToPdf =
  currentDistance != null
    ? currentDistance < originalDistance
      ? "current"
      : currentDistance > originalDistance
        ? "original"
        : "tie"
    : "unknown";

const humanApprove =
  correctPerPdf
    ? "YES — all monetary fields match visible PDF row"
    : merelyMathConsistent
      ? "NO — arithmetic reconciles but qty/total diverge from PDF (€" +
        Math.abs((current?.total ?? 0) - t1Pdf.line_total).toFixed(2) +
        " line total error)"
      : "NO — neither PDF-accurate nor reconciled";

const results = {
  validationLab: VL,
  generatedAt: new Date().toISOString(),
  auditType: "STRICT_READ_ONLY_GORGONZOLA_REREAD_VALIDATION",
  invoiceId: EMPORIO_INVOICE_ID,
  originalInvoiceItemId: ORIGINAL_ITEM_ID,
  currentInvoiceItemId: gorgItem?.id ?? null,
  originalItemStillExists: originalItemRow != null,
  geometryFixture: GEOMETRY_FIXTURE,
  invoice,
  task1_pdfGroundTruth: t1Pdf,
  task2_currentPersisted: {
    row: gorgItem,
    derived: current,
    ingredient,
    priceHistory,
    current_price: ingredient?.current_price ?? null,
    presentation: presentation
      ? {
          priceDisplay: presentation.priceDisplay,
          effectiveUsableCostLabel: presentation.effectiveUsableCostLabel,
          purchaseQuantityLabel: formatRowPurchaseQuantityLabel({
            name: current!.name,
            quantity: current!.quantity,
            unit: current!.unit,
          }),
        }
      : null,
    mathReview,
  },
  task3_sideBySide: t3,
  task4_math: {
    expression: `${qty} × ${up}`,
    expected_total: expected,
    actual_total: total,
    variance_abs: variance,
    variance_pct: variancePct,
    reconciles: reconciles(qty, up, total),
    reviewFlag: mathReview.needsReview,
    reasonCode: mathReview.reasonCode,
  },
  task5_semantic: {
    letter: semantic,
    labels: {
      A: "Correct per PDF",
      B: "Merely mathematically consistent",
      C: "Wrong extraction (non-PDF)",
      D: "Partial correction",
      E: "Cannot determine",
    },
  },
  task6_rereadTrace: {
    rereadOccurred,
    originalItemId: ORIGINAL_ITEM_ID,
    currentItemId: gorgItem?.id ?? null,
    originalItemReplaced: originalItemRow == null && gorgItem != null,
    original,
    current,
    created_at: current?.created_at,
    updated_at: current?.updated_at,
    timestampsNote:
      current?.updated_at !== current?.created_at
        ? "updated_at differs from created_at — row was modified after insert"
        : "updated_at equals created_at — no post-insert modification detected",
    userReportedAfterReread: { quantity: 2, unit_price: 9.35, total: 18.72 },
    matchesUserReport:
      current?.quantity === 2 && current?.unit_price === 9.35 && current?.total === 18.72,
    extractionTraces,
    firstArtifactWithCurrentTrio: firstCurrentTrio,
    note: "2.00/9.35/18.72 first appears in final-stability-audit run2 (pre-persist laboratory extract, not confirmed as live re-read response)",
  },
  task7_history: {
    original,
    current,
    originalDistanceToPdf: originalDistance,
    currentDistanceToPdf: currentDistance,
    originalReconciles: reconciles(original.quantity, original.unit_price, original.total),
    currentReconciles: reconciles(
      current?.quantity ?? null,
      current?.unit_price ?? null,
      current?.total ?? null,
    ),
    allInvoiceItems: allItems,
  },
  task8_answers: {
    correctPerPdf,
    merelyMathematicallyConsistent: merelyMathConsistent,
    closerToPdf,
    humanWouldApproveCurrent: humanApprove,
  },
  storage: {
    storage_path: invoice?.storage_path ?? null,
    pdfImageArtifact: ".tmp/emporio-italia-investigation/invoice-full.png",
  },
};

writeFileSync(`${OUT}/results.json`, JSON.stringify(results, null, 2));

// Markdown report
const md: string[] = [];
md.push("# Gorgonzola Re-Read Validation Audit");
md.push("");
md.push(
  `**Validation Lab:** \`${VL}\` · **Invoice:** \`${EMPORIO_INVOICE_ID}\` · **Original item:** \`${ORIGINAL_ITEM_ID}\` · **Current item:** \`${gorgItem?.id ?? "—"}\` · **Read-only** · ${new Date().toISOString().slice(0, 10)}`,
);
md.push("");
md.push("## Executive question");
md.push("");
md.push(
  "Did Re-read produce **CORRECT** extraction or merely **MATHEMATICALLY CONSISTENT** values?",
);
md.push("");

md.push("## T1 — PDF ground truth (Emporio Gorgonzola line)");
md.push("");
md.push("| Field | Value |");
md.push("|-------|-------|");
md.push(`| description | ${t1Pdf.description} |`);
md.push(`| qty | ${t1Pdf.quantity} kg |`);
md.push(`| gross unit | €${t1Pdf.gross_unit_price} |`);
md.push(`| discount | ${t1Pdf.discount_pct}% |`);
md.push(`| net unit (implied) | €${t1Pdf.net_unit_price} |`);
md.push(`| line total | €${t1Pdf.line_total} |`);
md.push(`| source | ${t1Pdf.source} |`);
md.push("");

md.push("## T2 — Current persisted `invoice_items` (VL DB)");
md.push("");
if (current) {
  md.push("| Field | Value |");
  md.push("|-------|-------|");
  md.push(`| qty | ${current.quantity} |`);
  md.push(`| unit_price | ${current.unit_price} |`);
  md.push(`| total | ${current.total} |`);
  md.push(`| gross_unit_price | ${current.gross_unit_price ?? "null (not stored)"} |`);
  md.push(`| discount_pct | ${current.discount_pct ?? "null (not stored)"} |`);
  md.push(`| structure | ${current.structure ?? "null"} |`);
  md.push(`| usable | ${current.usable ?? "null"} |`);
  md.push(`| ingredients.current_price | ${ingredient?.current_price ?? "—"} |`);
  md.push(`| created_at | ${current.created_at} |`);
  md.push(`| updated_at | ${current.updated_at} |`);
} else {
  md.push("**Row not found in VL DB.**");
}
md.push("");

md.push("## T3 — Side-by-side");
md.push("");
md.push("| Field | PDF | Current Persisted | Match? |");
md.push("|-------|-----|-------------------|--------|");
for (const [field, row] of Object.entries(t3)) {
  md.push(`| ${field} | ${row.pdf} | ${row.persisted ?? "—"} | **${row.match ? "YES" : "NO"}** |`);
}
md.push("");

md.push("## T4 — Math: qty × unit_price vs total");
md.push("");
md.push(`| Expression | ${qty} × ${up} = ${expected} |`);
md.push(`| Persisted total | ${total} |`);
md.push(`| Variance | €${variance} (${variancePct}%) |`);
md.push(`| Reconciles (±€${TOL})? | **${results.task4_math.reconciles ? "YES" : "NO"}** |`);
md.push(`| Review flag | ${mathReview.needsReview ? mathReview.reasonCode : "none"} |`);
md.push("");

md.push("## T5 — Semantic classification");
md.push("");
md.push(`**${semantic})** ${results.task5_semantic.labels[semantic]}`);
md.push("");

md.push("## T6 — Re-read extraction trace");
md.push("");
md.push(`Original item \`${ORIGINAL_ITEM_ID}\` still in DB: **${originalItemRow != null ? "YES" : "NO — replaced on re-read"}**`);
md.push(`Current Gorgonzola item id: \`${gorgItem?.id ?? "—"}\``);
md.push(`Re-read modification detected (DB): **${rereadOccurred ? "YES" : "NO"}**`);
md.push(`Matches user-reported trio (2.00 / 9.35 / 18.72): **${results.task6_rereadTrace.matchesUserReport ? "YES" : "NO"}**`);
md.push(`| ${results.task6_rereadTrace.timestampsNote} |`);
md.push("");
md.push("Artifact traces containing Gorgonzola:");
md.push("");
md.push("| Source | qty | unit_price | total | reconciles? |");
md.push("|--------|-----|------------|-------|-------------|");
for (const e of extractionTraces) {
  const highlight =
    e.quantity === TARGET_QTY && e.unit_price === TARGET_UP && e.total === TARGET_TOTAL
      ? " ← current trio"
      : e.quantity === 1.05 && e.unit_price === 10.88 && e.total === 13.44
        ? " ← original trio"
        : "";
  md.push(
    `| ${e.source} | ${e.quantity} | ${e.unit_price} | ${e.total} | ${e.reconciles ? "YES" : "NO"} |${highlight}`,
  );
}
md.push("");
md.push(
  `**First artifact with current trio (2/9.35/18.72):** ${firstCurrentTrio?.source ?? "not found in workspace artifacts"}`,
);
md.push("");

md.push("## T7 — History: Original vs Current");
md.push("");
md.push("| Field | Original (pre re-read) | Current (VL DB) | PDF |");
md.push("|-------|------------------------|-----------------|-----|");
md.push(
  `| qty | ${original.quantity} | ${current?.quantity ?? "—"} | ${t1Pdf.quantity} |`,
);
md.push(
  `| unit_price | ${original.unit_price} | ${current?.unit_price ?? "—"} | ${t1Pdf.net_unit_price} (net) |`,
);
md.push(`| total | ${original.total} | ${current?.total ?? "—"} | ${t1Pdf.line_total} |`);
md.push(`| qty×price=total | ${original.quantity * original.unit_price}≠${original.total} | ${expected}=${total}? | ${round2(t1Pdf.quantity * t1Pdf.net_unit_price)}≈${t1Pdf.line_total} |`);
md.push(`| Distance to PDF (L1) | ${originalDistance} | ${currentDistance ?? "—"} | 0 |`);
md.push(`| updated_at | ${original.updated_at} | ${current?.updated_at ?? "—"} | — |`);
md.push("");

md.push("## T8 — Explicit answers");
md.push("");
md.push(`1. **Correct per PDF?** **${correctPerPdf ? "YES" : "NO"}**`);
md.push(`2. **Merely mathematically consistent?** **${merelyMathConsistent ? "YES" : "NO"}**`);
md.push(`3. **Closer to PDF — original or current?** **${closerToPdf}** (L1 distances: original=${originalDistance}, current=${currentDistance})`);
md.push(`4. **Would human approve current row?** ${humanApprove}`);
md.push("");

writeFileSync(`${OUT}/REPORT.md`, md.join("\n"));
console.log(`Wrote ${OUT}/REPORT.md and results.json`);
console.log(
  JSON.stringify({
    current: { qty: current?.quantity, up: current?.unit_price, total: current?.total },
    rereadOccurred,
    semantic,
    correctPerPdf,
  }),
);
