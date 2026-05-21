/**
 * Safe canonical ingredient merge — reassign FKs, soft-archive duplicates, preserve audit trail.
 *
 * Canonical selection policy (documented):
 * 1. Prefer the row with the earliest `created_at` (stable historical anchor).
 * 2. Tie-break: highest total FK reference count across child tables.
 * 3. Final tie-break: lexicographically smallest id (deterministic).
 */

import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import { formatCanonicalIngredientDisplayName } from "@/lib/canonical-ingredient-display-name";
import type { IngredientAliasMap, IngredientCanonicalInput } from "@/lib/ingredient-canonical";
import {
  filterActiveCatalogIngredients,
  isArchivedIngredientEntry,
} from "@/lib/ingredient-canonical";
import { isSyntheticCatalogIngredientId } from "@/lib/ingredient-canonical-synthesis";
import { isCanonicalIngredientEntry } from "@/lib/ingredient-kind";
import type { IngredientMergeCluster } from "@/lib/ingredient-merge-hooks";
import { findOperationalDuplicateClusters } from "@/lib/ingredient-identity-diagnostics";
import {
  clearIngredientMatchOverridesForTests,
  ingredientMatchOverrides,
  rememberIngredientMatchOverride,
  type IngredientMatchOverride,
} from "@/lib/ingredient-match-override";
import { remapRejectedIngredientId } from "@/lib/ingredient-rejected-match-memory";
import type { Database } from "@/integrations/supabase/types";

export type AppSupabaseClient = SupabaseClient<Database>;

export const CANONICAL_SELECTION_POLICY = [
  "Prefer oldest created_at (historical anchor).",
  "Tie-break: most FK references across child tables.",
  "Final tie-break: lexicographically smallest ingredient id.",
] as const;

/** Tables/columns that store ingredient_id and must be reassigned on merge. */
export const INGREDIENT_FK_REASSIGNMENT_TARGETS = [
  { table: "ingredient_aliases", column: "ingredient_id" },
  { table: "recipe_ingredients", column: "ingredient_id" },
  { table: "ingredient_price_history", column: "ingredient_id" },
  { table: "recipe_margin_impacts", column: "ingredient_id" },
] as const;

export type IngredientFkTable = (typeof INGREDIENT_FK_REASSIGNMENT_TARGETS)[number]["table"];

export type IngredientMergeCatalogRow = IngredientCanonicalInput & {
  created_at?: string | null;
  is_archived?: boolean | null;
  merged_into_ingredient_id?: string | null;
};

export type IngredientReferenceCounts = Record<IngredientFkTable, number> & { total: number };

export type IngredientMergePlan = {
  canonicalIngredientId: string;
  sourceIngredientIds: string[];
  operationalKey?: string;
  selectionReason: string;
};

export type IngredientMergeValidationIssue =
  | "empty_cluster"
  | "canonical_not_in_cluster"
  | "canonical_is_archived"
  | "source_equals_canonical"
  | "source_is_archived"
  | "source_already_merged";

export type IngredientMergeValidationResult =
  | { ok: true }
  | { ok: false; issues: IngredientMergeValidationIssue[] };

export type IngredientMergeExecutionStep = {
  table: IngredientFkTable | "ingredients_archive";
  action: "update" | "delete" | "merge_recipe_line";
  sourceIngredientId: string;
  affectedRows?: number;
};

export type IngredientMergeExecutionResult = {
  plan: IngredientMergePlan;
  steps: IngredientMergeExecutionStep[];
  error: PostgrestError | null;
};

export type ManualCanonicalMergeImpactPreview = {
  sourceIngredientId: string;
  targetIngredientId: string;
  plan: IngredientMergePlan;
  validation: IngredientMergeValidationResult;
  recipeIngredients: { count: number; recipeNames: string[] };
  ingredientAliases: { count: number; aliasNames: string[] };
  ingredientPriceHistory: { count: number };
  recipeMarginImpacts: { count: number };
  queryError: string | null;
};

export const MANUAL_CANONICAL_MERGE_START_PREFIX = "[manual_canonical_merge_start]";
export const MANUAL_CANONICAL_MERGE_COMPLETE_PREFIX = "[manual_canonical_merge_complete]";

function emptyReferenceCounts(): IngredientReferenceCounts {
  return {
    ingredient_aliases: 0,
    recipe_ingredients: 0,
    ingredient_price_history: 0,
    recipe_margin_impacts: 0,
    total: 0,
  };
}

export function sumReferenceCounts(counts: IngredientReferenceCounts[]): IngredientReferenceCounts {
  const out = emptyReferenceCounts();
  for (const row of counts) {
    for (const target of INGREDIENT_FK_REASSIGNMENT_TARGETS) {
      out[target.table] += row[target.table];
    }
    out.total += row.total;
  }
  return out;
}

export function buildReferenceCountsFromRows(
  rowsByTable: Partial<Record<IngredientFkTable, { ingredient_id: string }[]>>,
): Map<string, IngredientReferenceCounts> {
  const map = new Map<string, IngredientReferenceCounts>();

  const touch = (ingredientId: string, table: IngredientFkTable) => {
    const current = map.get(ingredientId) ?? emptyReferenceCounts();
    current[table] += 1;
    current.total += 1;
    map.set(ingredientId, current);
  };

  for (const target of INGREDIENT_FK_REASSIGNMENT_TARGETS) {
    for (const row of rowsByTable[target.table] ?? []) {
      if (!row.ingredient_id) continue;
      touch(row.ingredient_id, target.table);
    }
  }

  return map;
}

export function selectCanonicalIngredientId(
  ingredientIds: string[],
  catalog: IngredientMergeCatalogRow[],
  referenceCounts: Map<string, IngredientReferenceCounts> = new Map(),
): { canonicalId: string; reason: string } | null {
  const uniqueIds = [...new Set(ingredientIds.filter(Boolean))];
  if (uniqueIds.length === 0) return null;

  const byId = new Map(catalog.map((row) => [row.id, row]));
  const candidates = uniqueIds
    .map((id) => {
      const row = byId.get(id);
      return {
        id,
        createdAt: row?.created_at ?? "9999-12-31T23:59:59.999Z",
        references: referenceCounts.get(id)?.total ?? 0,
        archived: row ? isArchivedIngredientEntry(row) : false,
      };
    })
    .filter((c) => !c.archived);

  const pool = candidates.length > 0 ? candidates : uniqueIds.map((id) => ({
    id,
    createdAt: byId.get(id)?.created_at ?? "9999-12-31T23:59:59.999Z",
    references: referenceCounts.get(id)?.total ?? 0,
    archived: false,
  }));

  pool.sort((a, b) => {
    if (a.createdAt !== b.createdAt) return a.createdAt.localeCompare(b.createdAt);
    if (a.references !== b.references) return b.references - a.references;
    return a.id.localeCompare(b.id);
  });

  const winner = pool[0];
  if (!winner) return null;

  const reason =
    candidates.length > 0
      ? `oldest active row (${winner.createdAt}), references=${winner.references}`
      : `oldest row in cluster (${winner.createdAt}), references=${winner.references}`;

  return { canonicalId: winner.id, reason };
}

export function validateIngredientMergePlan(
  plan: IngredientMergePlan,
  catalog: IngredientMergeCatalogRow[],
): IngredientMergeValidationResult {
  const issues: IngredientMergeValidationIssue[] = [];
  const allIds = [plan.canonicalIngredientId, ...plan.sourceIngredientIds];
  if (allIds.every((id) => !id)) {
    issues.push("empty_cluster");
  }

  const byId = new Map(catalog.map((row) => [row.id, row]));
  const canonical = byId.get(plan.canonicalIngredientId);
  if (canonical && isArchivedIngredientEntry(canonical)) {
    issues.push("canonical_is_archived");
  }

  for (const sourceId of plan.sourceIngredientIds) {
    if (sourceId === plan.canonicalIngredientId) {
      issues.push("source_equals_canonical");
      continue;
    }
    const source = byId.get(sourceId);
    if (!source) continue;
    if (isArchivedIngredientEntry(source)) issues.push("source_is_archived");
    if (source.merged_into_ingredient_id) issues.push("source_already_merged");
  }

  return issues.length > 0 ? { ok: false, issues } : { ok: true };
}

export function buildIngredientMergePlanFromCluster(
  cluster: IngredientMergeCluster,
  catalog: IngredientMergeCatalogRow[],
  referenceCounts?: Map<string, IngredientReferenceCounts>,
): IngredientMergePlan | null {
  const selection = selectCanonicalIngredientId(cluster.ingredientIds, catalog, referenceCounts);
  if (!selection) return null;

  const sourceIngredientIds = cluster.ingredientIds.filter((id) => id !== selection.canonicalId);
  return {
    canonicalIngredientId: selection.canonicalId,
    sourceIngredientIds,
    operationalKey: cluster.operationalKey,
    selectionReason: selection.reason,
  };
}

export type ManualMergePickerOption = { id: string; label: string };

/** Active catalog rows eligible for manual merge pickers (includes polluted canonical rows). */
export function buildManualMergePickerOptions(
  catalog: IngredientMergeCatalogRow[],
  options?: { allowNonCanonicalKind?: boolean },
): ManualMergePickerOption[] {
  const allowNonCanonical = options?.allowNonCanonicalKind ?? false;
  const out: ManualMergePickerOption[] = [];

  for (const row of catalog) {
    const id = row.id?.trim();
    if (!id) continue;
    if (isArchivedIngredientEntry(row)) continue;
    if (row.merged_into_ingredient_id) continue;
    if (isSyntheticCatalogIngredientId(id)) continue;
    if (id.startsWith("invoice:") || id.startsWith("temp:") || id.startsWith("temporary:")) {
      continue;
    }
    if (!allowNonCanonical && !isCanonicalIngredientEntry(row)) continue;

    const raw = row.name?.trim() || row.normalized_name?.trim() || id;
    out.push({
      id,
      label: formatCanonicalIngredientDisplayName(raw) || raw,
    });
  }

  return out.sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: "base" }));
}

export function buildIngredientMergePlan(
  canonicalIngredientId: string,
  sourceIngredientIds: string[],
  options?: { operationalKey?: string; selectionReason?: string },
): IngredientMergePlan {
  return {
    canonicalIngredientId,
    sourceIngredientIds: sourceIngredientIds.filter((id) => id && id !== canonicalIngredientId),
    operationalKey: options?.operationalKey,
    selectionReason: options?.selectionReason ?? "manual",
  };
}

/** Rewrite confirmed alias map values from merged ids → canonical id. */
export function rewriteIngredientIdInAliasMap(
  map: IngredientAliasMap,
  sourceIngredientId: string,
  canonicalIngredientId: string,
): IngredientAliasMap {
  if (sourceIngredientId === canonicalIngredientId) return map;
  const next: IngredientAliasMap = { ...map };
  for (const [key, value] of Object.entries(next)) {
    if (value === sourceIngredientId) next[key] = canonicalIngredientId;
  }
  return next;
}

export function rewriteAllIngredientIdsInAliasMap(
  map: IngredientAliasMap,
  idMap: Record<string, string>,
): IngredientAliasMap {
  let next = map;
  for (const [sourceId, canonicalId] of Object.entries(idMap)) {
    next = rewriteIngredientIdInAliasMap(next, sourceId, canonicalId);
  }
  return next;
}

export function remapIngredientMatchOverridesAfterMerge(
  sourceIngredientId: string,
  canonicalIngredientId: string,
  canonicalIngredientName: string,
): number {
  if (sourceIngredientId === canonicalIngredientId) return 0;
  let remapped = 0;
  const replacements = new Map<string, IngredientMatchOverride>();

  for (const [key, entry] of ingredientMatchOverrides.entries()) {
    if (entry.canonicalIngredientId !== sourceIngredientId) continue;
    const updated: IngredientMatchOverride = {
      ...entry,
      canonicalIngredientId,
      canonicalIngredientName,
    };
    replacements.set(key, updated);
    remapped += 1;
  }

  for (const [key, entry] of replacements) {
    ingredientMatchOverrides.set(key, entry);
  }

  return remapped;
}

export function remapRejectedIngredientMatchesAfterMerge(
  sourceIngredientId: string,
  canonicalIngredientId: string,
): number {
  return remapRejectedIngredientId(sourceIngredientId, canonicalIngredientId);
}

export function applyInMemoryIngredientMergeRewrites(
  sourceIngredientId: string,
  canonicalIngredientId: string,
  canonicalIngredientName: string,
  confirmedAliases: IngredientAliasMap,
): { nextConfirmedAliases: IngredientAliasMap; overridesRemapped: number; rejectedRemapped: number } {
  return {
    nextConfirmedAliases: rewriteIngredientIdInAliasMap(
      confirmedAliases,
      sourceIngredientId,
      canonicalIngredientId,
    ),
    overridesRemapped: remapIngredientMatchOverridesAfterMerge(
      sourceIngredientId,
      canonicalIngredientId,
      canonicalIngredientName,
    ),
    rejectedRemapped: remapRejectedIngredientMatchesAfterMerge(
      sourceIngredientId,
      canonicalIngredientId,
    ),
  };
}

type RecipeIngredientLine = {
  id: string;
  recipe_id: string;
  ingredient_id: string | null;
  quantity: number | null;
};

/**
 * Reassign `recipe_ingredients.ingredient_id` from merge sources → canonical.
 *
 * **Duplicate lines:** If the target recipe already has a line for the canonical ingredient,
 * quantities are summed on the existing row and the source line is deleted (`merge_recipe_line`).
 * Otherwise the source line’s `ingredient_id` is updated in place. This prevents duplicate
 * `recipe_ingredients` rows for the same `(recipe_id, ingredient_id)` after merge.
 */
async function reassignRecipeIngredients(
  client: AppSupabaseClient,
  plan: IngredientMergePlan,
  steps: IngredientMergeExecutionStep[],
): Promise<PostgrestError | null> {
  if (plan.sourceIngredientIds.length === 0) return null;

  const { data: sourceLines, error: fetchError } = await client
    .from("recipe_ingredients")
    .select("id, recipe_id, ingredient_id, quantity")
    .in("ingredient_id", plan.sourceIngredientIds);

  if (fetchError) return fetchError;
  const lines = (sourceLines ?? []) as RecipeIngredientLine[];
  if (lines.length === 0) return null;

  const recipeIds = [...new Set(lines.map((line) => line.recipe_id))];
  const { data: canonicalLines, error: canonicalError } = await client
    .from("recipe_ingredients")
    .select("id, recipe_id, ingredient_id, quantity")
    .eq("ingredient_id", plan.canonicalIngredientId)
    .in("recipe_id", recipeIds);

  if (canonicalError) return canonicalError;

  const canonicalByRecipe = new Map(
    ((canonicalLines ?? []) as RecipeIngredientLine[]).map((line) => [line.recipe_id, line]),
  );

  for (const line of lines) {
    const sourceId = line.ingredient_id;
    if (!sourceId) continue;

    const existingCanonical = canonicalByRecipe.get(line.recipe_id);
    if (existingCanonical) {
      const mergedQty =
        (Number(existingCanonical.quantity) || 0) + (Number(line.quantity) || 0);
      const { error: updateError } = await client
        .from("recipe_ingredients")
        .update({ quantity: mergedQty })
        .eq("id", existingCanonical.id);
      if (updateError) return updateError;

      const { error: deleteError } = await client
        .from("recipe_ingredients")
        .delete()
        .eq("id", line.id);
      if (deleteError) return deleteError;

      steps.push({
        table: "recipe_ingredients",
        action: "merge_recipe_line",
        sourceIngredientId: sourceId,
        affectedRows: 1,
      });
      canonicalByRecipe.set(line.recipe_id, { ...existingCanonical, quantity: mergedQty });
      continue;
    }

    const { error: reassignError } = await client
      .from("recipe_ingredients")
      .update({ ingredient_id: plan.canonicalIngredientId })
      .eq("id", line.id);
    if (reassignError) return reassignError;

    steps.push({
      table: "recipe_ingredients",
      action: "update",
      sourceIngredientId: sourceId,
      affectedRows: 1,
    });
    canonicalByRecipe.set(line.recipe_id, {
      ...line,
      ingredient_id: plan.canonicalIngredientId,
    });
  }

  return null;
}

async function reassignSimpleFkTable(
  client: AppSupabaseClient,
  table: Exclude<IngredientFkTable, "recipe_ingredients">,
  plan: IngredientMergePlan,
  steps: IngredientMergeExecutionStep[],
): Promise<PostgrestError | null> {
  for (const sourceId of plan.sourceIngredientIds) {
    const { error } = await client
      .from(table)
      .update({ ingredient_id: plan.canonicalIngredientId })
      .eq("ingredient_id", sourceId);

    if (error) return error;
    steps.push({
      table,
      action: "update",
      sourceIngredientId: sourceId,
    });
  }
  return null;
}

async function archiveMergedIngredients(
  client: AppSupabaseClient,
  plan: IngredientMergePlan,
  steps: IngredientMergeExecutionStep[],
): Promise<PostgrestError | null> {
  if (plan.sourceIngredientIds.length === 0) return null;

  const mergedAt = new Date().toISOString();
  const { error } = await client
    .from("ingredients")
    .update({
      is_archived: true,
      merged_into_ingredient_id: plan.canonicalIngredientId,
      merged_at: mergedAt,
    })
    .in("id", plan.sourceIngredientIds);

  if (error) return error;

  for (const sourceId of plan.sourceIngredientIds) {
    steps.push({
      table: "ingredients_archive",
      action: "update",
      sourceIngredientId: sourceId,
    });
  }
  return null;
}

/**
 * Read-only impact preview for a manual source → target canonical merge.
 * Does not mutate the database.
 */
export async function previewManualCanonicalMergeImpact(
  client: AppSupabaseClient,
  sourceId: string,
  targetId: string,
  catalog: IngredientMergeCatalogRow[] = [],
): Promise<ManualCanonicalMergeImpactPreview> {
  const plan = buildIngredientMergePlan(targetId, [sourceId], {
    selectionReason: "manual_user",
  });
  const validation: IngredientMergeValidationResult =
    sourceId === targetId
      ? { ok: false, issues: ["source_equals_canonical"] }
      : validateIngredientMergePlan(plan, catalog);

  const [recipeResult, aliasResult, priceResult, marginResult] = await Promise.all([
    client
      .from("recipe_ingredients")
      .select("id, recipes(name)")
      .eq("ingredient_id", sourceId),
    client
      .from("ingredient_aliases")
      .select("id, alias_name, normalized_alias")
      .eq("ingredient_id", sourceId),
    client.from("ingredient_price_history").select("id").eq("ingredient_id", sourceId),
    client.from("recipe_margin_impacts").select("id").eq("ingredient_id", sourceId),
  ]);

  const errors = [
    recipeResult.error,
    aliasResult.error,
    priceResult.error,
    marginResult.error,
  ].filter(Boolean);
  const queryError = errors.length > 0 ? errors.map((e) => e!.message).join("; ") : null;

  const recipeRows = (recipeResult.data ?? []) as {
    id: string;
    recipes: { name: string | null } | null;
  }[];
  const recipeNames = [
    ...new Set(
      recipeRows
        .map((row) => row.recipes?.name?.trim())
        .filter((name): name is string => Boolean(name)),
    ),
  ].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));

  const aliasRows = (aliasResult.data ?? []) as {
    alias_name?: string | null;
    normalized_alias?: string | null;
  }[];
  const aliasNames = [
    ...new Set(
      aliasRows
        .map((row) => row.alias_name?.trim() || row.normalized_alias?.trim())
        .filter((name): name is string => Boolean(name)),
    ),
  ].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));

  return {
    sourceIngredientId: sourceId,
    targetIngredientId: targetId,
    plan,
    validation,
    recipeIngredients: { count: recipeRows.length, recipeNames },
    ingredientAliases: { count: aliasRows.length, aliasNames },
    ingredientPriceHistory: { count: (priceResult.data ?? []).length },
    recipeMarginImpacts: { count: (marginResult.data ?? []).length },
    queryError,
  };
}

export function logManualCanonicalMergeStart(
  preview: ManualCanonicalMergeImpactPreview,
): void {
  console.info(MANUAL_CANONICAL_MERGE_START_PREFIX, {
    sourceId: preview.sourceIngredientId,
    targetId: preview.targetIngredientId,
    validationOk: preview.validation.ok,
    validationIssues: preview.validation.ok ? [] : preview.validation.issues,
    recipeIngredientCount: preview.recipeIngredients.count,
    recipeNames: preview.recipeIngredients.recipeNames,
    aliasCount: preview.ingredientAliases.count,
    aliasNames: preview.ingredientAliases.aliasNames,
    priceHistoryCount: preview.ingredientPriceHistory.count,
    marginImpactCount: preview.recipeMarginImpacts.count,
  });
}

export function logManualCanonicalMergeComplete(params: {
  sourceId: string;
  targetId: string;
  success: boolean;
  archivedSourceIds: string[];
  error?: string | null;
}): void {
  console.info(MANUAL_CANONICAL_MERGE_COMPLETE_PREFIX, {
    sourceId: params.sourceId,
    targetId: params.targetId,
    success: params.success,
    archivedSourceIds: params.archivedSourceIds,
    error: params.error ?? null,
  });
}

/**
 * Execute merge against Supabase: reassign FKs, then soft-archive source rows.
 * Invoice line links are preserved via ingredient_aliases + in-memory override maps.
 */
export async function executeIngredientMerge(
  client: AppSupabaseClient,
  plan: IngredientMergePlan,
): Promise<IngredientMergeExecutionResult> {
  const steps: IngredientMergeExecutionStep[] = [];

  const recipeError = await reassignRecipeIngredients(client, plan, steps);
  if (recipeError) return { plan, steps, error: recipeError };

  for (const target of INGREDIENT_FK_REASSIGNMENT_TARGETS) {
    if (target.table === "recipe_ingredients") continue;
    const error = await reassignSimpleFkTable(client, target.table, plan, steps);
    if (error) return { plan, steps, error };
  }

  const archiveError = await archiveMergedIngredients(client, plan, steps);
  if (archiveError) return { plan, steps, error: archiveError };

  return { plan, steps, error: null };
}

export type MergeIngredientClusterParams = {
  client: AppSupabaseClient;
  cluster: IngredientMergeCluster;
  catalog: IngredientMergeCatalogRow[];
  referenceCounts?: Map<string, IngredientReferenceCounts>;
  confirmedAliases?: IngredientAliasMap;
  canonicalIngredientName?: string;
};

export type MergeIngredientClusterResult = IngredientMergeExecutionResult & {
  plan: IngredientMergePlan;
  nextConfirmedAliases?: IngredientAliasMap;
  memoryRewrites?: { overridesRemapped: number; rejectedRemapped: number };
};

/**
 * Build plan from cluster, execute DB merge, optionally rewrite in-memory alias/override maps.
 */
export async function mergeIngredientCluster(
  params: MergeIngredientClusterParams,
): Promise<MergeIngredientClusterResult | { error: string; plan: null }> {
  const activeCatalog = filterActiveCatalogIngredients(params.catalog);
  const plan = buildIngredientMergePlanFromCluster(
    params.cluster,
    activeCatalog.length > 0 ? activeCatalog : params.catalog,
    params.referenceCounts,
  );
  if (!plan) return { error: "Could not select canonical ingredient for cluster", plan: null };

  const validation = validateIngredientMergePlan(plan, params.catalog);
  if (!validation.ok) {
    return { error: `Invalid merge plan: ${validation.issues.join(", ")}`, plan: null };
  }

  const execution = await executeIngredientMerge(params.client, plan);
  if (execution.error) {
    return { ...execution, plan };
  }

  let nextConfirmedAliases = params.confirmedAliases;
  let memoryRewrites: MergeIngredientClusterResult["memoryRewrites"];

  if (params.confirmedAliases) {
    const canonicalName =
      params.canonicalIngredientName ??
      params.catalog.find((row) => row.id === plan.canonicalIngredientId)?.name ??
      plan.canonicalIngredientId;

    let overridesRemapped = 0;
    let rejectedRemapped = 0;
    let aliases = params.confirmedAliases;

    for (const sourceId of plan.sourceIngredientIds) {
      const applied = applyInMemoryIngredientMergeRewrites(
        sourceId,
        plan.canonicalIngredientId,
        canonicalName,
        aliases,
      );
      aliases = applied.nextConfirmedAliases;
      overridesRemapped += applied.overridesRemapped;
      rejectedRemapped += applied.rejectedRemapped;
    }

    nextConfirmedAliases = aliases;
    memoryRewrites = { overridesRemapped, rejectedRemapped };
  }

  return { ...execution, plan, nextConfirmedAliases, memoryRewrites };
}

/** Dev/test helper: merge ANGUS PTY operational duplicate cluster from catalog rows. */
export function findAngusPattyMergeCluster(
  catalog: IngredientCanonicalInput[],
): IngredientMergeCluster | null {
  const active = filterActiveCatalogIngredients(catalog);
  const clusters = findOperationalDuplicateClusters(active);
  return (
    clusters.find((cluster) =>
      cluster.displayNames.some((name) => /angus|ang\s*pty/i.test(name)),
    ) ?? null
  );
}

export type ExecuteManualCanonicalMergeParams = {
  client: AppSupabaseClient;
  sourceId: string;
  targetId: string;
  catalog: IngredientMergeCatalogRow[];
  confirmedAliases?: IngredientAliasMap;
  canonicalIngredientName?: string;
};

export type ManualCanonicalMergeMemoryRewrites = {
  overridesRemapped: number;
  rejectedRemapped: number;
};

export type ExecuteManualCanonicalMergeResult =
  | (IngredientMergeExecutionResult & {
      plan: IngredientMergePlan;
      preview: ManualCanonicalMergeImpactPreview;
      nextConfirmedAliases?: IngredientAliasMap;
      memoryRewrites?: ManualCanonicalMergeMemoryRewrites;
    })
  | { error: string; plan: IngredientMergePlan | null; preview: ManualCanonicalMergeImpactPreview | null };

/**
 * User-driven manual merge: preview impact, validate, execute FK reassignment + soft-archive.
 */
export async function executeManualCanonicalMerge(
  params: ExecuteManualCanonicalMergeParams,
): Promise<ExecuteManualCanonicalMergeResult> {
  const preview = await previewManualCanonicalMergeImpact(
    params.client,
    params.sourceId,
    params.targetId,
    params.catalog,
  );

  if (preview.queryError) {
    logManualCanonicalMergeStart(preview);
    logManualCanonicalMergeComplete({
      sourceId: params.sourceId,
      targetId: params.targetId,
      success: false,
      archivedSourceIds: [],
      error: preview.queryError,
    });
    return { error: preview.queryError, plan: preview.plan, preview };
  }

  if (!preview.validation.ok) {
    logManualCanonicalMergeStart(preview);
    const message = `Invalid merge: ${preview.validation.issues.join(", ")}`;
    logManualCanonicalMergeComplete({
      sourceId: params.sourceId,
      targetId: params.targetId,
      success: false,
      archivedSourceIds: [],
      error: message,
    });
    return { error: message, plan: preview.plan, preview };
  }

  logManualCanonicalMergeStart(preview);

  const execution = await executeIngredientMerge(params.client, preview.plan);
  if (execution.error) {
    logManualCanonicalMergeComplete({
      sourceId: params.sourceId,
      targetId: params.targetId,
      success: false,
      archivedSourceIds: [],
      error: execution.error.message,
    });
    return { ...execution, preview };
  }

  let nextConfirmedAliases = params.confirmedAliases;
  let memoryRewrites: ManualCanonicalMergeMemoryRewrites | undefined;

  if (params.confirmedAliases) {
    const canonicalName =
      params.canonicalIngredientName ??
      params.catalog.find((row) => row.id === preview.plan.canonicalIngredientId)?.name ??
      preview.plan.canonicalIngredientId;

    const applied = applyInMemoryIngredientMergeRewrites(
      params.sourceId,
      params.targetId,
      canonicalName,
      params.confirmedAliases,
    );
    nextConfirmedAliases = applied.nextConfirmedAliases;
    memoryRewrites = {
      overridesRemapped: applied.overridesRemapped,
      rejectedRemapped: applied.rejectedRemapped,
    };
  }

  logManualCanonicalMergeComplete({
    sourceId: params.sourceId,
    targetId: params.targetId,
    success: true,
    archivedSourceIds: preview.plan.sourceIngredientIds,
  });

  return { ...execution, preview, nextConfirmedAliases, memoryRewrites };
}

export function clearIngredientMergeMemoryForTests(): void {
  clearIngredientMatchOverridesForTests();
}
