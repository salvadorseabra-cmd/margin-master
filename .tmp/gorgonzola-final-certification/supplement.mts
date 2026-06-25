import { execSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";

const VL = "bjhnlrgodcqoyzddbpbd";
const key = (
  JSON.parse(
    execSync(`supabase projects api-keys --project-ref ${VL} -o json`, { encoding: "utf8" }),
  ) as { name: string; api_key: string }[]
).find((k) => k.name === "service_role")!.api_key;
const sb = createClient(`https://${VL}.supabase.co`, key, { auth: { persistSession: false } });
const ing = "1526106c-7bac-4b70-bd51-7b0fd5cc89ed";

const { data: hist } = await sb
  .from("ingredient_price_history")
  .select("*")
  .eq("ingredient_id", ing)
  .order("created_at");
const { data: matches } = await sb.from("invoice_item_matches").select("*").eq("ingredient_id", ing);
const { data: allGorgItems } = await sb
  .from("invoice_items")
  .select("id,quantity,unit_price,total,created_at,name")
  .ilike("name", "%gorgonzola%")
  .order("created_at", { ascending: false });
const { data: allMatchesForInvoice } = await sb
  .from("invoice_item_matches")
  .select("*, invoice_items(name)")
  .eq("invoice_items.invoice_id", "ab52796d-de1d-418d-86e7-230c8f056f09");

console.log(
  JSON.stringify({ hist, matches, allGorgItems, allMatchesForInvoiceCount: allMatchesForInvoice?.length }, null, 2),
);
