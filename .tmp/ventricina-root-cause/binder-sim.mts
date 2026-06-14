import {
  parseMonetaryLineItems,
  bindMonetaryColumns,
  monetaryToInvoiceLineItem,
} from "../../supabase/functions/extract-invoice/invoice-monetary-binding.ts";

const scenarios = [
  { label: "v24_run1_gross21", gpt: { name: "Ventricina", quantity: 2.6, gross_unit_price: 21, discount_pct: null, line_total_net: null, unit_price: null, total: null } },
  { label: "v24_run2_gross20_2", gpt: { name: "Ventricina", quantity: 2.6, gross_unit_price: 20.2, discount_pct: null, line_total_net: null, unit_price: null, total: null } },
  { label: "v24_run3_wrong_total", gpt: { name: "Ventricina", quantity: 2.6, gross_unit_price: 16.6, discount_pct: null, line_total_net: 46.09, unit_price: null, total: null } },
  { label: "v23_bleed_17_5_legacy", gpt: { name: "Ventricina", quantity: 2.6, gross_unit_price: 16.6, discount_pct: null, line_total_net: null, unit_price: 17.5, total: 45.5 } },
  { label: "v23_bleed_structured", gpt: { name: "Ventricina", quantity: 2.6, gross_unit_price: 16.6, discount_pct: 17.5, line_total_net: null, unit_price: 17.5, total: null } },
  { label: "correct_structured", gpt: { name: "Ventricina", quantity: 2.6, gross_unit_price: 16.6, discount_pct: 8.5, line_total_net: 39.49, unit_price: null, total: null } },
  { label: "discount_null_total_correct", gpt: { name: "Ventricina", quantity: 2.6, gross_unit_price: 16.6, discount_pct: null, line_total_net: 39.49, unit_price: null, total: null } },
  { label: "8_5_as_gross", gpt: { name: "Ventricina", quantity: 2.6, gross_unit_price: 8.5, discount_pct: null, line_total_net: null, unit_price: null, total: null } },
  { label: "8_5_ruleB_bleed", gpt: { name: "Ventricina", quantity: 2.6, gross_unit_price: 16.6, discount_pct: 8.5, line_total_net: 39.49, unit_price: 8.5, total: 39.49 } },
  { label: "prosciutto_neighbour_bleed", gpt: { name: "Ventricina", quantity: 2.6, gross_unit_price: 16.6, discount_pct: 17.5, line_total_net: 39.49, unit_price: 17.5, total: 39.49 } },
  { label: "gross_only_no_discount", gpt: { name: "Ventricina", quantity: 2.6, gross_unit_price: 16.6, discount_pct: null, line_total_net: null, unit_price: null, total: null } },
];

const results = scenarios.map((s) => {
  const bound = bindMonetaryColumns(parseMonetaryLineItems([s.gpt]));
  return { scenario: s.label, input: s.gpt, output: monetaryToInvoiceLineItem(bound[0]) };
});

console.log(JSON.stringify(results, null, 2));
