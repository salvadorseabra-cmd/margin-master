export type InvoiceLineItem = {
  name: string;
  quantity: number | null;
  unit: string | null;
  unit_price: number | null;
  total: number | null;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Common GPT vision OCR slips on leading digits for sub-€10 pack prices. */
const OCR_GAP_EUR = [0.5, 1] as const;

function isSinglePackLine(item: InvoiceLineItem): boolean {
  return (
    item.quantity === 1 &&
    item.unit_price != null &&
    item.total != null &&
    Math.abs(item.unit_price - item.total) < 0.01
  );
}

/**
 * When line totals sum below the invoice net subtotal (VALOR LÍQUIDO), fix a lone
 * misread sub-€10 pack price if the gap matches a typical 8↔9 OCR slip.
 */
export function reconcileLineItemsToNetSubtotal(
  items: InvoiceLineItem[],
  netSubtotal: number | null,
): InvoiceLineItem[] {
  if (netSubtotal == null || items.length === 0) return items;

  const lineSum = round2(items.reduce((sum, item) => sum + (item.total ?? 0), 0));
  const gap = round2(netSubtotal - lineSum);
  if (Math.abs(gap) < 0.01) return items;
  if (!OCR_GAP_EUR.some((g) => Math.abs(gap - g) < 0.01)) return items;

  const candidateIndexes: number[] = [];
  const corrected = items.map((item, index) => {
    if (!isSinglePackLine(item) || item.unit_price! >= 10) return item;

    const newUnit = round2(item.unit_price! + gap);
    const newTotal = newUnit;
    if (newUnit <= 0 || newUnit >= 100) return item;

    const pctChange = Math.abs(newUnit - item.unit_price!) / item.unit_price!;
    if (pctChange > 0.12) return item;

    candidateIndexes.push(index);
    return { ...item, unit_price: newUnit, total: newTotal };
  });

  if (candidateIndexes.length !== 1) return items;

  const correctedSum = round2(
    corrected.reduce((sum, item) => sum + (item.total ?? 0), 0),
  );
  if (Math.abs(correctedSum - netSubtotal) > 0.02) return items;

  return corrected;
}

/**
 * Fill missing unit_price or total when only one amount column was extracted.
 * When all three fields are present, preserve them as printed — discounted lines
 * often have quantity × unit_price ≠ total and must not be "fixed".
 */
export function reconcileLineItemAmounts(items: InvoiceLineItem[]): InvoiceLineItem[] {
  return items.map((item) => {
    const qty = item.quantity;
    const unitPrice = item.unit_price;
    const total = item.total;
    if (qty == null || qty <= 0) return item;

    if (total != null && unitPrice != null) {
      return item;
    }
    if (total != null && unitPrice == null) {
      return { ...item, unit_price: round2(total / qty) };
    }
    if (unitPrice != null && total == null) {
      return { ...item, total: round2(unitPrice * qty) };
    }
    return item;
  });
}
