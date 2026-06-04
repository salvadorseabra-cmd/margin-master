/**
 * Full orphan dependency diagnostics for one canonical ingredient.
 *
 *   npx vite-node scripts/inspect-ingredient-dependencies.mts PALHA
 *   npx vite-node scripts/inspect-ingredient-dependencies.mts --id <uuid>
 *   npx vite-node scripts/inspect-ingredient-dependencies.mts PALHA --storage-snapshot ./browser-storage.json
 */
import { createClient } from "@supabase/supabase-js";
import { loadEnvFiles } from "./load-env.mts";
import type { Database } from "../src/integrations/supabase/types";
import {
  filterActiveCatalogIngredients,
  type IngredientCanonicalInput,
} from "../src/lib/ingredient-canonical";
import { INGREDIENT_KIND_CANONICAL, resolveIngredientKind } from "../src/lib/ingredient-kind";
import { findActiveCanonicalIdsByNormalizedName } from "../src/lib/ingredient-alias-reassignment";
import {
  formatDependencyDiagnosticsTable,
  inspectCanonicalIngredientDependencies,
  summarizeOrphanBlockingChecks,
  type BrowserStorageDependencySnapshot,
} from "../src/lib/ingredient-orphan-diagnostics";
import { isIngredientOperationallyOrphaned } from "../src/lib/ingredient-orphan-detection";

function argValue(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  if (idx < 0) return undefined;
  return process.argv[idx + 1]?.trim() || undefined;
}

loadEnvFiles();
const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const key =
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY;

if (!url || !key) {
  console.error("Missing VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY in .env");
  process.exit(1);
}

const idArg = argValue("--id");
const nameArg = process.argv
  .slice(2)
  .find((a) => !a.startsWith("-") && !a.endsWith(".mts") && !a.includes("inspect-ingredient"));
const storageSnapshotPath = argValue("--storage-snapshot");
const userId =
  process.env.MARGINLY_USER_ID?.trim() || argValue("--user-id") || "";

const client = createClient<Database>(url, key);

const selectAttempts = [
  "id, name, normalized_name, unit, ingredient_kind, is_archived, merged_into_ingredient_id, user_id",
  "id, name, normalized_name, unit, is_archived, merged_into_ingredient_id, user_id",
] as const;

let rows: IngredientCanonicalInput[] = [];
for (const select of selectAttempts) {
  const { data, error } = await client.from("ingredients").select(select);
  if (!error) {
    rows = (data ?? []) as IngredientCanonicalInput[];
    break;
  }
}

const active = filterActiveCatalogIngredients(rows).filter(
  (entry) => resolveIngredientKind(entry) === INGREDIENT_KIND_CANONICAL,
);

const resolvedUserId =
  userId || (active[0] as { user_id?: string | null } | undefined)?.user_id?.trim() || "";

if (!resolvedUserId) {
  console.error("Set MARGINLY_USER_ID or pass --user-id");
  process.exit(1);
}

let ingredientId = idArg;
if (!ingredientId && nameArg) {
  const ids = findActiveCanonicalIdsByNormalizedName(active, [nameArg]);
  const norm = [...ids.keys()][0];
  ingredientId = norm ? ids.get(norm) : undefined;
}

if (!ingredientId) {
  console.error("Pass canonical name (e.g. PALHA) or --id <uuid>");
  process.exit(1);
}

let browserStorage: BrowserStorageDependencySnapshot | undefined;
if (storageSnapshotPath) {
  const raw = readFileSync(storageSnapshotPath, "utf8");
  browserStorage = JSON.parse(raw) as BrowserStorageDependencySnapshot;
}

const { report, error } = await inspectCanonicalIngredientDependencies({
  client,
  ingredientId,
  userId: resolvedUserId,
  catalog: active,
  browserStorage,
});

if (error || !report) {
  console.error(JSON.stringify({ error: error ?? "no report" }, null, 2));
  process.exit(1);
}

console.log(formatDependencyDiagnosticsTable(report));
console.log("");
console.log("--- isIngredientOperationallyOrphaned blocking checks ---");
for (const row of summarizeOrphanBlockingChecks(report)) {
  console.log(
    `${row.blocks ? "BLOCKS" : "ok    "} ${row.check} (${row.count}) — ${row.label}`,
  );
}
console.log(
  `isIngredientOperationallyOrphaned(report) = ${isIngredientOperationallyOrphaned(report.orphanReport)}`,
);
console.log("");
console.log(JSON.stringify(report, null, 2));

process.exit(report.isOperationallyOrphaned ? 0 : 2);
