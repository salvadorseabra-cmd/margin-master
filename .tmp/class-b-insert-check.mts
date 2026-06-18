import { buildIngredientInsertPayload, persistOperationalIngredientCostFromInvoiceLine } from "../src/lib/ingredient-auto-persist";
const lines = [
  { name: "Atum Oleo Bolsa Nau Catrineta 1 Kg", quantity: 1, unit: "un", unit_price: 13.1, id: "x" },
  { name: "Ovo Líquido Past.Gema Dovo 1 Kg", quantity: 6, unit: "un", unit_price: 10.49, id: "x" },
  { name: "Filete de Anchoas Alconfirosa LI 495 g", quantity: 2, unit: "un", unit_price: 9.99, id: "x" },
];
for (const l of lines) {
  const p = buildIngredientInsertPayload(l, "u");
  console.log("INSERT", l.name.slice(0,35), JSON.stringify({pq:p?.purchase_quantity,pu:p?.purchase_unit,unit:p?.unit}));
}
