import { describe, expect, it } from "vitest";
import {
  buildMatchExplanation,
  buildMatchTargetLabel,
  formatMatchReasoningTooltip,
  formatMatchTargetLabel,
  isExtractCostSyncAuthorizedMatch,
  isInvoiceLineMatchedOrSuggested,
  matchTargetLabelPrefix,
  resolveConfirmedAliasScope,
  resolveInvoiceIngredientDisplayState,
  resolveMatchTargetDisplayName,
  shouldShowMatchTargetLine,
  suggestedIngredientMatchBadgeLabel,
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

describe("isExtractCostSyncAuthorizedMatch", () => {
  it("authorizes alias and override matches for extract cost sync", () => {
    expect(isExtractCostSyncAuthorizedMatch(baseMatch({ kind: "confirmed-alias" }))).toBe(true);
    expect(isExtractCostSyncAuthorizedMatch(baseMatch({ kind: "confirmed-override" }))).toBe(true);
    expect(isExtractCostSyncAuthorizedMatch(baseMatch({ kind: "operational-memory" }))).toBe(true);
    expect(isExtractCostSyncAuthorizedMatch(baseMatch({ kind: "operational-alias" }))).toBe(true);
  });

  it("blocks bare exact and suggested kinds until user confirms", () => {
    expect(isExtractCostSyncAuthorizedMatch(baseMatch({ kind: "exact" }))).toBe(false);
    expect(isExtractCostSyncAuthorizedMatch(baseMatch({ kind: "semantic" }))).toBe(false);
    expect(
      isExtractCostSyncAuthorizedMatch(baseMatch({ kind: "operational-equivalent" })),
    ).toBe(false);
    expect(isExtractCostSyncAuthorizedMatch(null)).toBe(false);
  });

  it("excludes operational-memory when alias auto-confirm is disabled", () => {
    expect(
      isExtractCostSyncAuthorizedMatch(baseMatch({ kind: "operational-memory" }), {
        aliasAutoConfirm: false,
      }),
    ).toBe(false);
    expect(
      isExtractCostSyncAuthorizedMatch(baseMatch({ kind: "confirmed-alias" }), {
        aliasAutoConfirm: false,
      }),
    ).toBe(true);
  });
});

describe("resolveInvoiceIngredientDisplayState", () => {
  it("treats operational-equivalent as suggested, not unmatched", () => {
    const match = baseMatch({
      kind: "operational-equivalent",
      reason: "possible operational equivalent",
    });
    expect(resolveInvoiceIngredientDisplayState(match)).toBe("suggested");
    expect(resolveInvoiceIngredientDisplayState(null)).toBe("unmatched");
    expect(isInvoiceLineMatchedOrSuggested(match)).toBe(true);
    expect(isInvoiceLineMatchedOrSuggested(null)).toBe(false);
  });

  it("classifies confirmed vs semantic suggestions", () => {
    expect(resolveInvoiceIngredientDisplayState(baseMatch({ kind: "exact" }))).toBe("confirmed");
    expect(resolveInvoiceIngredientDisplayState(baseMatch({ kind: "confirmed-alias" }))).toBe(
      "confirmed",
    );
    expect(resolveInvoiceIngredientDisplayState(baseMatch({ kind: "semantic" }))).toBe("suggested");
  });
});

describe("suggestedIngredientMatchBadgeLabel", () => {
  it("labels operational-equivalent suggestions distinctly", () => {
    expect(suggestedIngredientMatchBadgeLabel("operational-equivalent")).toBe(
      "possible operational equivalent",
    );
    expect(suggestedIngredientMatchBadgeLabel("semantic")).toBe("possible ingredient match");
  });
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

  it("explains operational-equivalent suggestions", () => {
    const reasoning = buildMatchExplanation(
      baseMatch({
        kind: "operational-equivalent",
        reason: "possible operational equivalent",
        normalizedItemName: "palha snack food service 2kg",
        normalizedIngredientName: "batata palha 2kg",
      }),
    );
    expect(reasoning.headline).toBe("Possible operational equivalent");
    expect(reasoning.confidence).toBe("suggested");
    expect(reasoning.caveats).toContain("possible operational equivalent");
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
    expect(resolveMatchTargetDisplayName(match)).toBe("Tomate cherry");
    expect(
      resolveMatchTargetDisplayName(match, {
        id: "ing-1",
        name: "Tomate cherry",
        normalized_name: null,
      }),
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
      prefix: "Matched to:",
      name: "Tomate cherry",
    });
  });

  it("uses Matched to for exact, semantic, and operational-equivalent matches", () => {
    const exact = buildMatchTargetLabel(baseMatch({ kind: "exact" }));
    expect(exact?.prefix).toBe("Matched to:");
    expect(formatMatchTargetLabel(exact!)).toBe("Matched to: Tomate cherry");

    const semantic = buildMatchTargetLabel(baseMatch({ kind: "semantic" }));
    expect(semantic?.prefix).toBe("Matched to:");
    expect(matchTargetLabelPrefix("semantic", null)).toBe("Matched to:");

    const operational = buildMatchTargetLabel(
      baseMatch({ kind: "operational-equivalent", reason: "possible operational equivalent" }),
    );
    expect(operational?.prefix).toBe("Matched to:");
    expect(matchTargetLabelPrefix("operational-equivalent", null)).toBe("Matched to:");
  });

  it("uses Matched to for confirmed alias matches regardless of scope", () => {
    const match = baseMatch({ kind: "confirmed-alias" });
    const supplierKey = buildIngredientAliasLookupKey(match.normalizedItemName, "Metro");

    const supplier = buildMatchTargetLabel(match, {
      supplierName: "Metro",
      confirmedAliases: { [supplierKey]: "ing-1" },
    });
    expect(supplier?.prefix).toBe("Matched to:");
    expect(formatMatchTargetLabel(supplier!)).toBe("Matched to: Tomate cherry");

    const global = buildMatchTargetLabel(match, {
      confirmedAliases: { [match.normalizedItemName]: "ing-1" },
    });
    expect(global?.prefix).toBe("Matched to:");
    expect(formatMatchTargetLabel(global!)).toBe("Matched to: Tomate cherry");
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
