import {
  evaluateCanonicalIngredientQuality,
  generateCanonicalNamingSuggestion,
  type CanonicalIngredientQualityEvaluation,
  type CanonicalNamingSuggestion,
} from "@/lib/canonical-ingredient-quality";
import {
  isCanonicalSuggestionDismissed,
  isIntentionalCanonicalName,
} from "@/lib/canonical-ingredient-quality-storage";
import type { IngredientAliasMap, IngredientCanonicalInput } from "@/lib/ingredient-canonical";

export type ActionableCanonicalNamingQueueEntry = {
  ingredientId: string;
  ingredient: IngredientCanonicalInput;
  evaluation: CanonicalIngredientQualityEvaluation;
  suggestion: CanonicalNamingSuggestion;
};

export type BuildActionableCanonicalNamingQueueParams = {
  catalog: readonly IngredientCanonicalInput[];
  userId: string | undefined;
  confirmedAliases?: IngredientAliasMap;
  supplierKey?: string | null;
};

function aliasNamesForIngredient(
  ingredientId: string,
  confirmedAliases: IngredientAliasMap | undefined,
): string[] {
  if (!confirmedAliases) return [];
  const id = ingredientId.trim();
  if (!id) return [];
  const names: string[] = [];
  for (const [aliasKey, targetId] of Object.entries(confirmedAliases)) {
    if (targetId?.trim() === id) {
      const trimmed = aliasKey?.trim();
      if (trimmed) names.push(trimmed);
    }
  }
  return names;
}

function isExcludedByUserPrefs(userId: string | undefined, ingredientId: string): boolean {
  if (!userId?.trim()) return false;
  return (
    isCanonicalSuggestionDismissed(userId, ingredientId) ||
    isIntentionalCanonicalName(userId, ingredientId)
  );
}

/**
 * Catalog-wide queue of ingredients with high-confidence rename suggestions.
 * Excludes dismissed/intentional marks, readable names, and low-confidence suggestions.
 */
export function buildActionableCanonicalNamingQueue(
  params: BuildActionableCanonicalNamingQueueParams,
): ActionableCanonicalNamingQueueEntry[] {
  const queue: ActionableCanonicalNamingQueueEntry[] = [];

  for (const entry of params.catalog) {
    const ingredientId = entry.id?.trim();
    const name = entry.name?.trim();
    if (!ingredientId || !name) continue;
    if (isExcludedByUserPrefs(params.userId, ingredientId)) continue;

    const evaluation = evaluateCanonicalIngredientQuality({
      ingredient: entry,
      supplierKey: params.supplierKey,
    });
    if (!evaluation) continue;

    const aliasNames = aliasNamesForIngredient(ingredientId, params.confirmedAliases);
    const suggestion = generateCanonicalNamingSuggestion({
      ingredient: entry,
      aliasNames,
      catalog: params.catalog,
      supplierKey: params.supplierKey,
    });
    if (!suggestion) continue;

    queue.push({
      ingredientId,
      ingredient: entry,
      evaluation,
      suggestion,
    });
  }

  return queue.sort((a, b) =>
    (a.ingredient.name ?? "").localeCompare(b.ingredient.name ?? "", undefined, {
      sensitivity: "base",
    }),
  );
}

export function countActionableCanonicalNamingQueue(
  params: BuildActionableCanonicalNamingQueueParams,
): number {
  return buildActionableCanonicalNamingQueue(params).length;
}
