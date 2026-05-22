import { describe, expect, it } from "vitest";
import {
  findCanonicalIngredientMatch,
  type IngredientCanonicalInput,
} from "./ingredient-canonical";
import { findInvoiceItemIngredientMatch } from "./invoice-ingredient-match-propagation";
import {
  inferOperationalProductFamily,
  shouldSkipByOperationalProductFamilyGate,
} from "./ingredient-operational-family-gate";

function ingredient(id: string, name: string): IngredientCanonicalInput {
  return { id, name };
}

describe("inferOperationalProductFamily", () => {
  it("classifies SMASH PTY 90 as meat_protein", () => {
    expect(inferOperationalProductFamily("SMASH PTY 90")).toBe("meat_protein");
  });

  it("classifies ANG PTY 180 as meat_protein", () => {
    expect(inferOperationalProductFamily("ANG PTY 180")).toBe("meat_protein");
  });

  it("classifies CAIXA HAMBURGUER KRAFT PEQ 250UN as packaging not meat", () => {
    expect(inferOperationalProductFamily("CAIXA HAMBURGUER KRAFT PEQ 250UN")).toBe("packaging");
  });

  it("classifies BOX KRAFT as packaging", () => {
    expect(inferOperationalProductFamily("BOX KRAFT")).toBe("packaging");
  });

  it("classifies BAT SHOE 2.5 as frozen_potato", () => {
    expect(inferOperationalProductFamily("BAT SHOE 2.5")).toBe("frozen_potato");
  });

  it("classifies BRCH 80 as bread", () => {
    expect(inferOperationalProductFamily("BRCH 80")).toBe("bread");
  });

  it("classifies BAC STRK as processed_protein", () => {
    expect(inferOperationalProductFamily("BAC STRK")).toBe("processed_protein");
  });

  it("classifies CHED TOP as sauce not cheese", () => {
    expect(inferOperationalProductFamily("CHED TOP")).toBe("sauce");
  });

  it("classifies ON RNG as processed_protein", () => {
    expect(inferOperationalProductFamily("ON RNG")).toBe("processed_protein");
  });

  it("classifies PKL SLC as vegetable", () => {
    expect(inferOperationalProductFamily("PKL SLC")).toBe("vegetable");
  });

  it("classifies OLEO GIRASSOL as cooking_oil", () => {
    expect(inferOperationalProductFamily("OLEO GIRASSOL VAQUEIRO 1L")).toBe("cooking_oil");
  });

  it("classifies ALFACE ICEBERG as vegetable", () => {
    expect(inferOperationalProductFamily("ALFACE ICEBERG INTEIRA")).toBe("vegetable");
  });

  it("keeps SMASH PTY as meat even when catalog line mentions hamburguer", () => {
    expect(inferOperationalProductFamily("SMASH PTY 90")).toBe("meat_protein");
    expect(
      shouldSkipByOperationalProductFamilyGate("SMASH PTY 90", "CAIXA HAMBURGUER KRAFT PEQ 250UN"),
    ).toBe(true);
  });
});

describe("shouldSkipByOperationalProductFamilyGate", () => {
  it("blocks meat vs packaging", () => {
    expect(
      shouldSkipByOperationalProductFamilyGate("SMASH PTY 90", "CAIXA HAMBURGUER KRAFT PEQ 250UN"),
    ).toBe(true);
  });

  it("blocks frozen_potato vs bread", () => {
    expect(shouldSkipByOperationalProductFamilyGate("BAT SHOE 2.5", "Pão de Batata 80g")).toBe(
      true,
    );
  });

  it("allows same meat family", () => {
    expect(shouldSkipByOperationalProductFamilyGate("SMASH PTY 90", "Smash Burger Patty 90g")).toBe(
      false,
    );
  });

  it("blocks cooking oil vs leafy vegetable", () => {
    expect(
      shouldSkipByOperationalProductFamilyGate(
        "OLEO GIRASSOL VAQUEIRO 1L",
        "ALFACE ICEBERG",
      ),
    ).toBe(true);
  });
});

describe("hard gate in canonical match", () => {
  it("SMASH PTY 90 prefers meat over packaging kraft box", () => {
    const catalog = [
      ingredient("pack", "CAIXA HAMBURGUER KRAFT PEQ 250UN"),
      ingredient("meat", "Hamburger Smash Patty 90g"),
    ];
    const match = findInvoiceItemIngredientMatch("SMASH PTY 90", catalog);
    expect(match).not.toBeNull();
    expect(match?.ingredient.id).toBe("meat");
  });

  it("ANG PTY 180 exact to burger 180g not bread", () => {
    const catalog = [
      ingredient("bread", "Pao Brioche Artesanal 180g"),
      ingredient("beef", "Hamburguer Bovino 180g"),
    ];
    const match = findInvoiceItemIngredientMatch("ANG PTY 180", catalog);
    expect(match?.ingredient.id).toBe("beef");
  });

  it("BAT SHOE 2.5 matches shoestring not bread", () => {
    const catalog = [
      ingredient("bread", "Pão de Batata 80g"),
      ingredient("shoestr", "Batata Shoestring 2.5kg"),
    ];
    const match = findInvoiceItemIngredientMatch("BAT SHOE 2.5", catalog);
    expect(match?.ingredient.id).toBe("shoestr");
  });

  it("BRCH 80 matches bun not potato", () => {
    const catalog = [
      ingredient("potato", "Batata Shoestring 2.5kg"),
      ingredient("bun", "Brioche Bun 80g"),
    ];
    const match = findInvoiceItemIngredientMatch("BRCH 80", catalog);
    expect(match?.ingredient.id).toBe("bun");
  });

  it("does not match BOX KRAFT to meat patty", () => {
    const catalog = [ingredient("meat", "Smash Burger Patty 90g")];
    expect(findCanonicalIngredientMatch("BOX KRAFT", catalog)).toBeNull();
  });
});
