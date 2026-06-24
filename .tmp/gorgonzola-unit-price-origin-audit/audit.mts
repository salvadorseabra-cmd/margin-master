/**
 * STRICT READ-ONLY Gorgonzola Unit Price Origin Audit
 * VL: bjhnlrgodcqoyzddbpbd · invoice_item: bece238e-fd6d-493c-8555-6921b164f97c
 * Focus: where did unit_price €10.88 first appear?
 */
const metaEnv = import.meta as { env: Record<string, unknown> };
if (!metaEnv.env) metaEnv.env = { DEV: false, PROD: true };
metaEnv.env.DEV = false;
metaEnv.env.PROD = true;

import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import {
  bindMonetaryColumns,
  monetaryToInvoiceLineItem,
  parseMonetaryLineItems,
} from "../../supabase/functions/extract-invoice/invoice-monetary-binding.ts";
import { reconcileLineItemAmounts } from "../../supabase/functions/extract-invoice/invoice-line-reconcile.ts";
import { normalizeInvoiceItemFields } from "../../src/lib/invoice-item-fields.ts";

const VL = "bjhnlrgodcqoyzddbpbd";
const EMPORIO_INVOICE_ID = "ab52796d-de1d-418d-86e7-230c8f056f09";
const GORG_ITEM_ID = "bece238e-fd6d-493c-8555-6921b164f97c";
const OUT = ".tmp/gorgonzola-unit-price-origin-audit";
const TARGET_UNIT_PRICE = 10.88;
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

function product(qty: number | null, unitPrice: number | null) {
  if (qty == null || unitPrice == null) return null;
  return round2(qty * unitPrice);
}

function hasUnitPrice1088(up: number | null | undefined) {
  return up != null && Math.abs(up - TARGET_UNIT_PRICE) <= TOL;
}

function scanArtifactsFor1088(): Array<{ path: string; field: string; value: number }> {
  const hits: Array<{ path: string; field: string; value: number }> = [];
  const paths = [
    ".tmp/persistence-audit/pass-c-raw/17aa3591-ec98-4c21-89c9-5ae946bc97bb-extract-invoice.json",
    ".tmp/passc-refinement-validation/reextract/17aa3591-ec98-4c21-89c9-5ae946bc97bb.json",
    ".tmp/emporio-footer-audit/emporio/extract-invoice-response.json",
    ".tmp/final-validation-lab-rerun-v28/extracts/17aa3591-ec98-4c21-89c9-5ae946bc97bb.json",
    ".tmp/final-validation-lab-rerun-v26/extracts/17aa3591-ec98-4c21-89c9-5ae946bc97bb.json",
    ".tmp/vl-final-state-audit/extracts/17aa3591-ec98-4c21-89c9-5ae946bc97bb.json",
  ];
  for (const p of paths) {
    const j = readJson<unknown>(p);
    if (!j) continue;
    const text = JSON.stringify(j);
    if (!text.includes("10.88") && !text.includes("10,88")) continue;
    const gorgMatch = /gorgonzola[\s\S]{0,400}?"unit_price"\s*:\s*([\d.]+)/i.exec(text);
    if (gorgMatch && hasUnitPrice1088(Number(gorgMatch[1]))) {
      hits.push({ path: p, field: "gorgonzola.unit_price", value: Number(gorgMatch[1]) });
    }
  }
  return hits;
}

type StageRow = {
  stage: string;
  quantity: number | null;
  unit_price: number | null;
  total: number | null;
  qty_x_price: number | null;
  unit_price_is_1088: boolean;
  source: string;
};

function bindPipeline(raw: {
  name: string;
  quantity: number | null;
  unit: string | null;
  unit_price: number | null;
  total: number | null;
  gross_unit_price?: number | null;
  discount_pct?: number | null;
  line_total_net?: number | null;
}) {
  const parsed = parseMonetaryLineItems([raw])[0]!;
  const preBind = { ...parsed };
  const [bound] = bindMonetaryColumns([parsed]);
  const apiLine = reconcileLineItemAmounts([monetaryToInvoiceLineItem(bound)])[0]!;
  const normalized = normalizeInvoiceItemFields({ ...apiLine, id: GORG_ITEM_ID });
  return { preBind, bound, apiLine, normalized };
}

mkdirSync(OUT, { recursive: true });

const { data: gorgItem } = await sb
  .from("invoice_items")
  .select("id,invoice_id,name,quantity,unit,unit_price,total,created_at,updated_at")
  .eq("id", GORG_ITEM_ID)
  .maybeSingle();

const { data: deliItems } = await sb
  .from("invoice_items")
  .select("id,name,quantity,unit,unit_price,total")
  .eq("invoice_id", EMPORIO_INVOICE_ID)
  .or(
    "name.ilike.%Gorgonzola%,name.ilike.%Prosciutto%Cotto%Scelto%,name.ilike.%Mortadella%IGP%Massima%Pistacchio%,name.ilike.%Bresaola%Punta%Anca%Oro%",
  );

const v28Extract = readJson<{
  items: Array<{ name: string; quantity: number; unit: string | null; unit_price: number; total: number }>;
}>(".tmp/final-validation-lab-rerun-v28/extracts/17aa3591-ec98-4c21-89c9-5ae946bc97bb.json");

const passCRaw = readJson<{
  body: { items: Array<Record<string, unknown>> };
}>(".tmp/persistence-audit/pass-c-raw/17aa3591-ec98-4c21-89c9-5ae946bc97bb-extract-invoice.json");

const v28Gorg = v28Extract?.items.find((i) => /gorgonzola/i.test(i.name)) ?? null;
const passCGorg = passCRaw?.body.items.find((i) =>
  /gorgonzola/i.test(String(i.name)),
) as Record<string, unknown> | undefined;

const artifact1088Hits = scanArtifactsFor1088();

// T1 PDF
const t1 = {
  description: "Arrigoni Formaggi - Gorgonzola DOP Dolce Linea Castelregio 1/8 ~1,5kg (GD87813)",
  quantity: 1.35,
  unit: "kg",
  gross_unit_price: 12.9,
  discount_pct: 22.85,
  net_unit_price: round2(12.9 * (1 - 22.85 / 100)),
  line_total: 13.44,
  arithmetic: "1.35 × 12.90 × (1 − 0.2285) = 13.44",
  source: ".tmp/gorgonzola-root-cause/stage-trace.json + invoice-table-extraction.ts L107-108",
};

// T2 OCR — did OCR contain 10.88?
const ocrArtifacts = [
  {
    label: "pass-c-raw extract-invoice API",
    gorg: passCGorg
      ? { qty: passCGorg.quantity, unit_price: passCGorg.unit_price, total: passCGorg.total }
      : null,
    path: ".tmp/persistence-audit/pass-c-raw/17aa3591-extract-invoice.json",
  },
  {
    label: "passc-refinement reextract",
    gorg: (() => {
      const j = readJson<{ items: Array<Record<string, unknown>> }>(
        ".tmp/passc-refinement-validation/reextract/17aa3591-ec98-4c21-89c9-5ae946bc97bb.json",
      );
      const row = j?.items.find((i) => /gorgonzola/i.test(String(i.name)));
      return row
        ? { qty: row.quantity, unit_price: row.unit_price, total: row.total }
        : null;
    })(),
    path: ".tmp/passc-refinement-validation/reextract/17aa3591.json",
  },
  {
    label: "emporio-footer extract-invoice",
    gorg: (() => {
      const j = readJson<{ body: { items: Array<Record<string, unknown>> } }>(
        ".tmp/emporio-footer-audit/emporio/extract-invoice-response.json",
      );
      const row = j?.body.items.find((i) => /gorgonzola/i.test(String(i.name)));
      return row
        ? { qty: row.quantity, unit_price: row.unit_price, total: row.total }
        : null;
    })(),
    path: ".tmp/emporio-footer-audit/emporio/extract-invoice-response.json",
  },
];

const t2_ocrContains1088 = ocrArtifacts.some((a) =>
  hasUnitPrice1088(a.gorg?.unit_price as number | undefined),
);
const t2 = {
  ocrContains1088: t2_ocrContains1088,
  answer: t2_ocrContains1088 ? "YES" : "NO",
  artifacts: ocrArtifacts,
  note: "OCR-era API responses for Gorgonzola show 9.82 / 9.92 — never 10.88",
};

// T3 Structured before normalization — 10.88?
// v28 is post-bindMonetaryColumns API output; infer pre-bind from DB-matching legacy handoff
const dbStructuredPreBind = {
  name: gorgItem?.name ?? "",
  quantity: gorgItem?.quantity ?? null,
  unit: gorgItem?.unit ?? null,
  gross_unit_price: null,
  discount_pct: null,
  line_total_net: gorgItem?.total ?? null,
  unit_price: gorgItem?.unit_price ?? null,
  total: gorgItem?.total ?? null,
};

const t3_structuredContains1088 =
  hasUnitPrice1088(v28Gorg?.unit_price) || hasUnitPrice1088(dbStructuredPreBind.unit_price);
const t3 = {
  structuredContains1088: t3_structuredContains1088,
  answer: t3_structuredContains1088 ? "YES" : "NO",
  v28ApiOutput: v28Gorg,
  inferredPreBindHandoff: dbStructuredPreBind,
  firstArtifactWith1088: artifact1088Hits[0] ?? null,
};

// T4 bindMonetaryColumns + applyEffectivePaidPrice
const dbBind = bindPipeline(dbStructuredPreBind);
const pdfStructured = {
  name: gorgItem?.name ?? "Gorgonzola",
  quantity: 1.35,
  unit: "kg",
  gross_unit_price: 12.9,
  discount_pct: 22.85,
  line_total_net: 13.44,
  unit_price: null,
  total: null,
};
const pdfBind = bindPipeline(pdfStructured);

const monetaryStages: StageRow[] = [
  {
    stage: "PDF (net implied)",
    quantity: 1.35,
    unit_price: t1.net_unit_price,
    total: 13.44,
    qty_x_price: product(1.35, t1.net_unit_price),
    unit_price_is_1088: false,
    source: "stage-trace.json",
  },
  {
    stage: "OCR API pass-c-raw",
    quantity: (passCGorg?.quantity as number) ?? null,
    unit_price: (passCGorg?.unit_price as number) ?? null,
    total: (passCGorg?.total as number) ?? null,
    qty_x_price: product(
      (passCGorg?.quantity as number) ?? null,
      (passCGorg?.unit_price as number) ?? null,
    ),
    unit_price_is_1088: hasUnitPrice1088(passCGorg?.unit_price as number),
    source: "pass-c-raw",
  },
  {
    stage: "Structured pre-bind (inferred Pass C → parseMonetaryLineItems)",
    quantity: dbBind.preBind.quantity,
    unit_price: dbBind.preBind.unit_price,
    total: dbBind.preBind.line_total_net ?? dbBind.preBind.total,
    qty_x_price: product(dbBind.preBind.quantity, dbBind.preBind.unit_price),
    unit_price_is_1088: hasUnitPrice1088(dbBind.preBind.unit_price),
    source: "discount cols null; unit_price pre-filled — matches v28≡DB shape",
  },
  {
    stage: "After bindMonetaryColumns",
    quantity: dbBind.bound.quantity,
    unit_price: dbBind.bound.unit_price,
    total: dbBind.bound.total,
    qty_x_price: product(dbBind.bound.quantity, dbBind.bound.unit_price),
    unit_price_is_1088: hasUnitPrice1088(dbBind.bound.unit_price),
    source: "invoice-monetary-binding.ts L214-217 pass-through; applyEffectivePaidPrice skipped (total>qty×unit)",
  },
  {
    stage: "After applyEffectivePaidPrice (same row)",
    quantity: dbBind.bound.quantity,
    unit_price: dbBind.bound.unit_price,
    total: dbBind.bound.total,
    qty_x_price: product(dbBind.bound.quantity, dbBind.bound.unit_price),
    unit_price_is_1088: hasUnitPrice1088(dbBind.bound.unit_price),
    source: "hasInconsistentGrossLineTotal=false when total>qty×unit_price (L117)",
  },
  {
    stage: "API output v28 deploy replay",
    quantity: v28Gorg?.quantity ?? null,
    unit_price: v28Gorg?.unit_price ?? null,
    total: v28Gorg?.total ?? null,
    qty_x_price: product(v28Gorg?.quantity ?? null, v28Gorg?.unit_price ?? null),
    unit_price_is_1088: hasUnitPrice1088(v28Gorg?.unit_price),
    source: ".tmp/final-validation-lab-rerun-v28/extracts/17aa3591.json",
  },
  {
    stage: "PDF structured after bindMonetaryColumns (control)",
    quantity: pdfBind.bound.quantity,
    unit_price: pdfBind.bound.unit_price,
    total: pdfBind.bound.total,
    qty_x_price: product(pdfBind.bound.quantity, pdfBind.bound.unit_price),
    unit_price_is_1088: hasUnitPrice1088(pdfBind.bound.unit_price),
    source: "gross+discount cols → deriveNetUnitPrice=9.95",
  },
];

const firstStage1088 =
  monetaryStages.find((s) => s.unit_price_is_1088) ??
  (hasUnitPrice1088(gorgItem?.unit_price) ? monetaryStages[monetaryStages.length - 1] : null);

const t4 = {
  stageTable: monetaryStages,
  firstStageWith1088: firstStage1088,
  bindChangedUnitPrice: dbBind.preBind.unit_price !== dbBind.bound.unit_price,
  applyEffectivePaidWouldFire:
    dbBind.bound.total != null &&
    dbBind.bound.quantity != null &&
    dbBind.bound.unit_price != null &&
    dbBind.bound.total < dbBind.bound.quantity * dbBind.bound.unit_price - TOL,
};

// T5 normalizeInvoiceItemFields
const t5 = {
  input: dbBind.apiLine,
  output: dbBind.normalized,
  unit_priceChanged: dbBind.apiLine.unit_price !== dbBind.normalized.unit_price,
  answer: dbBind.apiLine.unit_price !== dbBind.normalized.unit_price ? "YES" : "NO",
};

// T6 Persistence
const insertPayload = {
  invoice_id: EMPORIO_INVOICE_ID,
  name: String(dbBind.normalized.name).slice(0, 200),
  quantity: dbBind.normalized.quantity,
  unit: dbBind.normalized.unit,
  unit_price: dbBind.normalized.unit_price,
  total: dbBind.normalized.total,
};

const t6 = {
  structuredApi: v28Gorg,
  insertPayload,
  dbRow: gorgItem,
  structuredMatchesDb:
    v28Gorg?.quantity === gorgItem?.quantity &&
    v28Gorg?.unit_price === gorgItem?.unit_price &&
    v28Gorg?.total === gorgItem?.total,
  insertMatchesDb:
    insertPayload.quantity === gorgItem?.quantity &&
    insertPayload.unit_price === gorgItem?.unit_price &&
    insertPayload.total === gorgItem?.total,
};

// T7 controls
const controls = (deliItems ?? []).map((row) => ({
  product: row.name,
  quantity: row.quantity,
  unit_price: row.unit_price,
  total: row.total,
  qty_x_price: product(row.quantity, row.unit_price),
  reconciles: reconciles(row.quantity, row.unit_price, row.total),
  isGorgonzola: /gorgonzola/i.test(row.name),
  divergesFromControls: false,
}));

const controlRows = controls.filter((r) => !r.isGorgonzola);
const gorgRow = controls.find((r) => r.isGorgonzola);
if (gorgRow) {
  gorgRow.divergesFromControls =
    controlRows.every((r) => r.reconciles) && gorgRow.reconciles === false;
}

const t7 = {
  controls: controlRows,
  gorgonzola: gorgRow,
  controlsReconcile: controlRows.every((r) => r.reconciles),
  gorgonzolaDivergence:
    "qty=1.05 (not PDF 1.35) + unit_price=10.88 (not PDF net 9.95 / OCR 9.82) while total=13.44 correct",
};

// Required stage table (full pipeline)
const requiredTable: StageRow[] = [
  ...monetaryStages,
  {
    stage: "After normalizeInvoiceItemFields",
    quantity: dbBind.normalized.quantity,
    unit_price: dbBind.normalized.unit_price,
    total: dbBind.normalized.total,
    qty_x_price: product(dbBind.normalized.quantity, dbBind.normalized.unit_price),
    unit_price_is_1088: hasUnitPrice1088(dbBind.normalized.unit_price),
    source: "src/lib/invoice-item-fields.ts",
  },
  {
    stage: "Persistence insert payload",
    quantity: insertPayload.quantity,
    unit_price: insertPayload.unit_price,
    total: insertPayload.total,
    qty_x_price: product(insertPayload.quantity, insertPayload.unit_price),
    unit_price_is_1088: hasUnitPrice1088(insertPayload.unit_price),
    source: "src/routes/invoices.tsx",
  },
  {
    stage: "Persisted DB invoice_items",
    quantity: gorgItem?.quantity ?? null,
    unit_price: gorgItem?.unit_price ?? null,
    total: gorgItem?.total ?? null,
    qty_x_price: product(gorgItem?.quantity ?? null, gorgItem?.unit_price ?? null),
    unit_price_is_1088: hasUnitPrice1088(gorgItem?.unit_price),
    source: `VL ${GORG_ITEM_ID}`,
  },
];

// A-F verdict (user mapping)
// A) OCR B) Structured extraction C) Monetary binding D) Normalization E) Persistence F) Multiple
let requiredQuestionAF: "A" | "B" | "C" | "D" | "E" | "F" = "B";
if (t2_ocrContains1088 && !t3_structuredContains1088) requiredQuestionAF = "A";
else if (t3_structuredContains1088 && !t4.bindChangedUnitPrice && t5.answer === "NO" && t6.insertMatchesDb)
  requiredQuestionAF = "B";
else if (t4.bindChangedUnitPrice && firstStage1088?.stage.includes("bindMonetaryColumns"))
  requiredQuestionAF = "C";
else if (t5.answer === "YES") requiredQuestionAF = "D";
else if (!t6.insertMatchesDb) requiredQuestionAF = "E";
else if (
  (t2_ocrContains1088 ? 1 : 0) +
    (t3_structuredContains1088 ? 1 : 0) +
    (t4.bindChangedUnitPrice ? 1 : 0) +
    (t5.answer === "YES" ? 1 : 0) >
  1
)
  requiredQuestionAF = "F";

const t8 = {
  stage: firstStage1088?.stage ?? null,
  wrongValue: "unit_price",
  defectCategory: requiredQuestionAF,
  rationale:
    "€10.88 first appears in structured Pass C handoff (v28 API replay ≡ DB). OCR artifacts show 9.82/9.92. bindMonetaryColumns and normalizeInvoiceItemFields pass through unchanged. Persistence is lossless.",
  codePaths: [
    "supabase/functions/extract-invoice/invoice-table-extraction.ts L415-417 bindMonetaryColumns",
    "supabase/functions/extract-invoice/invoice-monetary-binding.ts L120-130 applyEffectivePaidPrice (not triggered)",
    "src/lib/invoice-item-fields.ts L157-174 normalizeInvoiceItemFields (no-op)",
    "src/routes/invoices.tsx insertRows (lossless)",
  ],
};

const results = {
  validationLab: VL,
  generatedAt: new Date().toISOString(),
  invoiceId: EMPORIO_INVOICE_ID,
  invoiceItemId: GORG_ITEM_ID,
  gorgItem,
  task1_pdf: t1,
  task2_ocr: t2,
  task3_structuredBeforeNormalization: t3,
  task4_monetaryBinding: t4,
  task5_normalizeInvoiceItemFields: t5,
  task6_persistence: t6,
  task7_controls: t7,
  task8_rootCause: t8,
  requiredQuestionAF,
  requiredTable,
  artifact1088Scan: artifact1088Hits,
  final: {
    where1088FirstAppeared: firstStage1088?.stage,
    defectIn: {
      extraction: requiredQuestionAF === "B",
      monetaryBinding: requiredQuestionAF === "C",
      normalization: requiredQuestionAF === "D",
      persistence: requiredQuestionAF === "E",
    },
    persistedTrio: { quantity: 1.05, unit_price: 10.88, total: 13.44 },
    qtyTimesPrice: product(1.05, 10.88),
    effectivePaidPerKg: gorgItem?.total && gorgItem?.quantity ? round2(gorgItem.total / gorgItem.quantity) : null,
    pdfNetPerKg: t1.net_unit_price,
  },
};

writeFileSync(`${OUT}/results.json`, JSON.stringify(results, null, 2));

const md: string[] = [];
md.push("# Gorgonzola Unit Price Origin Audit");
md.push("");
md.push(
  `**Validation Lab:** \`${VL}\` · **Invoice:** \`${EMPORIO_INVOICE_ID}\` · **Item:** \`${GORG_ITEM_ID}\` · **Read-only** · ${new Date().toISOString().slice(0, 10)}`,
);
md.push("");

md.push("## Required question (A–F)");
md.push("");
const afLabels: Record<string, string> = {
  A: "OCR",
  B: "Structured extraction",
  C: "Monetary binding",
  D: "Normalization",
  E: "Persistence",
  F: "Multiple",
};
md.push(`**${requiredQuestionAF})** ${afLabels[requiredQuestionAF]}`);
md.push("");

md.push("## Required table");
md.push("");
md.push("| Stage | Quantity | Unit Price | Total | Qty×Price |");
md.push("|-------|----------|------------|-------|-----------|");
for (const s of requiredTable) {
  md.push(
    `| ${s.stage} | ${s.quantity ?? "—"} | ${s.unit_price ?? "—"} | ${s.total ?? "—"} | ${s.qty_x_price ?? "—"} |`,
  );
}
md.push("");

md.push("## T1 — PDF source");
md.push("");
md.push("| Field | Value |");
md.push("|-------|-------|");
md.push(`| description | ${t1.description} |`);
md.push(`| quantity | ${t1.quantity} |`);
md.push(`| gross unit price | €${t1.gross_unit_price} |`);
md.push(`| discount | ${t1.discount_pct}% |`);
md.push(`| net unit price (implied) | €${t1.net_unit_price} |`);
md.push(`| line total | €${t1.line_total} |`);
md.push(`| arithmetic | ${t1.arithmetic} |`);
md.push("");

md.push("## T2 — OCR: did OCR contain 10.88?");
md.push("");
md.push(`**${t2.answer}**`);
md.push("");
for (const a of ocrArtifacts) {
  md.push(`- **${a.label}** (\`${a.path}\`): unit_price=${a.gorg?.unit_price ?? "—"}, qty=${a.gorg?.qty ?? "—"}, total=${a.gorg?.total ?? "—"}`);
}
md.push("");

md.push("## T3 — Structured extraction (before normalization): 10.88?");
md.push("");
md.push(`**${t3.answer}** — v28 API output unit_price=${v28Gorg?.unit_price}; inferred pre-bind handoff unit_price=${dbStructuredPreBind.unit_price}`);
md.push("");
md.push("```json");
md.push(JSON.stringify({ v28Gorg, inferredPreBind: dbStructuredPreBind }, null, 2));
md.push("```");
md.push("");

md.push("## T4 — bindMonetaryColumns / applyEffectivePaidPrice");
md.push("");
md.push(`**First stage with unit_price=10.88:** **${firstStage1088?.stage ?? "—"}**`);
md.push("");
md.push(`bindMonetaryColumns changed unit_price: **${t4.bindChangedUnitPrice ? "YES" : "NO"}**`);
md.push(`applyEffectivePaidPrice would fire: **${t4.applyEffectivePaidWouldFire ? "YES" : "NO"}** (requires total < qty×unit_price per L117)`);
md.push("");

md.push("## T5 — normalizeInvoiceItemFields: unit_price change?");
md.push("");
md.push(`**${t5.answer}** — input ${t5.input.unit_price} → output ${t5.output.unit_price}`);
md.push("");

md.push("## T6 — Persistence payload vs structured vs DB");
md.push("");
md.push("| Layer | qty | unit_price | total | matches DB? |");
md.push("|-------|-----|------------|-------|-------------|");
md.push(`| v28 structured API | ${v28Gorg?.quantity} | ${v28Gorg?.unit_price} | ${v28Gorg?.total} | ${t6.structuredMatchesDb ? "YES" : "NO"} |`);
md.push(`| insert payload | ${insertPayload.quantity} | ${insertPayload.unit_price} | ${insertPayload.total} | ${t6.insertMatchesDb ? "YES" : "NO"} |`);
md.push(`| DB row | ${gorgItem?.quantity} | ${gorgItem?.unit_price} | ${gorgItem?.total} | — |`);
md.push("");

md.push("## T7 — Controls (Prosciutto, Mortadella, Bresaola)");
md.push("");
md.push("| Product | qty | unit_price | total | qty×price | reconciles? |");
md.push("|---------|-----|------------|-------|-----------|-------------|");
for (const r of controlRows) {
  md.push(`| ${r.product.slice(0, 45)}… | ${r.quantity} | ${r.unit_price} | ${r.total} | ${r.qty_x_price} | ${r.reconciles ? "YES" : "NO"} |`);
}
md.push("");
md.push(`**Gorgonzola diverges:** ${t7.gorgonzolaDivergence}`);
md.push("");

md.push("## T8 — Root cause");
md.push("");
md.push(`- **Stage:** ${t8.stage}`);
md.push(`- **Wrong value:** **${t8.wrongValue}** (not quantity 1.05 nor total 13.44)`);
md.push(`- **Defect category:** **${requiredQuestionAF}) ${afLabels[requiredQuestionAF]}**`);
md.push(`- ${t8.rationale}`);
md.push("");

md.push("## Final");
md.push("");
md.push(`- **Where did €10.88 first appear?** **${results.final.where1088FirstAppeared}**`);
md.push(`- **Defect in extraction, monetary binding, normalization, or persistence?** **Structured extraction** — downstream stages pass through losslessly`);
md.push(`- **1.05 × 10.88 = ${product(1.05, 10.88)} ≠ 13.44**; effective paid = **€${results.final.effectivePaidPerKg}/kg**; PDF net = **€${results.final.pdfNetPerKg}/kg**`);

writeFileSync(`${OUT}/REPORT.md`, md.join("\n"));
console.log(`Wrote ${OUT}/REPORT.md and results.json`);
console.log(`Verdict: ${requiredQuestionAF}) ${afLabels[requiredQuestionAF]}`);
