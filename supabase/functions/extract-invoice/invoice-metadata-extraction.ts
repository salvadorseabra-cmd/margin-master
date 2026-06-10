import { cropTopPortion } from "./invoice-image-crop.ts";
import { callOpenAiJson } from "./invoice-date-extraction.ts";

const METADATA_EXTRACTION_SYSTEM_PROMPT = `
You extract ONLY the supplier from restaurant invoice images.

Return ONLY valid JSON with this exact structure:

{
  "supplier": string | null
}

CRITICAL RULES:

- supplier: legal supplier / issuer name on the document (company name near logo).
- NEVER invent values. If not visible, return null.
- Do NOT extract invoice_date, invoice_number, totals, VAT, or line items.
`.trim();

export type MetadataExtractionResult = {
  supplier: string | null;
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
          text: "Extract only the supplier name from this restaurant invoice image.",
        },
        { type: "image_url", image_url: { url: croppedDataUrl } },
      ],
    },
  ]);

  return {
    supplier: typeof parsed.supplier === "string" ? parsed.supplier : null,
  };
}
