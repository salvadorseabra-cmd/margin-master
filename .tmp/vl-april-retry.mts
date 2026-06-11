import { createClient } from "@supabase/supabase-js";
const VL_REF = "bjhnlrgodcqoyzddbpbd";
const key = process.env.VL_KEY!;
const sb = createClient(`https://${VL_REF}.supabase.co`, key, { auth: { persistSession: false } });
const id = "c2f52357-0f80-491a-ba14-c97ff4837472";
const { data: inv } = await sb.from("invoices").select("file_url,supplier_name").eq("id", id).single();
const { data: signed } = await sb.storage.from("invoices").createSignedUrl(inv!.file_url, 300);
const blob = await fetch(signed!.signedUrl).then((r) => r.blob());
const buf = Buffer.from(await blob.arrayBuffer());
const imageDataUrl = `data:${blob.type || "image/png"};base64,${buf.toString("base64")}`;
const res = await fetch(`https://${VL_REF}.supabase.co/functions/v1/extract-invoice`, {
  method: "POST",
  headers: { "Content-Type": "application/json", apikey: key, Authorization: `Bearer ${key}` },
  body: JSON.stringify({ imageDataUrl }),
});
const data = await res.json();
console.log(JSON.stringify({ status: res.status, count: data.items?.length ?? 0, error: data.error, names: data.items?.map((i: {name?: string}) => i.name) }, null, 2));
