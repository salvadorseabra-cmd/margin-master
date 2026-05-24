import { describe, expect, it } from "vitest";
import {
  buildExplicitRecipeCountMap,
  emptyInvoiceOperationalMetadata,
  loadInvoiceOperationalMetadata,
  loadRecipeCountByIngredientId,
  mergeIngredientPriceFields,
} from "@/lib/invoice-operational-metadata";

describe("invoice-operational-metadata", () => {
  it("mergeIngredientPriceFields overlays optional price columns", () => {
    const merged = mergeIngredientPriceFields([{ id: "a", name: "Tomato" }], {
      a: { current_price: 3.5, updated_at: "2025-01-01T00:00:00.000Z" },
    });
    expect(merged[0]).toMatchObject({
      id: "a",
      name: "Tomato",
      current_price: 3.5,
      updated_at: "2025-01-01T00:00:00.000Z",
    });
  });

  it("loadRecipeCountByIngredientId counts recipe_ingredients rows per id", async () => {
    const client = {
      from: (table: string) => ({
        select: () => ({
          in: async () =>
            table === "recipe_ingredients"
              ? {
                  data: [
                    { ingredient_id: "a" },
                    { ingredient_id: "a" },
                    { ingredient_id: "b" },
                  ],
                  error: null,
                }
              : { data: [], error: null },
        }),
      }),
    };

    const { counts, error } = await loadRecipeCountByIngredientId(client as never, ["a", "b", "c"]);
    expect(error).toBeNull();
    expect(counts).toEqual({ a: 2, b: 1 });
    expect(buildExplicitRecipeCountMap(["a", "b", "c"], counts)).toEqual({ a: 2, b: 1, c: 0 });
  });

  it("loadInvoiceOperationalMetadata never throws when enrichment queries error", async () => {
    const queryError = { data: null, error: { message: "column does not exist" } };
    const client = {
      from: (table: string) => ({
        select: () => {
          if (table === "ingredient_aliases") {
            return { eq: async () => queryError };
          }
          if (table === "ingredient_price_history") {
            return {
              in: () => ({ order: async () => queryError }),
              gte: async () => queryError,
            };
          }
          return {
            in: () => ({ order: async () => queryError }),
          };
        },
      }),
    };

    await expect(loadInvoiceOperationalMetadata(client as never, ["ing-1"])).resolves.toEqual(
      emptyInvoiceOperationalMetadata(),
    );
  });
});
