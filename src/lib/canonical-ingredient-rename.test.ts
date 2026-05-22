import { describe, expect, it } from "vitest";
import { looksLikeInvoiceShorthandName } from "./ingredient-kind";
import {
  buildCanonicalIngredientRenamePayload,
  validateCanonicalIngredientRenameName,
} from "./canonical-ingredient-rename";

const catalog = [
  { id: "ing-a", name: "Palha snack food service 2kg", normalized_name: "palha snack food service 2kg" },
  { id: "ing-b", name: "Oleo girassol 10L", normalized_name: "oleo girassol 10l" },
];

describe("validateCanonicalIngredientRenameName", () => {
  it("blocks invoice shorthand on rename", () => {
    expect(validateCanonicalIngredientRenameName("ANGUS PTY").ok).toBe(false);
    expect(validateCanonicalIngredientRenameName("BAC FUM FAT").ok).toBe(false);
    expect(looksLikeInvoiceShorthandName("ANGUS PTY")).toBe(true);
  });

  it("allows human catalog names", () => {
    expect(validateCanonicalIngredientRenameName("Palha para snacks 2 kg")).toEqual({ ok: true });
  });
});

describe("buildCanonicalIngredientRenamePayload", () => {
  it("updates name and normalized_name while preserving ingredient id", () => {
    const result = buildCanonicalIngredientRenamePayload(
      "ing-a",
      "PALHA PARA SNACKS 2 KG",
      catalog,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.update.ingredientId).toBe("ing-a");
    expect(result.update.name).toBe("Palha para snacks");
    expect(result.update.normalized_name).toBe("palha para snacks");
  });

  it("applies display formatter on save", () => {
    const result = buildCanonicalIngredientRenamePayload(
      "ing-b",
      "OLEO GIRASSOL VAQUEIRO 10L",
      catalog,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.update.name).toBe("Oleo girassol vaqueiro");
    expect(result.update.normalized_name).toBe("oleo girassol vaqueiro");
  });

  it("rejects shorthand canonical names", () => {
    const result = buildCanonicalIngredientRenamePayload("ing-a", "ANGUS PTY", catalog);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toContain("Angus patty");
    expect(result.message).toContain("alias memory");
  });

  it("blocks duplicate names on other catalog rows", () => {
    const result = buildCanonicalIngredientRenamePayload(
      "ing-a",
      "Oleo girassol",
      catalog,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toContain("Another ingredient already uses this name");
  });

  it("allows unchanged name for same ingredient", () => {
    const result = buildCanonicalIngredientRenamePayload(
      "ing-a",
      "Palha snack food service 2kg",
      catalog,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.update.ingredientId).toBe("ing-a");
    expect(result.update.name).toBe("Palha");
  });
});
