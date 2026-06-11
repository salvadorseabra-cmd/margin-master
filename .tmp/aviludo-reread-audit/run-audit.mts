/**
 * Read-only Aviludo April re-read investigation.
 */
import { execSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const VL_REF = "bjhnlrgodcqoyzddbpbd";
const AVILUDO_APRIL_ID = "c2f52357-0f80-491a-ba14-c97ff4837472";
const OUT_DIR = ".tmp/aviludo-reread-audit";

function projectKey(name: "anon" | "service_role"): string {
  const raw = execSync(`supabase projects api-keys --project-ref ${VL_REF} -o json`, {
    encoding: "utf8",
    timeout: 60_000,
  });
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

async function invokeExtract(imageDataUrl: string) {
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
  return { status: res.status, body };
}

async function fetchBlob(fileUrl: string) {
  const { data: signed, error } = await sb.storage
    .from("invoices")
    .createSignedUrl(fileUrl, 300);
  if (error || !signed?.signedUrl) throw new Error(`signed url: ${error?.message}`);
  const res = await fetch(signed.signedUrl);
  const blob = await res.blob();
  return { blob, signedUrl: signed.signedUrl, contentType: res.headers.get("content-type") };
}

const { data: invoice, error: invErr } = await sb
  .from("invoices")
  .select("id, supplier_name, total, invoice_date, file_url, created_at, user_id")
  .eq("id", AVILUDO_APRIL_ID)
  .single();

const { data: dbItems, error: itemsErr } = await sb
  .from("invoice_items")
  .select("id, name, quantity, unit, unit_price, total, created_at")
  .eq("invoice_id", AVILUDO_APRIL_ID)
  .order("created_at", { ascending: true });

let storageMeta: Record<string, unknown> = {};
let storagePdfExtract: Record<string, unknown> | null = null;
let pngFixtureExtract: Record<string, unknown> | null = null;

if (invoice?.file_url) {
  const { blob, contentType } = await fetchBlob(invoice.file_url);
  storageMeta = {
    file_url: invoice.file_url,
    ext: invoice.file_url.split(".").pop()?.toLowerCase(),
    blobSizeBytes: blob.size,
    contentType,
    isExtractablePath: ["png", "jpg", "jpeg", "webp", "pdf"].includes(
      invoice.file_url.split(".").pop()?.toLowerCase() ?? "",
    ),
  };

  // Mimic client: send PDF as data URL (no browser rasterization in this script)
  const buf = Buffer.from(await blob.arrayBuffer());
  const mime = invoice.file_url.endsWith(".pdf") ? "application/pdf" : "image/png";
  const storageDataUrl = `data:${mime};base64,${buf.toString("base64")}`;
  const pdfResult = await invokeExtract(storageDataUrl);
  storagePdfExtract = {
    status: pdfResult.status,
    itemCount: Array.isArray(pdfResult.body?.items) ? pdfResult.body.items.length : 0,
    supplier: pdfResult.body?.supplier,
    total: pdfResult.body?.total,
    invoice_date: pdfResult.body?.invoice_date,
    error: pdfResult.body?.error,
    tableCrop: pdfResult.body?.tableCrop,
  };

  // Known-good PNG fixture (VL audits)
  const pngB64 = readFileSync(
    ".tmp/footer-validation-4dc40c3/april-historico-png-fixture.b64.txt",
    "utf8",
  ).trim();
  const pngResult = await invokeExtract(`data:image/png;base64,${pngB64}`);
  pngFixtureExtract = {
    status: pngResult.status,
    itemCount: Array.isArray(pngResult.body?.items) ? pngResult.body.items.length : 0,
    supplier: pngResult.body?.supplier,
    total: pngResult.body?.total,
    invoice_date: pdfResult.body?.invoice_date,
  };
}

const invoiceRecord = {
  generated_at: new Date().toISOString(),
  invoiceId: AVILUDO_APRIL_ID,
  queryError: invErr?.message ?? null,
  itemsQueryError: itemsErr?.message ?? null,
  invoice,
  itemsCount: dbItems?.length ?? 0,
  items: dbItems ?? [],
  storageMeta,
  storagePdfExtract,
  pngFixtureExtract,
};

writeFileSync(`${OUT_DIR}/invoice-record.json`, JSON.stringify(invoiceRecord, null, 2));
console.log(JSON.stringify({
  invoice_date: invoice?.invoice_date,
  file_url: invoice?.file_url,
  storageSize: storageMeta.blobSizeBytes,
  dbItems: dbItems?.length,
  storageExtractItems: storagePdfExtract?.itemCount,
  pngExtractItems: pngFixtureExtract?.itemCount,
}, null, 2));
