import {
  bindMonetaryColumns,
  monetaryToInvoiceLineItem,
  parseMonetaryLineItems,
} from "../../supabase/functions/extract-invoice/invoice-monetary-binding.ts";
import { reconcileLineItemAmounts } from "../../supabase/functions/extract-invoice/invoice-line-reconcile.ts";

type Stage = { stage: string; pomodor: Record<string, unknown> | null };

function pickPomodor(arr: Array<Record<string, unknown>>, label: string): Stage {
  const row = arr.find((it) => /pomodor/i.test(String(it.name ?? ""))) ?? null;
  return { stage: label, pomodor: row };
}

function traceScenario(scenario: string, gptItems: Array<Record<string, unknown>>) {
  const stages: Stage[] = [];
  stages.push(pickPomodor(gptItems, "1_gpt_raw_json"));

  const parsed = parseMonetaryLineItems(gptItems);
  stages.push(pickPomodor(parsed as unknown as Array<Record<string, unknown>>, "2_parseMonetaryLineItems"));

  const bound = bindMonetaryColumns(parsed);
  stages.push(pickPomodor(bound as unknown as Array<Record<string, unknown>>, "3_bindMonetaryColumns"));

  const legacy = bound.map(monetaryToInvoiceLineItem);
  stages.push(pickPomodor(legacy as unknown as Array<Record<string, unknown>>, "4_monetaryToInvoiceLineItem"));

  const reconciled = reconcileLineItemAmounts(legacy);
  stages.push(pickPomodor(reconciled as unknown as Array<Record<string, unknown>>, "5_reconcileLineItemAmounts"));

  return { scenario, stages };
}

const scenarios = [
  traceScenario("A_gpt_structured_correct", [
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
  ]),
  traceScenario("B_gpt_legacy_only_v22_actual", [
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
  ]),
  traceScenario("C_gpt_structured_plus_legacy_valor_bleed", [
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
  ]),
  traceScenario("D_gpt_desc_bleed_with_structured", [
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
  ]),
];

console.log(JSON.stringify(scenarios, null, 2));
