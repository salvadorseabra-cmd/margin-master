import { describe, expect, it } from "vitest";
import {
  filterActiveCatalogIngredients,
  type IngredientCanonicalInput,
} from "./ingredient-canonical";
import { loadActiveIngredientCatalog } from "./ingredient-catalog-load";

function ingredient(
  id: string,
  name: string,
  extra?: Partial<IngredientCanonicalInput>,
): IngredientCanonicalInput {
  return { id, name, normalized_name: name.toLowerCase(), ...extra };
}

describe("filterActiveCatalogIngredients", () => {
  it("keeps one active ANGUS PTY when archived merged duplicates exist", () => {
    const catalog = [
      ingredient("canonical", "ANGUS PTY"),
      ingredient("dup-1", "ANGUS PTY", {
        is_archived: true,
        merged_into_ingredient_id: "canonical",
      }),
      ingredient("dup-2", "Angus Patty", {
        is_archived: true,
        merged_into_ingredient_id: "canonical",
      }),
    ];
    const active = filterActiveCatalogIngredients(catalog);
    expect(active.map((row) => row.id)).toEqual(["canonical"]);
  });

  it("treats merged_into without is_archived flag as archived", () => {
    const catalog = [
      ingredient("canonical", "ANGUS PTY"),
      ingredient("dup", "ANGUS PTY", { merged_into_ingredient_id: "canonical" }),
    ];
    expect(filterActiveCatalogIngredients(catalog).map((row) => row.id)).toEqual(["canonical"]);
  });
});

describe("loadActiveIngredientCatalog", () => {
  it("filters archived rows from the DB response", async () => {
    const rows = [
      ingredient("canonical", "ANGUS PTY", { is_archived: false }),
      ingredient("dup", "ANGUS PTY", {
        is_archived: true,
        merged_into_ingredient_id: "canonical",
      }),
    ];
    const client = {
      from: () => ({
        select: () => Promise.resolve({ data: rows, error: null }),
      }),
    } as never;

    const { rows: active, error } = await loadActiveIngredientCatalog(client);
    expect(error).toBeNull();
    expect(active.map((row) => row.id)).toEqual(["canonical"]);
  });

  it("falls back to base select when archive columns are missing", async () => {
    let call = 0;
    const rows = [ingredient("only", "BACON")];
    const client = {
      from: () => ({
        select: () => {
          call += 1;
          if (call === 1) {
            return Promise.resolve({
              data: null,
              error: { message: 'column "is_archived" does not exist' },
            });
          }
          return Promise.resolve({ data: rows, error: null });
        },
      }),
    } as never;

    const { rows: active, error } = await loadActiveIngredientCatalog(client);
    expect(error).toBeNull();
    expect(active).toHaveLength(1);
    expect(active[0]?.id).toBe("only");
  });
});
