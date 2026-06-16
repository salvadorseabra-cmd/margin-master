import { describe, expect, it } from "vitest";
import {
  extractBrandFingerprint,
  fuzzyLookupIngredientIdFromAliasMap,
  levenshteinDistance,
  productPrefixesCompatible,
} from "./ingredient-alias-fuzzy-lookup";
import { buildIngredientAliasLookupKey, lookupIngredientIdFromAliasMap } from "./ingredient-alias-lookup";
import { buildOverrideKeysFromInvoiceLine } from "./ingredient-match-override";

const ANCHOAS_ID = "c811f67f-df4d-4194-ba8b-7a15d4af38bd";
const PEPINO_ID = "pepino-fresh";
const PEPINO_CONSERVA_ID = "pepino-conserva";
const ATUM_ID = "atum-oleo";
const ARROZ_ID = "arroz-agulha";

function supplierKey(alias: string, supplier = "AVILUDO"): string {
  return buildIngredientAliasLookupKey(alias, supplier);
}

describe("brand fingerprint extraction", () => {
  it("isolates anchoas brand stems after product prefix strip", () => {
    expect(extractBrandFingerprint("filete de anchovas alconfrisa 495")).toBe("alconfrisa");
    expect(extractBrandFingerprint("filete de anchovas alconfirosa 495")).toBe("alconfirosa");
    expect(extractBrandFingerprint("filete de anchovas alconfrista 495")).toBe("alconfrista");
  });

  it("treats anchovas and anchoas prefixes as compatible families", () => {
    expect(
      productPrefixesCompatible("filete de anchovas", "filete de anchoas"),
    ).toBe(true);
  });
});

describe("levenshteinDistance", () => {
  it("scores close anchoas OCR variants within edit distance 2", () => {
    expect(levenshteinDistance("alconfrisa", "alconfrista")).toBeLessThanOrEqual(2);
    expect(levenshteinDistance("alconfrisa", "alconfirosa")).toBeLessThanOrEqual(2);
    expect(levenshteinDistance("alconfirsta", "alconfista")).toBeLessThanOrEqual(2);
  });
});

describe("fuzzyLookupIngredientIdFromAliasMap", () => {
  const anchoasAliases = {
    [supplierKey("filete de anchovas alconfrisa 495")]: ANCHOAS_ID,
    [supplierKey("filete de anchovas alconfrista 495")]: ANCHOAS_ID,
    [supplierKey("filete de anchovas alconfista 495")]: ANCHOAS_ID,
  };

  it("recovers alconfrista OCR drift from alconfrisa cluster", () => {
    const hit = fuzzyLookupIngredientIdFromAliasMap(
      anchoasAliases,
      "filete de anchovas alconfrista 495",
      "AVILUDO",
    );
    expect(hit?.ingredientId).toBe(ANCHOAS_ID);
    expect(hit?.distance).toBe(0);
  });

  it("recovers alconfirosa from alconfrisa cluster", () => {
    const hit = fuzzyLookupIngredientIdFromAliasMap(
      anchoasAliases,
      "filete de anchovas alconfirosa 495",
      "AVILUDO",
    );
    expect(hit?.ingredientId).toBe(ANCHOAS_ID);
    expect(hit?.distance).toBeLessThanOrEqual(2);
  });

  it("recovers alconfirsta from alconfrisa cluster", () => {
    const hit = fuzzyLookupIngredientIdFromAliasMap(
      anchoasAliases,
      "filete de anchovas alconfirsta 495",
      "AVILUDO",
    );
    expect(hit?.ingredientId).toBe(ANCHOAS_ID);
    expect(hit?.distance).toBeLessThanOrEqual(2);
  });

  it("does not recover across suppliers", () => {
    const aliases = {
      [supplierKey("filete de anchovas alconfrisa 495", "AVILUDO")]: ANCHOAS_ID,
    };
    expect(
      fuzzyLookupIngredientIdFromAliasMap(
        aliases,
        "filete de anchovas alconfirosa 495",
        "BIDFOOD",
      ),
    ).toBeNull();
  });

  it("recovers OCR typo supplier Avijudo against Aviludo alias cluster", () => {
    const aliases = {
      [supplierKey("filete de anchovas alconfrisa 495", "AVILUDO")]: ANCHOAS_ID,
    };
    const hit = fuzzyLookupIngredientIdFromAliasMap(
      aliases,
      "filete de anchovas alconfirosa 495",
      "AVIJUDO",
    );
    expect(hit?.ingredientId).toBe(ANCHOAS_ID);
  });

  it("does not recover pepino from pepino conserva aliases", () => {
    const aliases = {
      [supplierKey("pepino")]: PEPINO_ID,
      [supplierKey("pepinos extra vii")]: PEPINO_CONSERVA_ID,
    };
    expect(
      fuzzyLookupIngredientIdFromAliasMap(aliases, "pepino", "BIDFOOD"),
    ).toBeNull();
    expect(
      fuzzyLookupIngredientIdFromAliasMap(aliases, "pepinos extra uli", "BIDFOOD"),
    ).toBeNull();
  });

  it("does not recover atum from atum em oleo aliases", () => {
    const aliases = {
      [supplierKey("atum oleo belo")]: ATUM_ID,
    };
    expect(
      fuzzyLookupIngredientIdFromAliasMap(aliases, "atum", "NAU"),
    ).toBeNull();
  });

  it("does not recover arroz from arroz agulha aliases", () => {
    const aliases = {
      [supplierKey("arroz agulha metrochef 12x1kg")]: ARROZ_ID,
    };
    expect(
      fuzzyLookupIngredientIdFromAliasMap(aliases, "arroz", "METRO"),
    ).toBeNull();
  });

  it("rejects ambiguous cross-ingredient matches at the same distance", () => {
    const aliases = {
      [supplierKey("produto alpha brandx")]: "ing-a",
      [supplierKey("produto alpha brandy")]: "ing-b",
    };
    expect(
      fuzzyLookupIngredientIdFromAliasMap(aliases, "produto alpha brandz", "SUP"),
    ).toBeNull();
  });
});

describe("lookupIngredientIdFromAliasMap fuzzy integration", () => {
  const anchoasAliases = {
    [supplierKey("filete de anchovas alconfrisa 495")]: ANCHOAS_ID,
    [supplierKey("filete de anchovas alconfrista 495")]: ANCHOAS_ID,
    [supplierKey("filete de anchovas alconfista 495")]: ANCHOAS_ID,
    "filete de anchovas alconfrisa 495": ANCHOAS_ID,
  };

  it("fuzzy-falls back after exact miss on alconfirosa invoice line", () => {
    const line = "Filete de Anchoas Alconfirosa LI 495 g";
    const keys = buildOverrideKeysFromInvoiceLine(line, "AVILUDO")!;
    expect(
      lookupIngredientIdFromAliasMap(anchoasAliases, keys.rawNormalized, "AVILUDO", line),
    ).toBe(ANCHOAS_ID);
  });

  it("fuzzy-falls back after exact miss on alconfirsta invoice line", () => {
    const line = "Filete de Anchovas Alconfirsta L1 495 g";
    const keys = buildOverrideKeysFromInvoiceLine(line, "AVILUDO")!;
    expect(
      lookupIngredientIdFromAliasMap(anchoasAliases, keys.rawNormalized, "AVILUDO", line),
    ).toBe(ANCHOAS_ID);
  });

  it("does not fuzzy-match pepino to pepino conserva via integration path", () => {
    const aliases = {
      [supplierKey("pepino", "BIDFOOD")]: PEPINO_ID,
      [supplierKey("pepinos extra vii", "BIDFOOD")]: PEPINO_CONSERVA_ID,
    };
    expect(
      lookupIngredientIdFromAliasMap(aliases, "pepino", "BIDFOOD", "Pepino"),
    ).toBe(PEPINO_ID);
    expect(
      lookupIngredientIdFromAliasMap(aliases, "pepinos extra uli", "BIDFOOD", "Pepinos Extra ULI"),
    ).toBeUndefined();
  });
});
