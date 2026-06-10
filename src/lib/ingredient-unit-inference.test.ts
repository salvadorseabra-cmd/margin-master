import { describe, expect, it, vi } from "vitest";
import {
  detectVolume,
  extractSkuClueVolumeMl,
  inferPurchaseUnitsFromLineItemName,
  repairDecimalClBeverageVolume,
} from "./ingredient-unit-inference";
import { computeEffectiveUsableCost } from "./invoice-purchase-price-semantics";
import { resolveInvoiceLinePurchaseFormat } from "./invoice-purchase-format";

describe("repairDecimalClBeverageVolume", () => {
  it("repairs 0.20cl ginger beer when GINGER33 SKU clue is present", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = repairDecimalClBeverageVolume(
      "Baladin - Ginger Beer GINGER33 0.20cl",
      2,
    );
    expect(result.repaired).toBe(true);
    expect(result.volumeMl).toBe(330);
    expect(result.reason).toBe("sku-clue-GINGER33");
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("repairedVolume=330ml reason=sku-clue-GINGER33"),
    );
    warn.mockRestore();
  });

  it("repairs 0.33cl water when WATER33 SKU clue is present", () => {
    const result = repairDecimalClBeverageVolume("Sparkling WATER33 mineral 0.33cl", 3);
    expect(result.repaired).toBe(true);
    expect(result.volumeMl).toBe(330);
  });

  it("leaves 75cl beverages unchanged", () => {
    const result = repairDecimalClBeverageVolume("SanPellegrino Acqua 75cl", 750);
    expect(result.repaired).toBe(false);
    expect(result.volumeMl).toBe(750);
    expect(detectVolume("SanPellegrino - Acqua in vitro 75cl x 15ud")?.milliliters).toBe(750);
  });

  it("leaves 0.20cl non-beverage unchanged without warning", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = repairDecimalClBeverageVolume("Olive Oil Extra Virgin 0.20cl", 2);
    expect(result.repaired).toBe(false);
    expect(result.volumeMl).toBe(2);
    expect(result.warning).toBeUndefined();
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it("warns but does not repair beverage 0.20cl without SKU clue", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = repairDecimalClBeverageVolume("Baladin - Ginger Beer 0.20cl", 2);
    expect(result.repaired).toBe(false);
    expect(result.volumeMl).toBe(2);
    expect(result.warning).toBe("decimal-cl-beverage-anomaly");
    expect(warn).toHaveBeenCalledWith(
      "[volume-sanity] product=Baladin - Ginger Beer 0.20cl rawVolume=2ml reason=decimal-cl-beverage-anomaly",
    );
    warn.mockRestore();
  });
});

describe("detectVolume decimal-cl beverage repair", () => {
  it("returns 330ml for 0.20cl ginger beer with embedded GINGER33", () => {
    const detection = detectVolume("Baladin - Ginger Beer GINGER33 0.20cl");
    expect(detection?.milliliters).toBe(330);
    expect(inferPurchaseUnitsFromLineItemName("Baladin - Ginger Beer GINGER33 0.20cl").purchase_quantity).toBe(
      330,
    );
  });

  it("extracts SKU clue from compound supplier codes", () => {
    expect(extractSkuClueVolumeMl("BBB-GINGER33ITA Baladin - Ginger Beer 0.20cl")).toEqual({
      milliliters: 330,
      clue: "GINGER33",
    });
  });

  it("keeps Emporio-style name at 2ml until SKU is present in the line", () => {
    expect(detectVolume("Baladin - Ginger Beer 0.20cl")?.milliliters).toBe(2);
  });
});

describe("resolveInvoiceLinePurchaseFormat regression", () => {
  it("keeps San Pellegrino 75cl at 750ml per unit", () => {
    const resolved = resolveInvoiceLinePurchaseFormat({
      name: "SanPellegrino - Acqua in vitro 75cl x 15ud",
      quantity: 3,
      unit: "cx",
    });
    expect(resolved.inferred.purchase_quantity).toBe(750);
    expect(resolved.packageQuantity).toBe(750);
    expect(resolved.packageMeasurementUnit).toBe("ml");
  });

  it("repairs ginger beer pricing path when SKU clue is in the name", () => {
    const resolved = resolveInvoiceLinePurchaseFormat({
      name: "BBB-GINGER33ITA Baladin - Ginger Beer 0.20cl",
      quantity: 24,
      unit: "un",
      unit_price: 0.85,
    });
    expect(resolved.packageQuantity).toBe(330);
    expect(resolved.packageMeasurementUnit).toBe("ml");
    expect(resolved.normalizedUsableQuantity).toBe(7920);
  });

  it("validates Emporio ginger beer cost before and after SKU repair", () => {
    const before = resolveInvoiceLinePurchaseFormat({
      name: "Baladin - Ginger Beer 0.20cl",
      quantity: 24,
      unit: "un",
      unit_price: 0.85,
    });
    const after = resolveInvoiceLinePurchaseFormat({
      name: "BBB-GINGER33ITA Baladin - Ginger Beer 0.20cl",
      quantity: 24,
      unit: "un",
      unit_price: 0.85,
    });
    const lineMeta = { quantity: 24, unit: "un" as const, unit_price: 0.85 };
    const beforeCost = computeEffectiveUsableCost(
      0.85,
      lineMeta,
      before,
      before.ingredientIdentityHint,
    );
    const afterCost = computeEffectiveUsableCost(
      0.85,
      lineMeta,
      after,
      after.ingredientIdentityHint,
    );
    expect(before.packageQuantity).toBe(2);
    expect(after.packageQuantity).toBe(330);
    expect(beforeCost?.cost).toBeCloseTo(425, 0);
    expect(afterCost?.cost).toBeCloseTo(2.58, 1);
    expect(afterCost?.unit).toBe("L");
  });
});
