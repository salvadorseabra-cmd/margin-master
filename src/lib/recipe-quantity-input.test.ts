import { describe, expect, it } from "vitest";
import {
  formatRecipeQuantityDisplay,
  parseRecipeQuantityInput,
} from "./recipe-quantity-input";

describe("formatRecipeQuantityDisplay", () => {
  it.each([
    { value: 20, expected: "20" },
    { value: 0, expected: "0" },
    { value: 12.5, expected: "12.5" },
    { value: 0.25, expected: "0.25" },
    { value: 20.002, expected: "20" },
    { value: 20.000_000_000_004, expected: "20" },
  ])("formats $value as $expected", ({ value, expected }) => {
    expect(formatRecipeQuantityDisplay(value)).toBe(expected);
  });
});

describe("parseRecipeQuantityInput", () => {
  it.each([
    { raw: "20", expected: 20 },
    { raw: "12.5", expected: 12.5 },
    { raw: "12,5", expected: 12.5 },
    { raw: "0,25", expected: 0.25 },
    { raw: "  20  ", expected: 20 },
    { raw: "1.234,56", expected: 1234.56 },
    { raw: "1,234.56", expected: 1234.56 },
    { raw: "12,", expected: 12 },
  ])("parses $raw as $expected", ({ raw, expected }) => {
    expect(parseRecipeQuantityInput(raw)).toBe(expected);
  });

  it("returns null for empty or invalid input", () => {
    expect(parseRecipeQuantityInput("")).toBeNull();
    expect(parseRecipeQuantityInput("abc")).toBeNull();
    expect(parseRecipeQuantityInput(",")).toBeNull();
  });
});
