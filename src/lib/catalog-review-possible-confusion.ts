import { formatCanonicalIngredientDisplayName } from "@/lib/canonical-ingredient-display-name";
import type { CatalogReviewRow } from "@/lib/catalog-pollution-review";
import {
  auditIngredientAliasMapping,
  isSuspiciousIngredientAliasMapping,
} from "@/lib/ingredient-alias-integrity-audit";
import type { IngredientCanonicalInput } from "@/lib/ingredient-canonical";

function sortDisplayNames(names: string[]): string[] {
  return [...names].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
}

function resolveCatalogDisplayName(
  ingredientId: string,
  catalog: readonly IngredientCanonicalInput[],
): string | null {
  const entry = catalog.find((row) => row.id?.trim() === ingredientId);
  if (!entry) return null;
  const raw = entry.name?.trim() || entry.normalized_name?.trim() || ingredientId;
  return formatCanonicalIngredientDisplayName(raw) || raw;
}

/**
 * Read-only ingredient display names that may be confused with the selected canonical.
 * Never includes invoice alias wording — suggestions only (similarity / duplicate clusters).
 */
export function buildCatalogReviewPossibleConfusionSuggestions(
  reviewRow: CatalogReviewRow | null,
  catalog: readonly IngredientCanonicalInput[],
  selectedIngredientId: string,
): string[] {
  const selectedId = selectedIngredientId.trim();
  if (!selectedId || !reviewRow || reviewRow.ingredientId.trim() !== selectedId) {
    return [];
  }

  const seen = new Map<string, string>();
  const selectedDisplayName =
    reviewRow.canonicalDisplayName?.trim() ||
    resolveCatalogDisplayName(selectedId, catalog) ||
    selectedId;

  const addName = (name: string | null | undefined) => {
    const trimmed = name?.trim();
    if (!trimmed) return;
    const audit = auditIngredientAliasMapping({
      aliasName: trimmed,
      canonicalName: selectedDisplayName,
    });
    if (!isSuspiciousIngredientAliasMapping(audit)) return;
    const key = trimmed.toLocaleLowerCase();
    if (!seen.has(key)) seen.set(key, trimmed);
  };

  for (const candidate of reviewRow.similarityCandidates) {
    const candidateId = candidate.ingredientId.trim();
    if (!candidateId || candidateId === selectedId) continue;
    addName(candidate.displayName?.trim() || resolveCatalogDisplayName(candidateId, catalog));
  }

  for (const hint of reviewRow.mergeHints) {
    const ids = hint.ingredientIds;
    const displayNames = hint.displayNames;
    for (let index = 0; index < ids.length; index += 1) {
      const id = ids[index]?.trim();
      if (!id || id === selectedId) continue;
      addName(displayNames[index] ?? resolveCatalogDisplayName(id, catalog));
    }
  }

  return sortDisplayNames([...seen.values()]);
}
