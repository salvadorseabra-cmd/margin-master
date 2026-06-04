/**
 * Read-only dump of catalog pollution rows from live Supabase (requires .env).
 *
 *   npx vite-node scripts/dump-catalog-pollution.mts
 */
import { createClient } from "@supabase/supabase-js";
import { loadEnvFiles } from "./load-env.mts";
import type { Database } from "../src/integrations/supabase/types";
import { filterActiveCatalogIngredients } from "../src/lib/ingredient-canonical";
import {
  buildCatalogPollutionRowDiagnostics,
  detectCatalogLeakRows,
} from "../src/lib/ingredient-catalog-diagnostics";
import type { IngredientCanonicalInput } from "../src/lib/ingredient-canonical";

loadEnvFiles();
const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const key =
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY;

if (!url || !key) {
  console.error("Missing VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY in .env");
  process.exit(1);
}

const client = createClient<Database>(url, key);

const selectAttempts = [
  "id, name, normalized_name, unit, ingredient_kind, is_archived, merged_into_ingredient_id",
  "id, name, normalized_name, unit, is_archived, merged_into_ingredient_id",
  "id, name, normalized_name, unit, ingredient_kind",
  "id, name, normalized_name, unit",
] as const;

let rows: IngredientCanonicalInput[] = [];
let selectUsed = selectAttempts[0];
for (const select of selectAttempts) {
  const { data, error } = await client.from("ingredients").select(select);
  if (!error) {
    rows = (data ?? []) as IngredientCanonicalInput[];
    selectUsed = select;
    break;
  }
}

const active = filterActiveCatalogIngredients(rows);
const leaks = detectCatalogLeakRows(active);
const entryById = new Map(active.map((e) => [e.id?.trim(), e] as const).filter(([id]) => id));

const pollutionRows = leaks.map((leak) => {
  const entry = entryById.get(leak.id);
  return entry
    ? buildCatalogPollutionRowDiagnostics(entry, leak)
    : { leak, note: "entry_not_found_in_active_catalog" };
});

console.log(
  JSON.stringify(
    {
      selectUsed,
      activeRowCount: active.length,
      pollutionCount: leaks.length,
      byReason: Object.groupBy(leaks, (l) => l.reason),
      pollutionRows,
    },
    null,
    2,
  ),
);
