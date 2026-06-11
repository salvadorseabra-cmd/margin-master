/** OCR ONLY a row crop — raw text, no structured extraction. */
import { callOpenAiJson } from "../../supabase/functions/extract-invoice/invoice-date-extraction.ts";

const PROMPT = `You are an OCR transcriber. Read ALL visible text in this single invoice table row image.

Return ONLY valid JSON:
{
  "raw_text": string
}

Rules:
- raw_text: single-line transcription of every visible character in the row, left to right.
- Copy numbers and punctuation EXACTLY as printed (comma vs period matters).
- Include product code, description, quantities, prices — everything visible.
- Do NOT interpret, normalize, or fix typos.`;

const cropPath = Deno.args[0] ?? ".tmp/ginger-beer-ground-truth/ginger-beer-row-crop.png";
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
      { type: "text", text: "Transcribe all visible text in this invoice row exactly." },
      { type: "image_url", image_url: { url: dataUrl } },
    ],
  },
]);

console.log(JSON.stringify(result, null, 2));
