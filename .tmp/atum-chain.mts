import { execSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
const VL = "bjhnlrgodcqoyzddbpbd";
const raw = execSync(`supabase projects api-keys --project-ref ${VL} -o json`, { encoding: "utf8" });
const key = (JSON.parse(raw) as { name: string; api_key: string }[]).find((k) => k.name === "service_role")!.api_key;
const sb = createClient(`https://${VL}.supabase.co`, key, { auth: { persistSession: false } });
const { data } = await sb
  .from("ingredient_price_history")
  .select("id,ingredient_name,previous_price,new_price,delta,delta_percent,created_at,invoice_id")
  .eq("ingredient_id", "0f30ccb3-bb47-40bb-83cc-ae2a4018066d")
  .order("created_at");
console.log(JSON.stringify(data, null, 2));
