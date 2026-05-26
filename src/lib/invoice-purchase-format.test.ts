import { describe, expect, it } from "vitest";
import {
  formatInvoiceLineRawPurchaseFallback,
  formatStructuredPurchaseDisplay,
  formatCanonicalUsableStockLabel,
  formatUsableStockQuantityLabel,
  hasRichPackageSemantics,
  isCollapsedMeaninglessPurchaseLabel,
  isCollapsedMeaninglessUsable,
  isMeaninglessUsableStockLabel,
  parsePurchaseFormatPhrase,
  resolveInvoiceLinePurchaseFormat,
  resolveInvoiceLineStockPresentation,
  resolveInvoicePurchaseDisplayLabel,
  structuredPurchaseToIngredientFields,
  USABLE_STOCK_MIN_CONFIDENCE,
} from "./invoice-purchase-format";

describe("parsePurchaseFormatPhrase", () => {
  it.each([
    {
      input: "1 bottle x 450ml",
      kind: "container_with_size",
      containerCount: 1,
      containerUnit: "bottle",
      packageQuantity: 450,
      packageUnit: "ml",
      usable: 450,
      usableUnit: "ml",
    },
    {
      input: "1 pack x 2kg",
      kind: "container_with_size",
      containerCount: 1,
      containerUnit: "pack",
      packageQuantity: 2,
      packageUnit: "kg",
      usable: 2000,
      usableUnit: "g",
    },
    {
      input: "1 un",
      kind: "unit_count",
      containerCount: 1,
      containerUnit: "un",
      usable: null,
      usableUnit: null,
    },
    {
      input: "250 g",
      kind: "weight_or_volume",
      containerCount: 1,
      packageQuantity: 250,
      packageUnit: "g",
      usable: 250,
      usableUnit: "g",
    },
  ] as const)(
    "parses $input",
    ({
      input,
      kind,
      containerCount,
      containerUnit,
      packageQuantity,
      packageUnit,
      usable,
      usableUnit,
    }) => {
      const parsed = parsePurchaseFormatPhrase(input);
      expect(parsed?.kind).toBe(kind);
      expect(parsed?.containerCount).toBe(containerCount);
      if (containerUnit) expect(parsed?.containerUnit).toBe(containerUnit);
      if (packageQuantity != null) expect(parsed?.packageQuantity).toBe(packageQuantity);
      if (packageUnit) expect(parsed?.packageUnit).toBe(packageUnit);

      const resolved = resolveInvoiceLinePurchaseFormat({ name: input });
      expect(resolved.kind).toBe(kind);
      expect(resolved.normalizedUsableQuantity).toBe(usable);
      expect(resolved.usableQuantityUnit).toBe(usableUnit);
    },
  );

  it("parses container×size embedded in a product name", () => {
    const resolved = resolveInvoiceLinePurchaseFormat({
      name: "AZEITE VIRGEM 1 GARRAFA X 750ML",
    });
    expect(resolved.kind).toBe("container_with_size");
    expect(resolved.purchaseContainerCount).toBe(1);
    expect(resolved.packageQuantity).toBe(750);
    expect(resolved.packageMeasurementUnit).toBe("ml");
    expect(resolved.ingredientIdentityHint.toLowerCase()).toContain("azeite");
    expect(resolved.ingredientIdentityHint.toLowerCase()).not.toContain("750");
  });

  it("prefers row quantity+unit when present", () => {
    const resolved = resolveInvoiceLinePurchaseFormat({
      name: "TOMATE CHERRY",
      quantity: 1,
      unit: "un",
    });
    expect(resolved.kind).toBe("unit_count");
    expect(resolved.purchaseContainerCount).toBe(1);
    expect(resolved.usableQuantityUnit).toBeNull();
  });

  it("handles European decimal separators", () => {
    const resolved = resolveInvoiceLinePurchaseFormat({ name: "1,5 kg" });
    expect(resolved.kind).toBe("weight_or_volume");
    expect(resolved.normalizedUsableQuantity).toBe(1500);
    expect(resolved.usableQuantityUnit).toBe("g");
  });

  it("returns null for ambiguous bare numbers", () => {
    expect(parsePurchaseFormatPhrase("24")).toBeNull();
  });
});

describe("resolveInvoiceLinePurchaseFormat + inference", () => {
  it("uses inference for PACK24 style names without explicit phrase", () => {
    const resolved = resolveInvoiceLinePurchaseFormat({ name: "COCA COLA 33CL PACK24" });
    expect(resolved.inferred.purchase_unit).toBe("un");
    expect(resolved.inferred.purchase_quantity).toBe(24);
  });

  it("combines invoice row count with per-unit size from name", () => {
    const resolved = resolveInvoiceLinePurchaseFormat({
      name: "LEITE UHT 1L PACK6",
      quantity: 2,
      unit: "un",
    });
    expect(resolved.kind).toBe("inferred");
    expect(resolved.inferred.purchase_quantity).toBe(6);
    expect(resolved.normalizedUsableQuantity).toBeGreaterThanOrEqual(12000);
    expect(resolved.usableQuantityUnit).toBe("ml");
  });
});

describe("example parse outputs", () => {
  it("documents structured fields for common purchase phrases", () => {
    const examples = ["1 bottle x 450ml", "1 pack x 2kg", "1 un", "250 g"].map((name) => {
      const structured = resolveInvoiceLinePurchaseFormat({ name });
      return {
        input: name,
        kind: structured.kind,
        ingredientIdentityHint: structured.ingredientIdentityHint,
        purchaseContainerCount: structured.purchaseContainerCount,
        purchaseContainerUnit: structured.purchaseContainerUnit,
        packageQuantity: structured.packageQuantity,
        packageMeasurementUnit: structured.packageMeasurementUnit,
        normalizedUsableQuantity: structured.normalizedUsableQuantity,
        usableQuantityUnit: structured.usableQuantityUnit,
      };
    });
    expect(examples).toMatchInlineSnapshot(`
      [
        {
          "ingredientIdentityHint": "",
          "input": "1 bottle x 450ml",
          "kind": "container_with_size",
          "normalizedUsableQuantity": 450,
          "packageMeasurementUnit": "ml",
          "packageQuantity": 450,
          "purchaseContainerCount": 1,
          "purchaseContainerUnit": "bottle",
          "usableQuantityUnit": "ml",
        },
        {
          "ingredientIdentityHint": "",
          "input": "1 pack x 2kg",
          "kind": "container_with_size",
          "normalizedUsableQuantity": 2000,
          "packageMeasurementUnit": "kg",
          "packageQuantity": 2,
          "purchaseContainerCount": 1,
          "purchaseContainerUnit": "pack",
          "usableQuantityUnit": "g",
        },
        {
          "ingredientIdentityHint": "",
          "input": "1 un",
          "kind": "unit_count",
          "normalizedUsableQuantity": null,
          "packageMeasurementUnit": "un",
          "packageQuantity": 1,
          "purchaseContainerCount": 1,
          "purchaseContainerUnit": "un",
          "usableQuantityUnit": null,
        },
        {
          "ingredientIdentityHint": "",
          "input": "250 g",
          "kind": "weight_or_volume",
          "normalizedUsableQuantity": 250,
          "packageMeasurementUnit": "g",
          "packageQuantity": 250,
          "purchaseContainerCount": 1,
          "purchaseContainerUnit": "g",
          "usableQuantityUnit": "g",
        },
      ]
    `);
  });
});

describe("formatStructuredPurchaseDisplay", () => {
  it.each([
    { name: "1 pack x 250 g", expected: "1 pack x 250 g" },
    { name: "1 bottle x 450 ml", expected: "1 bottle x 450 ml" },
    { name: "1 pack x 2 kg", expected: "1 pack x 2 kg" },
    { name: "1 un", expected: "1 un" },
    { name: "250 g", expected: "250 g" },
  ] as const)("formats $name for invoice display", ({ name, expected }) => {
    const structured = resolveInvoiceLinePurchaseFormat({ name });
    expect(formatStructuredPurchaseDisplay(structured)).toBe(expected);
  });

  it("formats inferred pack lines from structured fields, not row qty/unit", () => {
    const structured = resolveInvoiceLinePurchaseFormat({
      name: "LEITE UHT 1L PACK6",
      quantity: 2,
      unit: "un",
    });
    expect(structured.kind).toBe("inferred");
    expect(structured.packageType).toBe("pack");
    expect(structured.normalizedUsableQuantity).toBeGreaterThanOrEqual(12000);
    expect(formatStructuredPurchaseDisplay(structured)).toBe("2 packs x 1 L");
  });

  it.each([
    {
      name: "MAIONESE CALVE TOP DOWN 450ML",
      quantity: 1,
      unit: "ml",
      display: "1 bottle x 450 ml",
      usable: 450,
      usableUnit: "ml",
    },
    {
      name: "KETCHUP GULOSO TOP DOWN 570G",
      quantity: 1,
      unit: "g",
      display: "1 pack x 570 g",
      usable: 570,
      usableUnit: "g",
    },
    {
      name: "OLEO GIRASSOL VAQUEIRO 1L",
      quantity: 1,
      unit: "ml",
      display: "1 L",
      usable: 1000,
      usableUnit: "ml",
    },
    {
      name: "BATATA PALHA 2KG",
      quantity: 2,
      unit: "g",
      display: "2 kg",
      usable: 2000,
      usableUnit: "g",
    },
  ] as const)(
    "reconstructs purchase display for $name (not collapsed row unit)",
    ({ name, quantity, unit, display, usable, usableUnit }) => {
      const structured = resolveInvoiceLinePurchaseFormat({ name, quantity, unit });
      const stockQty =
        structured.normalizedUsableQuantity ??
        structured.inferred.normalized_stock_quantity;
      const stockUnit =
        structured.usableQuantityUnit ??
        (structured.inferred.stock_unit === "kg"
          ? "g"
          : structured.inferred.stock_unit === "L"
            ? "ml"
            : structured.inferred.stock_unit);
      expect(stockQty).toBe(usable);
      expect(stockUnit).toBe(usableUnit);
      const rowPurchaseLabel = `${quantity} ${unit}`;
      if (quantity === 1) {
        expect(isCollapsedMeaninglessPurchaseLabel(rowPurchaseLabel)).toBe(true);
      } else {
        expect(resolveInvoicePurchaseDisplayLabel({ name, quantity, unit })).not.toBe(rowPurchaseLabel);
      }
      expect(formatStructuredPurchaseDisplay(structured)).toBe(display);
      expect(resolveInvoicePurchaseDisplayLabel({ name, quantity, unit })).toBe(display);
    },
  );
});

describe("supermarket and OCR purchase phrases", () => {
  it.each([
    {
      input: "6 x 1.5L",
      kind: "multi_unit_pack",
      display: "6 x 1.5 L",
      usable: 9000,
      usableUnit: "ml",
    },
    {
      input: "24x33cl",
      kind: "multi_unit_pack",
      display: "24 x 330 ml",
      usable: 7920,
      usableUnit: "ml",
    },
    {
      input: "3 packs x 500g",
      kind: "container_with_size",
      display: "3 packs x 500 g",
      usable: 1500,
      usableUnit: "g",
    },
    {
      input: "2 caixas x 5kg",
      kind: "container_with_size",
      display: "2 cases x 5 kg",
      usable: 10000,
      usableUnit: "g",
    },
    {
      input: "2 kg",
      kind: "weight_or_volume",
      display: "2 kg",
      usable: 2000,
      usableUnit: "g",
    },
    {
      input: "1 pack x 250 g",
      kind: "container_with_size",
      display: "1 pack x 250 g",
      usable: 250,
      usableUnit: "g",
    },
    {
      input: "AGUA 6X1.5L",
      kind: "multi_unit_pack",
      display: "6 x 1.5 L",
      usable: 9000,
      usableUnit: "ml",
    },
    {
      input: "CERVEJA 24 X 33CL",
      kind: "multi_unit_pack",
      display: "24 x 330 ml",
      usable: 7920,
      usableUnit: "ml",
    },
  ] as const)(
    "parses $input",
    ({ input, kind, display, usable, usableUnit }) => {
      const resolved = resolveInvoiceLinePurchaseFormat({ name: input });
      expect(resolved.kind).toBe(kind);
      expect(resolved.normalizedUsableQuantity).toBe(usable);
      expect(resolved.usableQuantityUnit).toBe(usableUnit);
      expect(formatStructuredPurchaseDisplay(resolved)).toBe(display);
    },
  );

  it("parses embedded weight in a product name", () => {
    const resolved = resolveInvoiceLinePurchaseFormat({ name: "ARROZ CAROLINO 2 KG" });
    expect(resolved.kind).toBe("weight_or_volume");
    expect(resolved.normalizedUsableQuantity).toBe(2000);
    expect(formatStructuredPurchaseDisplay(resolved)).toBe("2 kg");
  });

  it("parses embedded 33cl as 330 ml (not 33 ml) in product name", () => {
    const resolved = resolveInvoiceLinePurchaseFormat({
      name: "Coca-Cola lata 33cl (Pack 24)",
      quantity: 1,
      unit: "cx",
    });
    expect(resolved.packageQuantity).toBe(330);
    expect(resolved.packageMeasurementUnit).toBe("ml");
    expect(resolved.inferred.purchase_unit_count).toBe(24);
  });
});

describe("fallback and meaningless usable guards", () => {
  it("detects meaningless usable stock labels", () => {
    expect(isMeaninglessUsableStockLabel("1 g usable")).toBe(true);
    expect(isMeaninglessUsableStockLabel("1 ml usable")).toBe(true);
    expect(isMeaninglessUsableStockLabel("1 units usable")).toBe(true);
    expect(isMeaninglessUsableStockLabel("2 kg usable")).toBe(false);
  });

  it("suppresses collapsed 1 g/ml/un usable quantities", () => {
    const weak = resolveInvoiceLinePurchaseFormat({
      name: "PRODUTO SEM MEDIDA",
      quantity: 1,
      unit: "un",
    });
    expect(isCollapsedMeaninglessUsable(1, "un", weak)).toBe(true);
    expect(
      formatUsableStockQuantityLabel(1, "units", weak),
    ).toBeNull();
  });

  it("preserves raw row text when structured parsing is weak", () => {
    const label = resolveInvoicePurchaseDisplayLabel({
      name: "ITEM DESCRITIVO",
      quantity: 3,
      unit: "cx",
    });
    expect(label).toBe("3 cx");
  });

  it("falls back to matched phrase in product name", () => {
    expect(
      formatInvoiceLineRawPurchaseFallback({ name: "AZEITE 1 GARRAFA X 750ML" }),
    ).toBe("1 GARRAFA X 750ML");
  });

  it("detects collapsed purchase row labels", () => {
    expect(isCollapsedMeaninglessPurchaseLabel("1 g")).toBe(true);
    expect(isCollapsedMeaninglessPurchaseLabel("1 ml")).toBe(true);
    expect(isCollapsedMeaninglessPurchaseLabel("1 pack x 570 g")).toBe(false);
  });

  it("never shows collapsed row unit when name has pack x size", () => {
    const item = { name: "CEREAL FLOCOS 1 pack x 250 g", quantity: 1, unit: "g" };
    const structured = resolveInvoiceLinePurchaseFormat(item);
    expect(structured.kind).toBe("container_with_size");
    expect(hasRichPackageSemantics(structured)).toBe(true);
    expect(resolveInvoicePurchaseDisplayLabel(item)).toBe("1 pack x 250 g");
    expect(resolveInvoicePurchaseDisplayLabel(item)).not.toBe("1 g");
  });

  it("does not emit 1 units usable for generic single-unit rows", () => {
    const structured = resolveInvoiceLinePurchaseFormat({
      name: "TOMATE CHERRY",
      quantity: 1,
      unit: "un",
    });
    const stockLabel = formatUsableStockQuantityLabel(1, "units", structured);
    expect(stockLabel).toBeNull();
    expect(resolveInvoicePurchaseDisplayLabel({
      name: "TOMATE CHERRY",
      quantity: 1,
      unit: "un",
    })).toBe("1 un");
  });

  it("documents usable stock confidence threshold", () => {
    expect(USABLE_STOCK_MIN_CONFIDENCE).toBeGreaterThanOrEqual(0.9);
  });
});

describe("resolveInvoiceLineStockPresentation", () => {
  it.each([
    {
      name: "1 pack x 2.5 kg",
      quantity: 6,
      unit: "g",
      usable: 2500,
      usableUnit: "g",
      pipelineId: "unified" as const,
      labelPattern: /2\.5\s*kg\s+usable/i,
      forbidPattern: /^\s*[246]\s*g\s+usable/i,
    },
    {
      name: "1 bottle x 450 ml",
      quantity: 4,
      unit: "ml",
      usable: 450,
      usableUnit: "ml",
      pipelineId: "unified" as const,
      labelPattern: /450\s*ml\s+usable/i,
      forbidPattern: /^\s*4\s*ml\s+usable/i,
    },
    {
      name: "250 g",
      quantity: 1,
      unit: "g",
      usable: 250,
      usableUnit: "g",
      pipelineId: "unified" as const,
      labelPattern: /250\s*g\s+usable/i,
      forbidPattern: /^\s*1\s*g\s+usable/i,
    },
    {
      name: "BATATA CONGELADA 1 pack x 875 g",
      quantity: 2,
      unit: "g",
      usable: 875,
      usableUnit: "g",
      pipelineId: "unified" as const,
      labelPattern: /875\s*g\s+usable/i,
      forbidPattern: /^\s*2\s*g\s+usable/i,
    },
    {
      name: "4 cases x 24 x 330ml",
      quantity: 4,
      unit: "ml",
      usable: 31680,
      usableUnit: "ml",
      pipelineId: "unified" as const,
      labelPattern: /31\.68\s*L\s+usable/i,
      forbidPattern: /^\s*4\s*ml\s+usable/i,
    },
  ])(
    "unified pipeline: $name",
    ({ name, quantity, unit, usable, usableUnit, pipelineId, labelPattern, forbidPattern }) => {
      const presentation = resolveInvoiceLineStockPresentation({ name, quantity, unit });
      expect(presentation.pipelineId).toBe(pipelineId);
      expect(presentation.usableQuantity).toBe(usable);
      expect(presentation.usableUnit).toBe(usableUnit);
      expect(presentation.renderSource).toBe("unified");
      expect(presentation.quantityLabel).toMatch(labelPattern);
      expect(presentation.quantityLabel).not.toMatch(forbidPattern);
    },
  );

  it("shows estimated yield for leafy produce without explicit pack size", () => {
    const presentation = resolveInvoiceLineStockPresentation({
      name: "ALFACE ICEBERG",
      quantity: 1,
      unit: "un",
    });
    expect(presentation.quantityLabel).toMatch(/usable/i);
    expect(presentation.usableQuantity).toBeGreaterThanOrEqual(400);
    expect(presentation.pipelineId).toBe("unified");
    expect(presentation.renderSource).toBe("estimated_yield");
    expect(presentation.detailLabel).toBe("estimated kitchen yield");
  });

  it("does not use row OCR scalar when unified usable exists", () => {
    const presentation = resolveInvoiceLineStockPresentation({
      name: "1 bottle x 450 ml",
      quantity: 4,
      unit: "ml",
    });
    expect(presentation.renderSource).not.toBe("legacy_fallback");
    expect(presentation.quantityLabel).not.toMatch(/^\s*4\s*ml\s+usable/i);
  });

  it("formatCanonicalUsableStockLabel maps large ml totals to L", () => {
    expect(formatCanonicalUsableStockLabel(31680, "ml")).toBe("31.68 L usable");
  });

  it("live engine ignores stale row g/ml when name embeds pack kg (cheddar 1kg)", () => {
    const presentation = resolveInvoiceLineStockPresentation(
      { name: "cheddar 1kg", quantity: 2, unit: "g" },
      "stale-row-test",
    );
    expect(presentation.usableQuantity).toBe(1000);
    expect(presentation.usableUnit).toBe("g");
    expect(presentation.quantityLabel).toMatch(/1\s*kg\s+usable/i);
    expect(presentation.quantityLabel).not.toMatch(/^\s*2\s*g\s+usable/i);
    expect(presentation.renderSource).toBe("unified");
  });
});

describe("structuredPurchaseToIngredientFields", () => {
  const isGeneric = (unit: string | null | undefined) =>
    !unit?.trim() || ["un", "unit", "units"].includes(unit.trim().toLowerCase());

  it("keeps inference-backed fields when available", () => {
    const structured = resolveInvoiceLinePurchaseFormat({ name: "CHEDDAR FATIADO 1KG" });
    const fields = structuredPurchaseToIngredientFields(structured, null, isGeneric);
    expect(fields.purchase_quantity).toBe(1000);
    expect(fields.purchase_unit).toBe("g");
    expect(fields.base_unit).toBe("g");
  });

  it("does not let embedded per-piece weight override countable base unit for buns", () => {
    const structured = resolveInvoiceLinePurchaseFormat({
      name: "Pão brioche 80g",
      quantity: 120,
      unit: "un",
    });
    const fields = structuredPurchaseToIngredientFields(structured, "un", isGeneric);
    expect(fields).toMatchObject({
      purchase_quantity: 120,
      purchase_unit: "un",
      base_unit: "un",
    });
    expect(fields.purchase_quantity).not.toBe(80);
    expect(fields.purchase_quantity).not.toBe(9600);
  });

  it("uses structured usable quantity for explicit weight lines", () => {
    const structured = resolveInvoiceLinePurchaseFormat({ name: "250 g" });
    const fields = structuredPurchaseToIngredientFields(structured, "g", isGeneric);
    expect(fields.purchase_quantity).toBe(250);
    expect(fields.purchase_unit).toBe("g");
  });
});
