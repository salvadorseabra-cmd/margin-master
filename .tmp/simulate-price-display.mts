import {
  computeEffectiveUsableCost,
  recipeOperationalCostFieldsFromInvoiceLine,
} from "../src/lib/invoice-purchase-price-semantics";
import { resolveInvoiceLinePurchaseFormat } from "../src/lib/invoice-purchase-format";
import {
  effectiveIngredientUnitCostEur,
  inferIngredientCostBaseUnit,
} from "../src/lib/ingredient-unit-cost";
import { formatDisplayUnitCost } from "../src/lib/display-unit-cost";
import { formatCurrency } from "../src/lib/display-format";
import { operationalUnitPriceForPriceHistory } from "../src/lib/ingredient-price-history";
import { buildRecentPurchases } from "../src/lib/ingredient-purchase-memory";
import { buildIngredientPurchaseInsights } from "../src/lib/ingredient-detail-panel";

const LINES = {
  may: {
    atum: { name: "Atum Óleo Bolsa Nau C/afrineta 1 Kg", quantity: 2, unit: "un", unit_price: 6.55 },
    gema: { name: "Ovo Líquido Past.Gema Dovo 1 Kg", quantity: 6, unit: "un", unit_price: 10.49 },
    chocolate: { name: "Chocolate Culinaria Pantagruel 10x200 g", quantity: 2, unit: "cx", unit_price: 29.99 },
    arroz: { name: "Arroz Agulha Metro Chef 12x1 kg", quantity: 1, unit: "cx", unit_price: 13.95 },
  },
  april: {
    atum: { name: "Atum Óleo Bolsa Nau C/afrineta 1 Kg", quantity: 2, unit: "un", unit_price: 6.29 },
    gema: { name: "Ovo Líquido Past.Gema Dovo 1 Kg", quantity: 6, unit: "un", unit_price: 10.19 },
    chocolate: { name: "Chocolate Culinaria Pantagruel 10x200 g", quantity: 2, unit: "cx", unit_price: 29.19 },
    arroz: { name: "Arroz Agulha Metro Chef 12x1 kg", quantity: 1, unit: "cx", unit_price: 13.45 },
  },
} as const;

const UI_WRONG = { atum: 3.22, chocolate: 19.08, gema: 6.99, arroz: 17.98 };

function simulate(key: keyof typeof LINES.may, line: (typeof LINES.may)[keyof typeof LINES.may]) {
  const structured = resolveInvoiceLinePurchaseFormat(line);
  const recipe = recipeOperationalCostFieldsFromInvoiceLine(line);
  const usable = computeEffectiveUsableCost(line.unit_price, line, structured, line.name);
  const catalogCost = recipe
    ? effectiveIngredientUnitCostEur({
        current_price: recipe.current_price,
        purchase_quantity: recipe.purchase_quantity,
        cost_base_unit: recipe.cost_base_unit,
        usable_weight_grams: recipe.usable_weight_grams,
        usable_volume_ml: recipe.usable_volume_ml,
      })
    : null;
  const base = recipe ? inferIngredientCostBaseUnit(recipe) : null;
  const display = catalogCost != null && base ? formatDisplayUnitCost(catalogCost, base) : null;
  const historyStored =
    recipe != null
      ? operationalUnitPriceForPriceHistory(recipe.current_price, recipe.purchase_quantity)
      : null;
  const purchaseHistoryLabel = formatCurrency(line.unit_price);

  return {
    line,
    structured: {
      kind: structured.kind,
      normalizedUsableQuantity: structured.normalizedUsableQuantity,
      usableQuantityUnit: structured.usableQuantityUnit,
      packageQuantity: structured.packageQuantity,
      packageMeasurementUnit: structured.packageMeasurementUnit,
      purchaseContainerCount: structured.purchaseContainerCount,
      purchaseContainerUnit: structured.purchaseContainerUnit,
    },
    recipeOperationalCostFields: recipe,
    computeEffectiveUsableCost: usable,
    catalog_effective_per_base: catalogCost,
    formatDisplayUnitCost: display,
    ingredient_price_history_stored_new_price: historyStored,
    purchase_history_would_show: purchaseHistoryLabel,
    ui_wrong_target: UI_WRONG[key as keyof typeof UI_WRONG],
    matches_ui_wrong_as: {
      raw_unit_price: Math.abs(line.unit_price - (UI_WRONG[key as keyof typeof UI_WRONG] ?? 0)) < 0.02,
      display_scaled: display ? Math.abs(display.displayValue - (UI_WRONG[key as keyof typeof UI_WRONG] ?? 0)) < 0.05 : false,
      history_stored: historyStored ? Math.abs(historyStored * (base === "g" ? 1000 : base === "ml" ? 1000 : 1) - (UI_WRONG[key as keyof typeof UI_WRONG] ?? 0)) < 0.05 : false,
      usable_cost: usable ? Math.abs(usable.cost - (UI_WRONG[key as keyof typeof UI_WRONG] ?? 0)) < 0.05 : false,
    },
  };
}

const out = Object.fromEntries(
  (Object.keys(LINES.may) as Array<keyof typeof LINES.may>).map((k) => [
    k,
    { may: simulate(k, LINES.may[k]), april: simulate(k, LINES.april[k]) },
  ]),
);

console.log(JSON.stringify(out, null, 2));
