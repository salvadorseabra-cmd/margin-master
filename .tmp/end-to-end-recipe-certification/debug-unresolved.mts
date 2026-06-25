import "./env-shim.ts";
import { execSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import { operationalCostFieldsFromInvoiceLine } from "../../src/lib/ingredient-auto-persist.ts";
import { ingredientLineCostEur } from "../../src/lib/recipe-prep-cost.ts";
import {
  enrichRecipeLinesForOperationalCost,
  buildOperationalIngredientCostById,
  resolveRecipeLineOperationalCost,
} from "../../src/lib/resolve-operational-ingredient-cost.ts";

const VL = "bjhnlrgodcqoyzddbpbd";
const key = JSON.parse(
  execSync(`supabase projects api-keys --project-ref ${VL} -o json`, { encoding: "utf8" }),
).find((k: { name: string }) => k.name === "service_role").api_key;
const sb = createClient(`https://${VL}.supabase.co`, key, { auth: { persistSession: false } });

const probes = [
  { id: "8fe3ab95-b508-48b5-9890-d737dee78cc6", qty: 12, unit: "g" },
  { id: "47cd8362-79f4-4285-8491-f016229eaa21", qty: 100, unit: "g" },
  { id: "7aa5dd9e-44c2-43e3-b673-890ad6d6da41", qty: 6, unit: "un" },
  { id: "3976c267-f8aa-4173-abc7-55410811f399", qty: 0.32, unit: "kg" },
];

const { data: ings } = await sb.from("ingredients").select("*").in(
  "id",
  probes.map((p) => p.id),
);
const { data: matches } = await sb.from("invoice_item_matches").select("*").eq("status", "confirmed");
const { data: items } = await sb.from("invoice_items").select("*");
const itemById = new Map((items ?? []).map((i) => [i.id, i]));
const catalog = buildOperationalIngredientCostById(
  (ings ?? []).map((i) => ({
    id: i.id,
    current_price: i.current_price,
    purchase_quantity: i.purchase_quantity,
  })),
);
const overlay = new Map();
for (const ing of ings ?? []) {
  const m = (matches ?? []).find((x) => x.ingredient_id === ing.id);
  const item = m ? itemById.get(m.invoice_item_id) : null;
  if (item) {
    const f = operationalCostFieldsFromInvoiceLine(item);
    if (f)
      overlay.set(ing.id, {
        fields: f,
        invoiceDate: "2026-01-01",
        latestInvoiceUnitCost: null,
        supplierLabel: null,
      });
  }
}

for (const p of probes) {
  const ing = (ings ?? []).find((i) => i.id === p.id)!;
  const resolved = resolveRecipeLineOperationalCost(
    p.id,
    p.qty,
    catalog,
    ing,
    overlay,
    { recipeUnit: p.unit, ingredientName: ing.name },
  );
  console.log(
    ing.name,
    "source",
    resolved.source,
    "fields",
    resolved.fields,
    "lineCost",
    resolved.lineCostEur,
  );
}
