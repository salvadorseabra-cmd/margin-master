/** SURVIVAL DIAGNOSTIC — trace alias rows dropped between DB load and render. */

export type CatalogReviewSurvivalRowShape = {
  id?: string;
  aliasId?: string;
  alias_name?: string;
  aliasName?: string;
  invoiceWording?: string;
  ingredient_id?: string;
  ingredientId?: string;
  persistedIngredientId?: string;
};

export type CatalogReviewSurvivalDropReason = {
  row: CatalogReviewSurvivalRowShape;
  reason: string;
};

export function catalogReviewSurvivalRowId(row: CatalogReviewSurvivalRowShape): string {
  const id = row.id ?? row.aliasId;
  return typeof id === "string" ? id.trim() : "";
}

/** SURVIVAL DIAGNOSTIC */
export function logCatalogReviewRowDropped(
  stage: string,
  row: CatalogReviewSurvivalRowShape,
  reason: string,
): void {
  console.error("ROW DROPPED", {
    stage,
    aliasId: catalogReviewSurvivalRowId(row) || row.id,
    aliasName: row.alias_name ?? row.aliasName ?? row.invoiceWording,
    ingredientId: row.ingredient_id ?? row.ingredientId ?? row.persistedIngredientId,
    fullRow: row,
    reason,
  });
}

/** SURVIVAL DIAGNOSTIC */
export function logCatalogReviewSurvival(
  stage: string,
  before: readonly CatalogReviewSurvivalRowShape[],
  after: readonly CatalogReviewSurvivalRowShape[],
  droppedReasons: readonly CatalogReviewSurvivalDropReason[] = [],
): void {
  const beforeIds = before.map(catalogReviewSurvivalRowId).filter(Boolean);
  const afterIds = after.map(catalogReviewSurvivalRowId).filter(Boolean);
  const survivingSet = new Set(afterIds);
  const droppedIds = beforeIds.filter((id) => !survivingSet.has(id));

  console.log("[CatalogReview SURVIVAL]", {
    STAGE: stage,
    beforeCount: before.length,
    afterCount: after.length,
    droppedIds,
    survivingIds: afterIds,
  });

  for (const { row, reason } of droppedReasons) {
    logCatalogReviewRowDropped(stage, row, reason);
  }
}
