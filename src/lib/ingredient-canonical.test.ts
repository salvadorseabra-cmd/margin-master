import { describe, expect, it } from "vitest";
import {
  equalCoreIngredientIdentity,
  extractIngredientFormFamilies,
  FAMILY_INGREDIENT_MATCH_TOKENS,
  findCanonicalIngredientMatch,
  hasCompatibleIngredientFormFamilies,
  normalizeInvoiceIngredientName,
  OPERATIONAL_EQUIVALENT_MATCH_REASON,
  SEMANTIC_AUTO_MATCH_MIN_SCORE,
  SEMANTIC_MATCH_MIN_SCORE,
  type IngredientCanonicalInput,
} from "./ingredient-canonical";
import { OPERATIONAL_EQUIVALENT_MIN_SCORE } from "./ingredient-identity";
import { findInvoiceItemIngredientMatch } from "./invoice-ingredient-match-propagation";
import { normalizeSupplierShorthand } from "./ingredient-operational-aliases";

function ingredient(id: string, name: string): IngredientCanonicalInput {
  return { id, name };
}

describe("findCanonicalIngredientMatch (weighted semantic)", () => {
  it("auto-matches sunflower oil despite different brand tokens", () => {
    const catalog = [ingredient("oil-1", "ÓLEO GIRASSOL FULA 1L")];
    const match = findCanonicalIngredientMatch("Óleo Girassol Vaqueiro 1L", catalog);

    expect(match).not.toBeNull();
    expect(match?.kind).toBe("exact");
    expect(match?.ingredient.id).toBe("oil-1");
    expect(normalizeInvoiceIngredientName("Óleo Girassol Vaqueiro 1L")).toContain("oleo");
    expect(normalizeInvoiceIngredientName("Óleo Girassol Vaqueiro 1L")).toContain("girassol");
  });

  it("auto-matches private-label mayo to a different brand at the same size", () => {
    const catalog = [ingredient("mayo-hellmann", "MAIONESE HELLMANN'S 450ML")];
    const match = findCanonicalIngredientMatch("MAIONESE CALVE TOP DOWN 450ML", catalog);

    expect(match?.kind).toBe("exact");
    expect(match?.ingredient.id).toBe("mayo-hellmann");
  });

  it("auto-matches oliveira da serra sunflower oil to another brand", () => {
    const catalog = [ingredient("oil-fula", "ÓLEO GIRASSOL FULA 1L")];
    const match = findCanonicalIngredientMatch("ÓLEO GIRASSOL OLIVEIRA DA SERRA 1L", catalog);

    expect(match?.kind).toBe("exact");
    expect(match?.ingredient.id).toBe("oil-fula");
  });

  it("exact-matches cherry tomato when normalization aligns wording", () => {
    const catalog = [ingredient("tom-1", "TOMATE CHERRY 250G")];
    const match = findCanonicalIngredientMatch("Tomate Cherry Rama 250g", catalog);

    expect(match).not.toBeNull();
    expect(match?.kind).toBe("exact");
    expect(match?.ingredient.id).toBe("tom-1");
  });

  it("does not suggest unrelated single-core ingredients", () => {
    const catalog = [
      ingredient("ketchup-1", "KETCHUP HEINZ 570G"),
      ingredient("mayo-1", "MAIONESE CALVE 450ML"),
    ];

    expect(
      findCanonicalIngredientMatch("KETCHUP GULOSO TOP DOWN 570G", catalog)?.ingredient.id,
    ).toBe("ketchup-1");
    expect(
      findCanonicalIngredientMatch("MAIONESE CALVE TOP DOWN 450ML", catalog)?.ingredient.id,
    ).toBe("mayo-1");
    expect(findCanonicalIngredientMatch("KETCHUP GULOSO TOP DOWN 570G", [catalog[1]])).toBeNull();
  });

  it("does not suggest match between different neutral-only products", () => {
    const catalog = [
      ingredient("arroz-1", "ARROZ CAROLINO 5 KG"),
      ingredient("arroz-2", "ARROZ BASMATI 5 KG"),
    ];

    expect(findCanonicalIngredientMatch("ARROZ CAROLINO 5 KG UN", catalog)?.kind).toBe("exact");
    expect(findCanonicalIngredientMatch("ARROZ BASMATI 5 KG", catalog)?.kind).toBe(
      "operational-memory",
    );
    expect(findCanonicalIngredientMatch("ARROZ CAROLINO 5 KG UN", [catalog[1]])).toBeNull();
  });

  it("does not suggest match between different core identities", () => {
    const catalog = [
      ingredient("tom-1", "TOMATE CHERRY 250G"),
      ingredient("alf-1", "ALFACE ICEBERG"),
    ];

    expect(findCanonicalIngredientMatch("TOMATE CHERRY 250G", [catalog[1]])).toBeNull();
    expect(findCanonicalIngredientMatch("ALFACE ICEBERG INTEIRA", [catalog[0]])).toBeNull();
  });

  it("uses conservative semantic thresholds for suggest vs auto", () => {
    expect(SEMANTIC_MATCH_MIN_SCORE).toBe(0.72);
    expect(SEMANTIC_AUTO_MATCH_MIN_SCORE).toBe(0.88);
  });

  it("does not auto-match partial core overlap (tomate vs tomate cherry)", () => {
    const catalog = [ingredient("tom-cherry", "TOMATE CHERRY 250G")];
    const match = findCanonicalIngredientMatch("TOMATE 250G", catalog);

    expect(match).toBeNull();
  });

  it("auto-matches from confirmed alias memory before fuzzy matching", () => {
    const catalog = [
      ingredient("oil-1", "ÓLEO GIRASSOL FULA 1L"),
      ingredient("mayo-1", "MAIONESE CALVE 450ML"),
    ];
    const normalizedLine = normalizeInvoiceIngredientName("Óleo Girassol Vaqueiro 1L");
    const aliases = { [normalizedLine]: "oil-1" };

    const match = findCanonicalIngredientMatch(
      "Óleo Girassol Vaqueiro 1L",
      catalog,
      aliases,
    );

    expect(match?.kind).toBe("confirmed-alias");
    expect(match?.ingredient.id).toBe("oil-1");
  });

  describe("potato form-family discrimination", () => {
    const potatoCatalog = [
      ingredient("bat-palha", "BATATA PALHA 2KG"),
      ingredient("bat-frita", "BATATA FRITA 2KG"),
      ingredient("bat-corte-fino", "BATATA FRITA CORTE FINO 2KG"),
      ingredient("bat-wedges", "BATATA WEDGES 2KG"),
      ingredient("bat-hash", "HASHBROWN 2KG"),
      ingredient("bat-plain", "BATATA 2KG"),
    ];

    it("extracts distinct form families from raw wording", () => {
      expect([...extractIngredientFormFamilies("BATATA PALHA 2KG")]).toEqual(["palha"]);
      expect([...extractIngredientFormFamilies("BATATA FRITA 2KG")]).toEqual(["frita"]);
      expect([...extractIngredientFormFamilies("BATATA FRITA CORTE FINO 2KG")]).toEqual([
        "corte_fino",
      ]);
      expect([...extractIngredientFormFamilies("BATATA WEDGES 2KG")]).toEqual(["wedges"]);
      expect([...extractIngredientFormFamilies("HASHBROWN 2KG")]).toEqual(["hashbrown"]);
      expect([...extractIngredientFormFamilies("BATATA 2KG")]).toEqual([]);
    });

    it("blocks incompatible form-family pairs", () => {
      expect(
        hasCompatibleIngredientFormFamilies("BATATA PALHA 2KG", "BATATA FRITA 2KG"),
      ).toBe(false);
      expect(
        hasCompatibleIngredientFormFamilies("BATATA 2KG", "BATATA WEDGES 2KG"),
      ).toBe(false);
      expect(
        hasCompatibleIngredientFormFamilies(
          "BATATA FRITA CORTE FINO 2KG",
          "HASHBROWN 2KG",
        ),
      ).toBe(false);
      expect(
        hasCompatibleIngredientFormFamilies("BATATA PALHA 2KG", "BATATA PALHA SERVICE 2KG"),
      ).toBe(true);
    });

    it("does not match batata palha to batata frita", () => {
      expect(
        findCanonicalIngredientMatch("BATATA PALHA 2KG", [potatoCatalog[1]])?.ingredient.id,
      ).toBeUndefined();
      expect(
        findCanonicalIngredientMatch("BATATA FRITA 2KG", [potatoCatalog[0]])?.ingredient.id,
      ).toBeUndefined();
    });

    it("does not match batata corte fino to hashbrown or palha", () => {
      expect(
        findCanonicalIngredientMatch("BATATA FRITA CORTE FINO 2KG", [potatoCatalog[4]])
          ?.ingredient.id,
      ).toBeUndefined();
      expect(
        findCanonicalIngredientMatch("HASHBROWN 2KG", [potatoCatalog[2]])?.ingredient.id,
      ).toBeUndefined();
      expect(
        findCanonicalIngredientMatch("BATATA FRITA CORTE FINO 2KG", [potatoCatalog[0]])
          ?.ingredient.id,
      ).toBeUndefined();
    });

    it("does not match generic batata to wedges or palha", () => {
      expect(
        findCanonicalIngredientMatch("BATATA 2KG", [potatoCatalog[0]])?.ingredient.id,
      ).toBeUndefined();
      expect(
        findCanonicalIngredientMatch("BATATA 2KG", [potatoCatalog[3]])?.ingredient.id,
      ).toBeUndefined();
    });

    it("exact-matches same potato form family despite retailer noise", () => {
      const match = findCanonicalIngredientMatch("BATATA PALHA 2KG SERVICE", [potatoCatalog[0]]);
      expect(match?.kind).toBe("exact");
      expect(match?.ingredient.id).toBe("bat-palha");
    });

    it("does not exact-match when normalization collapses different families", () => {
      expect(normalizeInvoiceIngredientName("BATATA PALHA 2KG")).toBe(
        normalizeInvoiceIngredientName("BATATA FRITA 2KG"),
      );
      expect(
        findCanonicalIngredientMatch("BATATA PALHA 2KG", [potatoCatalog[1]]),
      ).toBeNull();
    });
  });

  it("suggests foodservice palha line to batata palha without auto-confirm", () => {
    const catalog = [ingredient("bat-palha", "BATATA PALHA 2KG")];
    const match = findCanonicalIngredientMatch("PALHA SNACK FOOD SERVICE 2KG", catalog);

    expect(match).not.toBeNull();
    expect(match?.kind).toBe("operational-equivalent");
    expect(match?.reason).toBe(OPERATIONAL_EQUIVALENT_MATCH_REASON);
    expect(match?.ingredient.id).toBe("bat-palha");
  });

  it("auto-matches premium cereja tomato to cherry catalog line", () => {
    const catalog = [ingredient("tom-cherry", "TOMATE CHERRY 250G")];
    const match = findCanonicalIngredientMatch("Tomate Cereja Premium 250g", catalog);

    expect(match).not.toBeNull();
    expect(match?.kind).toBe("exact");
    expect(match?.ingredient.id).toBe("tom-cherry");
  });

  it("auto-matches private-label Continente wording to catalog ingredient", () => {
    const catalog = [ingredient("ketchup-1", "KETCHUP HEINZ 570G")];
    const match = findCanonicalIngredientMatch(
      "KETCHUP CONTINENTE TOP DOWN 570G",
      catalog,
    );

    expect(match?.kind).toBe("exact");
    expect(match?.ingredient.id).toBe("ketchup-1");
  });

  it("does not auto-match cheddar sauce to sliced cheddar", () => {
    const catalog = [ingredient("ched-sliced", "CHEDDAR FATIADO 1KG")];
    const match = findCanonicalIngredientMatch("CHEDDAR MOLHO 1KG", catalog);

    expect(match).toBeNull();
  });

  it("auto-matches when catalog line still carries brand tokens in normalization", () => {
    const catalog = [ingredient("mayo-hellmann", "MAIONESE HELLMANN'S 450ML")];
    const match = findCanonicalIngredientMatch("MAIONESE CALVE TOP DOWN 450ML", catalog);

    expect(match?.kind).toBe("exact");
    expect(match?.ingredient.id).toBe("mayo-hellmann");
  });

  it("does not suggest semantic match across ketchup and mayo cores", () => {
    const catalog = [
      ingredient("ketchup-1", "KETCHUP HEINZ 570G"),
      ingredient("mayo-1", "MAIONESE CALVE 450ML"),
    ];

    expect(findCanonicalIngredientMatch("KETCHUP GULOSO 570G", catalog)?.ingredient.id).toBe(
      "ketchup-1",
    );
    expect(findCanonicalIngredientMatch("MAIONESE GULOSO 450ML", catalog)?.ingredient.id).toBe(
      "mayo-1",
    );
    expect(findCanonicalIngredientMatch("KETCHUP GULOSO 570G", [catalog[1]])).toBeNull();
  });

  describe("family-aware semantic identity (regression)", () => {
    it("exports ingredient family ids for semantic grouping", () => {
      expect([...FAMILY_INGREDIENT_MATCH_TOKENS].sort()).toEqual([
        "beverage",
        "cheese",
        "oil",
        "potato",
        "sauce",
        "tomato",
      ]);
    });

    it("suggests rearranged foodservice palha OCR to batata palha catalog line", () => {
      const catalog = [ingredient("bat-palha", "BATATA PALHA 2KG SERVICE")];
      const match = findCanonicalIngredientMatch("PALHA SNACK FOOD SERVICE 2KG", catalog);

      expect(match?.kind).toBe("operational-equivalent");
      expect(match?.ingredient.id).toBe("bat-palha");
    });

    it("auto-matches palha service wording to batata palha when batata is present", () => {
      const catalog = [ingredient("bat-palha", "BATATA PALHA 2KG")];
      const match = findCanonicalIngredientMatch("BATATA PALHA 2KG SERVICE", catalog);

      expect(match?.kind).toBe("exact");
      expect(match?.ingredient.id).toBe("bat-palha");
    });

    it("does not match batata palha to batata frita corte fino", () => {
      const catalog = [ingredient("bat-palha", "BATATA PALHA 2KG")];
      expect(
        findCanonicalIngredientMatch("BATATA FRITA CORTE FINO 2KG", catalog),
      ).toBeNull();
      expect(
        hasCompatibleIngredientFormFamilies(
          "BATATA PALHA 2KG",
          "BATATA FRITA CORTE FINO 2KG",
        ),
      ).toBe(false);
    });

    it("blocks tomato cherry vs crushed tomato at form and format level", () => {
      expect(
        hasCompatibleIngredientFormFamilies("TOMATE CHERRY 250G", "TOMATE TRITURADO 250G"),
      ).toBe(false);
      expect(
        findCanonicalIngredientMatch("TOMATE TRITURADO 250G", [
          ingredient("tom-cherry", "TOMATE CHERRY 250G"),
        ]),
      ).toBeNull();
      expect(
        equalCoreIngredientIdentity(
          normalizeInvoiceIngredientName("TOMATE CHERRY 250G"),
          normalizeInvoiceIngredientName("TOMATE TRITURADO 250G"),
          "TOMATE CHERRY 250G",
          "TOMATE TRITURADO 250G",
        ),
      ).toBe(false);
    });

    it("extracts triturado and cherry as distinct raw form families", () => {
      expect([...extractIngredientFormFamilies("TOMATE TRITURADO 500G")]).toEqual([
        "triturado",
      ]);
      expect([...extractIngredientFormFamilies("TOMATE CHERRY 250G")]).toEqual(["cherry"]);
    });

    it("blocks cheddar molho vs cheddar fatiado in raw form families", () => {
      expect(
        hasCompatibleIngredientFormFamilies("CHEDDAR MOLHO 1KG", "CHEDDAR FATIADO 1KG"),
      ).toBe(false);
    });

    it("auto-matches ketchup brand variants", () => {
      const catalog = [ingredient("ketchup-1", "KETCHUP HEINZ 570G")];
      const match = findCanonicalIngredientMatch("KETCHUP GULOSO TOP DOWN 570G", catalog);

      expect(match?.kind).toBe("exact");
      expect(match?.ingredient.id).toBe("ketchup-1");
    });

    it("auto-matches sunflower oil brand variants", () => {
      const catalog = [ingredient("oil-1", "ÓLEO GIRASSOL FULA 1L")];
      const match = findCanonicalIngredientMatch("Óleo Girassol Vaqueiro 1L", catalog);

      expect(match?.kind).toBe("exact");
      expect(match?.ingredient.id).toBe("oil-1");
    });
  });

  it("skips semantic suggestion when alias memory resolves the line", () => {
    const catalog = [ingredient("mayo-1", "MAIONESE CALVE 450ML")];
    const normalizedLine = normalizeInvoiceIngredientName("MAIONESE CALVE TOP DOWN 450ML");
    const aliases = { [normalizedLine]: "mayo-1" };

    const match = findCanonicalIngredientMatch(
      "MAIONESE CALVE TOP DOWN 450ML",
      catalog,
      aliases,
    );

    expect(match?.kind).toBe("confirmed-alias");
    expect(match?.ingredient.id).toBe("mayo-1");
  });
});

describe("horeca shorthand canonical ranking", () => {
  it("HMB 180G beats brioche 40g via weight and meat family", () => {
    const catalog = [
      ingredient("brioche-40", "Mini Brioche 40g"),
      ingredient("beef-180", "Hamburguer Bovino 180g"),
    ];
    const match = findCanonicalIngredientMatch(
      normalizeSupplierShorthand("HMB 180G"),
      catalog,
    );
    expect(match?.ingredient.id).toBe("beef-180");
  });

  it("BRCH BUN 80 beats 40g brioche", () => {
    const catalog = [
      ingredient("brioche-40", "Mini Brioche 40g"),
      ingredient("bun-80", "Brioche Bun 80g"),
    ];
    expect(findInvoiceItemIngredientMatch("BRCH BUN 80", catalog)?.ingredient.id).toBe("bun-80");
  });

  it("BAT SHOE 2.5 picks shoestring over pao de batata", () => {
    const catalog = [
      ingredient("bread", "Pão de Batata 80g"),
      ingredient("shoestr", "Batata Shoestring 2.5kg"),
    ];
    const match = findInvoiceItemIngredientMatch("BAT SHOE 2.5", catalog);
    expect(match?.ingredient.id).toBe("shoestr");
    expect(match?.ingredient.id).not.toBe("bread");
  });

  it("BAT WDG 2.5 picks wedges over pao de batata", () => {
    const catalog = [
      ingredient("bread", "Pão de Batata 80g"),
      ingredient("wedges", "Batata Wedges 2.5kg"),
    ];
    expect(findInvoiceItemIngredientMatch("BAT WDG 2.5", catalog)?.ingredient.id).toBe("wedges");
  });
});

describe("archived catalog filtering", () => {
  it("matches invoice shorthand only to active canonical when archived duplicates remain", () => {
    const catalog: IngredientCanonicalInput[] = [
      {
        id: "canonical",
        name: "Angus Burger Patty 180g",
        normalized_name: "angus burger patty 180g",
        ingredient_kind: "canonical",
      },
      {
        id: "dup",
        name: "Angus Burger Patty 180g",
        normalized_name: "angus burger patty 180g",
        is_archived: true,
        merged_into_ingredient_id: "canonical",
      },
    ];
    const match = findCanonicalIngredientMatch("ANGUS PTY", catalog);
    expect(match?.ingredient.id).toBe("canonical");
    expect(findInvoiceItemIngredientMatch("ANG PTY", catalog)?.ingredient.id).toBe("canonical");
  });
});
