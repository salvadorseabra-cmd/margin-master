import type { InvoiceOcrQtyExtractionMeta } from "@/lib/invoice-extraction-review";

export type ValidationFindingSeverity = "info" | "warning" | "error";

export type ValidationFindingCategory =
  | "extraction"
  | "mathematics"
  | "operational"
  | "matching"
  | "supplier";

export type ValidationEvidenceValue = {
  value: number | string;
  unit?: string;
  /** Human-readable row label; preferred over generic Expected/Actual. */
  label?: string;
};

export type ValidationEvidence = {
  field?: string;
  expected?: ValidationEvidenceValue;
  actual?: ValidationEvidenceValue;
  difference?: { absolute?: number; percent?: number };
  extra?: Record<string, unknown>;
};

export type ValidationFinding = {
  id: string;
  severity: ValidationFindingSeverity;
  category: ValidationFindingCategory;
  code: string;
  title: string;
  description: string;
  invoiceItemId?: string;
  evidence?: ValidationEvidence;
  suggestedAction?: string;
  /** @deprecated Use `description` */
  message?: string;
};

export type InvoiceLineValidationInput = {
  id: string;
  name: string;
  quantity: number | null;
  unit: string | null;
  unit_price: number | null;
  total: number | null;
  matchedIngredientName?: string | null;
  suggestedIngredientName?: string | null;
  matchConfidence?: string | null;
  ocrMeta?: InvoiceOcrQtyExtractionMeta | null;
  matchDisplayState?: "confirmed" | "suggested" | "unmatched" | null;
};
