import { execSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";

const VL = "bjhnlrgodcqoyzddbpbd";
const raw = execSync(`supabase projects api-keys --project-ref ${VL} -o json`, { encoding: "utf8" });
const sk = (JSON.parse(raw) as { name: string; api_key: string }[]).find((k) => k.name === "service_role")!.api_key;
const sb = createClient(`https://${VL}.supabase.co`, sk, { auth: { persistSession: false } });

const ids = [
  "d7fcbb41-4e19-47ee-bbea-058e7b44a040",
  "6c7ab001-9f87-448e-9b34-87d3aa21f9ca",
  "446f3217-9a6f-428a-abc6-10927a958168",
  "8fe3ab95-b508-48b5-9890-d737dee78cc6",
  "1526106c-7bac-4b70-bd51-7b0fd5cc89ed",
];

for (const id of ids) {
  const { data } = await sb
    .from("ingredient_price_history")
    .select("id,invoice_id,new_price,created_at")
    .eq("ingredient_id", id)
    .order("created_at", { ascending: true });
  const dupInv = new Set<string>();
  const issues: string[] = [];
  for (const row of data ?? []) {
    if (row.invoice_id && dupInv.has(row.invoice_id)) issues.push(`dup ${row.invoice_id}`);
    if (row.invoice_id) dupInv.add(row.invoice_id);
  }
  console.log(id, "rows", data?.length, "issues", issues, "chain", (data ?? []).map((r) => r.new_price));
}
