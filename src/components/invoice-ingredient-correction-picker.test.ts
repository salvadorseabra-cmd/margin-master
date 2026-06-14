import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { IngredientPickerOption } from "@/lib/ingredient-picker-options";
import { InvoiceIngredientCorrectionPicker } from "./invoice-ingredient-correction-picker";

const ingredients: IngredientPickerOption[] = [
  {
    id: "ing-1",
    name: "Alpha",
    normalizedName: "alpha",
    source: "catalog",
    searchKeywords: ["alpha"],
  },
];

describe("InvoiceIngredientCorrectionPicker", () => {
  it("shows Matched to chip label for confirmed rows", () => {
    const html = renderToString(
      createElement(InvoiceIngredientCorrectionPicker, {
        open: false,
        onOpenChange: vi.fn(),
        ingredients,
        matchLabel: "Matched to: Alpha",
        ingredientId: "ing-1",
        onSelect: vi.fn(),
        onSelectNoMatch: vi.fn(),
        onCreateIngredient: vi.fn(),
      }),
    );

    expect(html).toContain("Matched to: Alpha");
    expect(html).not.toContain("Correct match");
  });

  it("uses placeholder for unmatched rows without Correct match link", () => {
    const html = renderToString(
      createElement(InvoiceIngredientCorrectionPicker, {
        open: false,
        onOpenChange: vi.fn(),
        ingredients,
        placeholder: "Select ingredient…",
        onSelect: vi.fn(),
        onSelectNoMatch: vi.fn(),
        onCreateIngredient: vi.fn(),
      }),
    );

    expect(html).toContain("Select ingredient…");
    expect(html).not.toContain("Correct match");
  });
});
