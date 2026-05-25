import { describe, expect, it } from "vitest";
import {
  buildRecipeLinePickerOptions,
  parseRecipeLinePickerValue,
  recipeLinePickerLabel,
  recipeLinePickerValue,
} from "./recipe-line-picker-options";

describe("recipe line picker", () => {
  it("merges ingredients and prep recipes with stable sort", () => {
    const options = buildRecipeLinePickerOptions({
      ingredients: [{ id: "i1", name: "Tomato", unit: "kg" }],
      prepRecipes: [{ id: "p1", name: "Molho Casa", output_unit: "ml" }],
    });
    expect(options.map((o) => o.pickerValue)).toEqual([
      recipeLinePickerValue("prep", "p1"),
      recipeLinePickerValue("ingredient", "i1"),
    ]);
  });

  it("excludes the recipe being edited from prep options", () => {
    const options = buildRecipeLinePickerOptions({
      ingredients: [],
      prepRecipes: [{ id: "p1", name: "Self", output_unit: "ml" }],
      excludeRecipeId: "p1",
    });
    expect(options).toHaveLength(0);
  });

  it("labels prep rows with [Prep]", () => {
    const options = buildRecipeLinePickerOptions({
      ingredients: [],
      prepRecipes: [{ id: "p1", name: "Molho Casa", output_unit: "ml" }],
    });
    expect(recipeLinePickerLabel(options[0]!)).toBe("Molho Casa [Prep]");
  });

  it("parses picker values", () => {
    expect(parseRecipeLinePickerValue("prep:p1")).toEqual({ kind: "prep", id: "p1" });
    expect(parseRecipeLinePickerValue("ingredient:i1")).toEqual({
      kind: "ingredient",
      id: "i1",
    });
    expect(parseRecipeLinePickerValue("")).toBeNull();
  });
});
