/**
 * Re-extract May Aviludo invoice and persist invoice_items.
 */
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../src/integrations/supabase/types";

const VL_REF = "bjhnlrgodcqoyzddbpbd";
const MAY = "3b4cb21f-8b3f-45f3-9f2d-6f15e9f438a2";
const key = process.env.VL_SR ?? process.env.VL_KEY;
if (!key) {
  console.error("Set VL_SR or VL_KEY");
  process.exit(1);
}

const sb = createClient<Database>(`https://${VL_REF}.supabase.co`, key, {
  auth: { persistSession: false },
});

const { data: invoice, error: invErr } = await sb
  .from("invoices")
  .select("id,file_url,user_id,supplier_name,total,invoice_date")
  .eq("id", MAY)
  .maybeSingle();

if (invErr || !invoice?.file_url) {
  console.error(JSON.stringify({ invErr: invErr?.message, invoice }));
  process.exit(1);
}

const { data: signed, error: signErr } = await sb.storage
  .from("invoices")
  .createSignedUrl(invoice.file_url, 300);
if (signErr || !signed?.signedUrl) {
  console.error(JSON.stringify({ signErr: signErr?.message }));
  process.exit(1);
}

const blob = await fetch(signed.signedUrl).then((r) => r.blob());
const buf = Buffer.from(await blob.arrayBuffer());
const imageDataUrl = `data:${blob.type || "image/png"};base64,${buf.toString("base64")}`;

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
  console.error(JSON.stringify({ status: extractRes.status, extracted }));
  process.exit(1);
}

const items = extracted.items ?? [];
const acucar = items.find((i: { name?: string }) => /acucar|açúcar/i.test(i.name ?? ""));

await sb.from("invoice_items").delete().eq("invoice_id", MAY);
const insertRows = items.map(
  (it: {
    name?: string;
    quantity?: number | null;
    unit?: string | null;
    unit_price?: number | null;
    total?: number | null;
  }) => ({
    invoice_id: MAY,
    user_id: invoice.user_id,
    name: String(it.name ?? "Unknown").slice(0, 200),
    quantity: it.quantity ?? null,
    unit: it.unit ? String(it.unit).slice(0, 20) : null,
    unit_price: it.unit_price ?? null,
    total: it.total ?? null,
  }),
);
const { error: insertErr } = await sb.from("invoice_items").insert(insertRows);

const { data: persisted } = await sb
  .from("invoice_items")
  .select("id,name,quantity,unit,unit_price,total")
  .eq("invoice_id", MAY);

const { data: ing } = await sb
  .from("ingredients")
  .select("id,name,current_price")
  .ilike("name", "%acucar%")
  .limit(3);

const { data: history } = await sb
  .from("ingredient_price_history")
  .select("id,ingredient_id,new_price,previous_price,invoice_id,created_at")
  .eq("invoice_id", MAY);

console.log(
  JSON.stringify(
    {
      beforeNote: "DB had acucar 8.99/8.99",
      extracted: { total: extracted.total, net_subtotal: extracted.net_subtotal, acucar },
      insertErr: insertErr?.message,
      persistedAcucar: (persisted ?? []).find((i) => /acucar|açúcar/i.test(i.name ?? "")),
      allPersisted: persisted,
      ingredients: ing,
      priceHistoryForInvoice: history,
    },
    null,
    2,
  ),
);
