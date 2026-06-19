import {
  operationalCostFieldsFromInvoiceLine,
  type AutoPersistInvoiceItem,
} from "@/lib/ingredient-auto-persist";
import {
  computePriceHistoryDelta,
  INGREDIENT_PRICE_EQ_EPS,
  operationalUnitPriceForPriceHistory,
  type IngredientPriceHistoryRow,
} from "@/lib/ingredient-price-history";

/** Mozzarella Fior di Latte — identity issue; excluded from deterministic repair. */
export const PRICE_HISTORY_REPAIR_EXCLUDED_INGREDIENT_IDS = new Set([
  "2a99cecd-08fb-48d5-87cf-cc9ea5282a6d",
]);

export type InvoiceLineForPriceHistoryRepair = Pick<
  AutoPersistInvoiceItem,
  "name" | "quantity" | "unit" | "unit_price" | "total"
>;

export type PriceHistoryRowForRepair = Pick<
  IngredientPriceHistoryRow,
  | "id"
  | "ingredient_id"
  | "invoice_id"
  | "ingredient_name"
  | "previous_price"
  | "new_price"
  | "delta"
  | "delta_percent"
  | "created_at"
>;

export type ReplayExpectedPriceHistory = {
  packPrice: number;
  purchaseQuantity: number | null;
  costBaseUnit: string | null;
  expectedNewPrice: number;
};

export type PriceHistoryRepairAssessment = {
  historyId: string;
  ingredientId: string;
  invoiceId: string;
  ingredientName: string | null;
  storedNewPrice: number;
  expectedNewPrice: number;
  needsNewPriceRepair: boolean;
  storedPreviousPrice: number | null;
  storedDelta: number | null;
  storedDeltaPercent: number | null;
  skipReason: "excluded_ingredient" | "ghost_no_invoice_line" | "replay_unresolved" | null;
};

export type PriceHistoryRepairPatch = {
  new_price: number;
  previous_price: number | null;
  delta: number | null;
  delta_percent: number | null;
};

export type PriceHistoryRepairPlan = PriceHistoryRepairAssessment & {
  patch: PriceHistoryRepairPatch | null;
};

/** Replay €/base-unit for a linked invoice line using production costing only. */
export function replayExpectedNewPriceFromInvoiceLine(
  line: InvoiceLineForPriceHistoryRepair,
): ReplayExpectedPriceHistory | null {
  const fields = operationalCostFieldsFromInvoiceLine(line);
  if (!fields || fields.current_price == null) return null;
  const expectedNewPrice = operationalUnitPriceForPriceHistory(
    fields.current_price,
    fields.purchase_quantity,
  );
  if (expectedNewPrice == null || !Number.isFinite(expectedNewPrice)) return null;
  return {
    packPrice: fields.current_price,
    purchaseQuantity: fields.purchase_quantity ?? null,
    costBaseUnit: fields.cost_base_unit ?? null,
    expectedNewPrice,
  };
}

export function priceHistoryOperationalPricesMatch(
  stored: number | null | undefined,
  expected: number | null | undefined,
  eps = INGREDIENT_PRICE_EQ_EPS,
): boolean {
  if (stored == null || expected == null) return false;
  const a = Number(stored);
  const b = Number(expected);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
  return Math.abs(a - b) <= eps;
}

export function isPriceHistoryRepairExcludedIngredient(ingredientId: string): boolean {
  return PRICE_HISTORY_REPAIR_EXCLUDED_INGREDIENT_IDS.has(ingredientId.trim());
}

export function assessPriceHistoryRowRepair(
  historyRow: PriceHistoryRowForRepair,
  invoiceLine: InvoiceLineForPriceHistoryRepair | null,
): PriceHistoryRepairAssessment | null {
  const historyId = historyRow.id?.trim();
  const ingredientId = historyRow.ingredient_id?.trim();
  const invoiceId = historyRow.invoice_id?.trim();
  if (!historyId || !ingredientId || !invoiceId) return null;

  const storedNewPrice = Number(historyRow.new_price);
  if (!Number.isFinite(storedNewPrice)) return null;

  if (isPriceHistoryRepairExcludedIngredient(ingredientId)) {
    return {
      historyId,
      ingredientId,
      invoiceId,
      ingredientName: historyRow.ingredient_name ?? null,
      storedNewPrice,
      expectedNewPrice: storedNewPrice,
      needsNewPriceRepair: false,
      storedPreviousPrice:
        historyRow.previous_price == null ? null : Number(historyRow.previous_price),
      storedDelta: historyRow.delta == null ? null : Number(historyRow.delta),
      storedDeltaPercent:
        historyRow.delta_percent == null ? null : Number(historyRow.delta_percent),
      skipReason: "excluded_ingredient",
    };
  }

  if (!invoiceLine) {
    return {
      historyId,
      ingredientId,
      invoiceId,
      ingredientName: historyRow.ingredient_name ?? null,
      storedNewPrice,
      expectedNewPrice: storedNewPrice,
      needsNewPriceRepair: false,
      storedPreviousPrice:
        historyRow.previous_price == null ? null : Number(historyRow.previous_price),
      storedDelta: historyRow.delta == null ? null : Number(historyRow.delta),
      storedDeltaPercent:
        historyRow.delta_percent == null ? null : Number(historyRow.delta_percent),
      skipReason: "ghost_no_invoice_line",
    };
  }

  const replay = replayExpectedNewPriceFromInvoiceLine(invoiceLine);
  if (!replay) {
    return {
      historyId,
      ingredientId,
      invoiceId,
      ingredientName: historyRow.ingredient_name ?? null,
      storedNewPrice,
      expectedNewPrice: storedNewPrice,
      needsNewPriceRepair: false,
      storedPreviousPrice:
        historyRow.previous_price == null ? null : Number(historyRow.previous_price),
      storedDelta: historyRow.delta == null ? null : Number(historyRow.delta),
      storedDeltaPercent:
        historyRow.delta_percent == null ? null : Number(historyRow.delta_percent),
      skipReason: "replay_unresolved",
    };
  }

  const needsNewPriceRepair = !priceHistoryOperationalPricesMatch(
    storedNewPrice,
    replay.expectedNewPrice,
  );

  return {
    historyId,
    ingredientId,
    invoiceId,
    ingredientName: historyRow.ingredient_name ?? null,
    storedNewPrice,
    expectedNewPrice: replay.expectedNewPrice,
    needsNewPriceRepair,
    storedPreviousPrice:
      historyRow.previous_price == null ? null : Number(historyRow.previous_price),
    storedDelta: historyRow.delta == null ? null : Number(historyRow.delta),
    storedDeltaPercent:
      historyRow.delta_percent == null ? null : Number(historyRow.delta_percent),
    skipReason: null,
  };
}

/** Build row update payload; `previous_price` is rechained after all row repairs. */
export function buildPriceHistoryRepairPatch(
  assessment: Pick<PriceHistoryRepairAssessment, "needsNewPriceRepair" | "expectedNewPrice" | "storedPreviousPrice">,
): PriceHistoryRepairPatch | null {
  if (!assessment.needsNewPriceRepair) return null;
  const { delta, delta_percent } = computePriceHistoryDelta(
    assessment.storedPreviousPrice,
    assessment.expectedNewPrice,
  );
  return {
    new_price: assessment.expectedNewPrice,
    previous_price: assessment.storedPreviousPrice,
    delta,
    delta_percent,
  };
}

export function buildPriceHistoryRepairPlan(
  historyRow: PriceHistoryRowForRepair,
  invoiceLine: InvoiceLineForPriceHistoryRepair | null,
): PriceHistoryRepairPlan | null {
  const assessment = assessPriceHistoryRowRepair(historyRow, invoiceLine);
  if (!assessment) return null;
  return {
    ...assessment,
    patch: buildPriceHistoryRepairPatch(assessment),
  };
}
