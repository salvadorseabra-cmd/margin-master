import { createClient } from "@supabase/supabase-js";

const key = process.env.VL_KEY!;
const sb = createClient("https://bjhnlrgodcqoyzddbpbd.supabase.co", key, {
  auth: { persistSession: false },
});
const ids = [
  "cbf5851a-abe8-47c2-b862-7f6a5499f5e6",
  "3b4cb21f-8b3f-45f3-9f2d-6f15e9f438a2",
  "c2f52357-0f80-491a-ba14-c97ff4837472",
];
for (const id of ids) {
  const { data, error } = await sb
    .from("invoices")
    .select("id,supplier_name,file_url")
    .eq("id", id)
    .maybeSingle();
  const { count } = await sb
    .from("invoice_items")
    .select("*", { count: "exact", head: true })
    .eq("invoice_id", id);
  console.log(JSON.stringify({ id, error: error?.message, supplier: data?.supplier_name, hasFile: !!data?.file_url, persisted: count }));
}
