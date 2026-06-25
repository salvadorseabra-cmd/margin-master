import { defaultIsGenericUnit } from "@/lib/ingredient-auto-persist";
import {
  computeMathematicalReconciliation,
  deriveMathematicalReconciliationReviewReason,
  deriveOcrQtyMismatchReviewReason,
  INVOICE_EXTRACTION_REVIEW_REASON_CODES,
  MATHEMATICAL_RECONCILIATION_FAILURE_MESSAGE,
  OCR_QUANTITY_MISMATCH_MESSAGE,
  type MathematicalReconciliationMetadata,
  type InvoiceOcrQuantityMismatchMetadata,
} from "@/lib/invoice-extraction-review";
import { resolveInvoiceLinePurchaseFormat } from "@/lib/invoice-purchase-format";
import { buildValidationFinding } from "@/lib/invoice-validation/finding-id";
import type {
  InvoiceLineValidationInput,
  ValidationEvidence,
  ValidationFinding,
} from "@/lib/invoice-validation/types";

const PLACEHOLDER_ITEM_NAME_CODE = "PLACEHOLDER_ITEM_NAME";
const MISSING_QUANTITY_UNIT_CODE = "MISSING_QUANTITY_UNIT";
const MISSING_AMOUNT_CODE = "MISSING_AMOUNT";

function normalizeExtractedItemName(name: string | null | undefined): string {
  return name?.trim().toLowerCase() ?? "";
}

export function isPlaceholderItemName(name: string): boolean {
  const normalizedName = normalizeExtractedItemName(name);
  return !normalizedName || normalizedName === "unknown";
}

function hasClearInferredQuantityUnit(
  item: Pick<InvoiceLineValidationInput, "name" | "quantity" | "unit">,
): boolean {
  const inferred = resolveInvoiceLinePurchaseFormat({
    name: item.name,
    quantity: item.quantity,
    unit: item.unit,
  }).inferred;
  const hasUsableInference =
    inferred.confidence >= 0.86 &&
    inferred.purchase_quantity > 0 &&
    inferred.purchase_unit != null &&
    inferred.base_unit != null;
  if (!hasUsableInference) return false;
  if (item.quantity == null) {
    return inferred.purchase_unit_count > 1 || inferred.size_is_metadata_only;
  }
  return defaultIsGenericUnit(item.unit) || !item.unit;
}

export function needsQuantityUnitConfirmation(item: InvoiceLineValidationInput): boolean {
  if (item.quantity != null && item.unit) return false;
  return !hasClearInferredQuantityUnit(item);
}

export function needsAmountConfirmation(item: InvoiceLineValidationInput): boolean {
  return item.unit_price == null || item.total == null;
}

function mathReconciliationEvidence(
  metrics: MathematicalReconciliationMetadata,
  input: Pick<InvoiceLineValidationInput, "quantity" | "unit_price">,
): ValidationEvidence {
  return {
    expected: { value: metrics.expected_total, unit: "EUR", label: "Calculated total" },
    actual: { value: metrics.actual_total, unit: "EUR", label: "Invoice total" },
    difference: { absolute: metrics.variance_abs, percent: metrics.variance_pct },
    extra: {
      quantity: input.quantity,
      unit_price: input.unit_price,
    },
  };
}

function ocrQuantityEvidence(mismatch: InvoiceOcrQuantityMismatchMetadata): ValidationEvidence {
  return {
    field: "quantity",
    expected: { value: mismatch.ocr_quantity, label: "Quantity on PDF" },
    actual: { value: mismatch.pass_c_quantity, label: "Quantity on row" },
    difference: { percent: mismatch.delta_pct },
  };
}

export function validateExtractionFindings(input: InvoiceLineValidationInput): ValidationFinding[] {
  const findings: ValidationFinding[] = [];
  const itemId = input.id;

  if (isPlaceholderItemName(input.name)) {
    findings.push(
      buildValidationFinding({
        invoiceItemId: itemId,
        severity: "warning",
        category: "extraction",
        code: PLACEHOLDER_ITEM_NAME_CODE,
        field: "name",
        title: "Missing name",
        description: "Extracted item name is missing or unusable.",
        evidence: {
          field: "name",
          expected: { value: "product name", label: "Product name" },
          actual: { value: input.name?.trim() || "unknown", label: "Found" },
        },
        suggestedAction: "Enter the product name from the invoice.",
      }),
    );
  }

  if (needsQuantityUnitConfirmation(input)) {
    findings.push(
      buildValidationFinding({
        invoiceItemId: itemId,
        severity: "warning",
        category: "extraction",
        code: MISSING_QUANTITY_UNIT_CODE,
        field: "quantity",
        title: "Quantity check",
        description: "Quantity or unit is missing and could not be inferred from the line.",
        evidence: {
          field: "quantity",
          expected: { value: "present" },
          extra: {
            quantity: input.quantity,
            unit: input.unit,
          },
        },
        suggestedAction: "Confirm quantity and unit from the invoice.",
      }),
    );
  }

  if (needsAmountConfirmation(input)) {
    findings.push(
      buildValidationFinding({
        invoiceItemId: itemId,
        severity: "warning",
        category: "extraction",
        code: MISSING_AMOUNT_CODE,
        field: "unit_price",
        title: "Missing amount",
        description: "Unit price or line total is missing.",
        evidence: {
          field: "unit_price",
          expected: { value: "present" },
          extra: {
            unit_price: input.unit_price,
            total: input.total,
          },
        },
        suggestedAction: "Fill in unit price and line total from the invoice.",
      }),
    );
  }

  const mathReason = deriveMathematicalReconciliationReviewReason(input);
  if (mathReason) {
    findings.push(
      buildValidationFinding({
        invoiceItemId: itemId,
        severity: "warning",
        category: "mathematics",
        code: mathReason.code,
        title: "Math mismatch",
        description: mathReason.message,
        evidence: mathReconciliationEvidence(mathReason.metadata, input),
        suggestedAction: "Reconcile quantity, unit price, and line total.",
      }),
    );
  }

  const ocrReason = deriveOcrQtyMismatchReviewReason(input.ocrMeta);
  if (ocrReason) {
    findings.push(
      buildValidationFinding({
        invoiceItemId: itemId,
        severity: "warning",
        category: "extraction",
        code: ocrReason.code,
        field: "quantity",
        title: "OCR qty mismatch",
        description: ocrReason.message,
        evidence: ocrQuantityEvidence(ocrReason.metadata),
        suggestedAction: "Confirm quantity against the invoice PDF.",
      }),
    );
  }

  return findings;
}

export const EXTRACTION_REVIEW_REASON_CODES = {
  PLACEHOLDER_ITEM_NAME: PLACEHOLDER_ITEM_NAME_CODE,
  MISSING_QUANTITY_UNIT: MISSING_QUANTITY_UNIT_CODE,
  MISSING_AMOUNT: MISSING_AMOUNT_CODE,
  MATHEMATICAL_RECONCILIATION_FAILURE:
    INVOICE_EXTRACTION_REVIEW_REASON_CODES.MATHEMATICAL_RECONCILIATION_FAILURE,
  OCR_QUANTITY_MISMATCH: INVOICE_EXTRACTION_REVIEW_REASON_CODES.OCR_QUANTITY_MISMATCH,
} as const;

export const EXTRACTION_REVIEW_MESSAGES = {
  MATHEMATICAL_RECONCILIATION_FAILURE: MATHEMATICAL_RECONCILIATION_FAILURE_MESSAGE,
  OCR_QUANTITY_MISMATCH: OCR_QUANTITY_MISMATCH_MESSAGE,
} as const;

export { mathReconciliationEvidence, ocrQuantityEvidence };
