import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const VL_REF = "bjhnlrgodcqoyzddbpbd";
const OUT = ".tmp/footer-validation-4dc40c3";
const DENO = ".tmp/deno/bin/deno";
const APRIL_ID = "c2f52357-0f80-491a-ba14-c97ff4837472";

const raw = execSync(`supabase projects api-keys --project-ref ${VL_REF} -o json`, {
  encoding: "utf8",
});
const keys = JSON.parse(raw) as { name: string; api_key: string }[];
const anon = keys.find((k) => k.name === "anon")!.api_key;
const service = keys.find((k) => k.name === "service_role")!.api_key;
const sb = createClient(`https://${VL_REF}.supabase.co`, service, {
  auth: { persistSession: false },
});

async function call(fn: string, dataUrl: string) {
  const res = await fetch(`https://${VL_REF}.supabase.co/functions/v1/${fn}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: anon,
      Authorization: `Bearer ${anon}`,
    },
    body: JSON.stringify({ imageDataUrl: dataUrl }),
  });
  return { status: res.status, body: await res.json() };
}

const candidates = [
  {
    label: "april-sips-from-storage-pdf",
    path: `${OUT}/april-sips-from-storage-pdf.png`,
    mime: "image/png",
    note: "sips conversion of VL storage PDF",
  },
  {
    label: "april-historico-png-fixture",
    path: ".tmp/aviludo-investigation/Aviludo_Historico_2026_04_with_total.pdf.png",
    mime: "image/png",
    note: "local historico PNG fixture (not invoice scan)",
  },
];

const results = [];
for (const c of candidates) {
  const buf = readFileSync(c.path);
  const dataUrl = `data:${c.mime};base64,${buf.toString("base64")}`;
  const extract = await call("extract-invoice", dataUrl);
  const footer = await call("vl-footer-debug", dataUrl);
  const b64path = `${OUT}/${c.label}.b64.txt`;
  writeFileSync(b64path, dataUrl);
  let cropPath: string | null = null;
  try {
    cropPath = `${OUT}/${c.label}-footer-crop.png`;
    execSync(
      `${DENO} run --allow-read --allow-write --allow-net .tmp/vl-footer-crop-only.ts "${b64path}" "${cropPath}"`,
      { encoding: "utf8", timeout: 120_000 },
    );
  } catch {
    cropPath = null;
  }
  results.push({ ...c, extract, footer, cropPath });
}

console.log(JSON.stringify({ expected: 370.17, results }, null, 2));
