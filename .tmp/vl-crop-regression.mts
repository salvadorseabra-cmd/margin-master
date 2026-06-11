/**
 * Aviludo crop regression after bottom-boundary fix.
 */
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../src/integrations/supabase/types";
import {
  normalizeInvoiceItemFields,
  shouldRejectInvoiceIngredientRow,
} from "../src/lib/invoice-item-fields.ts";

const VL_REF = "bjhnlrgodcqoyzddbpbd";
const AVILUDO = [
  { id: "3b4cb21f-8b3f-45f3-9f2d-6f15e9f438a2", label: "Aviludo May", expected: 8 },
  { id: "c2f52357-0f80-491a-ba14-c97ff4837472", label: "Aviludo April", expected: 9 },
] as const;

const key = process.env.VL_KEY!;
const sb = createClient<Database>(`https://${VL_REF}.supabase.co`, key, {
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

const results = [];
for (const inv of AVILUDO) {
  const { data: invoice, error: invErr } = await sb
    .from("invoices")
    .select("file_url,user_id,supplier_name")
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
  const eligible = items.filter(isEligible);

  results.push({
    label: inv.label,
    invoiceId: inv.id,
    expectedRows: inv.expected,
    passCCount: items.length,
    eligibleCount: eligible.length,
    names: eligible.map((it) => it.name),
    pass: eligible.length === inv.expected,
  });
}

console.log(JSON.stringify({ aviludo: results }, null, 2));
