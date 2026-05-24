import { describe, expect, it } from "vitest";
import {
  computeFoodCostPct,
  computeGrossMarginPct,
  getRecipeHealth,
  hasRecipeSellingPrice,
  parseRecipeSellingPriceInput,
  recipeSellingPriceForSave,
  recipeSellingPriceToFormValue,
  validateRecipeSellingPrice,
} from "./recipe-selling-price";

describe("recipeSellingPriceForSave", () => {
  it("persists null for prep with empty selling price", () => {
    expect(recipeSellingPriceForSave("", "prep")).toBeNull();
    expect(recipeSellingPriceForSave("   ", "prep")).toBeNull();
    expect(recipeSellingPriceForSave("0", "prep")).toBeNull();
  });

  it("persists optional price for prep addon", () => {
    expect(recipeSellingPriceForSave("4.5", "prep")).toBe(4.5);
  });

  it("coerces empty dish price to zero for legacy save path", () => {
    expect(recipeSellingPriceForSave("", "dish")).toBe(0);
    expect(recipeSellingPriceForSave("12", "dish")).toBe(12);
  });
});

describe("validateRecipeSellingPrice", () => {
  it("allows empty selling price for prep", () => {
    expect(validateRecipeSellingPrice("", "prep")).toBeNull();
  });

  it("requires positive selling price for dishes", () => {
    expect(validateRecipeSellingPrice("", "dish")).toBe("Selling price is required for dishes.");
    expect(validateRecipeSellingPrice("0", "dish")).toBe(
      "Selling price must be greater than zero for dishes.",
    );
    expect(validateRecipeSellingPrice("18", "dish")).toBeNull();
  });
});

describe("recipeSellingPriceToFormValue", () => {
  it("shows empty form field for prep without price", () => {
    expect(recipeSellingPriceToFormValue(null, "prep")).toBe("");
    expect(recipeSellingPriceToFormValue(0, "prep")).toBe("");
  });

  it("shows stored price for prep addon and dishes", () => {
    expect(recipeSellingPriceToFormValue(6, "prep")).toBe("6");
    expect(recipeSellingPriceToFormValue(18, "dish")).toBe("18");
  });
});

describe("parseRecipeSellingPriceInput", () => {
  it("returns null for prep without price and number for addon prep", () => {
    expect(parseRecipeSellingPriceInput("", "prep")).toBeNull();
    expect(parseRecipeSellingPriceInput("3.5", "prep")).toBe(3.5);
  });
});

describe("margin calculations with null selling price", () => {
  it("returns null margin and food cost percent when price missing", () => {
    expect(computeGrossMarginPct(null, 5)).toBeNull();
    expect(computeGrossMarginPct(0, 5)).toBeNull();
    expect(computeFoodCostPct(null, 5)).toBeNull();
  });

  it("computes margin when selling price is set", () => {
    expect(computeGrossMarginPct(10, 3)).toBe(70);
    expect(computeFoodCostPct(10, 3)).toBe(30);
  });
});

describe("getRecipeHealth", () => {
  it("uses neutral operational messaging for prep without selling price", () => {
    const health = getRecipeHealth(null, 12, null, 40, 2, "prep");
    expect(health.label).toBe("No selling price");
    expect(health.tone).toBe("warning");
    expect(health.helper).toContain("Operational prep");
  });

  it("keeps destructive health for dishes without selling price", () => {
    const health = getRecipeHealth(null, 12, null, 40, 2, "dish");
    expect(health.tone).toBe("destructive");
  });
});

describe("hasRecipeSellingPrice", () => {
  it("treats null, zero, and negative as missing", () => {
    expect(hasRecipeSellingPrice(null)).toBe(false);
    expect(hasRecipeSellingPrice(0)).toBe(false);
    expect(hasRecipeSellingPrice(-1)).toBe(false);
    expect(hasRecipeSellingPrice(10)).toBe(true);
  });
});
