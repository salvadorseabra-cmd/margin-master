import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../src/integrations/supabase/types";
import { buildReferenceCountsFromRows, selectCanonicalIngredientId, INGREDIENT_FK_REASSIGNMENT_TARGETS } from "../src/lib/ingredient-merge";

function loadEnv() {
  const p = join(process.cwd(), ".env");
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq < 0) continue;
    const k = t.slice(0, eq).trim();
    let v = t.slice(eq + 1).trim();
    if (!process.env[k]) process.env[k] = v;
  }
}
loadEnv();
const client = createClient<Database>(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_PUBLISHABLE_KEY!);
const ids = ["bd5a31d3-87ee-41b6-91c2-aba5e848ddd3", "bc37dfb3-6383-4af9-b438-93228dc8d4df", "5beaebbc-a3ad-4b23-8806-0f4fb75522cf"];
const rowsByTable: Record<string, { ingredient_id: string }[]> = {};
for (const target of INGREDIENT_FK_REASSIGNMENT_TARGETS) {
  const { data, error } = await client.from(target.table).select("ingredient_id").in("ingredient_id", ids);
  if (error) throw error;
  rowsByTable[target.table] = data ?? [];
}
const refs = buildReferenceCountsFromRows(rowsByTable);
const catalog = ids.map((id) => ({ id, name: "ANGUS PTY", normalized_name: "angus pty", created_at: null }));
console.log("refs", Object.fromEntries(ids.map((id) => [id, refs.get(id)])));
console.log("canonical", selectCanonicalIngredientId(ids, catalog, refs));
