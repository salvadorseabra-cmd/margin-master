import { computeMathematicalReconciliation } from "@/lib/invoice-extraction-review";
import { buildValidationFinding } from "@/lib/invoice-validation/finding-id";
import type { InvoiceLineValidationInput, ValidationFinding } from "@/lib/invoice-validation/types";
import { mathReconciliationEvidence } from "@/lib/invoice-validation/validators/extraction";

export const MATHEMATICAL_INCONSISTENCY_CODE = "MATHEMATICAL_INCONSISTENCY";
export const MATHEMATICAL_INCONSISTENCY_VARIANCE_ABS_THRESHOLD_EUR = 0.5;
export const MATHEMATICAL_INCONSISTENCY_VARIANCE_PCT_THRESHOLD = 5;

const MATHEMATICAL_INCONSISTENCY_DESCRIPTION =
  "Quantity × unit price does not reconcile with line total";

/** OR gate: variance_abs > €0.50 OR variance_pct > 5% (catches sub-5% euro gaps). */
export function hasMathematicalInconsistency(
  input: Pick<InvoiceLineValidationInput, "quantity" | "unit_price" | "total">,
): boolean {
  const metrics = computeMathematicalReconciliation(input);
  if (!metrics) return false;
  return (
    metrics.variance_abs > MATHEMATICAL_INCONSISTENCY_VARIANCE_ABS_THRESHOLD_EUR ||
    metrics.variance_pct > MATHEMATICAL_INCONSISTENCY_VARIANCE_PCT_THRESHOLD
  );
}

export function validateMathematicsFindings(input: InvoiceLineValidationInput): ValidationFinding[] {
  if (!hasMathematicalInconsistency(input)) return [];

  const metrics = computeMathematicalReconciliation(input);
  if (!metrics) return [];

  return [
    buildValidationFinding({
      invoiceItemId: input.id,
      severity: "error",
      category: "mathematics",
      code: MATHEMATICAL_INCONSISTENCY_CODE,
      title: "Math inconsistency",
      description: MATHEMATICAL_INCONSISTENCY_DESCRIPTION,
      evidence: mathReconciliationEvidence(metrics, input),
      suggestedAction: "Correct quantity, unit price, or line total so the row reconciles.",
    }),
  ];
}
