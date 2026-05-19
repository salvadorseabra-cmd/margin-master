import { describe, expect, it } from "vitest";
import {
  INVOICE_MATCH_NORMALIZATION_EXAMPLES,
  NORMALIZE_INGREDIENT_NAME_EXAMPLES,
  normalizeIngredientName,
  normalizeInvoiceMatchIngredientName,
} from "./normalize-ingredient-name";
import { normalizeInvoiceIngredientName } from "./ingredient-canonical";

describe("normalizeInvoiceMatchIngredientName", () => {
  it.each(INVOICE_MATCH_NORMALIZATION_EXAMPLES)(
    "matches supermarket example: $input",
    ({ input, output }) => {
      expect(normalizeInvoiceMatchIngredientName(input)).toBe(output);
    },
  );

  it.each(NORMALIZE_INGREDIENT_NAME_EXAMPLES)(
    "matches documented example: $input",
    ({ input, output }) => {
      expect(normalizeInvoiceMatchIngredientName(input)).toBe(output);
    },
  );

  it("strips accents and collapses whitespace", () => {
    expect(normalizeInvoiceMatchIngredientName("  açúcar   mascavado  ")).toBe("acucar mascavado");
  });

  it("removes quantity+unit and standalone pack tokens", () => {
    expect(normalizeInvoiceMatchIngredientName("ARROZ CAROLINO 5 KG UN")).toBe("arroz carolino");
    expect(normalizeInvoiceMatchIngredientName("FARINHA 1 KG")).toBe("farinha");
  });

  it("keeps variety identity tokens", () => {
    expect(normalizeInvoiceMatchIngredientName("TOMATE CHERRY")).toBe("tomate cherry");
    expect(normalizeInvoiceMatchIngredientName("ALFACE ICEBERG")).toBe("alface iceberg");
  });

  it("removes commercial phrases case-insensitively", () => {
    expect(normalizeInvoiceMatchIngredientName("azeite rama food service 500ml")).toBe("azeite");
  });
});

describe("normalizeInvoiceIngredientName", () => {
  it("delegates to invoice match normalization", () => {
    expect(normalizeInvoiceIngredientName("TOMATE CEREJA PREMIUM")).toBe("tomate cherry");
  });
});

describe("normalizeIngredientName (uppercase legacy)", () => {
  it("uppercases match normalization", () => {
    expect(normalizeIngredientName("KETCHUP GULOSO TOP DOWN 570G")).toBe("KETCHUP");
  });
});
