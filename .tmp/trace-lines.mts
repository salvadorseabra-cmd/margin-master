import { operationalCostFieldsFromInvoiceLine, defaultIsGenericUnit } from "@/lib/ingredient-auto-persist";
import { operationalUnitPriceForPriceHistory } from "@/lib/ingredient-price-history";
import { recipeOperationalCostFieldsFromInvoiceLine } from "@/lib/invoice-purchase-price-semantics";

const lines = [
  { label: "Peroni Mammafiore", name: "Birra Peroni Nastro Azzurro PNA 33cl*24 Nastro Azzurro", qty: 24, unit: "un", unit_price: 1.07, total: 25.69 },
  { label: "San Pellegrino Emporio", name: "SanPellegrino - Acqua in vitro 75cl x 15ud", qty: 2, unit: "un", unit_price: 19.28, total: 38.56 },
  { label: "Aceto", name: "Aceto balsamico di modena IGP pet 5l*2 Toschi", qty: 1, unit: "un", unit_price: 15.55, total: 16.09 },
  { label: "Gema May", name: "Ovo Líquido Past.Gema Dovo 1 Kg", qty: 6, unit: "un", unit_price: 10.49, total: 62.94 },
  { label: "Anchoas May", name: "Filete de Anchoas Alconfirosa LI 495 g", qty: 2, unit: "un", unit_price: 9.99, total: 19.98 },
  { label: "Atum May", name: "Atum Oleo Bolsa Nau Catrineta 1 Kg", qty: 1, unit: "un", unit_price: 13.1, total: 13.1 },
  { label: "Courgettes", name: "Courgettes", qty: 3.3, unit: "kg", unit_price: 1.95, total: 5.15 },
];

for (const l of lines) {
  const meta = { name: l.name, quantity: l.qty, unit: l.unit, unit_price: l.unit_price, line_total: l.total };
  const op = operationalCostFieldsFromInvoiceLine(meta, { isGenericUnit: defaultIsGenericUnit });
  const stored = op ? operationalUnitPriceForPriceHistory(op.current_price, op.purchase_quantity) : null;
  console.log(JSON.stringify({ label: l.label, op, storedNew: stored }));
}
