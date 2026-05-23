import { describe, expect, it } from "vitest";
import {
  catalogReviewArchiveIsProminent,
  catalogReviewOffersArchive,
  formatCatalogReviewQueueIssue,
} from "./catalog-review-queue-issue";
import type { CatalogReviewRow } from "./catalog-pollution-review";

function row(partial: Partial<CatalogReviewRow> & { ingredientId: string }): CatalogReviewRow {
  return {
    ingredientId: partial.ingredientId,
    canonicalDisplayName: partial.canonicalDisplayName ?? "Test",
    rawName: partial.rawName ?? "Test",
    sourceInvoiceAliases: partial.sourceInvoiceAliases ?? [],
    createdAt: partial.createdAt ?? null,
    recipeUsage: partial.recipeUsage ?? { count: 0, names: [] },
    invoiceReferenceCount: partial.invoiceReferenceCount ?? 0,
    leakReason: partial.leakReason ?? null,
    discoveryKinds: partial.discoveryKinds ?? [],
    leakDetail: partial.leakDetail ?? null,
    mergeHints: partial.mergeHints ?? [],
    similarityCandidates: partial.similarityCandidates ?? [],
    classification: partial.classification ?? null,
  };
}

describe("formatCatalogReviewQueueIssue", () => {
  it("prefers similarity over duplicate cluster", () => {
    expect(
      formatCatalogReviewQueueIssue({
        displayName: "CHK BREADED",
        row: row({
          ingredientId: "a",
          discoveryKinds: ["operational_duplicate"],
          mergeHints: [
            {
              kind: "operational_duplicate_cluster",
              operationalKey: "chk",
              ingredientIds: ["a", "b"],
              displayNames: ["CHK BREADED", "Chicken breaded"],
              confidence: "exact_operational_key",
              suggestedCanonicalIngredientId: "b",
            },
          ],
          similarityCandidates: [
            { ingredientId: "b", displayName: "Chicken breaded fillet", score: 0.9 },
          ],
        }),
      }),
    ).toBe("Looks similar to Chicken breaded fillet");
  });

  it("maps duplicate cluster to Possible duplicate", () => {
    expect(
      formatCatalogReviewQueueIssue({
        displayName: "Angus patty",
        row: row({
          ingredientId: "a",
          discoveryKinds: ["operational_duplicate"],
          mergeHints: [
            {
              kind: "operational_duplicate_cluster",
              operationalKey: "angus",
              ingredientIds: ["a", "b"],
              displayNames: ["ANG PTY", "Angus patty"],
              confidence: "exact_operational_key",
              suggestedCanonicalIngredientId: "a",
            },
          ],
        }),
      }),
    ).toBe("Possible duplicate");
  });

  it("maps orphan and zero-recipe rows to unused copy", () => {
    expect(
      formatCatalogReviewQueueIssue({
        displayName: "Orphan spice",
        isOrphan: true,
      }),
    ).toBe("Not used in any recipe");

    expect(
      formatCatalogReviewQueueIssue({
        displayName: "Unused herb",
        row: row({ ingredientId: "u", recipeUsage: { count: 0, names: [] } }),
      }),
    ).toBe("Not used in any recipe");
  });

  it("maps alias-only and multi-alias rows", () => {
    expect(
      formatCatalogReviewQueueIssue({
        displayName: "PALHA",
        isAliasOnly: true,
      }),
    ).toBe("Several invoice names map here");

    expect(
      formatCatalogReviewQueueIssue({
        displayName: "Bacon",
        row: row({
          ingredientId: "b",
          invoiceReferenceCount: 3,
          sourceInvoiceAliases: ["BAC STRK", "BACON STRK"],
          recipeUsage: { count: 2, names: ["Burger"] },
        }),
      }),
    ).toBe("Several invoice names map here");
  });

  it("offers archive for orphan, stale, alias-only, unused, and duplicates", () => {
    expect(catalogReviewOffersArchive({ displayName: "Orphan", isOrphan: true })).toBe(true);
    expect(catalogReviewOffersArchive({ displayName: "PALHA", isAliasOnly: true })).toBe(true);
    expect(catalogReviewOffersArchive({ displayName: "Old oil", isStale: true })).toBe(true);
    expect(
      catalogReviewOffersArchive({
        displayName: "Unused",
        row: row({ ingredientId: "u", recipeUsage: { count: 0, names: [] } }),
      }),
    ).toBe(true);
    expect(
      catalogReviewOffersArchive({
        displayName: "Dup",
        row: row({
          ingredientId: "d",
          discoveryKinds: ["operational_duplicate"],
          mergeHints: [
            {
              kind: "operational_duplicate_cluster",
              operationalKey: "x",
              ingredientIds: ["d", "e"],
              displayNames: ["A", "B"],
              confidence: "exact_operational_key",
              suggestedCanonicalIngredientId: "e",
            },
          ],
        }),
      }),
    ).toBe(true);
    expect(
      catalogReviewOffersArchive({
        displayName: "Active",
        row: row({ ingredientId: "a", recipeUsage: { count: 2, names: ["Burger"] } }),
      }),
    ).toBe(false);
  });

  it("marks orphan, stale, alias-only, and zero-recipe archive as prominent", () => {
    expect(catalogReviewArchiveIsProminent({ displayName: "Orphan", isOrphan: true })).toBe(
      true,
    );
    expect(catalogReviewArchiveIsProminent({ displayName: "PALHA", isAliasOnly: true })).toBe(
      true,
    );
    expect(catalogReviewArchiveIsProminent({ displayName: "Stale", isStale: true })).toBe(true);
    expect(
      catalogReviewArchiveIsProminent({
        displayName: "Unused",
        row: row({ ingredientId: "u", recipeUsage: { count: 0, names: [] } }),
      }),
    ).toBe(true);
    expect(
      catalogReviewArchiveIsProminent({
        displayName: "Dup only",
        row: row({
          ingredientId: "d",
          discoveryKinds: ["operational_duplicate"],
          mergeHints: [
            {
              kind: "operational_duplicate_cluster",
              operationalKey: "x",
              ingredientIds: ["d", "e"],
              displayNames: ["A", "B"],
              confidence: "exact_operational_key",
              suggestedCanonicalIngredientId: "e",
            },
          ],
          recipeUsage: { count: 1, names: ["Burger"] },
        }),
      }),
    ).toBe(false);
  });

  it("maps stale and naming leak rows", () => {
    expect(
      formatCatalogReviewQueueIssue({
        displayName: "Old oil",
        isStale: true,
        row: row({ ingredientId: "o", recipeUsage: { count: 1, names: ["Fries"] } }),
      }),
    ).toBe("Hasn't been purchased recently");

    expect(
      formatCatalogReviewQueueIssue({
        displayName: "BAT shoestr",
        needsRename: true,
        row: row({
          ingredientId: "bat",
          leakReason: "legacy_canonical_shorthand",
        }),
      }),
    ).toBe("Name may need cleanup");
  });
});
