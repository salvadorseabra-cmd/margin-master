/**
 * Validate Bidfood crop fix: Bidfood via local PNG, Aviludo via VL DB re-extract.
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../src/integrations/supabase/types";

const VL_REF = "bjhnlrgodcqoyzddbpbd";
const BIDFOOD_PNG = process.argv[2] ?? "/tmp/bidfood-invoice.png";
const AVILUDO = [
  { id: "3b4cb21f-8b3f-45f3-9f2d-6f15e9f438a2", label: "Aviludo May" },
  { id: "c2f52357-0f80-491a-ba14-c97ff4837472", label: "Aviludo April" },
] as const;

const key = process.env.VL_KEY!;
const sb = createClient<Database>(`https://${VL_REF}.supabase.co`, key, {
  auth: { persistSession: false },
});

async function extractFromDataUrl(imageDataUrl: string) {
  const extractRes = await fetch(`https://${VL_REF}.supabase.co/functions/v1/extract-invoice`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: key,
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({ imageDataUrl }),
  });
  const extracted = await extractRes.json();
  if (!extractRes.ok) {
    throw new Error(`extract ${extractRes.status}: ${JSON.stringify(extracted)}`);
  }
  return extracted;
}

function summarizeItems(items: Array<{ name?: string; total?: number | null }>) {
  const sum = items.reduce((acc, it) => acc + (it.total ?? 0), 0);
  return {
    count: items.length,
    sum: Math.round(sum * 100) / 100,
    names: items.map((it) => it.name),
  };
}

// Bidfood: extract-only (invoice row absent from VL)
const bidfoodPng = readFileSync(BIDFOOD_PNG);
const bidfoodDataUrl = `data:image/png;base64,${bidfoodPng.toString("base64")}`;
const bidfoodExtracted = await extractFromDataUrl(bidfoodDataUrl);
const bidfoodItems = bidfoodExtracted.items ?? [];

const aviludoResults = [];
for (const inv of AVILUDO) {
  const { data: beforeItems } = await sb
    .from("invoice_items")
    .select("id,name,total")
    .eq("invoice_id", inv.id);

  const { data: invoice, error: invErr } = await sb
    .from("invoices")
    .select("id,file_url,user_id,supplier_name")
    .eq("id", inv.id)
    .maybeSingle();
  if (invErr || !invoice?.file_url) throw new Error(`${inv.label}: missing invoice`);

  const { data: signed, error: signErr } = await sb.storage
    .from("invoices")
    .createSignedUrl(invoice.file_url, 300);
  if (signErr || !signed?.signedUrl) throw new Error(`${inv.label}: sign failed`);

  const blob = await fetch(signed.signedUrl).then((r) => r.blob());
  const buf = Buffer.from(await blob.arrayBuffer());
  const imageDataUrl = `data:${blob.type || "image/png"};base64,${buf.toString("base64")}`;
  const extracted = await extractFromDataUrl(imageDataUrl);
  const items = extracted.items ?? [];

  await sb.from("invoice_items").delete().eq("invoice_id", inv.id);
  const insertRows = items.map(
    (it: {
      name?: string;
      quantity?: number | null;
      unit?: string | null;
      unit_price?: number | null;
      total?: number | null;
    }) => ({
      invoice_id: inv.id,
      user_id: invoice.user_id,
      name: String(it.name ?? "Unknown").slice(0, 200),
      quantity: it.quantity ?? null,
      unit: it.unit ? String(it.unit).slice(0, 20) : null,
      unit_price: it.unit_price ?? null,
      total: it.total ?? null,
    }),
  );
  const { error: insertErr } = await sb.from("invoice_items").insert(insertRows);
  if (insertErr) throw new Error(`${inv.label}: ${insertErr.message}`);

  const { data: afterItems } = await sb
    .from("invoice_items")
    .select("id,name,total")
    .eq("invoice_id", inv.id);

  aviludoResults.push({
    label: inv.label,
    invoiceId: inv.id,
    beforePersisted: beforeItems?.length ?? 0,
    extracted: summarizeItems(items),
    afterPersisted: afterItems?.length ?? 0,
    insertErr: insertErr?.message ?? null,
  });
}

console.log(
  JSON.stringify(
    {
      bidfood: {
        invoiceId: "cbf5851a-abe8-47c2-b862-7f6a5499f5e6",
        note: "Invoice row absent from VL; extract-only from PNG",
        png: BIDFOOD_PNG,
        beforePersisted: 4,
        beforeExtractedNote: "Prior audit: 4 persisted, re-extract returned 5 rows",
        extracted: summarizeItems(bidfoodItems),
        invoiceTotal: bidfoodExtracted.total,
        netSubtotal: bidfoodExtracted.net_subtotal,
      },
      aviludo: aviludoResults,
    },
    null,
    2,
  ),
);
