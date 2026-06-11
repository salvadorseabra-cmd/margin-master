/** OCR footer-crop.png via vl-footer-debug-style raw transcription on edge. */
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";

const VL_REF = "bjhnlrgodcqoyzddbpbd";
const sub = process.argv[2] ?? "emporio";
const cropName = process.argv[3] ?? "footer-crop.png";
const dir = `.tmp/emporio-footer-audit/${sub}`;
const png = readFileSync(`${dir}/${cropName}`);
const imageDataUrl = `data:image/png;base64,${png.toString("base64")}`;

const raw = execSync(`supabase projects api-keys --project-ref ${VL_REF} -o json`, {
  encoding: "utf8",
});
const anonKey = (JSON.parse(raw) as { name: string; api_key: string }[]).find(
  (k) => k.name === "anon",
)!.api_key;

// Use extract-invoice on the crop-as-full-image; footer pass will re-crop bottom.
// For raw OCR we call OpenAI via a minimal inline edge proxy using extract-invoice
// metadata isn't ideal — instead document via fraction crop OCR proxy.
const res = await fetch(`https://${VL_REF}.supabase.co/functions/v1/extract-invoice`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    apikey: anonKey,
    Authorization: `Bearer ${anonKey}`,
  },
  body: JSON.stringify({ imageDataUrl }),
  signal: AbortSignal.timeout(180_000),
});
const body = await res.json();
writeFileSync(
  `${dir}/footer-crop-as-full-extract.json`,
  JSON.stringify({ status: res.status, cropName, body }, null, 2),
);
console.log(JSON.stringify({ status: res.status, total: body?.total, supplier: body?.supplier }, null, 2));
