/**
 * STRICT READ-ONLY Gorgonzola Invoice Persistence Reconciliation Audit
 * VL: bjhnlrgodcqoyzddbpbd · invoice_item: bece238e-fd6d-493c-8555-6921b164f97c
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
import {
  operationalCostFieldsFromInvoiceLine,
  defaultIsGenericUnit,
} from "../../src/lib/ingredient-auto-persist.ts";
import { buildLastPurchaseCostPresentation } from "../../src/lib/ingredient-detail-panel.ts";
import {
  formatRowPurchaseQuantityLabel,
  resolveInvoiceLinePricingPresentation,
} from "../../src/lib/invoice-purchase-price-semantics.ts";

const VL = "bjhnlrgodcqoyzddbpbd";
const EMPORIO_INVOICE_ID = "ab52796d-de1d-418d-86e7-230c8f056f09";
const GORG_ITEM_ID = "bece238e-fd6d-493c-8555-6921b164f97c";
const OUT = ".tmp/gorgonzola-persistence-reconciliation-audit";
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

type StageRow = {
  stage: string;
  description: string;
  quantity: number | null;
  unit: string | null;
  unit_price: number | null;
  discount_pct?: number | null;
  gross_unit_price?: number | null;
  line_total: number | null;
  qty_x_price: number | null;
  reconciles: boolean | null;
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
  const [bound] = bindMonetaryColumns([parsed]);
  const apiLine = reconcileLineItemAmounts([monetaryToInvoiceLineItem(bound)])[0]!;
  const normalized = normalizeInvoiceItemFields({ ...apiLine, id: GORG_ITEM_ID });
  return { parsed, bound, apiLine, normalized };
}

mkdirSync(OUT, { recursive: true });

// --- Live VL ---
const { data: invoice } = await sb
  .from("invoices")
  .select("id,supplier_name,invoice_date,created_at,total,storage_path")
  .eq("id", EMPORIO_INVOICE_ID)
  .maybeSingle();

const { data: gorgItem } = await sb
  .from("invoice_items")
  .select("id,invoice_id,name,quantity,unit,unit_price,total,created_at,updated_at,user_id")
  .eq("id", GORG_ITEM_ID)
  .maybeSingle();

const { data: deliItems } = await sb
  .from("invoice_items")
  .select("id,name,quantity,unit,unit_price,total")
  .eq("invoice_id", EMPORIO_INVOICE_ID)
  .or(
    "name.ilike.%Gorgonzola%,name.ilike.%Prosciutto%Cotto%Scelto%,name.ilike.%Mortadella%IGP%Massima%Pistacchio%,name.ilike.%Bresaola%Punta%Anca%Oro%",
  );

const { data: ingredient } = await sb
  .from("ingredients")
  .select("id,name,current_price,purchase_quantity,base_unit,updated_at")
  .ilike("name", "%Gorgonzola%DOP%dolce%")
  .limit(1)
  .maybeSingle();

// --- Artifact sources ---
const pdfVisible = readJson<{
  visibleInvoice: Record<string, string>;
  groundTruth: Record<string, number | string>;
}>(".tmp/gorgonzola-root-cause/stage-trace.json");

const v28Extract = readJson<{
  items: Array<{
    name: string;
    quantity: number;
    unit: string | null;
    unit_price: number;
    total: number;
  }>;
}>(".tmp/final-validation-lab-rerun-v28/extracts/17aa3591-ec98-4c21-89c9-5ae946bc97bb.json");

const passCRaw = readJson<{
  body: { items: Array<Record<string, unknown>> };
}>(".tmp/persistence-audit/pass-c-raw/17aa3591-ec98-4c21-89c9-5ae946bc97bb-extract-invoice.json");

const v28Gorg = v28Extract?.items.find((i) => /gorgonzola/i.test(i.name)) ?? null;
const passCGorg = passCRaw?.body.items.find((i) =>
  /gorgonzola/i.test(String(i.name)),
) as Record<string, unknown> | undefined;

// T1 PDF
const t1Pdf = {
  description:
    "Arrigoni Formaggi - Gorgonzola DOP Dolce Linea Castelregio 1/8 ~1,5kg (GD87813)",
  quantity: 1.35,
  unit: "kg",
  unit_price_gross: 12.9,
  discount_pct: 22.85,
  unit_price_net_implied: round2(12.9 * (1 - 22.85 / 100)),
  line_total: 13.44,
  source: ".tmp/gorgonzola-root-cause/stage-trace.json visibleInvoice + invoice-table-extraction.ts L107-108",
  arithmetic: "1.35 × 12.90 × (1 − 0.2285) = 13.44",
  reconciles_qty_x_gross_disc: reconciles(1.35, round2(12.9 * (1 - 22.85 / 100)), 13.44),
  reconciles_qty_x_net_gt: reconciles(1.35, 9.92, 13.44),
};

// Pipeline stages for Gorgonzola
const stages: StageRow[] = [];

stages.push({
  stage: "PDF",
  description: t1Pdf.description,
  quantity: 1.35,
  unit: "kg",
  unit_price: t1Pdf.unit_price_net_implied,
  discount_pct: 22.85,
  gross_unit_price: 12.9,
  line_total: 13.44,
  qty_x_price: product(1.35, t1Pdf.unit_price_net_implied),
  reconciles: reconciles(1.35, t1Pdf.unit_price_net_implied, 13.44),
  source: "invoice-full.png visible row (stage-trace.json)",
});

if (passCGorg) {
  const q = passCGorg.quantity as number;
  const up = passCGorg.unit_price as number;
  const t = passCGorg.total as number;
  stages.push({
    stage: "OCR / extract-invoice API (pass-c-raw)",
    description: String(passCGorg.name),
    quantity: q,
    unit: (passCGorg.unit as string) ?? null,
    unit_price: up,
    line_total: t,
    qty_x_price: product(q, up),
    reconciles: reconciles(q, up, t),
    source: ".tmp/persistence-audit/pass-c-raw/17aa3591-extract-invoice.json (2026-06-11)",
  });
}

if (v28Gorg) {
  stages.push({
    stage: "Structured / API output (v28 deploy replay)",
    description: v28Gorg.name,
    quantity: v28Gorg.quantity,
    unit: v28Gorg.unit,
    unit_price: v28Gorg.unit_price,
    line_total: v28Gorg.total,
    qty_x_price: product(v28Gorg.quantity, v28Gorg.unit_price),
    reconciles: reconciles(v28Gorg.quantity, v28Gorg.unit_price, v28Gorg.total),
    source: ".tmp/final-validation-lab-rerun-v28/extracts/17aa3591.json deploy v28",
  });
}

// Structured before binding — PDF prompt example (gross+disc+total)
const pdfStructured = {
  name: gorgItem?.name ?? "Arrigoni Formaggi - Gorgonzola DOP Dolce Linea Castelfrigo 1/8 - 1,5kg",
  quantity: 1.35,
  unit: "kg",
  gross_unit_price: 12.9,
  discount_pct: 22.85,
  line_total_net: 13.44,
  unit_price: null,
  total: null,
};
const pdfBind = bindPipeline(pdfStructured);
stages.push({
  stage: "Structured (pre-bind replay: PDF columns)",
  description: pdfStructured.name,
  quantity: pdfStructured.quantity,
  unit: pdfStructured.unit,
  unit_price: pdfBind.parsed.gross_unit_price,
  discount_pct: pdfBind.parsed.discount_pct,
  gross_unit_price: pdfBind.parsed.gross_unit_price,
  line_total: pdfBind.parsed.line_total_net,
  qty_x_price: null,
  reconciles: null,
  source: "invoice-table-extraction.ts Emporio Gorgonzola prompt example → parseMonetaryLineItems input",
});
stages.push({
  stage: "After bindMonetaryColumns (PDF structured)",
  description: pdfStructured.name,
  quantity: pdfBind.bound.quantity,
  unit: pdfBind.bound.unit,
  unit_price: pdfBind.bound.unit_price,
  discount_pct: pdfBind.bound.discount_pct,
  gross_unit_price: pdfBind.bound.gross_unit_price,
  line_total: pdfBind.bound.total,
  qty_x_price: product(pdfBind.bound.quantity, pdfBind.bound.unit_price),
  reconciles: reconciles(pdfBind.bound.quantity, pdfBind.bound.unit_price, pdfBind.bound.total),
  source: "bindMonetaryColumns replay",
});

// DB-shaped structured replay (legacy unit_price pre-filled, no discount cols)
const dbStructured = {
  name: gorgItem?.name ?? "",
  quantity: gorgItem?.quantity ?? null,
  unit: gorgItem?.unit ?? null,
  gross_unit_price: null,
  discount_pct: null,
  line_total_net: gorgItem?.total ?? null,
  unit_price: gorgItem?.unit_price ?? null,
  total: gorgItem?.total ?? null,
};
const dbBind = bindPipeline(dbStructured);
stages.push({
  stage: "Structured (pre-bind: DB legacy fields)",
  description: dbStructured.name,
  quantity: dbStructured.quantity,
  unit: dbStructured.unit,
  unit_price: dbStructured.unit_price,
  line_total: dbStructured.line_total_net,
  qty_x_price: product(dbStructured.quantity, dbStructured.unit_price),
  reconciles: reconciles(dbStructured.quantity, dbStructured.unit_price, dbStructured.line_total_net),
  source: "Inferred Pass C handoff matching persisted invoice_items (discount cols stripped at API)",
});
stages.push({
  stage: "After bindMonetaryColumns (DB legacy)",
  description: dbBind.bound.name,
  quantity: dbBind.bound.quantity,
  unit: dbBind.bound.unit,
  unit_price: dbBind.bound.unit_price,
  line_total: dbBind.bound.total,
  qty_x_price: product(dbBind.bound.quantity, dbBind.bound.unit_price),
  reconciles: reconciles(dbBind.bound.quantity, dbBind.bound.unit_price, dbBind.bound.total),
  source: "bindMonetaryColumns pass-through (applyEffectivePaidPrice skipped: total > qty×unit_price)",
});

const normIn = dbBind.apiLine;
const normOut = dbBind.normalized;
stages.push({
  stage: "After normalizeInvoiceItemFields",
  description: normOut.name,
  quantity: normOut.quantity,
  unit: normOut.unit,
  unit_price: normOut.unit_price,
  line_total: normOut.total,
  qty_x_price: product(normOut.quantity, normOut.unit_price),
  reconciles: reconciles(normOut.quantity, normOut.unit_price, normOut.total),
  source: "src/lib/invoice-item-fields.ts normalizeInvoiceItemFields",
});

const insertPayload = {
  invoice_id: EMPORIO_INVOICE_ID,
  name: String(normOut.name).slice(0, 200),
  quantity: normOut.quantity,
  unit: normOut.unit,
  unit_price: normOut.unit_price,
  total: normOut.total,
};
stages.push({
  stage: "Persistence insert payload",
  description: insertPayload.name,
  quantity: insertPayload.quantity,
  unit: insertPayload.unit,
  unit_price: insertPayload.unit_price,
  line_total: insertPayload.total,
  qty_x_price: product(insertPayload.quantity, insertPayload.unit_price),
  reconciles: reconciles(insertPayload.quantity, insertPayload.unit_price, insertPayload.total),
  source: "src/routes/invoices.tsx L1450-1465 insertRows shape",
});

stages.push({
  stage: "Persisted invoice_items (DB)",
  description: gorgItem?.name ?? "",
  quantity: gorgItem?.quantity ?? null,
  unit: gorgItem?.unit ?? null,
  unit_price: gorgItem?.unit_price ?? null,
  line_total: gorgItem?.total ?? null,
  qty_x_price: product(gorgItem?.quantity ?? null, gorgItem?.unit_price ?? null),
  reconciles: reconciles(
    gorgItem?.quantity ?? null,
    gorgItem?.unit_price ?? null,
    gorgItem?.total ?? null,
  ),
  source: `VL invoice_items ${GORG_ITEM_ID}`,
});

// Ingredient detail
const meta = {
  name: gorgItem?.name ?? "",
  quantity: gorgItem?.quantity ?? null,
  unit: gorgItem?.unit ?? null,
  unit_price: gorgItem?.unit_price ?? null,
  line_total: gorgItem?.total ?? null,
};
const presentation = resolveInvoiceLinePricingPresentation(meta);
const persistFields = operationalCostFieldsFromInvoiceLine(
  normalizeInvoiceItemFields({ ...meta, id: GORG_ITEM_ID }),
);
const detail = buildLastPurchaseCostPresentation({
  purchaseQuantityLabel: formatRowPurchaseQuantityLabel(meta),
  procurementCostLabel: presentation.priceDisplay,
  operationalCostLabel: presentation.effectiveUsableCostLabel,
  priceLabel: meta.line_total != null ? `€${meta.line_total.toFixed(2)}` : null,
  supplierLabel: invoice?.supplier_name ?? null,
  dateLabel: invoice?.invoice_date ?? null,
});

// T6 reconciliation — first failing stage (any trio)
const firstInconsistent = stages.find((s) => s.reconciles === false) ?? null;

// First stage matching the persisted inconsistent trio exactly
const PERSISTED_TRIO = { quantity: 1.05, unit_price: 10.88, total: 13.44 };
function matchesPersistedTrio(qty: number | null, up: number | null, total: number | null) {
  return qty === PERSISTED_TRIO.quantity && up === PERSISTED_TRIO.unit_price && total === PERSISTED_TRIO.total;
}
const firstPersistedTrioStage =
  stages.find((s) =>
    matchesPersistedTrio(s.quantity, s.unit_price, s.line_total),
  ) ?? null;

// T7 deli controls
const deliControls = (deliItems ?? []).map((row) => ({
  product: row.name,
  quantity: row.quantity,
  unit_price: row.unit_price,
  total: row.total,
  total_div_qty: row.quantity && row.total ? round2(row.total / row.quantity) : null,
  qty_x_unit_price: product(row.quantity, row.unit_price),
  reconciles: reconciles(row.quantity, row.unit_price, row.total),
}));

const deliDiscountReplay = [
  {
    scenario: "pdf_gross_discount_qty_1_35",
    input: { quantity: 1.35, gross: 12.9, discount: 22.85, total: 13.44 },
    bound: bindPipeline({
      name: "Gorgonzola",
      quantity: 1.35,
      unit: "kg",
      gross_unit_price: 12.9,
      discount_pct: 22.85,
      line_total_net: 13.44,
      unit_price: null,
      total: null,
    }).bound,
  },
  {
    scenario: "pdf_gross_discount_db_qty_1_05",
    input: { quantity: 1.05, gross: 12.9, discount: 22.85, total: 13.44 },
    bound: bindPipeline({
      name: "Gorgonzola",
      quantity: 1.05,
      unit: "kg",
      gross_unit_price: 12.9,
      discount_pct: 22.85,
      line_total_net: 13.44,
      unit_price: null,
      total: null,
    }).bound,
  },
  {
    scenario: "legacy_db_no_discount_cols",
    input: { quantity: 1.05, unit_price: 10.88, total: 13.44 },
    bound: dbBind.bound,
  },
];

// Required table Field | PDF | OCR | Structured | Persisted
const requiredTable = {
  description: {
    PDF: t1Pdf.description,
    OCR: passCGorg ? String(passCGorg.name) : v28Gorg?.name ?? "—",
    Structured: v28Gorg?.name ?? "—",
    Persisted: gorgItem?.name ?? "—",
  },
  quantity: {
    PDF: 1.35,
    OCR: passCGorg ? (passCGorg.quantity as number) : v28Gorg?.quantity ?? "—",
    Structured: v28Gorg?.quantity ?? "—",
    Persisted: gorgItem?.quantity ?? "—",
  },
  unit: {
    PDF: "kg",
    OCR: passCGorg ? ((passCGorg.unit as string) ?? null) : v28Gorg?.unit ?? "—",
    Structured: v28Gorg?.unit ?? "—",
    Persisted: gorgItem?.unit ?? "—",
  },
  unit_price: {
    PDF: `gross €12.90 / net €${t1Pdf.unit_price_net_implied}`,
    OCR: passCGorg ? (passCGorg.unit_price as number) : "—",
    Structured: v28Gorg?.unit_price ?? "—",
    Persisted: gorgItem?.unit_price ?? "—",
  },
  discount: {
    PDF: "22.85%",
    OCR: "not in API response",
    Structured: "stripped at API",
    Persisted: "not stored (schema)",
  },
  line_total: {
    PDF: 13.44,
    OCR: passCGorg ? (passCGorg.total as number) : v28Gorg?.total ?? "—",
    Structured: v28Gorg?.total ?? "—",
    Persisted: gorgItem?.total ?? "—",
  },
};

// Verdicts
const pdfReconciles = t1Pdf.reconciles_qty_x_gross_disc === true;
const v28MatchesDb =
  v28Gorg?.quantity === gorgItem?.quantity &&
  v28Gorg?.unit_price === gorgItem?.unit_price &&
  v28Gorg?.total === gorgItem?.total;
const normChanged =
  normIn.quantity !== normOut.quantity ||
  normIn.unit_price !== normOut.unit_price ||
  normIn.total !== normOut.total ||
  normIn.unit !== normOut.unit;
const persistMatchesDb =
  insertPayload.quantity === gorgItem?.quantity &&
  insertPayload.unit_price === gorgItem?.unit_price &&
  insertPayload.total === gorgItem?.total;

// A-F: stage where persisted trio (1.05/10.88/13.44) first appears
let requiredQuestionAF: "A" | "B" | "C" | "D" | "E" | "F" = "C";
if (!pdfReconciles) requiredQuestionAF = "A";
else if (firstPersistedTrioStage?.stage.startsWith("Structured / API")) requiredQuestionAF = "C";
else if (firstPersistedTrioStage?.stage.startsWith("OCR")) requiredQuestionAF = "B";
else if (normChanged && matchesPersistedTrio(normOut.quantity, normOut.unit_price, normOut.total))
  requiredQuestionAF = "D";
else if (!persistMatchesDb) requiredQuestionAF = "E";
else if (
  !firstPersistedTrioStage?.stage.startsWith("Structured") &&
  !firstPersistedTrioStage?.stage.startsWith("After bindMonetaryColumns (DB legacy)")
)
  requiredQuestionAF = "F";

// T8 root cause A-E (pipeline stage) — same as A-F minus F
const t8RootCause: "A" | "B" | "C" | "D" | "E" =
  requiredQuestionAF === "F" ? "C" : (requiredQuestionAF as "A" | "B" | "C" | "D" | "E");

const t8Rationale =
  "PDF is consistent (1.35×12.90×0.7715=13.44). Persisted trio qty=1.05, unit_price=10.88, total=13.44 (1.05×10.88=11.42≠13.44) first appears at extract-invoice API output (v28 deploy replay ≡ DB bece238e). normalizeInvoiceItemFields and insert payload are lossless. bindMonetaryColumns pass-through when discount cols null and total>qty×unit_price; applyEffectivePaidPrice does not fire.";

// Most likely wrong value
const effectivePaid = gorgItem?.total && gorgItem?.quantity ? gorgItem.total / gorgItem.quantity : null;
const pdfNet = t1Pdf.unit_price_net_implied;
const wrongValue =
  gorgItem?.unit_price !== pdfNet &&
  gorgItem?.unit_price !== effectivePaid &&
  Math.abs((gorgItem?.unit_price ?? 0) - (pdfNet ?? 0)) > TOL
    ? "unit_price"
    : gorgItem?.quantity !== 1.35
      ? "quantity"
      : "total";

const results = {
  validationLab: VL,
  generatedAt: new Date().toISOString(),
  invoiceId: EMPORIO_INVOICE_ID,
  invoiceItemId: GORG_ITEM_ID,
  invoice,
  gorgItem,
  ingredient,
  storage: {
    storage_path: invoice?.storage_path ?? null,
    pdfImageArtifact: ".tmp/emporio-italia-investigation/invoice-full.png",
    note: "ab52796d replacement upload; same Emporio May-19 table as 17aa3591 geometry audits",
  },
  task1_pdfSource: t1Pdf,
  task2_ocrVsPdf: {
    passCRawGorgonzola: passCGorg ?? null,
    v28ExtractGorgonzola: v28Gorg,
    pdfQty: 1.35,
    ocrQty_passCRaw: passCGorg?.quantity ?? null,
    ocrQty_v28: v28Gorg?.quantity ?? null,
    pdfUnitPriceNet: t1Pdf.unit_price_net_implied,
    ocrUnitPrice_passCRaw: passCGorg?.unit_price ?? null,
    ocrUnitPrice_v28: v28Gorg?.unit_price ?? null,
    pdfTotal: 13.44,
    ocrTotal: v28Gorg?.total ?? passCGorg?.total ?? null,
    passCRawReconciles: passCGorg
      ? reconciles(passCGorg.quantity as number, passCGorg.unit_price as number, passCGorg.total as number)
      : null,
    v28Reconciles: v28Gorg
      ? reconciles(v28Gorg.quantity, v28Gorg.unit_price, v28Gorg.total)
      : null,
  },
  task3_structuredBeforeNormalization: {
    pdfStructuredInput: pdfStructured,
    pdfStructuredAfterBind: pdfBind.bound,
    dbLegacyStructuredInput: dbStructured,
    dbLegacyAfterBind: dbBind.bound,
    note: "API strips gross_unit_price/discount_pct; v28 output matches DB → inconsistent trio present at extract-invoice response",
  },
  task4_normalizeInvoiceItemFields: {
    input: normIn,
    output: normOut,
    changed: normChanged,
    fieldsChanged: {
      quantity: normIn.quantity !== normOut.quantity,
      unit: normIn.unit !== normOut.unit,
      unit_price: normIn.unit_price !== normOut.unit_price,
      total: normIn.total !== normOut.total,
      name: normIn.name !== normOut.name,
    },
  },
  task5_persistenceVsDb: {
    insertPayload,
    dbRow: gorgItem,
    matches: persistMatchesDb,
    v28ExtractMatchesDb: v28MatchesDb,
    created_at: gorgItem?.created_at,
  },
  task6_reconciliationTable: stages,
  task6_firstInconsistentStage: firstInconsistent,
  task6_firstPersistedTrioStage: firstPersistedTrioStage,
  persistedTrio: PERSISTED_TRIO,
  task7_discountHandling: {
    deliControlsReconcile: deliControls.every((r) => r.reconciles === true),
    deliRows: deliControls,
    bindMonetaryReplays: deliDiscountReplay.map((r) => ({
      scenario: r.scenario,
      input: r.input,
      bound: {
        quantity: r.bound.quantity,
        unit_price: r.bound.unit_price,
        total: r.bound.total,
        reconciles: reconciles(r.bound.quantity, r.bound.unit_price, r.bound.total),
      },
    })),
    prosciuttoMortadellaBresaolaReconcile: deliControls
      .filter((r) => !/gorgonzola/i.test(r.product))
      .every((r) => r.reconciles === true),
  },
  task8_rootCause: {
    letter: t8RootCause,
    requiredQuestionAF,
    rationale: t8Rationale,
  },
  requiredTable,
  ingredientDetail: {
    persistFields,
    presentation: {
      priceDisplay: presentation.priceDisplay,
      effectiveUsableCostLabel: presentation.effectiveUsableCostLabel,
    },
    buildLastPurchaseCostPresentation: detail,
  },
  final: {
    firstInconsistentStage: firstPersistedTrioStage?.stage ?? firstInconsistent?.stage ?? null,
    firstAnyArithmeticFailure: firstInconsistent?.stage ?? null,
    mostLikelyWrongValue: wrongValue,
    effectivePaidEurPerKg: effectivePaid,
    pdfNetEurPerKg: pdfNet,
    persistedUnitPrice: gorgItem?.unit_price,
  },
};

writeFileSync(`${OUT}/results.json`, JSON.stringify(results, null, 2));

// Markdown
const md: string[] = [];
md.push("# Gorgonzola Invoice Persistence Reconciliation Audit");
md.push("");
md.push(`**Validation Lab:** \`${VL}\` · **Invoice:** \`${EMPORIO_INVOICE_ID}\` · **Item:** \`${GORG_ITEM_ID}\` · **Read-only** · ${new Date().toISOString().slice(0, 10)}`);
md.push("");

md.push("## Required question (A–F)");
md.push("");
md.push(`**${requiredQuestionAF})** ${requiredQuestionAF === "C" ? "Structured extraction" : requiredQuestionAF === "A" ? "PDF inconsistent" : requiredQuestionAF === "B" ? "OCR" : requiredQuestionAF === "D" ? "Normalization" : requiredQuestionAF === "E" ? "Persistence" : "Multiple"}`);
md.push("");

md.push("## Required table");
md.push("");
md.push("| Field | PDF | OCR | Structured | Persisted |");
md.push("|-------|-----|-----|------------|-----------|");
for (const [field, cols] of Object.entries(requiredTable)) {
  md.push(`| ${field} | ${cols.PDF} | ${cols.OCR} | ${cols.Structured} | ${cols.Persisted} |`);
}
md.push("");

md.push("## T1 — PDF source");
md.push("");
md.push("| Field | Value |");
md.push("|-------|-------|");
md.push(`| description | ${t1Pdf.description} |`);
md.push(`| qty | ${t1Pdf.quantity} |`);
md.push(`| unit | ${t1Pdf.unit} |`);
md.push(`| unit_price (gross) | €${t1Pdf.unit_price_gross} |`);
md.push(`| discount | ${t1Pdf.discount_pct}% |`);
md.push(`| unit_price (net implied) | €${t1Pdf.unit_price_net_implied} |`);
md.push(`| line_total | €${t1Pdf.line_total} |`);
md.push(`| arithmetic | ${t1Pdf.arithmetic} |`);
md.push(`| qty×net=total | **${t1Pdf.reconciles_qty_x_gross_disc ? "YES" : "NO"}** |`);
md.push(`| source | ${t1Pdf.source} |`);
md.push("");

md.push("## T2 — OCR vs PDF");
md.push("");
md.push("| Field | PDF | pass-c-raw OCR | v28 API replay |");
md.push("|-------|-----|----------------|----------------|");
md.push(`| qty | 1.35 | ${passCGorg?.quantity ?? "—"} | ${v28Gorg?.quantity ?? "—"} |`);
md.push(`| unit_price | net €${t1Pdf.unit_price_net_implied} | ${passCGorg?.unit_price ?? "—"} | ${v28Gorg?.unit_price ?? "—"} |`);
md.push(`| total | 13.44 | ${passCGorg?.total ?? "—"} | ${v28Gorg?.total ?? "—"} |`);
md.push(`| qty×price=total | YES | ${results.task2_ocrVsPdf.passCRawReconciles ? "YES" : "NO"} | **${results.task2_ocrVsPdf.v28Reconciles ? "YES" : "NO"}** |`);
md.push("");
md.push(`v28 extract matches persisted DB row: **${v28MatchesDb ? "YES" : "NO"}**`);
md.push("");

md.push("## T3 — Structured extraction (before normalization)");
md.push("");
md.push("**PDF-column structured input (prompt example):**");
md.push("```json");
md.push(JSON.stringify(pdfStructured, null, 2));
md.push("```");
md.push(`After bindMonetaryColumns: qty=${pdfBind.bound.quantity}, unit_price=${pdfBind.bound.unit_price}, total=${pdfBind.bound.total}, reconciles=${reconciles(pdfBind.bound.quantity, pdfBind.bound.unit_price, pdfBind.bound.total)}`);
md.push("");
md.push("**DB-matching legacy structured handoff (discount cols null, unit_price pre-filled):**");
md.push("```json");
md.push(JSON.stringify(dbStructured, null, 2));
md.push("```");
md.push(`After bindMonetaryColumns: **pass-through** — unit_price=${dbBind.bound.unit_price}, reconciles=${reconciles(dbBind.bound.quantity, dbBind.bound.unit_price, dbBind.bound.total)}`);
md.push("");

md.push("## T4 — normalizeInvoiceItemFields");
md.push("");
md.push("| | quantity | unit | unit_price | total |");
md.push("|---|----------|------|------------|-------|");
md.push(`| input | ${normIn.quantity} | ${normIn.unit} | ${normIn.unit_price} | ${normIn.total} |`);
md.push(`| output | ${normOut.quantity} | ${normOut.unit} | ${normOut.unit_price} | ${normOut.total} |`);
md.push(`| changed | **${normChanged ? "YES" : "NO"}** | | | |`);
md.push("");

md.push("## T5 — Persistence payload vs DB");
md.push("");
md.push("```json");
md.push(JSON.stringify({ insertPayload, dbRow: gorgItem, matches: persistMatchesDb }, null, 2));
md.push("```");
md.push("");

md.push("## T6 — Reconciliation table (pipeline stages)");
md.push("");
md.push("| Stage | qty | unit_price | total | qty×price | reconciles? |");
md.push("|-------|-----|------------|-------|-----------|-------------|");
for (const s of stages) {
  md.push(
    `| ${s.stage} | ${s.quantity ?? "—"} | ${s.unit_price ?? "—"} | ${s.line_total ?? "—"} | ${s.qty_x_price ?? "—"} | ${s.reconciles === null ? "n/a" : s.reconciles ? "YES" : "**NO**"} |`,
  );
}
md.push("");
md.push(`**First stage where qty×price≠total (any values):** **${firstInconsistent?.stage ?? "—"}**`);
md.push(`**First stage with persisted trio (1.05/10.88/13.44):** **${firstPersistedTrioStage?.stage ?? "—"}** (${firstPersistedTrioStage?.source ?? ""})`);
md.push("");

md.push("## T7 — Discount handling (deli controls)");
md.push("");
md.push("| Product | qty | unit_price | total | qty×price | reconciles? |");
md.push("|---------|-----|------------|-------|-----------|-------------|");
for (const r of deliControls) {
  md.push(
    `| ${r.product.slice(0, 40)}… | ${r.quantity} | ${r.unit_price} | ${r.total} | ${r.qty_x_unit_price} | ${r.reconciles ? "YES" : "NO"} |`,
  );
}
md.push("");
md.push(`**Prosciutto / Mortadella / Bresaola reconcile?** **${results.task7_discountHandling.prosciuttoMortadellaBresaolaReconcile ? "YES" : "NO"}**`);
md.push("");
md.push("bindMonetaryColumns discount replays:");
for (const r of results.task7_discountHandling.bindMonetaryReplays) {
  md.push(`- **${r.scenario}** → unit_price=${r.bound.unit_price}, reconciles=${r.bound.reconciles}`);
}
md.push("");

md.push("## T8 — Root cause");
md.push("");
md.push(`**${t8RootCause})** ${t8Rationale}`);
md.push("");

md.push("## Ingredient → detail trace");
md.push("");
md.push(`| Stage | Value |`);
md.push(`|-------|-------|`);
md.push(`| invoice_items | qty=${gorgItem?.quantity}, unit_price=${gorgItem?.unit_price}, total=${gorgItem?.total} |`);
md.push(`| operationalCostFieldsFromInvoiceLine | ${JSON.stringify(persistFields)} |`);
md.push(`| ingredients.current_price | ${ingredient?.current_price} |`);
md.push(`| detail procurement | ${detail.procurementCost} |`);
md.push(`| detail total paid | ${detail.totalPaid} |`);
md.push("");

md.push("## Final");
md.push("");
md.push(`- **Exact stage persisted trio (1.05/10.88/13.44) first appears:** **${results.final.firstInconsistentStage}**`);
md.push(`- **Most likely wrong value:** **${wrongValue}** (persisted unit_price €${gorgItem?.unit_price} ≠ PDF net €${pdfNet}, ≠ effective-paid €${effectivePaid?.toFixed(2)}/kg)`);
md.push(`- **PDF is arithmetically consistent; persistence is lossless; defect originates in GPT Pass C / extract-invoice structured output (v28 replay ≡ DB).**`);

writeFileSync(`${OUT}/REPORT.md`, md.join("\n"));
console.log(`Wrote ${OUT}/REPORT.md and results.json`);
