export type FooterMetadataExtractionResult = {
  total: number | null;
  net_subtotal: number | null;
  vat: number | null;
};

export const FOOTER_TOTAL_FIXTURES = [
  { label: "Bidfood", total: 292.7 },
  { label: "Aviludo May", total: 330.42 },
  { label: "Aviludo April", total: 370.17 },
] as const;

export function parseFooterMetadataExtraction(
  parsed: Record<string, unknown>,
): FooterMetadataExtractionResult {
  return {
    total: typeof parsed.total === "number" ? parsed.total : null,
    net_subtotal:
      typeof parsed.net_subtotal === "number" ? parsed.net_subtotal : null,
    vat: typeof parsed.vat === "number" ? parsed.vat : null,
  };
}
