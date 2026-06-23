import { bindMonetaryColumns, parseMonetaryLineItems } from "../supabase/functions/extract-invoice/invoice-monetary-binding.ts";

const cases = [
  {
    label: "gross only",
    row: {
      name: "Paccheri",
      quantity: 24,
      unit: null,
      gross_unit_price: 2.35,
      discount_pct: null,
      line_total_net: 50.4,
      unit_price: 2.35,
      total: 50.4,
    },
  },
  {
    label: "gross + discount",
    row: {
      name: "Paccheri",
      quantity: 24,
      unit: null,
      gross_unit_price: 2.35,
      discount_pct: 10,
      line_total_net: 50.4,
      unit_price: 2.35,
      total: 50.4,
    },
  },
];

for (const c of cases) {
  const [b] = bindMonetaryColumns(parseMonetaryLineItems([c.row]));
  console.log(c.label, "=>", b.unit_price);
}
