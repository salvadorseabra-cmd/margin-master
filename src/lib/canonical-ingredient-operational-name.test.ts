import { describe, expect, it } from "vitest";
import {
  expandSupplierAbbreviations,
  generateOperationalIngredientName,
  normalizeCanonicalRootIngredientName,
  shouldBlockCanonicalNameOnCreate,
  suggestCanonicalRootNameRepair,
  traceSupplierTokenExpansions,
} from "./canonical-ingredient-operational-name";

describe("expandSupplierAbbreviations", () => {
  it("expands BAT shoestr to batata shoestring", () => {
    expect(expandSupplierAbbreviations("BAT shoestr")).toBe("batata shoestring");
  });

  it("expands ANG PTY 180 with gram suffix", () => {
    expect(expandSupplierAbbreviations("ANG PTY 180")).toBe("angus patty 180g");
  });

  it("expands BRCH 80 with pão prefix and gram suffix", () => {
    expect(expandSupplierAbbreviations("BRCH 80")).toBe("pão brioche 80g");
  });

  it("maps standalone PALHA to batata palha", () => {
    expect(expandSupplierAbbreviations("PALHA")).toBe("batata palha");
  });

  it("expands OREG to orégãos", () => {
    expect(expandSupplierAbbreviations("OREG")).toBe("orégãos");
  });

  it("expands BAC FAT to bacon fatiado", () => {
    expect(expandSupplierAbbreviations("BAC FAT")).toBe("bacon fatiado");
  });

  it("expands CHED FAT to cheddar fatiado", () => {
    expect(expandSupplierAbbreviations("CHED FAT")).toBe("cheddar fatiado");
  });

  it("expands FRAN BUR via new dictionary tokens", () => {
    expect(expandSupplierAbbreviations("FRAN BUR")).toBe("frango burger");
  });
});

describe("traceSupplierTokenExpansions", () => {
  it("returns BAT SHOESTR expansion trace via operational-name re-export", () => {
    const trace = traceSupplierTokenExpansions("BAT SHOESTR");
    expect(trace.expanded).toBe("batata shoestring");
    expect(trace.tokens[0]?.reason).toBe("BAT → Batata");
    expect(trace.tokens[1]?.reason).toBe("SHOESTR → Shoestring");
  });
});

describe("generateOperationalIngredientName", () => {
  it("title-cases BAT shoestr as Batata shoestring", () => {
    expect(generateOperationalIngredientName("BAT shoestr")).toBe("Batata shoestring");
  });

  it("formats BRCH 80 as Pão brioche 80g", () => {
    expect(generateOperationalIngredientName("BRCH 80")).toBe("Pão brioche 80g");
  });

  it("formats ANG PTY 180 as Angus patty 180g", () => {
    expect(generateOperationalIngredientName("ANG PTY 180")).toBe("Angus patty 180g");
  });
});

describe("normalizeCanonicalRootIngredientName", () => {
  it("returns catalog identity for shorthand input", () => {
    const identity = normalizeCanonicalRootIngredientName("BAT shoestr");
    expect(identity.name).toBe("Batata shoestring");
    expect(identity.normalized_name).toBe("batata shoestring");
  });
});

describe("suggestCanonicalRootNameRepair", () => {
  it("suggests repair for legacy shorthand canonical rows", () => {
    const suggestion = suggestCanonicalRootNameRepair({
      id: "ing-1",
      name: "BAT shoestr",
      normalized_name: "bat shoestr",
    });
    expect(suggestion).not.toBeNull();
    expect(suggestion?.ingredientId).toBe("ing-1");
    expect(suggestion?.suggestedName).toBe("Batata shoestring");
    expect(suggestion?.reason).toBe("invoice_shorthand");
  });

  it("preserves ingredient id in suggestion (repair does not re-key)", () => {
    const id = "uuid-keep-me";
    const suggestion = suggestCanonicalRootNameRepair({
      id,
      name: "BRCH 80",
      normalized_name: "brch 80",
    });
    expect(suggestion?.ingredientId).toBe(id);
    expect(suggestion?.suggestedName).toBe("Pão brioche 80g");
  });
});

describe("shouldBlockCanonicalNameOnCreate", () => {
  it("blocks BAT shoestr on create", () => {
    expect(shouldBlockCanonicalNameOnCreate("BAT shoestr")).toBe(true);
    expect(shouldBlockCanonicalNameOnCreate("BAT SHOESTR")).toBe(true);
  });

  it("allows operational names on create", () => {
    expect(shouldBlockCanonicalNameOnCreate("Batata shoestring")).toBe(false);
  });
});
