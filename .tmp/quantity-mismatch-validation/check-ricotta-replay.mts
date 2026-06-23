const metaEnv = import.meta as { env?: Record<string, unknown> };
if (!metaEnv.env) metaEnv.env = {};
metaEnv.env.DEV = false;
metaEnv.env.PROD = true;

import {
  recipeOperationalCostFieldsFromInvoiceLine,
  resolveCountablePurchaseQuantityForCost,
  resolveInvoiceLinePricingPresentation,
  formatRowPurchaseQuantityLabel,
} from "../../src/lib/invoice-purchase-price-semantics.ts";
import { resolveInvoiceLinePurchaseFormat } from "../../src/lib/invoice-purchase-format.ts";
import {
  bindMonetaryColumns,
  parseMonetaryLineItems,
} from "../../supabase/functions/extract-invoice/invoice-monetary-binding.ts";

const raw = {
  name: "RICOTTA TREVIGIANA 1,5KG",
  quantity: 2,
  unit: "un",
  unit_price: 7.97,
  total: 7.97,
};
const [bound] = bindMonetaryColumns(parseMonetaryLineItems([{ ...raw, gross_unit_price: null, discount_pct: null, line_total_net: null }]));
for (const line of [
  { label: "raw", quantity: raw.quantity, unit_price: raw.unit_price, total: raw.total },
  { label: "bound", quantity: bound.quantity, unit_price: bound.unit_price, total: bound.total },
]) {
  const meta = { name: raw.name, quantity: line.quantity, unit: raw.unit, unit_price: line.unit_price, line_total: line.total };
  const structured = resolveInvoiceLinePurchaseFormat(meta);
  const op = recipeOperationalCostFieldsFromInvoiceLine(meta);
  const pq = resolveCountablePurchaseQuantityForCost(meta, structured);
  const pres = resolveInvoiceLinePricingPresentation(meta);
  console.log(line.label, {
    pq,
    op,
    containerCount: structured.purchaseContainerCount,
    usable: structured.normalizedUsableQuantity,
    lastPurchase: formatRowPurchaseQuantityLabel(meta),
    procurement: pres.priceDisplay,
    operational: pres.effectiveUsableCostLabel,
  });
}
