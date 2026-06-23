import { bindMonetaryColumns, parseMonetaryLineItems } from "../supabase/functions/extract-invoice/invoice-monetary-binding.ts";

const rows = [
  { name: "Courgettes", quantity: 3.3, unit: "kg", unit_price: 1.95, total: 5.15 },
  { name: "Alho Francês", quantity: 5.42, unit: "kg", unit_price: 1.77, total: 7.67 },
  { name: "Manjericão", quantity: 5, unit: null, unit_price: 2.57, total: 10.28 },
  { name: "Paccheri", quantity: 24, unit: null, unit_price: 2.35, total: 50.4 },
  { name: "Gorgonzola", quantity: 2, unit: null, unit_price: 10.22, total: 13.44 },
];

for (const row of rows) {
  const [b] = bindMonetaryColumns(
    parseMonetaryLineItems([
      {
        ...row,
        gross_unit_price: null,
        discount_pct: null,
        line_total_net: null,
      },
    ]),
  );
  console.log(row.name, row.unit_price, "->", b.unit_price);
}
