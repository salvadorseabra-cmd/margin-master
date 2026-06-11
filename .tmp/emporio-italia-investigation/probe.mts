/**
 * Emporio Italia validation lab — read-only probe
 */
import { execSync } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const VL_REF = "bjhnlrgodcqoyzddbpbd";
const OUT_DIR = ".tmp/emporio-italia-investigation";

function projectKey(name: "anon" | "service_role"): string {
  const fromEnv =
    name === "anon"
      ? process.env.ANON_KEY ?? process.env.VL_ANON
      : process.env.SR_KEY ?? process.env.VL_SR ?? process.env.VL_KEY;
  if (fromEnv) return fromEnv;
  const raw = execSync(
    `supabase projects api-keys --project-ref ${VL_REF} -o json`,
    { encoding: "utf8" },
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

// Find Emporio Italia invoices
const { data: invoices, error: invErr } = await sb
  .from("invoices")
  .select("id, supplier_name, total, invoice_date, file_url, created_at")
  .ilike("supplier_name", "%emporio%italia%")
  .order("created_at", { ascending: false });

console.log("=== Emporio Italia invoices ===");
console.log(JSON.stringify({ error: invErr?.message, count: invoices?.length, invoices }, null, 2));

if (!invoices?.length) {
  // Broader search
  const { data: all } = await sb
    .from("invoices")
    .select("id, supplier_name, total, invoice_date")
    .order("created_at", { ascending: false })
    .limit(50);
  const matches = all?.filter((i) =>
    (i.supplier_name ?? "").toLowerCase().includes("emporio") ||
    (i.supplier_name ?? "").toLowerCase().includes("italia")
  );
  console.log("=== Broader search ===");
  console.log(JSON.stringify(matches, null, 2));
  writeFileSync(`${OUT_DIR}/invoice-search.json`, JSON.stringify({ invoices, matches, all }, null, 2));
  process.exit(0);
}

const invoice = invoices[0];
writeFileSync(`${OUT_DIR}/invoice-meta.json`, JSON.stringify(invoice, null, 2));

// Get invoice items
const { data: items, error: itemsErr } = await sb
  .from("invoice_items")
  .select("*")
  .eq("invoice_id", invoice.id)
  .order("created_at", { ascending: true });

console.log("=== Invoice items ===");
console.log(JSON.stringify({ error: itemsErr?.message, count: items?.length }, null, 2));

const ginger = items?.find((it) =>
  (it.description ?? it.name ?? "").toLowerCase().includes("ginger")
);
writeFileSync(`${OUT_DIR}/invoice-items.json`, JSON.stringify(items, null, 2));
writeFileSync(`${OUT_DIR}/ginger-beer-item.json`, JSON.stringify(ginger ?? null, null, 2));

// Fetch image and invoke extract-invoice
async function fetchImageDataUrl(fileUrl: string): Promise<string> {
  const { data: signed, error: signErr } = await sb.storage
    .from("invoices")
    .createSignedUrl(fileUrl, 300);
  if (signErr || !signed?.signedUrl) throw new Error(`sign: ${signErr?.message}`);
  const blob = await fetch(signed.signedUrl).then((r) => r.blob());
  const buf = Buffer.from(await blob.arrayBuffer());
  return `data:${blob.type || "image/png"};base64,${buf.toString("base64")}`;
}

if (invoice.file_url) {
  const imageDataUrl = await fetchImageDataUrl(invoice.file_url);
  writeFileSync(`${OUT_DIR}/invoice-full.b64.txt`, imageDataUrl);

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
  writeFileSync(`${OUT_DIR}/extract-invoice-response.json`, JSON.stringify({ status: res.status, body }, null, 2));
  console.log("=== extract-invoice footer fields ===");
  console.log(JSON.stringify({
    total: body?.total,
    net_subtotal: body?.net_subtotal,
    vat: body?.vat,
    confidence: body?.confidence,
    validation_warning: body?.validation_warning,
    itemCount: body?.items?.length,
  }, null, 2));

  // Footer crop
  try {
    const denoOut = execSync(
      `deno run --allow-read --allow-write --allow-net .tmp/vl-footer-crop-only.ts "${OUT_DIR}/invoice-full.b64.txt" "${OUT_DIR}/footer-crop.png"`,
      { encoding: "utf8", timeout: 120_000 },
    );
    console.log("footer crop:", denoOut.trim());
  } catch (e) {
    console.error("footer crop failed:", e);
  }
}

console.log("Done. Evidence in", OUT_DIR);
