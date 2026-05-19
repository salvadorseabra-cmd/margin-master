import { describe, expect, it } from "vitest";
import {
  findCanonicalIngredientMatch,
  normalizeInvoiceIngredientName,
  SEMANTIC_MATCH_MIN_SCORE,
  type IngredientCanonicalInput,
} from "./ingredient-canonical";

function ingredient(id: string, name: string): IngredientCanonicalInput {
  return { id, name };
}

describe("findCanonicalIngredientMatch (weighted semantic)", () => {
  it("suggests semantic match for sunflower oil despite different brand tokens", () => {
    const catalog = [ingredient("oil-1", "ÓLEO GIRASSOL FULA 1L")];
    const match = findCanonicalIngredientMatch("Óleo Girassol Vaqueiro 1L", catalog);

    expect(match).not.toBeNull();
    expect(match?.kind).toBe("semantic");
    expect(match?.ingredient.id).toBe("oil-1");
    expect(normalizeInvoiceIngredientName("Óleo Girassol Vaqueiro 1L")).toContain("oleo");
    expect(normalizeInvoiceIngredientName("Óleo Girassol Vaqueiro 1L")).toContain("girassol");
  });

  it("exact-matches cherry tomato when normalization aligns wording", () => {
    const catalog = [ingredient("tom-1", "TOMATE CHERRY 250G")];
    const match = findCanonicalIngredientMatch("Tomate Cherry Rama 250g", catalog);

    expect(match).not.toBeNull();
    expect(match?.kind).toBe("exact");
    expect(match?.ingredient.id).toBe("tom-1");
  });

  it("does not suggest unrelated single-core ingredients", () => {
    const catalog = [
      ingredient("ketchup-1", "KETCHUP HEINZ 570G"),
      ingredient("mayo-1", "MAIONESE CALVE 450ML"),
    ];

    expect(
      findCanonicalIngredientMatch("KETCHUP GULOSO TOP DOWN 570G", catalog)?.ingredient.id,
    ).toBe("ketchup-1");
    expect(
      findCanonicalIngredientMatch("MAIONESE CALVE TOP DOWN 450ML", catalog)?.ingredient.id,
    ).toBe("mayo-1");
    expect(findCanonicalIngredientMatch("KETCHUP GULOSO TOP DOWN 570G", [catalog[1]])).toBeNull();
  });

  it("does not suggest match between different neutral-only products", () => {
    const catalog = [
      ingredient("arroz-1", "ARROZ CAROLINO 5 KG"),
      ingredient("arroz-2", "ARROZ BASMATI 5 KG"),
    ];

    expect(findCanonicalIngredientMatch("ARROZ CAROLINO 5 KG UN", catalog)?.kind).toBe("exact");
    expect(findCanonicalIngredientMatch("ARROZ BASMATI 5 KG", catalog)?.kind).toBe("exact");
    expect(findCanonicalIngredientMatch("ARROZ CAROLINO 5 KG UN", [catalog[1]])).toBeNull();
  });

  it("does not suggest match between different core identities", () => {
    const catalog = [
      ingredient("tom-1", "TOMATE CHERRY 250G"),
      ingredient("alf-1", "ALFACE ICEBERG"),
    ];

    expect(findCanonicalIngredientMatch("TOMATE CHERRY 250G", [catalog[1]])).toBeNull();
    expect(findCanonicalIngredientMatch("ALFACE ICEBERG INTEIRA", [catalog[0]])).toBeNull();
  });

  it("uses conservative semantic threshold for possible matches", () => {
    expect(SEMANTIC_MATCH_MIN_SCORE).toBe(0.72);
  });
});
