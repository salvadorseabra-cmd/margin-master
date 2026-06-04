/**
 * Read-only audit of ingredient_aliases vs canonical ingredient names.
 * Does NOT mutate the database.
 *
 *   npx vite-node scripts/audit-ingredient-alias-integrity.mts
 *   npx vite-node scripts/audit-ingredient-alias-integrity.mts --min-confidence 0.5
 */
import { createClient } from "@supabase/supabase-js";
import { loadEnvFiles } from "./load-env.mts";
import type { Database } from "../src/integrations/supabase/types";
import {
  auditIngredientAliasRows,
  type IngredientAliasAuditCanonicalRow,
  type IngredientAliasAuditRow,
} from "../src/lib/ingredient-alias-integrity-audit";

function parseMinConfidence(argv: string[]): number {
  const flagIndex = argv.indexOf("--min-confidence");
  if (flagIndex < 0) return 1;
  const raw = argv[flagIndex + 1];
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : 1;
}

loadEnvFiles();
const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const key =
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY;

if (!url || !key) {
  console.error("Missing VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY in .env");
  process.exit(1);
}

const minConfidence = parseMinConfidence(process.argv.slice(2));
const client = createClient<Database>(url, key);

const [aliasResult, ingredientResult] = await Promise.all([
  client
    .from("ingredient_aliases")
    .select("id, ingredient_id, alias_name, normalized_alias"),
  client.from("ingredients").select("id, name"),
]);

if (aliasResult.error) {
  console.error("ingredient_aliases fetch failed:", aliasResult.error.message);
  process.exit(1);
}
if (ingredientResult.error) {
  console.error("ingredients fetch failed:", ingredientResult.error.message);
  process.exit(1);
}

const canonicalById = new Map<string, IngredientAliasAuditCanonicalRow>();
for (const row of ingredientResult.data ?? []) {
  const id = row.id?.trim();
  if (!id) continue;
  canonicalById.set(id, { id, name: row.name?.trim() || id });
}

const audits = auditIngredientAliasRows(
  (aliasResult.data ?? []) as IngredientAliasAuditRow[],
  canonicalById,
).filter((row) => row.confidence < minConfidence);

console.log(
  JSON.stringify(
    {
      readOnly: true,
      suspiciousCount: audits.length,
      minConfidence,
      rows: audits.map((row) => ({
        alias_id: row.aliasId,
        alias_name: row.aliasName,
        canonical_id: row.canonicalId,
        canonical_name: row.canonicalName,
        confidence: Number(row.confidence.toFixed(3)),
        reason_flags: row.reasonFlags,
      })),
    },
    null,
    2,
  ),
);
