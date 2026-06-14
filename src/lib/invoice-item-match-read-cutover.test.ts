import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { IngredientCanonicalMatch } from "@/lib/ingredient-canonical";
import { getInvoiceRowIngredientMatchState } from "@/lib/ingredient-match-explanation";
import { resolveInvoiceTableRowIngredientMatch } from "@/lib/invoice-ingredient-row-display";
import {
  buildCanonicalMatchFromPersistedRecord,
  getInvoiceRowMatchStateFromPersisted,
  matchStatusToDisplayState,
  resolveReadCutoverMatch,
} from "./invoice-item-match-read-cutover";

const pepinoCatalog = [
  { id: "ing-pepino", name: "PEPINO", normalized_name: "pepino" },
];

function makeExactPepinoMatch(): IngredientCanonicalMatch {
  return {
    ingredient: pepinoCatalog[0]!,
    normalizedItemName: "pepino",
    normalizedIngredientName: "pepino",
    kind: "exact",
    reason: "exact",
    scoreBreakdown: {},
  };
}

describe("matchStatusToDisplayState", () => {
  it("maps persisted statuses to display states", () => {
    expect(matchStatusToDisplayState("confirmed")).toBe("confirmed");
    expect(matchStatusToDisplayState("suggested")).toBe("suggested");
    expect(matchStatusToDisplayState("unmatched")).toBe("unmatched");
  });
});

describe("resolveReadCutoverMatch", () => {
  beforeEach(() => {
    vi.stubEnv("VITE_MATCH_LIFECYCLE_READ_CUTOVER", "true");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("uses virtual match when flag OFF", () => {
    vi.stubEnv("VITE_MATCH_LIFECYCLE_READ_CUTOVER", "false");
    const virtualMatch = makeExactPepinoMatch();
    const virtualState = getInvoiceRowIngredientMatchState(virtualMatch);
    const result = resolveReadCutoverMatch({
      itemName: "Pepino",
      ingredientCatalog: pepinoCatalog,
      virtualMatch,
      virtualState,
      cutover: {
        invoiceItemId: "item-pepino",
        persistedMatch: {
          ingredient_id: "ing-pepino",
          status: "suggested",
          match_kind: "exact",
        },
      },
    });
    expect(result.state.displayState).toBe("confirmed");
    expect(result.outcome).toBeUndefined();
  });

  it("uses persisted row when flag ON", () => {
    const virtualMatch = makeExactPepinoMatch();
    const virtualState = getInvoiceRowIngredientMatchState(virtualMatch);
    const result = resolveReadCutoverMatch({
      itemName: "Pepino",
      ingredientCatalog: pepinoCatalog,
      virtualMatch,
      virtualState,
      cutover: {
        invoiceItemId: "item-pepino",
        persistedMatch: {
          ingredient_id: "ing-pepino",
          status: "suggested",
          match_kind: "exact",
        },
      },
    });
    expect(result.outcome).toBe("persisted_hit");
    expect(result.state.displayState).toBe("suggested");
    expect(result.match?.ingredient.id).toBe("ing-pepino");
  });

  it("falls back to virtual when persisted row missing", () => {
    const virtualMatch = makeExactPepinoMatch();
    const virtualState = getInvoiceRowIngredientMatchState(virtualMatch);
    const result = resolveReadCutoverMatch({
      itemName: "Pepino",
      ingredientCatalog: pepinoCatalog,
      virtualMatch,
      virtualState,
      cutover: {
        invoiceItemId: "item-pepino",
        persistedMatch: null,
      },
    });
    expect(result.outcome).toBe("missing_record");
    expect(result.state.displayState).toBe("confirmed");
  });
});

describe("resolveInvoiceTableRowIngredientMatch cutover integration", () => {
  beforeEach(() => {
    vi.stubEnv("VITE_MATCH_LIFECYCLE_READ_CUTOVER", "true");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("Pepino shows suggested from persisted exact match", () => {
    vi.stubEnv("VITE_MATCH_LIFECYCLE_READ_CUTOVER", "false");
    const virtualOnly = resolveInvoiceTableRowIngredientMatch("Pepino", pepinoCatalog);
    expect(virtualOnly.state.displayState).toBe("confirmed");

    vi.stubEnv("VITE_MATCH_LIFECYCLE_READ_CUTOVER", "true");
    const cutover = resolveInvoiceTableRowIngredientMatch(
      "Pepino",
      pepinoCatalog,
      {},
      null,
      undefined,
      {
        invoiceItemId: "item-pepino",
        persistedMatch: {
          ingredient_id: "ing-pepino",
          status: "suggested",
          match_kind: "exact",
        },
      },
    );
    expect(cutover.state.displayState).toBe("suggested");
  });

  it("flag OFF is identical to before", () => {
    vi.stubEnv("VITE_MATCH_LIFECYCLE_READ_CUTOVER", "false");
    const baseline = resolveInvoiceTableRowIngredientMatch("Pepino", pepinoCatalog);
    const withContext = resolveInvoiceTableRowIngredientMatch(
      "Pepino",
      pepinoCatalog,
      {},
      null,
      undefined,
      {
        invoiceItemId: "item-pepino",
        persistedMatch: {
          ingredient_id: "ing-pepino",
          status: "suggested",
          match_kind: "exact",
        },
      },
    );
    expect(withContext).toEqual(baseline);
  });
});

describe("buildCanonicalMatchFromPersistedRecord", () => {
  it("builds suggested Pepino match from persisted record", () => {
    const match = buildCanonicalMatchFromPersistedRecord(
      {
        ingredient_id: "ing-pepino",
        status: "suggested",
        match_kind: "exact",
      },
      "Pepino",
      pepinoCatalog,
    );
    expect(match?.kind).toBe("exact");
    const state = getInvoiceRowMatchStateFromPersisted(
      {
        ingredient_id: "ing-pepino",
        status: "suggested",
        match_kind: "exact",
      },
      match,
    );
    expect(state.displayState).toBe("suggested");
    expect(state.possibleMatch).toBe(match);
  });
});
