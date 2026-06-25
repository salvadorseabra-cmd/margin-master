import type { InvoiceLineValidationInput, ValidationFinding } from "@/lib/invoice-validation/types";
import { validateExtractionFindings } from "@/lib/invoice-validation/validators/extraction";
import { validateMathematicsFindings } from "@/lib/invoice-validation/validators/mathematics";
import { validateMatchingFindings } from "@/lib/invoice-validation/validators/matching";
import { validateOperationalFindings } from "@/lib/invoice-validation/validators/operational";

const VALIDATOR_PIPELINE = [
  validateExtractionFindings,
  validateMathematicsFindings,
  validateOperationalFindings,
  validateMatchingFindings,
] as const;

export function validateInvoiceLine(input: InvoiceLineValidationInput): ValidationFinding[] {
  const findings: ValidationFinding[] = [];
  for (const validator of VALIDATOR_PIPELINE) {
    findings.push(...validator(input));
  }
  return dedupeFindings(findings);
}

export function validateInvoiceLines(
  inputs: readonly InvoiceLineValidationInput[],
): ValidationFinding[] {
  return inputs.flatMap((input) => validateInvoiceLine(input));
}

function dedupeFindings(findings: ValidationFinding[]): ValidationFinding[] {
  const seen = new Set<string>();
  const unique: ValidationFinding[] = [];
  for (const finding of findings) {
    if (seen.has(finding.id)) continue;
    seen.add(finding.id);
    unique.push(finding);
  }
  return unique;
}

/** Row highlight / header badge — extraction, math, and operational review signals. */
export function lineNeedsExtractionReview(findings: readonly ValidationFinding[]): boolean {
  return findings.some(
    (finding) =>
      finding.severity !== "info" &&
      (finding.category === "extraction" ||
        finding.category === "mathematics" ||
        finding.category === "operational"),
  );
}

export function findingsForInvoiceItem(
  findings: readonly ValidationFinding[],
  invoiceItemId: string,
): ValidationFinding[] {
  return findings.filter((finding) => finding.invoiceItemId === invoiceItemId);
}
