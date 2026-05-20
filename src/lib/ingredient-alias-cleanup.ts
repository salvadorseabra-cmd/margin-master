/**
 * Safe utilities to archive or merge alias ingredient rows into canonical targets.
 */

import type { PostgrestError } from "@supabase/supabase-js";
import type { IngredientAliasMap, IngredientCanonicalInput } from "@/lib/ingredient-canonical";
import {
  applyInMemoryIngredientMergeRewrites,
  buildIngredientMergePlan,
  executeIngredientMerge,
  type AppSupabaseClient,
  type IngredientMergePlan,
} from "@/lib/ingredient-merge";
import { INGREDIENT_KIND_ALIAS } from "@/lib/ingredient-kind";

export type ArchiveAliasIngredientParams = {
  client: AppSupabaseClient;
  aliasIngredientId: string;
  canonicalIngredientId: string;
};

export type ArchiveAliasIngredientResult = {
  error: PostgrestError | null;
};

/** Soft-archive an alias row and point it at the canonical target (no FK reassignment). */
export async function archiveAliasIngredientRow(
  params: ArchiveAliasIngredientParams,
): Promise<ArchiveAliasIngredientResult> {
  const { client, aliasIngredientId, canonicalIngredientId } = params;
  if (aliasIngredientId === canonicalIngredientId) {
    return { error: null };
  }

  const mergedAt = new Date().toISOString();
  const { error } = await client
    .from("ingredients")
    .update({
      ingredient_kind: INGREDIENT_KIND_ALIAS,
      is_archived: true,
      merged_into_ingredient_id: canonicalIngredientId,
      merged_at: mergedAt,
    })
    .eq("id", aliasIngredientId);

  return { error };
}

export function buildMergeAliasIntoCanonicalPlan(
  aliasIngredientId: string,
  canonicalIngredientId: string,
  options?: { operationalKey?: string },
): IngredientMergePlan {
  return buildIngredientMergePlan(canonicalIngredientId, [aliasIngredientId], {
    operationalKey: options?.operationalKey,
    selectionReason: "alias_into_canonical",
  });
}

export type MergeAliasIntoCanonicalParams = {
  client: AppSupabaseClient;
  aliasEntry: IngredientCanonicalInput;
  canonicalEntry: IngredientCanonicalInput;
  confirmedAliases?: IngredientAliasMap;
};

export type MergeAliasIntoCanonicalResult = {
  plan: IngredientMergePlan;
  nextConfirmedAliases?: IngredientAliasMap;
  error: PostgrestError | null;
};

/**
 * Full merge: reassign FKs from alias row → canonical, archive alias, rewrite in-memory maps.
 */
export async function mergeAliasIngredientIntoCanonical(
  params: MergeAliasIntoCanonicalParams,
): Promise<MergeAliasIntoCanonicalResult> {
  const plan = buildMergeAliasIntoCanonicalPlan(params.aliasEntry.id, params.canonicalEntry.id);
  const execution = await executeIngredientMerge(params.client, plan);

  if (execution.error) {
    return { plan, error: execution.error };
  }

  let nextConfirmedAliases = params.confirmedAliases;
  if (params.confirmedAliases) {
    const canonicalName =
      params.canonicalEntry.name ??
      params.canonicalEntry.normalized_name ??
      plan.canonicalIngredientId;
    let aliases = params.confirmedAliases;
    for (const sourceId of plan.sourceIngredientIds) {
      const applied = applyInMemoryIngredientMergeRewrites(
        sourceId,
        plan.canonicalIngredientId,
        canonicalName,
        aliases,
      );
      aliases = applied.nextConfirmedAliases;
    }
    nextConfirmedAliases = aliases;
  }

  const kindError = await params.client
    .from("ingredients")
    .update({ ingredient_kind: INGREDIENT_KIND_ALIAS })
    .in("id", plan.sourceIngredientIds);

  return { plan, nextConfirmedAliases, error: kindError.error };
}
