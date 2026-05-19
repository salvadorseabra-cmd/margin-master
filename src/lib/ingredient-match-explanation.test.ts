import { describe, expect, it } from "vitest";
import {
  buildMatchExplanation,
  buildMatchTargetLabel,
  formatMatchReasoningTooltip,
  formatMatchTargetLabel,
  matchTargetLabelPrefix,
  resolveConfirmedAliasScope,
  resolveMatchTargetDisplayName,
  shouldShowMatchTargetLine,
} from "./ingredient-match-explanation";
import type { IngredientCanonicalMatch } from "./ingredient-canonical";
import { buildIngredientAliasLookupKey } from "./ingredient-alias-lookup";

const baseMatch = (
  overrides: Partial<IngredientCanonicalMatch> & Pick<IngredientCanonicalMatch, "kind">,
): IngredientCanonicalMatch => ({
  ingredient: { id: "ing-1", name: "Tomate cherry" },
  normalizedItemName: "tomate cherry 250g",
  normalizedIngredientName: "tomate cherry",
  reason: "same normalized ingredient name",
  ...overrides,
});

describe("buildMatchExplanation", () => {
  it("explains supplier-scoped confirmed aliases", () => {
    const match = baseMatch({
      kind: "confirmed-alias",
      reason: "confirmed supplier wording",
    });
    const supplierKey = buildIngredientAliasLookupKey(match.normalizedItemName, "Metro");
    const reasoning = buildMatchExplanation(match, {
      supplierName: "Metro",
      confirmedAliases: { [supplierKey]: "ing-1" },
    });
    expect(reasoning.headline).toBe("Matched by supplier history");
    expect(reasoning.confidence).toBe("high");
  });

  it("explains global confirmed aliases", () => {
    const match = baseMatch({
      kind: "confirmed-alias",
      reason: "confirmed supplier wording",
    });
    const reasoning = buildMatchExplanation(match, {
      confirmedAliases: { [match.normalizedItemName]: "ing-1" },
    });
    expect(reasoning.headline).toBe("Matched from previous confirmed purchase");
  });

  it("explains exact normalized identity matches", () => {
    const reasoning = buildMatchExplanation(
      baseMatch({ kind: "exact", reason: "same normalized ingredient name" }),
    );
    expect(reasoning.headline).toBe("Matched by normalized ingredient identity");
    expect(reasoning.confidenceLabel).toBe("High confidence");
  });

  it("explains auto-confirmed family matches", () => {
    const reasoning = buildMatchExplanation(
      baseMatch({
        kind: "exact",
        reason: "same core product identity and matching size",
      }),
    );
    expect(reasoning.headline).toBe("Matched by ingredient family");
  });

  it("explains semantic suggestions with uncertainty caveats", () => {
    const reasoning = buildMatchExplanation(
      baseMatch({
        kind: "semantic",
        reason: "similar product wording and matching size",
        normalizedItemName: "tomate triturado 250g",
        normalizedIngredientName: "tomate cherry",
      }),
    );
    expect(reasoning.headline).toBe("Matched by semantic similarity");
    expect(reasoning.confidence).toBe("suggested");
    expect(reasoning.caveats).toContain("requires human confirmation");
    expect(reasoning.caveats).toContain("commercial wording differs");
  });
});

describe("resolveConfirmedAliasScope", () => {
  it("detects supplier vs global alias scope", () => {
    const match = baseMatch({ kind: "confirmed-alias" });
    const supplierKey = buildIngredientAliasLookupKey(match.normalizedItemName, "Metro");
    expect(resolveConfirmedAliasScope(match, { [supplierKey]: "ing-1" }, "Metro")).toBe("supplier");
    expect(
      resolveConfirmedAliasScope(match, { [match.normalizedItemName]: "ing-1" }, "Metro"),
    ).toBe("global");
  });
});

describe("shouldShowMatchTargetLine", () => {
  it("is true whenever a canonical match has an ingredient id", () => {
    expect(shouldShowMatchTargetLine(null)).toBe(false);
    expect(shouldShowMatchTargetLine(baseMatch({ kind: "exact" }))).toBe(true);
    expect(shouldShowMatchTargetLine(baseMatch({ kind: "semantic" }))).toBe(true);
    expect(
      shouldShowMatchTargetLine(
        baseMatch({ kind: "exact", ingredient: { id: "ing-1", name: null } }),
      ),
    ).toBe(true);
  });
});

describe("resolveMatchTargetDisplayName", () => {
  it("prefers catalog name over sparse match payload", () => {
    const match = baseMatch({
      kind: "exact",
      ingredient: { id: "ing-1", name: null, normalized_name: "tomate cherry" },
    });
    expect(resolveMatchTargetDisplayName(match)).toBe("tomate cherry");
    expect(
      resolveMatchTargetDisplayName(match, { id: "ing-1", name: "Tomate cherry", normalized_name: null }),
    ).toBe("Tomate cherry");
  });
});

describe("buildMatchTargetLabel", () => {
  it("renders target label when match exists even without explanation context", () => {
    const match = baseMatch({
      kind: "confirmed-alias",
      ingredient: { id: "ing-1", name: null, normalized_name: "tomate cherry" },
    });
    expect(buildMatchTargetLabel(match)).toEqual({
      prefix: "Alias of:",
      name: "tomate cherry",
    });
  });

  it("uses Matched to for exact and semantic matches", () => {
    const exact = buildMatchTargetLabel(baseMatch({ kind: "exact" }));
    expect(exact?.prefix).toBe("Matched to:");
    expect(formatMatchTargetLabel(exact!)).toBe("Matched to: Tomate cherry");

    const semantic = buildMatchTargetLabel(baseMatch({ kind: "semantic" }));
    expect(semantic?.prefix).toBe("Matched to:");
    expect(matchTargetLabelPrefix("semantic", null)).toBe("Matched to:");
  });

  it("uses alias prefixes for confirmed matches by scope", () => {
    const match = baseMatch({ kind: "confirmed-alias" });
    const supplierKey = buildIngredientAliasLookupKey(match.normalizedItemName, "Metro");

    const supplier = buildMatchTargetLabel(match, {
      supplierName: "Metro",
      confirmedAliases: { [supplierKey]: "ing-1" },
    });
    expect(supplier?.prefix).toBe("Using existing ingredient:");
    expect(formatMatchTargetLabel(supplier!)).toBe("Using existing ingredient: Tomate cherry");

    const global = buildMatchTargetLabel(match, {
      confirmedAliases: { [match.normalizedItemName]: "ing-1" },
    });
    expect(global?.prefix).toBe("Alias of:");
    expect(formatMatchTargetLabel(global!)).toBe("Alias of: Tomate cherry");
  });
});

describe("formatMatchReasoningTooltip", () => {
  it("joins headline, detail, and caveats", () => {
    const text = formatMatchReasoningTooltip(
      buildMatchExplanation(
        baseMatch({
          kind: "semantic",
          normalizedItemName: "ketchup top down",
          normalizedIngredientName: "ketchup",
        }),
      ),
    );
    expect(text).toContain("Matched by semantic similarity");
    expect(text).toContain("requires human confirmation");
  });
});
