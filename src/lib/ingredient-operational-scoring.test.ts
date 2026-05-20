import { afterEach, describe, expect, it } from "vitest";
import { findInvoiceItemIngredientMatch } from "./invoice-ingredient-match-propagation";
import type { IngredientCanonicalInput } from "./ingredient-canonical";
import {
  computeOperationalFamilyConfidence,
  meetsOperationalWeightAutoExact,
  OPERATIONAL_WEIGHT_AUTO_THRESHOLD,
  scoreWeightedOperationalFamilyCompatibility,
  WEIGHTED_FAMILY_SCORE_DELTAS,
  weightedOperationalFamiliesShouldSkip,
} from "./ingredient-operational-scoring";
import {
  clearOperationalAliasMemoryForTests,
  lookupOperationalAlias,
  rememberOperationalAlias,
} from "./ingredient-operational-alias-memory";

function ingredient(id: string, name: string): IngredientCanonicalInput {
  return { id, name };
}

describe("computeOperationalFamilyConfidence", () => {
  it("scores SMASH PTY 90 as burger_meat above 0.9", () => {
    const conf = computeOperationalFamilyConfidence("SMASH PTY 90");
    expect(conf.family).toBe("burger_meat");
    expect(conf.score).toBeGreaterThan(0.9);
    expect(conf.tokenHits).toEqual(expect.arrayContaining(["smash", "patty"]));
  });

  it("scores ANG PTY 180 as burger_meat above threshold", () => {
    const conf = computeOperationalFamilyConfidence("ANG PTY 180");
    expect(conf.family).toBe("burger_meat");
    expect(conf.score).toBeGreaterThanOrEqual(OPERATIONAL_WEIGHT_AUTO_THRESHOLD);
    expect(conf.tokenHits).toEqual(expect.arrayContaining(["angus", "patty"]));
  });

  it("scores BAC FUM FAT as bacon family", () => {
    const conf = computeOperationalFamilyConfidence("BAC FUM FAT");
    expect(conf.family).toBe("bacon");
    expect(conf.score).toBeGreaterThanOrEqual(OPERATIONAL_WEIGHT_AUTO_THRESHOLD);
    expect(conf.tokenHits).toEqual(expect.arrayContaining(["bacon", "fumado", "fatiado"]));
  });

  it("scores BRCH BUN as bread", () => {
    const conf = computeOperationalFamilyConfidence("BRCH BUN 80");
    expect(conf.family).toBe("bread");
    expect(conf.score).toBeGreaterThan(0.65);
  });

  it("scores BAT SHOE as frozen_potato", () => {
    const conf = computeOperationalFamilyConfidence("BAT SHOE 2.5");
    expect(conf.family).toBe("frozen_potato");
    expect(conf.score).toBeGreaterThan(0.4);
  });

  it("scores CHED TOP as sauce above cheese threshold", () => {
    const conf = computeOperationalFamilyConfidence("CHED TOP");
    expect(conf.family).toBe("sauce");
    expect(conf.score).toBeGreaterThanOrEqual(OPERATIONAL_WEIGHT_AUTO_THRESHOLD);
  });

  it("boosts ANG PTY 180 burger_meat with portion weight", () => {
    const conf = computeOperationalFamilyConfidence("ANG PTY 180");
    expect(conf.family).toBe("burger_meat");
    expect(conf.score).toBeGreaterThan(0.9);
    expect(conf.tokenHits).toEqual(expect.arrayContaining(["180g"]));
  });
});

describe("weighted family penalties", () => {
  it("applies strong burger_meat vs bread penalty", () => {
    expect(
      scoreWeightedOperationalFamilyCompatibility("SMASH PTY 90", "Pao Brioche Artesanal 90g"),
    ).toBe(WEIGHTED_FAMILY_SCORE_DELTAS.burgerMeatBread);
    expect(weightedOperationalFamiliesShouldSkip("SMASH PTY 90", "Pao Brioche 90g")).toBe(true);
  });

  it("blocks BAT SHOE vs pao de batata via skip", () => {
    expect(computeOperationalFamilyConfidence("Pão de Batata 80g").family).toBe("bread");
    expect(weightedOperationalFamiliesShouldSkip("BAT SHOE 2.5", "Pão de Batata 80g")).toBe(true);
  });

  it("boosts same burger_meat family", () => {
    expect(
      scoreWeightedOperationalFamilyCompatibility("ANG PTY 180", "Hamburguer Bovino 180g"),
    ).toBe(WEIGHTED_FAMILY_SCORE_DELTAS.sameFamily);
  });
});

describe("operational weight auto exact", () => {
  it("promotes ANG PTY 180 + catalog 180g burger to auto exact", () => {
    expect(
      meetsOperationalWeightAutoExact("ANG PTY 180", "Hamburguer Bovino 180g", {
        weightCompatible: true,
        formsCompatible: true,
      }),
    ).toBe(true);
  });
});

describe("horeca hardening round 2 matches", () => {
  afterEach(() => {
    clearOperationalAliasMemoryForTests();
  });

  it("SMASH PTY 90 prefers meat over brioche bun without alias memory", () => {
    const catalog = [
      ingredient("bread", "Pao Brioche Artesanal 90g"),
      ingredient("meat", "Smash Burger Patty 90g"),
    ];
    const match = findInvoiceItemIngredientMatch("SMASH PTY 90", catalog);
    expect(match).not.toBeNull();
    expect(match?.ingredient.id).toBe("meat");
    expect(match?.kind).toBe("exact");
  });

  it("ANG PTY 180 auto exact to burger 180g catalog", () => {
    const catalog = [
      ingredient("bread", "Pao Brioche Artesanal 180g"),
      ingredient("beef-180", "Hamburguer Bovino 180g"),
    ];
    const match = findInvoiceItemIngredientMatch("ANG PTY 180", catalog);
    expect(match?.ingredient.id).toBe("beef-180");
    expect(match?.kind).toBe("exact");
  });

  it("BAT SHOE still blocked against pao de batata", () => {
    const catalog = [
      ingredient("bread", "Pão de Batata 80g"),
      ingredient("shoestr", "Batata Shoestring 2.5kg"),
    ];
    const match = findInvoiceItemIngredientMatch("BAT SHOE 2.5", catalog);
    expect(match?.ingredient.id).toBe("shoestr");
    expect(match?.ingredient.id).not.toBe("bread");
  });
});

describe("alias propagation keys", () => {
  afterEach(() => {
    clearOperationalAliasMemoryForTests();
  });

  it("registers related keys for BAC STRK", () => {
    rememberOperationalAlias("BAC STRK", "bac-strk", "Bacon Streaky 1KG");
    expect(lookupOperationalAlias("BAC STRK")?.ingredientId).toBe("bac-strk");
    expect(lookupOperationalAlias("BACON STRK")?.ingredientId).toBe("bac-strk");
    expect(lookupOperationalAlias("BAC STRIPS")?.ingredientId).toBe("bac-strk");
    expect(lookupOperationalAlias("BAC STRIPS")?.confidence).toBeLessThanOrEqual(0.92);
  });
});
