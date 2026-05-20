import { describe, expect, it } from "vitest";
import {
  findCanonicalIngredientMatch,
  type IngredientCanonicalInput,
} from "./ingredient-canonical";
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
    expect(normalizeSupplierShorthand("BAT SHOE 2.5")).toBe("batata shoestring 2.5");
    expect(normalizeSupplierShorthand("BAT WDG 2.5")).toBe("batata wedges 2.5");
    expect(normalizeSupplierShorthand("BAT PAL FIN")).toBe("batata palha fino");
  });

  it("keeps BAT 9x9 grid-cut token intact", () => {
    expect(normalizeSupplierShorthand("BAT 9x9")).toBe("batata 9x9");
  });

  it("expands BAC STRK, CHK BREADED, BAT PALHA FIN, and DN", () => {
    expect(normalizeSupplierShorthand("BAC STRK")).toBe("bacon streaky");
    expect(normalizeSupplierShorthand("CHK BREADED")).toBe("chicken breaded");
    expect(normalizeSupplierShorthand("BAT PALHA FIN")).toBe("batata palha fino");
    expect(normalizeSupplierShorthand("KETCH DN")).toBe("ketchup top down");
  });

  it("does not transform unrelated tokens", () => {
    expect(normalizeSupplierShorthand("MOLHO BBQ CONTINENTE")).toBe("MOLHO bbq CONTINENTE");
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
    expect(operationalAliasCount()).toBe(50);
  });
});

describe("final horeca hardening", () => {
  it("expands new meat, sauce, and packaging shorthand tokens", () => {
    expect(normalizeSupplierShorthand("ANG PTY 180")).toBe("angus patty 180");
    expect(normalizeSupplierShorthand("ON RNG")).toBe("onion rings");
    expect(normalizeSupplierShorthand("PKL SLC")).toBe("pickles fatiados");
    expect(normalizeSupplierShorthand("CHED TOP")).toBe("cheddar top");
    expect(normalizeSupplierShorthand("BAC FUM FAT")).toBe("bacon fumado fatiado");
    expect(normalizeSupplierShorthand("BRD CHK")).toBe("breaded chicken");
  });

  it("ANG PTY 180 exact to Hambúrguer Bovino 180g not brioche", () => {
    const catalog = [
      ingredient("bread", "Pao Brioche Artesanal 180g"),
      ingredient("beef-180", "Hamburguer Bovino 180g"),
    ];
    const match = findInvoiceItemIngredientMatch("ANG PTY 180", catalog);
    expect(match?.ingredient.id).toBe("beef-180");
    expect(match?.kind).toBe("exact");
  });

  it("SMASH PTY 90 prefers smash patty over kraft box and brioche", () => {
    const catalog = [
      ingredient("pack", "CAIXA HAMBURGUER KRAFT PEQ 250UN"),
      ingredient("bread", "Pao Brioche Artesanal 90g"),
      ingredient("meat", "Smash Burger Patty 90g"),
    ];
    const match = findInvoiceItemIngredientMatch("SMASH PTY 90", catalog);
    expect(match?.ingredient.id).toBe("meat");
    expect(match?.kind).toBe("exact");
  });

  it("BAC FUM FAT matches Bacon Fatiado catalog", () => {
    const catalog = [
      ingredient("streaky", "Bacon Streaky 1KG"),
      ingredient("sliced", "Bacon Fatiado"),
    ];
    const match = findInvoiceItemIngredientMatch("BAC FUM FAT", catalog);
    expect(match?.ingredient.id).toBe("sliced");
  });

  it("CHED TOP matches Molho Cheddar Dispensador not sliced cheddar", () => {
    const catalog = [
      ingredient("sliced", "Cheddar Fatiado 1KG"),
      ingredient("sauce", "Molho Cheddar Dispensador"),
    ];
    const match = findInvoiceItemIngredientMatch("CHED TOP", catalog);
    expect(match?.ingredient.id).toBe("sauce");
  });

  it("PKL SLC and PICKL SLC match Pickles Fatiados", () => {
    const catalog = [ingredient("pickles", "Pickles Fatiados")];
    expect(findInvoiceItemIngredientMatch("PKL SLC", catalog)?.ingredient.id).toBe("pickles");
    expect(findInvoiceItemIngredientMatch("PICKL SLC 1KG", catalog)?.ingredient.id).toBe("pickles");
  });

  it("ON RNG matches Onion Rings catalog line", () => {
    const catalog = [
      ingredient("raw-onion", "Cebola Crua 1KG"),
      ingredient("rings", "Onion Rings"),
    ];
    const match = findInvoiceItemIngredientMatch("ON RNG", catalog);
    expect(match?.ingredient.id).toBe("rings");
  });

  it("BAT SHOE matches shoestring not pão de batata", () => {
    const catalog = [
      ingredient("bread", "Pão de Batata 80g"),
      ingredient("shoestr", "Batata Shoestring 2.5kg"),
    ];
    const match = findInvoiceItemIngredientMatch("BAT SHOE 2.5", catalog);
    expect(match?.ingredient.id).toBe("shoestr");
    expect(match?.ingredient.id).not.toBe("bread");
  });
});

describe("operational memory match order", () => {
  it("matches PICKL SLC 1KG to persisted catalog wording without semantic", () => {
    const catalog = [ingredient("pickles-memory", "PICKL SLC 1KG")];
    const first = findInvoiceItemIngredientMatch("PICKL SLC 1KG", catalog);
    const second = findInvoiceItemIngredientMatch("PICKL SLC 1KG", catalog);

    expect(first?.kind).toBe("operational-memory");
    expect(first?.semanticSimilarity).toBeUndefined();
    expect(first?.ingredient.id).toBe("pickles-memory");
    expect(second?.ingredient.id).toBe("pickles-memory");
  });

  it("operational memory wins before semantic when wording was persisted", () => {
    const catalog = [
      ingredient("semantic-decoy", "Pickles Relish Sweet 1KG"),
      ingredient("memory", "PICKL SLC 1KG"),
    ];
    const match = findInvoiceItemIngredientMatch("PICKL SLC 1KG", catalog);
    expect(match?.ingredient.id).toBe("memory");
    expect(match?.kind).toBe("operational-memory");
    expect(match?.semanticSimilarity).toBeUndefined();
  });

  it("BAT 9x9 matches frozen potato not burger bread", () => {
    const catalog = [
      ingredient("bread", "Pao Brioche Burger 9 un"),
      ingredient("fries-9", "Batata Frita Congelada 9x9 2.5KG"),
    ];
    const match = findInvoiceItemIngredientMatch("BAT 9x9", catalog);
    expect(match?.ingredient.id).toBe("fries-9");
  });
});

describe("horeca weight and family matching", () => {
  it("HMB 180G prefers Hamburguer Bovino 180g over brioche 40g", () => {
    const catalog = [
      ingredient("brioche-40", "Mini Brioche 40g"),
      ingredient("beef-180", "Hamburguer Bovino 180g"),
    ];
    const match = findInvoiceItemIngredientMatch("HMB 180G", catalog);
    expect(match?.ingredient.id).toBe("beef-180");
  });

  it("BRCH BUN 80 prefers 80g bun over 40g brioche", () => {
    const catalog = [
      ingredient("brioche-40", "Mini Brioche 40g"),
      ingredient("bun-80", "Brioche Bun 80g"),
    ];
    const match = findInvoiceItemIngredientMatch("BRCH BUN 80", catalog);
    expect(match?.ingredient.id).toBe("bun-80");
  });

  it("matches BAC STRK and CHK BREADED catalog lines", () => {
    const baconCatalog = [ingredient("bac-strk", "Bacon Streaky 1KG")];
    expect(findInvoiceItemIngredientMatch("BAC STRK", baconCatalog)?.ingredient.id).toBe(
      "bac-strk",
    );

    const chickenCatalog = [ingredient("chk-brd", "Chicken Breast Breaded 2KG")];
    expect(findInvoiceItemIngredientMatch("CHK BREADED", chickenCatalog)?.ingredient.id).toBe(
      "chk-brd",
    );
  });

  it("matches BAT SHOESTR to batata shoestring catalog", () => {
    const catalog = [ingredient("shoestr", "Batata Shoestring Premium 2KG")];
    const match = findInvoiceItemIngredientMatch("BAT SHOESTR", catalog);
    expect(match?.ingredient.id).toBe("shoestr");
  });

  it("matches BAT SHOE and BAT WDG to shoestring/wedges not pao de batata", () => {
    const catalog = [
      ingredient("bread", "Pão de Batata 80g"),
      ingredient("shoestr", "Batata Shoestring 2.5kg"),
      ingredient("wedges", "Batata Wedges 2.5kg"),
    ];
    expect(findInvoiceItemIngredientMatch("BAT SHOE 2.5", catalog)?.ingredient.id).toBe("shoestr");
    expect(findInvoiceItemIngredientMatch("BAT WDG 2.5", catalog)?.ingredient.id).toBe("wedges");
    expect(findInvoiceItemIngredientMatch("BAT SHOE 2.5", catalog)?.ingredient.id).not.toBe(
      "bread",
    );
  });

  it("matches BAT 9X9 and BAT PAL FIN to fried potato catalog", () => {
    const gridCatalog = [
      ingredient("bread", "Pão de Batata 80g"),
      ingredient("fries-9", "Batata Frita Congelada 9x9 2.5KG"),
    ];
    expect(findInvoiceItemIngredientMatch("BAT 9X9", gridCatalog)?.ingredient.id).toBe("fries-9");

    const palCatalog = [
      ingredient("bread", "Pão de Batata 80g"),
      ingredient("pal", "Batata Palha 2KG"),
    ];
    expect(findInvoiceItemIngredientMatch("BAT PAL FIN", palCatalog)?.ingredient.id).toBe("pal");
  });

  it("does not match HMB 180G to bread-family catalog", () => {
    const catalog = [ingredient("bread", "Pao Brioche Artesanal 180g")];
    expect(findInvoiceItemIngredientMatch("HMB 180G", catalog)).toBeNull();
  });
});
