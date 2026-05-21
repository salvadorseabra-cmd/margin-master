import { describe, expect, it, vi } from "vitest";
import {
  attachAliasSearchKeywordsToPickerOptions,
  buildCanonicalIngredientPickerOptions,
  buildIngredientPickerOptionsForInvoice,
  dedupeIngredientPickerOptionsById,
  ingredientPickerCommandValue,
  type IngredientPickerOption,
} from "./ingredient-picker-options";
import type { IngredientCanonicalInput } from "./ingredient-canonical";

const ANGUS_CATALOG_NAME = "Angus Burger Patty 180g";
const SMASH_CATALOG_NAME = "Smash Burger Patty 90g";

function ingredient(
  id: string,
  name: string,
  extra?: Partial<IngredientCanonicalInput>,
): IngredientCanonicalInput {
  return { id, name, normalized_name: name.toLowerCase(), ...extra };
}

describe("buildCanonicalIngredientPickerOptions", () => {
  it("dedupes duplicate catalog hydration by ingredient id", () => {
    const catalog = [
      ingredient("angus-1", ANGUS_CATALOG_NAME, { ingredient_kind: "canonical" }),
      ingredient("angus-1", ANGUS_CATALOG_NAME, { ingredient_kind: "canonical" }),
      ingredient("angus-1", "Angus Burger Patty 180g DUPLICATE LABEL", {
        ingredient_kind: "canonical",
      }),
    ];
    const options = buildCanonicalIngredientPickerOptions(catalog);
    expect(options).toHaveLength(1);
    expect(options[0]?.id).toBe("angus-1");
    expect(options[0]?.name).toBe("Angus burger patty 180g");
  });

  it("keeps same display name with different ids as separate canonical rows", () => {
    const catalog = [
      ingredient("angus-1", ANGUS_CATALOG_NAME, { ingredient_kind: "canonical" }),
      ingredient("angus-2", ANGUS_CATALOG_NAME, { ingredient_kind: "canonical" }),
    ];
    const options = buildCanonicalIngredientPickerOptions(catalog);
    expect(options.map((row) => row.id).sort()).toEqual(["angus-1", "angus-2"]);
    expect(new Set(options.map((row) => row.name)).size).toBe(1);
    expect(ingredientPickerCommandValue(options[0]!)).not.toBe(
      ingredientPickerCommandValue(options[1]!),
    );
  });

  it("excludes archived merged duplicates", () => {
    const catalog = [
      ingredient("angus-1", ANGUS_CATALOG_NAME, { ingredient_kind: "canonical" }),
      ingredient("angus-2", ANGUS_CATALOG_NAME, { ingredient_kind: "canonical" }),
    ];
    const archived = { ...catalog[1]!, is_archived: true, merged_into_ingredient_id: "angus-1" };
    const options = buildCanonicalIngredientPickerOptions([catalog[0]!, archived]);
    expect(options.map((row) => row.id)).toEqual(["angus-1"]);
  });

  it("excludes invoice shorthand pollution from picker rows", () => {
    const catalog = [
      ingredient("angus-canonical", ANGUS_CATALOG_NAME, { ingredient_kind: "canonical" }),
      ingredient("angus-leak", "ANGUS PTY", { ingredient_kind: "canonical" }),
    ];
    const options = buildCanonicalIngredientPickerOptions(catalog);
    expect(options.map((row) => row.id)).toEqual(["angus-canonical"]);
  });

  it("excludes CHK BREADED legacy canonical pollution from picker rows", () => {
    const catalog = [
      ingredient("chk-canonical", "Chicken Breaded / Frango Panado", {
        ingredient_kind: "canonical",
      }),
      ingredient("chk-leak", "CHK BREADED", { ingredient_kind: "canonical" }),
    ];
    const options = buildCanonicalIngredientPickerOptions(catalog);
    expect(options.map((row) => row.id)).toEqual(["chk-canonical"]);
  });

  it("excludes synthetics, invoice rows, and temporary ids", () => {
    const catalog = [
      ingredient("synthetic:angus", ANGUS_CATALOG_NAME),
      ingredient("invoice:line-1", ANGUS_CATALOG_NAME),
      ingredient("temp:draft", ANGUS_CATALOG_NAME),
      ingredient("angus-1", ANGUS_CATALOG_NAME, { ingredient_kind: "canonical" }),
    ];
    const options = buildCanonicalIngredientPickerOptions(catalog);
    expect(options.map((row) => row.id)).toEqual(["angus-1"]);
  });
});

describe("attachAliasSearchKeywordsToPickerOptions", () => {
  it("does not add alias strings as separate dropdown rows", () => {
    const options = buildCanonicalIngredientPickerOptions([
      ingredient("angus-1", ANGUS_CATALOG_NAME, { ingredient_kind: "canonical" }),
    ]);
    const withAliases = attachAliasSearchKeywordsToPickerOptions(options, {
      "metro::angus burger": "angus-1",
      "angus burger": "angus-1",
    });
    expect(withAliases).toHaveLength(1);
    expect(withAliases[0]?.searchKeywords).toEqual(
      expect.arrayContaining([ANGUS_CATALOG_NAME, "angus burger"]),
    );
  });

  it("leaves unrelated alias keys off other ingredients", () => {
    const options = buildCanonicalIngredientPickerOptions([
      ingredient("angus-1", ANGUS_CATALOG_NAME, { ingredient_kind: "canonical" }),
      ingredient("smash-1", SMASH_CATALOG_NAME, { ingredient_kind: "canonical" }),
    ]);
    const withAliases = attachAliasSearchKeywordsToPickerOptions(options, {
      "angus burger": "angus-1",
    });
    const smash = withAliases.find((row) => row.id === "smash-1");
    expect(smash?.searchKeywords).not.toContain("angus burger");
  });
});

describe("ingredientPickerCommandValue", () => {
  it("uses ingredient id for cmdk selection integrity", () => {
    const sameName: IngredientPickerOption[] = buildCanonicalIngredientPickerOptions([
      ingredient("a-1", ANGUS_CATALOG_NAME),
      ingredient("a-2", ANGUS_CATALOG_NAME),
    ]);
    const values = sameName.map(ingredientPickerCommandValue);
    expect(new Set(values).size).toBe(2);
    expect(values).toEqual(["a-1", "a-2"]);
  });
});

describe("dedupeIngredientPickerOptionsById", () => {
  it("collapses duplicate picker rows by ingredient id before render", () => {
    const duplicateRows: IngredientPickerOption[] = [
      {
        id: "angus-1",
        name: ANGUS_CATALOG_NAME,
        normalizedName: "angus burger patty 180g",
        source: "catalog",
        searchKeywords: [ANGUS_CATALOG_NAME],
      },
      {
        id: "angus-1",
        name: ANGUS_CATALOG_NAME,
        normalizedName: "angus burger patty 180g",
        source: "catalog",
        searchKeywords: ["angus burger"],
      },
      {
        id: "angus-1",
        name: "Angus Burger Patty 180g DUPLICATE LABEL",
        normalizedName: "angus burger patty 180g",
        source: "catalog",
        searchKeywords: ["angus pty"],
      },
    ];
    const deduped = dedupeIngredientPickerOptionsById(duplicateRows);
    expect(deduped).toHaveLength(1);
    expect(deduped[0]?.searchKeywords).toEqual(
      expect.arrayContaining([ANGUS_CATALOG_NAME, "angus burger", "angus pty"]),
    );
  });
});

describe("buildIngredientPickerOptionsForInvoice", () => {
  it("logs duplicate hydration during build", () => {
    const debugSpy = vi.spyOn(console, "debug").mockImplementation(() => {});
    buildIngredientPickerOptionsForInvoice([
      ingredient("angus-1", ANGUS_CATALOG_NAME),
      ingredient("angus-1", ANGUS_CATALOG_NAME),
    ]);
    expect(debugSpy).toHaveBeenCalledWith(
      expect.stringContaining("[ingredient_picker] duplicate candidate skipped"),
      expect.objectContaining({ ingredientId: "angus-1", source: "catalog" }),
    );
    debugSpy.mockRestore();
  });
});
