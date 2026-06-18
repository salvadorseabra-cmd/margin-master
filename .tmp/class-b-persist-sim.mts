import {
  defaultIsGenericUnit,
  operationalCostFieldsFromInvoiceLine,
} from "../src/lib/ingredient-auto-persist";
import {
  resolveInvoiceLinePurchaseFormat,
  structuredPurchaseToIngredientFields,
} from "../src/lib/invoice-purchase-format";

function catalogPersistFields(line: any, operational: any) {
  const extractedUnit = line.unit?.trim() || null;
  const structured = resolveInvoiceLinePurchaseFormat({ name: line.name, quantity: line.quantity, unit: line.unit });
  const catalogFields = structuredPurchaseToIngredientFields(structured, extractedUnit, defaultIsGenericUnit);
  const preferCatalogPackFields =
    catalogFields.purchase_unit === "un" &&
    operational.cost_base_unit !== "un" &&
    operational.purchase_quantity !== catalogFields.purchase_quantity;
  if (!preferCatalogPackFields) {
    return { purchase_quantity: operational.purchase_quantity, purchase_unit: operational.cost_base_unit, preferCatalogPackFields: false };
  }
  return { purchase_quantity: catalogFields.purchase_quantity, purchase_unit: catalogFields.purchase_unit, preferCatalogPackFields: true };
}

function simulateUpdate(line: any) {
  const fields = operationalCostFieldsFromInvoiceLine(line);
  if (!fields) return null;
  const cp = catalogPersistFields(line, fields);
  return {
    current_price: fields.current_price,
    purchase_quantity: cp.purchase_quantity,
    computed_purchase_unit: cp.purchase_unit,
    preferCatalogPackFields: cp.preferCatalogPackFields,
    fullUpdate: {
      current_price: fields.current_price,
      purchase_quantity: cp.purchase_quantity,
      ...(cp.preferCatalogPackFields
        ? { purchase_unit: cp.purchase_unit }
        : {}),
    },
  };
}

const lines = [
  { label: "Atum", name: "Atum Oleo Bolsa Nau Catrineta 1 Kg", quantity: 1, unit: "un", unit_price: 13.1, total: 13.1 },
  { label: "Gema", name: "Ovo Líquido Past.Gema Dovo 1 Kg", quantity: 6, unit: "un", unit_price: 10.49, total: 62.94 },
  { label: "Anchoas", name: "Filete de Anchoas Alconfirosa LI 495 g", quantity: 2, unit: "un", unit_price: 9.99, total: 19.98 },
];

for (const l of lines) {
  console.log(l.label, JSON.stringify(simulateUpdate(l)));
}
