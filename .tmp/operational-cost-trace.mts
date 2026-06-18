import { execSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";

const VL = "bjhnlrgodcqoyzddbpbd";
const key = (
  JSON.parse(
    execSync(`supabase projects api-keys --project-ref ${VL} -o json`, { encoding: "utf8" }),
  ) as { name: string; api_key: string }[]
).find((k) => k.name === "service_role")!.api_key;
const sb = createClient(`https://${VL}.supabase.co`, key, { auth: { persistSession: false } });

const names = ["Courgettes", "Abóbora Butternut", "Alho Francês"];

async function main() {
  for (const name of names) {
    const { data: ings, error } = await sb
      .from("ingredients")
      .select(
        "id,name,current_price,purchase_quantity,purchase_unit,base_unit,unit,normalized_name,created_at,updated_at",
      )
      .ilike("name", name);
    console.log("===", name, "error", error?.message);
    for (const ing of ings ?? []) {
      console.log("INGREDIENT", JSON.stringify(ing, null, 2));
      const { data: matches } = await sb
        .from("invoice_item_matches")
        .select(
          "id,status,ingredient_id,invoice_item_id,created_at,invoice_items(id,name,quantity,unit,unit_price,total,invoice_id,created_at), invoices(id,supplier_name,invoice_date)",
        )
        .eq("ingredient_id", ing.id);
      const all = matches ?? [];
      console.log("MATCHES total", all.length);
      const sorted = [...all].sort((a, b) => {
        const da = a.invoices?.invoice_date ?? "";
        const db = b.invoices?.invoice_date ?? "";
        return db.localeCompare(da);
      });
      for (const m of sorted.slice(0, 5)) {
        console.log(
          "MATCH",
          JSON.stringify({
            match_id: m.id,
            status: m.status,
            supplier: m.invoices?.supplier_name,
            invoice_date: m.invoices?.invoice_date,
            item: m.invoice_items,
          }),
        );
      }
      const { data: hist } = await sb
        .from("ingredient_price_history")
        .select("id,new_price,purchase_quantity,purchase_unit,created_at,invoice_id")
        .eq("ingredient_id", ing.id)
        .order("created_at", { ascending: false })
        .limit(3);
      console.log("PRICE_HISTORY", JSON.stringify(hist, null, 2));
    }
  }
}

main().catch(console.error);
