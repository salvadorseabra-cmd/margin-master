import { operationalCostFieldsFromInvoiceLine, defaultIsGenericUnit } from "../src/lib/ingredient-auto-persist.ts";
import { operationalUnitPriceForPriceHistory } from "../src/lib/ingredient-price-history.ts";

const cases = [
  { name: "Peroni", line: { name: "Peroni 24x33cl", quantity: 1, unit: null, unit_price: 24.5, total: null } },
  { name: "San Pellegrino", line: { name: "SanPellegrino - Acqua in vitro 75cl x 15ud", quantity: 1, unit: "un", unit_price: 19.32, total: null } },
  { name: "Aceto", line: { name: "Aceto balsamico di modena IGP pet 5l*2 Toschi", quantity: 1, unit: "un", unit_price: 18.83, total: null } },
  { name: "Atum", line: { name: "Atum Óleo Bolsa Nau Catrineta 1 Kg", quantity: 2, unit: "un", unit_price: 6.29, total: 12.58 } },
  { name: "Gema", line: { name: "Ovo Gema 1kg", quantity: 6, unit: "un", unit_price: 10.19, total: 61.14 } },
  { name: "Anchoas", line: { name: "Filete de Anchoas Alconfirosa LI 495 g", quantity: 2, unit: "un", unit_price: 9.99, total: 19.98 } },
  { name: "Stracciatella", line: { name: "STRACCIATELLA 250 GR", quantity: 24, unit: "un", unit_price: 3.11, total: 74.54 } },
  { name: "Guanciale", line: { name: "Guanciale di suino stagionato +/- 1,5kg*7 Sorrentino", quantity: 1, unit: "un", unit_price: 10.83, total: 10.83 } },
  { name: "Mozzarella (Bocconcino 125g×8)", line: { name: 'MOZZARELLA FIOR DI LATTE "IL BOCCONCINO" 125GR*8', quantity: 10, unit: "un", unit_price: 8.12, total: 81.23 } },
  { name: "Mozzarella (2Kg block)", line: { name: "Mozzarella Flor di Latte 2Kg", quantity: 1, unit: "un", unit_price: 13.69, total: 13.69 } },
];

for (const c of cases) {
  const fields = operationalCostFieldsFromInvoiceLine(c.line, { isGenericUnit: defaultIsGenericUnit });
  const op = fields ? operationalUnitPriceForPriceHistory(fields.current_price, fields.purchase_quantity) : null;
  console.log(JSON.stringify({
    product: c.name,
    normalization: op != null ? "YES" : "NO",
    pack: fields?.current_price ?? null,
    pq: fields?.purchase_quantity ?? null,
    base: fields?.cost_base_unit ?? null,
    operational: op,
    arithmetic: fields ? `${fields.current_price} / ${fields.purchase_quantity} = ${op}` : null,
  }));
}
