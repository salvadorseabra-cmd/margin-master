/**
 * Phase 1 — Create mathematical-coverage validation recipes in VL.
 * Validation Lab: bjhnlrgodcqoyzddbpbd
 */
import "./env-shim.ts";

import { execSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";

const VL = "bjhnlrgodcqoyzddbpbd";
const PREFIX = "VL-E2E";

const ING = {
  abobora: "9338970d-b55b-4526-be36-ab8497cd9da8",
  aceto: "1757d2a3-e299-4d5f-84d2-61e01ae4aed4",
  agua: "50783e60-702f-42b2-bccd-0b6a98d7635f",
  alho: "446f3217-9a6f-428a-abc6-10927a958168",
  anchoas: "c811f67f-df4d-4194-ba8b-7a15d4af38bd",
  arroz: "07a55cf5-b98d-4aae-b330-b4944882e4d3",
  atum: "0f30ccb3-bb47-40bb-83cc-ae2a4018066d",
  chocolate: "43cba6b0-880e-4760-ab78-8d9a9c1b6f86",
  courgettes: "6c7ab001-9f87-448e-9b34-87d3aa21f9ca",
  farinePizza: "3976c267-f8aa-4173-abc7-55410811f399",
  ginger: "7aa5dd9e-44c2-43e3-b673-890ad6d6da41",
  gorgonzola: "1526106c-7bac-4b70-bd51-7b0fd5cc89ed",
  hortela: "6e3011e0-b160-48c9-867c-1234cd743802",
  manjericao: "8fe3ab95-b508-48b5-9890-d737dee78cc6",
  manteiga: "30fd4652-be74-47eb-afb1-60b2a15a14fc",
  paccheri: "6a7d0b80-764a-40e8-a3fb-9361e7d9ee98",
  mortadella: "9c853a47-82fe-4d6d-88bc-f0aa007e0a59",
  mozzarella: "2a99cecd-08fb-48d5-87cf-cc9ea5282a6d",
  nata: "3d1af48c-be3c-494a-9e0f-be267fc9388b",
  pepino: "963d3a72-6f74-427b-8658-8d98b6a8d8df",
  pomodori: "52f7bf70-eeca-4039-987d-241b35248119",
  ricotta: "6ec0bc6b-409a-4db2-b21f-fb01394f0014",
  bresaola: "31d6da3f-d812-4836-9086-92a5616250d1",
  roloCabra: "b091e1d0-e7e2-49a8-a9a7-f61c8a4d4263",
  salada: "47cd8362-79f4-4285-8491-f016229eaa21",
  stracciatella: "d96e176e-7fa7-438d-beda-6b9d7fe7b41d",
} as const;

type LineSpec = {
  ingredient_id?: string;
  sub_recipe_key?: string;
  quantity: number;
  unit: string;
};

type RecipeSpec = {
  key: string;
  name: string;
  type: "dish" | "prep";
  category: string;
  selling_price: number | null;
  output_quantity?: number;
  output_unit?: string;
  lines: LineSpec[];
};

const RECIPES: RecipeSpec[] = [
  {
    key: "pizza",
    name: `${PREFIX} Pizza Margherita`,
    type: "dish",
    category: "Mains",
    selling_price: 12,
    lines: [
      { ingredient_id: ING.farinePizza, quantity: 0.32, unit: "kg" },
      { ingredient_id: ING.mozzarella, quantity: 2, unit: "un" },
      { ingredient_id: ING.pomodori, quantity: 400, unit: "g" },
      { ingredient_id: ING.manjericao, quantity: 12, unit: "g" },
    ],
  },
  {
    key: "pasta",
    name: `${PREFIX} Pasta Stracciatella`,
    type: "dish",
    category: "Mains",
    selling_price: 14.5,
    lines: [
      { ingredient_id: ING.paccheri, quantity: 2, unit: "un" },
      { ingredient_id: ING.mortadella, quantity: 80, unit: "g" },
      { ingredient_id: ING.stracciatella, quantity: 1, unit: "un" },
      { ingredient_id: ING.gorgonzola, quantity: 30, unit: "g" },
    ],
  },
  {
    key: "salad",
    name: `${PREFIX} Salad Gorgonzola`,
    type: "dish",
    category: "Starters",
    selling_price: 9,
    lines: [
      { ingredient_id: ING.salada, quantity: 100, unit: "g" },
      { ingredient_id: ING.pepino, quantity: 150, unit: "g" },
      { ingredient_id: ING.gorgonzola, quantity: 40, unit: "g" },
      { ingredient_id: ING.aceto, quantity: 20, unit: "ml" },
    ],
  },
  {
    key: "sandwich",
    name: `${PREFIX} Sandwich Bresaola`,
    type: "dish",
    category: "Mains",
    selling_price: 11,
    lines: [
      { ingredient_id: ING.bresaola, quantity: 30, unit: "g" },
      { ingredient_id: ING.roloCabra, quantity: 1, unit: "un" },
      { ingredient_id: ING.hortela, quantity: 6, unit: "g" },
    ],
  },
  {
    key: "sauce",
    name: `${PREFIX} Tomato Sauce`,
    type: "prep",
    category: "Prep",
    selling_price: null,
    output_quantity: 1000,
    output_unit: "ml",
    lines: [
      { ingredient_id: ING.pomodori, quantity: 1, unit: "un" },
      { ingredient_id: ING.alho, quantity: 20, unit: "g" },
      { ingredient_id: ING.manteiga, quantity: 25, unit: "g" },
    ],
  },
  {
    key: "pasta-sauce",
    name: `${PREFIX} Pasta with Sauce`,
    type: "dish",
    category: "Mains",
    selling_price: 13,
    lines: [
      { ingredient_id: ING.paccheri, quantity: 1, unit: "un" },
      { sub_recipe_key: "sauce", quantity: 200, unit: "ml" },
    ],
  },
  {
    key: "dessert",
    name: `${PREFIX} Dessert Nata`,
    type: "dish",
    category: "Desserts",
    selling_price: 7.5,
    lines: [
      { ingredient_id: ING.chocolate, quantity: 2, unit: "un" },
      { ingredient_id: ING.nata, quantity: 300, unit: "ml" },
      { ingredient_id: ING.ricotta, quantity: 1, unit: "un" },
    ],
  },
  {
    key: "weight",
    name: `${PREFIX} Weight kg/g`,
    type: "dish",
    category: "Mains",
    selling_price: 8,
    lines: [
      { ingredient_id: ING.abobora, quantity: 1.5, unit: "kg" },
      { ingredient_id: ING.courgettes, quantity: 280, unit: "g" },
    ],
  },
  {
    key: "countable",
    name: `${PREFIX} Countable Units`,
    type: "dish",
    category: "Starters",
    selling_price: 10,
    lines: [
      { ingredient_id: ING.anchoas, quantity: 3, unit: "un" },
      { ingredient_id: ING.atum, quantity: 2, unit: "un" },
    ],
  },
  {
    key: "multipack",
    name: `${PREFIX} Multipack`,
    type: "dish",
    category: "Drinks",
    selling_price: 6,
    lines: [
      { ingredient_id: ING.ginger, quantity: 6, unit: "un" },
      { ingredient_id: ING.arroz, quantity: 2, unit: "un" },
    ],
  },
  {
    key: "liquid",
    name: `${PREFIX} Liquid ml/L`,
    type: "dish",
    category: "Drinks",
    selling_price: 5,
    lines: [
      { ingredient_id: ING.agua, quantity: 600, unit: "ml" },
      { ingredient_id: ING.nata, quantity: 0.25, unit: "L" },
      { ingredient_id: ING.aceto, quantity: 15, unit: "ml" },
    ],
  },
  {
    key: "charcuterie",
    name: `${PREFIX} Charcuterie kg`,
    type: "dish",
    category: "Mains",
    selling_price: 15,
    lines: [
      { ingredient_id: ING.mortadella, quantity: 0.18, unit: "kg" },
      { ingredient_id: ING.bresaola, quantity: 0.075, unit: "kg" },
    ],
  },
];

function projectKey(): string {
  const raw = execSync(`supabase projects api-keys --project-ref ${VL} -o json`, {
    encoding: "utf8",
    timeout: 60_000,
  });
  return (JSON.parse(raw) as { name: string; api_key: string }[]).find(
    (k) => k.name === "service_role",
  )!.api_key;
}

const sb = createClient(`https://${VL}.supabase.co`, projectKey(), {
  auth: { persistSession: false },
});

const { data: sampleIng } = await sb.from("ingredients").select("user_id").limit(1);
const userId = sampleIng?.[0]?.user_id;
if (!userId) throw new Error("No VL user_id from ingredients");

const { data: existing } = await sb
  .from("recipes")
  .select("id, name")
  .like("name", `${PREFIX}%`);

const existingByName = new Map((existing ?? []).map((r) => [r.name, r.id]));
const recipeIdByKey = new Map<string, string>();

for (const spec of RECIPES.filter((r) => r.type === "prep" || !r.lines.some((l) => l.sub_recipe_key))) {
  if (existingByName.has(spec.name)) {
    recipeIdByKey.set(spec.key, existingByName.get(spec.name)!);
    continue;
  }
  const { data: created, error } = await sb
    .from("recipes")
    .insert({
      user_id: userId,
      name: spec.name,
      category: spec.category,
      type: spec.type,
      selling_price: spec.selling_price,
      output_quantity: spec.output_quantity ?? null,
      output_unit: spec.output_unit ?? null,
    })
    .select("id")
    .single();
  if (error) throw new Error(`recipe ${spec.name}: ${error.message}`);
  recipeIdByKey.set(spec.key, created!.id);
  existingByName.set(spec.name, created!.id);
}

for (const spec of RECIPES.filter((r) => r.lines.some((l) => l.sub_recipe_key))) {
  if (existingByName.has(spec.name)) {
    recipeIdByKey.set(spec.key, existingByName.get(spec.name)!);
    continue;
  }
  const { data: created, error } = await sb
    .from("recipes")
    .insert({
      user_id: userId,
      name: spec.name,
      category: spec.category,
      type: spec.type,
      selling_price: spec.selling_price,
    })
    .select("id")
    .single();
  if (error) throw new Error(`recipe ${spec.name}: ${error.message}`);
  recipeIdByKey.set(spec.key, created!.id);
  existingByName.set(spec.name, created!.id);
}

let linesInserted = 0;
for (const spec of RECIPES) {
  const recipeId = recipeIdByKey.get(spec.key);
  if (!recipeId) continue;

  const { count } = await sb
    .from("recipe_ingredients")
    .select("*", { count: "exact", head: true })
    .eq("recipe_id", recipeId);
  if ((count ?? 0) > 0) continue;

  const rows = spec.lines.map((line) => {
    if (line.sub_recipe_key) {
      const subId = recipeIdByKey.get(line.sub_recipe_key);
      if (!subId) throw new Error(`missing sub-recipe ${line.sub_recipe_key}`);
      return {
        user_id: userId,
        recipe_id: recipeId,
        ingredient_id: null,
        sub_recipe_id: subId,
        quantity: line.quantity,
        unit: line.unit,
      };
    }
    return {
      user_id: userId,
      recipe_id: recipeId,
      ingredient_id: line.ingredient_id,
      sub_recipe_id: null,
      quantity: line.quantity,
      unit: line.unit,
    };
  });

  const { error } = await sb.from("recipe_ingredients").insert(rows);
  if (error) throw new Error(`lines ${spec.name}: ${error.message}`);
  linesInserted += rows.length;
}

console.log(
  JSON.stringify({
    recipes: RECIPES.length,
    recipeIds: Object.fromEntries(recipeIdByKey),
    linesInserted,
    userId,
  }),
);
