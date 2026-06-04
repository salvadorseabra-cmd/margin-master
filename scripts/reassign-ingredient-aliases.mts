/**
 * Reassign ingredient_aliases from one canonical to another (no ingredient merge).
 *
 * PALHA → Batata palha (default when no --from/--to):
 *   npx vite-node scripts/reassign-ingredient-aliases.mts
 *   npx vite-node scripts/reassign-ingredient-aliases.mts --apply
 *
 * Explicit ids or names:
 *   npx vite-node scripts/reassign-ingredient-aliases.mts --from-name PALHA --to-name "Batata palha" --apply
 *   npx vite-node scripts/reassign-ingredient-aliases.mts --from-id <uuid> --to-id <uuid> --apply
 */
import { createClient } from "@supabase/supabase-js";
import { loadEnvFiles } from "./load-env.mts";
import type { Database } from "../src/integrations/supabase/types";
import { filterActiveCatalogIngredients } from "../src/lib/ingredient-canonical";
import { loadIngredientCatalogIncludingArchived } from "../src/lib/ingredient-catalog-load";
import { INGREDIENT_KIND_CANONICAL, resolveIngredientKind } from "../src/lib/ingredient-kind";
import {
  previewIngredientAliasReassignment,
  reassignAliasesAndArchiveIfOrphan,
  resolveCanonicalIngredientForReassignment,
  runPalhaToBatataPalhaAliasReassignment,
} from "../src/lib/ingredient-alias-reassignment";

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
const palhaPreset =
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
  console.error(
    "Set MARGINLY_USER_ID or pass --user-id (needed to archive orphan after reassignment).",
  );
  process.exit(1);
}

if (!apply) {
  if (palhaPreset) {
    const sourceResolution = await resolveCanonicalIngredientForReassignment({
      client,
      userId: resolvedUserId,
      hints: {
        explicitIngredientId: fromIdArg,
        normalizedNames: ["PALHA"],
        aliasSearchTerms: ["PALHA", "palha", "BAT PAL", "BAT PALHA"],
        legacyPalhaFuzzyCatalog: true,
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
    const fromId = sourceResolution.ingredientId;
    const toId = targetResolution.ingredientId;
    if (!fromId || !toId) {
      console.log(
        JSON.stringify(
          {
            mode: "dry-run",
            preset: "palha_to_batata_palha",
            error: !fromId ? "PALHA not found" : "Batata palha not found",
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
    console.log(
      JSON.stringify(
        {
          mode: "dry-run",
          preset: "palha_to_batata_palha",
          fromIngredientId: fromId,
          toIngredientId: toId,
          userId: resolvedUserId,
          sourceResolution,
          targetResolution,
          preview,
          note: "Re-run with --apply to write DB updates and archive PALHA if orphan.",
        },
        null,
        2,
      ),
    );
    process.exit(0);
  }

  const sourceResolution = fromNameArg
    ? await resolveCanonicalIngredientForReassignment({
        client,
        userId: resolvedUserId,
        hints: {
          explicitIngredientId: fromIdArg,
          normalizedNames: [fromNameArg],
          catalog: active,
          activeOnly: true,
        },
      })
    : null;
  const targetResolution = toNameArg
    ? await resolveCanonicalIngredientForReassignment({
        client,
        userId: resolvedUserId,
        hints: {
          explicitIngredientId: toIdArg,
          normalizedNames: [toNameArg],
          catalog: active,
          activeOnly: true,
        },
      })
    : null;
  const fromId = fromIdArg ?? sourceResolution?.ingredientId;
  const toId = toIdArg ?? targetResolution?.ingredientId;
  if (!fromId || !toId) {
    console.error("Could not resolve --from/--to; pass ids or valid --from-name/--to-name");
    process.exit(1);
  }
  const preview = await previewIngredientAliasReassignment({
    client,
    fromIngredientId: fromId,
    toIngredientId: toId,
  });
  console.log(JSON.stringify({ mode: "dry-run", fromId, toId, preview }, null, 2));
  process.exit(0);
}

let result;
if (palhaPreset) {
  result = await runPalhaToBatataPalhaAliasReassignment({
    client,
    userId: resolvedUserId,
    catalog: canonicalRows,
  });
} else {
  const sourceResolution = fromNameArg
    ? await resolveCanonicalIngredientForReassignment({
        client,
        userId: resolvedUserId,
        hints: {
          explicitIngredientId: fromIdArg,
          normalizedNames: [fromNameArg],
          catalog: active,
          activeOnly: true,
        },
      })
    : null;
  const targetResolution = toNameArg
    ? await resolveCanonicalIngredientForReassignment({
        client,
        userId: resolvedUserId,
        hints: {
          explicitIngredientId: toIdArg,
          normalizedNames: [toNameArg],
          catalog: active,
          activeOnly: true,
        },
      })
    : null;
  const fromIngredientId = fromIdArg ?? sourceResolution?.ingredientId;
  const toIngredientId = toIdArg ?? targetResolution?.ingredientId;
  if (!fromIngredientId || !toIngredientId) {
    console.error("Could not resolve from/to for apply");
    process.exit(1);
  }
  result = await reassignAliasesAndArchiveIfOrphan({
    client,
    fromIngredientId,
    toIngredientId,
    userId: resolvedUserId,
    catalog: active,
  });
}

console.log(
  JSON.stringify(
    {
      mode: "apply",
      userId: resolvedUserId,
      fromIngredientId: "fromIngredientId" in result ? result.fromIngredientId : undefined,
      toIngredientId: "toIngredientId" in result ? result.toIngredientId : undefined,
      aliasesReassigned: result.aliasesReassigned,
      archived: result.archived,
      resolutionError: "resolutionError" in result ? result.resolutionError : null,
      resolutionDiagnostics:
        "resolutionDiagnostics" in result ? result.resolutionDiagnostics : null,
      error: result.error?.message ?? null,
      archiveError: result.archiveError?.message ?? null,
      sourceOrphanReport: result.sourceOrphanReport,
    },
    null,
    2,
  ),
);

process.exit(result.error ? 1 : 0);
