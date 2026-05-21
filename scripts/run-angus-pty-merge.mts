/**
 * One-off: ANGUS PTY canonical merge against live Supabase (do not commit).
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../src/integrations/supabase/types";
import { loadConfirmedIngredientAliasMap } from "../src/lib/ingredient-alias-memory";
import { filterActiveCatalogIngredients } from "../src/lib/ingredient-canonical";
import { diagnoseIngredientCatalogIdentity } from "../src/lib/ingredient-identity-diagnostics";
import { buildCanonicalIngredientPickerOptions } from "../src/lib/ingredient-picker-options";
import {
  buildIngredientMergePlanFromCluster,
  buildReferenceCountsFromRows,
  CANONICAL_SELECTION_POLICY,
  findAngusPattyMergeCluster,
  INGREDIENT_FK_REASSIGNMENT_TARGETS,
  mergeIngredientCluster,
  selectCanonicalIngredientId,
  type IngredientMergeCatalogRow,
  type IngredientFkTable,
} from "../src/lib/ingredient-merge";

function loadEnvFromDotenv() {
  const envPath = join(process.cwd(), ".env");
  if (!existsSync(envPath)) return;
  const raw = readFileSync(envPath, "utf8");
  for (const line of raw.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq < 0) continue;
    const key = t.slice(0, eq).trim();
    let val = t.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}

async function main() {
  loadEnvFromDotenv();
  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const key =
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    console.error("Missing SUPABASE_URL / PUBLISHABLE_KEY");
    process.exit(1);
  }

  const client = createClient<Database>(url, key);

  const CATALOG_SELECT =
    "id, name, normalized_name, unit, created_at, is_archived, merged_into_ingredient_id, merged_at";

  async function fetchAngusRows(includeArchived: boolean) {
    const { data, error } = await client
      .from("ingredients")
      .select(CATALOG_SELECT)
      .or("name.ilike.%angus%,name.ilike.%ang pty%,normalized_name.ilike.%angus%");
    if (error) throw new Error(`ingredients query: ${error.message}`);
    const rows = (data ?? []) as IngredientMergeCatalogRow[];
    return includeArchived ? rows : filterActiveCatalogIngredients(rows);
  }

  async function referenceCountsForIds(ids: string[]) {
    const rowsByTable: Partial<Record<IngredientFkTable, { ingredient_id: string }[]>> = {};
    for (const target of INGREDIENT_FK_REASSIGNMENT_TARGETS) {
      const { data, error } = await client
        .from(target.table)
        .select("ingredient_id")
        .in("ingredient_id", ids);
      if (error) throw new Error(`${target.table}: ${error.message}`);
      rowsByTable[target.table] = (data ?? []) as { ingredient_id: string }[];
    }
    return buildReferenceCountsFromRows(rowsByTable);
  }

  function angusPickerCount(catalog: IngredientMergeCatalogRow[]) {
    const options = buildCanonicalIngredientPickerOptions(catalog);
    return options.filter((o) => /angus|ang\s*pty/i.test(o.name)).length;
  }

  function printPhase(
    label: string,
    allAngus: IngredientMergeCatalogRow[],
    activeCatalog: IngredientMergeCatalogRow[],
  ) {
    const cluster = findAngusPattyMergeCluster(activeCatalog);
    const diag = diagnoseIngredientCatalogIdentity(activeCatalog);
    const angusClusters = diag.operationalDuplicateClusters.filter((c) =>
      c.displayNames.some((n) => /angus|ang\s*pty/i.test(n)),
    );
    console.log(`\n======== ${label} ========`);
    console.log("CANONICAL_SELECTION_POLICY:", CANONICAL_SELECTION_POLICY);
    console.log("angus/pty ingredient rows (query, incl archived):", allAngus.length);
    for (const r of allAngus) {
      console.log("  -", {
        id: r.id,
        name: r.name,
        created_at: r.created_at,
        is_archived: r.is_archived,
        merged_into: r.merged_into_ingredient_id,
      });
    }
    console.log("active catalog count:", activeCatalog.length);
    console.log("findAngusPattyMergeCluster:", cluster);
    console.log("operational angus clusters:", angusClusters);
    console.log("picker ANGUS option count:", angusPickerCount(activeCatalog));
  }

  // Migration probe
  const probe = await client.from("ingredients").select("is_archived").limit(1);
  if (probe.error?.message?.includes("is_archived")) {
    console.error("BLOCKER: merge archive migration not applied:", probe.error.message);
    console.error("Apply: supabase/migrations/20260520120000_ingredient_merge_archive.sql");
    process.exit(2);
  }

  const allAngusBefore = await fetchAngusRows(true);
  const { data: activeBeforeRaw, error: activeErr } = await client
    .from("ingredients")
    .select(CATALOG_SELECT);
  if (activeErr) throw new Error(activeErr.message);
  const activeBefore = filterActiveCatalogIngredients(
    (activeBeforeRaw ?? []) as IngredientMergeCatalogRow[],
  );

  printPhase("BEFORE", allAngusBefore, activeBefore);

  const cluster = findAngusPattyMergeCluster(activeBefore);
  if (!cluster || cluster.ingredientIds.length < 2) {
    console.log("\nNo ANGUS PTY duplicate cluster to merge (already merged or not found).");
    process.exit(0);
  }

  const refs = await referenceCountsForIds(cluster.ingredientIds);
  const planPreview = buildIngredientMergePlanFromCluster(cluster, activeBefore, refs);
  console.log("\nMerge plan preview:", planPreview);
  const selection = selectCanonicalIngredientId(cluster.ingredientIds, activeBefore, refs);
  console.log("canonical selection:", selection);
  for (const id of cluster.ingredientIds) {
    console.log(`  refs ${id}:`, refs.get(id) ?? { total: 0 });
  }

  const confirmedAliases = await loadConfirmedIngredientAliasMap(client);
  const userId =
    (activeBefore[0] as IngredientMergeCatalogRow & { user_id?: string | null })?.user_id ??
    process.env.MARGINLY_USER_ID;
  if (!userId) {
    console.error("Missing user_id on catalog rows and MARGINLY_USER_ID env");
    process.exit(1);
  }

  const mergeResult = await mergeIngredientCluster({
    client,
    userId,
    cluster,
    catalog: activeBefore,
    referenceCounts: refs,
    confirmedAliases,
    canonicalIngredientName:
      activeBefore.find((r) => r.id === planPreview?.canonicalIngredientId)?.name ?? undefined,
  });

  if ("error" in mergeResult && typeof mergeResult.error === "string" && !mergeResult.plan) {
    console.error("Merge failed:", mergeResult.error);
    process.exit(3);
  }

  const execution = mergeResult as Extract<
    Awaited<ReturnType<typeof mergeIngredientCluster>>,
    { plan: NonNullable<unknown> }
  >;

  if (execution.error) {
    console.error("Merge DB error:", execution.error);
    console.log("steps so far:", execution.steps);
    process.exit(4);
  }

  console.log("\n======== MERGE EXECUTED ========");
  console.log("plan:", execution.plan);
  console.log("memoryRewrites:", execution.memoryRewrites);
  const byTable: Record<string, number> = {};
  for (const step of execution.steps) {
    const k = `${step.table}:${step.action}`;
    byTable[k] = (byTable[k] ?? 0) + (step.affectedRows ?? 1);
  }
  console.log("step counts by table/action:", byTable);

  const allAngusAfter = await fetchAngusRows(true);
  const { data: activeAfterRaw } = await client.from("ingredients").select(CATALOG_SELECT);
  const activeAfter = filterActiveCatalogIngredients(
    (activeAfterRaw ?? []) as IngredientMergeCatalogRow[],
  );
  printPhase("AFTER", allAngusAfter, activeAfter);

  const canonicalId = execution.plan.canonicalIngredientId;
  const [recipes, aliases] = await Promise.all([
    client.from("recipe_ingredients").select("id").eq("ingredient_id", canonicalId).limit(3),
    client.from("ingredient_aliases").select("id").eq("ingredient_id", canonicalId).limit(3),
  ]);
  console.log("\nSpot-check canonical FK samples:", {
    recipe_ingredients_ok: !recipes.error,
    recipe_count_sample: recipes.data?.length ?? 0,
    ingredient_aliases_ok: !aliases.error,
    alias_count_sample: aliases.data?.length ?? 0,
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
