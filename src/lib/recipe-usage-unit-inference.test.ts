import { describe, expect, it } from "vitest";
import {
  detectObviousCountableUsage,
  inferRecipeUsageUnit,
  recipeUsageUnitFromPurchaseHint,
} from "@/lib/recipe-usage-unit-inference";

describe("inferRecipeUsageUnit", () => {
  it("defaults liquids/sauces with ml in name to ml", () => {
    expect(inferRecipeUsageUnit("MAIONESE HELLMANN'S 450ML")).toBe("ml");
    expect(inferRecipeUsageUnit("Maionese 450ML")).toBe("ml");
    expect(inferRecipeUsageUnit("Óleo 5L")).toBe("ml");
  });

  it("defaults bulk weight in name to g", () => {
    expect(inferRecipeUsageUnit("Ketchup 1KG")).toBe("g");
    expect(inferRecipeUsageUnit("Queijo cheddar fatiado 1kg")).toBe("g");
    expect(inferRecipeUsageUnit("Farinha 500G")).toBe("g");
  });

  it("defaults discrete cans and burgers to un", () => {
    expect(inferRecipeUsageUnit("Coca-Cola lata 33cl")).toBe("un");
    expect(inferRecipeUsageUnit("Hambúrguer Angus 90g")).toBe("un");
    expect(inferRecipeUsageUnit("Hamburger bun 100g")).toBe("un");
  });

  it("does not blind-copy purchase un when name has volume", () => {
    expect(inferRecipeUsageUnit("MAIONESE HELLMANN'S 450ML", "un")).toBe("ml");
    expect(inferRecipeUsageUnit("Ketchup 1KG", "un")).toBe("g");
  });

  it("uses purchase measure units only as a weak fallback", () => {
    expect(inferRecipeUsageUnit("Sal grosso", "kg")).toBe("g");
    expect(inferRecipeUsageUnit("Água mineral", "ml")).toBe("ml");
    expect(inferRecipeUsageUnit("Item genérico", "un")).toBe("g");
    expect(inferRecipeUsageUnit("Item genérico", "cx")).toBe("g");
  });
});

describe("detectObviousCountableUsage", () => {
  it("detects lata and burgers", () => {
    expect(detectObviousCountableUsage("Coca-Cola lata 33cl")).toBe(true);
    expect(detectObviousCountableUsage("Hambúrguer Angus 90g")).toBe(true);
    expect(detectObviousCountableUsage("MAIONESE 450ML")).toBe(false);
  });
});

describe("recipeUsageUnitFromPurchaseHint", () => {
  it("ignores count/pack purchase units", () => {
    expect(recipeUsageUnitFromPurchaseHint("un")).toBeNull();
    expect(recipeUsageUnitFromPurchaseHint("cx")).toBeNull();
    expect(recipeUsageUnitFromPurchaseHint("pack")).toBeNull();
  });
});
