/** HARD runtime logging + normalized compare for Catalog Review alias ingredient_id filters. */

export type CatalogReviewIdFilterRowShape = {
  id?: string;
  ingredient_id?: string;
  ingredientId?: string;
  alias_name?: string;
  aliasName?: string;
  persistedIngredientId?: string;
};

export function catalogReviewIngredientIdsEqual(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  return String(a ?? "").trim() === String(b ?? "").trim();
}

export function catalogReviewAliasIngredientId(
  row: CatalogReviewIdFilterRowShape,
): string | undefined {
  return row.ingredient_id ?? row.ingredientId ?? row.persistedIngredientId;
}

export function logCatalogReviewIdFilterRow(params: {
  stage: string;
  beforeCount: number;
  afterCount: number;
  selectedId: string | null | undefined;
  row: CatalogReviewIdFilterRowShape;
  filterPredicate: string;
}): void {
  const { stage, beforeCount, afterCount, selectedId, row, filterPredicate } = params;
  const aliasIngredientId = catalogReviewAliasIngredientId(row);
  console.log("[CatalogReview ID FILTER]", {
    stage,
    beforeCount,
    afterCount,
    selectedId,
    selectedIdType: typeof selectedId,
    aliasIngredientId,
    aliasIngredientIdType: typeof aliasIngredientId,
    equality: aliasIngredientId === selectedId,
    looseEquality: aliasIngredientId == selectedId,
    strictStringEqual: catalogReviewIngredientIdsEqual(aliasIngredientId, selectedId),
    aliasId: row.id,
    aliasName: row.alias_name ?? row.aliasName,
    filterPredicate,
  });
}

export function logCatalogReviewIdFilterSummary(params: {
  stage: string;
  beforeCount: number;
  afterCount: number;
  selectedId: string | null | undefined;
  filterPredicate: string;
}): void {
  const { stage, beforeCount, afterCount, selectedId, filterPredicate } = params;
  console.log("[CatalogReview ID FILTER] summary", { stage });
  console.log(`before count: ${beforeCount}`);
  console.log(`after count: ${afterCount}`);
  console.log(`exact filter predicate: ${filterPredicate}`);
  console.log(`exact selected id: ${JSON.stringify(selectedId)} (type: ${typeof selectedId})`);
}
