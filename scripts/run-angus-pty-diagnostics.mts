import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../src/integrations/supabase/types";
import { filterActiveCatalogIngredients } from "../src/lib/ingredient-canonical";
import { diagnoseIngredientCatalogIdentity } from "../src/lib/ingredient-identity-diagnostics";
import { buildCanonicalIngredientPickerOptions } from "../src/lib/ingredient-picker-options";
import { findAngusPattyMergeCluster, type IngredientMergeCatalogRow } from "../src/lib/ingredient-merge";

function loadEnvFromDotenv() {
  const envPath = join(process.cwd(), ".env");
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq < 0) continue;
    const key = t.slice(0, eq).trim();
    let val = t.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
    if (!process.env[key]) process.env[key] = val;
  }
}

loadEnvFromDotenv();
const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY;
const client = createClient<Database>(url!, key!);

const { data: all } = await client.from("ingredients").select("id, name, normalized_name, unit, created_at");
const catalog = (all ?? []) as IngredientMergeCatalogRow[];
const active = filterActiveCatalogIngredients(catalog);
const angusAll = catalog.filter((r) => /angus|ang\s*pty/i.test(`${r.name} ${r.normalized_name}`));
const angusActive = active.filter((r) => /angus|ang\s*pty/i.test(`${r.name} ${r.normalized_name}`));
const picker = buildCanonicalIngredientPickerOptions(active).filter((o) => /angus|ang\s*pty/i.test(o.name));
const cluster = findAngusPattyMergeCluster(active);
const diag = diagnoseIngredientCatalogIdentity(active);
console.log(JSON.stringify({
  migrationArchiveColumns: !!(await client.from("ingredients").select("is_archived").limit(1)).error === false,
  angusRowCountAll: angusAll.length,
  angusRowsAll: angusAll.map((r) => ({ id: r.id, name: r.name, created_at: r.created_at })),
  angusActiveCount: angusActive.length,
  angusPickerOptions: picker,
  findAngusPattyMergeCluster: cluster,
  angusOperationalClusters: diag.operationalDuplicateClusters.filter((c) => c.displayNames.some((n) => /angus|ang\s*pty/i.test(n))),
  activeCatalogTotal: active.length,
}, null, 2));
