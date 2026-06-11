/**
 * Compare Pass C on cropped vs uncropped Bocconcino invoice.
 */
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

const VL_REF = "bjhnlrgodcqoyzddbpbd";
const OUT_DIR = ".tmp/bocconcino-investigation";
const DENO = ".tmp/deno/bin/deno";

function projectKey(name: "anon" | "service_role"): string {
  const raw = execSync(
    `supabase projects api-keys --project-ref ${VL_REF} -o json`,
    { encoding: "utf8" },
  );
  return (JSON.parse(raw) as { name: string; api_key: string }[]).find(
    (k) => k.name === name,
  )!.api_key;
}

const anonKey = projectKey("anon");
const imageDataUrl = readFileSync(`${OUT_DIR}/invoice-dataurl.txt`, "utf8").trim();

async function extract(label: string, url: string) {
  const res = await fetch(`https://${VL_REF}.supabase.co/functions/v1/extract-invoice`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
    },
    body: JSON.stringify({ imageDataUrl: url }),
  });
  const body = await res.json();
  return { label, status: res.status, itemCount: body.items?.length ?? 0, names: (body.items ?? []).map((i: { name?: string }) => i.name), body };
}

// Save region above crop top (y=0..561) for OCR evidence
const aboveCropScript = `
import { readFileSync, writeFileSync } from "node:fs";
import { parseImageDataUrl } from "../../supabase/functions/extract-invoice/invoice-image-crop.ts";
import { Image } from "https://deno.land/x/imagescript@1.3.0/mod.ts";
const dataUrl = readFileSync(Deno.args[0], "utf8").trim();
const outDir = Deno.args[1];
const cropTop = Number(Deno.args[2]);
const { bytes } = parseImageDataUrl(dataUrl);
const image = await Image.decode(bytes);
const h = Math.min(cropTop, image.height);
const above = image.crop(0, 0, image.width, h);
writeFileSync(outDir + "/region-above-crop-top.png", await above.encode());
// Also save table header zone: y=400..650
const tableZone = image.crop(0, 400, image.width, Math.min(250, image.height - 400));
writeFileSync(outDir + "/table-zone-400-650.png", await tableZone.encode());
console.log("saved");
`;
writeFileSync(`${OUT_DIR}/above-crop.ts`, aboveCropScript);
execSync(
  `${DENO} run --allow-read --allow-write --allow-net ${OUT_DIR}/above-crop.ts "${OUT_DIR}/invoice-dataurl.txt" "${OUT_DIR}" 561`,
  { encoding: "utf8", cwd: process.cwd() },
);

const full = await extract("full-image", imageDataUrl);
writeFileSync(`${OUT_DIR}/extract-full-image.json`, JSON.stringify(full, null, 2));
console.log(JSON.stringify({ full: { itemCount: full.itemCount, names: full.names } }, null, 2));
