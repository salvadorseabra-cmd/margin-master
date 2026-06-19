import { execSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import { operationalCostFieldsFromInvoiceLine } from "../src/lib/ingredient-auto-persist.ts";
import { operationalUnitPriceForPriceHistory } from "../src/lib/ingredient-price-history.ts";
import { normalizeInvoiceItemFields } from "../src/lib/invoice-item-fields.ts";

const VL_REF = "bjhnlrgodcqoyzddbpbd";
const raw = execSync(`supabase projects api-keys --project-ref ${VL_REF} -o json`, { encoding: "utf8" });
const key = (JSON.parse(raw) as { name: string; api_key: string }[]).find((k) => k.name === "service_role")!.api_key;
const sb = createClient(`https://${VL_REF}.supabase.co`, key, { auth: { persistSession: false } });

const HISTORY_IDS = [
  "61c51696-acd8-4a58-878f-a588c1878af0", // Atum April
  "e967f673-1dc5-4390-90e6-464b66ec2a4b", // Gema April
  "e143080d-511b-4c37-9018-11949343aedc", // Gema May
  "908de185-e61a-4f41-af4c-3b70f69bd08f", // Anchoas May
  "7d6b70fa-543f-41c2-89e5-2b691afcdff4", // Peroni
  "194bb341-bd65-432e-90f0-6f62f42da8de", // Stracciatella
  "781ab1ac-39d2-4462-9106-635e5603c466", // Atum May
];

const { data: hist } = await sb.from("ingredient_price_history").select("*").in("id", HISTORY_IDS);
const invoiceIds = [...new Set((hist ?? []).map((h) => h.invoice_id))];
const ingIds = [...new Set((hist ?? []).map((h) => h.ingredient_id))];

const [{ data: items }, { data: matches }, { data: ings }] = await Promise.all([
  sb.from("invoice_items").select("id,invoice_id,name,quantity,unit,unit_price,total").in("invoice_id", invoiceIds),
  sb.from("invoice_item_matches").select("invoice_item_id,ingredient_id,status").in("ingredient_id", ingIds).eq("status", "confirmed"),
  sb.from("ingredients").select("id,name,current_price,purchase_quantity").in("id", ingIds),
]);

for (const h of hist ?? []) {
  const ing = (ings ?? []).find((i) => i.id === h.ingredient_id);
  const match = (matches ?? []).find((m) => {
    const item = (items ?? []).find((i) => i.id === m.invoice_item_id);
    return m.ingredient_id === h.ingredient_id && item?.invoice_id === h.invoice_id;
  });
  const item = (items ?? []).find((i) => i.id === match?.invoice_item_id);
  if (!item) {
    console.log(h.ingredient_name, "NO ITEM");
    continue;
  }
  const norm = normalizeInvoiceItemFields(item);
  const fields = operationalCostFieldsFromInvoiceLine(norm);
  const expected = operationalUnitPriceForPriceHistory(fields?.current_price, fields?.purchase_quantity);
  console.log(JSON.stringify({
    history_id: h.id,
    ingredient: h.ingredient_name,
    stored: h.new_price,
    expected,
    line: norm,
    fields,
    ing_pq: ing?.purchase_quantity,
  }));
}
