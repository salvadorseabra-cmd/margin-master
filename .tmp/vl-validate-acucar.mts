import { createClient } from "@supabase/supabase-js";
import type { Database } from "../src/integrations/supabase/types";

const VL_REF = "bjhnlrgodcqoyzddbpbd";
const MAY = "3b4cb21f-8b3f-45f3-9f2d-6f15e9f438a2";
const key = process.env.VL_SR!;
const sb = createClient<Database>(`https://${VL_REF}.supabase.co`, key, {
  auth: { persistSession: false },
});

const [{ data: line }, { data: ingredients }, { data: history }] = await Promise.all([
  sb
    .from("invoice_items")
    .select("id,name,quantity,unit,unit_price,total")
    .eq("invoice_id", MAY)
    .ilike("name", "%acucar%")
    .maybeSingle(),
  sb
    .from("ingredients")
    .select("id,name,current_price,purchase_quantity,purchase_unit,base_unit")
    .or("name.ilike.%acucar%,name.ilike.%açúcar%"),
  sb
    .from("ingredient_price_history")
    .select("id,ingredient_id,new_price,previous_price,invoice_id,created_at")
    .eq("invoice_id", MAY),
]);

const acucarIng = (ingredients ?? []).find((i) => /metro chef|branco/i.test(i.name ?? ""));
const acucarHist = (history ?? []).find((h) => h.ingredient_id === acucarIng?.id);

const before = {
  pdfGroundTruth: { unit_price: 9.99, total: 9.99, quantity: 1, unit: "cx" },
  invoiceItem: line,
  ingredient: acucarIng,
  priceHistory: acucarHist,
  expectedUnitCostPerKg: line?.unit_price != null ? line.unit_price / 10 : null,
  historyMatchesInvoice:
    acucarHist?.new_price != null && line?.unit_price != null
      ? Math.abs(acucarHist.new_price * 10 - line.unit_price) < 0.02
      : false,
};

if (process.argv.includes("--sync-costs") && acucarIng && line?.unit_price === 9.99) {
  const prev = acucarHist?.previous_price ?? null;
  const newUnit = 0.999;
  await Promise.all([
    sb.from("ingredients").update({ current_price: 9.99 }).eq("id", acucarIng.id),
    acucarHist
      ? sb
          .from("ingredient_price_history")
          .update({
            new_price: newUnit,
            delta: prev != null ? newUnit - prev : null,
            delta_percent:
              prev != null && prev !== 0 ? ((newUnit - prev) / prev) * 100 : null,
          })
          .eq("id", acucarHist.id)
      : Promise.resolve({ error: null }),
  ]);
}

const [{ data: ingAfter }, { data: histAfter }] = await Promise.all([
  sb
    .from("ingredients")
    .select("id,name,current_price")
    .eq("id", acucarIng?.id ?? "")
    .maybeSingle(),
  sb
    .from("ingredient_price_history")
    .select("id,new_price,previous_price")
    .eq("id", acucarHist?.id ?? "")
    .maybeSingle(),
]);

console.log(
  JSON.stringify(
    {
      before,
      after: {
        ingredient: ingAfter,
        priceHistory: histAfter,
        historyMatchesInvoice:
          histAfter?.new_price != null && line?.unit_price != null
            ? Math.abs(histAfter.new_price * 10 - line.unit_price) < 0.02
            : false,
      },
    },
    null,
    2,
  ),
);
