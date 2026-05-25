import { describe, expect, it } from "vitest";
import {
  computePrepServingsPerBatch,
  formatPrepServingHint,
} from "./recipe-prep-servings";

describe("computePrepServingsPerBatch", () => {
  it("returns 120 for a 3 L batch with 25 ml usage", () => {
    expect(
      computePrepServingsPerBatch({
        prepOutputQty: 3,
        prepOutputUnit: "L",
        usageQty: 25,
        usageUnit: "ml",
      }),
    ).toBe(120);
  });

  it("returns 62 for a 5 kg batch with 80 g usage", () => {
    expect(
      computePrepServingsPerBatch({
        prepOutputQty: 5,
        prepOutputUnit: "kg",
        usageQty: 80,
        usageUnit: "g",
      }),
    ).toBe(62);
  });

  it("returns 40 for 40 un batch with 1 un usage", () => {
    expect(
      computePrepServingsPerBatch({
        prepOutputQty: 40,
        prepOutputUnit: "un",
        usageQty: 1,
        usageUnit: "un",
      }),
    ).toBe(40);
  });

  it("returns null for incompatible unit groups", () => {
    expect(
      computePrepServingsPerBatch({
        prepOutputQty: 2,
        prepOutputUnit: "kg",
        usageQty: 25,
        usageUnit: "ml",
      }),
    ).toBeNull();
  });

  it("returns null when output or usage is missing or non-positive", () => {
    expect(
      computePrepServingsPerBatch({
        prepOutputQty: null,
        prepOutputUnit: "L",
        usageQty: 25,
        usageUnit: "ml",
      }),
    ).toBeNull();
    expect(
      computePrepServingsPerBatch({
        prepOutputQty: 3,
        prepOutputUnit: "L",
        usageQty: 0,
        usageUnit: "ml",
      }),
    ).toBeNull();
  });
});

describe("formatPrepServingHint", () => {
  it("formats serving size and batch yield", () => {
    expect(formatPrepServingHint(25, "ml", 120)).toBe(
      "25 ml serving · ≈120 servings per batch",
    );
  });
});
