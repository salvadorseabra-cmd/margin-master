import "../end-to-end-recipe-certification/env-shim.ts";
import { execSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";

const VL = "bjhnlrgodcqoyzddbpbd";
const raw = execSync(`supabase projects api-keys --project-ref ${VL} -o json`, { encoding: "utf8" });
const key = (JSON.parse(raw) as { name: string; api_key: string }[]).find(
  (k) => k.name === "service_role",
)!.api_key;
const sb = createClient(`https://${VL}.supabase.co`, key, { auth: { persistSession: false } });
const id = "7aa5dd9e-44c2-43e3-b673-890ad6d6da41";
const allIds = [
  id,
  "50783e60-702f-42b2-bccd-0b6a98d7635f",
  "07a55cf5-b98d-4aae-b330-b4944882e4d3",
];
const { data: batch, error: e1 } = await sb
  .from("ingredients")
  .select("id, name, current_price, purchase_quantity, base_unit")
  .in("id", allIds);
const { data: single, error: e2 } = await sb
  .from("ingredients")
  .select("id, name, current_price, purchase_quantity, base_unit")
  .eq("id", id)
  .maybeSingle();
console.log("batch", batch?.length, batch, e1);
console.log("single", single, e2);
