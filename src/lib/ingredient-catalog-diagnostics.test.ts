import { describe, expect, it } from "vitest";
import type { IngredientCanonicalInput } from "./ingredient-canonical";
import {
  buildCatalogPollutionRowDiagnostics,
  detectCatalogLeakRows,
  detectNearDuplicateCanonicalClusters,
} from "./ingredient-catalog-diagnostics";

function ingredient(
  id: string,
  name: string,
  extra?: Partial<IngredientCanonicalInput>,
): IngredientCanonicalInput {
  return { id, name, normalized_name: name.toLowerCase(), ...extra };
}

describe("detectCatalogLeakRows", () => {
  it("flags CHK BREADED legacy canonical pollution", () => {
    const leaks = detectCatalogLeakRows([
      ingredient("good", "Chicken Breaded / Frango Panado", { ingredient_kind: "canonical" }),
      ingredient("bad", "CHK BREADED", { ingredient_kind: "canonical" }),
    ]);
    expect(leaks).toHaveLength(1);
    expect(leaks[0]?.id).toBe("bad");
    expect(leaks[0]?.reason).toBe("legacy_canonical_shorthand");
  });

  it("flags explicit alias kind rows", () => {
    const leaks = detectCatalogLeakRows([
      ingredient("alias", "BAC FUM FAT", { ingredient_kind: "alias" }),
    ]);
    expect(leaks[0]?.reason).toBe("explicit_alias_kind");
  });
});

describe("buildCatalogPollutionRowDiagnostics", () => {
  it("marks legacy canonical shorthand as non-canonical with alias source", () => {
    const entry = ingredient("bad", "CHK BREADED", { ingredient_kind: "canonical" });
    const leak = detectCatalogLeakRows([entry])[0]!;
    const diag = buildCatalogPollutionRowDiagnostics(entry, leak);
    expect(diag.isCanonical).toBe(false);
    expect(diag.leakReason).toBe("legacy_canonical_shorthand");
    expect(diag.aliasSourceText).toBe("CHK BREADED");
    expect(diag.createdFromInvoiceRow).toBe("unknown/legacy");
    expect(diag.inferredCreationSource).toContain("historical_insert");
  });

  it("uses explicit alias kind for creation source", () => {
    const entry = ingredient("alias", "BAC FUM FAT", { ingredient_kind: "alias" });
    const leak = detectCatalogLeakRows([entry])[0]!;
    const diag = buildCatalogPollutionRowDiagnostics(entry, leak);
    expect(diag.inferredKind).toBe("alias");
    expect(diag.inferredCreationSource).toBe("db_column:ingredient_kind=alias");
    expect(diag.aliasSourceText).toBe("BAC FUM FAT");
  });
});

describe("detectNearDuplicateCanonicalClusters", () => {
  it("clusters óleo girassol rows that share cleaned catalog identity (supplier + bulk L stripped)", () => {
    const clusters = detectNearDuplicateCanonicalClusters([
      ingredient("oil-base", "Óleo girassol", { normalized_name: "oleo girassol" }),
      ingredient("oil-auchan", "OLEO GIRASSOL AUCHAN 10L", {
        normalized_name: "oleo girassol auchan 10l",
      }),
      ingredient("oil-continente", "OLEO GIRASSOL CONTINENTE 10L", {
        normalized_name: "oleo girassol continente 10l",
      }),
    ]);
    const girassol = clusters.find((c) => c.cleanedNormalizedKey === "oleo girassol");
    expect(girassol?.members.length).toBe(3);
    expect(girassol?.operationalKeys.length).toBeGreaterThanOrEqual(2);
  });

  it("ignores unrelated single rows", () => {
    const clusters = detectNearDuplicateCanonicalClusters([
      ingredient("a", "Batata palha"),
      ingredient("b", "Bacon fatias"),
    ]);
    expect(clusters).toHaveLength(0);
  });
});
