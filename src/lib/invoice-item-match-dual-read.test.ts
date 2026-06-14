import { describe, expect, it } from "vitest";
import type { IngredientCanonicalMatch } from "@/lib/ingredient-canonical";
import {
  aggregateDualReadMetrics,
  buildPersistedMatchSnapshot,
  buildVirtualMatchSnapshot,
  compareVirtualAndPersistedMatch,
  isIntentionalConfirmedToSuggestedDrift,
} from "./invoice-item-match-dual-read";

function makeMatch(
  overrides: Partial<IngredientCanonicalMatch> & Pick<IngredientCanonicalMatch, "kind">,
): IngredientCanonicalMatch {
  return {
    ingredient: {
      id: "ing-1",
      name: "Test Ingredient",
      normalized_name: "test ingredient",
    },
    normalizedItemName: "test item",
    normalizedIngredientName: "test ingredient",
    scoreBreakdown: {},
    ...overrides,
  } as IngredientCanonicalMatch;
}

describe("buildVirtualMatchSnapshot", () => {
  it("maps bare exact to virtual confirmed and expected persisted suggested", () => {
    const snapshot = buildVirtualMatchSnapshot(makeMatch({ kind: "exact" }));
    expect(snapshot.displayState).toBe("confirmed");
    expect(snapshot.expectedPersistedStatus).toBe("suggested");
    expect(snapshot.matchKind).toBe("exact");
    expect(snapshot.ingredientId).toBe("ing-1");
  });

  it("maps confirmed-alias to aligned confirmed on both paths", () => {
    const snapshot = buildVirtualMatchSnapshot(makeMatch({ kind: "confirmed-alias" }));
    expect(snapshot.displayState).toBe("confirmed");
    expect(snapshot.expectedPersistedStatus).toBe("confirmed");
  });

  it("maps semantic to suggested on both paths", () => {
    const snapshot = buildVirtualMatchSnapshot(makeMatch({ kind: "semantic" }));
    expect(snapshot.displayState).toBe("suggested");
    expect(snapshot.expectedPersistedStatus).toBe("suggested");
  });

  it("maps null match to unmatched", () => {
    const snapshot = buildVirtualMatchSnapshot(null);
    expect(snapshot.displayState).toBe("unmatched");
    expect(snapshot.expectedPersistedStatus).toBe("unmatched");
    expect(snapshot.ingredientId).toBeNull();
  });
});

describe("compareVirtualAndPersistedMatch", () => {
  it("reports aligned when alias-backed confirmed matches persisted", () => {
    const virtual = buildVirtualMatchSnapshot(makeMatch({ kind: "confirmed-alias" }));
    const persisted = buildPersistedMatchSnapshot({
      ingredient_id: "ing-1",
      status: "confirmed",
      match_kind: "confirmed-alias",
    });
    const result = compareVirtualAndPersistedMatch({
      invoiceItemId: "item-1",
      virtual,
      persisted,
    });
    expect(result.alignment).toBe("aligned");
    expect(result.driftKinds).toEqual([]);
  });

  it("reports aligned for Pepino intentional confirmed_to_suggested drift", () => {
    const virtual = buildVirtualMatchSnapshot(makeMatch({ kind: "exact" }));
    const persisted = buildPersistedMatchSnapshot({
      ingredient_id: "ing-1",
      status: "suggested",
      match_kind: "exact",
    });
    const result = compareVirtualAndPersistedMatch({
      invoiceItemId: "pepino-item",
      virtual,
      persisted,
    });
    expect(result.alignment).toBe("aligned");
    expect(result.intentionalStatusDrift).toBe(true);
    expect(result.driftKinds).toEqual(["confirmed_to_suggested"]);
  });

  it("reports drifted on ingredient_id mismatch", () => {
    const virtual = buildVirtualMatchSnapshot(makeMatch({ kind: "semantic" }));
    const persisted = buildPersistedMatchSnapshot({
      ingredient_id: "other-ing",
      status: "suggested",
      match_kind: "semantic",
    });
    const result = compareVirtualAndPersistedMatch({
      invoiceItemId: "item-2",
      virtual,
      persisted,
    });
    expect(result.alignment).toBe("drifted");
    expect(result.driftKinds).toContain("ingredient_id_mismatch");
  });

  it("reports missing when persisted row absent", () => {
    const virtual = buildVirtualMatchSnapshot(makeMatch({ kind: "semantic" }));
    const result = compareVirtualAndPersistedMatch({
      invoiceItemId: "item-3",
      virtual,
      persisted: null,
    });
    expect(result.alignment).toBe("missing");
  });

  it("reports orphaned when persisted row has no invoice item", () => {
    const persisted = buildPersistedMatchSnapshot({
      ingredient_id: null,
      status: "unmatched",
      match_kind: null,
    });
    const result = compareVirtualAndPersistedMatch({
      invoiceItemId: "orphan-item",
      virtual: null,
      persisted,
    });
    expect(result.alignment).toBe("orphaned");
  });

  it("reports drifted when persisted status disagrees with expected (non-Pepino)", () => {
    const virtual = buildVirtualMatchSnapshot(makeMatch({ kind: "confirmed-alias" }));
    const persisted = buildPersistedMatchSnapshot({
      ingredient_id: "ing-1",
      status: "suggested",
      match_kind: "confirmed-alias",
    });
    const result = compareVirtualAndPersistedMatch({
      invoiceItemId: "item-4",
      virtual,
      persisted,
    });
    expect(result.alignment).toBe("drifted");
    expect(result.driftKinds).toContain("status_mismatch");
    expect(result.intentionalStatusDrift).toBe(false);
  });
});

describe("isIntentionalConfirmedToSuggestedDrift", () => {
  it("requires exact kind and matching ingredient", () => {
    const virtual = buildVirtualMatchSnapshot(makeMatch({ kind: "exact" }));
    const persisted = buildPersistedMatchSnapshot({
      ingredient_id: "ing-1",
      status: "suggested",
      match_kind: "exact",
    });
    expect(isIntentionalConfirmedToSuggestedDrift(virtual, persisted)).toBe(true);
  });

  it("rejects semantic suggested pairs", () => {
    const virtual = buildVirtualMatchSnapshot(makeMatch({ kind: "semantic" }));
    const persisted = buildPersistedMatchSnapshot({
      ingredient_id: "ing-1",
      status: "suggested",
      match_kind: "semantic",
    });
    expect(isIntentionalConfirmedToSuggestedDrift(virtual, persisted)).toBe(false);
  });
});

describe("aggregateDualReadMetrics", () => {
  it("counts aligned Pepino drift separately from drifted rows", () => {
    const pepinoVirtual = buildVirtualMatchSnapshot(makeMatch({ kind: "exact" }));
    const pepinoPersisted = buildPersistedMatchSnapshot({
      ingredient_id: "ing-1",
      status: "suggested",
      match_kind: "exact",
    });
    const aliasVirtual = buildVirtualMatchSnapshot(makeMatch({ kind: "confirmed-alias" }));
    const aliasPersisted = buildPersistedMatchSnapshot({
      ingredient_id: "ing-1",
      status: "confirmed",
      match_kind: "confirmed-alias",
    });
    const results = [
      compareVirtualAndPersistedMatch({
        invoiceItemId: "pepino",
        virtual: pepinoVirtual,
        persisted: pepinoPersisted,
      }),
      compareVirtualAndPersistedMatch({
        invoiceItemId: "alias",
        virtual: aliasVirtual,
        persisted: aliasPersisted,
      }),
    ];
    const metrics = aggregateDualReadMetrics(results);
    expect(metrics.total).toBe(2);
    expect(metrics.aligned).toBe(2);
    expect(metrics.drifted).toBe(0);
    expect(metrics.intentionalStatusDrift).toBe(1);
    expect(metrics.byDriftKind.confirmed_to_suggested).toBe(1);
  });
});
