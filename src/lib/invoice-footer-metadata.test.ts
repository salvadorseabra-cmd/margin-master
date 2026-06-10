import { describe, expect, it } from "vitest";
import {
  FOOTER_TOTAL_FIXTURES,
  parseFooterMetadataExtraction,
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
    });
  });

  it("returns null for missing or non-numeric fields", () => {
    expect(parseFooterMetadataExtraction({ total: "292.70" })).toEqual({
      total: null,
      net_subtotal: null,
      vat: null,
    });
  });
});

describe("footer total fixtures", () => {
  it.each(FOOTER_TOTAL_FIXTURES)(
    "documents expected $label total €$total",
    ({ total }) => {
      expect(total).toBeGreaterThan(0);
    },
  );
});
