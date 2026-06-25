import { describe, expect, it } from "vitest";
import {
  lineNeedsExtractionReview,
  validateInvoiceLine,
} from "@/lib/invoice-validation/engine";
import {
  hasMathematicalInconsistency,
  MATHEMATICAL_INCONSISTENCY_CODE,
} from "@/lib/invoice-validation/validators/mathematics";
import { OPERATIONAL_NORMALIZATION_INCONSISTENCY_CODE } from "@/lib/invoice-validation/validators/operational";
import { INVOICE_EXTRACTION_REVIEW_REASON_CODES } from "@/lib/invoice-extraction-review";

const GUANCIALE = {
  id: "6efebedf-c78e-46c1-9ae1-58792229834b",
  name: "Guanciale di suino stagionato +/- 1,5kg*7 Sorrentino",
  quantity: 5.996,
  unit: "un",
  unit_price: 10.83,
  total: 64.93,
};

const GORGONZOLA_CANONICAL = {
  id: "bece238e-fd6d-493c-8555-6921b164f97c",
  name: "Arrigoni Formaggi - Gorgonzola DOP Dolce Linea Castelfrigo 1/8 - 1,5kg",
  quantity: 1.05,
  unit: "kg",
  unit_price: 10.88,
  total: 13.44,
};

const GORGONZOLA_REEXTRACTED = {
  id: "fd785aba-reextracted",
  name: "Arrigoni Formaggi - Gorgonzola DOP Dolce Linea Castelfrigo 1/8 - 1,5kg",
  quantity: 1.3,
  unit: "kg",
  unit_price: 9.88,
  total: 13.44,
};

describe("validateMathematicsFindings", () => {
  it("flags canonical Gorgonzola triple with error finding", () => {
    expect(hasMathematicalInconsistency(GORGONZOLA_CANONICAL)).toBe(true);
    const findings = validateInvoiceLine(GORGONZOLA_CANONICAL);
    const mathError = findings.find((f) => f.code === MATHEMATICAL_INCONSISTENCY_CODE);
    expect(mathError?.severity).toBe("error");
    expect(mathError?.category).toBe("mathematics");
  });

  it("flags re-extracted Gorgonzola 4.46% gap via OR threshold", () => {
    expect(hasMathematicalInconsistency(GORGONZOLA_REEXTRACTED)).toBe(true);
    const findings = validateInvoiceLine(GORGONZOLA_REEXTRACTED);
    expect(
      findings.some((f) => f.code === MATHEMATICAL_INCONSISTENCY_CODE && f.severity === "error"),
    ).toBe(true);
    expect(
      findings.some(
        (f) =>
          f.code === INVOICE_EXTRACTION_REVIEW_REASON_CODES.MATHEMATICAL_RECONCILIATION_FAILURE,
      ),
    ).toBe(false);
  });

  it("passes reconciled Emporio net row", () => {
    const input = { quantity: 1.35, unit_price: 9.95, total: 13.44 };
    expect(hasMathematicalInconsistency(input)).toBe(false);
  });
});

describe("validateOperationalFindings", () => {
  it("does not flag Guanciale when billed-kg normalization reconciles", () => {
    const findings = validateInvoiceLine(GUANCIALE);
    expect(
      findings.some((f) => f.code === OPERATIONAL_NORMALIZATION_INCONSISTENCY_CODE),
    ).toBe(false);
  });

  it("does not flag Mozzarella Julienne multipack row", () => {
    const findings = validateInvoiceLine({
      id: "mozzarella",
      name: "Mozzarella Julienne 3kg x10",
      quantity: 10,
      unit: "un",
      unit_price: 20.03,
      total: 200.3,
    });
    expect(
      findings.some((f) => f.code === OPERATIONAL_NORMALIZATION_INCONSISTENCY_CODE),
    ).toBe(false);
  });
});

describe("validateExtractionFindings migration", () => {
  it("preserves migrated AND-threshold math review for Gorgonzola canonical", () => {
    const findings = validateInvoiceLine(GORGONZOLA_CANONICAL);
    expect(
      findings.some(
        (f) =>
          f.code === INVOICE_EXTRACTION_REVIEW_REASON_CODES.MATHEMATICAL_RECONCILIATION_FAILURE,
      ),
    ).toBe(true);
  });

  it("lineNeedsExtractionReview includes operational warnings", () => {
    const findings = validateInvoiceLine(GORGONZOLA_CANONICAL);
    expect(lineNeedsExtractionReview(findings)).toBe(true);
  });
});
