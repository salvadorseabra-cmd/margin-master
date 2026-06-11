/**
 * Validate Mammafiore white-header geometry fix on VL after deploy.
 */
import { execSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const VL_REF = "bjhnlrgodcqoyzddbpbd";
const OUT_DIR = ".tmp/mammafiore-fix";
const DENO = ".tmp/deno/bin/deno";

const INVOICES = [
  {
    id: "36c99d19-6f9f-413f-8c2d-ae3526291a2d",
    label: "Mammafiore",
    expectedRows: 8,
    expectedTotal: 415.96,
  },
  {
    id: "bocconcino",
    label: "Bocconcino",
    localPng: ".tmp/bocconcino-investigation/invoice-full.png",
    expectedRows: 7,
  },
  {
    id: "bidfood",
    label: "Bidfood",
    localPng: ".tmp/bidfood-ovo.png",
    expectedRows: null,
  },
] as const;

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
const serviceKey = projectKey("service_role");
const sb = createClient(`https://${VL_REF}.supabase.co`, serviceKey, {
  auth: { persistSession: false },
});

mkdirSync(OUT_DIR, { recursive: true });

async function extractFromDataUrl(imageDataUrl: string) {
  const extractRes = await fetch(
    `https://${VL_REF}.supabase.co/functions/v1/extract-invoice`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
      },
      body: JSON.stringify({ imageDataUrl }),
    },
  );
  const extracted = await extractRes.json();
  if (!extractRes.ok) {
    throw new Error(`extract ${extractRes.status}: ${JSON.stringify(extracted)}`);
  }
  return extracted;
}

function localBounds(pngPath: string) {
  const out = execSync(
    `${DENO} eval --allow-read '
import { readFileSync } from "node:fs";
import { Image } from "https://deno.land/x/imagescript@1.3.0/mod.ts";
import { detectTableBounds } from "./supabase/functions/extract-invoice/invoice-image-crop.ts";
const image = await Image.decode(readFileSync("${pngPath}"));
const b = detectTableBounds(image);
console.log(JSON.stringify({ top: b.top, headerTop: b.headerTop, bottom: b.bottom }));
'`,
    { encoding: "utf8", cwd: process.cwd() },
  );
  return JSON.parse(out.trim());
}

const results: Record<string, unknown>[] = [];

for (const inv of INVOICES) {
  let imageDataUrl: string;
  if ("localPng" in inv && inv.localPng) {
    const buf = readFileSync(inv.localPng);
    imageDataUrl = `data:image/png;base64,${buf.toString("base64")}`;
  } else {
    const { data: invoice } = await sb
      .from("invoices")
      .select("file_url")
      .eq("id", inv.id)
      .single();
    const { data: signed } = await sb.storage
      .from("invoices")
      .createSignedUrl(invoice!.file_url!, 600);
    const buf = Buffer.from(await fetch(signed!.signedUrl).then((r) => r.arrayBuffer()));
    imageDataUrl = `data:${buf[0] === 0x25 ? "application/pdf" : "image/png"};base64,${buf.toString("base64")}`;
    writeFileSync(`${OUT_DIR}/${inv.label.toLowerCase()}-full.png`, buf);
  }

  const extracted = await extractFromDataUrl(imageDataUrl);
  const items = extracted.items ?? [];
  const row = {
    label: inv.label,
    extractedRows: items.length,
    expectedRows: inv.expectedRows,
    total: extracted.total,
    names: items.map((it: { name?: string }) => it.name),
    localBounds: "localPng" in inv && inv.localPng
      ? localBounds(inv.localPng)
      : localBounds(`${OUT_DIR}/${inv.label.toLowerCase()}-full.png`),
  };
  results.push(row);
  writeFileSync(
    `${OUT_DIR}/${inv.label.toLowerCase()}-extract.json`,
    JSON.stringify(extracted, null, 2),
  );
}

const summary = {
  validatedAt: new Date().toISOString(),
  cropBounds: {
    Mammafiore: { beforeTop: 622, afterTop: localBounds(".tmp/mammafiore-investigation/invoice-full.png").top },
    Bocconcino: { beforeTop: 561, afterTop: localBounds(".tmp/bocconcino-investigation/invoice-full.png").top },
    Bidfood: { beforeTop: 437, afterTop: localBounds(".tmp/bidfood-ovo.png").top },
    AviludoMay: { beforeTop: 218, afterTop: localBounds(".tmp/aviludo-investigation/reference_3b4cb21f_scan.png").top },
    Emporio: { beforeTop: 456, afterTop: localBounds(".tmp/emporio-footer-audit/emporio/invoice-full.png").top },
  },
  extraction: results,
};

writeFileSync(`${OUT_DIR}/summary.json`, JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
