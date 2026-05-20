import { describe, expect, it } from "vitest";
import type { IngredientCanonicalInput } from "./ingredient-canonical";
import { diagnoseIngredientCatalogIdentity } from "./ingredient-identity-diagnostics";

function ingredient(id: string, name: string, normalized_name?: string): IngredientCanonicalInput {
  return { id, name, normalized_name };
}

describe("diagnoseIngredientCatalogIdentity", () => {
  it("reports operational duplicate clusters for ANGUS PTY variants", () => {
    const catalog = [
      ingredient("a1", "ANGUS PTY", "angus pty"),
      ingredient("a2", "Angus Patty", "angus patty"),
      ingredient("a3", "ANG PTY", "ang pty"),
    ];
    const diag = diagnoseIngredientCatalogIdentity(catalog);
    expect(diag.operationalDuplicateClusters.length).toBeGreaterThanOrEqual(1);
    const cluster = diag.operationalDuplicateClusters[0];
    expect(cluster?.ingredientIds.length).toBe(3);
    expect(cluster?.confidence).toBe("exact_operational_key");
  });

  it("reports repeated display names", () => {
    const catalog = [ingredient("a1", "BACON"), ingredient("a2", "BACON")];
    const diag = diagnoseIngredientCatalogIdentity(catalog);
    expect(diag.repeatedDisplayNames).toHaveLength(1);
    expect(diag.repeatedDisplayNames[0]?.ingredientIds).toEqual(["a1", "a2"]);
  });

  it("ignores archived merged duplicates in operational clusters", () => {
    const catalog = [
      ingredient("canonical", "ANGUS PTY", "angus pty"),
      ingredient("dup", "Angus Patty", "angus patty"),
      {
        ...ingredient("dup-archived", "ANG PTY", "ang pty"),
        is_archived: true,
        merged_into_ingredient_id: "canonical",
      },
    ];
    const diag = diagnoseIngredientCatalogIdentity(catalog);
    const angusCluster = diag.operationalDuplicateClusters.find((cluster) =>
      cluster.ingredientIds.includes("canonical"),
    );
    expect(angusCluster?.ingredientIds).not.toContain("dup-archived");
    expect(angusCluster?.ingredientIds.length).toBe(2);
  });
});
