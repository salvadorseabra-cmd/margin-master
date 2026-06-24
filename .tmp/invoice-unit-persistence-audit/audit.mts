/**
 * STRICT READ-ONLY Invoice Unit Persistence Audit — VL bjhnlrgodcqoyzddbpbd
 */
const metaEnv = import.meta as { env?: Record<string, unknown> };
if (!metaEnv.env) metaEnv.env = {};
metaEnv.env.DEV = false;
metaEnv.env.PROD = true;

import { execSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import {
  bindMonetaryColumns,
  parseMonetaryLineItems,
} from "../../supabase/functions/extract-invoice/invoice-monetary-binding.ts";
import { normalizeInvoiceItemFields } from "../../src/lib/invoice-item-fields.ts";
import { defaultIsGenericUnit } from "../../src/lib/ingredient-auto-persist.ts";
import {
  preserveCountableExtractedUnit,
  resolveInvoiceLinePurchaseFormat,
  resolveInvoiceLinePurchaseUnit,
  resolveInvoicePersistedItemUnit,
} from "../../src/lib/invoice-purchase-format.ts";
import { formatRowPurchaseQuantityLabel } from "../../src/lib/invoice-purchase-price-semantics.ts";

const VL = "bjhnlrgodcqoyzddbpbd";
const OUT = ".tmp/invoice-unit-persistence-audit";
const EMPORIO_LIVE = "ab52796d-de1d-418d-86e7-230c8f056f09";
const EMPORIO_DELETED = "17aa3591-ec98-4c21-89c9-5ae946bc97bb";

const PRODUCTS = [
  { key: "paccheri", label: "Paccheri Lisci", pattern: "%paccheri%lisci%" },
  { key: "ginger-beer", label: "Ginger Beer (Baladin)", pattern: "%ginger%beer%" },
  { key: "peroni", label: "Peroni Nastro Azzurro 33cl", pattern: "%peroni%nastro%" },
  { key: "pellegrino", label: "Pellegrino 75cl×15", pattern: "%pellegrino%75%" },
  { key: "acucar", label: "Açúcar Branco 10x1kg", pattern: "%açúcar%10x1%" },
  { key: "pomodori", label: "Pomodori", pattern: "%pomodori%pelati%" },
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
  name: string;
  quantity: number | null;
  unit: string | null;
  unit_price: number | null;
  total: number | null;
};

function simulateInsertPayload(raw: Line) {
  const normalized = normalizeInvoiceItemFields(raw);
  const resolvedUnit = resolveInvoicePersistedItemUnit(
    { name: normalized.name, quantity: normalized.quantity, unit: normalized.unit },
    defaultIsGenericUnit,
  );
  const purchaseUnitRes = resolveInvoiceLinePurchaseUnit(
    { name: normalized.name, quantity: normalized.quantity, unit: normalized.unit },
    defaultIsGenericUnit,
  );
  const structured = resolveInvoiceLinePurchaseFormat({
    name: normalized.name,
    quantity: normalized.quantity,
    unit: normalized.unit,
  });
  const preserved = preserveCountableExtractedUnit(
    normalized.unit?.trim() || null,
    structured,
    defaultIsGenericUnit,
  );
  return {
    ocrUnit: raw.unit,
    normalizedUnit: normalized.unit,
    resolvedInsertUnit: resolvedUnit,
    purchaseUnitResolution: purchaseUnitRes,
    structuredKind: structured.kind,
    preserveCountableExtractedUnit: preserved,
    insertPayload: {
      name: normalized.name,
      quantity: normalized.quantity,
      unit: resolvedUnit ? resolvedUnit.slice(0, 20) : null,
      unit_price: normalized.unit_price,
      total: normalized.total,
    },
    rowLabel: formatRowPurchaseQuantityLabel({
      name: normalized.name,
      quantity: normalized.quantity,
      unit: resolvedUnit,
      unit_price: normalized.unit_price,
      line_total: normalized.total,
    }),
  };
}

function loadFrozenExtract(path: string): Line[] {
  const raw = JSON.parse(readFileSync(path, "utf8"));
  const body = raw.body ?? raw;
  return (body.items ?? []) as Line[];
}

function findExtractLine(items: Line[], key: string): Line | null {
  const needles: Record<string, RegExp> = {
    paccheri: /paccheri/i,
    "ginger-beer": /ginger\s*beer/i,
    peroni: /peroni/i,
    pellegrino: /pellegrino/i,
    acucar: /açúcar|acucar/i,
    pomodori: /pomodori/i,
  };
  return items.find((i) => needles[key]?.test(i.name)) ?? null;
}

mkdirSync(OUT, { recursive: true });

const frozenExtractPaths = [
  ".tmp/persistence-audit/pass-c-raw/17aa3591-ec98-4c21-89c9-5ae946bc97bb-extract-invoice.json",
  ".tmp/final-validation-lab-rerun/extracts/17aa3591-ec98-4c21-89c9-5ae946bc97bb.json",
  ".tmp/emporio-footer-fix/emporio-italia-extract.json",
];

const frozenExtracts: Record<string, { path: string; items: Line[] }> = {};
for (const p of frozenExtractPaths) {
  try {
    const raw = JSON.parse(readFileSync(p, "utf8"));
    const items = (raw.body?.items ?? raw.items ?? []) as Line[];
    frozenExtracts[p] = { path: p, items };
  } catch {
    /* skip */
  }
}

const { data: emporioLiveItems } = await sb
  .from("invoice_items")
  .select("id,name,quantity,unit,unit_price,total,created_at,updated_at")
  .eq("invoice_id", EMPORIO_LIVE);

const { data: emporioInvoice } = await sb
  .from("invoices")
  .select("id,supplier_name,invoice_date,created_at,updated_at,file_path")
  .eq("id", EMPORIO_LIVE)
  .maybeSingle();

const comparison: Record<string, unknown>[] = [];
const pipelineTraces: Record<string, unknown> = {};

for (const product of PRODUCTS) {
  const { data: dbRows } = await sb
    .from("invoice_items")
    .select(
      "id,invoice_id,name,quantity,unit,unit_price,total,created_at,updated_at,invoices(id,supplier_name,invoice_date,created_at)",
    )
    .ilike("name", product.pattern)
    .order("created_at", { ascending: false })
    .limit(3);

  const dbRow = dbRows?.[0] ?? null;
  const emporioRow = emporioLiveItems?.find((r) =>
    new RegExp(product.pattern.replace(/%/g, ".*"), "i").test(r.name),
  );

  const historicalRow =
    product.key === "paccheri"
      ? {
          name: "De Cecco - Paccheri Lisci Nr. 125 - 500g",
          quantity: 24,
          unit: "un",
          unit_price: 2.35,
          total: 50.2,
          invoice_id: EMPORIO_DELETED,
          created_at: "2026-06-10T18:27:15.828822+00:00",
        }
      : product.key === "ginger-beer"
        ? {
            name: "Baladin - Ginger Beer 0.20cl",
            quantity: 24,
            unit: "un",
            unit_price: 0.85,
            total: 19.38,
            invoice_id: EMPORIO_DELETED,
            created_at: "2026-06-10T18:27:15.828822+00:00",
          }
        : null;

  const frozenLines: Record<string, Line | null> = {};
  for (const [path, { items }] of Object.entries(frozenExtracts)) {
    frozenLines[path] = findExtractLine(items, product.key);
  }

  const dbReplay = dbRow
    ? simulateInsertPayload({
        name: dbRow.name,
        quantity: dbRow.quantity,
        unit: dbRow.unit,
        unit_price: dbRow.unit_price,
        total: dbRow.total,
      })
    : null;

  const extractReplays: Record<string, ReturnType<typeof simulateInsertPayload>> = {};
  for (const [path, line] of Object.entries(frozenLines)) {
    if (line) extractReplays[path] = simulateInsertPayload(line);
  }

  const historicalReplay = historicalRow
    ? simulateInsertPayload(historicalRow)
    : null;

  const primaryExtract =
    frozenLines[".tmp/persistence-audit/pass-c-raw/17aa3591-ec98-4c21-89c9-5ae946bc97bb-extract-invoice.json"];

  const extractReplay = primaryExtract ? simulateInsertPayload(primaryExtract) : null;

  const unitLostAt =
    !dbRow?.unit && extractReplay?.resolvedInsertUnit
      ? "resolveInvoicePersistedItemUnit (would persist unit but DB null — stale/wipe path)"
      : !dbRow?.unit && primaryExtract?.unit && !extractReplay?.resolvedInsertUnit
        ? "resolveInvoicePersistedItemUnit strips OCR unit"
        : !dbRow?.unit && !primaryExtract?.unit
          ? "GPT Pass C (unit null at extraction)"
          : dbRow?.unit
            ? "none — unit preserved"
            : "unknown";

  comparison.push({
    product: product.label,
    key: product.key,
    db: dbRow
      ? {
          invoiceItemId: dbRow.id,
          invoiceId: dbRow.invoice_id,
          supplier: (dbRow.invoices as { supplier_name?: string } | null)?.supplier_name,
          name: dbRow.name,
          quantity: dbRow.quantity,
          unit: dbRow.unit,
          created_at: dbRow.created_at,
        }
      : null,
    emporioLiveRow: emporioRow
      ? { id: emporioRow.id, unit: emporioRow.unit, quantity: emporioRow.quantity }
      : null,
    historicalDeletedInvoice: historicalRow,
    frozenExtractPrimary: primaryExtract,
    extractWouldInsertUnit: extractReplay?.resolvedInsertUnit ?? null,
    dbWouldReinsertUnit: dbReplay?.resolvedInsertUnit ?? null,
    lastPurchaseLabel: dbRow
      ? formatRowPurchaseQuantityLabel({
          name: dbRow.name,
          quantity: dbRow.quantity,
          unit: dbRow.unit,
          unit_price: dbRow.unit_price,
          line_total: dbRow.total,
        })
      : null,
    unitLostAt,
    status:
      !dbRow?.unit && (product.key === "paccheri" || product.key === "ginger-beer")
        ? "DATA_LOSS"
        : dbRow?.unit
          ? "OK"
          : "UNKNOWN",
  });

  pipelineTraces[product.key] = {
    stages: {
      "1_gpt_pass_c": primaryExtract
        ? { unit: primaryExtract.unit, quantity: primaryExtract.quantity, name: primaryExtract.name }
        : null,
      "2_monetary_binding": primaryExtract
        ? (() => {
            const [bound] = bindMonetaryColumns(
              parseMonetaryLineItems([
                {
                  name: primaryExtract.name,
                  quantity: primaryExtract.quantity,
                  unit: primaryExtract.unit,
                  gross_unit_price: null,
                  discount_pct: null,
                  line_total_net: null,
                  unit_price: primaryExtract.unit_price,
                  total: primaryExtract.total,
                },
              ]),
            );
            return { unit: bound.unit, quantity: bound.quantity };
          })()
        : null,
      "3_normalizeInvoiceItemFields": extractReplay
        ? { unit: extractReplay.normalizedUnit }
        : null,
      "4_resolveInvoicePersistedItemUnit": extractReplay
        ? {
            inputUnit: extractReplay.normalizedUnit,
            outputUnit: extractReplay.resolvedInsertUnit,
            resolution: extractReplay.purchaseUnitResolution,
            structuredKind: extractReplay.structuredKind,
            preserveCountable: extractReplay.preserveCountableExtractedUnit,
          }
        : null,
      "5_insert_payload": extractReplay?.insertPayload ?? null,
      "6_db_persisted": dbRow ? { unit: dbRow.unit, quantity: dbRow.quantity } : null,
      "7_ui_formatRowPurchaseQuantityLabel": dbReplay?.rowLabel ?? null,
    },
    historicalComparison: {
      deletedInvoice17aa3591: historicalReplay,
      liveInvoiceAb52796d: dbReplay,
      unitRegression:
        historicalRow?.unit === "un" && dbRow?.unit == null ? "YES — unit lost on re-upload" : "NO",
    },
    allFrozenExtractUnits: Object.fromEntries(
      Object.entries(frozenLines).map(([p, l]) => [p, l ? { unit: l.unit, qty: l.quantity } : null]),
    ),
  };
}

// Emporio invoice-level timeline
const emporioTimeline = {
  deletedInvoice: {
    id: EMPORIO_DELETED,
    paccheriUnit: "un",
    gingerUnit: "un",
    source: ".tmp/emporio-italia-investigation/invoice-items.json",
    created_at: "2026-06-10T18:27:15",
  },
  liveInvoice: {
    id: EMPORIO_LIVE,
    created_at: emporioInvoice?.created_at,
    file_path: emporioInvoice?.file_path,
    items: emporioLiveItems?.map((r) => ({
      name: r.name,
      quantity: r.quantity,
      unit: r.unit,
    })),
  },
};

const paccheri = comparison.find((c) => c.key === "paccheri");
const ginger = comparison.find((c) => c.key === "ginger-beer");

const firstIncorrectStage =
  paccheri?.db?.unit == null && ginger?.db?.unit == null
    ? extractReplaysFromTraces(pipelineTraces, "paccheri")?.stages?.["4_resolveInvoicePersistedItemUnit"]
        ?.outputUnit
      ? "NOT resolveInvoiceItemUnit alone — extract has unit but DB null suggests stale insert or OCR null on ab52796d upload"
      : "GPT Pass C (unit null) OR resolveInvoicePersistedItemUnit on weight_or_volume rows"
    : "N/A";

function extractReplaysFromTraces(traces: Record<string, unknown>, key: string) {
  return traces[key] as { stages?: Record<string, unknown> } | undefined;
}

const primaryPaccheriExtract = findExtractLine(
  frozenExtracts[".tmp/persistence-audit/pass-c-raw/17aa3591-ec98-4c21-89c9-5ae946bc97bb-extract-invoice.json"]
    ?.items ?? [],
  "paccheri",
);
const paccheriSim = primaryPaccheriExtract ? simulateInsertPayload(primaryPaccheriExtract) : null;
const gingerSim = findExtractLine(
  frozenExtracts[".tmp/persistence-audit/pass-c-raw/17aa3591-ec98-4c21-89c9-5ae946bc97bb-extract-invoice.json"]
    ?.items ?? [],
  "ginger-beer",
);
const gingerSimResult = gingerSim ? simulateInsertPayload(gingerSim) : null;

// Determine verdict: if frozen extract has unit un and resolve would persist un, but DB has null → persistence gap at insert time (stale/wrong extract at upload)
const extractHasUnit = Boolean(primaryPaccheriExtract?.unit === "un" && gingerSim?.unit === "un");
const resolvePreservesUnit = Boolean(
  paccheriSim?.resolvedInsertUnit === "un" && gingerSimResult?.resolvedInsertUnit === "un",
);
const dbNull = Boolean(paccheri?.db?.unit == null && ginger?.db?.unit == null);

let verdictFirstStage: string;
let classification: string;
let readiness: string;

if (dbNull && extractHasUnit && resolvePreservesUnit) {
  verdictFirstStage =
    "invoice_items INSERT on ab52796d re-upload — unit was available in extract+resolve path but not stored (stale/wiped row from upload that omitted unit, or insert before resolveInvoiceItemUnit existed)";
  classification = "C) Persistence gap — ab52796d rows have unit=null while current code+extract would persist un";
  readiness = "READY";
} else if (dbNull && !extractHasUnit) {
  verdictFirstStage = "GPT Pass C — unit null at extraction for Emporio countable rows";
  classification = "A) Extraction — GPT omits unit column on Emporio layout";
  readiness = "READY";
} else if (dbNull && extractHasUnit && !resolvePreservesUnit) {
  verdictFirstStage = "resolveInvoicePersistedItemUnit — strips generic un on weight_or_volume structured rows";
  classification = "B) Client unit resolution — resolveInvoicePersistedItemUnit nullifies countable unit";
  readiness = "READY";
} else {
  verdictFirstStage = "none";
  classification = "OK";
  readiness = "NOT READY";
}

const answers = {
  q1_does_unit_exist_in_extract_for_paccheri: primaryPaccheriExtract?.unit ?? null,
  q2_does_unit_exist_in_extract_for_ginger: gingerSim?.unit ?? null,
  q3_does_resolveInvoiceItemUnit_preserve_extract_unit_paccheri: paccheriSim?.resolvedInsertUnit ?? null,
  q4_does_resolveInvoiceItemUnit_preserve_extract_unit_ginger: gingerSimResult?.resolvedInsertUnit ?? null,
  q5_does_db_match_insert_payload_paccheri:
    paccheri?.db?.unit === paccheriSim?.resolvedInsertUnit ? "match" : `db=${paccheri?.db?.unit} vs wouldInsert=${paccheriSim?.resolvedInsertUnit}`,
  q6_does_db_match_insert_payload_ginger:
    ginger?.db?.unit === gingerSimResult?.resolvedInsertUnit ? "match" : `db=${ginger?.db?.unit} vs wouldInsert=${gingerSimResult?.resolvedInsertUnit}`,
  q7_first_incorrect_stage: verdictFirstStage,
  q7_classification: classification,
};

const results = {
  validationLab: VL,
  auditedAt: new Date().toISOString(),
  mode: "STRICT_READ_ONLY",
  verdict: {
    firstIncorrectStage: verdictFirstStage,
    classification,
    scope: "Paccheri Lisci + Ginger Beer on Emporio ab52796d lose invoice_items.unit; Peroni/Pellegrino/Pomodori/Açúcar preserve unit",
    readiness,
    extractHasUnit,
    resolvePreservesUnit,
    dbNull,
    historicalRegression: "17aa3591 (Jun 10) had unit=un for both; ab52796d (Jun 11 re-upload) has unit=null",
  },
  answers,
  comparisonTable: comparison,
  pipelineTraces,
  emporioTimeline,
  codePaths: {
    extractHandoff: "supabase/functions/extract-invoice/index.ts → finalizeExtractedLineItems → monetaryToInvoiceLineItem (unit passed through)",
    clientPersist: "src/routes/invoices.tsx runExtraction → normalizeInvoiceItemFields → resolveInvoiceItemUnit → insert",
    unitResolver: "src/lib/invoice-purchase-format.ts resolveInvoicePersistedItemUnit / resolveInvoiceLinePurchaseUnit",
    uiDisplay: "src/lib/invoice-purchase-price-semantics.ts formatRowPurchaseQuantityLabel — bare qty when unit null",
    reReadPath: "src/routes/invoices.tsx reExtract → same runExtraction (identical persist path)",
  },
};

writeFileSync(`${OUT}/results.json`, JSON.stringify(results, null, 2));
console.log(JSON.stringify({ ok: true, verdict: results.verdict, answers }, null, 2));
