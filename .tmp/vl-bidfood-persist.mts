/**
 * Persist Bidfood da472b7f after crop fix re-extract.
 */
import { createClient } from "@supabase/supabase-js";
import {
  normalizeInvoiceItemFields,
  shouldRejectInvoiceIngredientRow,
} from "../src/lib/invoice-item-fields.ts";

const VL_REF = "bjhnlrgodcqoyzddbpbd";
const BIDFOOD_ID = "da472b7f-0fd9-4a26-a37c-80ad335f7f7e";
const key = process.env.VL_KEY!;

const sb = createClient(`https://${VL_REF}.supabase.co`, key, {
  auth: { persistSession: false },
});

const isEligible = (it: {
  name?: string;
  quantity?: number | null;
  unit?: string | null;
  unit_price?: number | null;
  total?: number | null;
}) =>
  !shouldRejectInvoiceIngredientRow(
    normalizeInvoiceItemFields({
      id: "x",
      name: it.name ?? "",
      quantity: it.quantity ?? null,
      unit: it.unit ?? null,
      unit_price: it.unit_price ?? null,
      total: it.total ?? null,
    }),
  );

const { data: beforeItems } = await sb
  .from("invoice_items")
  .select("id,name")
  .eq("invoice_id", BIDFOOD_ID);

const { data: invoice, error: invErr } = await sb
  .from("invoices")
  .select("file_url,user_id")
  .eq("id", BIDFOOD_ID)
  .single();
if (invErr || !invoice?.file_url) throw new Error(invErr?.message ?? "invoice missing");

const { data: signed, error: signErr } = await sb.storage
  .from("invoices")
  .createSignedUrl(invoice.file_url, 300);
if (signErr || !signed?.signedUrl) throw new Error(signErr?.message ?? "sign failed");

const blob = await fetch(signed.signedUrl).then((r) => r.blob());
const buf = Buffer.from(await blob.arrayBuffer());
const imageDataUrl = `data:${blob.type || "image/png"};base64,${buf.toString("base64")}`;

const res = await fetch(`https://${VL_REF}.supabase.co/functions/v1/extract-invoice`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    apikey: key,
    Authorization: `Bearer ${key}`,
  },
  body: JSON.stringify({ imageDataUrl }),
});
const extracted = await res.json();
if (!res.ok) throw new Error(`extract ${res.status}: ${JSON.stringify(extracted)}`);

const items = extracted.items ?? [];
const eligible = items.filter(isEligible);

await sb.from("invoice_items").delete().eq("invoice_id", BIDFOOD_ID);
const insertRows = eligible.map((it) => ({
  invoice_id: BIDFOOD_ID,
  user_id: invoice.user_id,
  name: String(it.name ?? "Unknown").slice(0, 200),
  quantity: it.quantity ?? null,
  unit: it.unit ? String(it.unit).slice(0, 20) : null,
  unit_price: it.unit_price ?? null,
  total: it.total ?? null,
}));
const { error: insertErr } = await sb.from("invoice_items").insert(insertRows);
const { data: afterItems } = await sb
  .from("invoice_items")
  .select("id,name")
  .eq("invoice_id", BIDFOOD_ID);

console.log(
  JSON.stringify(
    {
      invoiceId: BIDFOOD_ID,
      beforePersisted: beforeItems?.length ?? 0,
      passCCount: items.length,
      postFilterCount: eligible.length,
      persistedCount: afterItems?.length ?? 0,
      insertError: insertErr?.message ?? null,
      passCNames: items.map((it) => it.name),
      persistedNames: afterItems?.map((i) => i.name) ?? null,
      hasAlho: eligible.some((i) => /alho/i.test(i.name ?? "")),
      hasAbobora: eligible.some((i) => /ab[oó]bora/i.test(i.name ?? "")),
      cropBounds: { beforeBottom: 823, afterBottom: 1005 },
    },
    null,
    2,
  ),
);
