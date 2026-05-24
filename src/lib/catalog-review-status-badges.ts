export type CatalogReviewStatusBadgeSpec = {
  label: string;
  className: string;
};

const BADGE_BASE_CLASS =
  "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-normal leading-snug";

/** Recipe usage badge for catalog review list rows and detail header. */
export function formatCatalogReviewRecipeStatusBadge(
  recipeCount: number | undefined,
): CatalogReviewStatusBadgeSpec | null {
  if (recipeCount == null) return null;

  if (recipeCount > 0) {
    return {
      label: "Used in recipes",
      className: `${BADGE_BASE_CLASS} bg-blue-500/8 text-blue-700/75 dark:text-blue-300/75`,
    };
  }

  return {
    label: "Not used in recipes",
    className: `${BADGE_BASE_CLASS} bg-amber-500/8 text-amber-700/70 dark:text-amber-300/70`,
  };
}

/** Muted badge for archived catalog review list rows. */
export function formatCatalogReviewArchivedStatusBadge(): CatalogReviewStatusBadgeSpec {
  return {
    label: "Archived",
    className: `${BADGE_BASE_CLASS} bg-muted/50 text-muted-foreground/65`,
  };
}