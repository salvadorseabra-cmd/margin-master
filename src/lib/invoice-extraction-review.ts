/**
 * Invoice extraction review guardrails — detection only; no persistence or costing changes.
 */

import type { InvoiceItemRow } from "@/lib/invoice-item-fields";

export const MATHEMATICAL_RECONCILIATION_VARIANCE_ABS_THRESHOLD_EUR = 0.5;
export const MATHEMATICAL_RECONCILIATION_VARIANCE_PCT_THRESHOLD = 5;

export const INVOICE_EXTRACTION_REVIEW_REASON_CODES = {
  MATHEMATICAL_RECONCILIATION_FAILURE: "MATHEMATICAL_RECONCILIATION_FAILURE",
  OCR_QUANTITY_MISMATCH: "OCR_QUANTITY_MISMATCH",
} as const;

export type InvoiceMathematicalReconciliationReviewReasonCode =
  (typeof INVOICE_EXTRACTION_REVIEW_REASON_CODES)["MATHEMATICAL_RECONCILIATION_FAILURE"];

export type InvoiceOcrQuantityMismatchReviewReasonCode =
  (typeof INVOICE_EXTRACTION_REVIEW_REASON_CODES)["OCR_QUANTITY_MISMATCH"];

export type InvoiceExtractionReviewReasonCode =
  | InvoiceMathematicalReconciliationReviewReasonCode
  | InvoiceOcrQuantityMismatchReviewReasonCode;

export type MathematicalReconciliationMetadata = {
  expected_total: number;
  actual_total: number;
  variance_abs: number;
  variance_pct: number;
};

export type InvoiceMathematicalReconciliationReviewReason = {
  code: InvoiceMathematicalReconciliationReviewReasonCode;
  message: string;
  metadata: MathematicalReconciliationMetadata;
};

export const MATHEMATICAL_RECONCILIATION_FAILURE_MESSAGE =
  "Quantity × Unit Price does not reconcile with Line Total";

export const OCR_QUANTITY_MISMATCH_MESSAGE =
  "Extracted quantity differs materially from OCR quantity";

export type InvoiceOcrQuantityMismatchMetadata = {
  ocr_quantity: number;
  pass_c_quantity: number;
  delta_pct: number;
};

export type InvoiceOcrQuantityMismatchReviewReason = {
  code: InvoiceOcrQuantityMismatchReviewReasonCode;
  message: string;
  metadata: InvoiceOcrQuantityMismatchMetadata;
};

export type InvoiceExtractionReviewReason =
  | InvoiceMathematicalReconciliationReviewReason
  | InvoiceOcrQuantityMismatchReviewReason;

export type InvoiceExtractionReviewInput = Pick<
  InvoiceItemRow,
  "quantity" | "unit_price" | "total"
>;

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** expected_total = qty × unit_price; variance vs line total. */
export function computeMathematicalReconciliation(
  input: InvoiceExtractionReviewInput,
): MathematicalReconciliationMetadata | null {
  const qty = input.quantity == null ? null : Number(input.quantity);
  const unitPrice = input.unit_price == null ? null : Number(input.unit_price);
  const total = input.total == null ? null : Number(input.total);

  if (qty == null || !Number.isFinite(qty) || qty <= 0) return null;
  if (unitPrice == null || !Number.isFinite(unitPrice)) return null;
  if (total == null || !Number.isFinite(total)) return null;

  const expected_total = round2(qty * unitPrice);
  const actual_total = round2(total);
  const variance_abs = round2(Math.abs(expected_total - actual_total));
  const denom = Math.max(Math.abs(actual_total), Math.abs(expected_total), 0.01);
  const variance_pct = round2((variance_abs / denom) * 100);

  return { expected_total, actual_total, variance_abs, variance_pct };
}

/** Flag when variance_abs > €0.50 AND variance_pct > 5%. */
export function needsMathematicalReconciliationReview(
  input: InvoiceExtractionReviewInput,
): boolean {
  const metrics = computeMathematicalReconciliation(input);
  if (!metrics) return false;
  return (
    metrics.variance_abs > MATHEMATICAL_RECONCILIATION_VARIANCE_ABS_THRESHOLD_EUR &&
    metrics.variance_pct > MATHEMATICAL_RECONCILIATION_VARIANCE_PCT_THRESHOLD
  );
}

export function deriveMathematicalReconciliationReviewReason(
  input: InvoiceExtractionReviewInput,
): InvoiceMathematicalReconciliationReviewReason | null {
  if (!needsMathematicalReconciliationReview(input)) return null;
  const metadata = computeMathematicalReconciliation(input);
  if (!metadata) return null;
  return {
    code: INVOICE_EXTRACTION_REVIEW_REASON_CODES.MATHEMATICAL_RECONCILIATION_FAILURE,
    message: MATHEMATICAL_RECONCILIATION_FAILURE_MESSAGE,
    metadata,
  };
}

export type InvoiceOcrQtyExtractionMeta = {
  ocr_quantity?: number | null;
  pass_c_quantity?: number | null;
  quantity_anchored?: boolean;
  ocr_qty_mismatch?: boolean;
};

export function computeOcrQuantityMismatch(
  meta: InvoiceOcrQtyExtractionMeta | null | undefined,
): InvoiceOcrQuantityMismatchMetadata | null {
  if (!meta?.ocr_qty_mismatch) return null;
  const ocrQty = meta.ocr_quantity;
  const passCQty = meta.pass_c_quantity;
  if (ocrQty == null || passCQty == null || !Number.isFinite(ocrQty) || !Number.isFinite(passCQty)) {
    return null;
  }
  const delta_pct = round2((Math.abs(ocrQty - passCQty) / Math.max(ocrQty, 0.01)) * 100);
  return { ocr_quantity: ocrQty, pass_c_quantity: passCQty, delta_pct };
}

/** Flag when edge anchoring marked OCR-vs-Pass-C disagreement on scoped family rows. */
export function needsOcrQtyMismatchReview(
  meta: InvoiceOcrQtyExtractionMeta | null | undefined,
): boolean {
  return computeOcrQuantityMismatch(meta) != null;
}

export function deriveOcrQtyMismatchReviewReason(
  meta: InvoiceOcrQtyExtractionMeta | null | undefined,
): InvoiceOcrQuantityMismatchReviewReason | null {
  const mismatch = computeOcrQuantityMismatch(meta);
  if (!mismatch) return null;
  return {
    code: INVOICE_EXTRACTION_REVIEW_REASON_CODES.OCR_QUANTITY_MISMATCH,
    message: OCR_QUANTITY_MISMATCH_MESSAGE,
    metadata: mismatch,
  };
}

export function deriveInvoiceExtractionReviewReason(
  input: InvoiceExtractionReviewInput,
  ocrMeta?: InvoiceOcrQtyExtractionMeta | null,
): InvoiceExtractionReviewReason | null {
  return (
    deriveMathematicalReconciliationReviewReason(input) ??
    deriveOcrQtyMismatchReviewReason(ocrMeta)
  );
}
