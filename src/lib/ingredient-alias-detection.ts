/**
 * Heuristic pass to flag likely alias catalog rows (invoice shorthand → canonical neighbor).
 */

import {
  isArchivedIngredientEntry,
  type IngredientCanonicalInput,
} from "@/lib/ingredient-canonical";
import {
  findCanonicalNeighborForAlias,
  isCanonicalIngredientEntry,
  looksLikeInvoiceShorthandName,
  resolveIngredientKind,
  type IngredientKindInput,
} from "@/lib/ingredient-kind";

export type AliasDetectionReason =
  | "invoice_shorthand_name"
  | "explicit_alias_kind"
  | "semantic_canonical_neighbor"
  | "matching_unit_structure"
  | "not_recipe_linked";

export type AliasDetectionCandidate = {
  aliasEntry: IngredientCanonicalInput;
  canonicalEntry: IngredientCanonicalInput;
  score: number;
  reasons: AliasDetectionReason[];
};

export type AliasDetectionOptions = {
  recipeLinkedIngredientIds?: ReadonlySet<string>;
};

function hasMatchingUnitStructure(
  alias: IngredientKindInput,
  canonical: IngredientKindInput,
): boolean {
  const aUnit = alias.unit?.trim().toLowerCase();
  const cUnit = canonical.unit?.trim().toLowerCase();
  if (!aUnit || !cUnit) return true;
  return aUnit === cUnit;
}

function hasMatchingPriceStructure(
  alias: IngredientKindInput,
  canonical: IngredientKindInput,
): boolean {
  const aPrice = alias.current_price;
  const cPrice = canonical.current_price;
  if (aPrice == null || cPrice == null) return true;
  if (aPrice === 0 && cPrice === 0) return true;
  if (aPrice === 0 || cPrice === 0) return true;
  const ratio = Math.min(aPrice, cPrice) / Math.max(aPrice, cPrice);
  return ratio >= 0.85;
}

/**
 * Detect catalog rows that should be alias memory / merge targets, not human-facing catalog.
 */
export function detectLikelyAliasCatalogRows(
  catalog: IngredientCanonicalInput[],
  options: AliasDetectionOptions = {},
): AliasDetectionCandidate[] {
  const recipeLinked = options.recipeLinkedIngredientIds ?? new Set<string>();
  const canonicalPool = catalog.filter(
    (entry) => !isArchivedIngredientEntry(entry) && isCanonicalIngredientEntry(entry),
  );
  const results: AliasDetectionCandidate[] = [];

  for (const entry of catalog) {
    if (isArchivedIngredientEntry(entry)) continue;
    if (isCanonicalIngredientEntry(entry) && !looksLikeInvoiceShorthandName(entry.name)) {
      continue;
    }

    const reasons: AliasDetectionReason[] = [];
    if (resolveIngredientKind(entry) === "alias") reasons.push("explicit_alias_kind");
    if (looksLikeInvoiceShorthandName(entry.name ?? entry.normalized_name)) {
      reasons.push("invoice_shorthand_name");
    }
    if (reasons.length === 0) continue;

    if (recipeLinked.has(entry.id)) continue;
    reasons.push("not_recipe_linked");

    const neighbor = findCanonicalNeighborForAlias(entry, canonicalPool);
    if (!neighbor) continue;
    reasons.push("semantic_canonical_neighbor");

    if (hasMatchingUnitStructure(entry, neighbor.canonical)) {
      reasons.push("matching_unit_structure");
    } else {
      continue;
    }

    if (!hasMatchingPriceStructure(entry, neighbor.canonical)) continue;

    results.push({
      aliasEntry: entry,
      canonicalEntry: neighbor.canonical,
      score: neighbor.score,
      reasons,
    });
  }

  return results.sort((a, b) => b.score - a.score);
}
