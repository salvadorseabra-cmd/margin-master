import { detectVolume } from "../src/lib/ingredient-unit-inference.ts";
import { resolveInvoiceLinePurchaseFormat } from "../src/lib/invoice-purchase-format.ts";
import { computeEffectiveUsableCost } from "../src/lib/invoice-purchase-price-semantics.ts";

const meta = {
  name: "Baladin - Ginger Beer 0.20cl",
  quantity: 24,
  unit: null,
  unit_price: 0.81,
  line_total: 19.38,
  matchedIngredientName: null,
};
console.log("detectVolume", detectVolume(meta.name));
const fmt = resolveInvoiceLinePurchaseFormat(meta);
console.log("usable", fmt.normalizedUsableQuantity, "pkg", fmt.packageQuantity);
const cost = computeEffectiveUsableCost(0.81, meta, fmt, meta.name);
console.log("cost", cost);
console.log("eurPerL", 19.38 / (fmt.normalizedUsableQuantity / 1000));
