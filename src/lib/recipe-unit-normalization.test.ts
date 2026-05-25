import { describe, expect, it } from "vitest";
import {
  areUnitsCompatible,
  computeNormalizedUnitCost,
  computePrepLineCost,
  normalizeToBaseUnit,
} from "./recipe-unit-normalization";

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
});
