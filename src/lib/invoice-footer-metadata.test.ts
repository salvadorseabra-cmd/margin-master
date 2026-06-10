import { describe, expect, it } from "vitest";
import {
  FOOTER_TOTAL_FIXTURES,
  parseFooterMetadataExtraction,
  validateFooterMetadataArithmetic,
} from "../../supabase/functions/extract-invoice/invoice-footer-metadata-parse";

describe("parseFooterMetadataExtraction", () => {
  it("maps numeric total, net_subtotal, and vat fields", () => {
    expect(
      parseFooterMetadataExtraction({
        total: 292.7,
        net_subtotal: 237.97,
        vat: 54.73,
      }),
    ).toEqual({
      total: 292.7,
      net_subtotal: 237.97,
      vat: 54.73,
      confidence: "high",
      validation_warning: null,
    });
  });

  it("returns null for missing or non-numeric fields", () => {
    expect(parseFooterMetadataExtraction({ total: "292.70" })).toEqual({
      total: null,
      net_subtotal: null,
      vat: null,
      confidence: null,
      validation_warning: null,
    });
  });
});

describe("validateFooterMetadataArithmetic", () => {
  it("marks high confidence when net_subtotal + vat ≈ total", () => {
    expect(
      validateFooterMetadataArithmetic({
        total: 292.7,
        net_subtotal: 237.97,
        vat: 54.73,
        confidence: null,
        validation_warning: null,
      }),
    ).toEqual({
      total: 292.7,
      net_subtotal: 237.97,
      vat: 54.73,
      confidence: "high",
      validation_warning: null,
    });
  });

  it("warns when total does not match net_subtotal + vat", () => {
    const result = validateFooterMetadataArithmetic({
      total: 170,
      net_subtotal: 237.97,
      vat: 54.73,
      confidence: null,
      validation_warning: null,
    });

    expect(result.confidence).toBe("low");
    expect(result.validation_warning).toMatch(/arithmetic mismatch/i);
    expect(result.total).toBe(170);
  });

  it("leaves confidence null when any field is missing", () => {
    expect(
      validateFooterMetadataArithmetic({
        total: 292.7,
        net_subtotal: null,
        vat: 54.73,
        confidence: null,
        validation_warning: null,
      }),
    ).toEqual({
      total: 292.7,
      net_subtotal: null,
      vat: 54.73,
      confidence: null,
      validation_warning: null,
    });
  });
});

describe("footer total fixtures", () => {
  it.each(FOOTER_TOTAL_FIXTURES)(
    "parses and validates $label expected totals",
    ({ total, net_subtotal, vat }) => {
      const parsed = parseFooterMetadataExtraction({
        total,
        net_subtotal,
        vat,
      });

      expect(parsed.total).toBe(total);
      expect(parsed.net_subtotal).toBe(net_subtotal);
      expect(parsed.vat).toBe(vat);
      expect(parsed.confidence).toBe("high");
      expect(parsed.validation_warning).toBeNull();
    },
  );
});
