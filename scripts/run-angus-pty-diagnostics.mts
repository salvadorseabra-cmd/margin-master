import { createClient } from "@supabase/supabase-js";
import { loadEnvFiles } from "./load-env.mts";
import type { Database } from "../src/integrations/supabase/types";
import { filterActiveCatalogIngredients } from "../src/lib/ingredient-canonical";
import { diagnoseIngredientCatalogIdentity } from "../src/lib/ingredient-identity-diagnostics";
import { buildCanonicalIngredientPickerOptions } from "../src/lib/ingredient-picker-options";
import { findAngusPattyMergeCluster, type IngredientMergeCatalogRow } from "../src/lib/ingredient-merge";

loadEnvFiles();
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
