import { describe, expect, it } from "vitest";
import {
  ALIAS_INTEGRITY_VERY_LOW_CONFIDENCE_THRESHOLD,
  auditIngredientAliasMapping,
  isSuspiciousIngredientAliasMapping,
  isVeryLowAliasMappingConfidence,
  suggestCanonicalIngredientForAlias,
} from "@/lib/ingredient-alias-integrity-audit";

describe("auditIngredientAliasMapping", () => {
  it("flags batata alias mapped to alface canonical", () => {
    const result = auditIngredientAliasMapping({
      aliasName: "BATATA PALHA 9x9",
      canonicalName: "Alface iceberg",
    });
    expect(isSuspiciousIngredientAliasMapping(result)).toBe(true);
    expect(result.reasonFlags).toContain("category_token_mismatch");
    expect(result.confidence).toBeLessThan(ALIAS_INTEGRITY_VERY_LOW_CONFIDENCE_THRESHOLD);
  });

  it("flags batata frita alias mapped to lettuce canonical", () => {
    const result = auditIngredientAliasMapping({
      aliasName: "BATATA FRITA",
      canonicalName: "Alface iceberg",
    });
    expect(isSuspiciousIngredientAliasMapping(result)).toBe(true);
    expect(result.reasonFlags).toContain("category_token_mismatch");
  });

  it("flags sunflower oil alias mapped to batata frita canonical", () => {
    const result = auditIngredientAliasMapping({
      aliasName: "Óleo girassol",
      canonicalName: "Batata frita",
    });
    expect(isSuspiciousIngredientAliasMapping(result)).toBe(true);
    expect(result.reasonFlags).toContain("category_token_mismatch");
  });

  it("does not flag similar batata palha names", () => {
    const result = auditIngredientAliasMapping({
      aliasName: "BAT PALHA SNACK",
      canonicalName: "Batata palha",
    });
    expect(isSuspiciousIngredientAliasMapping(result)).toBe(false);
    expect(result.reasonFlags).not.toContain("category_token_mismatch");
  });

  it("does not flag batata frita invoice shorthand with size grid", () => {
    const result = auditIngredientAliasMapping({
      aliasName: "BATATA FRITA 9X9",
      canonicalName: "Batata frita",
    });
    expect(isSuspiciousIngredientAliasMapping(result)).toBe(false);
    expect(result.confidence).toBeGreaterThanOrEqual(ALIAS_INTEGRITY_VERY_LOW_CONFIDENCE_THRESHOLD);
  });

  it("does not flag bacon supplier shorthand vs canonical wording", () => {
    const result = auditIngredientAliasMapping({
      aliasName: "BAC FUM FAT",
      canonicalName: "Bacon fatiado fumado",
    });
    expect(isSuspiciousIngredientAliasMapping(result)).toBe(false);
    expect(result.reasonFlags).toHaveLength(0);
  });

  it("does not flag coca cola invoice line vs canonical pack wording", () => {
    const result = auditIngredientAliasMapping({
      aliasName: "Coca Cola Zero Lata",
      canonicalName: "Coca cola zero lata 33cl",
    });
    expect(isSuspiciousIngredientAliasMapping(result)).toBe(false);
    expect(result.reasonFlags).toHaveLength(0);
  });

  it("does not flag matching normalized identities", () => {
    const result = auditIngredientAliasMapping({
      aliasName: "alface iceberg",
      canonicalName: "Alface iceberg",
    });
    expect(result.confidence).toBe(1);
    expect(result.reasonFlags).toHaveLength(0);
    expect(isVeryLowAliasMappingConfidence(result.confidence)).toBe(false);
  });
});

describe("suggestCanonicalIngredientForAlias", () => {
  it("suggests potato canonical for batata alias when mapped to lettuce", () => {
    const suggestion = suggestCanonicalIngredientForAlias({
      aliasName: "BATATA PALHA",
      currentCanonicalId: "lettuce-id",
      catalog: [
        { id: "lettuce-id", name: "Alface iceberg" },
        { id: "potato-id", name: "Batata palha" },
      ],
    });
    expect(suggestion?.ingredientId).toBe("potato-id");
    expect(suggestion?.displayName).toBe("Batata palha");
  });
});
