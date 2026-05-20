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
      ingredient("angus-1", "ANGUS PTY", { ingredient_kind: "canonical" }),
      ingredient("angus-1", "ANGUS PTY", { ingredient_kind: "canonical" }),
      ingredient("angus-1", "ANGUS PTY DUPLICATE LABEL", { ingredient_kind: "canonical" }),
    ];
    const options = buildCanonicalIngredientPickerOptions(catalog);
    expect(options).toHaveLength(1);
    expect(options[0]?.id).toBe("angus-1");
    expect(options[0]?.name).toBe("ANGUS PTY");
  });

  it("keeps same display name with different ids as separate canonical rows", () => {
    const catalog = [
      ingredient("angus-1", "ANGUS PTY", { ingredient_kind: "canonical" }),
      ingredient("angus-2", "ANGUS PTY", { ingredient_kind: "canonical" }),
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
      ingredient("angus-1", "ANGUS PTY", { ingredient_kind: "canonical" }),
      ingredient("angus-2", "ANGUS PTY", { ingredient_kind: "canonical" }),
    ];
    const archived = { ...catalog[1]!, is_archived: true, merged_into_ingredient_id: "angus-1" };
    const options = buildCanonicalIngredientPickerOptions([catalog[0]!, archived]);
    expect(options.map((row) => row.id)).toEqual(["angus-1"]);
  });

  it("excludes synthetics, invoice rows, and temporary ids", () => {
    const catalog = [
      ingredient("synthetic:angus", "ANGUS PTY"),
      ingredient("invoice:line-1", "ANGUS PTY"),
      ingredient("temp:draft", "ANGUS PTY"),
      ingredient("angus-1", "ANGUS PTY", { ingredient_kind: "canonical" }),
    ];
    const options = buildCanonicalIngredientPickerOptions(catalog);
    expect(options.map((row) => row.id)).toEqual(["angus-1"]);
  });
});

describe("attachAliasSearchKeywordsToPickerOptions", () => {
  it("does not add alias strings as separate dropdown rows", () => {
    const options = buildCanonicalIngredientPickerOptions([
      ingredient("angus-1", "ANGUS PTY", { ingredient_kind: "canonical" }),
    ]);
    const withAliases = attachAliasSearchKeywordsToPickerOptions(options, {
      "metro::angus burger": "angus-1",
      "angus burger": "angus-1",
    });
    expect(withAliases).toHaveLength(1);
    expect(withAliases[0]?.searchKeywords).toEqual(
      expect.arrayContaining(["ANGUS PTY", "angus burger"]),
    );
  });

  it("leaves unrelated alias keys off other ingredients", () => {
    const options = buildCanonicalIngredientPickerOptions([
      ingredient("angus-1", "ANGUS PTY", { ingredient_kind: "canonical" }),
      ingredient("smash-1", "SMASH PTY 90", { ingredient_kind: "canonical" }),
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
      ingredient("a-1", "ANGUS PTY"),
      ingredient("a-2", "ANGUS PTY"),
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
        name: "ANGUS PTY",
        normalizedName: "angus pty",
        source: "catalog",
        searchKeywords: ["ANGUS PTY"],
      },
      {
        id: "angus-1",
        name: "ANGUS PTY",
        normalizedName: "angus pty",
        source: "catalog",
        searchKeywords: ["angus burger"],
      },
      {
        id: "angus-1",
        name: "ANGUS PTY DUPLICATE LABEL",
        normalizedName: "angus pty",
        source: "catalog",
        searchKeywords: ["angus pty"],
      },
    ];
    const deduped = dedupeIngredientPickerOptionsById(duplicateRows);
    expect(deduped).toHaveLength(1);
    expect(deduped[0]?.searchKeywords).toEqual(
      expect.arrayContaining(["ANGUS PTY", "angus burger", "angus pty"]),
    );
  });
});

describe("buildIngredientPickerOptionsForInvoice", () => {
  it("logs duplicate hydration during build", () => {
    const debugSpy = vi.spyOn(console, "debug").mockImplementation(() => {});
    buildIngredientPickerOptionsForInvoice([
      ingredient("angus-1", "ANGUS PTY"),
      ingredient("angus-1", "ANGUS PTY"),
    ]);
    expect(debugSpy).toHaveBeenCalledWith(
      expect.stringContaining("[ingredient_picker] duplicate candidate skipped"),
      expect.objectContaining({ ingredientId: "angus-1", source: "catalog" }),
    );
    debugSpy.mockRestore();
  });
});
