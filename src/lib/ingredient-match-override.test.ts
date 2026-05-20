import { beforeEach, describe, expect, it } from "vitest";
import {
  clearIngredientMatchOverridesForTests,
  buildOverrideKeysFromInvoiceLine,
  lookupIngredientMatchOverride,
  rememberIngredientMatchOverride,
} from "./ingredient-match-override";
import {
  clearOperationalAliasMemoryForTests,
  lookupOperationalAlias,
} from "./ingredient-operational-alias-memory";
import { applyManualIngredientCorrection } from "./ingredient-correction-memory";
import { findCanonicalIngredientMatch, type IngredientCanonicalInput } from "./ingredient-canonical";
import { findInvoiceItemIngredientMatch } from "./invoice-ingredient-match-propagation";

function ingredient(
  id: string,
  name: string,
): IngredientCanonicalInput {
  return { id, name, normalized_name: name.toLowerCase(), unit: "kg" };
}

describe("ingredient match override keys", () => {
  it("normalizes HMB 180 to operational hamburguer 180 key", () => {
    const keys = buildOverrideKeysFromInvoiceLine("HMB 180", "Metro Cash");
    expect(keys).not.toBeNull();
    expect(keys!.rawNormalized).toBe("hamburguer 180");
    expect(keys!.lookupKey).toMatch(/^metro cash::hamburguer 180$/i);
  });
});

describe("findCanonicalIngredientMatch override priority", () => {
  beforeEach(() => {
    clearIngredientMatchOverridesForTests();
    clearOperationalAliasMemoryForTests();
  });

  it("uses confirmed override before semantic catalog match", () => {
    rememberIngredientMatchOverride(
      "HMB 180",
      "beef-180",
      "Hambúrguer Bovino 180g",
    );
    const catalog = [
      ingredient("brioche-180", "Pao Brioche Artesanal 180g"),
      ingredient("beef-180", "Hambúrguer Bovino 180g"),
    ];
    const match = findCanonicalIngredientMatch(
      "hamburguer 180",
      catalog,
      {},
      null,
      { rawItemName: "HMB 180G" },
    );
    expect(match?.kind).toBe("confirmed-override");
    expect(match?.ingredient.id).toBe("beef-180");
  });
});

describe("manual correction persist + lookup", () => {
  beforeEach(() => {
    clearIngredientMatchOverridesForTests();
    clearOperationalAliasMemoryForTests();
  });

  it("applyManualIngredientCorrection seeds override and operational memory", () => {
    const result = applyManualIngredientCorrection(
      {
        itemName: "HMB 180",
        ingredientId: "beef-180",
        ingredientName: "Hambúrguer Bovino 180g",
      },
      {},
    );
    expect(result?.normalizedAlias).toBe("hamburguer 180");
    expect(lookupIngredientMatchOverride("HMB 180")?.canonicalIngredientId).toBe("beef-180");
    expect(lookupOperationalAlias("HMB 180")?.ingredientId).toBe("beef-180");

    const catalog = [ingredient("beef-180", "Hambúrguer Bovino 180g")];
    const reloadMatch = findInvoiceItemIngredientMatch("HMB 180G", catalog, result!.nextConfirmedAliases);
    expect(reloadMatch?.kind).toBe("confirmed-override");
    expect(reloadMatch?.ingredient.id).toBe("beef-180");
  });

});
