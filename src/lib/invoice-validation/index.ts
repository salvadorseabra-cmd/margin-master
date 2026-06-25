export type {
  InvoiceLineValidationInput,
  ValidationEvidence,
  ValidationFinding,
  ValidationFindingCategory,
  ValidationFindingSeverity,
} from "@/lib/invoice-validation/types";

export {
  findingsForInvoiceItem,
  lineNeedsExtractionReview,
  validateInvoiceLine,
  validateInvoiceLines,
} from "@/lib/invoice-validation/engine";

export {
  reviewRowValidationFindings,
  validationFindingBadgeLabel,
  validationFindingBadgeTitle,
  validationFindingBadgeTone,
  validationFindingDescription,
  validationFindingSuggestedAction,
  type ValidationFindingBadgeTone,
} from "@/lib/invoice-validation/presentation";

export { presentFindingCopy, type PresentedFindingCopy } from "@/lib/invoice-validation/finding-copy";

export { humanizeEvidenceKey } from "@/lib/invoice-validation/humanize-evidence-key";
export {
  groupPresentedEvidence,
  presentEvidence,
  type ComparisonTone,
  type EvidenceEmphasis,
  type EvidenceSection,
  type PresentedEvidenceRow,
} from "@/lib/invoice-validation/present-evidence";
export {
  formatEvidenceScalar,
  formatEvidenceValue,
} from "@/lib/invoice-validation/format-evidence-value";
export {
  ValidationEvidenceRenderer,
  ValidationFindingRenderer,
} from "@/lib/invoice-validation/render-finding";

export {
  isPlaceholderItemName,
  needsAmountConfirmation,
  needsQuantityUnitConfirmation,
} from "@/lib/invoice-validation/validators/extraction";

export {
  hasMathematicalInconsistency,
  MATHEMATICAL_INCONSISTENCY_CODE,
} from "@/lib/invoice-validation/validators/mathematics";

export { OPERATIONAL_NORMALIZATION_INCONSISTENCY_CODE } from "@/lib/invoice-validation/validators/operational";
