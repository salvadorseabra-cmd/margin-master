import { describe, expect, it } from "vitest";
import {
  NORMALIZE_INGREDIENT_NAME_EXAMPLES,
  normalizeIngredientName,
} from "./normalize-ingredient-name";

describe("normalizeIngredientName", () => {
  it.each(NORMALIZE_INGREDIENT_NAME_EXAMPLES)(
    "matches documented example: $input",
    ({ input, output }) => {
      expect(normalizeIngredientName(input)).toBe(output);
    },
  );

  it("strips accents and collapses whitespace", () => {
    expect(normalizeIngredientName("  açúcar   mascavado  ")).toBe("ACUCAR MASCAVADO");
  });

  it("removes quantity+unit and standalone pack tokens", () => {
    expect(normalizeIngredientName("ARROZ CAROLINO 5 KG UN")).toBe("ARROZ CAROLINO");
    expect(normalizeIngredientName("FARINHA 1 KG")).toBe("FARINHA");
  });

  it("keeps variety identity tokens", () => {
    expect(normalizeIngredientName("TOMATE CHERRY")).toBe("TOMATE CHERRY");
    expect(normalizeIngredientName("ALFACE ICEBERG")).toBe("ALFACE ICEBERG");
  });

  it("removes commercial phrases case-insensitively", () => {
    expect(normalizeIngredientName("azeite rama food service 500ml")).toBe("AZEITE");
  });
});
