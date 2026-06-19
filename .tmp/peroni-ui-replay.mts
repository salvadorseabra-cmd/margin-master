import { defaultIsGenericUnit, operationalCostFieldsFromInvoiceLine } from "@/lib/ingredient-auto-persist";
import { formatDisplayUnitCost } from "@/lib/display-unit-cost";
import {
  effectiveIngredientUnitCostEur,
  inferIngredientCostBaseUnit,
} from "@/lib/ingredient-unit-cost";
import { operationalUnitPriceForPriceHistory } from "@/lib/ingredient-price-history";
import {
  computeEffectiveUsableCost,
  resolveInvoiceLinePurchaseFormat,
} from "@/lib/invoice-purchase-price-semantics";
import { formatUnitCostCurrency } from "@/lib/display-format";

const cases = [
  {
    label: "Peroni Mammafiore",
    line: {
      name: "Birra Peroni Nastro Azzurro PNA 33cl*24 Nastro Azzurro",
      quantity: 24,
      unit: "un",
      unit_price: 1.07,
      line_total: 25.69,
    },
    catalog: {
      current_price: 1.07,
      purchase_quantity: 24,
      purchase_unit: "un",
      base_unit: "un",
      unit: "un",
    },
    historyNewPrice: 0.0001351010101010101,
  },
  {
    label: "San Pellegrino Emporio",
    line: {
      name: "SanPellegrino - Acqua in vitro 75cl x 15ud",
      quantity: 2,
      unit: "un",
      unit_price: 19.28,
      line_total: 38.56,
    },
    catalog: {
      current_price: 19.28,
      purchase_quantity: 2,
      purchase_unit: "un",
      base_unit: "un",
      unit: "un",
    },
    historyNewPrice: 0.0017137777777777778,
  },
] as const;

for (const c of cases) {
  const meta = {
    name: c.line.name,
    quantity: c.line.quantity,
    unit: c.line.unit,
    unit_price: c.line.unit_price,
    line_total: c.line.line_total,
  };
  const structured = resolveInvoiceLinePurchaseFormat(meta);
  const effective = computeEffectiveUsableCost(c.line.unit_price, meta, structured, c.line.name);
  const op = operationalCostFieldsFromInvoiceLine(meta, { isGenericUnit: defaultIsGenericUnit });
  const storedNew = op
    ? operationalUnitPriceForPriceHistory(op.current_price, op.purchase_quantity)
    : null;
  const catalogKpi = formatDisplayUnitCost(
    effectiveIngredientUnitCostEur(c.catalog),
    inferIngredientCostBaseUnit(c.catalog),
  );
  const historyAsDisplay = formatDisplayUnitCost(c.historyNewPrice, "ml");
  const unitCostLabel = effective
    ? `${formatUnitCostCurrency(effective.cost)} / ${effective.unit}`
    : null;

  console.log(
    JSON.stringify(
      {
        label: c.label,
        invoiceArithmetic: {
          perBottleOrCase: c.line.unit_price,
          lineTotal: c.line.line_total,
          perLiterFromTotal:
            c.line.line_total / ((structured.normalizedUsableQuantity ?? 0) / 1000 || NaN),
        },
        operationalCostFields: op,
        historyStoredNewPrice: c.historyNewPrice,
        historyStoredAsDisplay: historyAsDisplay.formattedLabel,
        currentCodeStoredNew: storedNew,
        operationalCostCardUnitCostLabel: unitCostLabel,
        catalogUnitCostKpi: catalogKpi.formattedLabel,
        usableVolumeMlOnOp: op?.usable_volume_ml ?? null,
      },
      null,
      2,
    ),
  );
}
