import { describe, expect, it } from "vitest";
import { findCanonicalIngredientMatch, type IngredientCanonicalInput } from "./ingredient-canonical";
import { findInvoiceItemIngredientMatch } from "./invoice-ingredient-match-propagation";
import {
  normalizeSupplierShorthand,
  operationalAliasCount,
  OPERATIONAL_ALIASES,
} from "./ingredient-operational-aliases";

function ingredient(id: string, name: string): IngredientCanonicalInput {
  return { id, name };
}

describe("normalizeSupplierShorthand", () => {
  it("expands PICKL SLC 1KG while preserving pack size", () => {
    const expanded = normalizeSupplierShorthand("PICKL SLC 1KG");
    expect(expanded).toBe("pickles fatiados 1KG");
    expect(expanded.toLowerCase().split(/\s+/)).toEqual(
      expect.arrayContaining(["pickles", "fatiados"]),
    );
  });

  it("expands HMB 180 and CHED SLCD shorthand", () => {
    expect(normalizeSupplierShorthand("HMB 180")).toBe("hamburguer 180");
    expect(normalizeSupplierShorthand("CHED SLCD")).toBe("cheddar fatiados");
  });

  it("expands BRCH BUN and BAT SHOESTR", () => {
    expect(normalizeSupplierShorthand("BRCH BUN")).toBe("brioche bun");
    expect(normalizeSupplierShorthand("BAT SHOESTR")).toBe("batata shoestring");
  });

  it("does not transform unrelated tokens", () => {
    expect(normalizeSupplierShorthand("MOLHO BBQ CONTINENTE")).toBe("MOLHO BBQ CONTINENTE");
    expect(normalizeSupplierShorthand("ARROZ CAROLINO 5 KG")).toBe("ARROZ CAROLINO 5 KG");
    expect(OPERATIONAL_ALIASES.molho).toBeUndefined();
  });
});

describe("supplier shorthand → canonical match", () => {
  it("matches PICKL SLC 1KG to Pickles Fatiados catalog", () => {
    const catalog = [ingredient("pickles", "Pickles Fatiados")];
    const viaPropagation = findInvoiceItemIngredientMatch("PICKL SLC 1KG", catalog);
    const direct = findCanonicalIngredientMatch(
      normalizeSupplierShorthand("PICKL SLC 1KG"),
      catalog,
    );

    expect(viaPropagation).not.toBeNull();
    expect(viaPropagation?.ingredient.id).toBe("pickles");
    expect(direct?.ingredient.id).toBe("pickles");
  });

  it("matches PICKLES FATIADOS catalog spelling", () => {
    const catalog = [ingredient("pickles-pt", "PICKLES FATIADOS")];
    const match = findInvoiceItemIngredientMatch("PICKL SLC 1KG", catalog);
    expect(match).not.toBeNull();
    expect(match?.ingredient.id).toBe("pickles-pt");
  });

  it("matches CHED SLCD to sliced cheddar catalog", () => {
    const catalog = [ingredient("ched-sliced", "CHEDDAR FATIADO 1KG")];
    const match = findInvoiceItemIngredientMatch("CHED SLCD 1KG", catalog);
    expect(match).not.toBeNull();
    expect(match?.ingredient.id).toBe("ched-sliced");
  });
});

describe("operational alias registry", () => {
  it("keeps a conservative alias count", () => {
    expect(operationalAliasCount()).toBe(Object.keys(OPERATIONAL_ALIASES).length);
    expect(operationalAliasCount()).toBe(19);
  });
});
