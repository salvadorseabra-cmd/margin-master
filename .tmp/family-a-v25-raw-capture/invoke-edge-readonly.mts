/**
 * READ-ONLY — invoke VL extract-invoice (no DB writes).
 * Saves final API response only (no raw GPT in response body).
 */
import { execSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const VL = "bjhnlrgodcqoyzddbpbd";
const INVOICE_ID = "f0aa5a08-86a3-4938-99f0-711e86073968";
const OUT = ".tmp/family-a-v25-raw-capture";

const keys = JSON.parse(
  execSync(`supabase projects api-keys --project-ref ${VL} -o json`, { encoding: "utf8" }),
) as { name: string; api_key: string }[];
const sk = keys.find((k) => k.name === "service_role")!.api_key;
const ak = keys.find((k) => k.name === "anon")!.api_key;
const sb = createClient(`https://${VL}.supabase.co`, sk, { auth: { persistSession: false } });

const deployVersion = (
  JSON.parse(execSync(`supabase functions list --project-ref ${VL} -o json`, { encoding: "utf8" })) as Array<{
    slug: string;
    version: number;
  }>
).find((f) => f.slug === "extract-invoice")?.version;

mkdirSync(OUT, { recursive: true });

const imagePath = ".tmp/geometry-audit/images/f0aa5a08-86a3-4938-99f0-711e86073968.png";
const buf = readFileSync(imagePath);
const imageDataUrl = `data:image/png;base64,${buf.toString("base64")}`;
writeFileSync(`${OUT}/image-data-url.txt`, imageDataUrl);

const res = await fetch(`https://${VL}.supabase.co/functions/v1/extract-invoice`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    apikey: ak,
    Authorization: `Bearer ${ak}`,
  },
  body: JSON.stringify({ imageDataUrl }),
  signal: AbortSignal.timeout(180_000),
});

const body = await res.json();
const pick = (pattern: RegExp) =>
  (body.items ?? []).find((it: { name?: string }) => pattern.test(String(it.name ?? ""))) ?? null;

const result = {
  capturedAt: new Date().toISOString(),
  invoiceId: INVOICE_ID,
  deployVersion,
  status: res.status,
  note: "extract-invoice returns post-table-pass + finalize only; raw GPT not in response",
  ricotta: pick(/ricotta/i),
  mezzi: pick(/mezzi paccheri/i),
  full: body,
};

writeFileSync(`${OUT}/edge-invoke-final.json`, JSON.stringify(result, null, 2));
console.log(JSON.stringify({ deployVersion, status: res.status, ricotta: result.ricotta, mezzi: result.mezzi }, null, 2));
