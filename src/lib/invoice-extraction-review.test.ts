import { describe, expect, it } from "vitest";
import {
  computeMathematicalReconciliation,
  deriveMathematicalReconciliationReviewReason,
  deriveOcrQtyMismatchReviewReason,
  INVOICE_EXTRACTION_REVIEW_REASON_CODES,
  MATHEMATICAL_RECONCILIATION_FAILURE_MESSAGE,
  needsMathematicalReconciliationReview,
  needsOcrQtyMismatchReview,
  OCR_QUANTITY_MISMATCH_MESSAGE,
} from "./invoice-extraction-review";

describe("needsMathematicalReconciliationReview", () => {
  it("A) flags Gorgonzola-style failure (1.05×10.88 vs 13.44)", () => {
    const input = { quantity: 1.05, unit_price: 10.88, total: 13.44 };
    expect(needsMathematicalReconciliationReview(input)).toBe(true);
    const metrics = computeMathematicalReconciliation(input)!;
    expect(metrics.expected_total).toBe(11.42);
    expect(metrics.actual_total).toBe(13.44);
    expect(metrics.variance_abs).toBe(2.02);
    expect(metrics.variance_pct).toBeGreaterThan(5);
  });

  it("B) passes correct Emporio net row (1.35×9.95 vs 13.44)", () => {
    const input = { quantity: 1.35, unit_price: 9.95, total: 13.44 };
    expect(needsMathematicalReconciliationReview(input)).toBe(false);
    const metrics = computeMathematicalReconciliation(input)!;
    expect(metrics.variance_abs).toBeLessThanOrEqual(0.5);
  });

  it("C) passes minor rounding (10×8.12 vs 81.23)", () => {
    const input = { quantity: 10, unit_price: 8.12, total: 81.23 };
    expect(needsMathematicalReconciliationReview(input)).toBe(false);
    const metrics = computeMathematicalReconciliation(input)!;
    expect(metrics.variance_abs).toBe(0.03);
    expect(metrics.variance_pct).toBeLessThan(5);
  });

  it("D) passes discounted line below pct threshold (Aceto 1×15.55 vs 16.09)", () => {
    const input = { quantity: 1, unit_price: 15.55, total: 16.09 };
    expect(needsMathematicalReconciliationReview(input)).toBe(false);
    const metrics = computeMathematicalReconciliation(input)!;
    expect(metrics.variance_abs).toBe(0.54);
    expect(metrics.variance_pct).toBeLessThan(5);
  });

  it("returns false when qty, unit_price, or total is missing", () => {
    expect(
      needsMathematicalReconciliationReview({ quantity: null, unit_price: 10, total: 10 }),
    ).toBe(false);
    expect(
      needsMathematicalReconciliationReview({ quantity: 1, unit_price: null, total: 10 }),
    ).toBe(false);
    expect(
      needsMathematicalReconciliationReview({ quantity: 1, unit_price: 10, total: null }),
    ).toBe(false);
  });
});

describe("deriveMathematicalReconciliationReviewReason", () => {
  it("returns MATHEMATICAL_RECONCILIATION_FAILURE with metadata when flagged", () => {
    const reason = deriveMathematicalReconciliationReviewReason({
      quantity: 1.05,
      unit_price: 10.88,
      total: 13.44,
    });
    expect(reason).toEqual({
      code: INVOICE_EXTRACTION_REVIEW_REASON_CODES.MATHEMATICAL_RECONCILIATION_FAILURE,
      message: MATHEMATICAL_RECONCILIATION_FAILURE_MESSAGE,
      metadata: {
        expected_total: 11.42,
        actual_total: 13.44,
        variance_abs: 2.02,
        variance_pct: 15.03,
      },
    });
  });

  it("returns null when reconciliation passes", () => {
    expect(
      deriveMathematicalReconciliationReviewReason({
        quantity: 4.3,
        unit_price: 8.5,
        total: 36.54,
      }),
    ).toBeNull();
  });
});

describe("needsOcrQtyMismatchReview", () => {
  it("flags v38-style mismatch when edge marked ocr_qty_mismatch", () => {
    const meta = {
      ocr_quantity: 1.35,
      pass_c_quantity: 2,
      quantity_anchored: false,
      ocr_qty_mismatch: true,
    };
    expect(needsOcrQtyMismatchReview(meta)).toBe(true);
    const reason = deriveOcrQtyMismatchReviewReason(meta);
    expect(reason).toEqual({
      code: INVOICE_EXTRACTION_REVIEW_REASON_CODES.OCR_QUANTITY_MISMATCH,
      message: OCR_QUANTITY_MISMATCH_MESSAGE,
      metadata: {
        ocr_quantity: 1.35,
        pass_c_quantity: 2,
        delta_pct: 48.15,
      },
    });
  });

  it("passes when anchored or agreement", () => {
    expect(
      needsOcrQtyMismatchReview({
        ocr_quantity: 1.35,
        pass_c_quantity: 1.35,
        ocr_qty_mismatch: false,
      }),
    ).toBe(false);
    expect(
      needsOcrQtyMismatchReview({
        ocr_quantity: 1.35,
        pass_c_quantity: 1.05,
        quantity_anchored: true,
        ocr_qty_mismatch: false,
      }),
    ).toBe(false);
  });

  it("returns false when meta absent", () => {
    expect(needsOcrQtyMismatchReview(null)).toBe(false);
    expect(needsOcrQtyMismatchReview(undefined)).toBe(false);
  });
});
