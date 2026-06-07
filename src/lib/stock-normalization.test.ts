import { describe, expect, it } from "vitest";
import {
  resolveInvoiceLinePurchaseFormat,
  resolveInvoiceLineStockPresentation,
  resolveInvoicePurchaseDisplayLabel,
} from "./invoice-purchase-format";
import {
  computeUsableFromPurchaseStructure,
  deriveUsableFromPackPhrase,
  extractCanonicalIngredientStructure,
  extractNumericMeasureTokens,
  inferSemanticPackStructure,
  inferShorthandUsableFromContext,
  isWeakInvoiceRowContentMeasure,
  measureToBase,
  normalizePurchasedToUsableStock,
  parsePurchaseStructureFromText,
  pickExplicitPackPhrase,
  purchaseStructureMultiplierChain,
  purchaseStructureToPackPhrase,
  resolveSemanticUsableQuantity,
  summarizePurchaseStructure,
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

describe("parsePurchaseStructureFromText", () => {
  it.each([
    {
      name: "1 pack x 250 g",
      tier: "container_size",
      purchaseQuantity: 1,
      unitSize: 250,
      unitMeasurement: "g",
      totalUsableAmount: 250,
      usableUnit: "g",
    },
    {
      name: "1 bottle x 450 ml",
      tier: "container_size",
      purchaseQuantity: 1,
      unitSize: 450,
      unitMeasurement: "ml",
      totalUsableAmount: 450,
      usableUnit: "ml",
    },
    {
      name: "1 pack x 875 g",
      tier: "container_size",
      purchaseQuantity: 1,
      unitSize: 875,
      unitMeasurement: "g",
      totalUsableAmount: 875,
      usableUnit: "g",
    },
    {
      name: "2 kg",
      tier: "bare_measure",
      purchaseQuantity: 1,
      unitSize: 2,
      unitMeasurement: "kg",
      totalUsableAmount: 2000,
      usableUnit: "g",
    },
    {
      name: "24 x 330 ml",
      tier: "count_size",
      purchaseQuantity: 24,
      unitSize: 330,
      unitMeasurement: "ml",
      totalUsableAmount: 7920,
      usableUnit: "ml",
    },
    {
      name: "40 x 180 g",
      tier: "count_size",
      purchaseQuantity: 40,
      unitSize: 180,
      unitMeasurement: "g",
      totalUsableAmount: 7200,
      usableUnit: "g",
    },
    {
      name: "4 cases x 24 x 330ml",
      tier: "triple_nested",
      purchaseQuantity: 4,
      innerUnitCount: 24,
      unitSize: 330,
      unitMeasurement: "ml",
      totalUsableAmount: 31680,
      usableUnit: "ml",
    },
    {
      name: "5 packs x 1kg",
      tier: "container_size",
      purchaseQuantity: 5,
      innerUnitCount: undefined,
      unitSize: 1,
      unitMeasurement: "kg",
      totalUsableAmount: 5000,
      usableUnit: "g",
    },
    {
      name: "Caixa 40 un x 180g",
      tier: "caixa_units_size",
      purchaseQuantity: 1,
      innerUnitCount: 40,
      unitSize: 180,
      unitMeasurement: "g",
      totalUsableAmount: 7200,
      usableUnit: "g",
    },
    {
      name: "24x80g",
      tier: "count_size",
      purchaseQuantity: 24,
      unitSize: 80,
      unitMeasurement: "g",
      totalUsableAmount: 1920,
      usableUnit: "g",
    },
    {
      name: "24X80G",
      tier: "count_size",
      purchaseQuantity: 24,
      unitSize: 80,
      unitMeasurement: "g",
      totalUsableAmount: 1920,
      usableUnit: "g",
    },
    {
      name: "24 un x 80 g",
      tier: "units_size",
      purchaseQuantity: 1,
      innerUnitCount: 24,
      unitSize: 80,
      unitMeasurement: "g",
      totalUsableAmount: 1920,
      usableUnit: "g",
    },
    {
      name: "40 un x 180 g",
      tier: "units_size",
      purchaseQuantity: 1,
      innerUnitCount: 40,
      unitSize: 180,
      unitMeasurement: "g",
      totalUsableAmount: 7200,
      usableUnit: "g",
    },
    {
      name: "Caixa 24x80g",
      tier: "caixa_compact_size",
      purchaseQuantity: 1,
      innerUnitCount: 24,
      unitSize: 80,
      unitMeasurement: "g",
      totalUsableAmount: 1920,
      usableUnit: "g",
    },
    {
      name: "Pack 6 x 1 L",
      tier: "container_size",
      purchaseQuantity: 6,
      unitSize: 1,
      unitMeasurement: "L",
      totalUsableAmount: 6000,
      usableUnit: "ml",
    },
    {
      name: "Pão Hamb. Brioche 80g 24x80g",
      tier: "count_size",
      purchaseQuantity: 24,
      unitSize: 80,
      unitMeasurement: "g",
      totalUsableAmount: 1920,
      usableUnit: "g",
    },
  ])("parses $name", ({ name, tier, purchaseQuantity, innerUnitCount, unitSize, unitMeasurement, totalUsableAmount, usableUnit }) => {
    const structure = parsePurchaseStructureFromText(name);
    expect(structure).not.toBeNull();
    expect(structure?.tier).toBe(tier);
    expect(structure?.purchaseQuantity).toBe(purchaseQuantity);
    if (innerUnitCount != null) {
      expect(structure?.innerUnitCount).toBe(innerUnitCount);
    }
    expect(structure?.unitSize).toBe(unitSize);
    expect(structure?.unitMeasurement).toBe(unitMeasurement);
    expect(structure?.totalUsableAmount).toBe(totalUsableAmount);
    expect(summarizePurchaseStructure(structure!)).toMatchObject({
      purchaseQuantity,
      totalUsableAmount,
      usableUnit,
    });
    expect(purchaseStructureMultiplierChain(structure!).totalUsableAmount).toBe(totalUsableAmount);
  });

  it("ignores trailing weak pack duplicate merged from invoice row OCR", () => {
    const structure = parsePurchaseStructureFromText("MAYO 1 pack x 250 g 1 pack x 3 g");
    expect(structure?.unitSize).toBe(250);
    expect(structure?.totalUsableAmount).toBe(250);
    expect(structure?.matchedText).toBe("1 pack x 250 g");
  });

  it("ignores trailing row g/ml merged into product name", () => {
    const structure = parsePurchaseStructureFromText("OLEO 1 bottle x 450 ml 4 ml");
    expect(structure?.tier).toBe("container_size");
    expect(structure?.purchaseQuantity).toBe(1);
    expect(structure?.unitSize).toBe(450);
    expect(structure?.totalUsableAmount).toBe(450);

    const resolved = resolveInvoiceLinePurchaseFormat({
      name: "OLEO 1 bottle x 450 ml 4 ml",
      quantity: 4,
      unit: "ml",
    });
    expect(resolved.normalizedUsableQuantity).toBe(450);
    expect(resolved.usableQuantityUnit).toBe("ml");
  });

  it.each([
    { name: "1 pack x 250 g", rowQuantity: 3, rowUnit: "g", unitSize: 250 },
    { name: "1 bottle x 450 ml", rowQuantity: 4, rowUnit: "ml", unitSize: 450 },
    { name: "BATATA 1 pack x 875 g", rowQuantity: 2, rowUnit: "g", unitSize: 875 },
  ])(
    "unitSize from name pack×size, not row $rowQuantity $rowUnit ($name)",
    ({ name, rowQuantity, rowUnit, unitSize }) => {
      const structure = parsePurchaseStructureFromText(name);
      expect(structure?.unitSize).toBe(unitSize);
      const tokens = extractNumericMeasureTokens(name);
      expect(tokens.some((t) => t.value === rowQuantity && t.unit === rowUnit)).toBe(false);
      const derived = computeUsableFromPurchaseStructure(structure!, rowQuantity, rowUnit);
      expect(derived.usableQuantity).toBe(unitSize);
      expect(derived.weak_scalar_activated).toBe(true);
    },
  );
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

  it("detects row g/ml mistaken for embedded title kg (e.g. BATATA PALHA 2KG + row 2 g)", () => {
    const namePhrase = phrase({
      kind: "weight_or_volume",
      packageQuantity: 2,
      packageUnit: "kg",
      confidence: 0.91,
    });
    const rowPhrase = phrase({
      kind: "weight_or_volume",
      packageQuantity: 2,
      packageUnit: "g",
      confidence: 0.95,
    });
    expect(isWeakInvoiceRowContentMeasure(rowPhrase, 2, namePhrase)).toBe(true);
  });
});

describe("pickExplicitPackPhrase", () => {
  it("prefers embedded title kg over weak row g/ml", () => {
    const picked = pickExplicitPackPhrase({
      name: "CHEDDAR 1KG",
      namePhrase: phrase({
        kind: "weight_or_volume",
        packageQuantity: 1,
        packageUnit: "kg",
        confidence: 0.91,
      }),
      rowPhrase: phrase({
        kind: "weight_or_volume",
        packageQuantity: 1,
        packageUnit: "g",
        confidence: 0.95,
      }),
      rowQuantity: 1,
      rowUnit: "g",
    });
    expect(picked).toMatchObject({
      kind: "weight_or_volume",
      packageQuantity: 1,
      packageUnit: "kg",
    });
  });

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
    expect(picked).toMatchObject({
      kind: "container_with_size",
      packageQuantity: 875,
      packageUnit: "g",
    });
  });
});

describe("embedded product title kg — row g/ml OCR", () => {
  it.each([
    {
      name: "CHEDDAR 1KG",
      rowQuantity: 1,
      rowUnit: "g",
      usable: 1000,
      labelPattern: /1\s*kg\s+usable/i,
      forbidPattern: /^\s*1\s*g\s+usable/i,
    },
    {
      name: "BACON FATIADO FUMADO 1KG",
      rowQuantity: 1,
      rowUnit: "g",
      usable: 1000,
      labelPattern: /1\s*kg\s+usable/i,
      forbidPattern: /^\s*1\s*g\s+usable/i,
    },
    {
      name: "BATATA PALHA 2KG",
      rowQuantity: 2,
      rowUnit: "g",
      usable: 2000,
      labelPattern: /2\s*kg\s+usable/i,
      forbidPattern: /^\s*2\s*g\s+usable/i,
    },
  ] as const)(
    "$name row $rowQuantity $rowUnit → $usable usable",
    ({ name, rowQuantity, rowUnit, usable, labelPattern, forbidPattern }) => {
      const resolved = resolveInvoiceLinePurchaseFormat({ name, quantity: rowQuantity, unit: rowUnit });
      expect(resolved.normalizedUsableQuantity).toBe(usable);
      expect(resolved.usableQuantityUnit).toBe("g");
      expect(resolved.stockNormalizationPipeline).toBe("unified");

      const presentation = resolveInvoiceLineStockPresentation({ name, quantity: rowQuantity, unit: rowUnit });
      expect(presentation.usableQuantity).toBe(usable);
      expect(presentation.quantityLabel).toMatch(labelPattern);
      expect(presentation.quantityLabel).not.toMatch(forbidPattern);
    },
  );
});

describe("purchase structure — broken multiplier regressions", () => {
  it.each([
    {
      name: "5 packs x 1kg",
      rowQuantity: 5,
      rowUnit: "g",
      usable: 5000,
      usableUnit: "g",
    },
    {
      name: "4 cases x 24 x 330ml",
      rowQuantity: 4,
      rowUnit: "ml",
      usable: 31680,
      usableUnit: "ml",
    },
    {
      name: "Caixa 40 un x 180g",
      rowQuantity: 1,
      rowUnit: "un",
      usable: 7200,
      usableUnit: "g",
    },
  ] as const)(
    "$name (row $rowQuantity $rowUnit) → $usable $usableUnit",
    ({ name, rowQuantity, rowUnit, usable, usableUnit }) => {
      const resolved = resolveInvoiceLinePurchaseFormat({ name, quantity: rowQuantity, unit: rowUnit });
      expect(resolved.normalizedUsableQuantity).toBe(usable);
      expect(resolved.usableQuantityUnit).toBe(usableUnit);
      expect(resolved.stockNormalizationPipeline).toBe("unified");
    },
  );
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
      name: "24 x 330 ml",
      rowQuantity: 24,
      rowUnit: "ml",
      usable: 7920,
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
    expect(result.source).toBe("purchase_structure");
    expect(result.purchaseStructure?.tier).toBe("container_size");
  });
});

describe("gram/ml structure pipeline — row OCR must not collapse usable", () => {
  it.each([
    {
      name: "1 pack x 250 g",
      rowQuantity: 3,
      rowUnit: "g",
      unitSize: 250,
      usable: 250,
      labelPattern: /250\s*g\s+usable/i,
    },
    {
      name: "1 bottle x 450 ml",
      rowQuantity: 4,
      rowUnit: "ml",
      unitSize: 450,
      usable: 450,
      labelPattern: /450\s*ml\s+usable/i,
    },
    {
      name: "BATATA 1 pack x 875 g",
      rowQuantity: 2,
      rowUnit: "g",
      unitSize: 875,
      usable: 875,
      labelPattern: /875\s*g\s+usable/i,
    },
  ] as const)(
    "$name row $rowQuantity $rowUnit → $usable usable label",
    ({ name, rowQuantity, rowUnit, unitSize, usable, labelPattern }) => {
      const structure = parsePurchaseStructureFromText(name);
      expect(structure?.unitSize).toBe(unitSize);
      expect(structure?.totalUsableAmount).toBe(usable);

      const stock = normalizePurchasedToUsableStock({
        name,
        namePhrase: null,
        rowPhrase: null,
        rowQuantity,
        rowUnit,
      });
      expect(stock.usableQuantity).toBe(usable);

      const resolved = resolveInvoiceLinePurchaseFormat({ name, quantity: rowQuantity, unit: rowUnit });
      expect(resolved.normalizedUsableQuantity).toBe(usable);

      const presentation = resolveInvoiceLineStockPresentation({ name, quantity: rowQuantity, unit: rowUnit });
      expect(presentation.usableQuantity).toBe(usable);
      expect(presentation.quantityLabel).toMatch(labelPattern);
    },
  );
});

describe("computeUsableFromPurchaseStructure", () => {
  it("applies row purchase count for nested case lines", () => {
    const structure = parsePurchaseStructureFromText("4 cases x 24 x 330ml");
    expect(structure).not.toBeNull();
    const derived = computeUsableFromPurchaseStructure(structure!, 4, "ml");
    expect(derived.usableQuantity).toBe(31680);
    expect(derived.usableUnit).toBe("ml");
  });
});

describe("bakery and compact purchase structures", () => {
  it.each([
    { name: "24x80g", usable: 1920 },
    { name: "40 un x 180 g", usable: 7200 },
    { name: "Pack 6 x 1 L", usable: 6000 },
  ] as const)("$name → $usable usable", ({ name, usable }) => {
    const stock = normalizePurchasedToUsableStock({
      name,
      namePhrase: null,
      rowPhrase: null,
      rowQuantity: null,
      rowUnit: null,
    });
    expect(stock.usableQuantity).toBe(usable);
    expect(stock.source).toBe("purchase_structure");
  });

  it("Pão Batata 80g with weak row 60g and 24x80g in name → 60g usable", () => {
    const name = "Pão Batata 80g 24x80g";
    const structure = parsePurchaseStructureFromText(name);
    expect(structure?.totalUsableAmount).toBe(1920);
    const derived = computeUsableFromPurchaseStructure(structure!, 60, "g");
    expect(derived.usableQuantity).toBe(60);
    expect(derived.weak_scalar_activated).toBe(true);

    const stock = normalizePurchasedToUsableStock({
      name,
      namePhrase: null,
      rowPhrase: null,
      rowQuantity: 60,
      rowUnit: "g",
    });
    expect(stock.usableQuantity).toBe(60);
  });

  it("Pão Batata 80g caixa 24 with weak row 60g → 60g usable", () => {
    const name = "Pão Batata 80g caixa 24";
    const structure = parsePurchaseStructureFromText(name);
    expect(structure?.tier).toBe("caixa_compact_size");
    expect(structure?.totalUsableAmount).toBe(1920);
    const stock = normalizePurchasedToUsableStock({
      name,
      namePhrase: null,
      rowPhrase: null,
      rowQuantity: 60,
      rowUnit: "g",
    });
    expect(stock.usableQuantity).toBe(60);
  });

  it("brioche 24x80g pack phrase keeps unit count × unit size for display", () => {
    const structure = parsePurchaseStructureFromText("Pão Hamb. Brioche 80g 24x80g");
    expect(structure).not.toBeNull();
    const phrase = purchaseStructureToPackPhrase(structure!);
    expect(phrase).toMatchObject({
      kind: "multi_unit_pack",
      containerCount: 24,
      packageQuantity: 80,
      packageUnit: "g",
    });

    const resolved = resolveInvoiceLinePurchaseFormat({
      name: "Pão Hamb. Brioche 80g 24x80g",
      quantity: 1,
      unit: "un",
    });
    expect(resolveInvoicePurchaseDisplayLabel({
      name: "Pão Hamb. Brioche 80g 24x80g",
      quantity: 1,
      unit: "un",
    })).toBe("24 x 80 g");
    expect(resolved.normalizedUsableQuantity).toBe(1920);
  });

  it("ignores OCR 1 pack x 120 g when title already has per-piece 80g and 24x80g", () => {
    const structure = parsePurchaseStructureFromText(
      "Pão Hamb. Brioche 80g 24x80g 1 pack x 120 g",
    );
    expect(structure?.tier).toBe("count_size");
    expect(structure?.purchaseQuantity).toBe(24);
    expect(structure?.unitSize).toBe(80);
    expect(structure?.totalUsableAmount).toBe(1920);
  });

  it("malformed OCR row g/ml does not replace compact structure total", () => {
    const stock = normalizePurchasedToUsableStock({
      name: "24x80g",
      namePhrase: null,
      rowPhrase: null,
      rowQuantity: 24,
      rowUnit: "g",
    });
    expect(stock.usableQuantity).toBe(1920);
  });

  it.each([
    { name: "24x80g", rowQuantity: 2, rowUnit: "un", usable: 1920 },
    { name: "12x90g", rowQuantity: 1, rowUnit: "un", usable: 1080 },
    { name: "6x1L", rowQuantity: 1, rowUnit: "un", usable: 6000 },
  ] as const)(
    "$name row $rowQuantity $rowUnit stays at $usable (no inner rescale)",
    ({ name, rowQuantity, rowUnit, usable }) => {
      const resolved = resolveInvoiceLinePurchaseFormat({
        name,
        quantity: rowQuantity,
        unit: rowUnit,
      });
      expect(resolved.normalizedUsableQuantity).toBe(usable);
      expect(resolveInvoiceLineStockPresentation({ name, quantity: rowQuantity, unit: rowUnit }).quantityLabel).toMatch(
        new RegExp(String(usable >= 1000 ? usable / 1000 : usable)),
      );
    },
  );

  it("2 caixas x 24x80g with row 2 un → 3840g", () => {
    const resolved = resolveInvoiceLinePurchaseFormat({
      name: "2 caixas x 24x80g",
      quantity: 2,
      unit: "un",
    });
    expect(resolved.normalizedUsableQuantity).toBe(3840);
    expect(resolved.usableQuantityUnit).toBe("g");
  });
});

describe("extractCanonicalIngredientStructure", () => {
  it.each([
    { name: "Pão hambúrguer brioche 80g", unitSize: 80, unitType: "g" as const },
    { name: "Hambúrguer bovino 180g", unitSize: 180, unitType: "g" as const },
    { name: "Smash Burger Patty 90g", unitSize: 90, unitType: "g" as const },
    { name: "Bacon Burger Premium Fatiado 1kg", unitSize: 1000, unitType: "g" as const },
  ])("parses $name", ({ name, unitSize, unitType }) => {
    const structure = extractCanonicalIngredientStructure(name);
    expect(structure).toMatchObject({ unitSize, unitType, usableQuantity: unitSize });
    expect(structure?.confidence).toBeGreaterThanOrEqual(0.9);
  });

  it("maps BAC STRK + 1kg canonical match to kg-based semantic usable", () => {
    const inferred = inferSemanticPackStructure({
      lineName: "BAC STRK",
      rowQuantity: 6,
      rowUnit: "un",
      matchedIngredientName: "Bacon Burger Premium Fatiado 1kg",
    });
    expect(inferred).toMatchObject({
      perUnitSize: 1000,
      usableUnit: "g",
      outerPurchaseQty: 6,
      totalUsable: 6000,
      source: "matched_ingredient_structure",
    });
  });
});

describe("invoice shorthand semantic usable", () => {
  it.each([
    {
      name: "BRCH 80",
      matchedIngredientName: "Pão hambúrguer brioche 80g",
      rowQuantity: 1,
      rowUnit: "un",
      usable: 80,
      expectSource: "line_canonical_consistent" as const,
    },
    {
      name: "SES BUN 80",
      matchedIngredientName: "Pão hambúrguer brioche 80g",
      rowQuantity: 1,
      rowUnit: "un",
      usable: 80,
      expectSource: "line_canonical_consistent" as const,
    },
    {
      name: "BRCH BUN",
      matchedIngredientName: "Pão hambúrguer brioche 80g",
      rowQuantity: 1,
      rowUnit: "un",
      usable: 80,
      expectSource: "matched_ingredient_structure" as const,
    },
    {
      name: "ANG PTY 180",
      matchedIngredientName: null,
      rowQuantity: 1,
      rowUnit: "un",
      usable: 180,
      expectSource: "embedded_title_weight" as const,
    },
    {
      name: "SMASH PTY 90",
      matchedIngredientName: "Smash Burger Patty 90g",
      rowQuantity: 2,
      rowUnit: "un",
      usable: 180,
      expectSource: "line_canonical_consistent" as const,
    },
  ] as const)(
    "$name → $usable g usable",
    ({ name, matchedIngredientName, rowQuantity, rowUnit, usable, expectSource }) => {
      const inferred = inferSemanticPackStructure({
        lineName: name,
        rowQuantity,
        rowUnit,
        matchedIngredientName,
      });
      expect(inferred?.totalUsable).toBe(usable);
      expect(inferred?.usableUnit).toBe("g");
      if (expectSource) {
        expect(inferred?.source).toBe(expectSource);
      }
      expect(
        resolveSemanticUsableQuantity({
          lineName: name,
          rowQuantity,
          rowUnit,
          matchedIngredientName,
        })?.totalUsable,
      ).toBe(usable);

      const resolved = resolveInvoiceLinePurchaseFormat({
        name,
        quantity: rowQuantity,
        unit: rowUnit,
        matchedIngredientName,
      });
      expect(resolved.normalizedUsableQuantity).toBe(usable);
      expect(resolved.usableQuantityUnit).toBe("g");
      expect(resolved.kind).toBe("weight_or_volume");
      const perPiece =
        rowQuantity > 1 ? Math.round(usable / rowQuantity) : usable;
      expect(resolveInvoicePurchaseDisplayLabel({
        name,
        quantity: rowQuantity,
        unit: rowUnit,
        matchedIngredientName,
      })).toMatch(new RegExp(`${perPiece}\\s*g`, "i"));
      const presentation = resolveInvoiceLineStockPresentation({
        name,
        quantity: rowQuantity,
        unit: rowUnit,
        matchedIngredientName,
      });
      expect(presentation.quantityLabel).toMatch(new RegExp(`${usable}\\s*g`, "i"));
    },
  );

  it("does not invent usable weight without shorthand or match signal", () => {
    expect(
      inferShorthandUsableFromContext({
        name: "Tomate cherry premium",
        rowQuantity: 1,
        rowUnit: "un",
        matchedIngredientName: null,
      }),
    ).toBeNull();

    const resolved = resolveInvoiceLinePurchaseFormat({
      name: "Tomate cherry premium",
      quantity: 1,
      unit: "un",
    });
    expect(resolved.normalizedUsableQuantity).not.toBe(1);
    const label = resolveInvoiceLineStockPresentation({
      name: "Tomate cherry premium",
      quantity: 1,
      unit: "un",
    }).quantityLabel;
    expect(label == null || !/^1\s*g\s+usable$/i.test(label)).toBe(true);
  });
});
