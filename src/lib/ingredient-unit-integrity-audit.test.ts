import { describe, expect, it } from "vitest";
import { resolvedOperationalUnitCostEur } from "@/lib/ingredient-unit-cost";
import {
  auditIngredientUnitIntegrity,
  repairCountableEmbeddedWeightDenominator,
  summarizeIngredientUnitIntegrity,
} from "./ingredient-unit-integrity-audit";

describe("auditIngredientUnitIntegrity", () => {
  it("flags brioche 80g with mass base and pq=80 as contamination", () => {
    const findings = auditIngredientUnitIntegrity([
      {
        id: "bun-1",
        name: "Pão brioche 80g",
        current_price: 16.8,
        purchase_quantity: 80,
        purchase_unit: "g",
        base_unit: "g",
      },
    ]);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.patterns).toContain("gram_denominator_matches_embedded_weight");
    expect(findings[0]?.patterns).toContain("mass_base_on_countable_name");
    expect(findings[0]?.inferredCostBaseUnit).toBe("un");
  });

  it("does not flag valid kg meat with pq=1000", () => {
    const findings = auditIngredientUnitIntegrity([
      {
        id: "beef",
        name: "Novilho acém",
        current_price: 11.9,
        purchase_quantity: 1000,
        purchase_unit: "g",
        base_unit: "g",
      },
    ]);
    expect(findings).toHaveLength(0);
  });

  it("does not flag clean countable bun row", () => {
    const findings = auditIngredientUnitIntegrity([
      {
        id: "bun-clean",
        name: "Pão brioche 80g",
        current_price: 0.21,
        purchase_quantity: 1,
        purchase_unit: "un",
        base_unit: "un",
      },
    ]);
    expect(findings).toHaveLength(0);
  });

  it("repairs single-unit bun price when purchase_quantity equals embedded 80g", () => {
    const repaired = repairCountableEmbeddedWeightDenominator(
      {
        current_price: 0.21,
        purchase_quantity: 80,
        cost_base_unit: "un",
      },
      { ingredientName: "Pão brioche 80g" },
    );
    expect(repaired.purchase_quantity).toBe(1);
    expect(repaired.usable_weight_grams).toBe(80);
    expect(resolvedOperationalUnitCostEur(repaired)).toBeCloseTo(0.21, 2);
  });

  it("summarizes pattern counts", () => {
    const findings = auditIngredientUnitIntegrity([
      {
        id: "a",
        name: "Pão brioche 80g",
        purchase_quantity: 80,
        base_unit: "g",
      },
      {
        id: "b",
        name: "Coca-Cola lata 33cl",
        purchase_quantity: 33,
        base_unit: "ml",
      },
    ]);
    const summary = summarizeIngredientUnitIntegrity(findings);
    expect(summary.gram_denominator_matches_embedded_weight).toBeGreaterThanOrEqual(1);
    expect(summary.mass_base_on_countable_name).toBeGreaterThanOrEqual(1);
  });
});
