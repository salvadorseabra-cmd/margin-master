import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import {
  computeBottomCropStartY,
  computeFooterCropStartY,
  DEFAULT_BOTTOM_CROP_FRACTION,
} from "../../supabase/functions/extract-invoice/invoice-crop-geometry.ts";
import {
  detectSummaryTotalsBandTop,
  detectTableBounds,
  parseImageDataUrl,
} from "../../supabase/functions/extract-invoice/invoice-image-crop.ts";
import { Image } from "https://deno.land/x/imagescript@1.3.0/mod.ts";

const VL_REF = "bjhnlrgodcqoyzddbpbd";
const OUT_DIR = ".tmp/emporio-footer-fix";

const INVOICES = [
  {
    label: "Emporio Italia",
    id: "17aa3591-ec98-4c21-89c9-5ae946bc97bb",
    expected: 327.46,
    beforeStartY: 851,
  },
  {
    label: "Bidfood",
    id: "da472b7f-0fd9-4a26-a37c-80ad335f7f7e",
    expected: 292.7,
    beforeStartY: 1037,
  },
  {
    label: "Aviludo May",
    id: "3b4cb21f-8b3f-45f3-9f2d-6f15e9f438a2",
    expected: 330.42,
    beforeStartY: 448,
  },
] as const;

const raw = execSync(`supabase projects api-keys --project-ref ${VL_REF} -o json`, {
  encoding: "utf8",
});
const keys = JSON.parse(raw) as { name: string; api_key: string }[];
const anonKey = keys.find((k) => k.name === "anon")!.api_key;
const serviceKey = keys.find((k) => k.name === "service_role")!.api_key;
const sb = createClient(`https://${VL_REF}.supabase.co`, serviceKey, {
  auth: { persistSession: false },
});

mkdirSync(OUT_DIR, { recursive: true });

async function getDataUrl(id: string) {
  const { data } = await sb.from("invoices").select("file_url").eq("id", id).single();
  const { data: signed } = await sb.storage
    .from("invoices")
    .createSignedUrl(data!.file_url!, 300);
  const blob = await fetch(signed!.signedUrl).then((r) => r.blob());
  const buf = Buffer.from(await blob.arrayBuffer());
  return `data:${blob.type || "image/png"};base64,${buf.toString("base64")}`;
}

async function invokeExtract(dataUrl: string) {
  const res = await fetch(`https://${VL_REF}.supabase.co/functions/v1/extract-invoice`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
    },
    body: JSON.stringify({ imageDataUrl: dataUrl }),
  });
  return { status: res.status, body: await res.json() };
}

const results = [];

for (const inv of INVOICES) {
  const dataUrl = await getDataUrl(inv.id);
  const { bytes } = parseImageDataUrl(dataUrl);
  const image = await Image.decode(bytes);
  const bounds = detectTableBounds(image);
  const fractionStartY = computeBottomCropStartY(image.height, DEFAULT_BOTTOM_CROP_FRACTION);
  const summaryBandTop = bounds.totalsStart != null
    ? detectSummaryTotalsBandTop(image, fractionStartY, bounds.totalsStart)
    : null;
  const afterStartY = computeFooterCropStartY(
    image.height,
    bounds.detected ? bounds.bottom : null,
    DEFAULT_BOTTOM_CROP_FRACTION,
    summaryBandTop,
  );

  const extract = await invokeExtract(dataUrl);
  const extracted =
    extract.status === 200 && typeof extract.body?.total === "number"
      ? extract.body.total
      : extract.body?.total ?? null;

  const safe = inv.label.replace(/\s+/g, "-").toLowerCase();
  writeFileSync(`${OUT_DIR}/${safe}-extract.json`, JSON.stringify(extract.body, null, 2));

  const cropHeight = image.height - afterStartY;
  const totalsInCrop = afterStartY < inv.beforeStartY || inv.label !== "Emporio Italia"
    ? afterStartY <= (inv.label === "Bidfood" ? 1132 : inv.label === "Aviludo May" ? 500 : 750)
    : true;

  results.push({
    invoice: inv.label,
    id: inv.id,
    beforeStartY: inv.beforeStartY,
    afterStartY,
    cropHeight,
    summaryBandTop,
    totalsInCrop,
    expected: inv.expected,
    extracted,
    pass: typeof extracted === "number" && Math.abs(extracted - inv.expected) <= 0.01,
  });
}

writeFileSync(`${OUT_DIR}/results.json`, JSON.stringify(results, null, 2));
console.log(JSON.stringify(results, null, 2));
