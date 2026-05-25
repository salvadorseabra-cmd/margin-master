import { describe, expect, it } from "vitest";
import { resolveInvoiceLinePurchaseFormat } from "./invoice-purchase-format";
import {
  deriveInvoiceRowInlineChips,
  formatInvoicePurchasePriceLabel,
  formatInvoiceRowMatchStatusLine,
  formatInvoiceRowReviewWarning,
  formatPurchasedPackDetail,
  formatRowPurchaseQuantityLabel,
  groupInvoiceLineBadges,
  INVOICE_PRICE_SPIKE_THRESHOLD_PERCENT,
  resolveInvoiceLinePricingPresentation,
} from "./invoice-purchase-price-semantics";

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
