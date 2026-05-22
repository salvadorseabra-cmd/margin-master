/**
 * Directed canonical → canonical merge: reassign dependencies, preserve history, soft-archive source.
 * Differs from alias-only reassignment by also moving price history and archiving with merged_into.
 */

import type { PostgrestError } from "@supabase/supabase-js";
import type { IngredientAliasMap, IngredientCanonicalInput } from "@/lib/ingredient-canonical";
import { normalizeCanonicalIngredientName } from "@/lib/ingredient-canonical";
import { loadConfirmedIngredientAliasMap } from "@/lib/ingredient-alias-memory";
import {
  BAT_SHOESTR_LEGACY_ALIAS_SEARCH_TERMS,
  isBatShoestrMisclassifiedShorthand,
  reassignIngredientAliases,
  resolveCanonicalIngredientForReassignment,
  type CanonicalIngredientResolution,
} from "@/lib/ingredient-alias-reassignment";
import {
  applyInMemoryIngredientMergeRewrites,
  buildIngredientMergePlan,
  executeIngredientMerge,
  type AppSupabaseClient,
} from "@/lib/ingredient-merge";

export const CANONICAL_MERGE_LOG_PREFIX = "[canonical_merge]";

export {
  BAT_SHOESTR_LEGACY_ALIAS_SEARCH_TERMS as BAT_SHOESTR_LEGACY_SEARCH_TERMS,
  isBatShoestrMisclassifiedShorthand,
  isLegacyBatShoestrAliasField,
  isLegacyBatShoestrCatalogEntry,
} from "@/lib/ingredient-alias-reassignment";

export type MergeCanonicalIngredientDependenciesParams = {
  client: AppSupabaseClient;
  fromIngredientId: string;
  toIngredientId: string;
  userId: string;
  confirmedAliases?: IngredientAliasMap;
  targetIngredientName?: string;
};

export type MergeCanonicalIngredientDependenciesResult = {
  aliasesReassigned: number;
  priceHistoryRowsReassigned: number;
  recipeIngredientsReassigned: number;
  archived: boolean;
  nextConfirmedAliases?: IngredientAliasMap;
  memoryRewrites?: { overridesRemapped: number; rejectedRemapped: number };
  error: PostgrestError | null;
};

/** Merge-script hint only — not used for catalog create/rename defaults. */
export function suggestBatataPalhaForMisclassifiedBatShoestr(
  raw: string | null | undefined,
): string | null {
  return isBatShoestrMisclassifiedShorthand(raw) ? "Batata palha" : null;
}

export function findCatalogBatataPalha(
  catalog: IngredientCanonicalInput[],
): IngredientCanonicalInput | null {
  for (const entry of catalog) {
    const norm = normalizeCanonicalIngredientName(entry.name ?? "");
    if (norm === "batata palha") return entry;
    const stored = entry.normalized_name
      ? normalizeCanonicalIngredientName(entry.normalized_name)
      : "";
    if (stored === "batata palha") return entry;
  }
  return null;
}

async function countRowsForIngredient(
  client: AppSupabaseClient,
  table: "recipe_ingredients" | "ingredient_price_history" | "recipe_margin_impacts",
  ingredientId: string,
): Promise<{ count: number; error: PostgrestError | null }> {
  const { count, error } = await client
    .from(table)
    .select("id", { count: "exact", head: true })
    .eq("ingredient_id", ingredientId);
  return { count: count ?? 0, error };
}

/**
 * Merge all operational dependencies from `fromIngredientId` into `toIngredientId`,
 * then soft-archive the source with `merged_into_ingredient_id`.
 */
export async function mergeCanonicalIngredientDependencies(
  params: MergeCanonicalIngredientDependenciesParams,
): Promise<MergeCanonicalIngredientDependenciesResult> {
  const fromIngredientId = params.fromIngredientId?.trim() ?? "";
  const toIngredientId = params.toIngredientId?.trim() ?? "";
  const userId = params.userId?.trim() ?? "";

  if (!fromIngredientId || !toIngredientId || fromIngredientId === toIngredientId) {
    const message = "Invalid canonical merge: missing or identical source/target ids";
    console.info(CANONICAL_MERGE_LOG_PREFIX, "validation_failed", {
      fromIngredientId,
      toIngredientId,
      userId: userId || null,
    });
    return {
      aliasesReassigned: 0,
      priceHistoryRowsReassigned: 0,
      recipeIngredientsReassigned: 0,
      archived: false,
      error: {
        message,
        code: "canonical_merge_validation",
        details: "",
        hint: "",
      } as PostgrestError,
    };
  }

  const aliasResult = await reassignIngredientAliases({
    client: params.client,
    fromIngredientId,
    toIngredientId,
    userId,
    confirmedAliases: params.confirmedAliases,
  });

  if (aliasResult.error) {
    return {
      aliasesReassigned: aliasResult.aliasesReassigned,
      priceHistoryRowsReassigned: 0,
      recipeIngredientsReassigned: 0,
      archived: false,
      nextConfirmedAliases: aliasResult.nextConfirmedAliases,
      error: aliasResult.error,
    };
  }

  let nextConfirmedAliases = aliasResult.nextConfirmedAliases;
  let memoryRewrites: MergeCanonicalIngredientDependenciesResult["memoryRewrites"];

  if (nextConfirmedAliases) {
    const targetName = params.targetIngredientName?.trim() || toIngredientId;
    const applied = applyInMemoryIngredientMergeRewrites(
      fromIngredientId,
      toIngredientId,
      targetName,
      nextConfirmedAliases,
    );
    nextConfirmedAliases = applied.nextConfirmedAliases;
    memoryRewrites = {
      overridesRemapped: applied.overridesRemapped,
      rejectedRemapped: applied.rejectedRemapped,
    };
  }

  const [recipeCount, priceCount] = await Promise.all([
    countRowsForIngredient(params.client, "recipe_ingredients", fromIngredientId),
    countRowsForIngredient(params.client, "ingredient_price_history", fromIngredientId),
  ]);

  if (recipeCount.error) {
    return {
      aliasesReassigned: aliasResult.aliasesReassigned,
      priceHistoryRowsReassigned: 0,
      recipeIngredientsReassigned: 0,
      archived: false,
      nextConfirmedAliases,
      memoryRewrites,
      error: recipeCount.error,
    };
  }
  if (priceCount.error) {
    return {
      aliasesReassigned: aliasResult.aliasesReassigned,
      priceHistoryRowsReassigned: 0,
      recipeIngredientsReassigned: 0,
      archived: false,
      nextConfirmedAliases,
      memoryRewrites,
      error: priceCount.error,
    };
  }

  const plan = buildIngredientMergePlan(toIngredientId, [fromIngredientId], {
    selectionReason: "canonical_directed_merge",
  });

  const execution = await executeIngredientMerge(params.client, plan, {
    userId,
    verifyAfterArchive: true,
  });

  if (execution.error) {
    return {
      aliasesReassigned: aliasResult.aliasesReassigned,
      priceHistoryRowsReassigned: 0,
      recipeIngredientsReassigned: 0,
      archived: false,
      nextConfirmedAliases,
      memoryRewrites,
      error: execution.error,
    };
  }

  const recipeIngredientsReassigned = recipeCount.count;
  const priceHistoryRowsReassigned = priceCount.count;

  console.info(CANONICAL_MERGE_LOG_PREFIX, "completed", {
    from: { id: fromIngredientId },
    to: { id: toIngredientId },
    userId,
    aliasesReassigned: aliasResult.aliasesReassigned,
    priceHistoryRowsReassigned,
    recipeIngredientsReassigned,
    memoryRewrites,
    archived: true,
  });

  return {
    aliasesReassigned: aliasResult.aliasesReassigned,
    priceHistoryRowsReassigned,
    recipeIngredientsReassigned,
    archived: true,
    nextConfirmedAliases,
    memoryRewrites,
    error: null,
  };
}

export type BatShoestrMigrationResolutionDiagnostics = {
  resolvedSourceId: string | null;
  resolvedTargetId: string | null;
  sourceResolution: CanonicalIngredientResolution;
  targetResolution: CanonicalIngredientResolution;
};

export type RunBatShoestrToBatataPalhaMergeParams = {
  client: AppSupabaseClient;
  userId: string;
  catalog: IngredientCanonicalInput[];
  confirmedAliases?: IngredientAliasMap;
  fromIngredientId?: string | null;
  toIngredientId?: string | null;
};

export type RunBatShoestrToBatataPalhaMergeResult =
  MergeCanonicalIngredientDependenciesResult & {
    fromIngredientId: string | null;
    toIngredientId: string | null;
    resolutionError: string | null;
    resolutionDiagnostics?: BatShoestrMigrationResolutionDiagnostics;
  };


/** Operational migration: BAT shoestr → Batata palha (full canonical merge). */
export async function runBatShoestrToBatataPalhaMerge(
  params: RunBatShoestrToBatataPalhaMergeParams,
): Promise<RunBatShoestrToBatataPalhaMergeResult> {
  const sourceResolution = await resolveCanonicalIngredientForReassignment({
    client: params.client,
    userId: params.userId,
    hints: {
      explicitIngredientId: params.fromIngredientId,
      normalizedNames: ["BAT shoestr", "bat shoestr"],
      aliasSearchTerms: [...BAT_SHOESTR_LEGACY_ALIAS_SEARCH_TERMS],
      catalog: params.catalog,
      includeArchived: true,
      excludeNormalizedNames: ["Batata palha"],
      legacyBatShoestrFuzzyCatalog: true,
    },
  });
  const targetResolution = await resolveCanonicalIngredientForReassignment({
    client: params.client,
    userId: params.userId,
    hints: {
      explicitIngredientId: params.toIngredientId,
      normalizedNames: ["Batata palha"],
      catalog: params.catalog,
      activeOnly: true,
    },
  });

  const fromIngredientId = sourceResolution.ingredientId;
  const toIngredientId = targetResolution.ingredientId;
  const resolutionDiagnostics: BatShoestrMigrationResolutionDiagnostics = {
    resolvedSourceId: fromIngredientId,
    resolvedTargetId: toIngredientId,
    sourceResolution,
    targetResolution,
  };

  if (!fromIngredientId || !toIngredientId) {
    const resolutionError = !fromIngredientId
      ? "BAT shoestr canonical not found"
      : "Batata palha canonical not found";
    console.info(CANONICAL_MERGE_LOG_PREFIX, "bat_shoestr_resolve_failed", {
      resolutionError,
      resolutionDiagnostics,
    });
    return {
      fromIngredientId,
      toIngredientId,
      resolutionError,
      resolutionDiagnostics,
      aliasesReassigned: 0,
      priceHistoryRowsReassigned: 0,
      recipeIngredientsReassigned: 0,
      archived: false,
      error: {
        message: resolutionError,
        code: "bat_shoestr_merge_resolve",
        details: "",
        hint: "",
      } as PostgrestError,
    };
  }

  const targetEntry = params.catalog.find((row) => row.id?.trim() === toIngredientId);
  const targetName = targetEntry?.name?.trim() || "Batata palha";

  let confirmedAliases = params.confirmedAliases;
  if (confirmedAliases === undefined) {
    confirmedAliases = await loadConfirmedIngredientAliasMap(params.client);
  }

  const mergeResult = await mergeCanonicalIngredientDependencies({
    client: params.client,
    fromIngredientId,
    toIngredientId,
    userId: params.userId,
    confirmedAliases,
    targetIngredientName: targetName,
  });

  return {
    ...mergeResult,
    fromIngredientId,
    toIngredientId,
    resolutionError: null,
    resolutionDiagnostics,
  };
}
