import { describe, expect, it } from "vitest";
import { CATALOG_REVIEW_RECIPE_LINKS_SELECT } from "@/lib/catalog-pollution-review";
import {
  CATALOG_REVIEW_RECIPE_NAMES_INLINE_MAX,
  dedupeRecipeNamesFromLinks,
  loadRecipeNamesForIngredient,
  sortRecipeNames,
} from "@/lib/catalog-review-recipe-names";

describe("catalog-review-recipe-names", () => {
  it("dedupeRecipeNamesFromLinks dedupes, trims, and sorts names", () => {
    expect(
      dedupeRecipeNamesFromLinks([
        { ingredient_id: "a", recipes: { name: " Molho Especial " } },
        { ingredient_id: "a", recipes: { name: "Smash Burger" } },
        { ingredient_id: "a", recipes: { name: "Smash Burger" } },
        { ingredient_id: "a", recipes: { name: null } },
      ]),
    ).toEqual(["Molho Especial", "Smash Burger"]);
  });

  it("sortRecipeNames is case-insensitive base sort", () => {
    expect(sortRecipeNames(["zebra", "Apple", "banana"])).toEqual(["Apple", "banana", "zebra"]);
  });

  it("loadRecipeNamesForIngredient joins recipe_ingredients to recipes", async () => {
  let capturedTable = "";
  let capturedSelect = "";
  let capturedEq: { column: string; value: string } | null = null;

    const client = {
      from: (table: string) => {
        capturedTable = table;
        return {
          select: (columns: string) => {
            capturedSelect = columns;
            return {
              eq: async (column: string, value: string) => {
                capturedEq = { column, value };
                return {
                  data: [
                    { ingredient_id: "ing-1", recipes: { name: "Burger Bacon" } },
                    { ingredient_id: "ing-1", recipes: { name: "Smash Burger" } },
                  ],
                  error: null,
                };
              },
            };
          },
        };
      },
    };

    const { names, error } = await loadRecipeNamesForIngredient(client as never, "ing-1");

    expect(capturedTable).toBe("recipe_ingredients");
    expect(capturedSelect).toBe(CATALOG_REVIEW_RECIPE_LINKS_SELECT);
    expect(capturedEq).toEqual({ column: "ingredient_id", value: "ing-1" });
    expect(error).toBeNull();
    expect(names).toEqual(["Burger Bacon", "Smash Burger"]);
  });

  it("loadRecipeNamesForIngredient returns empty names for blank id", async () => {
    const client = { from: () => ({ select: () => ({ eq: async () => ({ data: [], error: null }) }) }) };
    const { names, error } = await loadRecipeNamesForIngredient(client as never, "  ");
    expect(names).toEqual([]);
    expect(error).toBeNull();
  });

  it("CATALOG_REVIEW_RECIPE_NAMES_INLINE_MAX is 3", () => {
    expect(CATALOG_REVIEW_RECIPE_NAMES_INLINE_MAX).toBe(3);
  });
});
