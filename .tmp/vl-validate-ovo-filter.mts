/**
 * Validate Ovo MORENO filter fix on Bidfood da472b7f.
 */
import { createClient } from "@supabase/supabase-js";
import { loadEnvFiles } from "../scripts/load-env.mts";
import {
  normalizeInvoiceItemFields,
  shouldRejectInvoiceIngredientRow,
} from "../src/lib/invoice-item-fields.ts";

loadEnvFiles();

const VL_REF = "bjhnlrgodcqoyzddbpbd";
const BIDFOOD_ID = "da472b7f-0fd9-4a26-a37c-80ad335f7f7e";
const key =
  process.env.VL_KEY ??
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
if (!key) {
  console.error(JSON.stringify({ error: "No Supabase key in env" }));
  process.exit(1);
}

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
  .select("id,name,quantity,unit,unit_price,total")
  .eq("invoice_id", BIDFOOD_ID);
const beforeEligible = (beforeItems ?? []).filter(isEligible);

const { data: invoice, error: invErr } = await sb
  .from("invoices")
  .select("file_url,user_id,supplier_name")
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
const afterEligible = items.filter(isEligible);
const rejected = items.filter((it) => !isEligible(it));

console.log(
  JSON.stringify(
    {
      invoiceId: BIDFOOD_ID,
      supplier: invoice.supplier_name,
      beforePersisted: beforeItems?.length ?? 0,
      beforeEligible: beforeEligible.length,
      beforeNames: beforeEligible.map((i) => i.name),
      extractedRaw: items.length,
      afterEligible: afterEligible.length,
      afterNames: afterEligible.map((i) => i.name),
      rejectedByFilter: rejected.map((i) => i.name),
      hasOvoMoreno: afterEligible.some((i) => /ovo moreno/i.test(i.name ?? "")),
      ovoRow: items.find((i) => /ovo moreno/i.test(i.name ?? ""))?.name ?? null,
    },
    null,
    2,
  ),
);
