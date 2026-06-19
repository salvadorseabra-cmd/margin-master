import { operationalCostFieldsFromInvoiceLine } from "../src/lib/ingredient-auto-persist.ts";
import { operationalUnitPriceForPriceHistory } from "../src/lib/ingredient-price-history.ts";

function replay(line: Record<string, unknown>) {
  const f = operationalCostFieldsFromInvoiceLine(line as never);
  const op = operationalUnitPriceForPriceHistory(f?.current_price, f?.purchase_quantity);
  return { pq: f?.purchase_quantity, pack: f?.current_price, op };
}

const cases = [
  { label: "Atum with total", line: { name: "Atum Óleo Bolsa Nau Catrineta 1 Kg", quantity: 2, unit: "un", unit_price: 6.29, total: 12.58 } },
  { label: "Atum no total", line: { name: "Atum Óleo Bolsa Nau Catrineta 1 Kg", quantity: 2, unit: "un", unit_price: 6.29 } },
  { label: "Gema with total", line: { name: "Ovo Líquido Past.Gema Dovo 1kg", quantity: 6, unit: "un", unit_price: 10.19, total: 61.14 } },
  { label: "Gema no total", line: { name: "Ovo Líquido Past.Gema Dovo 1kg", quantity: 6, unit: "un", unit_price: 10.19 } },
  { label: "Anchoas no total", line: { name: "Filete de Anchoas Alconfirosa LI 495 g", quantity: 2, unit: "un", unit_price: 9.99 } },
  { label: "Gema May no total", line: { name: "Ovo Líquido Past.Gema Dovo 1 Kg", quantity: 6, unit: "un", unit_price: 10.49 } },
  { label: "Peroni qty1", line: { name: "Birra Peroni Nastro Azzurro PNA 33cl*24 Nastro Azzurro", quantity: 1, unit: "un", unit_price: 1.07, total: 1.07 } },
  { label: "Peroni qty24 no total", line: { name: "Birra Peroni Nastro Azzurro PNA 33cl*24 Nastro Azzurro", quantity: 24, unit: "un", unit_price: 1.07 } },
  { label: "Stracci qty24 no total", line: { name: "STRACCIATELLA 250 GR", quantity: 24, unit: "un", unit_price: 3.11 } },
  { label: "Stracci qty1", line: { name: "STRACCIATELLA 250 GR", quantity: 1, unit: "un", unit_price: 3.11, total: 3.11 } },
];
for (const c of cases) console.log(c.label, JSON.stringify(replay(c.line)));
