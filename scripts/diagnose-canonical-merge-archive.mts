/**
 * Read-only: which catalog select tier is used and archive flags for girassol (or any) rows.
 *
 *   npx vite-node scripts/diagnose-canonical-merge-archive.mts
 *   npx vite-node scripts/diagnose-canonical-merge-archive.mts "oleo girassol"
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../src/integrations/supabase/types";
import {
  CANONICAL_MERGE_ARCHIVE_VISIBILITY_PREFIX,
  loadActiveIngredientCatalog,
  loadCanonicalIngredientCatalog,
} from "../src/lib/ingredient-catalog-load";
import { isArchivedIngredientEntry } from "../src/lib/ingredient-canonical";

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
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}

loadEnvFromDotenv();
const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const key =
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY;

if (!url || !key) {
  console.error("Missing VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY in .env");
  process.exit(1);
}

const needle = (process.argv[2] ?? "girassol").toLowerCase();
const client = createClient<Database>(url, key);

const archiveProbe = await client.from("ingredients").select("is_archived").limit(1);
const kindProbe = await client.from("ingredients").select("ingredient_kind").limit(1);

const logs: unknown[] = [];
const logListener = (...args: unknown[]) => {
  if (args[0] === CANONICAL_MERGE_ARCHIVE_VISIBILITY_PREFIX) {
    logs.push({ message: args[1], details: args[2] });
  }
};
const originalInfo = console.info;
console.info = (...args: unknown[]) => {
  logListener(...args);
  originalInfo(...args);
};

const { rows: active, error: activeError } = await loadActiveIngredientCatalog(client);
const { rows: canonical, error: canonicalError } = await loadCanonicalIngredientCatalog(
  client,
  "current_price, user_id, purchase_quantity, purchase_unit, base_unit",
);

console.info = originalInfo;

const { data: rawGirassol } = await client
  .from("ingredients")
  .select("id, name, normalized_name, is_archived, merged_into_ingredient_id, ingredient_kind, user_id, created_at")
  .or(`name.ilike.%${needle}%,normalized_name.ilike.%${needle}%`);

const girassolActive = active.filter((row) =>
  `${row.name ?? ""} ${row.normalized_name ?? ""}`.toLowerCase().includes(needle),
);
const girassolCanonical = canonical.filter((row) =>
  `${row.name ?? ""} ${row.normalized_name ?? ""}`.toLowerCase().includes(needle),
);

console.log(
  JSON.stringify(
    {
      needle,
      migration: {
        is_archived_column: !archiveProbe.error,
        ingredient_kind_column: !kindProbe.error,
        archiveProbeError: archiveProbe.error?.message ?? null,
        kindProbeError: kindProbe.error?.message ?? null,
      },
      loadErrors: { activeError, canonicalError },
      catalogLoadLogs: logs,
      rawDbRowsMatchingNeedle: (rawGirassol ?? []).map((row) => ({
        id: row.id,
        name: row.name,
        is_archived: row.is_archived,
        merged_into_ingredient_id: row.merged_into_ingredient_id,
        ingredient_kind: row.ingredient_kind,
        user_id: row.user_id,
        created_at: row.created_at,
        isArchivedIngredientEntry: isArchivedIngredientEntry(row),
      })),
      activeCatalogMatches: girassolActive.map((row) => ({
        id: row.id,
        name: row.name,
        is_archived: row.is_archived ?? null,
        merged_into_ingredient_id: row.merged_into_ingredient_id ?? null,
      })),
      canonicalCatalogMatches: girassolCanonical.map((row) => ({
        id: row.id,
        name: row.name,
      })),
      duplicateStillVisible:
        girassolCanonical.length > 1 ||
        (rawGirassol ?? []).some((row) => row.is_archived && girassolCanonical.some((c) => c.id === row.id)),
    },
    null,
    2,
  ),
);
