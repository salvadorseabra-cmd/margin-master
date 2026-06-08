import { describe, expect, it } from "vitest";
import { findCanonicalIngredientMatch } from "./ingredient-canonical";
import { canonicalizeIngredientIdentity } from "./ingredient-identity";
import {
  VOCABULARY_PILOT_CORE_TOKENS,
  VOCABULARY_PILOT_FAMILY_TOKEN_TO_ID,
} from "./ingredient-vocabulary-pilot";

describe("vocabulary pilot tokens", () => {
  it("registers exactly 15 pilot tokens", () => {
    expect(VOCABULARY_PILOT_CORE_TOKENS).toHaveLength(15);
    expect(Object.keys(VOCABULARY_PILOT_FAMILY_TOKEN_TO_ID)).toHaveLength(15);
  });
});

describe("vocabulary pilot cold-start identity", () => {
  it("maps Novilho Vazia to meat family", () => {
    const id = canonicalizeIngredientIdentity("Novilho Vazia");
    expect(id.family).toBe("meat");
  });

  it("maps Novilho Acém Sem Osso to meat family", () => {
    const id = canonicalizeIngredientIdentity("Novilho Acém Sem Osso");
    expect(id.family).toBe("meat");
  });

  it("maps Pão Rústico to bread family", () => {
    const id = canonicalizeIngredientIdentity("Pão Rústico 100g");
    expect(id.family).toBe("bread");
  });

  it("maps Molho BBQ to sauce family", () => {
    const id = canonicalizeIngredientIdentity("Molho BBQ");
    expect(id.family).toBe("sauce");
  });

  it("preserves QUEIJO CHEDDAR cluster family as cheddar", () => {
    const id = canonicalizeIngredientIdentity("QUEIJO CHEDDAR AUCHAN 1KG");
    expect(id.family).toBe("cheddar");
  });
});

describe("vocabulary pilot cold-start matching", () => {
  const novilhoVaziaCatalog = [{ id: "nv-1", name: "Novilho Vazia" }];
  const novilhoAcemCatalog = [{ id: "na-1", name: "Novilho Acém Sem Osso" }];
  const frangoCatalog = [{ id: "pf-1", name: "Peito de Frango" }];
  const pepinoCatalog = [{ id: "pep-1", name: "Pepino" }];
  const paoRusticoCatalog = [{ id: "pr-1", name: "Pão Rústico 100g" }];
  const paoSesamoCatalog = [{ id: "ps-1", name: "Pão Hamb. Sésamo 80g" }];
  const molhoBbqCatalog = [{ id: "mb-1", name: "Molho BBQ" }];
  const mostardaCatalog = [{ id: "mo-1", name: "MOSTARDA AMARELA HEINZ TOP DOWN 875ML" }];

  it("matches Novilho Vazia invoice line to catalog", () => {
    const match = findCanonicalIngredientMatch("Novilho Vazia", novilhoVaziaCatalog);
    expect(match?.ingredient.id).toBe("nv-1");
  });

  it("matches Novilho Acém Sem Osso invoice line to catalog", () => {
    const match = findCanonicalIngredientMatch("Novilho Acém Sem Osso", novilhoAcemCatalog);
    expect(match?.ingredient.id).toBe("na-1");
  });

  it("matches Peito de Frango invoice line to catalog", () => {
    const match = findCanonicalIngredientMatch("Peito de Frango", frangoCatalog);
    expect(match?.ingredient.id).toBe("pf-1");
  });

  it("matches Pepino invoice line to catalog", () => {
    const match = findCanonicalIngredientMatch("Pepino", pepinoCatalog);
    expect(match?.ingredient.id).toBe("pep-1");
  });

  it("matches Pão Rústico invoice line to catalog", () => {
    const match = findCanonicalIngredientMatch("Pão Rústico 100g", paoRusticoCatalog);
    expect(match?.ingredient.id).toBe("pr-1");
  });

  it("matches Pão Sésamo invoice line to catalog", () => {
    const match = findCanonicalIngredientMatch("Pão Hamb. Sésamo 80g", paoSesamoCatalog);
    expect(match?.ingredient.id).toBe("ps-1");
  });

  it("matches Molho BBQ invoice line to catalog", () => {
    const match = findCanonicalIngredientMatch("Molho BBQ", molhoBbqCatalog);
    expect(match?.ingredient.id).toBe("mb-1");
  });

  it("matches Mostarda Amarela invoice line to catalog", () => {
    const match = findCanonicalIngredientMatch(
      "MOSTARDA AMARELA HEINZ TOP DOWN 875ML",
      mostardaCatalog,
    );
    expect(match?.ingredient.id).toBe("mo-1");
  });
});
