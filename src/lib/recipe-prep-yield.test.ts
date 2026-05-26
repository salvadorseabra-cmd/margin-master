import { describe, expect, it } from "vitest";
import {
  buildPrepYieldIntelligence,
  deriveCostPerServing,
  derivePrepServings,
} from "./recipe-prep-yield";

describe("derivePrepServings", () => {
  it("returns 200 for 3000 ml batch and 15 ml serving", () => {
    expect(
      derivePrepServings({ quantity: 3000, unit: "ml" }, { quantity: 15, unit: "ml" }),
    ).toBe(200);
  });

  it("returns 200 for 3 L batch and 15 ml serving", () => {
    expect(derivePrepServings({ quantity: 3, unit: "L" }, { quantity: 15, unit: "ml" })).toBe(
      200,
    );
  });
});

describe("deriveCostPerServing", () => {
  it("returns ~0.102 for €20.42 batch and 200 servings", () => {
    expect(deriveCostPerServing(20.42, 200)).toBeCloseTo(0.1021, 4);
  });
});

describe("buildPrepYieldIntelligence", () => {
  it("formats batch yield, serving, servings, and cost per serving", () => {
    const intel = buildPrepYieldIntelligence({
      batchOutputQty: 3,
      batchOutputUnit: "L",
      servingQty: 15,
      servingUnit: "ml",
      batchCostEur: 20.42,
    });
    expect(intel.batchYieldLabel).toBe("3 L");
    expect(intel.servingSizeLabel).toBe("15 ml");
    expect(intel.servingsCount).toBe(200);
    expect(intel.estimatedServingsLabel).toBe("~200");
    expect(intel.costPerServingEur).toBeCloseTo(0.1021, 4);
    expect(intel.costPerServingLabel).toMatch(/~€0\.10/);
  });
});
