import { describe, expect, it } from "vitest";
import { buildCatalogReviewPossibleConfusionSuggestions } from "./catalog-review-possible-confusion";
import type { CatalogReviewRow } from "./catalog-pollution-review";
import type { IngredientCanonicalInput } from "./ingredient-canonical";

function reviewRow(
  partial: Partial<CatalogReviewRow> & { ingredientId: string },
): CatalogReviewRow {
  return {
    ingredientId: partial.ingredientId,
    canonicalDisplayName: partial.canonicalDisplayName ?? "Test",
    rawName: partial.rawName ?? "Test",
    sourceInvoiceAliases: partial.sourceInvoiceAliases ?? ["BATATA FRITA", "ICE SHRED"],
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

const catalog: IngredientCanonicalInput[] = [
  { id: "ing-iceberg", name: "Alface iceberg", normalized_name: "alface iceberg" },
  { id: "ing-batata", name: "Batata frita", normalized_name: "batata frita" },
];

describe("buildCatalogReviewPossibleConfusionSuggestions", () => {
  it("returns similarity candidate display names when semantically incompatible", () => {
    expect(
      buildCatalogReviewPossibleConfusionSuggestions(
        reviewRow({
          ingredientId: "ing-iceberg",
          similarityCandidates: [
            { ingredientId: "ing-batata", displayName: "Batata frita", score: 0.72 },
          ],
        }),
        catalog,
        "ing-iceberg",
      ),
    ).toEqual(["Batata frita"]);
  });

  it("omits similarity candidates that are compatible with the selected canonical", () => {
    expect(
      buildCatalogReviewPossibleConfusionSuggestions(
        reviewRow({
          ingredientId: "ing-bacon",
          canonicalDisplayName: "Bacon fatiado fumado",
          similarityCandidates: [
            { ingredientId: "ing-bacon-2", displayName: "Bacon streaky", score: 0.72 },
          ],
        }),
        [{ id: "ing-bacon", name: "Bacon fatiado fumado" }, { id: "ing-bacon-2", name: "Bacon streaky" }],
        "ing-bacon",
      ),
    ).toEqual([]);
  });

  it("returns merge-hint cluster names for other ingredient ids", () => {
    expect(
      buildCatalogReviewPossibleConfusionSuggestions(
        reviewRow({
          ingredientId: "ing-iceberg",
          mergeHints: [
            {
              kind: "operational_duplicate_cluster",
              operationalKey: "bat",
              ingredientIds: ["ing-iceberg", "ing-batata"],
              displayNames: ["Alface iceberg", "Batata shoestring"],
              suggestedCanonicalIngredientId: "ing-batata",
            },
          ],
        }),
        catalog,
        "ing-iceberg",
      ),
    ).toEqual(["Batata shoestring"]);
  });

  it("never surfaces sourceInvoiceAliases as suggestions", () => {
    expect(
      buildCatalogReviewPossibleConfusionSuggestions(
        reviewRow({
          ingredientId: "ing-iceberg",
          sourceInvoiceAliases: ["BATATA FRITA"],
          similarityCandidates: [],
          mergeHints: [],
        }),
        catalog,
        "ing-iceberg",
      ),
    ).toEqual([]);
  });

  it("dedupes names case-insensitively", () => {
    expect(
      buildCatalogReviewPossibleConfusionSuggestions(
        reviewRow({
          ingredientId: "ing-iceberg",
          similarityCandidates: [
            { ingredientId: "ing-batata", displayName: "Batata frita", score: 0.7 },
            { ingredientId: "ing-batata", displayName: "batata frita", score: 0.65 },
          ],
        }),
        catalog,
        "ing-iceberg",
      ),
    ).toEqual(["Batata frita"]);
  });

  it("returns empty when review row is missing or mismatched", () => {
    expect(
      buildCatalogReviewPossibleConfusionSuggestions(null, catalog, "ing-iceberg"),
    ).toEqual([]);
    expect(
      buildCatalogReviewPossibleConfusionSuggestions(
        reviewRow({ ingredientId: "ing-other" }),
        catalog,
        "ing-iceberg",
      ),
    ).toEqual([]);
  });
});
