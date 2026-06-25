import { presentFindingCopy } from "@/lib/invoice-validation/finding-copy";
import type { ValidationFinding } from "@/lib/invoice-validation/types";

export type ValidationFindingBadgeTone = "review" | "increase" | "muted" | "success";

export function validationFindingDescription(finding: ValidationFinding): string {
  return presentFindingCopy(finding).description;
}

export function validationFindingSuggestedAction(finding: ValidationFinding): string | undefined {
  return presentFindingCopy(finding).suggestedAction;
}

export function validationFindingBadgeLabel(finding: ValidationFinding): string {
  return presentFindingCopy(finding).title;
}

export function validationFindingBadgeTone(finding: ValidationFinding): ValidationFindingBadgeTone {
  if (finding.severity === "error") return "review";
  if (finding.category === "matching") return finding.severity === "info" ? "muted" : "review";
  return finding.severity === "warning" ? "review" : "muted";
}

export function validationFindingBadgeTitle(finding: ValidationFinding): string {
  return validationFindingDescription(finding);
}

/** Review-row inline badges — extraction, math, and operational only. */
export function reviewRowValidationFindings(
  findings: readonly ValidationFinding[],
): ValidationFinding[] {
  return findings.filter(
    (finding) =>
      finding.category === "extraction" ||
      finding.category === "mathematics" ||
      finding.category === "operational",
  );
}
