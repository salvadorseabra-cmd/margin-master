/** OCR footer crop only — raw text + monetary values, no structured extraction. */
import { callOpenAiJson } from "../../supabase/functions/extract-invoice/invoice-date-extraction.ts";

const PROMPT = `You are an OCR transcriber. Read ALL visible text in this invoice footer image.

Return ONLY valid JSON:
{
  "raw_text": string,
  "monetary_values": { "label_or_context": string, "value": number }[]
}

Rules:
- raw_text: newline-separated transcription of every visible line, preserving order.
- monetary_values: every euro amount you can read, with brief context (nearby label).
- Copy numbers exactly as printed. Include decimals.
- Do NOT calculate or infer missing values.`;

const cropPath = Deno.args[0];
if (!cropPath) {
  console.error("usage: footer-ocr-only.ts <footer-crop.png>");
  Deno.exit(1);
}

const apiKey = Deno.env.get("OPENAI_API_KEY");
if (!apiKey) {
  console.log(JSON.stringify({ skipped: true, reason: "OPENAI_API_KEY not set" }));
  Deno.exit(0);
}

const bytes = await Deno.readFile(cropPath);
let binary = "";
const chunk = 0x8000;
for (let i = 0; i < bytes.length; i += chunk) {
  binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
}
const dataUrl = `data:image/png;base64,${btoa(binary)}`;

const result = await callOpenAiJson(apiKey, [
  { role: "system", content: PROMPT },
  {
    role: "user",
    content: [
      { type: "text", text: "Transcribe all visible text and monetary values from this footer crop." },
      { type: "image_url", image_url: { url: dataUrl } },
    ],
  },
]);

console.log(JSON.stringify(result, null, 2));
