/**
 * Repair legacy canonical ingredients persisted with invoice shorthand names.
 * Updates only ingredients.name and ingredients.normalized_name (preserves id, aliases, recipes).
 *
 *   npx vite-node scripts/repair-canonical-ingredient-names.mts           # dry-run
 *   npx vite-node scripts/repair-canonical-ingredient-names.mts --apply    # write
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../src/integrations/supabase/types";
import { filterActiveCatalogIngredients } from "../src/lib/ingredient-canonical";
import { INGREDIENT_KIND_CANONICAL, resolveIngredientKind } from "../src/lib/ingredient-kind";
import { suggestCanonicalRootNameRepair } from "../src/lib/canonical-ingredient-operational-name";
import type { IngredientCanonicalInput } from "../src/lib/ingredient-canonical";

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

const apply = process.argv.includes("--apply");
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

const active = filterActiveCatalogIngredients(rows).filter(
  (entry) => resolveIngredientKind(entry) === INGREDIENT_KIND_CANONICAL,
);

const repairs = active
  .map((entry) => suggestCanonicalRootNameRepair(entry))
  .filter((suggestion): suggestion is NonNullable<typeof suggestion> => suggestion != null);

console.log(
  JSON.stringify(
    {
      mode: apply ? "apply" : "dry-run",
      selectUsed,
      activeCanonicalCount: active.length,
      repairCount: repairs.length,
      repairs: repairs.map((r) => ({
        id: r.ingredientId,
        from: r.currentName,
        to: r.suggestedName,
        normalized_name: r.suggestedNormalizedName,
        reason: r.reason,
      })),
    },
    null,
    2,
  ),
);

if (!apply) {
  console.error("\nDry-run only. Re-run with --apply to update ingredients.name / normalized_name.");
  process.exit(0);
}

let updated = 0;
let failed = 0;
for (const repair of repairs) {
  const { error } = await client
    .from("ingredients")
    .update({
      name: repair.suggestedName,
      normalized_name: repair.suggestedNormalizedName,
    })
    .eq("id", repair.ingredientId);
  if (error) {
    failed += 1;
    console.error("update_failed", { id: repair.ingredientId, message: error.message });
    continue;
  }
  updated += 1;
}

console.log(JSON.stringify({ updated, failed }, null, 2));
process.exit(failed > 0 ? 1 : 0);
