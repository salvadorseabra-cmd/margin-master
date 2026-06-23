/** Replay effective paid price binding for validation rows */
import {
  bindMonetaryColumns,
  parseMonetaryLineItems,
} from "../supabase/functions/extract-invoice/invoice-monetary-binding.ts";

const ROWS = [
  { name: "Paccheri", quantity: 24, unit_price: 2.35, total: 50.4 },
  { name: "Courgettes", quantity: 3.3, unit_price: 1.95, total: 5.15 },
  { name: "Alho Francês", quantity: 5.42, unit_price: 1.77, total: 7.67 },
  { name: "Manjericão", quantity: 5, unit_price: 2.57, total: 10.28 },
  { name: "Ginger Beer", quantity: 2, unit_price: 10.85, total: 19.38 },
  { name: "Gorgonzola", quantity: 2, unit_price: 10.22, total: 13.44 },
  { name: "Prosciutto", quantity: 4.3, unit_price: 8.5, total: 36.54 },
  { name: "San Pellegrino", quantity: 2, unit_price: 19.28, total: 38.56 },
  { name: "Mortadella", quantity: 3.11, unit_price: 9.99, total: 31.07 },
  { name: "Aceto", quantity: 1, unit_price: 15.55, total: 16.09 },
];

const TOLERANCE = 0.02;

function replay(row: (typeof ROWS)[number]) {
  const [bound] = bindMonetaryColumns(parseMonetaryLineItems([{
    name: row.name,
    quantity: row.quantity,
    unit: null,
    gross_unit_price: null,
    discount_pct: null,
    line_total_net: null,
    unit_price: row.unit_price,
    total: row.total,
  }]));

  const product = bound.quantity! * bound.unit_price!;
  const consistent = Math.abs(product - bound.total!) <= TOLERANCE;

  return {
    name: row.name,
    before: { unit_price: row.unit_price, total: row.total, qty: row.quantity },
    after: { unit_price: bound.unit_price, total: bound.total, qty: bound.quantity },
    qty_x_unit: product,
    consistent,
  };
}

const results = ROWS.map(replay);
const flagged = JSON.parse(
  await Deno.readTextFile("/Users/salvadorseabra1/margin-master/.tmp/gross-net-global-audit-result.json"),
);

let fixed = 0;
for (const row of flagged.top_20_discrepancies) {
  const [bound] = bindMonetaryColumns(parseMonetaryLineItems([{
    name: row.description,
    quantity: row.qty,
    unit: null,
    gross_unit_price: null,
    discount_pct: null,
    line_total_net: null,
    unit_price: row.unit_price,
    total: row.total,
  }]));
  const consistent = Math.abs(bound.quantity! * bound.unit_price! - bound.total!) <= TOLERANCE;
  const changed = bound.unit_price !== row.unit_price;
  if (consistent && changed) fixed++;
}

console.log(JSON.stringify({ results, flagged_fixed_estimate: fixed, flagged_total: flagged.global_statistics.flagged_rows }, null, 2));
