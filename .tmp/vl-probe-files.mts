import { execSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";

const VL_REF = "bjhnlrgodcqoyzddbpbd";
const raw = execSync(`supabase projects api-keys --project-ref ${VL_REF} -o json`, {
  encoding: "utf8",
});
const key = (JSON.parse(raw) as { name: string; api_key: string }[]).find(
  (k) => k.name === "service_role",
)!.api_key;
const sb = createClient(`https://${VL_REF}.supabase.co`, key, {
  auth: { persistSession: false },
});

const ids = [
  "da472b7f-0fd9-4a26-a37c-80ad335f7f7e",
  "3b4cb21f-8b3f-45f3-9f2d-6f15e9f438a2",
  "c2f52357-0f80-491a-ba14-c97ff4837472",
];

for (const id of ids) {
  const { data } = await sb
    .from("invoices")
    .select("id,supplier_name,total,file_url")
    .eq("id", id)
    .single();
  const { data: s } = await sb.storage
    .from("invoices")
    .createSignedUrl(data!.file_url!, 300);
  const get = await fetch(s!.signedUrl);
  const buf = Buffer.from(await get.arrayBuffer());
  console.log(
    JSON.stringify({
      id,
      supplier: data?.supplier_name,
      total: data?.total,
      file_url: data?.file_url,
      contentType: get.headers.get("content-type"),
      size: buf.length,
      magic: buf.slice(0, 8).toString("hex"),
    }),
  );
}
