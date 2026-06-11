import { createClient } from "@supabase/supabase-js";

const key = process.env.VL_KEY!;
const sb = createClient("https://bjhnlrgodcqoyzddbpbd.supabase.co", key, {
  auth: { persistSession: false },
});

const { data: bidfood } = await sb
  .from("invoices")
  .select("id,supplier_name,file_url,created_at")
  .ilike("supplier_name", "%bidfood%")
  .limit(10);

const { data: all } = await sb
  .from("invoices")
  .select("id,supplier_name")
  .limit(20);

console.log(JSON.stringify({ bidfood, sample: all }, null, 2));
