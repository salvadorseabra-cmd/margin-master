import { execSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const VL = "bjhnlrgodcqoyzddbpbd";
const INVOICE_ID = "17aa3591-ec98-4c21-89c9-5ae946bc97bb";
const raw = execSync(`supabase projects api-keys --project-ref ${VL} -o json`, { encoding: "utf8" });
const key = JSON.parse(raw).find((k: { name: string }) => k.name === "service_role").api_key;
const sb = createClient(`https://${VL}.supabase.co`, key, { auth: { persistSession: false } });

const [{ data: items }, { data: ings }, { data: aliases }] = await Promise.all([
  sb.from("invoice_items").select("*").eq("invoice_id", INVOICE_ID),
  sb.from("ingredients").select("*").or("name.ilike.%ginger%,name.ilike.%baladin%"),
  sb.from("ingredient_aliases").select("*").or("alias_name.ilike.%ginger%,alias_name.ilike.%baladin%"),
]);

const gingerItems = (items ?? []).filter((i) => /ginger|baladin/i.test(i.name ?? ""));
const allGingerItems = (
  await sb.from("invoice_items").select("*,invoices!inner(supplier_name)").ilike("name", "%ginger%")
).data;

writeFileSync(
  ".tmp/ginger-beer-audit/db-record-live.json",
  JSON.stringify({ invoice_id: INVOICE_ID, gingerItems, allItems: items, allGingerItems, ings, aliases }, null, 2),
);
console.log(JSON.stringify({ gingerItems, ings, aliases }, null, 2));
