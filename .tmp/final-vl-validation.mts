import { execSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import { resolvedOperationalUnitCostEur } from "../src/lib/ingredient-unit-cost.ts";

const VL = "bjhnlrgodcqoyzddbpbd";
const raw = execSync(`supabase projects api-keys --project-ref ${VL} -o json`, { encoding: "utf8" });
const sk = (JSON.parse(raw) as { name: string; api_key: string }[]).find((k) => k.name === "service_role")!.api_key;
const sb = createClient(`https://${VL}.supabase.co`, sk, { auth: { persistSession: false } });

const TARGETS = [
  { id: "d7fcbb41-4e19-47ee-bbea-058e7b44a040", label: "Paccheri lisci (De Cecco)" },
  { id: "6c7ab001-9f87-448e-9b34-87d3aa21f9ca", label: "Courgettes" },
  { id: "446f3217-9a6f-428a-abc6-10927a958168", label: "Alho Francês" },
  { id: "8fe3ab95-b508-48b5-9890-d737dee78cc6", label: "Manjericão" },
  { id: "1526106c-7bac-4b70-bd51-7b0fd5cc89ed", label: "Gorgonzola" },
];

const REGRESSION = [
  "b924480a-91f3-4aa2-9852-a900795a6f92", // Prosciutto
  "7aa5dd9e-44c2-43e3-b673-890ad6d6da41", // San Pellegrino
  "9c853a47-82fe-4d6d-88bc-f0aa007e0a59", // Mortadella
];

for (const t of TARGETS) {
  const { data: ing } = await sb.from("ingredients").select("*").eq("id", t.id).single();
  const { data: hist } = await sb
    .from("ingredient_price_history")
    .select("id,invoice_id,new_price,previous_price,created_at")
    .eq("ingredient_id", t.id)
    .order("created_at", { ascending: false })
    .limit(3);
  const { data: match } = await sb
    .from("invoice_item_matches")
    .select("invoice_items(unit_price,total,quantity,invoice_id,name)")
    .eq("ingredient_id", t.id)
    .in("status", ["confirmed", "auto_confirmed"])
    .limit(5);
  const lines = (match ?? []).map((m) => m.invoice_items);
  const emporio = lines.find((l) => l?.invoice_id === "ab52796d-de1d-418d-86e7-230c8f056f09");
  const bidfood = lines.find((l) => l?.invoice_id === "da472b7f-0fd9-4a26-a37c-80ad335f7f7e");
  console.log(
    JSON.stringify({
      label: t.label,
      current_price: ing?.current_price,
      purchase_quantity: ing?.purchase_quantity,
      purchase_unit: ing?.purchase_unit,
      operational_eur: resolvedOperationalUnitCostEur({
        current_price: ing?.current_price,
        purchase_quantity: ing?.purchase_quantity,
      }),
      latest_history_new_price: hist?.[0]?.new_price,
      emporio_line: emporio,
      bidfood_line: bidfood,
    }),
  );
}

console.log("--- regression ---");
for (const id of REGRESSION) {
  const { data: ing } = await sb.from("ingredients").select("name,current_price,purchase_quantity").eq("id", id).single();
  console.log(JSON.stringify({ id, ...ing, operational: resolvedOperationalUnitCostEur(ing ?? {}) }));
}
