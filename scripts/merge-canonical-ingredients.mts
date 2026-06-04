/**
 * Directed canonical merge (aliases + price history + archive; preserves audit rows).
 *
 * BAT shoestr → Batata palha (default when no --from/--to):
 *   npx vite-node scripts/merge-canonical-ingredients.mts
 *   npx vite-node scripts/merge-canonical-ingredients.mts --apply
 *
 * Explicit:
 *   npx vite-node scripts/merge-canonical-ingredients.mts --from-name "BAT shoestr" --to-name "Batata palha" --apply
 */
import { createClient } from "@supabase/supabase-js";
import { loadEnvFiles } from "./load-env.mts";
import type { Database } from "../src/integrations/supabase/types";
import { filterActiveCatalogIngredients } from "../src/lib/ingredient-canonical";
import { loadIngredientCatalogIncludingArchived } from "../src/lib/ingredient-catalog-load";
import { INGREDIENT_KIND_CANONICAL, resolveIngredientKind } from "../src/lib/ingredient-kind";
import {
  previewIngredientAliasReassignment,
  resolveCanonicalIngredientForReassignment,
} from "../src/lib/ingredient-alias-reassignment";
import { runBatShoestrToBatataPalhaMerge } from "../src/lib/canonical-canonical-merge";

function argValue(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  if (idx < 0) return undefined;
  return process.argv[idx + 1]?.trim() || undefined;
}

loadEnvFiles();
const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const key =
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY;
const userId = process.env.MARGINLY_USER_ID || argValue("--user-id");

if (!url || !key) {
  console.error("Missing VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY in .env");
  process.exit(1);
}

const apply = process.argv.includes("--apply");
const fromIdArg = argValue("--from-id");
const toIdArg = argValue("--to-id");
const fromNameArg = argValue("--from-name");
const toNameArg = argValue("--to-name");
const batShoestrPreset =
  !fromIdArg && !toIdArg && !fromNameArg && !toNameArg;

const client = createClient<Database>(url, key);

const { rows: allRows, error: catalogLoadError } =
  await loadIngredientCatalogIncludingArchived(client);
if (catalogLoadError) {
  console.error(catalogLoadError);
  process.exit(1);
}

const canonicalRows = allRows.filter(
  (entry) => resolveIngredientKind(entry) === INGREDIENT_KIND_CANONICAL,
);
const active = filterActiveCatalogIngredients(canonicalRows);

const resolvedUserId =
  userId?.trim() ||
  (canonicalRows[0] as { user_id?: string | null } | undefined)?.user_id?.trim() ||
  (active[0] as { user_id?: string | null } | undefined)?.user_id?.trim() ||
  "";

if (!resolvedUserId) {
  console.error("Set MARGINLY_USER_ID or pass --user-id (required for archive merge).");
  process.exit(1);
}

async function resolvePair(): Promise<{
  fromId: string | null;
  toId: string | null;
  sourceResolution: unknown;
  targetResolution: unknown;
}> {
  if (batShoestrPreset) {
    const sourceResolution = await resolveCanonicalIngredientForReassignment({
      client,
      userId: resolvedUserId,
      hints: {
        explicitIngredientId: fromIdArg,
        normalizedNames: ["BAT shoestr", "bat shoestr"],
        aliasSearchTerms: ["BAT shoestr", "BAT SHOESTR", "bat shoestr", "shoestr"],
        legacyBatShoestrFuzzyCatalog: true,
        excludeNormalizedNames: ["Batata palha"],
        catalog: canonicalRows,
        includeArchived: true,
      },
    });
    const targetResolution = await resolveCanonicalIngredientForReassignment({
      client,
      userId: resolvedUserId,
      hints: {
        explicitIngredientId: toIdArg,
        normalizedNames: ["Batata palha"],
        catalog: canonicalRows,
        activeOnly: true,
      },
    });
    return {
      fromId: sourceResolution.ingredientId,
      toId: targetResolution.ingredientId,
      sourceResolution,
      targetResolution,
    };
  }

  const sourceResolution = fromNameArg || fromIdArg
    ? await resolveCanonicalIngredientForReassignment({
        client,
        userId: resolvedUserId,
        hints: {
          explicitIngredientId: fromIdArg,
          normalizedNames: fromNameArg ? [fromNameArg] : undefined,
          catalog: canonicalRows,
          includeArchived: true,
        },
      })
    : null;
  const targetResolution = toNameArg || toIdArg
    ? await resolveCanonicalIngredientForReassignment({
        client,
        userId: resolvedUserId,
        hints: {
          explicitIngredientId: toIdArg,
          normalizedNames: toNameArg ? [toNameArg] : undefined,
          catalog: canonicalRows,
          activeOnly: true,
        },
      })
    : null;
  return {
    fromId: fromIdArg ?? sourceResolution?.ingredientId ?? null,
    toId: toIdArg ?? targetResolution?.ingredientId ?? null,
    sourceResolution,
    targetResolution,
  };
}

const { fromId, toId, sourceResolution, targetResolution } = await resolvePair();

if (!fromId || !toId) {
  console.log(
    JSON.stringify(
      {
        mode: apply ? "apply" : "dry-run",
        preset: batShoestrPreset ? "bat_shoestr_to_batata_palha" : "custom",
        error: !fromId ? "Source canonical not found" : "Target canonical not found",
        sourceResolution,
        targetResolution,
      },
      null,
      2,
    ),
  );
  process.exit(1);
}

const preview = await previewIngredientAliasReassignment({
  client,
  fromIngredientId: fromId,
  toIngredientId: toId,
});

if (!apply) {
  console.log(
    JSON.stringify(
      {
        mode: "dry-run",
        preset: batShoestrPreset ? "bat_shoestr_to_batata_palha" : "custom",
        fromIngredientId: fromId,
        toIngredientId: toId,
        userId: resolvedUserId,
        sourceResolution,
        targetResolution,
        preview,
        note: "Re-run with --apply to merge dependencies and archive source.",
      },
      null,
      2,
    ),
  );
  process.exit(0);
}

let result;
if (batShoestrPreset) {
  result = await runBatShoestrToBatataPalhaMerge({
    client,
    userId: resolvedUserId,
    catalog: canonicalRows,
    fromIngredientId: fromId,
    toIngredientId: toId,
  });
} else {
  const { mergeCanonicalIngredientDependencies } = await import(
    "../src/lib/canonical-canonical-merge"
  );
  result = await mergeCanonicalIngredientDependencies({
    client,
    fromIngredientId: fromId,
    toIngredientId: toId,
    userId: resolvedUserId,
    targetIngredientName:
      canonicalRows.find((r) => r.id === toId)?.name?.trim() || undefined,
  });
}

console.log(
  JSON.stringify(
    {
      mode: "apply",
      preset: batShoestrPreset ? "bat_shoestr_to_batata_palha" : "custom",
      userId: resolvedUserId,
      fromIngredientId: "fromIngredientId" in result ? result.fromIngredientId : fromId,
      toIngredientId: "toIngredientId" in result ? result.toIngredientId : toId,
      aliasesReassigned: result.aliasesReassigned,
      priceHistoryRowsReassigned: result.priceHistoryRowsReassigned,
      recipeIngredientsReassigned: result.recipeIngredientsReassigned,
      archived: result.archived,
      memoryRewrites: result.memoryRewrites,
      resolutionError: "resolutionError" in result ? result.resolutionError : null,
      resolutionDiagnostics:
        "resolutionDiagnostics" in result ? result.resolutionDiagnostics : null,
      error: result.error?.message ?? null,
    },
    null,
    2,
  ),
);

process.exit(result.error ? 1 : 0);
