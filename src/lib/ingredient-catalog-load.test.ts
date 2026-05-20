import { describe, expect, it } from "vitest";
import {
  filterActiveCatalogIngredients,
  type IngredientCanonicalInput,
} from "./ingredient-canonical";
import { loadActiveIngredientCatalog, loadCanonicalIngredientCatalog } from "./ingredient-catalog-load";
import { INGREDIENT_KIND_ALIAS } from "./ingredient-kind";

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

describe("loadCanonicalIngredientCatalog", () => {
  it("excludes alias-kind rows from human-facing catalog load", async () => {
    const rows = [
      ingredient("canonical", "BACON FATIADO FUMADO 1KG", { ingredient_kind: "canonical" }),
      ingredient("alias", "BAC FUM FAT", { ingredient_kind: INGREDIENT_KIND_ALIAS }),
    ];
    const client = {
      from: () => ({
        select: () => Promise.resolve({ data: rows, error: null }),
      }),
    } as never;

    const { rows: canonical, error } = await loadCanonicalIngredientCatalog(client);
    expect(error).toBeNull();
    expect(canonical.map((row) => row.id)).toEqual(["canonical"]);
  });

  it("filters shorthand leakage when ingredient_kind column is absent", async () => {
    const rows = [
      ingredient("canonical", "ONION RINGS 1KG"),
      ingredient("leak", "ON RNG"),
    ];
    const client = {
      from: () => ({
        select: () => Promise.resolve({ data: rows, error: null }),
      }),
    } as never;

    const { rows: canonical } = await loadCanonicalIngredientCatalog(client);
    expect(canonical.map((row) => row.id)).toEqual(["canonical"]);
  });
});
