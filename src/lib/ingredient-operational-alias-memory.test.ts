import { afterEach, describe, expect, it } from "vitest";
import type { IngredientCanonicalInput } from "./ingredient-canonical";
import { findInvoiceItemIngredientMatch } from "./invoice-ingredient-match-propagation";
import { normalizeSupplierShorthand } from "./ingredient-operational-aliases";
import {
  buildOperationalAliasLookupKeys,
  clearOperationalAliasMemoryForTests,
  hydrateOperationalAliasMemoryFromConfirmedMap,
  lookupOperationalAlias,
  normalizeBrandToken,
  normalizeOperationalAliasKey,
  rememberOperationalAlias,
} from "./ingredient-operational-alias-memory";

function ingredient(id: string, name: string): IngredientCanonicalInput {
  return { id, name };
}

afterEach(() => {
  clearOperationalAliasMemoryForTests();
});

describe("normalizeOperationalAliasKey", () => {
  it("applies shorthand then preserves standalone weights in the compact key", () => {
    expect(normalizeOperationalAliasKey("HMB 180")).toBe("hamburguer 180");
    expect(normalizeOperationalAliasKey("BAC STRK")).toBe("bacon streaky");
    expect(normalizeOperationalAliasKey(normalizeSupplierShorthand("HMB 180"))).toBe(
      "hamburguer 180",
    );
  });

  it("builds lookup keys from raw and expanded invoice names", () => {
    const keys = buildOperationalAliasLookupKeys(
      normalizeSupplierShorthand("CHK BREADED"),
      ["CHK BREADED"],
    );
    expect(keys).toContain("chicken breaded");
  });

  it("collapses OCR-split brand tokens (alconfi sta)", () => {
    expect(normalizeOperationalAliasKey("Filete de Anchovas Alconfi sta Lt 495 g")).toBe(
      "filete de anchovas alconfista 495",
    );
  });

  it("does not merge alconfrista with alconfi sta normalization", () => {
    const split = normalizeOperationalAliasKey("Filete de Anchovas Alconfi sta Lt 495 g");
    const intact = normalizeOperationalAliasKey("Filete de Anchovas Alconfrista Lt 495 g");
    expect(split).toBe("filete de anchovas alconfista 495");
    expect(intact).toBe("filete de anchovas alconfrista 495");
    expect(split).not.toBe(intact);
  });

  it("collapses metro chef brand spacing", () => {
    expect(normalizeOperationalAliasKey("Acucar Branco Metro Chef")).toBe(
      "acucar branco metrochef",
    );
    expect(normalizeOperationalAliasKey("acucar branco metrochef")).toBe("acucar branco metrochef");
  });

  it("collapses pack format spacing (12x1 kg)", () => {
    expect(normalizeOperationalAliasKey("Arroz Agulha Metro Chef 12x1 kg")).toBe(
      "arroz agulha metrochef 12x1kg",
    );
    expect(normalizeOperationalAliasKey("arroz agulha metro chef 12x1kg")).toBe(
      "arroz agulha metrochef 12x1kg",
    );
  });
});

describe("normalizeBrandToken", () => {
  it("joins adjacent OCR split fragments", () => {
    expect(normalizeBrandToken(["alconfi", "sta"])).toEqual(["alconfista"]);
    expect(normalizeBrandToken(["metro", "chef"])).toEqual(["metrochef"]);
  });

  it("joins pack format with unit token", () => {
    expect(normalizeBrandToken(["12x1", "kg"])).toEqual(["12x1kg"]);
  });

  it("does not join stop words or short prefixes", () => {
    expect(normalizeBrandToken(["filete", "de", "anchovas"])).toEqual([
      "filete",
      "de",
      "anchovas",
    ]);
    expect(normalizeBrandToken(["alconfrista"])).toEqual(["alconfrista"]);
  });
});

describe("operational alias memory", () => {
  it("remembers HMB 180 and recalls on second lookup", () => {
    rememberOperationalAlias("HMB 180", "beef-180", "Hambúrguer Bovino 180g");

    const catalog = [
      ingredient("brioche-40", "Mini Brioche 40g"),
      ingredient("beef-180", "Hambúrguer Bovino 180g"),
    ];
    const first = findInvoiceItemIngredientMatch("HMB 180G", catalog);
    const second = findInvoiceItemIngredientMatch("HMB 180G", catalog);

    expect(first?.kind).toBe("operational-alias");
    expect(first?.ingredient.id).toBe("beef-180");
    expect(second?.ingredient.id).toBe("beef-180");
    expect(lookupOperationalAlias("hmb 180")?.ingredientId).toBe("beef-180");
  });

  it("remembers BAC STRK for bacon catalog", () => {
    rememberOperationalAlias("BAC STRK", "bac-strk", "Bacon Streaky 1KG");
    const catalog = [ingredient("bac-strk", "Bacon Streaky Fumado 1KG")];
    const match = findInvoiceItemIngredientMatch("BAC STRK", catalog);
    expect(match?.kind).toBe("operational-alias");
    expect(match?.ingredient.id).toBe("bac-strk");
  });

  it("remembers CHK BREADED for chicken catalog", () => {
    rememberOperationalAlias("CHK BREADED", "chk-brd", "Chicken Breast Breaded 2KG");
    const catalog = [ingredient("chk-brd", "Chicken Breast Breaded 2KG")];
    const match = findInvoiceItemIngredientMatch("CHK BREADED", catalog);
    expect(match?.kind).toBe("operational-alias");
    expect(match?.ingredient.id).toBe("chk-brd");
  });

  it("recalls SMASH 90 after remembering smash patty line", () => {
    rememberOperationalAlias("SMASH PTY 90", "smash-90", "Smash Burger Patty 90g");
    const catalog = [
      ingredient("bread", "Pao Brioche Artesanal 90g"),
      ingredient("smash-90", "Smash Burger Patty 90g"),
    ];
    const match = findInvoiceItemIngredientMatch("SMASH PTY 90", catalog);
    expect(match?.kind).toBe("operational-alias");
    expect(match?.ingredient.id).toBe("smash-90");
  });

  it("does not apply remembered meat alias to bread catalog when families conflict", () => {
    rememberOperationalAlias("SMASH PTY 90", "smash-90", "Smash Burger Patty 90g");
    const breadOnly = [ingredient("bread", "Pao Brioche Artesanal 90g")];
    expect(findInvoiceItemIngredientMatch("SMASH PTY 90", breadOnly)).toBeNull();
  });

  it("does not recall BAT SHOE as pão de batata when shoestring was remembered", () => {
    rememberOperationalAlias("BAT SHOE 2.5", "shoestr", "Batata Shoestring 2.5kg");
    const catalog = [
      ingredient("bread", "Pão de Batata 80g"),
      ingredient("shoestr", "Batata Shoestring 2.5kg"),
    ];
    const match = findInvoiceItemIngredientMatch("BAT SHOE 2.5", catalog);
    expect(match?.ingredient.id).toBe("shoestr");
    expect(match?.ingredient.id).not.toBe("bread");
  });

  it("wins over semantic when alias memory is seeded before catalog decoys", () => {
    rememberOperationalAlias("HMB 180", "beef-180", "Hambúrguer Bovino 180g");
    const catalog = [
      ingredient("brioche-180", "Pao Brioche Artesanal 180g"),
      ingredient("beef-180", "Hambúrguer Bovino 180g"),
    ];
    const match = findInvoiceItemIngredientMatch("HMB 180G", catalog);
    expect(match?.kind).toBe("operational-alias");
    expect(match?.ingredient.id).toBe("beef-180");
  });
});

describe("confirmed alias bridge", () => {
  it("hydrates operational lookup from confirmed alias map keys", () => {
    const catalog = [ingredient("pickles", "Pickles Fatiados Premium")];
    const merged = hydrateOperationalAliasMemoryFromConfirmedMap(
      { "pickles fatiados": "pickles" },
      catalog,
    );
    expect(merged).toBe(1);
    expect(normalizeOperationalAliasKey("PICKL SLC 1KG")).toBe("pickles fatiados");
    expect(lookupOperationalAlias("PICKL SLC 1KG")?.source).toBe("confirmed");
    expect(lookupOperationalAlias("PICKL SLC 1KG")?.ingredientId).toBe("pickles");
  });
});
