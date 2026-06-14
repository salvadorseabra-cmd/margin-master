import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { IngredientCorrectionActions } from "./invoice-ingredient-correction";

describe("IngredientCorrectionActions", () => {
  it("renders Confirm match for suggested rows", () => {
    const html = renderToString(
      createElement(IngredientCorrectionActions, {
        showConfirm: true,
        onConfirm: vi.fn(),
      }),
    );

    expect(html).toContain("Confirm match");
    expect(html).not.toContain("Correct match");
  });

  it("renders nothing when confirm is not shown", () => {
    const html = renderToString(
      createElement(IngredientCorrectionActions, {
        showConfirm: false,
        onConfirm: vi.fn(),
      }),
    );

    expect(html).toBe("");
    expect(html).not.toContain("Correct match");
  });

  it("renders nothing without onConfirm handler", () => {
    const html = renderToString(
      createElement(IngredientCorrectionActions, {
        showConfirm: true,
      }),
    );

    expect(html).toBe("");
    expect(html).not.toContain("Correct match");
  });
});
