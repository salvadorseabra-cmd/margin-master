import { execSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
const VL = "bjhnlrgodcqoyzddbpbd";
const MAY = "3b4cb21f-8b3f-45f3-9f2d-6f15e9f438a2";
const key = (JSON.parse(execSync(`supabase projects api-keys --project-ref ${VL} -o json`, { encoding: "utf8" })) as { name: string; api_key: string }[]).find((k) => k.name === "service_role")!.api_key;
const sb = createClient(`https://${VL}.supabase.co`, key, { auth: { persistSession: false } });
const { data } = await sb.from("invoice_items").select("id,name,quantity,unit,unit_price,total").eq("invoice_id", MAY);
const hints = [
  { label: "Atum", h: ["atum"] },
  { label: "Gema", h: ["gema", "ovo liquido", "ovo líquido"] },
  { label: "Anchoas", h: ["ancho", "anchov"] },
];
for (const t of hints) {
  const hits = (data ?? []).filter((it) => t.h.some((h) => it.name?.toLowerCase().includes(h.toLowerCase())));
  console.log(t.label, hits.length, hits.map((x) => ({ id: x.id, name: x.name })));
}
const { data: matches } = await sb.from("invoice_item_matches").select("status,ingredient_id,invoice_item_id").eq("invoice_id", MAY);
console.log("MAY_MATCHES", matches?.length, matches?.filter((m) => ["0f30ccb3-bb47-40bb-83cc-ae2a4018066d","32dbf47d-347c-45f3-bd9f-c6e90640e767","c811f67f-df4d-4194-ba8b-7a15d4af38bd"].includes(m.ingredient_id)));
