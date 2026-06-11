/**
 * Re-extract all 6 VL invoices after Pass C refinement.
 */
import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const VL_REF = "bjhnlrgodcqoyzddbpbd";
const OUT_DIR = ".tmp/passc-refinement-validation/reextract";

const INVOICES: { id: string; label: string }[] = [
  { id: "da472b7f-0fd9-4a26-a37c-80ad335f7f7e", label: "Bidfood" },
  { id: "3b4cb21f-8b3f-45f3-9f2d-6f15e9f438a2", label: "Aviludo May" },
  { id: "c2f52357-0f80-491a-ba14-c97ff4837472", label: "Aviludo April" },
  { id: "17aa3591-ec98-4c21-89c9-5ae946bc97bb", label: "Emporio" },
  { id: "f0aa5a08-86a3-4938-99f0-711e86073968", label: "Bocconcino" },
  { id: "36c99d19-6f9f-413f-8c2d-ae3526291a2d", label: "Mammafiore" },
];

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

async function fetchImageDataUrl(fileUrl: string): Promise<string> {
  const { data: signed, error } = await sb.storage
    .from("invoices")
    .createSignedUrl(fileUrl, 300);
  if (error || !signed?.signedUrl) throw new Error(`signed url failed: ${error?.message}`);
  const blob = await fetch(signed.signedUrl).then((r) => r.blob());
  const buf = Buffer.from(await blob.arrayBuffer());
  const mime = fileUrl.endsWith(".pdf") ? "application/pdf" : "image/png";
  return `data:${mime};base64,${buf.toString("base64")}`;
}

const summary: Record<string, unknown>[] = [];

for (const { id, label } of INVOICES) {
  console.log(`[reextract] ${label} (${id})`);
  const { data: invoice, error } = await sb
    .from("invoices")
    .select("file_url,supplier_name")
    .eq("id", id)
    .single();
  if (error || !invoice?.file_url) {
    summary.push({ id, label, error: error?.message ?? "no file_url" });
    continue;
  }

  const imageDataUrl = await fetchImageDataUrl(invoice.file_url);
  let result = await invokeExtract(imageDataUrl);
  if (result.status === 546) {
    await new Promise((r) => setTimeout(r, 5000));
    result = await invokeExtract(imageDataUrl);
  }

  writeFileSync(
    `${OUT_DIR}/${id}.json`,
    JSON.stringify(
      {
        invoiceId: id,
        label,
        supplier: invoice.supplier_name,
        extractedAt: new Date().toISOString(),
        status: result.status,
        ...result.body,
      },
      null,
      2,
    ),
  );

  const items = Array.isArray(result.body?.items) ? result.body.items : [];
  summary.push({
    id,
    label,
    status: result.status,
    itemCount: items.length,
    items: items.map((i: { name?: string; quantity?: number | null; total?: number | null }) => ({
      name: i.name,
      quantity: i.quantity,
      total: i.total,
    })),
  });
  console.log(`  → ${result.status}, ${items.length} items`);
}

writeFileSync(`${OUT_DIR}/summary.json`, JSON.stringify(summary, null, 2));
console.log("done");
