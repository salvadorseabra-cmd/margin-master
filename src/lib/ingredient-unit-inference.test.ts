import { describe, expect, it } from "vitest";
import { detectVolume, inferPurchaseUnitsFromLineItemName } from "./ingredient-unit-inference";

describe("detectVolume — decimal-leading CL typo", () => {
  it.each([
    { token: "Baladin - Ginger Beer 0.20cl", ml: 200 },
    { token: "20cl", ml: 200 },
    { token: "200ml", ml: 200 },
    { token: "Óleo 0.75L", ml: 750 },
    { token: "75cl", ml: 750 },
    { token: "Acqua 5L", ml: 5000 },
  ])("parses $token → $ml ml", ({ token, ml }) => {
    expect(detectVolume(token)?.milliliters).toBe(ml);
  });
});

describe("inferPurchaseUnitsFromLineItemName — beverage multipacks", () => {
  it.each([
    { name: "SanPellegrino - Acqua in vitro 75cl x 15ud", packCount: 15 },
    { name: "75cl x 15ud", packCount: 15 },
    { name: "75cl x15", packCount: 15 },
    { name: "33cl x24", packCount: 24 },
    { name: "24x33cl", packCount: 24 },
    { name: "24x20cl", packCount: 24 },
  ])("detects pack structure for $name", ({ name, packCount }) => {
    const inferred = inferPurchaseUnitsFromLineItemName(name);
    expect(inferred.purchase_unit).toBe("un");
    expect(inferred.base_unit).toBe("un");
    expect(inferred.purchase_quantity).toBe(packCount);
    expect(inferred.purchase_unit_count).toBe(packCount);
    expect(inferred.purchase_unit).not.toBe("ml");
    expect(inferred.pack_size).not.toBeNull();
  });

  it.each([
    { name: "12x1kg", packCount: 12, packSize: 1000, packSizeUnit: "g" as const },
    { name: "6x1L", packCount: 6, packSize: 1000, packSizeUnit: "ml" as const },
    { name: "10x200g", packCount: 10, packSize: 200, packSizeUnit: "g" as const },
  ])("regression: keeps NxSIZE pack for $name", ({ name, packCount, packSize, packSizeUnit }) => {
    const inferred = inferPurchaseUnitsFromLineItemName(name);
    expect(inferred.purchase_unit).toBe("un");
    expect(inferred.purchase_quantity).toBe(packCount);
    expect(inferred.purchase_unit_count).toBe(packCount);
    expect(inferred.pack_size).toBe(packSize);
    expect(inferred.pack_size_unit).toBe(packSizeUnit);
  });
});
