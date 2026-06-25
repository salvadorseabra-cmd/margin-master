import { buildValidationFinding } from "@/lib/invoice-validation/finding-id";
import type { InvoiceLineValidationInput, ValidationFinding } from "@/lib/invoice-validation/types";

const UNMATCHED_INGREDIENT_CODE = "UNMATCHED_INGREDIENT";
const SUGGESTED_INGREDIENT_MATCH_CODE = "SUGGESTED_INGREDIENT_MATCH";

export function validateMatchingFindings(input: InvoiceLineValidationInput): ValidationFinding[] {
  const displayState = input.matchDisplayState;
  if (!displayState || displayState === "confirmed") return [];

  if (displayState === "unmatched") {
    return [
      buildValidationFinding({
        invoiceItemId: input.id,
        severity: "warning",
        category: "matching",
        code: UNMATCHED_INGREDIENT_CODE,
        title: "Unmatched ingredient",
        description: "This line is not linked to a catalog ingredient.",
        evidence: {
          field: "ingredient",
          expected: { value: "catalog match", label: "Linked ingredient" },
          extra: {
            item_name: input.name,
          },
        },
        suggestedAction: "Match or create a canonical ingredient.",
      }),
    ];
  }

  if (displayState === "suggested") {
    const suggestedIngredient =
      input.suggestedIngredientName ?? input.matchedIngredientName ?? null;
    return [
      buildValidationFinding({
        invoiceItemId: input.id,
        severity: "info",
        category: "matching",
        code: SUGGESTED_INGREDIENT_MATCH_CODE,
        title: "Suggested match",
        description: "A possible ingredient match needs confirmation.",
        evidence: {
          field: "ingredient",
          extra: {
            suggested_ingredient: suggestedIngredient,
            confidence: input.matchConfidence ?? null,
          },
        },
        suggestedAction: "Confirm or change the suggested ingredient match.",
      }),
    ];
  }

  return [];
}
