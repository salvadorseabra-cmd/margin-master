export type FooterMetadataExtractionResult = {
  total: number | null;
  net_subtotal: number | null;
  vat: number | null;
  confidence: "high" | "low" | null;
  validation_warning: string | null;
};

export const FOOTER_TOTAL_FIXTURES = [
  {
    label: "Bidfood",
    total: 292.7,
    net_subtotal: 237.97,
    vat: 54.73,
  },
  {
    label: "Aviludo May",
    total: 330.42,
    net_subtotal: 268.63,
    vat: 61.79,
  },
  {
    label: "Aviludo April",
    total: 370.17,
    net_subtotal: 300.95,
    vat: 69.22,
  },
] as const;

const FOOTER_ARITHMETIC_TOLERANCE = 0.02;

export function parseFooterMetadataExtraction(
  parsed: Record<string, unknown>,
): FooterMetadataExtractionResult {
  return validateFooterMetadataArithmetic({
    total: typeof parsed.total === "number" ? parsed.total : null,
    net_subtotal:
      typeof parsed.net_subtotal === "number" ? parsed.net_subtotal : null,
    vat: typeof parsed.vat === "number" ? parsed.vat : null,
    confidence: null,
    validation_warning: null,
  });
}

/** Validation only — never mutates extracted totals. */
export function validateFooterMetadataArithmetic(
  result: FooterMetadataExtractionResult,
): FooterMetadataExtractionResult {
  const { total, net_subtotal, vat } = result;

  if (total == null || net_subtotal == null || vat == null) {
    return { ...result, confidence: null, validation_warning: null };
  }

  const expectedTotal = roundCurrency(net_subtotal + vat);
  const delta = Math.abs(expectedTotal - total);

  if (delta <= FOOTER_ARITHMETIC_TOLERANCE) {
    return { ...result, confidence: "high", validation_warning: null };
  }

  return {
    ...result,
    confidence: "low",
    validation_warning:
      `footer arithmetic mismatch: net_subtotal (${net_subtotal}) + vat (${vat}) = ${expectedTotal}, total = ${total}`,
  };
}

function roundCurrency(value: number): number {
  return Math.round(value * 100) / 100;
}
