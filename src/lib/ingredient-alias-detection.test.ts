import { describe, expect, it } from "vitest";
import type { IngredientCanonicalInput } from "./ingredient-canonical";
import { detectLikelyAliasCatalogRows } from "./ingredient-alias-detection";

function ingredient(
  id: string,
  name: string,
  extra?: Partial<IngredientCanonicalInput & { current_price?: number }>,
): IngredientCanonicalInput & { current_price?: number } {
  return {
    id,
    name,
    normalized_name: name.toLowerCase(),
    unit: "kg",
    current_price: 10,
    ...extra,
  };
}

describe("detectLikelyAliasCatalogRows", () => {
  it("detects shorthand rows with canonical neighbors and matching unit/price", () => {
    const catalog = [
      ingredient("canonical", "HAMBÚRGUER BOVINO 180G", { current_price: 12 }),
      ingredient("alias", "HMB 180", { ingredient_kind: "alias", current_price: 12 }),
    ];
    const detected = detectLikelyAliasCatalogRows(catalog);
    expect(detected).toHaveLength(1);
    expect(detected[0]?.aliasEntry.id).toBe("alias");
    expect(detected[0]?.canonicalEntry.id).toBe("canonical");
    expect(detected[0]?.reasons).toContain("invoice_shorthand_name");
  });

  it("skips recipe-linked shorthand rows", () => {
    const catalog = [
      ingredient("canonical", "ONION RINGS 1KG"),
      ingredient("alias", "ON RNG", { ingredient_kind: "alias" }),
    ];
    const detected = detectLikelyAliasCatalogRows(catalog, {
      recipeLinkedIngredientIds: new Set(["alias"]),
    });
    expect(detected).toHaveLength(0);
  });
});
