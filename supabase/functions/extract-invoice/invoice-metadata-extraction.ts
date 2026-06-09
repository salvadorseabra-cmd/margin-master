import { cropTopPortion } from "./invoice-image-crop.ts";
import { callOpenAiJson } from "./invoice-date-extraction.ts";

const METADATA_EXTRACTION_SYSTEM_PROMPT = `
You extract ONLY supplier and total from restaurant invoice images.

Return ONLY valid JSON with this exact structure:

{
  "supplier": string | null,
  "total": number | null,
  "net_subtotal": number | null
}

CRITICAL RULES:

- supplier: legal supplier / issuer name on the document (company name near logo).
- total: document amount to pay (VALOR A PAGAR / TOTAL DO DOCUMENTO / Amount Due) — numeric only, no currency symbol.
- net_subtotal: net merchandise value before tax (VALOR LÍQUIDO / Base incidência merchandise) when visible — numeric only.
- NEVER invent values. If not visible, return null.
- Do NOT extract invoice_date, invoice_number, VAT breakdown, or line items.
`.trim();

export type MetadataExtractionResult = {
  supplier: string | null;
  total: number | null;
  net_subtotal: number | null;
};

export async function extractMetadataFromImage(
  imageDataUrl: string,
  apiKey: string,
): Promise<MetadataExtractionResult> {
  const croppedDataUrl = await cropTopPortion(imageDataUrl, 0.83);
  const parsed = await callOpenAiJson(apiKey, [
    { role: "system", content: METADATA_EXTRACTION_SYSTEM_PROMPT },
    {
      role: "user",
      content: [
        {
          type: "text",
          text: "Extract only the supplier name and total amount from this restaurant invoice image.",
        },
        { type: "image_url", image_url: { url: croppedDataUrl } },
      ],
    },
  ]);

  return {
    supplier: typeof parsed.supplier === "string" ? parsed.supplier : null,
    total: typeof parsed.total === "number" ? parsed.total : null,
    net_subtotal:
      typeof parsed.net_subtotal === "number" ? parsed.net_subtotal : null,
  };
}
