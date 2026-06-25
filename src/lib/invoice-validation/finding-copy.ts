import type { ValidationFinding } from "@/lib/invoice-validation/types";

export type PresentedFindingCopy = {
  title: string;
  description: string;
  suggestedAction?: string;
};

function formatPercent(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  return `${rounded}%`;
}

function operationalVariant(finding: ValidationFinding): string | undefined {
  const check = finding.evidence?.extra?.check;
  return typeof check === "string" ? check : undefined;
}

const MATH_DESCRIPTION =
  "The quantity, unit price and invoice total don't add up.";

const PACKAGE_DESCRIPTION =
  "The detected package size doesn't match the billed quantity. This affects the calculated cost per kg.";

function operationalDescription(finding: ValidationFinding, fallback: string): string {
  const variant = operationalVariant(finding);

  if (variant === "pack_structure_vs_row_weight") {
    return PACKAGE_DESCRIPTION;
  }

  if (variant === "display_operational_vs_invoice") {
    const unit = finding.evidence?.expected?.unit?.toLowerCase();
    const unitLabel = unit === "eur/l" ? "L" : "kg";
    return `The price per ${unitLabel} implied by the invoice doesn't match how we interpreted the pack size from the product name.`;
  }

  return fallback;
}

function ocrQuantityDescription(finding: ValidationFinding, fallback: string): string {
  const ocr = finding.evidence?.expected?.value;
  const entered = finding.evidence?.actual?.value;
  const pct = finding.evidence?.difference?.percent;
  if (ocr != null && entered != null && pct != null) {
    return `The quantity we read from the PDF (${ocr}) doesn't match the quantity on this row (${entered}) — about ${formatPercent(pct)} apart.`;
  }
  return fallback;
}

type FindingCopyOverride = {
  title?: string;
  description?: string | ((finding: ValidationFinding, fallback: string) => string);
  suggestedAction?: string | ((finding: ValidationFinding) => string | undefined);
};

const COPY_BY_CODE: Record<string, FindingCopyOverride> = {
  PLACEHOLDER_ITEM_NAME: {
    description: "We couldn't read a product name for this line.",
  },
  MISSING_QUANTITY_UNIT: {
    title: "Missing quantity or unit",
    description:
      "This line is missing a quantity or unit, and we couldn't work it out from the product name.",
  },
  MISSING_AMOUNT: {
    title: "Missing invoice value",
    description: "Unit price or line total is missing from this row.",
  },
  MATHEMATICAL_RECONCILIATION_FAILURE: {
    title: "Review invoice math",
    description: MATH_DESCRIPTION,
    suggestedAction:
      "Check quantity, unit price, and line total against the invoice — one of them is likely wrong.",
  },
  MATHEMATICAL_INCONSISTENCY: {
    title: "Review invoice mathematics",
    description: MATH_DESCRIPTION,
    suggestedAction: "Fix quantity, unit price, or line total to match the invoice.",
  },
  OCR_QUANTITY_MISMATCH: {
    title: "Review quantity",
    description: (finding, fallback) => ocrQuantityDescription(finding, fallback),
  },
  OPERATIONAL_NORMALIZATION_INCONSISTENCY: {
    title: "Review pack interpretation",
    description: (finding, fallback) => operationalDescription(finding, fallback),
    suggestedAction: (finding) => {
      const variant = operationalVariant(finding);
      if (variant === "pack_structure_vs_row_weight") {
        return "Check the invoice: is this line priced by total weight billed, or by number of packs? Update quantity or pack size accordingly.";
      }
      if (variant === "display_operational_vs_invoice") {
        const unit = finding.evidence?.expected?.unit?.toLowerCase();
        const unitLabel = unit === "eur/l" ? "L" : "kg";
        return `Check how many packs/units you bought and the size on the label — the invoice price per ${unitLabel} may be using a different assumption.`;
      }
      return finding.suggestedAction;
    },
  },
  UNMATCHED_INGREDIENT: {
    title: "Ingredient not linked",
    description: "This invoice line isn't linked to an ingredient in your list yet.",
    suggestedAction: "Pick an existing ingredient or add a new one for this product.",
  },
};

function resolveDescription(
  finding: ValidationFinding,
  override: PresentedFindingCopy["description"] | ((finding: ValidationFinding, fallback: string) => string) | undefined,
  fallback: string,
): string {
  if (!override) return fallback;
  if (typeof override === "function") return override(finding, fallback);
  return override;
}

function resolveSuggestedAction(
  finding: ValidationFinding,
  override: string | ((finding: ValidationFinding) => string | undefined) | undefined,
): string | undefined {
  if (!override) return finding.suggestedAction;
  if (typeof override === "function") return override(finding) ?? finding.suggestedAction;
  return override;
}

/** Owner-facing copy overrides keyed by finding code (presentation only). */
export function presentFindingCopy(finding: ValidationFinding): PresentedFindingCopy {
  const fallbackDescription = finding.description ?? finding.message ?? "";
  const override = COPY_BY_CODE[finding.code];

  if (!override) {
    return {
      title: finding.title,
      description: fallbackDescription,
      suggestedAction: finding.suggestedAction,
    };
  }

  return {
    title: override.title ?? finding.title,
    description: resolveDescription(finding, override.description, fallbackDescription),
    suggestedAction: resolveSuggestedAction(finding, override.suggestedAction),
  };
}
