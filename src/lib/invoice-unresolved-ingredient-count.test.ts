import { describe, expect, it } from "vitest";
import {
  countUnresolvedInvoiceIngredients,
  countUnresolvedInvoiceIngredientsByInvoice,
  deriveInvoiceListIngredientStatus,
  formatProcessedWithUnresolvedLabel,
  isEligibleInvoiceIngredientRow,
} from "./invoice-unresolved-ingredient-count";

const cheddarCatalog = [{ id: "cheddar", name: "CHEDDAR" }];

const row = (
  id: string,
  name: string,
  overrides: Partial<{
    quantity: number | null;
    unit: string | null;
    unit_price: number | null;
    total: number | null;
  }> = {},
) => ({
  id,
  name,
  quantity: 2,
  unit: "kg",
  unit_price: 4.5,
  total: 9,
  ...overrides,
});

describe("invoice-unresolved-ingredient-count", () => {
  it("counts only unmatched eligible invoice rows", () => {
    const result = countUnresolvedInvoiceIngredients({
      items: [
        row("1", "QUEIJO CHEDDAR AUCHAN 1KG"),
        row("2", "CHK BREADED 5KG"),
        row("3", "UNKNOWN MYSTERY LINE 2KG"),
      ],
      ingredientCatalog: cheddarCatalog,
    });

    expect(result.eligibleRowCount).toBe(3);
    expect(result.matchedCount).toBe(1);
    expect(result.unmatchedCount).toBe(2);
    expect(result.suggestedCount).toBe(0);
    expect(result.isNormalizationComplete).toBe(false);
  });

  it("excludes ignored metadata rows from counts", () => {
    const result = countUnresolvedInvoiceIngredients({
      items: [
        row("1", "QUEIJO CHEDDAR AUCHAN 1KG"),
        row("2", "IBAN PT50 0000 0000 0000 0000 0000 0"),
        row("3", "Total documento"),
      ],
      ingredientCatalog: cheddarCatalog,
    });

    expect(result.eligibleRowCount).toBe(1);
    expect(result.unmatchedCount).toBe(0);
    expect(result.isNormalizationComplete).toBe(true);
  });

  it("treats confirmed alias matches as resolved", () => {
    const result = countUnresolvedInvoiceIngredients({
      items: [row("1", "CHK BREADED 5KG")],
      ingredientCatalog: [{ id: "chk", name: "CHICKEN BREADED" }],
      confirmedAliases: {
        "chk breaded": "chk",
      },
    });

    expect(result.unmatchedCount).toBe(0);
    expect(result.matchedCount).toBe(1);
  });

  it("batch counts per invoice id", () => {
    const counts = countUnresolvedInvoiceIngredientsByInvoice(
      {
        inv1: [row("1", "QUEIJO CHEDDAR AUCHAN 1KG")],
        inv2: [row("2", "CHK BREADED 5KG")],
      },
      cheddarCatalog,
    );

    expect(counts).toEqual({ inv1: 0, inv2: 1 });
  });

  it("deriveInvoiceListIngredientStatus maps green, orange, and red", () => {
    expect(
      deriveInvoiceListIngredientStatus({ baseStatus: "Processed", unmatchedCount: 0 }),
    ).toEqual({ tone: "success", label: "Processed", unmatchedCount: 0 });

    expect(
      deriveInvoiceListIngredientStatus({ baseStatus: "Processed", unmatchedCount: 4 }),
    ).toEqual({
      tone: "warning",
      label: "Processed • 4 unmatched ingredients",
      unmatchedCount: 4,
    });

    expect(deriveInvoiceListIngredientStatus({ baseStatus: "Review", unmatchedCount: 2 })).toEqual({
      tone: "review",
      label: "Needs review",
      unmatchedCount: 2,
    });
  });

  it("formatProcessedWithUnresolvedLabel handles singular", () => {
    expect(formatProcessedWithUnresolvedLabel(1)).toBe("Processed • 1 unmatched ingredient");
    expect(formatProcessedWithUnresolvedLabel(0)).toBe("Processed");
  });

  it("isEligibleInvoiceIngredientRow rejects address-only lines", () => {
    expect(
      isEligibleInvoiceIngredientRow(
        row("x", "Travessa das Flores 12", {
          quantity: null,
          unit: null,
          unit_price: null,
          total: null,
        }),
      ),
    ).toBe(false);
  });
});
