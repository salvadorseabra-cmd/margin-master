import { describe, expect, it } from "vitest";
import {
  areUnitsCompatible,
  computeNormalizedUnitCost,
  computePrepLineCost,
  convertRecipeQuantityBetweenUnits,
  inferUnitFamily,
  normalizeToBaseUnit,
  repairRecipeQuantityDoubleNormalization,
} from "./recipe-unit-normalization";

describe("inferUnitFamily", () => {
  it("treats kg/g invoice rows as weight", () => {
    expect(inferUnitFamily("kg")).toBe("weight");
    expect(inferUnitFamily("g")).toBe("weight");
  });

  it("treats un/cx rows as countable even when product name embeds grams", () => {
    expect(inferUnitFamily("un", { usableQuantityUnit: "g" })).toBe("countable");
    expect(inferUnitFamily("cx", { usableQuantityUnit: "g" })).toBe("countable");
  });
});

describe("normalizeToBaseUnit", () => {
  it("converts liters to milliliters", () => {
    expect(normalizeToBaseUnit(3, "L")).toEqual({ quantity: 3000, baseUnit: "ml" });
  });

  it("converts kilograms to grams", () => {
    expect(normalizeToBaseUnit(2, "kg")).toEqual({ quantity: 2000, baseUnit: "g" });
  });

  it("keeps count units as un", () => {
    expect(normalizeToBaseUnit(4, "un")).toEqual({ quantity: 4, baseUnit: "un" });
  });

  it("converts centiliters to milliliters (33 cl → 330 ml)", () => {
    expect(normalizeToBaseUnit(33, "cl")).toEqual({ quantity: 330, baseUnit: "ml" });
  });

  it("keeps 15 g as 15 g base (not 0.015)", () => {
    expect(normalizeToBaseUnit(15, "g")).toEqual({ quantity: 15, baseUnit: "g" });
  });
});

describe("repairRecipeQuantityDoubleNormalization", () => {
  it("repairs 0.015 g mis-tagged kg-scale value to 15 g", () => {
    expect(repairRecipeQuantityDoubleNormalization(0.015, "g")).toBe(15);
  });

  it("repairs 0.015 ml to 15 ml", () => {
    expect(repairRecipeQuantityDoubleNormalization(0.015, "ml")).toBe(15);
  });

  it("leaves 15 g unchanged", () => {
    expect(repairRecipeQuantityDoubleNormalization(15, "g")).toBe(15);
  });

  it("leaves intentional 0.015 kg unchanged", () => {
    expect(repairRecipeQuantityDoubleNormalization(0.015, "kg")).toBe(0.015);
  });
});

describe("convertRecipeQuantityBetweenUnits", () => {
  it("converts 15 g to 0.015 kg", () => {
    expect(convertRecipeQuantityBetweenUnits(15, "g", "kg")).toBeCloseTo(0.015);
  });

  it("converts 0.015 kg to 15 g", () => {
    expect(convertRecipeQuantityBetweenUnits(0.015, "kg", "g")).toBeCloseTo(15);
  });
});

describe("areUnitsCompatible", () => {
  it("treats ml and L as compatible", () => {
    expect(areUnitsCompatible("ml", "L")).toBe(true);
  });

  it("rejects volume vs weight", () => {
    expect(areUnitsCompatible("kg", "ml")).toBe(false);
  });
});

describe("computeNormalizedUnitCost", () => {
  it("returns cost per base unit for volume output", () => {
    expect(computeNormalizedUnitCost(21.49, 3, "L")).toBeCloseTo(21.49 / 3000);
  });
});

describe("computePrepLineCost", () => {
  it("charges 25 ml from a 3 L batch at €21.49", () => {
    const { cost, warning } = computePrepLineCost(25, "ml", 21.49, 3, "L");
    expect(warning).toBeUndefined();
    expect(cost).toBeCloseTo(0.179, 2);
  });

  it("charges 50 g from a 2 kg batch", () => {
    const { cost } = computePrepLineCost(50, "g", 10, 2, "kg");
    expect(cost).toBeCloseTo(0.25);
  });

  it("returns null and a warning for incompatible units", () => {
    const { cost, warning } = computePrepLineCost(25, "ml", 21.49, 2, "kg");
    expect(cost).toBeNull();
    expect(warning).toMatch(/Incompatible units/i);
  });

  it("infers missing prep output unit from parent usage (3000 ml batch, 15 ml usage)", () => {
    const { cost, warning } = computePrepLineCost(15, "ml", 20.42, 3000, null);
    expect(warning).toBeUndefined();
    expect(cost).toBeCloseTo(0.1021, 3);
  });

  it("does not multiply 3000ml batch yield again when output unit is L (mis-tagged ml)", () => {
    const { cost, warning } = computePrepLineCost(15, "ml", 20.42, 3000, "L");
    expect(warning).toBeUndefined();
    expect(cost).toBeCloseTo(0.1021, 3);
  });

  it("Molho Casa: 3 L batch saved without output unit (3 + ml usage) ≈ €0.102 for 15 ml", () => {
    const { cost, warning, outputNormalizedMl } = computePrepLineCost(15, "ml", 20.42, 3, null);
    expect(warning).toBeUndefined();
    expect(outputNormalizedMl).toBe(3000);
    expect(cost).toBeCloseTo(0.1021, 3);
  });
});
