import { execSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import { operationalCostFieldsFromInvoiceLine } from "../../src/lib/ingredient-auto-persist.ts";
import {
  inferIngredientCostBaseUnit,
  resolvedOperationalUnitCostEur,
} from "../../src/lib/ingredient-unit-cost.ts";
import { ingredientLineCostEur } from "../../src/lib/recipe-prep-cost.ts";

const VL = "bjhnlrgodcqoyzddbpbd";
const raw = execSync(`supabase projects api-keys --project-ref ${VL} -o json`, {
  encoding: "utf8",
});
const key = (JSON.parse(raw) as { name: string; api_key: string }[]).find(
  (k) => k.name === "service_role",
)!.api_key;
const sb = createClient(`https://${VL}.supabase.co`, key, { auth: { persistSession: false } });

const names = [
  "Gema líquida",
  "Nata culinária",
  "Aceto balsamico di modena IGP",
  "Manteiga s/sal",
  "Atum em óleo",
  "Pomodori pelati",
  "Água san pellegrino",
];
const { data: ings } = await sb.from("ingredients").select("*");
const { data: matches } = await sb.from("invoice_item_matches").select("*").eq("status", "confirmed");
const { data: items } = await sb.from("invoice_items").select("*");
const itemById = new Map((items ?? []).map((i) => [i.id, i]));

for (const ing of (ings ?? []).filter((i) => names.some((n) => i.name.includes(n.split(" ")[0]!)))) {
  const m = (matches ?? []).find((x) => x.ingredient_id === ing.id);
  const item = m ? itemById.get(m.invoice_item_id) : null;
  const overlay = item ? operationalCostFieldsFromInvoiceLine(item) : null;
  const cat = { current_price: ing.current_price, purchase_quantity: ing.purchase_quantity };
  const fields = overlay ?? cat;
  const tests: [string, number][] = [
    ["g", 100],
    ["kg", 0.2],
    ["ml", 250],
    ["L", 0.5],
    ["un", 2],
  ];
  console.log("\n", ing.name);
  console.log(
    " op catalog",
    resolvedOperationalUnitCostEur(cat),
    "base",
    inferIngredientCostBaseUnit(cat),
  );
  if (overlay) {
    console.log(
      " op overlay",
      resolvedOperationalUnitCostEur(overlay),
      "base",
      inferIngredientCostBaseUnit(overlay),
      overlay,
    );
  }
  for (const [u, q] of tests) {
    const cost = ingredientLineCostEur(q, fields, { recipeUnit: u, ingredientName: ing.name });
    console.log(" ", q, u, "=>", cost);
  }
}
