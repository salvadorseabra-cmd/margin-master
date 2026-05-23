import type { CatalogReviewRow } from "@/lib/catalog-pollution-review";

export type CatalogReviewQueueIssueInput = {
  displayName: string;
  row?: CatalogReviewRow | null;
  /** True when detectOrphanCanonicalIngredients marks zero operational deps. */
  isOrphan?: boolean;
  /** True when only aliases block archival (legacy canonical). */
  isAliasOnly?: boolean;
  /** Pack price / purchase recency stale (optional; loaded on review page). */
  isStale?: boolean;
  /** Legacy BAT shoestr shorthand row — rename in workspace. */
  needsRename?: boolean;
};

/**
 * One short human issue line for catalog review inbox rows (left queue).
 * Priority: similarity → duplicate cluster → unused → aliases → stale → naming.
 */
export function formatCatalogReviewQueueIssue(input: CatalogReviewQueueIssueInput): string {
  const row = input.row ?? null;

  const similar = row?.similarityCandidates[0];
  if (similar?.displayName?.trim()) {
    return `Looks similar to ${similar.displayName.trim()}`;
  }

  if (
    (row?.mergeHints.length ?? 0) > 0 ||
    row?.discoveryKinds.includes("operational_duplicate")
  ) {
    return "Possible duplicate";
  }

  if (
    input.isAliasOnly ||
    (row != null &&
      (row.invoiceReferenceCount > 1 || row.sourceInvoiceAliases.length > 1))
  ) {
    return "Several invoice names map here";
  }

  if (input.isStale) {
    return "Hasn't been purchased recently";
  }

  if (input.needsRename || row?.leakReason != null) {
    return "Name may need cleanup";
  }

  if (input.isOrphan || (row != null && row.recipeUsage.count === 0 && !input.isAliasOnly)) {
    return "Not used in any recipe";
  }

  return "Needs review";
}

function hasCatalogReviewDuplicateSignal(row: CatalogReviewRow | null): boolean {
  if (!row) return false;
  return (
    row.similarityCandidates.length > 0 ||
    row.mergeHints.length > 0 ||
    row.discoveryKinds.includes("operational_duplicate")
  );
}

/** Whether catalog review should offer operational archive (not delete). */
export function catalogReviewOffersArchive(input: CatalogReviewQueueIssueInput): boolean {
  const row = input.row ?? null;
  const unusedInRecipes =
    row != null && row.recipeUsage.count === 0 && !input.isAliasOnly;

  if (input.isOrphan || input.isAliasOnly || input.isStale || unusedInRecipes) {
    return true;
  }
  return hasCatalogReviewDuplicateSignal(row);
}

/** Prominent outline archive for orphan, unused, stale, and alias-only rows. */
export function catalogReviewArchiveIsProminent(input: CatalogReviewQueueIssueInput): boolean {
  const row = input.row ?? null;
  const unusedInRecipes =
    row != null && row.recipeUsage.count === 0 && !input.isAliasOnly;

  return Boolean(
    input.isOrphan || input.isAliasOnly || input.isStale || unusedInRecipes,
  );
}
