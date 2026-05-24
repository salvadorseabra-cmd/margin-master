import { describe, expect, it } from "vitest";
import {
  formatCatalogReviewArchivedStatusBadge,
  formatCatalogReviewRecipeStatusBadge,
} from "./catalog-review-status-badges";

describe("formatCatalogReviewRecipeStatusBadge", () => {
  it("returns null when recipe count is unknown", () => {
    expect(formatCatalogReviewRecipeStatusBadge(undefined)).toBeNull();
  });

  it("returns used-in-recipes badge when count is positive", () => {
    const badge = formatCatalogReviewRecipeStatusBadge(3);
    expect(badge?.label).toBe("Used in recipes");
    expect(badge?.className).toContain("bg-blue-500/8");
  });

  it("returns not-used badge when count is zero", () => {
    const badge = formatCatalogReviewRecipeStatusBadge(0);
    expect(badge?.label).toBe("Not used in recipes");
    expect(badge?.className).toContain("bg-amber-500/8");
  });
});

describe("formatCatalogReviewArchivedStatusBadge", () => {
  it("returns muted archived badge", () => {
    const badge = formatCatalogReviewArchivedStatusBadge();
    expect(badge.label).toBe("Archived");
    expect(badge.className).toContain("bg-muted/50");
  });
});
