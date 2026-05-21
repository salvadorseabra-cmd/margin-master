import { describe, expect, it } from "vitest";
import type { IngredientCanonicalInput } from "./ingredient-canonical";
import { buildCanonicalIngredientRenamePayload } from "./canonical-ingredient-rename";
import {
  buildCanonicalIngredientPickerOptions,
} from "./ingredient-picker-options";
import {
  auditRecipeLinesAgainstCanonicalCatalog,
  canonicalCatalogIdSet,
  detectPickerAliasLeaks,
  recipeLineFoodCostEur,
  resolveRecipeLineUnitCostEur,
} from "./recipe-canonical-integrity";

const ANGUS_CATALOG_NAME = "Angus Burger Patty 180g";

function ingredient(
  id: string,
  name: string,
  extra?: Partial<IngredientCanonicalInput>,
): IngredientCanonicalInput {
  return { id, name, normalized_name: name.toLowerCase(), ...extra };
}

describe("recipe picker canonical catalog", () => {
  it("excludes shorthand rows from picker built from canonical catalog", () => {
    const catalog = [
      ingredient("angus-canonical", ANGUS_CATALOG_NAME, { ingredient_kind: "canonical" }),
      ingredient("angus-leak", "ANGUS PTY", { ingredient_kind: "canonical" }),
    ];
    const options = buildCanonicalIngredientPickerOptions(catalog);
    expect(options.map((row) => row.id)).toEqual(["angus-canonical"]);
    expect(detectPickerAliasLeaks(options, catalog)).toHaveLength(0);
  });

  it("flags shorthand that bypasses picker filter as alias leak", () => {
    const catalog = [
      ingredient("angus-canonical", ANGUS_CATALOG_NAME, { ingredient_kind: "canonical" }),
      ingredient("angus-leak", "ANGUS PTY", { ingredient_kind: "canonical" }),
    ];
    const leaks = detectPickerAliasLeaks(
      [{ id: "angus-leak", name: "ANGUS PTY" }],
      catalog,
    );
    expect(leaks).toHaveLength(1);
    expect(leaks[0]?.reason).toBe("shorthand_name");
  });
});

describe("canonical rename recipe FK safety", () => {
  const catalog = [
    ingredient("ing-a", "Palha snack food service 2kg"),
    ingredient("ing-b", "Oleo girassol 10L"),
  ];

  it("does not change recipe_ingredient ingredient_id — only name fields on ingredients row", () => {
    const result = buildCanonicalIngredientRenamePayload(
      "ing-a",
      "PALHA PARA SNACKS 2 KG",
      catalog,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.update.ingredientId).toBe("ing-a");
    expect(Object.keys(result.update).sort()).toEqual(["ingredientId", "name", "normalized_name"]);
  });
});

describe("recipe food cost canonical id path", () => {
  it("resolves unit cost only for ids in the canonical catalog set", () => {
    const catalog = [
      ingredient("canonical-1", "Tomato passata 1kg", {
        ingredient_kind: "canonical",
        current_price: 10,
        purchase_quantity: 2,
      }),
      ingredient("alias-leak", "TOM PASS", { ingredient_kind: "canonical" }),
    ];
    const canonicalIds = canonicalCatalogIdSet(
      catalog.filter((row) => row.id === "canonical-1"),
    );
    const priceById = new Map([
      ["canonical-1", { current_price: 10, purchase_quantity: 2 }],
      ["alias-leak", { current_price: 5, purchase_quantity: 1 }],
    ]);

    expect(resolveRecipeLineUnitCostEur("canonical-1", canonicalIds, priceById)).toBe(5);
    expect(resolveRecipeLineUnitCostEur("alias-leak", canonicalIds, priceById)).toBeNull();
    expect(recipeLineFoodCostEur("canonical-1", 3, canonicalIds, priceById)).toBe(15);
    expect(recipeLineFoodCostEur("alias-leak", 3, canonicalIds, priceById)).toBeNull();
  });
});

describe("auditRecipeLinesAgainstCanonicalCatalog", () => {
  it("marks non-canonical recipe line references", () => {
    const catalog = [ingredient("canonical-1", ANGUS_CATALOG_NAME, { ingredient_kind: "canonical" })];
    const audits = auditRecipeLinesAgainstCanonicalCatalog(
      [
        {
          recipeId: "recipe-1",
          lineId: "line-1",
          ingredientId: "canonical-1",
        },
        {
          recipeId: "recipe-1",
          lineId: "line-2",
          ingredientId: "invoice:draft",
        },
      ],
      catalog,
    );
    expect(audits[0]?.inCanonicalCatalog).toBe(true);
    expect(audits[1]?.inCanonicalCatalog).toBe(false);
    expect(audits[1]?.reason).toBe("synthetic_or_temp_id");
  });
});
