import { describe, expect, it } from "vitest";
import { shouldRejectInvoiceIngredientRow } from "./invoice-item-fields";

const row = (
  name: string,
  overrides: Partial<{
    quantity: number | null;
    unit: string | null;
    unit_price: number | null;
    total: number | null;
  }> = {},
) => ({
  id: "test-row",
  name,
  quantity: 2,
  unit: "un",
  unit_price: 4.5,
  total: 9,
  ...overrides,
});

describe("shouldRejectInvoiceIngredientRow", () => {
  it("keeps product rows with parenthetical packaging (CARTÃO)", () => {
    expect(
      shouldRejectInvoiceIngredientRow(
        row("Ovo MORENO Classe M Cx.15 dúzias (CARTÃO)"),
      ),
    ).toBe(false);
  });

  it("rejects genuine payment metadata rows", () => {
    expect(shouldRejectInvoiceIngredientRow(row("Cartão Visa"))).toBe(true);
    expect(shouldRejectInvoiceIngredientRow(row("Pagamento por cartão"))).toBe(true);
    expect(shouldRejectInvoiceIngredientRow(row("Multibanco"))).toBe(true);
    expect(shouldRejectInvoiceIngredientRow(row("MB Way"))).toBe(true);
    expect(shouldRejectInvoiceIngredientRow(row("IBAN PT50 0000 0000 0000 0000 0000 0"))).toBe(
      true,
    );
    expect(shouldRejectInvoiceIngredientRow(row("SWIFT BESCPTPL"))).toBe(true);
  });

  it("rejects tax summary rows", () => {
    expect(shouldRejectInvoiceIngredientRow(row("Total documento"))).toBe(true);
    expect(shouldRejectInvoiceIngredientRow(row("Valor IVA"))).toBe(true);
  });
});
