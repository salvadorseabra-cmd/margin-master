import { beforeEach, describe, expect, it, vi } from "vitest";
import type { IngredientCanonicalInput } from "./ingredient-canonical";
import {
  buildCanonicalNameImprovement,
  canonicalSuggestionReadabilityDelta,
  evaluateCanonicalIngredientQuality,
  generateCanonicalNamingSuggestion,
  hasCompressedSupplierTokens,
  hasLowVowelDensity,
  isLowQualityCanonicalIngredientName,
  isOperationallyReadableCanonicalName,
  scoreCanonicalNameReadability,
  shouldBlockCanonicalMergeBetween,
} from "./canonical-ingredient-quality";
import { traceSupplierTokenExpansions } from "./ingredient-operational-aliases";
import {
  dismissCanonicalSuggestion,
  isCanonicalSuggestionDismissed,
  isIntentionalCanonicalName,
  markIntentionalCanonicalName,
} from "./canonical-ingredient-quality-storage";
import { generateOperationalIngredientName } from "./canonical-ingredient-operational-name";

function ingredient(
  id: string,
  name: string,
  normalized_name?: string,
): IngredientCanonicalInput {
  return { id, name, normalized_name: normalized_name ?? name.toLowerCase() };
}

const storage = new Map<string, string>();

describe("isLowQualityCanonicalIngredientName", () => {
  it("flags BAT SHOESTR and BAC FAT shorthand", () => {
    expect(isLowQualityCanonicalIngredientName("BAT SHOESTR")).toBe(true);
    expect(isLowQualityCanonicalIngredientName("BAC FAT")).toBe(true);
    expect(isLowQualityCanonicalIngredientName("OREG")).toBe(true);
  });

  it("allows operational catalog names", () => {
    expect(isLowQualityCanonicalIngredientName("Batata shoestring")).toBe(false);
    expect(isLowQualityCanonicalIngredientName("Bacon fatiado")).toBe(false);
  });

  it("does not flag readable beef-cut lines with s/ shorthand", () => {
    expect(isLowQualityCanonicalIngredientName("Acém novilho extra s/ osso")).toBe(false);
    expect(isOperationallyReadableCanonicalName("Acém novilho extra s/ osso")).toBe(true);
  });
});

describe("isOperationallyReadableCanonicalName", () => {
  it("scores destructive rewrites lower than the readable original", () => {
    const current = "Acém novilho extra s/ osso";
    const destructive = "Ac M novilho extra S osso";
    expect(scoreCanonicalNameReadability(destructive)).toBeLessThan(
      scoreCanonicalNameReadability(current),
    );
    expect(canonicalSuggestionReadabilityDelta(current, destructive)).toBeLessThan(0);
  });
});

describe("hasCompressedSupplierTokens", () => {
  it("detects BAT shoestr style token compression", () => {
    expect(hasCompressedSupplierTokens("BAT shoestr")).toBe(true);
    expect(hasCompressedSupplierTokens("BAC BUR FAT")).toBe(true);
  });
});

describe("hasLowVowelDensity", () => {
  it("flags consonant-heavy OCR fragments", () => {
    expect(hasLowVowelDensity("CHK BRDD")).toBe(true);
  });
});

describe("traceSupplierTokenExpansions", () => {
  it("traces BAT SHOESTR to batata shoestring with per-token reasons", () => {
    const trace = traceSupplierTokenExpansions("BAT SHOESTR");
    expect(trace.expanded).toBe("batata shoestring");
    expect(trace.tokens).toHaveLength(2);
    expect(trace.tokens[0]).toMatchObject({
      raw: "BAT",
      expanded: "batata",
      confidence: "high",
      source: "dictionary",
      reason: "BAT → Batata",
    });
    expect(trace.tokens[1]).toMatchObject({
      raw: "SHOESTR",
      expanded: "shoestring",
      confidence: "high",
      source: "dictionary",
      reason: "SHOESTR → Shoestring",
    });
  });

  it("traces CHED FAT to cheddar fatiado", () => {
    const trace = traceSupplierTokenExpansions("CHED FAT");
    expect(trace.expanded).toBe("cheddar fatiado");
    expect(trace.tokens.map((t) => t.reason)).toEqual(["CHED → Cheddar", "FAT → Fatiado"]);
  });
});

describe("evaluateCanonicalIngredientQuality", () => {
  it("flags BAT SHOESTR and returns token trace", () => {
    const evaluation = evaluateCanonicalIngredientQuality({
      ingredient: ingredient("shoe-1", "BAT SHOESTR"),
    });
    expect(evaluation?.isLowQuality).toBe(true);
    expect(evaluation?.signals).toContain("compressed_supplier_tokens");
    expect(evaluation?.tokenTrace.expanded).toBe("batata shoestring");
  });
});

describe("generateCanonicalNamingSuggestion", () => {
  it("returns null for readable Acém novilho extra s/ osso", () => {
    expect(
      generateCanonicalNamingSuggestion({
        ingredient: ingredient("beef-1", "Acém novilho extra s/ osso", "acem novilho extra s osso"),
      }),
    ).toBeNull();
  });

  it("includes per-token reasons for BAT SHOESTR", () => {
    const suggestion = generateCanonicalNamingSuggestion({
      ingredient: ingredient("shoe-1", "BAT SHOESTR"),
    });
    expect(suggestion?.suggestedName).toBe("Batata shoestring");
    expect(suggestion?.reasons).toEqual(
      expect.arrayContaining(["BAT → Batata", "SHOESTR → Shoestring"]),
    );
    expect(suggestion?.tokenTrace.tokens).toHaveLength(2);
  });
});

describe("buildCanonicalNameImprovement", () => {
  it("suggests Batata shoestring for BAT SHOESTR with high confidence", () => {
    const suggestion = buildCanonicalNameImprovement({
      ingredient: ingredient("shoe-1", "BAT SHOESTR", "bat shoestr"),
    });
    expect(suggestion).not.toBeNull();
    expect(suggestion?.suggestedName).toBe("Batata shoestring");
    expect(suggestion?.confidence).toBe("high");
    expect(suggestion?.kind).toBe("lexical_cleanup");
    expect(suggestion?.reasons.length).toBeGreaterThan(0);
  });

  it("suggests Bacon fatiado for BAC FAT with high confidence", () => {
    const suggestion = buildCanonicalNameImprovement({
      ingredient: ingredient("bac-1", "BAC FAT"),
    });
    expect(suggestion?.suggestedName).toBe("Bacon fatiado");
    expect(suggestion?.confidence).toBe("high");
  });

  it("suggests Orégãos for OREG", () => {
    expect(generateOperationalIngredientName("OREG")).toBe("Orégãos");
    const suggestion = buildCanonicalNameImprovement({
      ingredient: ingredient("oreg-1", "OREG"),
    });
    expect(suggestion?.suggestedName).toBe("Orégãos");
    expect(suggestion?.confidence).toBe("high");
  });

  it("does not suggest merge between batata palha and bat shoestring catalog rows", () => {
    const catalog = [
      ingredient("palha-1", "Batata palha", "batata palha"),
      ingredient("shoe-1", "BAT shoestr", "bat shoestr"),
    ];
    expect(shouldBlockCanonicalMergeBetween("Batata palha", "BAT shoestr")).toBe(true);

    const suggestion = buildCanonicalNameImprovement({
      ingredient: catalog[1]!,
      catalog,
    });
    expect(suggestion?.suggestedName).toBe("Batata shoestring");
    expect(suggestion?.suggestedName).not.toBe("Batata palha");
    expect(suggestion?.kind).toBe("lexical_cleanup");
  });

  it("returns null when name is already operational quality", () => {
    expect(
      buildCanonicalNameImprovement({
        ingredient: ingredient("ok-1", "Batata shoestring"),
      }),
    ).toBeNull();
  });

  it("blocks destructive rewrite of Acém novilho extra s/ osso", () => {
    expect(
      buildCanonicalNameImprovement({
        ingredient: ingredient("beef-1", "Acém novilho extra s/ osso"),
      }),
    ).toBeNull();
  });
});

describe("canonical suggestion localStorage", () => {
  beforeEach(() => {
    storage.clear();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => {
        storage.set(key, value);
      },
      removeItem: (key: string) => {
        storage.delete(key);
      },
      clear: () => storage.clear(),
    });
    vi.stubGlobal("window", { localStorage });
  });

  it("persists dismiss and intentional marks per ingredient id", () => {
    dismissCanonicalSuggestion("user-1", "ing-a");
    markIntentionalCanonicalName("user-1", "ing-b");
    expect(isCanonicalSuggestionDismissed("user-1", "ing-a")).toBe(true);
    expect(isIntentionalCanonicalName("user-1", "ing-b")).toBe(true);
    expect(isCanonicalSuggestionDismissed("user-1", "ing-c")).toBe(false);
  });
});
