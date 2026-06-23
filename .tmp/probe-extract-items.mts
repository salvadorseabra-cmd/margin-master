import { execSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";

const VL = "bjhnlrgodcqoyzddbpbd";
const raw = execSync(`supabase projects api-keys --project-ref ${VL} -o json`, { encoding: "utf8" });
const keys = JSON.parse(raw) as { name: string; api_key: string }[];
const sk = keys.find((k) => k.name === "service_role")!.api_key;
const ak = keys.find((k) => k.name === "anon")!.api_key;
const sb = createClient(`https://${VL}.supabase.co`, sk, { auth: { persistSession: false } });

async function probe(invoiceId: string, label: string) {
  const { data: inv } = await sb.from("invoices").select("file_url").eq("id", invoiceId).single();
  const { data: s } = await sb.storage.from("invoices").createSignedUrl(inv!.file_url, 300);
  const buf = Buffer.from(await (await fetch(s!.signedUrl)).arrayBuffer());
  const mime = inv!.file_url.endsWith(".pdf") ? "application/pdf" : "image/png";
  const dataUrl = `data:${mime};base64,${buf.toString("base64")}`;
  const res = await fetch(`https://${VL}.supabase.co/functions/v1/extract-invoice`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: ak, Authorization: `Bearer ${ak}` },
    body: JSON.stringify({ imageDataUrl: dataUrl }),
  });
  const body = await res.json();
  const needles = ["Courgettes", "Alho", "Manjeric", "Paccheri", "Gorgonzola"];
  const items = (body.items ?? []).filter((i: { name?: string }) =>
    needles.some((n) => (i.name ?? "").includes(n)),
  );
  console.log(
    JSON.stringify(
      {
        label,
        status: res.status,
        items: items.map((i: Record<string, unknown>) => ({
          name: i.name,
          quantity: i.quantity,
          unit_price: i.unit_price,
          total: i.total,
          gross_unit_price: i.gross_unit_price,
          discount_pct: i.discount_pct,
          line_total_net: i.line_total_net,
        })),
      },
      null,
      2,
    ),
  );
}

await probe("da472b7f-0fd9-4a26-a37c-80ad335f7f7e", "Bidfood");
await probe("ab52796d-de1d-418d-86e7-230c8f056f09", "Emporio");
