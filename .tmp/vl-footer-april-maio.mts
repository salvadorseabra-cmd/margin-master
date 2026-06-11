import { execSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const VL_REF = "bjhnlrgodcqoyzddbpbd";
const OUT_DIR = ".tmp/footer-validation-4dc40c3";
const DENO = ".tmp/deno/bin/deno";

const raw = execSync(`supabase projects api-keys --project-ref ${VL_REF} -o json`, {
  encoding: "utf8",
});
const anonKey = (JSON.parse(raw) as { name: string; api_key: string }[]).find(
  (k) => k.name === "anon",
)!.api_key;
const serviceKey = (JSON.parse(raw) as { name: string; api_key: string }[]).find(
  (k) => k.name === "service_role",
)!.api_key;
const sb = createClient(`https://${VL_REF}.supabase.co`, serviceKey, {
  auth: { persistSession: false },
});

mkdirSync(OUT_DIR, { recursive: true });

async function extract(label: string, path: string, mime: string) {
  const buf = readFileSync(path);
  const imageDataUrl = `data:${mime};base64,${buf.toString("base64")}`;
  const res = await fetch(`https://${VL_REF}.supabase.co/functions/v1/extract-invoice`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
    },
    body: JSON.stringify({ imageDataUrl }),
  });
  const body = await res.json();
  const safe = label.replace(/\s+/g, "-").toLowerCase();
  const imagePath = `${OUT_DIR}/${safe}-source.b64.txt`;
  writeFileSync(imagePath, imageDataUrl);
  const cropPath = `${OUT_DIR}/${safe}-footer-crop.png`;
  execSync(
    `${DENO} run --allow-read --allow-write --allow-net .tmp/vl-footer-crop-only.ts "${imagePath}" "${cropPath}"`,
    { encoding: "utf8", timeout: 120_000 },
  );
  return { label, path, status: res.status, cropPath, body };
}

// April candidates
copyFileSync(
  "/tmp/april-from-pdf.png",
  `${OUT_DIR}/april-sips-from-storage-pdf.png`,
);
const aprilResults = [];
aprilResults.push(
  await extract(
    "april-storage-pdf",
    ".tmp/aviludo-investigation/Aviludo_Historico_2026_04_with_total.pdf",
    "application/pdf",
  ),
);
aprilResults.push(
  await extract(
    "april-sips-png",
    `${OUT_DIR}/april-sips-from-storage-pdf.png`,
    "image/png",
  ),
);

// Maio — storage PNG + crop
const MAY = "3b4cb21f-8b3f-45f3-9f2d-6f15e9f438a2";
const { data: mayInv } = await sb
  .from("invoices")
  .select("file_url,total")
  .eq("id", MAY)
  .single();
const { data: maySigned } = await sb.storage
  .from("invoices")
  .createSignedUrl(mayInv!.file_url!, 300);
const mayBlob = await fetch(maySigned!.signedUrl).then((r) => r.blob());
const mayBuf = Buffer.from(await mayBlob.arrayBuffer());
const mayPath = `${OUT_DIR}/aviludo-maio-storage.png`;
writeFileSync(mayPath, mayBuf);
const maio = await extract("aviludo-maio", mayPath, "image/png");

const out = { aprilResults, maio, expectedApril: 370.17, expectedMaio: 330.42 };
writeFileSync(`${OUT_DIR}/april-maio-results.json`, JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
