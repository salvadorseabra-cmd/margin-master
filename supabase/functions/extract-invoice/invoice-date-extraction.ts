import { cropTopPortion } from "./invoice-image-crop.ts";
import { resolveIssueDateFromExtraction } from "./invoice-date-resolver.ts";

const DATE_EXTRACTION_SYSTEM_PROMPT = `
You extract ONLY the invoice ISSUE date from restaurant invoice images.

Return ONLY valid JSON with this exact structure:

{
  "dates": [
    {
      "label": string,
      "value": string,
      "region": "header" | "body" | "footer"
    }
  ],
  "invoice_date": string | null
}

CRITICAL DATE RULES:

- invoice_date must be the document ISSUE date (when the invoice was issued).
- Highest priority labels: "DATA", "Data Emissão", "Data Documento", "Invoice Date".
- These labels usually appear in the header block near the supplier and document number.
- Use due dates ("Vencimento", "Due Date", "Payment Due") ONLY when no issue date is visible.
- IGNORE compliance stamps, TALÃO DE CONTROLO references, certification dates, and footer legal text.
- IGNORE transport timestamps unless they are the only visible issue date.
- NEVER invent a date. If uncertain, return invoice_date = null.
- Return dates exactly as printed (DD/MM/YYYY or YYYY-MM-DD).
`.trim();

type OpenAiMessage = {
  role: "system" | "user";
  content: string | Array<{ type: string; text?: string; image_url?: { url: string } }>;
};

export type OpenAiResponseFormat =
  | { type: "json_object" }
  | {
      type: "json_schema";
      json_schema: {
        name: string;
        strict: boolean;
        schema: Record<string, unknown>;
      };
    };

/** Shared sampling controls for all invoice OCR passes (gpt-4.1 vision). */
export const OPENAI_OCR_MODEL = "gpt-4.1";
export const OPENAI_OCR_TEMPERATURE = 0;
/** Fixed seed for reproducible OCR; supported on gpt-4.1 chat completions. */
export const OPENAI_OCR_SEED = 42;

export async function callOpenAiJson(
  apiKey: string,
  messages: OpenAiMessage[],
  responseFormat: OpenAiResponseFormat = { type: "json_object" },
): Promise<Record<string, unknown>> {
  console.log("[invoice-ocr] openai-request", {
    model: OPENAI_OCR_MODEL,
    temperature: OPENAI_OCR_TEMPERATURE,
    top_p: null,
    seed: OPENAI_OCR_SEED,
    response_format: responseFormat.type,
  });

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: OPENAI_OCR_MODEL,
      temperature: OPENAI_OCR_TEMPERATURE,
      seed: OPENAI_OCR_SEED,
      response_format: responseFormat,
      messages,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`OpenAI request failed (${response.status}): ${body.slice(0, 500)}`);
  }

  const result = await response.json();
  const content = result?.choices?.[0]?.message?.content;
  if (!content || typeof content !== "string") {
    throw new Error("No structured output from model");
  }

  return JSON.parse(content) as Record<string, unknown>;
}

export async function extractIssueDateFromImage(
  imageDataUrl: string,
  apiKey: string,
): Promise<string | null> {
  const croppedDataUrl = await cropTopPortion(imageDataUrl);
  const parsed = await callOpenAiJson(apiKey, [
    { role: "system", content: DATE_EXTRACTION_SYSTEM_PROMPT },
    {
      role: "user",
      content: [
        {
          type: "text",
          text:
            "Extract the invoice issue date from this restaurant invoice image. Ignore footer compliance dates.",
        },
        { type: "image_url", image_url: { url: croppedDataUrl } },
      ],
    },
  ]);

  const fallback =
    typeof parsed.invoice_date === "string"
      ? parsed.invoice_date
      : typeof parsed.invoiceDate === "string"
        ? parsed.invoiceDate
        : null;

  return resolveIssueDateFromExtraction(parsed, fallback);
}
