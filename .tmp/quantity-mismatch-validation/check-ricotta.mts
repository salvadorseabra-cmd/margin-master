import { execSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
const VL = "bjhnlrgodcqoyzddbpbd";
const key = (
  JSON.parse(execSync(`supabase projects api-keys --project-ref ${VL} -o json`, { encoding: "utf8" })) as {
    name: string;
    api_key: string;
  }[]
).find((k) => k.name === "service_role")!.api_key;
const sb = createClient(`https://${VL}.supabase.co`, key, { auth: { persistSession: false } });
const { data: item } = await sb
  .from("invoice_items")
  .select("id,name,quantity,unit,unit_price,total")
  .eq("id", "409850ab-646d-44fa-b20c-c8a4a8570064")
  .single();
const { data: match } = await sb
  .from("invoice_item_matches")
  .select("*")
  .eq("invoice_item_id", "409850ab-646d-44fa-b20c-c8a4a8570064");
const { data: ings } = await sb
  .from("ingredients")
  .select("id,name,purchase_quantity")
  .ilike("name", "%ricotta%");
console.log(JSON.stringify({ item, match, ings }, null, 2));
