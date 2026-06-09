import { createClient } from "@supabase/supabase-js";
import type { Database } from "../src/integrations/supabase/types";

const VL_REF = "bjhnlrgodcqoyzddbpbd";
const MAY = "3b4cb21f-8b3f-45f3-9f2d-6f15e9f438a2";
const key = process.env.VL_SR ?? process.env.VL_KEY;
if (!key) {
  console.error("Set VL_SR or VL_KEY");
  process.exit(1);
}

const sb = createClient<Database>(`https://${VL_REF}.supabase.co`, key, {
  auth: { persistSession: false },
});

const [{ data: items, error: itemsErr }, { data: invoice }, { data: history }] =
  await Promise.all([
    sb
      .from("invoice_items")
      .select("id,name,quantity,unit,unit_price,total,created_at")
      .eq("invoice_id", MAY)
      .order("created_at"),
    sb.from("invoices").select("id,file_path,supplier_name,total,invoice_date").eq("id", MAY).maybeSingle(),
    sb
      .from("ingredient_price_history")
      .select("id,ingredient_id,invoice_id,new_price,previous_price,delta,delta_percent,created_at,ingredients!inner(name)")
      .ilike("invoice_id", `${MAY}%`)
      .order("created_at", { ascending: false }),
  ]);

const acucar = (items ?? []).filter((i) => /acucar|açúcar/i.test(i.name ?? ""));
const acucarHistory = (history ?? []).filter((h) =>
  /acucar|açúcar/i.test((h.ingredients as { name?: string })?.name ?? ""),
);

console.log(
  JSON.stringify(
    {
      itemsErr: itemsErr?.message,
      invoice,
      allItems: items,
      acucar,
      acucarHistory,
    },
    null,
    2,
  ),
);
