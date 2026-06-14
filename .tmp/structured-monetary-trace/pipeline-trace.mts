/**
 * Local pipeline trace — structured monetary fields (read-only, no GPT).
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const OUT = join(import.meta.dirname ?? ".", ".");

// Dynamic import via deno for binding functions
const deno = ".tmp/deno/bin/deno";
const { execSync } = await import("node:child_process");

function runDenoTrace(scenario: string, gptItems: unknown) {
  const script = `
import {
  parseMonetaryLineItems,
  bindMonetaryColumns,
  monetaryToInvoiceLineItem,
} from "../../supabase/functions/extract-invoice/invoice-monetary-binding.ts";
import {
  reconcileLineItemAmounts,
} from "../../supabase/functions/extract-invoice/invoice-line-reconcile.ts";

const gptItems = ${JSON.stringify(gptItems)};
const pomodorIdx = gptItems.findIndex((it) => /pomodor/i.test(it.name ?? ""));

function pickPomodor(arr, label) {
  const row = arr.find((it) => /pomodor/i.test(it.name ?? "")) ?? null;
  return { stage: label, pomodor: row };
}

const stages = [];
stages.push(pickPomodor(gptItems, "1_gpt_raw_json"));

const parsed = parseMonetaryLineItems(gptItems);
stages.push(pickPomodor(parsed, "2_parseMonetaryLineItems"));

const bound = bindMonetaryColumns(parsed);
stages.push(pickPomodor(bound, "3_bindMonetaryColumns"));

const legacy = bound.map(monetaryToInvoiceLineItem);
stages.push(pickPomodor(legacy, "4_monetaryToInvoiceLineItem"));

const reconciled = reconcileLineItemAmounts(legacy);
stages.push(pickPomodor(reconciled, "5_reconcileLineItemAmounts"));

console.log(JSON.stringify({ scenario: "${scenario}", stages }, null, 2));
`;

  const out = execSync(`${deno} eval --allow-read=. ${JSON.stringify(script)}`, {
    encoding: "utf8",
    cwd: "/Users/salvadorseabra1/margin-master",
  });
  return JSON.parse(out);
}

mkdirSync(OUT, { recursive: true });

const scenarios = {
  A_gpt_structured_correct: [
    {
      name: "MEZZI PACCHERI MANCINI (CX 1KG*6)",
      quantity: 1,
      unit: "uni",
      gross_unit_price: 27.56,
      discount_pct: null,
      line_total_net: 27.3,
      unit_price: null,
      total: null,
    },
    {
      name: "POMODORI PELATI (CX 2,5KG*6)",
      quantity: 1,
      unit: "uni",
      gross_unit_price: 27.56,
      discount_pct: 20,
      line_total_net: 22.05,
      unit_price: null,
      total: null,
    },
  ],
  B_gpt_legacy_only_v22_actual: [
    {
      name: "MEZZI PACCHERI MANCINI (CX 1KG*6)",
      quantity: 1,
      unit: "uni",
      unit_price: 27.56,
      total: 27.3,
    },
    {
      name: "POMODORI PELATI (CX 2,5KG*6)",
      quantity: 1,
      unit: "uni",
      unit_price: 22.05,
      total: 22.05,
    },
  ],
  C_gpt_structured_plus_legacy_valor_bleed: [
    {
      name: "POMODORI PELATI (CX 2,5KG*6)",
      quantity: 1,
      unit: "uni",
      gross_unit_price: 27.56,
      discount_pct: 20,
      line_total_net: 22.05,
      unit_price: 22.05,
      total: 22.05,
    },
  ],
  D_gpt_desc_bleed_legacy: [
    {
      name: "POMODORI PELATI (CX 2,5KG*6)",
      quantity: 2,
      unit: "uni",
      gross_unit_price: 27.56,
      discount_pct: 20,
      line_total_net: 40,
      unit_price: 20,
      total: 40,
    },
  ],
};

const results = Object.fromEntries(
  Object.entries(scenarios).map(([k, v]) => [k, runDenoTrace(k, v)]),
);

writeFileSync(join(OUT, "pipeline-trace.json"), JSON.stringify(results, null, 2));
console.log("wrote pipeline-trace.json");
