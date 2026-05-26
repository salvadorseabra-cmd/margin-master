import { describe, expect, it } from "vitest";
import {
  formatIngredientPriceMetadataHierarchy,
  formatOperationalInvoiceDate,
  formatOperationalPriceContext,
  formatOperationalPricePdfFootnote,
  pricingConfidenceHumanLabel,
} from "@/lib/pricing-source-presentation";

describe("pricing-source-presentation", () => {
  it("formats invoice date for restaurant-readable copy", () => {
    expect(formatOperationalInvoiceDate("2026-05-27")).toBe("27 May 2026");
  });

  it("maps resolver codes to human labels", () => {
    expect(pricingConfidenceHumanLabel("invoice_direct")).toBe("Latest invoice");
    expect(pricingConfidenceHumanLabel("catalog_fallback")).toBe("Catalog price");
  });

  it("formatOperationalPriceContext returns human primary lines without resolver codes", () => {
    const result = formatOperationalPriceContext({
      source: "invoice_direct",
      supplier: "Recheio",
      date: "2026-05-27",
      unitCostEur: 0.0139,
      costFields: { current_price: 13.9, purchase_quantity: 1000, cost_base_unit: "g" },
      costSource: "invoice",
      costBaseUnit: "g",
    });

    expect(result.primaryLines).toEqual(["Supplier: Recheio", "Invoice: 27 May 2026"]);
    expect(result.primaryLines.join(" ")).not.toMatch(/invoice_direct|Original price/);
    expect(result.compactLine).toBe("Recheio · 27 May 2026");
    expect(result.technicalDetailLines).toEqual([
      "Resolution: Latest invoice",
      "Original price: €13.90/kg",
      "Resolver: invoice_direct",
      "invoice · g · invoice_direct · 2026-05-27",
    ]);
    expect(result.debugResolutionCode).toBe("invoice_direct");
    expect(result.debugTechnicalLine).toBe("invoice · g · invoice_direct · 2026-05-27");
    expect(result.context.debugMethod).toBe("Latest invoice");
    expect(formatOperationalPricePdfFootnote(result.context)).toBe("Recheio · 27 May 2026");
  });

  it("keeps provenance as secondary and pack context as tertiary", () => {
    expect(
      formatIngredientPriceMetadataHierarchy({
        provenanceLine: "Recheio · 27 May 2026",
        packagedPackLine: "450ml pack · €4.59",
      }),
    ).toEqual({
      secondaryLine: "Recheio · 27 May 2026",
      tertiaryLine: "450ml pack · €4.59",
    });

    expect(
      formatIngredientPriceMetadataHierarchy({
        provenanceLine: null,
        packagedPackLine: "450ml pack · €4.59",
      }),
    ).toEqual({
      secondaryLine: "450ml pack · €4.59",
      tertiaryLine: null,
    });
  });

  it("keeps supplier/date provenance for resolved €/un rows with pack metadata", () => {
    const presentation = formatOperationalPriceContext({
      source: "invoice_direct",
      supplier: "Beverage Supplier",
      date: "2026-05-21",
      unitCostEur: 0.89,
      costFields: { current_price: 10.68, purchase_quantity: 12, cost_base_unit: "un" },
      costSource: "invoice",
      costBaseUnit: "un",
    });
    const metadata = formatIngredientPriceMetadataHierarchy({
      provenanceLine: presentation.compactLine,
      packagedPackLine: "12x330ml pack · €10.68",
    });

    expect(presentation.compactLine).toBe("Beverage Supplier · 21 May 2026");
    expect(metadata).toEqual({
      secondaryLine: "Beverage Supplier · 21 May 2026",
      tertiaryLine: "12x330ml pack · €10.68",
    });
  });
});
