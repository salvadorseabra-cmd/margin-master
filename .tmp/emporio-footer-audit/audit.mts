/**
 * Emporio Italia footer extraction audit — read-only evidence collection.
 */
import { execSync } from "node:child_process";
import { writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const VL_REF = "bjhnlrgodcqoyzddbpbd";
const OUT_DIR = ".tmp/emporio-footer-audit";
const DENO = ".tmp/deno/bin/deno";

const INVOICES = {
  emporio: {
    label: "Emporio Italia",
    id: "17aa3591-ec98-4c21-89c9-5ae946bc97bb",
    expected: { total: 327.46, net_subtotal: 278.16, vat: 49.3 },
    search: "%emporio%italia%",
  },
  bidfood: {
    label: "Bidfood",
    id: "da472b7f-0fd9-4a26-a37c-80ad335f7f7e",
    expected: { total: 292.7, net_subtotal: 237.97, vat: 54.73 },
  },
  aviludoMay: {
    label: "Aviludo May",
    id: "3b4cb21f-8b3f-45f3-9f2d-6f15e9f438a2",
    expected: { total: 330.42, net_subtotal: 268.63, vat: 61.79 },
  },
} as const;

function projectKey(name: "anon" | "service_role"): string {
  const raw = execSync(
    `supabase projects api-keys --project-ref ${VL_REF} -o json`,
    { encoding: "utf8", timeout: 30_000 },
  );
  const row = (JSON.parse(raw) as { name: string; api_key: string }[]).find(
    (k) => k.name === name,
  );
  if (!row?.api_key) throw new Error(`missing ${name} key`);
  return row.api_key;
}

const serviceKey = projectKey("service_role");
const anonKey = projectKey("anon");
const sb = createClient(`https://${VL_REF}.supabase.co`, serviceKey, {
  auth: { persistSession: false },
});

mkdirSync(OUT_DIR, { recursive: true });

async function fetchImageDataUrl(fileUrl: string): Promise<string> {
  const { data: signed, error } = await sb.storage
    .from("invoices")
    .createSignedUrl(fileUrl, 300);
  if (error || !signed?.signedUrl) throw new Error(`sign: ${error?.message}`);
  const blob = await fetch(signed.signedUrl, { signal: AbortSignal.timeout(60_000) }).then(
    (r) => r.blob(),
  );
  const buf = Buffer.from(await blob.arrayBuffer());
  return `data:${blob.type || "image/png"};base64,${buf.toString("base64")}`;
}

async function invokeExtract(imageDataUrl: string) {
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
  return { status: res.status, body: await res.json() };
}

function runDeno(script: string, args: string[], timeout = 120_000): string {
  return execSync(`${DENO} run --allow-read --allow-write --allow-net --allow-env ${script} ${args.map((a) => `"${a}"`).join(" ")}`, {
    encoding: "utf8",
    timeout,
    env: { ...process.env, OPENAI_API_KEY: process.env.OPENAI_API_KEY ?? "" },
  }).trim();
}

async function auditInvoice(key: keyof typeof INVOICES) {
  const spec = INVOICES[key];
  const subDir = `${OUT_DIR}/${key}`;
  mkdirSync(subDir, { recursive: true });

  const { data: invoice, error: invErr } = await sb
    .from("invoices")
    .select("id, supplier_name, total, invoice_date, file_url, created_at, user_id")
    .eq("id", spec.id)
    .single();

  const { data: items, error: itemsErr } = await sb
    .from("invoice_items")
    .select("id, name, quantity, unit, unit_price, total")
    .eq("invoice_id", spec.id)
    .order("created_at", { ascending: true });

  const itemsSum = (items ?? []).reduce((s, it) => s + Number(it.total ?? 0), 0);

  const dbRecord = {
    queryError: invErr?.message ?? itemsErr?.message ?? null,
    invoice,
    itemsCount: items?.length ?? 0,
    itemsSum: Math.round(itemsSum * 100) / 100,
    items,
  };
  writeFileSync(`${subDir}/db-record.json`, JSON.stringify(dbRecord, null, 2));

  if (!invoice?.file_url) {
    return { key, label: spec.label, error: "no file_url", dbRecord };
  }

  const imageDataUrl = await fetchImageDataUrl(invoice.file_url);
  writeFileSync(`${subDir}/invoice-full.b64.txt`, imageDataUrl);

  const cropEvidence = JSON.parse(
    runDeno(".tmp/emporio-footer-audit/footer-crop-audit.ts", [
      `${subDir}/invoice-full.b64.txt`,
      subDir,
    ]),
  );

  let ocrResult: unknown = { skipped: true };
  try {
    const ocrOut = runDeno(
      ".tmp/emporio-footer-audit/footer-ocr-only.ts",
      [`${subDir}/footer-crop.png`],
      180_000,
    );
    ocrResult = JSON.parse(ocrOut);
    writeFileSync(`${subDir}/footer-ocr.json`, JSON.stringify(ocrResult, null, 2));
  } catch (e) {
    ocrResult = { error: String(e) };
    writeFileSync(`${subDir}/footer-ocr.json`, JSON.stringify(ocrResult, null, 2));
  }

  let footerPass: unknown = { skipped: true };
  try {
    const passOut = runDeno(
      ".tmp/vl-footer-pass-only.ts",
      [`${subDir}/invoice-full.b64.txt`],
      180_000,
    );
    footerPass = JSON.parse(passOut);
    writeFileSync(`${subDir}/footer-gpt-local.json`, JSON.stringify(footerPass, null, 2));
  } catch (e) {
    footerPass = { error: String(e) };
    writeFileSync(`${subDir}/footer-gpt-local.json`, JSON.stringify(footerPass, null, 2));
  }

  const extract = await invokeExtract(imageDataUrl);
  writeFileSync(
    `${subDir}/extract-invoice-response.json`,
    JSON.stringify(extract, null, 2),
  );

  const containsTotals = assessCropContainsTotals(cropEvidence, spec.expected);

  return {
    key,
    label: spec.label,
    id: spec.id,
    storagePath: invoice.file_url,
    db: {
      total: invoice.total,
      supplier: invoice.supplier_name,
      invoice_date: invoice.invoice_date,
      itemsCount: items?.length ?? 0,
      itemsSum: Math.round(itemsSum * 100) / 100,
    },
    expected: spec.expected,
    crop: cropEvidence,
    containsTotals,
    ocr: ocrResult,
    footerPassLocal: footerPass,
    extract: {
      status: extract.status,
      total: extract.body?.total ?? null,
      supplier: extract.body?.supplier ?? null,
      itemCount: extract.body?.items?.length ?? 0,
    },
  };
}

function assessCropContainsTotals(
  crop: { footerCropStartY: number; imageHeight: number; tableBounds?: { bottom: number } },
  expected: { total: number; net_subtotal: number; vat: number },
): { verdict: "YES" | "NO" | "UNKNOWN"; reason: string } {
  // Emporio: grey totals box is above tableBounds.bottom (~851 on 1124px page)
  const anchoredStart = crop.footerCropStartY;
  const tableBottom = crop.tableBounds?.bottom;
  if (tableBottom != null && anchoredStart >= tableBottom) {
    return {
      verdict: "NO",
      reason: `Footer crop starts at y=${anchoredStart} (at/after table bottom ${tableBottom}); Emporio-style totals sit above this edge`,
    };
  }
  return {
    verdict: "UNKNOWN",
    reason: "Geometry alone inconclusive — check OCR for expected values",
  };
}

// Emporio search verification
const { data: emporioSearch } = await sb
  .from("invoices")
  .select("id, supplier_name, total, invoice_date, file_url, created_at")
  .ilike("supplier_name", "%emporio%italia%")
  .order("created_at", { ascending: false });

writeFileSync(
  `${OUT_DIR}/emporio-search.json`,
  JSON.stringify(emporioSearch, null, 2),
);

const results = [];
for (const key of ["emporio", "bidfood", "aviludoMay"] as const) {
  console.log(`\n=== Auditing ${key} ===`);
  results.push(await auditInvoice(key));
}

writeFileSync(`${OUT_DIR}/audit-summary.json`, JSON.stringify(results, null, 2));
console.log("\n=== AUDIT COMPLETE ===");
console.log(JSON.stringify(results, null, 2));
