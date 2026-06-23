import { bindMonetaryColumns, parseMonetaryLineItems } from "../supabase/functions/extract-invoice/invoice-monetary-binding.ts";

const row = {
  name: "Courgettes",
  quantity: 3.3,
  unit: "kg",
  gross_unit_price: null as number | null,
  discount_pct: null as number | null,
  line_total_net: 5.15 as number | null,
  unit_price: 1.95,
  total: 5.15,
};

const [b] = bindMonetaryColumns(parseMonetaryLineItems([row]));
console.log("with line_total_net:", b.unit_price);

row.line_total_net = null;
const [b2] = bindMonetaryColumns(parseMonetaryLineItems([row]));
console.log("without line_total_net:", b2.unit_price);
