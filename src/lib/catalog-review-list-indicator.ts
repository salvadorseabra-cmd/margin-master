/** Muted subline for catalog review left-panel rows, e.g. "3 aliases". */
export function formatAliasCountSubline(aliasCount: number): string | null {
  if (aliasCount <= 0) return null;
  return aliasCount === 1 ? "1 alias" : `${aliasCount} aliases`;
}

/** Muted subline for current invoice line matches, e.g. "3 matched invoice lines". */
export function formatCurrentMatchCountSubline(matchCount: number): string | null {
  if (matchCount <= 0) return null;
  if (matchCount === 1) return "1 matched invoice line";
  return `${matchCount} matched invoice lines`;
}

export function sortCatalogReviewByAliasCount<
  T extends { aliasCount: number; displayName: string },
>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const countDiff = b.aliasCount - a.aliasCount;
    if (countDiff !== 0) return countDiff;
    return a.displayName.localeCompare(b.displayName, undefined, { sensitivity: "base" });
  });
}

export function sortCatalogReviewByMatchCount<
  T extends { matchCount: number; displayName: string },
>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const countDiff = b.matchCount - a.matchCount;
    if (countDiff !== 0) return countDiff;
    return a.displayName.localeCompare(b.displayName, undefined, { sensitivity: "base" });
  });
}

/** Left-panel order: canonical display name A→Z (case-insensitive). */
export function sortCatalogReviewAlphabetical<T extends { displayName: string }>(
  items: T[],
): T[] {
  return [...items].sort((a, b) =>
    a.displayName.localeCompare(b.displayName, undefined, { sensitivity: "base" }),
  );
}
