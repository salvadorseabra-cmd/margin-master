import { describe, expect, it } from "vitest";
import {
  buildCatalogIngredientIdentity,
  cleanCanonicalIngredientNameForCatalog,
  formatCanonicalIngredientDisplayName,
  suggestCanonicalIngredientIdentityName,
} from "./canonical-ingredient-display-name";
import { normalizeIngredientName } from "./normalizeIngredient";

describe("cleanCanonicalIngredientNameForCatalog", () => {
  it("keeps batata and palha together for catalog identity", () => {
    expect(cleanCanonicalIngredientNameForCatalog("Batata palha")).toBe("Batata palha");
    expect(cleanCanonicalIngredientNameForCatalog("BATATA PALHA AUCHAN 2KG")).toBe("BATATA PALHA");
    const identity = buildCatalogIngredientIdentity("Batata palha");
    expect(identity.normalized_name).toBe("batata palha");
    expect(identity.name).toBe("Batata palha");
  });

  it("strips liter, kilogram, and unit-count pack sizes", () => {
    expect(cleanCanonicalIngredientNameForCatalog("Óleo girassol 10l")).toBe("Óleo girassol");
    expect(cleanCanonicalIngredientNameForCatalog("Palha snack food service 2kg")).toBe("Palha");
    expect(cleanCanonicalIngredientNameForCatalog("Guardanapo branco 33x33 200un")).toBe(
      "Guardanapo branco 33x33",
    );
    expect(cleanCanonicalIngredientNameForCatalog("Molho cheddar dispensador 3kg")).toBe(
      "Molho cheddar",
    );
  });

  it("keeps operationally distinct gram weights on proteins and buns", () => {
    expect(cleanCanonicalIngredientNameForCatalog("Hambúrguer bovino 90g")).toBe(
      "Hambúrguer bovino 90g",
    );
    expect(cleanCanonicalIngredientNameForCatalog("Hambúrguer bovino 180g")).toBe(
      "Hambúrguer bovino 180g",
    );
    expect(cleanCanonicalIngredientNameForCatalog("Brioche burger bun 80g")).toBe(
      "Brioche burger bun 80g",
    );
    expect(
      cleanCanonicalIngredientNameForCatalog("Hambúrguer bovino 90g") !==
        cleanCanonicalIngredientNameForCatalog("Hambúrguer bovino 180g"),
    ).toBe(true);
  });

  it("keeps dimension patterns and acronyms through display formatting", () => {
    expect(formatCanonicalIngredientDisplayName("FILME PVC")).toBe("Filme PVC");
    expect(formatCanonicalIngredientDisplayName("GUARDANAPO BRANCO 33X33 200UN")).toBe(
      "Guardanapo branco 33x33",
    );
  });

  it("strips pack counts, case phrases, and packaging-only parentheses", () => {
    expect(cleanCanonicalIngredientNameForCatalog("Água das pedras (pack 24)")).toBe(
      "Água das pedras",
    );
    expect(cleanCanonicalIngredientNameForCatalog("Heineken cerveja pack 24")).toBe(
      "Heineken cerveja",
    );
    expect(cleanCanonicalIngredientNameForCatalog("Luvas nitrilo pretas m c/100")).toBe(
      "Luvas nitrilo pretas M",
    );
    expect(cleanCanonicalIngredientNameForCatalog("Guardanapo branco cx 12")).toBe(
      "Guardanapo branco",
    );
    expect(cleanCanonicalIngredientNameForCatalog("Molho ketchup c/50")).toBe("Molho ketchup");
  });

  it("keeps beverage serving formats while removing bulk liters", () => {
    expect(cleanCanonicalIngredientNameForCatalog("Água das pedras (pack 24) 25cl")).toBe(
      "Água das pedras 25cl",
    );
    expect(cleanCanonicalIngredientNameForCatalog("Heineken cerveja (pack 24) 33cl")).toBe(
      "Heineken cerveja 33cl",
    );
    expect(cleanCanonicalIngredientNameForCatalog("Sumo laranja 1.5L")).toBe("Sumo laranja 1.5L");
    expect(formatCanonicalIngredientDisplayName("COCA COLA 33CL PACK24")).toBe("Coca cola 33cl");
  });

  it("leaves invoice alias normalization untouched", () => {
    const invoiceAlias = "GUARDANAPO 33X33 2F BRANCO 200UN";
    expect(formatCanonicalIngredientDisplayName(invoiceAlias)).toBe("Guardanapo 33x33 branco");
    expect(normalizeIngredientName(invoiceAlias)).toBe("guardanapo 33x33 2f branco 200un");
    expect(cleanCanonicalIngredientNameForCatalog(invoiceAlias)).toBe("GUARDANAPO 33x33 BRANCO");
  });
});

describe("suggestCanonicalIngredientIdentityName", () => {
  it("matches cleaned identity before title case", () => {
    expect(suggestCanonicalIngredientIdentityName("OLEO GIRASSOL 10L")).toBe("OLEO GIRASSOL");
    expect(formatCanonicalIngredientDisplayName("OLEO GIRASSOL 10L")).toBe("Oleo girassol");
  });

  it("suggests operational identity for rename/create dialogs", () => {
    expect(suggestCanonicalIngredientIdentityName("Heineken cerveja (pack 24) 33cl")).toBe(
      "Heineken cerveja 33cl",
    );
    expect(suggestCanonicalIngredientIdentityName("Luvas nitrilo pretas m c/100")).toBe(
      "Luvas nitrilo pretas M",
    );
  });
});

describe("formatCanonicalIngredientDisplayName", () => {
  it("title-cases cleaned catalog names", () => {
    expect(formatCanonicalIngredientDisplayName("OLEO GIRASSOL 10L")).toBe("Oleo girassol");
    expect(formatCanonicalIngredientDisplayName("BATATA FRITA CONTINENTE 2KG")).toBe(
      "Batata frita",
    );
  });

  it("preserves operational gram weights after cleanup", () => {
    expect(formatCanonicalIngredientDisplayName("HAMBURGUER BOVINO 180G")).toBe(
      "Hamburguer bovino 180g",
    );
    expect(formatCanonicalIngredientDisplayName("HAMBÚRGUER BOVINO 180G")).toBe(
      "Hambúrguer bovino 180g",
    );
  });

  it("title-cases beverage serving sizes and glove sizes after cleanup", () => {
    expect(formatCanonicalIngredientDisplayName("HEINEKEN CERVEJA (PACK 24) 33CL")).toBe(
      "Heineken cerveja 33cl",
    );
    expect(formatCanonicalIngredientDisplayName("LUVAS NITRILO PRETAS M C/100")).toBe(
      "Luvas nitrilo pretas M",
    );
  });

  it("preserves accents when present in input", () => {
    expect(formatCanonicalIngredientDisplayName("ÓLEO GIRASSOL 10L")).toBe("Óleo girassol");
    expect(formatCanonicalIngredientDisplayName("JALAPEÑO FATIADO")).toBe("Jalapeño fatiado");
  });

  it("keeps separators inside tokens", () => {
    expect(formatCanonicalIngredientDisplayName("BATATA 9X9")).toBe("Batata 9x9");
    expect(formatCanonicalIngredientDisplayName("PRODUTO A/B TEST")).toBe("Produto a/b test");
  });

  it("handles empty input", () => {
    expect(formatCanonicalIngredientDisplayName("")).toBe("");
    expect(formatCanonicalIngredientDisplayName(null)).toBe("");
  });
});
