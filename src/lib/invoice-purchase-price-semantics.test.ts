import { describe, expect, it } from "vitest";
import {
  effectiveIngredientUnitCostEur,
  isOperationalPricingResolved,
  MISSING_OPERATIONAL_PRICING_LABEL,
  resolvedOperationalUnitCostEur,
} from "@/lib/ingredient-unit-cost";
import { resolveInvoiceLinePurchaseFormat } from "./invoice-purchase-format";
import { ingredientLineCostEur } from "@/lib/recipe-prep-cost";
import {
  deriveInvoiceRowInlineChips,
  formatInvoicePurchasePriceLabel,
  formatInvoiceRowMatchStatusLine,
  formatInvoiceRowReviewWarning,
  formatPurchasedPackDetail,
  formatRowPurchaseQuantityLabel,
  groupInvoiceLineBadges,
  INVOICE_PRICE_SPIKE_THRESHOLD_PERCENT,
  recipeOperationalCostFieldsFromInvoiceLine,
  resolveInvoiceLinePricingPresentation,
} from "./invoice-purchase-price-semantics";

describe("recipeOperationalCostFieldsFromInvoiceLine", () => {
  it("maps Novilho 10 kg @ €11.40/kg to per-gram denominator (260g ≈ €2.96)", () => {
    const fields = recipeOperationalCostFieldsFromInvoiceLine({
      name: "Novilho Acém",
      quantity: 10,
      unit: "kg",
      unit_price: 11.4,
    });
    expect(fields).toEqual({
      current_price: 11.4,
      purchase_quantity: 1000,
      cost_base_unit: "g",
    });
    expect(effectiveIngredientUnitCostEur(fields!)).toBeCloseTo(0.0114, 4);
    expect(ingredientLineCostEur(260, fields!, { recipeUnit: "g" })).toBeCloseTo(2.96, 2);
  });

  it("maps sesame bun 1 un @ €0.21 to €/un not €/g from embedded 80g", () => {
    const fields = recipeOperationalCostFieldsFromInvoiceLine({
      name: "Pão de Hambúrguer Sésamo 80g",
      quantity: 1,
      unit: "un",
      unit_price: 0.21,
    });
    expect(fields).toMatchObject({
      current_price: 0.21,
      purchase_quantity: 1,
      cost_base_unit: "un",
      usable_weight_grams: 80,
    });
    expect(effectiveIngredientUnitCostEur(fields!)).toBeCloseTo(0.21, 2);
    expect(effectiveIngredientUnitCostEur(fields!)).toBeGreaterThan(0.01);
    expect(ingredientLineCostEur(1, fields!, { recipeUnit: "un" })).toBeCloseTo(0.21, 2);
    expect(ingredientLineCostEur(80, fields!, { recipeUnit: "g" })).toBeCloseTo(0.21, 2);
  });

  it("maps Alface 1 un @ €1.39 with 500g usable for gram recipes", () => {
    const fields = recipeOperationalCostFieldsFromInvoiceLine({
      name: "ALFACE ICEBERG 1 un",
      quantity: 1,
      unit: "un",
      unit_price: 1.39,
    });
    expect(fields?.cost_base_unit).toBe("un");
    expect(fields?.usable_weight_grams).toBe(500);
    expect(ingredientLineCostEur(30, fields!, { recipeUnit: "g" })).toBeCloseTo(0.0834, 3);
  });

  it("maps Coca-Cola 33cl pack to 330 ml per can (not 33 ml → €296/L)", () => {
    const meta = {
      name: "Coca-Cola lata 33cl (Pack 24)",
      quantity: 1,
      unit: "cx",
      unit_price: 9.84,
    };
    const structured = resolveInvoiceLinePurchaseFormat(meta);
    expect(structured.packageQuantity).toBe(330);
    expect(structured.packageMeasurementUnit).toBe("ml");

    const fields = recipeOperationalCostFieldsFromInvoiceLine(meta);
    expect(fields?.cost_base_unit).toBe("un");
    expect(fields?.purchase_quantity).toBe(24);
    expect(fields?.purchase_quantity).not.toBe(33);
    const perCan = effectiveIngredientUnitCostEur(fields!);
    expect(perCan).toBeCloseTo(9.84 / 24, 2);
    const perLiterIfMisreadAs33ml = (9.84 / 33) * 1000;
    expect(perLiterIfMisreadAs33ml).toBeGreaterThan(200);
    const perLiterIfCorrect330ml = (9.84 / 330) * 1000;
    expect(perLiterIfCorrect330ml).toBeLessThan(50);
  });

  it("maps 24x33cl phrase to 7920 ml usable stock", () => {
    const structured = resolveInvoiceLinePurchaseFormat({ name: "24x33cl" });
    expect(structured.normalizedUsableQuantity).toBe(7920);
    expect(structured.usableQuantityUnit).toBe("ml");
  });

  it("maps Hellmann's 450ml @ €4.59 (1 un Continente) to €/ml not €/ml pack price", () => {
    const fields = recipeOperationalCostFieldsFromInvoiceLine({
      name: "MAIONESE HELLMANN'S 450ML",
      quantity: 1,
      unit: "un",
      unit_price: 4.59,
    });
    expect(fields).toEqual({
      current_price: 4.59,
      purchase_quantity: 450,
      cost_base_unit: "ml",
    });
    expect(effectiveIngredientUnitCostEur(fields!)).toBeCloseTo(0.0102, 3);
    expect(effectiveIngredientUnitCostEur(fields!)).not.toBeCloseTo(4.59, 2);
    expect(ingredientLineCostEur(30, fields!, { recipeUnit: "ml" })).toBeCloseTo(0.306, 2);
  });

  it("maps supermarket 450ml row qty (450 ml OCR) without dividing usable twice", () => {
    const fields = recipeOperationalCostFieldsFromInvoiceLine({
      name: "MAIONESE CALVE TOP DOWN 450ML",
      quantity: 450,
      unit: "ml",
      unit_price: 4.59,
    });
    expect(fields?.purchase_quantity).toBe(450);
    expect(fields?.cost_base_unit).toBe("ml");
    expect(effectiveIngredientUnitCostEur(fields!)).toBeCloseTo(0.0102, 3);
  });

  it("maps Angus case price to per-patty denominator inside the case", () => {
    const fields = recipeOperationalCostFieldsFromInvoiceLine({
      name: "Burger Angus 180gr (Caixa 40 un)",
      quantity: 1,
      unit: "cx",
      unit_price: 46,
    });
    expect(fields).toMatchObject({
      current_price: 46,
      purchase_quantity: 40,
      cost_base_unit: "un",
    });
    expect(ingredientLineCostEur(1, fields!, { recipeUnit: "un" })).toBeCloseTo(1.15, 2);
  });
});

describe("formatInvoicePurchasePriceLabel", () => {
  it.each([
    {
      name: "Burger Angus 180gr (Caixa 40 un)",
      quantity: 2,
      unit: "cx",
      label: "Pack price",
    },
    {
      name: "1 pack x 2 kg",
      quantity: 1,
      unit: "kg",
      label: "Pack price",
    },
    {
      name: "ARROZ CAROLINO 2 KG",
      quantity: 1,
      unit: "kg",
      label: "Purchase price",
    },
    {
      name: "250 g",
      quantity: 1,
      unit: "g",
      label: "Purchase price",
    },
    {
      name: "TOMATE CHERRY",
      quantity: 1,
      unit: "un",
      label: "Price",
    },
    {
      name: "1 bottle x 450 ml",
      quantity: 1,
      unit: "ml",
      label: "Pack price",
    },
  ] as const)("uses $label for $name", ({ name, quantity, unit, label }) => {
    expect(formatInvoicePurchasePriceLabel({ name, quantity, unit })).toBe(label);
  });

  it("never returns Unit price for outer pack lines", () => {
    const label = formatInvoicePurchasePriceLabel({
      name: "Burger Angus 180gr (Caixa 40 un)",
      quantity: 2,
      unit: "cx",
      unit_price: 46,
    });
    expect(label).not.toBe("Unit price");
    expect(label).toBe("Pack price");
  });
});

describe("purchase phrasing", () => {
  it("uses row quantity for cases, not units-per-pack", () => {
    const meta = {
      name: "Burger Angus 180gr (Caixa 40 un)",
      quantity: 2,
      unit: "cx",
    };
    expect(formatRowPurchaseQuantityLabel(meta)).toBe("2 cases");
    const structured = resolveInvoiceLinePurchaseFormat(meta);
    expect(formatPurchasedPackDetail(structured, meta.name, meta.unit)).toBe("40 × 180 g");
  });

  it("uses product noun when row unit is not a pack container", () => {
    const meta = { name: "Burger Angus 180gr (Caixa 40 un)", quantity: 1, unit: "un" };
    const structured = resolveInvoiceLinePurchaseFormat(meta);
    expect(formatPurchasedPackDetail(structured, meta.name, meta.unit)).toBe("40 burgers × 180 g");
  });
});

describe("resolveInvoiceLinePricingPresentation", () => {
  it("documents Angus normalization fields", () => {
    const structured = resolveInvoiceLinePurchaseFormat({
      name: "Burger Angus 180gr (Caixa 40 un)",
      quantity: 2,
      unit: "cx",
    });
    expect(structured.normalizedUsableQuantity).toBe(7200);
    expect(structured.usableQuantityUnit).toBe("g");
  });

  it("documents LEITE row quantity scaling", () => {
    const one = resolveInvoiceLinePurchaseFormat({
      name: "LEITE UHT 1L PACK6",
      quantity: 1,
      unit: "un",
    });
    const two = resolveInvoiceLinePurchaseFormat({
      name: "LEITE UHT 1L PACK6",
      quantity: 2,
      unit: "un",
    });
    expect(one.normalizedUsableQuantity).toBe(6000);
    expect(two.normalizedUsableQuantity).toBe(12000);
  });

  it("formats Angus burger case as a compact normalization card", () => {
    const presentation = resolveInvoiceLinePricingPresentation({
      name: "Burger Angus 180gr (Caixa 40 un)",
      quantity: 2,
      unit: "cx",
      unit_price: 46,
      line_total: 92,
    });

    expect({
      card: presentation.card,
      badges: presentation.badges,
      rowQuantity: formatRowPurchaseQuantityLabel({
        name: "Burger Angus 180gr (Caixa 40 un)",
        quantity: 2,
        unit: "cx",
      }),
      purchasedPackDetail: presentation.purchasedPackDetail,
    }).toMatchInlineSnapshot(`
      {
        "badges": [],
        "card": {
          "normalizedLine": "7.2 kg usable",
          "purchasePriceLine": "€46.00 / case · €92.00 total",
          "purchaseQuantityLine": "2 cases · 40 × 180 g",
          "usableCostLine": "€6.3889 / kg usable",
        },
        "purchasedPackDetail": "40 × 180 g",
        "rowQuantity": "2 cases",
      }
    `);
  });

  it("formats bulk weight as purchase price per kg", () => {
    const presentation = resolveInvoiceLinePricingPresentation({
      name: "BATATA PALHA 2KG",
      quantity: 1,
      unit: "kg",
      unit_price: 14.5,
    });

    expect(presentation.priceLabel).toBe("Purchase price");
    expect(presentation.priceDisplay).toBe("€14.50 / kg");
    expect(presentation.effectiveUsableCostLabel).toMatch(/€[\d.]+\s\/\skg/);
    expect(presentation.card.usableCostLine).toMatch(/€[\d.]+\s\/\skg usable/);
  });

  it("formats liquid bottle lines with per-L usable cost", () => {
    const presentation = resolveInvoiceLinePricingPresentation({
      name: "1 bottle x 450 ml",
      quantity: 4,
      unit: "ml",
      unit_price: 2.4,
    });

    expect(presentation.priceLabel).toBe("Pack price");
    expect(presentation.priceDisplay).toBe("€2.40 / bottle");
    expect(presentation.usableStockLabel).toMatch(/450\s*ml\s+usable/i);
    expect(presentation.effectiveUsableCostLabel).toMatch(/€[\d.]+\s\/\sL/);
  });

  it("gracefully omits normalized cost when usable stock is unknown", () => {
    const presentation = resolveInvoiceLinePricingPresentation({
      name: "TOMATE CHERRY",
      quantity: 1,
      unit: "un",
      unit_price: 3.5,
    });

    expect(presentation.priceLabel).toBe("Price");
    expect(presentation.priceDisplay).toBe("€3.50 / unit");
    expect(presentation.effectiveUsableCostLabel).toBeNull();
    expect(presentation.badges).toEqual([]);
    expect(presentation.card.usableCostLine).toBeNull();
  });

  it("formats BAC STRK with 1kg canonical match in kg-based units", () => {
    const presentation = resolveInvoiceLinePricingPresentation({
      name: "BAC STRK",
      quantity: 6,
      unit: "un",
      unit_price: 8.95,
      matchedIngredientName: "Bacon Burger Premium Fatiado 1kg",
    });

    expect(presentation.purchasedPackDetail).toBe("6 × 1 kg");
    expect(presentation.purchasedPackDetail).not.toMatch(/1\s*g/i);
    expect(presentation.usableStockLabel).toMatch(/6\s*kg\s+usable/i);
    expect(presentation.effectiveUsableCostLabel).toBe("€8.95 / kg");
    expect(presentation.card.usableCostLine).not.toMatch(/8,?950/i);
  });

  it("formats Angus case with embedded piece weight as per-case not per-180g", () => {
    const presentation = resolveInvoiceLinePricingPresentation({
      name: "CARNE HAMBURGUER ANGUS 180G",
      quantity: 1,
      unit: "cx",
      unit_price: 24.9,
    });

    expect(presentation.card.purchaseQuantityLine).toBe("1 case");
    expect(presentation.card.purchasePriceLine).toBe("€24.90 / case");
    expect(presentation.card.normalizedLine).toBeNull();
    expect(presentation.usableStockLabel).toBeNull();
    expect(presentation.card.usableCostLine).toBe("€24.90 / case usable");
    expect(presentation.effectiveUsableCostLabel).not.toMatch(/138/i);
  });
});

describe("formatInvoiceRowReviewWarning", () => {
  it("only surfaces new supplier and abnormal price spikes", () => {
    expect(
      formatInvoiceRowReviewWarning({
        signals: [
          { kind: "new-supplier", label: "New supplier" },
          { kind: "catalog-price-up", label: "Above catalog pack price" },
          { kind: "stale-pricing", label: "Outdated pricing" },
        ],
      }),
    ).toBe("New supplier");

    expect(
      formatInvoiceRowReviewWarning({
        signals: [{ kind: "catalog-price-up", label: "Above catalog pack price" }],
      }),
    ).toBeNull();

    expect(
      formatInvoiceRowReviewWarning({
        signals: [{ kind: "stale-pricing", label: "Outdated pricing" }],
      }),
    ).toBeNull();

    expect(
      formatInvoiceRowReviewWarning({
        signals: [{ kind: "price-increased", label: "Price up vs last invoice" }],
        previousInvoiceLinePrice: 10,
        currentUnitPrice: 10.5,
      }),
    ).toBeNull();

    expect(
      formatInvoiceRowReviewWarning({
        signals: [{ kind: "price-increased", label: "Price up vs last invoice" }],
        previousInvoiceLinePrice: 10,
        currentUnitPrice: 10 + 10 * (INVOICE_PRICE_SPIKE_THRESHOLD_PERCENT / 100) + 0.01,
      }),
    ).toBe("Price spike");
  });

  it("returns new supplier when present without hidden pricing signals", () => {
    expect(
      formatInvoiceRowReviewWarning({
        signals: [{ kind: "new-supplier", label: "New supplier" }],
      }),
    ).toBe("New supplier");
  });
});

describe("formatInvoiceRowMatchStatusLine", () => {
  it("ignores hidden pricing warnings", () => {
    expect(
      formatInvoiceRowMatchStatusLine({
        matchedAutomatically: true,
        confidenceLabel: "High confidence",
        warning: "Pricing may be outdated",
      }),
    ).toBe("Matched automatically");

    expect(
      formatInvoiceRowMatchStatusLine({
        matchedAutomatically: false,
        confidenceLabel: "High confidence",
        warning: "Higher than recent purchases",
      }),
    ).toBe("High confidence");
  });

  it("prefers a visible warning over match confidence copy", () => {
    expect(
      formatInvoiceRowMatchStatusLine({
        matchedAutomatically: true,
        confidenceLabel: "High confidence",
        warning: "New supplier",
      }),
    ).toBe("New supplier");
  });

  it("shows match states when calm", () => {
    expect(
      formatInvoiceRowMatchStatusLine({
        matchedAutomatically: true,
        confidenceLabel: "High confidence",
        warning: null,
      }),
    ).toBe("Matched automatically");

    expect(
      formatInvoiceRowMatchStatusLine({
        matchedAutomatically: false,
        confidenceLabel: "High confidence",
        warning: null,
      }),
    ).toBe("High confidence");

    expect(
      formatInvoiceRowMatchStatusLine({
        matchedAutomatically: false,
        confidenceLabel: "Suggested match",
        warning: null,
        suggestedMatch: true,
      }),
    ).toBe("Possible match");

    expect(
      formatInvoiceRowMatchStatusLine({
        matchedAutomatically: false,
        confidenceLabel: null,
        warning: null,
        unmatched: true,
      }),
    ).toBe("No match");
  });
});

describe("deriveInvoiceRowInlineChips", () => {
  it("returns at most one match chip and one warning chip", () => {
    expect(
      deriveInvoiceRowInlineChips({
        matchedAutomatically: true,
        confidenceLabel: "High confidence",
        unmatched: false,
        suggestedMatch: false,
        signals: [
          { kind: "price-increased", label: "Price up vs last invoice" },
          { kind: "new-supplier", label: "New supplier" },
        ],
        previousInvoiceLinePrice: 10,
        currentUnitPrice: 12,
      }),
    ).toEqual([
      { label: "Matched automatically", tone: "success" },
      { label: "Price spike", tone: "increase" },
    ]);
  });
});

describe("groupInvoiceLineBadges", () => {
  it("groups operational signals into semantic badge rows", () => {
    const groups = groupInvoiceLineBadges([
      { kind: "catalog-price-up", label: "Above catalog pack price", tone: "increase" },
      { kind: "stale-pricing", label: "Outdated pricing", tone: "review" },
      { kind: "new-supplier", label: "New supplier", tone: "muted" },
      { kind: "recipe-impact", label: "In 3 recipes", tone: "muted" },
    ]);

    expect(groups.map((group) => ({ id: group.id, badges: group.badges.map((b) => b.label) }))).toEqual([
      {
        id: "pricing-risk",
        badges: ["Above catalog pack price", "Outdated pricing"],
      },
      {
        id: "supplier-signals",
        badges: ["New supplier"],
      },
      {
        id: "recipe-exposure",
        badges: ["In 3 recipes"],
      },
    ]);
  });
});

describe("missing operational pricing", () => {
  it("returns null unit cost for empty catalog fields (not €0)", () => {
    expect(
      isOperationalPricingResolved({ current_price: null, purchase_quantity: null }),
    ).toBe(false);
    expect(
      resolvedOperationalUnitCostEur({ current_price: null, purchase_quantity: null }),
    ).toBeNull();
    expect(
      ingredientLineCostEur(1, { current_price: null, purchase_quantity: null }, { recipeUnit: "un" }),
    ).toBeNull();
  });

  it("surfaces missing label constant for UI/PDF", () => {
    expect(MISSING_OPERATIONAL_PRICING_LABEL).toMatch(/missing operational pricing/i);
  });
});
