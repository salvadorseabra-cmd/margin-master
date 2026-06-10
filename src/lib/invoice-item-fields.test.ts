import { describe, expect, it } from "vitest";
import {
  normalizeInvoiceItemFields,
  normalizeInvoiceUnitToken,
  shouldRejectInvoiceIngredientRow,
} from "./invoice-item-fields";

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

describe("normalizeInvoiceUnitToken", () => {
  it.each([
    ["MO", "mo"],
    ["mo", "mo"],
    ["maço", "mo"],
    ["maco", "mo"],
    ["EM", "em"],
    ["em", "em"],
    ["embalagem", "em"],
    ["emb", "em"],
    ["embalagens", "em"],
    ["kg", "kg"],
    ["g", "g"],
    ["gr", "g"],
    ["L", "L"],
    ["l", "L"],
    ["lt", "L"],
    ["ml", "ml"],
    ["un", "un"],
    ["uni", "un"],
    ["cx", "cx"],
    ["caixa", "caixa"],
    ["dz", "dz"],
  ] as const)("maps %s to %s", (input, expected) => {
    expect(normalizeInvoiceUnitToken(input)).toBe(expected);
  });

  it("returns null for empty input", () => {
    expect(normalizeInvoiceUnitToken(null)).toBeNull();
    expect(normalizeInvoiceUnitToken("")).toBeNull();
  });
});

describe("normalizeInvoiceItemFields", () => {
  it("preserves Bidfood MO/EM units from row fields", () => {
    const tomilho = normalizeInvoiceItemFields({
      id: "1",
      name: "Tomilho 1 mo 1,50 € 1,50",
      quantity: 1,
      unit: "MO",
      unit_price: 1.5,
      total: 1.5,
    });
    expect(tomilho.unit).toBe("mo");

    const salada = normalizeInvoiceItemFields({
      id: "2",
      name: "Salada 1 em 2,00 € 2,00",
      quantity: 1,
      unit: "EM",
      unit_price: 2,
      total: 2,
    });
    expect(salada.unit).toBe("em");
  });
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
