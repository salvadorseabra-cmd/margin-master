/**
 * Lightweight types for a future ingredient merge workflow (no UI).
 */

export type IngredientMergeClusterConfidence = "exact_operational_key";

export type IngredientMergeCluster = {
  operationalKey: string;
  ingredientIds: string[];
  displayNames: string[];
  confidence: IngredientMergeClusterConfidence;
};

export type IngredientMergeCandidate = {
  sourceIngredientIds: string[];
  targetIngredientId: string | null;
  operationalKey: string;
  displayNames: string[];
  confidence: IngredientMergeClusterConfidence;
};

export type IngredientMergeWorkflowHint = {
  kind: "operational_duplicate_cluster";
  operationalKey: string;
  ingredientIds: string[];
  displayNames: string[];
};

export function toMergeWorkflowHint(cluster: IngredientMergeCluster): IngredientMergeWorkflowHint {
  return {
    kind: "operational_duplicate_cluster",
    operationalKey: cluster.operationalKey,
    ingredientIds: [...cluster.ingredientIds],
    displayNames: [...cluster.displayNames],
  };
}

/**
 * @deprecated Prefer {@link buildIngredientMergePlanFromCluster} for canonical selection.
 * Uses first cluster id only — kept for lightweight workflow hints.
 */
export function toMergeCandidate(cluster: IngredientMergeCluster): IngredientMergeCandidate {
  const [targetIngredientId, ...rest] = cluster.ingredientIds;
  return {
    sourceIngredientIds: rest,
    targetIngredientId: targetIngredientId ?? null,
    operationalKey: cluster.operationalKey,
    displayNames: [...cluster.displayNames],
    confidence: cluster.confidence,
  };
}

/** Read-only merge hint for catalog review UI — does not execute merges. */
export type IngredientMergeReadOnlyHint = IngredientMergeWorkflowHint & {
  /** Informational canonical suggestion (e.g. oldest row policy); not an executed merge. */
  suggestedCanonicalIngredientId: string | null;
};

export function buildReadOnlyMergeHint(
  cluster: IngredientMergeCluster,
  suggestedCanonicalIngredientId: string | null,
): IngredientMergeReadOnlyHint {
  return {
    ...toMergeWorkflowHint(cluster),
    suggestedCanonicalIngredientId,
  };
}
