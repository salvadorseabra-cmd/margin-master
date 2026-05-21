import { describe, expect, it } from "vitest";
import {
  buildCatalogIngredientIdentity,
  cleanCanonicalIngredientNameForCatalog,
} from "./canonical-ingredient-display-name";
import { normalizeOperationalIdentityKey } from "./ingredient-operational-identity";
import { normalizeInvoiceMatchIngredientName } from "./normalize-ingredient-name";

describe("buildCatalogIngredientIdentity", () => {
  it('preserves batata+palha in normalized_name (not "palha" alone)', () => {
    const identity = buildCatalogIngredientIdentity("Batata palha");
    expect(identity.normalized_name).toBe("batata palha");
    expect(identity.name).toBe("Batata palha");
    expect(identity.normalized_name).toContain("batata");
    expect(identity.normalized_name).toContain("palha");
  });

  it("does not collapse Batata palha display cleanup to palha only", () => {
    expect(cleanCanonicalIngredientNameForCatalog("Batata palha")).toBe("Batata palha");
    expect(cleanCanonicalIngredientNameForCatalog("BATATA PALHA AUCHAN 2KG")).toBe("BATATA PALHA");
  });

  it("differs from semantic invoice-match normalization for palha rows", () => {
    const catalogKey = buildCatalogIngredientIdentity("Batata palha").normalized_name;
    const aliasMemoryKey = normalizeOperationalIdentityKey("Batata palha");
    const semanticMatchKey = normalizeInvoiceMatchIngredientName("Batata palha");
    expect(catalogKey).toBe("batata palha");
    expect(aliasMemoryKey).toBe("batata palha");
    expect(semanticMatchKey).toBe("batata frita");
    expect(catalogKey).not.toBe(semanticMatchKey);
  });
});
