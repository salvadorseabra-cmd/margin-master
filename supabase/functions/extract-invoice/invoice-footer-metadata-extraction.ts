import { cropBottomPortion } from "./invoice-image-crop.ts";
import { callOpenAiJson } from "./invoice-date-extraction.ts";
import {
  parseFooterMetadataExtraction,
  type FooterMetadataExtractionResult,
} from "./invoice-footer-metadata-parse.ts";

export type { FooterMetadataExtractionResult } from "./invoice-footer-metadata-parse.ts";
export { parseFooterMetadataExtraction } from "./invoice-footer-metadata-parse.ts";

const FOOTER_METADATA_EXTRACTION_SYSTEM_PROMPT = `
You extract ONLY invoice totals from the footer / summary section of restaurant invoice images.

Return ONLY valid JSON with this exact structure:

{
  "total": number | null,
  "net_subtotal": number | null,
  "vat": number | null
}

CRITICAL RULES:

- total: document amount to pay (VALOR A PAGAR / TOTAL DO DOCUMENTO / Amount Due) — numeric only, no currency symbol.
- net_subtotal: net merchandise value before tax (VALOR LÍQUIDO / Base incidência merchandise) when visible — numeric only.
- vat: total VAT / IVA amount when visible — numeric only.
- NEVER invent values. If not visible, return null.
- Do NOT extract supplier, invoice_date, invoice_number, or line items.
- IGNORE compliance stamps, TALÃO DE CONTROLO references, and footer legal text.
`.trim();

export async function extractFooterMetadataFromImage(
  imageDataUrl: string,
  apiKey: string,
): Promise<FooterMetadataExtractionResult> {
  const croppedDataUrl = await cropBottomPortion(imageDataUrl);
  const parsed = await callOpenAiJson(apiKey, [
    { role: "system", content: FOOTER_METADATA_EXTRACTION_SYSTEM_PROMPT },
    {
      role: "user",
      content: [
        {
          type: "text",
          text:
            "Extract only the invoice total, net subtotal, and VAT from this footer crop.",
        },
        { type: "image_url", image_url: { url: croppedDataUrl } },
      ],
    },
  ]);

  return parseFooterMetadataExtraction(parsed);
}
