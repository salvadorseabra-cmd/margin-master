import type { ValidationEvidence, ValidationFinding } from "@/lib/invoice-validation/types";

export function validationFindingId(
  invoiceItemId: string | undefined,
  code: string,
  field?: string,
): string {
  const base = invoiceItemId ?? "row";
  return field ? `${base}:${code}:${field}` : `${base}:${code}`;
}

type BuildValidationFindingInput = Omit<ValidationFinding, "id"> & {
  invoiceItemId?: string;
  /** Merged into `evidence.field` when building the finding. */
  field?: string;
};

export function buildValidationFinding(partial: BuildValidationFindingInput): ValidationFinding {
  const { field, evidence, description, message, ...rest } = partial;
  const resolvedDescription = description ?? message ?? "";
  const resolvedEvidence: ValidationEvidence | undefined =
    field != null ? { ...evidence, field: evidence?.field ?? field } : evidence;

  return {
    ...rest,
    description: resolvedDescription,
    evidence: resolvedEvidence,
    id: validationFindingId(
      partial.invoiceItemId,
      partial.code,
      resolvedEvidence?.field,
    ),
  };
}
