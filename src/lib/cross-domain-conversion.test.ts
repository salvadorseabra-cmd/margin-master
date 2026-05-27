import { describe, expect, it, vi } from "vitest";
import { operationalCostFieldsFromInvoiceLine } from "@/lib/ingredient-auto-persist";
import { effectiveIngredientUnitCostEur } from "@/lib/ingredient-unit-cost";
import { recipeOperationalCostFieldsFromInvoiceLine } from "@/lib/invoice-purchase-price-semantics";
import { normalizeToBaseUnit } from "@/lib/recipe-unit-normalization";
import { ingredientLineCostEur } from "@/lib/recipe-prep-cost";
import {
  CROSS_DOMAIN_CONVERSION_PREFIX,
  logCrossDomainConversion,
  shouldLogCrossDomainConversion,
} from "@/lib/pricing-trace";
import {
  recipeLineCostViaDensityConversion,
  recipeLineCostViaPackagedLiquidConversion,
} from "@/lib/usable-unit-conversion";

describe("same-domain unit normalization unchanged", () => {
  it("g↔kg: 220 g recipe vs kg invoice costs without density", () => {
    const ing = {
      current_price: 11.9,
      purchase_quantity: 1000,
      cost_base_unit: "g" as const,
    };
    expect(normalizeToBaseUnit(220, "g")?.quantity).toBe(220);
    expect(normalizeToBaseUnit(1, "kg")?.quantity).toBe(1000);
    expect(ingredientLineCostEur(220, ing, { recipeUnit: "g" })).toBeCloseTo(2.618, 2);
    expect(recipeLineCostViaDensityConversion(220, "g", ing).converted).toBe(false);
  });

  it("ml↔L: 15 ml recipe vs L batch prep units stay in volume family", () => {
    expect(normalizeToBaseUnit(15, "ml")?.baseUnit).toBe("ml");
    expect(normalizeToBaseUnit(3, "L")?.quantity).toBe(3000);
  });

  it("packaged liquid 450 ml jar: ml recipe without density uses usable path", () => {
    const ing = {
      current_price: 4.59,
      purchase_quantity: 450,
      cost_base_unit: "un" as const,
      usable_volume_ml: 450,
    };
    expect(ingredientLineCostEur(30, ing, { recipeUnit: "ml" })).toBeCloseTo(0.306, 2);
    expect(recipeLineCostViaDensityConversion(30, "ml", ing).converted).toBe(false);
  });
});

describe("resolver precedence: packaged liquid before density", () => {
  it("Maionese Hellmann's 15 ml → €10.20/L via invoice ml pack", () => {
    const fields = recipeOperationalCostFieldsFromInvoiceLine({
      name: "MAIONESE HELLMANN'S 450ML",
      quantity: 1,
      unit: "un",
      unit_price: 4.59,
    })!;
    expect(effectiveIngredientUnitCostEur(fields) * 1000).toBeCloseTo(10.2, 1);
    expect(ingredientLineCostEur(15, fields, { recipeUnit: "ml" })).toBeCloseTo(0.153, 3);
    expect(recipeLineCostViaDensityConversion(15, "ml", fields).converted).toBe(false);
  });

  it("Mostarda amarela 600 ml pack → €4.86/L", () => {
    const ing = {
      current_price: 2.916,
      purchase_quantity: 600,
      cost_base_unit: "ml" as const,
    };
    expect(effectiveIngredientUnitCostEur(ing) * 1000).toBeCloseTo(4.86, 2);
    expect(ingredientLineCostEur(30, ing, { recipeUnit: "ml" })).toBeCloseTo(0.1458, 3);
    expect(recipeLineCostViaPackagedLiquidConversion(30, "ml", ing).converted).toBe(true);
  });

  it("packaged liquid wins over spurious density on mis-tagged g pack", () => {
    const ing = {
      current_price: 4.59,
      purchase_quantity: 450,
      cost_base_unit: "g" as const,
      usable_volume_ml: 450,
      density_g_per_ml: 1.15,
    };
    expect(ingredientLineCostEur(15, ing, { recipeUnit: "ml" })).toBeCloseTo(0.153, 3);
    expect(recipeLineCostViaDensityConversion(15, "ml", ing).converted).toBe(true);
    const densityOnly = 15 * 1.15 * (4.59 / 450);
    expect(densityOnly).not.toBeCloseTo(0.153, 2);
  });

  it("ketchup 350 ml vs kg invoice still uses density after packaged liquid misses", () => {
    const ing = {
      current_price: 5,
      purchase_quantity: 1000,
      cost_base_unit: "g" as const,
      density_g_per_ml: 1.15,
    };
    expect(recipeLineCostViaPackagedLiquidConversion(350, "ml", ing).converted).toBe(false);
    expect(ingredientLineCostEur(350, ing, { recipeUnit: "ml" })).toBeCloseTo(2.0125, 4);
    expect(recipeLineCostViaDensityConversion(350, "ml", ing).converted).toBe(true);
  });

  it("Alface iceberg 30 g resolves via countable usable before density", () => {
    const fields = operationalCostFieldsFromInvoiceLine({
      name: "ALFACE ICEBERG 1 un",
      quantity: 1,
      unit: "un",
      unit_price: 1.39,
    })!;
    expect(ingredientLineCostEur(30, fields!, { recipeUnit: "g" })).toBeCloseTo(0.0834, 3);
    expect(recipeLineCostViaDensityConversion(30, "g", fields!).converted).toBe(false);
  });
});

describe("logCrossDomainConversion", () => {
  it("emits [CROSS_DOMAIN_CONVERSION] when trace is enabled", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    logCrossDomainConversion({
      sourceUnit: "ml",
      targetUnit: "g",
      densityGPerMl: 1.15,
      recipeQuantity: 350,
      recipeNormalizedQuantity: 350,
      recipeNormalizedUnit: "ml",
      intermediateGrams: 402.5,
      intermediateMl: 350,
      operationalQuantity: 402.5,
      operationalUnit: "g",
      lineCostEur: 2.0125,
      conversionKind: "volume_to_weight",
    });
    if (shouldLogCrossDomainConversion()) {
      expect(info).toHaveBeenCalledWith(
        CROSS_DOMAIN_CONVERSION_PREFIX,
        expect.objectContaining({
          sourceUnit: "ml",
          targetUnit: "g",
          densityGPerMl: 1.15,
          intermediateGrams: 402.5,
          lineCostEur: 2.0125,
        }),
      );
    }
    info.mockRestore();
  });
});
