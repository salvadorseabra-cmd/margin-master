import { describe, expect, it } from "vitest";
import {
  findCanonicalIngredientMatch,
  hasCompatibleIngredientFormFamilies,
  OPERATIONAL_EQUIVALENT_MATCH_REASON,
  SEMANTIC_AUTO_MATCH_MIN_SCORE,
  SEMANTIC_MATCH_MIN_SCORE,
} from "./ingredient-canonical";
import {
  CANONICAL_IDENTITY_SCORE_WEIGHTS,
  canonicalizeIngredientIdentity as canonicalize,
  computeMatchScoreBreakdown,
  hasCompatibleCanonicalForms,
  needsOperationalHumanConfirm,
  OPERATIONAL_ALIAS_CLUSTERS,
  OPERATIONAL_EQUIVALENT_MIN_SCORE,
  scoreCanonicalIngredientSimilarity,
} from "./ingredient-identity";
import {
  detectFormSpecific,
  detectParentConcept,
  resolveParentFormHierarchyMatch,
} from "./ingredient-parent-form";

describe("canonicalizeIngredientIdentity", () => {
  it("parses foodservice palha snack line into batata palha core", () => {
    const id = canonicalize("PALHA SNACK FOOD SERVICE 2KG");
    expect(id.family).toBe("batata");
    expect(id.form).toBe("palha");
    expect(id.normalizedCore).toBe("batata palha");
    expect(id.commercialNoise).toEqual(expect.arrayContaining(["snack", "food", "service"]));
  });

  it("parses retailer cheddar with implicit plain family", () => {
    const id = canonicalize("QUEIJO CHEDDAR AUCHAN 1KG");
    expect(id.family).toBe("cheddar");
    expect(id.commercialNoise).toContain("auchan");
    expect(id.normalizedCore).toBe("cheddar");
  });

  it("keeps sliced form when queijo cheddar fatiado matches form cluster", () => {
    const id = canonicalize("QUEIJO CHEDDAR FATIADO 1KG");
    expect(id.family).toBe("cheddar");
    expect(id.form).toBe("sliced");
    expect(id.normalizedCore).toBe("cheddar sliced");
  });

  it("maps potato sticks to batata palha form cluster", () => {
    const id = canonicalize("POTATO STICKS 2KG");
    expect(id.family).toBe("batata");
    expect(id.form).toBe("palha");
    expect(id.normalizedCore).toBe("batata palha");
  });

  it("treats top down as commercial noise not preparation form", () => {
    const id = canonicalize("KETCHUP GULOSO TOP DOWN 570G");
    expect(id.form).toBeNull();
    expect(id.commercialNoise).toEqual(expect.arrayContaining(["top", "down"]));
  });
});

describe("canonical identity scoring weights", () => {
  it("exports layered score weights that sum to ~1", () => {
    const sum = Object.values(CANONICAL_IDENTITY_SCORE_WEIGHTS).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1, 2);
  });

  it("exposes operational alias clusters for palha, cherry, and form-specific cheddar", () => {
    const ids = OPERATIONAL_ALIAS_CLUSTERS.map((c) => c.id);
    expect(ids).toContain("batata-palha");
    expect(ids).toContain("tomate-cherry");
    expect(ids).toContain("cheddar-sliced");
    expect(ids).toContain("cheddar-block");
    expect(ids).toContain("cheddar-molho");
  });
});

describe("operational equivalence (safe vs unsafe)", () => {
  const palhaCatalog = [{ id: "bat-palha", name: "BATATA PALHA 2KG" }];
  const cheddarCatalog = [{ id: "ched-1kg", name: "CHEDDAR 1KG" }];
  const cherryCatalog = [{ id: "tom-cherry", name: "TOMATE CHERRY 250G" }];
  const cheddarBlockCatalog = [{ id: "ched-bloco", name: "CHEDDAR BLOCO 1KG" }];
  const cheddarSlicedCatalog = [{ id: "ched-fatiado", name: "QUEIJO CHEDDAR FATIADO 1KG" }];
  const cheddarMolhoCatalog = [{ id: "ched-molho", name: "CHEDDAR MOLHO 1KG" }];
  const corteFinoCatalog = [{ id: "bat-cf", name: "BATATA CORTE FINO 2KG" }];

  it("SAFE: PALHA SNACK FOOD SERVICE suggests BATATA PALHA (not auto)", () => {
    const match = findCanonicalIngredientMatch("PALHA SNACK FOOD SERVICE 2KG", palhaCatalog);
    expect(match?.ingredient.id).toBe("bat-palha");
    expect(match?.kind).toBe("operational-equivalent");
    expect(match?.reason).toBe(OPERATIONAL_EQUIVALENT_MATCH_REASON);
    expect(needsOperationalHumanConfirm("PALHA SNACK FOOD SERVICE 2KG", "BATATA PALHA 2KG")).toBe(
      true,
    );
  });

  it("SAFE: BATATA PALHA CONTINENTE 2KG matches BATATA PALHA catalog", () => {
    const match = findCanonicalIngredientMatch("BATATA PALHA CONTINENTE 2KG", palhaCatalog);
    expect(match?.ingredient.id).toBe("bat-palha");
    expect(["exact", "operational-equivalent"]).toContain(match?.kind);
  });

  it("SAFE: BATATA PALHA AUCHAN 2KG matches BATATA PALHA catalog", () => {
    const match = findCanonicalIngredientMatch("BATATA PALHA AUCHAN 2KG", palhaCatalog);
    expect(match?.ingredient.id).toBe("bat-palha");
    expect(["exact", "operational-equivalent"]).toContain(match?.kind);
  });

  it("SAFE: CHEDDAR AUCHAN 1KG suggests CHEDDAR 1KG (not auto)", () => {
    const match = findCanonicalIngredientMatch("CHEDDAR AUCHAN 1KG", cheddarCatalog);
    expect(match?.ingredient.id).toBe("ched-1kg");
    expect(match?.kind).toBe("operational-equivalent");
    expect(match?.reason).toBe(OPERATIONAL_EQUIVALENT_MATCH_REASON);
  });

  it("SAFE: QUEIJO CHEDDAR AUCHAN matches plain CHEDDAR catalog line", () => {
    const match = findCanonicalIngredientMatch("QUEIJO CHEDDAR AUCHAN 1KG", cheddarCatalog);
    expect(match?.ingredient.id).toBe("ched-1kg");
    expect(["exact", "operational-equivalent"]).toContain(match?.kind);
    expect(match?.scoreBreakdown?.rejectionReason).toBeNull();
  });

  it("SAFE: plain QUEIJO CHEDDAR AUCHAN suggests form-specific FATIADO catalog (not exact)", () => {
    const match = findCanonicalIngredientMatch(
      "QUEIJO CHEDDAR AUCHAN 1KG",
      cheddarSlicedCatalog,
    );
    expect(match?.ingredient.id).toBe("ched-fatiado");
    expect(match?.kind).toBe("operational-equivalent");
    expect(match?.reason).toContain("parent-form hierarchy");
    expect(match?.reason).toContain("plain cheddar");
    expect(match?.reason).toContain("fatiado");
    expect(match?.kind).not.toBe("exact");
  });

  it("SAFE: TOM CHERRY RAMA matches TOMATE CHERRY", () => {
    const match = findCanonicalIngredientMatch("TOM CHERRY RAMA 250G", cherryCatalog);
    expect(match?.ingredient.id).toBe("tom-cherry");
    expect(match?.kind).toBe("exact");
  });

  it("UNSAFE: BATATA PALHA does not match BATATA CORTE FINO", () => {
    expect(
      findCanonicalIngredientMatch("BATATA PALHA 2KG", corteFinoCatalog),
    ).toBeNull();
    expect(
      hasCompatibleIngredientFormFamilies("BATATA PALHA 2KG", "BATATA CORTE FINO 2KG"),
    ).toBe(false);
    expect(hasCompatibleCanonicalForms("palha", "corte_fino")).toBe(false);
  });

  it("SAFE: BATATA PALHA 2KG SERVICE auto-matches BATATA PALHA catalog", () => {
    const match = findCanonicalIngredientMatch("BATATA PALHA 2KG SERVICE", palhaCatalog);
    expect(match?.ingredient.id).toBe("bat-palha");
    expect(match?.kind).toBe("exact");
  });

  it("UNSAFE: CHEDDAR MOLHO does not match CHEDDAR BLOCO", () => {
    expect(
      findCanonicalIngredientMatch("CHEDDAR MOLHO 1KG", cheddarBlockCatalog),
    ).toBeNull();
    expect(
      hasCompatibleIngredientFormFamilies("CHEDDAR MOLHO 1KG", "CHEDDAR BLOCO 1KG"),
    ).toBe(false);
    expect(hasCompatibleCanonicalForms("molho", "block")).toBe(false);
  });

  it("UNSAFE: CHEDDAR MOLHO does not match CHEDDAR FATIADO", () => {
    expect(
      findCanonicalIngredientMatch("CHEDDAR MOLHO 1KG", cheddarSlicedCatalog),
    ).toBeNull();
    expect(
      hasCompatibleIngredientFormFamilies("CHEDDAR MOLHO 1KG", "QUEIJO CHEDDAR FATIADO 1KG"),
    ).toBe(false);
  });

  it("UNSAFE: QUEIJO CHEDDAR FATIADO does not match QUEIJO CHEDDAR BLOCO", () => {
    expect(
      findCanonicalIngredientMatch("QUEIJO CHEDDAR FATIADO 1KG", cheddarBlockCatalog),
    ).toBeNull();
    expect(
      findCanonicalIngredientMatch("QUEIJO CHEDDAR BLOCO 1KG", [
        { id: "ched-sliced", name: "QUEIJO CHEDDAR FATIADO 1KG" },
      ]),
    ).toBeNull();
    expect(hasCompatibleCanonicalForms("sliced", "block")).toBe(false);
  });

  it("UNSAFE: TOMATE TRITURADO does not match TOMATE CHERRY", () => {
    expect(
      findCanonicalIngredientMatch("TOMATE TRITURADO 250G", cherryCatalog),
    ).toBeNull();
    expect(hasCompatibleCanonicalForms("triturado", "cherry")).toBe(false);
  });

  it("preserves semantic and operational thresholds", () => {
    expect(SEMANTIC_MATCH_MIN_SCORE).toBe(0.72);
    expect(SEMANTIC_AUTO_MATCH_MIN_SCORE).toBe(0.88);
    expect(OPERATIONAL_EQUIVALENT_MIN_SCORE).toBe(0.58);
  });

  it("blocks incompatible dip vs slices forms", () => {
    expect(hasCompatibleCanonicalForms("dip", "sliced")).toBe(false);
    expect(hasCompatibleCanonicalForms("molho", "dip")).toBe(false);
  });
});

describe("match score breakdown (SAFE + UNSAFE)", () => {
  const palhaCatalog = [{ id: "bat-palha", name: "BATATA PALHA 2KG" }];

  it("attaches promotion breakdown on SAFE operational-equivalent match", () => {
    const match = findCanonicalIngredientMatch("PALHA SNACK FOOD SERVICE 2KG", palhaCatalog);
    expect(match?.scoreBreakdown).toBeDefined();
    expect(match?.scoreBreakdown?.rejectionReason).toBeNull();
    expect(match?.scoreBreakdown?.operationalFamilyScore).toBe(1);
    expect(match?.scoreBreakdown?.formCompatibilityScore).toBe(1);
    expect(match?.scoreBreakdown?.blockerPenalty).toBe(0);
    expect(match?.scoreBreakdown?.finalPromotionScore).toBeGreaterThanOrEqual(
      OPERATIONAL_EQUIVALENT_MIN_SCORE,
    );
  });

  it("UNSAFE blocked match has incompatible-form rejection on candidate scoring", () => {
    const breakdown = computeMatchScoreBreakdown({
      rawItem: "BATATA PALHA 2KG",
      rawIngredient: "BATATA CORTE FINO 2KG",
      semanticSimilarity: 0,
      hasCompatibleIngredientForms: false,
    });
    expect(breakdown.rejectionReason).toBe("blocked_incompatible_form");
    expect(breakdown.blockerPenalty).toBe(1);
    expect(breakdown.finalPromotionScore).toBe(0);
  });
});

describe("parent-form hierarchy", () => {
  it("detects plain parent and form-specific child for cheddar", () => {
    const plain = canonicalize("QUEIJO CHEDDAR AUCHAN 1KG");
    const sliced = canonicalize("QUEIJO CHEDDAR FATIADO 1KG");
    expect(detectParentConcept(plain)).toBe(true);
    expect(detectFormSpecific(sliced)).toBe(true);
    expect(resolveParentFormHierarchyMatch(plain, sliced)?.childForm).toBe("sliced");
  });

  it("does not treat two form-specific cheddar lines as parent-form hierarchy", () => {
    const molho = canonicalize("CHEDDAR MOLHO 1KG");
    const sliced = canonicalize("QUEIJO CHEDDAR FATIADO 1KG");
    expect(resolveParentFormHierarchyMatch(molho, sliced)).toBeNull();
  });
});

describe("scoreCanonicalIngredientSimilarity", () => {
  it("scores high for same batata palha cluster identities", () => {
    const a = canonicalize("PALHA SNACK FOOD SERVICE 2KG");
    const b = canonicalize("BATATA PALHA 2KG");
    const result = scoreCanonicalIngredientSimilarity(a, b);
    expect(result.score).toBeGreaterThanOrEqual(SEMANTIC_AUTO_MATCH_MIN_SCORE);
    expect(result.familyOverlap).toBe(1);
    expect(result.formCompatibility).toBe(1);
  });

  it("scores zero for incompatible cheddar forms", () => {
    const a = canonicalize("CHEDDAR MOLHO 1KG");
    const b = canonicalize("CHEDDAR BLOCO 1KG");
    expect(scoreCanonicalIngredientSimilarity(a, b).score).toBe(0);
  });

  it("scores plain cheddar vs fatiado below auto-confirm, above operational floor", () => {
    const plain = canonicalize("QUEIJO CHEDDAR AUCHAN 1KG");
    const sliced = canonicalize("QUEIJO CHEDDAR FATIADO 1KG");
    const result = scoreCanonicalIngredientSimilarity(plain, sliced);
    expect(result.score).toBeGreaterThanOrEqual(OPERATIONAL_EQUIVALENT_MIN_SCORE);
    expect(result.score).toBeLessThan(SEMANTIC_AUTO_MATCH_MIN_SCORE);
    expect(result.score).toBeLessThan(SEMANTIC_MATCH_MIN_SCORE);
    expect(result.formCompatibility).toBeGreaterThan(0);
    expect(result.formCompatibility).toBeLessThan(1);
  });
});
