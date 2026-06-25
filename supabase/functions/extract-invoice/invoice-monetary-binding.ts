import type { InvoiceLineItem } from "./invoice-line-reconcile.ts";

/** Pass C row with structured monetary columns preserved for binding. */
export type MonetaryLineItem = {
  name: string;
  quantity: number | null;
  unit: string | null;
  gross_unit_price: number | null;
  discount_pct: number | null;
  line_total_net: number | null;
  unit_price: number | null;
  total: number | null;
};

const RULE_B_TOLERANCE = 0.5;
const PRICE_TOLERANCE = 0.02;

const round2 = (n: number) => Math.round(n * 100) / 100;

function normalizeNumberField(item: Record<string, unknown>, key: string): number | null {
  const value = item[key];
  return typeof value === "number" ? value : null;
}

export function parseMonetaryLineItems(raw: unknown): MonetaryLineItem[] {
  if (!Array.isArray(raw)) return [];

  return raw.map((item) => {
    const row = item && typeof item === "object"
      ? (item as Record<string, unknown>)
      : {};

    return {
      name: typeof row.name === "string" ? row.name : "Unknown item",
      quantity: typeof row.quantity === "number" ? row.quantity : null,
      unit: typeof row.unit === "string" ? row.unit : null,
      gross_unit_price: normalizeNumberField(row, "gross_unit_price"),
      discount_pct: normalizeNumberField(row, "discount_pct"),
      line_total_net: normalizeNumberField(row, "line_total_net"),
      unit_price: normalizeNumberField(row, "unit_price"),
      total: normalizeNumberField(row, "total"),
    };
  });
}

function deriveNetUnitPrice(
  grossUnitPrice: number | null,
  discountPct: number | null,
): number | null {
  if (grossUnitPrice != null && discountPct != null) {
    return round2(grossUnitPrice * (1 - discountPct / 100));
  }
  return grossUnitPrice;
}

/** Prefer structured columns over legacy unit_price/total when available. */
function applyStructuredBinding(item: MonetaryLineItem): MonetaryLineItem {
  const { gross_unit_price, discount_pct, line_total_net } = item;
  if (gross_unit_price == null && discount_pct == null && line_total_net == null) {
    return item;
  }

  let unit_price = item.unit_price;
  let total = item.total;

  const derivedNet = deriveNetUnitPrice(gross_unit_price, discount_pct);
  if (derivedNet != null) {
    if (
      line_total_net != null &&
      item.quantity === 1 &&
      Math.abs(derivedNet - line_total_net) > PRICE_TOLERANCE
    ) {
      // Qty-1 discount rows: trust printed Valor when gross×discount drifts (e.g. Aceto).
      unit_price = round2(line_total_net);
    } else {
      unit_price = derivedNet;
    }
  } else if (gross_unit_price != null && unit_price == null) {
    unit_price = gross_unit_price;
  }

  if (line_total_net != null) {
    total = line_total_net;
  } else if (
    line_total_net == null &&
    unit_price != null &&
    item.quantity != null &&
    item.quantity > 0 &&
    total == null
  ) {
    total = round2(unit_price * item.quantity);
  }

  return { ...item, unit_price, total };
}

function hasDiscountLine(item: MonetaryLineItem): boolean {
  return item.discount_pct != null && item.discount_pct > 0;
}

/** Rule B: unit_price ≈ discount_pct — discount % read as euro unit price. */
function triggersRuleB(item: MonetaryLineItem): boolean {
  if (item.discount_pct == null || item.unit_price == null) return false;
  return Math.abs(item.unit_price - item.discount_pct) <= RULE_B_TOLERANCE;
}

function neighbourPriceValues(item: MonetaryLineItem): number[] {
  const values: number[] = [];
  if (item.gross_unit_price != null) values.push(item.gross_unit_price);
  if (item.unit_price != null) values.push(item.unit_price);
  return values;
}

function matchesPrice(a: number, b: number): boolean {
  return Math.abs(a - b) <= PRICE_TOLERANCE;
}

/** Gross unit_price with net line total: qty×unit_price exceeds total beyond tolerance. */
function hasInconsistentGrossLineTotal(item: MonetaryLineItem): boolean {
  const { quantity, unit_price, total } = item;
  if (quantity == null || quantity <= 0 || unit_price == null || total == null) {
    return false;
  }
  const lineFromUnit = unit_price * quantity;
  if (Math.abs(lineFromUnit - total) <= PRICE_TOLERANCE) return false;
  return total < lineFromUnit - PRICE_TOLERANCE;
}

function applyEffectivePaidPrice(item: MonetaryLineItem): MonetaryLineItem {
  // Rows with an extracted discount % are net-derived in applyStructuredBinding.
  if (item.discount_pct != null) {
    return item;
  }
  if (!hasInconsistentGrossLineTotal(item)) return item;
  return {
    ...item,
    unit_price: round2(item.total! / item.quantity!),
  };
}

/** Rule E: unit_price matches adjacent row's price and row arithmetic is inconsistent. */
function triggersRuleE(
  items: MonetaryLineItem[],
  index: number,
): boolean {
  const item = items[index];
  if (item.unit_price == null) return false;

  const neighbourIndexes = [index - 1, index + 1].filter(
    (i) => i >= 0 && i < items.length && i !== index,
  );

  for (const ni of neighbourIndexes) {
    const neighbourValues = neighbourPriceValues(items[ni]);
    const neighbourMatch = neighbourValues.some((v) =>
      matchesPrice(item.unit_price!, v)
    );
    if (!neighbourMatch) continue;

    const qty = item.quantity;
    const total = item.line_total_net ?? item.total;
    if (qty == null || qty <= 0 || total == null) continue;

    if (Math.abs(qty * item.unit_price - total) > PRICE_TOLERANCE) {
      return true;
    }
  }

  return false;
}

function rebindFromStructured(item: MonetaryLineItem): MonetaryLineItem {
  const derived = applyStructuredBinding(item);
  if (
    derived.unit_price !== item.unit_price ||
    derived.total !== item.total
  ) {
    return derived;
  }

  const { line_total_net, quantity } = item;
  if (line_total_net != null && quantity != null && quantity > 0) {
    return {
      ...item,
      unit_price: round2(line_total_net / quantity),
      total: line_total_net,
    };
  }

  return item;
}

function triggersRuleF(item: MonetaryLineItem): boolean {
  const { gross_unit_price, discount_pct, line_total_net, quantity } = item;
  if (gross_unit_price == null || discount_pct == null || line_total_net == null) {
    return false;
  }
  if (quantity == null || quantity <= 0) return false;
  const expected = round2(quantity * gross_unit_price * (1 - discount_pct / 100));
  return Math.abs(expected - line_total_net) > 0.05;
}

function applyRuleF(item: MonetaryLineItem): MonetaryLineItem {
  if (item.line_total_net == null) return item;

  if (item.quantity === 1) {
    return {
      ...item,
      unit_price: round2(item.line_total_net),
      total: item.line_total_net,
    };
  }

  const derivedNet = deriveNetUnitPrice(item.gross_unit_price, item.discount_pct);
  if (derivedNet == null) return item;
  return {
    ...item,
    unit_price: derivedNet,
    total: item.line_total_net,
  };
}

function bindRow(
  items: MonetaryLineItem[],
  index: number,
): MonetaryLineItem {
  let item = applyStructuredBinding(items[index]);

  if (triggersRuleF(item)) {
    item = applyRuleF(item);
  } else if (triggersRuleB(item)) {
    item = rebindFromStructured(item);
  } else if (triggersRuleE(items, index)) {
    item = rebindFromStructured(item);
  } else if (
    hasDiscountLine(item) &&
    item.gross_unit_price != null &&
    item.line_total_net != null &&
    item.unit_price != null &&
    matchesPrice(item.unit_price, item.line_total_net) &&
    item.quantity === 1
  ) {
    // VALOR LÍQUIDO copied into unit_price when gross+discount exist — re-derive net unit.
    item = applyStructuredBinding(item);
  }

  return applyEffectivePaidPrice(item);
}

/**
 * Deterministic monetary column binding after Pass C.
 * Rule B (unit ≈ discount %), Rule E (neighbour bleed), and effective paid price
 * (total ÷ qty when gross unit_price × qty ≠ net total).
 */
export function bindMonetaryColumns(items: MonetaryLineItem[]): MonetaryLineItem[] {
  const structured = items.map(applyStructuredBinding);
  return structured.map((_, index) => bindRow(structured, index));
}

export function monetaryToInvoiceLineItem(item: MonetaryLineItem): InvoiceLineItem {
  return {
    name: item.name,
    quantity: item.quantity,
    unit: item.unit,
    unit_price: item.unit_price,
    total: item.total,
  };
}
