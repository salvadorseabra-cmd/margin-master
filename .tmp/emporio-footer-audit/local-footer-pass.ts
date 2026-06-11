import { cropBottomPortion } from "../../supabase/functions/extract-invoice/invoice-image-crop.ts";
import { callOpenAiJson } from "../../supabase/functions/extract-invoice/invoice-date-extraction.ts";
import { parseFooterMetadataExtraction } from "../../supabase/functions/extract-invoice/invoice-footer-metadata-parse.ts";

const PROMPT = await Deno.readTextFile(
  "../../supabase/functions/extract-invoice/invoice-footer-metadata-extraction.ts",
).then((t) => {
  const m = t.match(/const FOOTER_METADATA_EXTRACTION_SYSTEM_PROMPT = `([\s\S]*?)`\.trim\(\)/);
  return m?.[1] ?? "";
});

const imageDataUrl = await Deno.readTextFile(Deno.args[0] ?? ".tmp/emporio-footer-audit/emporio/invoice-full.b64.txt");
const croppedDataUrl = await cropBottomPortion(imageDataUrl);
const match = croppedDataUrl.match(/^data:image\/png;base64,(.+)$/);
if (match) {
  await Deno.writeFile(
    ".tmp/emporio-footer-audit/emporio/local-footer-crop.png",
    Uint8Array.from(atob(match[1]), (c) => c.charCodeAt(0)),
  );
}

const apiKey = Deno.env.get("OPENAI_API_KEY");
if (!apiKey) {
  console.log(JSON.stringify({ cropSaved: true, gpt: "skipped no key" }));
  Deno.exit(0);
}

const rawGptJson = await callOpenAiJson(apiKey, [
  { role: "system", content: PROMPT },
  {
    role: "user",
    content: [
      {
        type: "text",
        text:
          "Transcribe only the printed total, net subtotal, and VAT from this footer crop. Do not calculate or infer any value.",
      },
      { type: "image_url", image_url: { url: croppedDataUrl } },
    ],
  },
]);
const parsed = parseFooterMetadataExtraction(rawGptJson);
console.log(JSON.stringify({ rawGptJson, parsed }, null, 2));
