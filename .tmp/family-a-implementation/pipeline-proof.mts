/**
 * Family A Phase 1 — offline pipeline proof (no GPT call).
 * Proves post-GPT stages never mutate quantity when GPT emits qty=2.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  bindMonetaryColumns,
  monetaryToInvoiceLineItem,
  parseMonetaryLineItems,
} from "../../supabase/functions/extract-invoice/invoice-monetary-binding.ts";
import {
  reconcileLineItemAmounts,
} from "../../supabase/functions/extract-invoice/invoice-line-reconcile.ts";
import { finalizeExtractedLineItems } from "../../supabase/functions/extract-invoice/invoice-table-extraction.ts";

const __dir = dirname(fileURLToPath(import.meta.url));

function traceQty(
  label: string,
  items: Array<{ name: string; quantity: number | null }>,
  pattern: RegExp,
) {
  const row = items.find((i) => pattern.test(i.name));
  return { stage: label, quantity: row?.quantity ?? null };
}

function runPipeline(gptItems: Array<Record<string, unknown>>) {
  const postNormalize = parseMonetaryLineItems(gptItems);
  const postBind = bindMonetaryColumns(postNormalize);
  const postReconcile = reconcileLineItemAmounts(postBind.map(monetaryToInvoiceLineItem));
  const postFinalize = finalizeExtractedLineItems(postReconcile, null);
  return { postNormalize, postBind, postReconcile, postFinalize };
}

// Simulate Hybrid H GPT raw output for Family A failures (v25 bad path)
const syntheticGptQty2 = [
  {
    name: "MEZZI PACCHERI MANCINI (CX 1KG*6)",
    quantity: 2,
    unit: "uni",
    gross_unit_price: null,
    discount_pct: null,
    line_total_net: null,
  },
  {
    name: "RICOTTA TREVIGIANA 1,5KG",
    quantity: 2,
    unit: "uni",
    gross_unit_price: null,
    discount_pct: null,
    line_total_net: null,
  },
  {
    name: "POMODORI PELATI (CX 2,5KG*6)",
    quantity: 1,
    unit: "uni",
    gross_unit_price: null,
    discount_pct: null,
    line_total_net: null,
  },
  {
    name: "ROLO DE CABRA E VACA 1KG",
    quantity: 1,
    unit: "uni",
    gross_unit_price: null,
    discount_pct: null,
    line_total_net: null,
  },
  {
    name: "ACQUA S.PELLEGRINO (CX 75CL*15)",
    quantity: 2,
    unit: "uni",
    gross_unit_price: null,
    discount_pct: null,
    line_total_net: null,
  },
];

const pipeline = runPipeline(syntheticGptQty2);
const mezziPattern = /mezzi paccheri/i;
const ricottaPattern = /ricotta/i;

const mezziTrace = [
  traceQty("rawGpt", syntheticGptQty2 as Array<{ name: string; quantity: number | null }>, mezziPattern),
  traceQty("postNormalize", pipeline.postNormalize, mezziPattern),
  traceQty("postBind", pipeline.postBind, mezziPattern),
  traceQty("postReconcile", pipeline.postReconcile, mezziPattern),
  traceQty("postFinalize", pipeline.postFinalize, mezziPattern),
];

const ricottaTrace = [
  traceQty("rawGpt", syntheticGptQty2 as Array<{ name: string; quantity: number | null }>, ricottaPattern),
  traceQty("postNormalize", pipeline.postNormalize, ricottaPattern),
  traceQty("postBind", pipeline.postBind, ricottaPattern),
  traceQty("postReconcile", pipeline.postReconcile, ricottaPattern),
  traceQty("postFinalize", pipeline.postFinalize, ricottaPattern),
];

const bEliminated =
  mezziTrace.every((s) => s.quantity === 2) &&
  ricottaTrace.every((s) => s.quantity === 2);

const passcRaw = JSON.parse(
  readFileSync(
    join(__dir, "../persistence-audit/pass-c-raw/f0aa5a08-86a3-4938-99f0-711e86073968-gpt-raw-cache.json"),
    "utf8",
  ),
);

const v25Extract = JSON.parse(
  readFileSync(
    join(__dir, "../final-validation-lab-rerun/extracts/f0aa5a08-86a3-4938-99f0-711e86073968.json"),
    "utf8",
  ),
);

const pick = (items: Array<{ name: string; quantity: number }>, p: RegExp) =>
  items.find((i) => p.test(i.name))?.quantity ?? null;

const result = {
  generatedAt: new Date().toISOString(),
  proof: bEliminated ? "A (inferred)" : "B",
  proofDetail: bEliminated
    ? "Post-processing preserves qty=2 through all stages when GPT emits qty=2; v25 final qty=2 + Pass C qty=1 implies GPT authored qty=2 at Hybrid H"
    : "Post-processing mutated quantity",
  bEliminated,
  mezziTrace,
  ricottaTrace,
  passCBaseline: {
    mezzi: pick(passcRaw.items, mezziPattern),
    ricotta: pick(passcRaw.items, ricottaPattern),
  },
  hybridHFinal: {
    mezzi: pick(v25Extract.items, mezziPattern),
    ricotta: pick(v25Extract.items, ricottaPattern),
  },
  edgeInvokeV36: JSON.parse(
    readFileSync(join(__dir, "../family-a-v25-raw-capture/edge-invoke-final.json"), "utf8"),
  ).ricotta?.quantity,
  liveGptCapturePending: true,
};

writeFileSync(join(__dir, "capture-result.json"), JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
