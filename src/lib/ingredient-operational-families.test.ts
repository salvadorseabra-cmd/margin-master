import { describe, expect, it } from "vitest";
import { findCanonicalIngredientMatch, type IngredientCanonicalInput } from "./ingredient-canonical";
import {
  OPERATIONAL_FAMILY_REGISTRY,
  areOperationalFamiliesCompatible,
  detectOperationalFamily,
} from "./ingredient-operational-families";

function ingredient(id: string, name: string): IngredientCanonicalInput {
  return { id, name };
}

describe("detectOperationalFamily", () => {
  it("maps fried potato and bread lines to distinct families", () => {
    expect(detectOperationalFamily("BATATA SHOESTRING PREMIUM 2KG")).toBe(
      "fried_potato_products",
    );
    expect(detectOperationalFamily("Pão de Batata 80g")).toBe("burger_bread");
    expect(detectOperationalFamily("BATATA PALHA 2KG")).toBe("fried_potato_products");
    expect(detectOperationalFamily("PAO BRIOCHE ARTESANAL 80G")).toBe("burger_bread");
  });

  it("maps cheese sauce vs sliced cheddar to distinct families", () => {
    expect(detectOperationalFamily("MOLHO CHEDDAR 1KG")).toBe("cheese_sauce");
    expect(detectOperationalFamily("CHEDDAR FATIADO 1KG")).toBe("sliced_cheese");
    expect(detectOperationalFamily("CHEDDAR 1KG")).toBeNull();
  });

  it("exposes five registry families", () => {
    expect(Object.keys(OPERATIONAL_FAMILY_REGISTRY).sort()).toEqual([
      "burger_bread",
      "cheese_sauce",
      "fried_potato_products",
      "ketchup",
      "sliced_cheese",
    ]);
  });
});

describe("areOperationalFamiliesCompatible", () => {
  it("blocks fried potato vs burger bread", () => {
    expect(
      areOperationalFamiliesCompatible("fried_potato_products", "burger_bread"),
    ).toBe(false);
  });

  it("allows same-family variants", () => {
    expect(
      areOperationalFamiliesCompatible("fried_potato_products", "fried_potato_products"),
    ).toBe(true);
    expect(areOperationalFamiliesCompatible("ketchup", "ketchup")).toBe(true);
  });
});

describe("operational family canonical matching (regression)", () => {
  it("does not match batata shoestring to pao de batata", () => {
    const catalog = [ingredient("bread", "Pão de Batata 80g")];
    expect(
      findCanonicalIngredientMatch("BATATA SHOESTRING PREMIUM 2KG", catalog),
    ).toBeNull();
  });

  it("still matches palha snack to batata palha", () => {
    const catalog = [ingredient("bat-palha", "BATATA PALHA 2KG")];
    const match = findCanonicalIngredientMatch("PALHA SNACK FOOD SERVICE 2KG", catalog);

    expect(match).not.toBeNull();
    expect(match?.ingredient.id).toBe("bat-palha");
  });

  it("blocks molho cheddar vs cheddar fatiado", () => {
    const catalog = [ingredient("ched-sliced", "CHEDDAR FATIADO 1KG")];
    expect(findCanonicalIngredientMatch("MOLHO CHEDDAR 1KG", catalog)).toBeNull();
  });

  it("matches brioche variants", () => {
    const catalog = [ingredient("brioche-1", "PAO BRIOCHE ARTESANAL 80G")];
    const match = findCanonicalIngredientMatch("PAO BRIOCHE GOURMET 80G", catalog);

    expect(match).not.toBeNull();
    expect(match?.ingredient.id).toBe("brioche-1");
  });

  it("matches ketchup variants", () => {
    const catalog = [ingredient("ketchup-1", "KETCHUP HEINZ 570G")];
    const match = findCanonicalIngredientMatch("KETCHUP GULOSO TOP DOWN 570G", catalog);

    expect(match).not.toBeNull();
    expect(match?.ingredient.id).toBe("ketchup-1");
  });
});
