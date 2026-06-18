import { execSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";

const VL = "bjhnlrgodcqoyzddbpbd";
const IDS = [
  "0f30ccb3-bb47-40bb-83cc-ae2a4018066d",
  "32dbf47d-347c-45f3-bd9f-c6e90640e767",
  "c811f67f-df4d-4194-ba8b-7a15d4af38bd",
];
const key = (
  JSON.parse(
    execSync(`supabase projects api-keys --project-ref ${VL} -o json`, { encoding: "utf8" }),
  ) as { name: string; api_key: string }[]
).find((k) => k.name === "service_role")!.api_key;
const sb = createClient(`https://${VL}.supabase.co`, key, { auth: { persistSession: false } });

for (const id of IDS) {
  const { data: matches, error } = await sb
    .from("invoice_item_matches")
    .select(
      "id,status,ingredient_id,invoice_item_id,invoice_items(id,name,quantity,unit,unit_price,total,invoice_id), invoices(id,supplier_name,invoice_date)",
    )
    .eq("ingredient_id", id);
  console.log("ING", id, "error", error?.message, "count", matches?.length);
  for (const m of matches ?? []) {
    console.log(
      JSON.stringify({
        status: m.status,
        supplier: m.invoices?.supplier_name,
        date: m.invoices?.invoice_date,
        item: m.invoice_items,
      }),
    );
  }
}

// Also search invoice_items by name patterns for Aviludo
const { data: invs } = await sb
  .from("invoices")
  .select("id,supplier_name,invoice_date")
  .ilike("supplier_name", "%aviludo%");
console.log("AVILUDO INVOICES", invs?.length);
for (const inv of invs ?? []) console.log(JSON.stringify(inv));
