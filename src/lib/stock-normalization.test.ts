import { describe, expect, it } from "vitest";
import { resolveInvoiceLinePurchaseFormat } from "./invoice-purchase-format";
import {
  deriveUsableFromPackPhrase,
  isWeakInvoiceRowContentMeasure,
  measureToBase,
  normalizePurchasedToUsableStock,
  pickExplicitPackPhrase,
  type NormalizedPackPhrase,
} from "./stock-normalization";

const phrase = (
  partial: Partial<NormalizedPackPhrase> & Pick<NormalizedPackPhrase, "kind">,
): NormalizedPackPhrase => ({
  containerCount: 1,
  packageQuantity: null,
  packageUnit: null,
  confidence: 0.97,
  ...partial,
});

describe("measureToBase", () => {
  it.each([
    { qty: 450, unit: "ml" as const, amount: 450, base: "ml" },
    { qty: 2, unit: "kg" as const, amount: 2000, base: "g" },
    { qty: 5, unit: "L" as const, amount: 5000, base: "ml" },
  ])("converts $qty $unit", ({ qty, unit, amount, base }) => {
    expect(measureToBase(qty, unit)).toEqual(
      expect.objectContaining({ amount, base }),
    );
  });
});

describe("isWeakInvoiceRowContentMeasure", () => {
  it("detects invoice row qty mistaken for ml content size", () => {
    const namePhrase = phrase({
      kind: "container_with_size",
      packageQuantity: 450,
      packageUnit: "ml",
    });
    const rowPhrase = phrase({
      kind: "weight_or_volume",
      packageQuantity: 4,
      packageUnit: "ml",
      confidence: 0.95,
    });
    expect(isWeakInvoiceRowContentMeasure(rowPhrase, 4, namePhrase)).toBe(true);
  });

  it("detects invoice row qty mistaken for g content size", () => {
    const namePhrase = phrase({
      kind: "container_with_size",
      packageQuantity: 250,
      packageUnit: "g",
    });
    const rowPhrase = phrase({
      kind: "weight_or_volume",
      packageQuantity: 3,
      packageUnit: "g",
      confidence: 0.95,
    });
    expect(isWeakInvoiceRowContentMeasure(rowPhrase, 3, namePhrase)).toBe(true);
  });
});

describe("pickExplicitPackPhrase", () => {
  it("prefers name container×size over weak row g/ml", () => {
    const namePhrase = phrase({
      kind: "container_with_size",
      packageQuantity: 875,
      packageUnit: "g",
    });
    const rowPhrase = phrase({
      kind: "weight_or_volume",
      packageQuantity: 2,
      packageUnit: "g",
      confidence: 0.95,
    });
    const picked = pickExplicitPackPhrase({
      name: "BATATA 1 pack x 875 g",
      namePhrase,
      rowPhrase,
      rowQuantity: 2,
      rowUnit: "g",
    });
    expect(picked).toBe(namePhrase);
  });
});

describe("normalizePurchasedToUsableStock — oil and condiments", () => {
  it.each([
    {
      name: "1 bottle x 450 ml",
      rowQuantity: 4,
      rowUnit: "ml",
      usable: 450,
      usableUnit: "ml",
    },
    {
      name: "OLEO 1 bottle x 5 L",
      rowQuantity: 1,
      rowUnit: "ml",
      usable: 5000,
      usableUnit: "ml",
    },
    {
      name: "1 pack x 250 g",
      rowQuantity: 3,
      rowUnit: "g",
      usable: 250,
      usableUnit: "g",
    },
    {
      name: "KETCHUP 1 pack x 570 g",
      rowQuantity: 1,
      rowUnit: "g",
      usable: 570,
      usableUnit: "g",
    },
    {
      name: "MAYO 1 pack x 250 g",
      rowQuantity: 1,
      rowUnit: "g",
      usable: 250,
      usableUnit: "g",
    },
  ] as const)(
    "$name (row $rowQuantity $rowUnit) → $usable $usableUnit usable",
    ({ name, rowQuantity, rowUnit, usable, usableUnit }) => {
      const resolved = resolveInvoiceLinePurchaseFormat({ name, quantity: rowQuantity, unit: rowUnit });
      expect(resolved.normalizedUsableQuantity).toBe(usable);
      expect(resolved.usableQuantityUnit).toBe(usableUnit);
    },
  );
});

describe("normalizePurchasedToUsableStock — produce, packaging, frozen", () => {
  it.each([
    {
      name: "ALFACE ICEBERG 1 un",
      rowQuantity: 1,
      rowUnit: "un",
      usable: 500,
      usableUnit: "g",
    },
    {
      name: "CAIXA HAMBURGUER KRAFT 250UN",
      rowQuantity: 1,
      rowUnit: "un",
      usableUnit: "un",
      minUsable: 24,
    },
    {
      name: "PAO BRIOCHE 80G 120 UN",
      rowQuantity: 1,
      rowUnit: "un",
      usable: 120,
      usableUnit: "un",
    },
    {
      name: "BATATA CONGELADA 1 pack x 875 g",
      rowQuantity: 2,
      rowUnit: "g",
      usable: 875,
      usableUnit: "g",
    },
    {
      name: "2 kg",
      rowQuantity: null,
      rowUnit: null,
      usable: 2000,
      usableUnit: "g",
    },
  ] as const)(
    "$name",
    ({ name, rowQuantity, rowUnit, usable, usableUnit, minUsable }) => {
      const resolved = resolveInvoiceLinePurchaseFormat({
        name,
        quantity: rowQuantity ?? undefined,
        unit: rowUnit ?? undefined,
      });
      if (usable != null) {
        expect(resolved.normalizedUsableQuantity).toBe(usable);
      } else if (minUsable != null) {
        expect(resolved.normalizedUsableQuantity).toBeGreaterThanOrEqual(minUsable);
      } else {
        expect(resolved.normalizedUsableQuantity).toBeNull();
      }
      expect(resolved.usableQuantityUnit).toBe(usableUnit);
    },
  );
});

describe("bulk pack regressions (2.5 kg / 3 kg)", () => {
  it.each([
    {
      name: "FARINHA 1 pack x 2.5 kg",
      rowQuantity: 6,
      rowUnit: "g",
      usable: 2500,
      usableUnit: "g",
    },
    {
      name: "ARROZ 1 pack x 3 kg",
      rowQuantity: 2,
      rowUnit: "g",
      usable: 3000,
      usableUnit: "g",
    },
    {
      name: "1 pack x 2.5kg",
      rowQuantity: 1,
      rowUnit: "un",
      usable: 2500,
      usableUnit: "g",
    },
    {
      name: "1 pack x 2,5 kg",
      rowQuantity: 6,
      rowUnit: "g",
      usable: 2500,
      usableUnit: "g",
    },
  ] as const)(
    "$name (row $rowQuantity $rowUnit) → $usable $usableUnit",
    ({ name, rowQuantity, rowUnit, usable, usableUnit }) => {
      const resolved = resolveInvoiceLinePurchaseFormat({ name, quantity: rowQuantity, unit: rowUnit });
      expect(resolved.normalizedUsableQuantity).toBe(usable);
      expect(resolved.usableQuantityUnit).toBe(usableUnit);
    },
  );
});

describe("deriveUsableFromPackPhrase", () => {
  it("multiplies outer purchase count for generic row units", () => {
    const stock = deriveUsableFromPackPhrase(
      phrase({
        kind: "container_with_size",
        packageQuantity: 450,
        packageUnit: "ml",
      }),
      6,
      "un",
    );
    expect(stock.usableQuantity).toBe(2700);
    expect(stock.usableUnit).toBe("ml");
  });

  it("uses explicit phrase pipeline without row", () => {
    const result = normalizePurchasedToUsableStock({
      name: "1 bottle x 450 ml",
      namePhrase: phrase({
        kind: "container_with_size",
        packageQuantity: 450,
        packageUnit: "ml",
      }),
      rowPhrase: null,
      rowQuantity: null,
      rowUnit: null,
    });
    expect(result.usableQuantity).toBe(450);
    expect(result.usableUnit).toBe("ml");
    expect(result.unitFamily).toBe("volume");
    expect(result.pipelineId).toBe("unified");
  });
});
