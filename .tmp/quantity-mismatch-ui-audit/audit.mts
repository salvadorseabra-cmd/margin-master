/**
 * READ-ONLY UI audit — replays production code for 19 mismatch rows.
 */
const metaEnv = import.meta as { env?: Record<string, unknown> };
if (!metaEnv.env) metaEnv.env = {};
metaEnv.env.DEV = false;
metaEnv.env.PROD = true;

import { readFileSync, writeFileSync } from "node:fs";
import {
  bindMonetaryColumns,
  parseMonetaryLineItems,
} from "../../supabase/functions/extract-invoice/invoice-monetary-binding.ts";
import {
  procurementPackFieldsFromInvoiceLine,
  defaultIsGenericUnit,
} from "../../src/lib/ingredient-auto-persist.ts";
import {
  resolveInvoiceLinePurchaseFormat,
  resolveInvoiceLineStockPresentation,
} from "../../src/lib/invoice-purchase-format.ts";
import {
  computeEffectiveUsableCost,
  formatRowPurchaseQuantityLabel,
  recipeOperationalCostFieldsFromInvoiceLine,
  resolveCountablePurchaseQuantityForCost,
  resolveInvoiceLinePricingPresentation,
} from "../../src/lib/invoice-purchase-price-semantics.ts";
import { effectiveIngredientUnitCostEur } from "../../src/lib/ingredient-unit-cost.ts";

type MismatchRow = {
  invoiceItemId: string;
  invoiceId: string;
  ingredient: string;
  lineName: string;
  invoiceQuantity: number | null;
  invoiceUnit: string | null;
  boundUnitPrice: number | null;
  boundTotal: number | null;
  catalogPurchaseQuantity: number | null;
  familyA: boolean;
  mismatchTypes: string[];
};

const data = JSON.parse(
  readFileSync(".tmp/quantity-mismatch-validation/mismatches.json", "utf8"),
) as { mismatches: MismatchRow[] };

const extractsDir = ".tmp/final-validation-lab-rerun/extracts";

function bindLine(raw: {
  name: string;
  quantity: number | null;
  unit: string | null;
  unit_price: number | null;
  total: number | null;
}) {
  const [bound] = bindMonetaryColumns(
    parseMonetaryLineItems([
      {
        ...raw,
        gross_unit_price: null,
        discount_pct: null,
        line_total_net: null,
      },
    ]),
  );
  return bound;
}

function parseEuro(label: string | null | undefined): number | null {
  if (!label?.trim()) return null;
  const m = label.match(/([\d.,]+)/);
  if (!m) return null;
  const n = Number(m[1]!.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function analyze(row: MismatchRow) {
  const bound = bindLine({
    name: row.lineName,
    quantity: row.invoiceQuantity,
    unit: row.invoiceUnit,
    unit_price: row.boundUnitPrice,
    total: row.boundTotal,
  });

  let extractItem: {
    name: string;
    quantity: number | null;
    unit: string | null;
    unit_price: number | null;
    total: number | null;
  } | null = null;
  try {
    const ex = JSON.parse(
      readFileSync(`${extractsDir}/${row.invoiceId}.json`, "utf8"),
    ) as { items?: typeof extractItem[] };
    extractItem =
      ex.items?.find((i) => i?.name === row.lineName) ??
      ex.items?.find(
        (i) =>
          i?.name &&
          (i.name.includes(row.lineName.slice(0, 24)) ||
            row.lineName.includes(i.name.slice(0, 24))),
      ) ??
      null;
  } catch {
    /* extract missing */
  }

  const metadata = {
    name: bound.name,
    quantity: bound.quantity,
    unit: bound.unit,
    unit_price: bound.unit_price,
    line_total: bound.total,
    matchedIngredientName: row.ingredient,
  };
  const structured = resolveInvoiceLinePurchaseFormat(metadata);
  const stock = resolveInvoiceLineStockPresentation(metadata);
  const operational = recipeOperationalCostFieldsFromInvoiceLine(metadata);
  const procurement = procurementPackFieldsFromInvoiceLine(
    {
      name: bound.name,
      quantity: bound.quantity,
      unit: bound.unit,
      unit_price: bound.unit_price,
      total: bound.total,
    },
    { isGenericUnit: defaultIsGenericUnit },
  );
  const pq = resolveCountablePurchaseQuantityForCost(metadata, structured);
  const pres = resolveInvoiceLinePricingPresentation(metadata);
  const eff = computeEffectiveUsableCost(
    bound.unit_price ?? 0,
    metadata,
    structured,
    bound.name,
  );

  const total = bound.total ?? 0;
  const usable = structured.normalizedUsableQuantity;
  const usableUnit = structured.usableQuantityUnit;
  let expectedOpPerBase: number | null = null;
  if (usable != null && usable > 0 && total > 0) {
    if (usableUnit === "g") expectedOpPerBase = total / (usable / 1000);
    else if (usableUnit === "ml") expectedOpPerBase = total / (usable / 1000);
  }

  const opVal = parseEuro(pres.effectiveUsableCostLabel);
  const opMatchesTotalOverUsable =
    opVal != null && expectedOpPerBase != null
      ? Math.abs(opVal - expectedOpPerBase) <= 0.06
      : null;

  const lastPurchase = formatRowPurchaseQuantityLabel(metadata);
  const lastPurchaseQty = parseEuro(lastPurchase);
  const invoiceQty = bound.quantity == null ? null : Number(bound.quantity);

  return {
    invoiceItemId: row.invoiceItemId,
    ingredient: row.ingredient,
    lineName: row.lineName,
    familyA: row.familyA,
    mismatchTypes: row.mismatchTypes,
    extract: extractItem
      ? {
          qty: extractItem.quantity,
          unit: extractItem.unit,
          unitPrice: extractItem.unit_price,
          total: extractItem.total,
        }
      : null,
    bound: {
      qty: bound.quantity,
      unit: bound.unit,
      unitPrice: bound.unit_price,
      total: bound.total,
    },
    ui: {
      lastPurchase,
      procurementCost: pres.priceDisplay,
      operationalCost: pres.effectiveUsableCostLabel,
      usableQuantity: stock.quantityLabel,
    },
    math: {
      purchaseQtyForCost: pq,
      storedPurchaseQuantity: operational?.purchase_quantity ?? null,
      storedBaseUnit: operational?.cost_base_unit ?? null,
      catalogPurchaseQuantity: row.catalogPurchaseQuantity,
      procurementPackQuantity: procurement?.purchase_quantity ?? null,
      purchaseContainerCount: structured.purchaseContainerCount,
      normalizedUsable: usable,
      usableUnit,
      effectiveUsableCost: eff,
      expectedOpPerKgOrL: expectedOpPerBase,
      opMatchesTotalOverUsable,
      catalogUnitCostEur: operational
        ? effectiveIngredientUnitCostEur(operational)
        : null,
    },
    consistency: {
      lastPurchaseMatchesInvoiceQty:
        lastPurchaseQty != null && invoiceQty != null
          ? Math.abs(lastPurchaseQty - invoiceQty) <= 0.01
          : null,
      procurementMatchesUnitPrice:
        pres.priceDisplay != null && bound.unit_price != null
          ? Math.abs(parseEuro(pres.priceDisplay)! - bound.unit_price) <= 0.02
          : null,
    },
  };
}

const replay = data.mismatches.map(analyze);
writeFileSync(
  ".tmp/quantity-mismatch-ui-audit/replay.json",
  JSON.stringify(replay, null, 2),
);
console.log(JSON.stringify(replay, null, 2));
