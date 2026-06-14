import { describe, expect, it } from "vitest";
import type { IngredientCanonicalMatch } from "@/lib/ingredient-canonical";
import {
  displayStateToMatchStatus,
  isInvoiceItemMatchStatus,
  mapMatcherOutputToInitialMatchRecord,
  normalizeMatchStatusUpdate,
  resolvePersistedMatchStatusFromMatcher,
  validateMatchRecordFields,
} from "./invoice-item-match-helpers";

describe("isInvoiceItemMatchStatus", () => {
  it("accepts the three V1 statuses", () => {
    expect(isInvoiceItemMatchStatus("unmatched")).toBe(true);
    expect(isInvoiceItemMatchStatus("suggested")).toBe(true);
    expect(isInvoiceItemMatchStatus("confirmed")).toBe(true);
  });

  it("rejects legacy transition labels", () => {
    expect(isInvoiceItemMatchStatus("corrected")).toBe(false);
    expect(isInvoiceItemMatchStatus("reassigned")).toBe(false);
  });
});

describe("displayStateToMatchStatus", () => {
  it("maps display states 1:1 to persisted status", () => {
    expect(displayStateToMatchStatus("unmatched")).toBe("unmatched");
    expect(displayStateToMatchStatus("suggested")).toBe("suggested");
    expect(displayStateToMatchStatus("confirmed")).toBe("confirmed");
  });
});

describe("validateMatchRecordFields", () => {
  it("requires null ingredient for unmatched", () => {
    expect(
      validateMatchRecordFields({
        status: "unmatched",
        ingredient_id: null,
        confirmed_at: null,
        corrected_at: null,
      }),
    ).toBeNull();

    expect(
      validateMatchRecordFields({
        status: "unmatched",
        ingredient_id: "ing-1",
        confirmed_at: null,
        corrected_at: null,
      }),
    ).toBe("unmatched_has_ingredient");
  });

  it("requires ingredient and confirmed_at for confirmed", () => {
    expect(
      validateMatchRecordFields({
        status: "confirmed",
        ingredient_id: "ing-1",
        confirmed_at: "2024-01-01T00:00:00.000Z",
        corrected_at: null,
      }),
    ).toBeNull();

    expect(
      validateMatchRecordFields({
        status: "confirmed",
        ingredient_id: null,
        confirmed_at: "2024-01-01T00:00:00.000Z",
        corrected_at: null,
      }),
    ).toBe("assigned_missing_ingredient");

    expect(
      validateMatchRecordFields({
        status: "confirmed",
        ingredient_id: "ing-1",
        confirmed_at: null,
        corrected_at: null,
      }),
    ).toBe("confirmed_missing_timestamp");
  });

  it("requires ingredient for suggested", () => {
    expect(
      validateMatchRecordFields({
        status: "suggested",
        ingredient_id: "ing-1",
        confirmed_at: null,
        corrected_at: null,
      }),
    ).toBeNull();
  });
});

describe("normalizeMatchStatusUpdate", () => {
  it("clears assignment fields when transitioning to unmatched", () => {
    expect(
      normalizeMatchStatusUpdate(
        { status: "unmatched" },
        {
          status: "confirmed",
          ingredient_id: "ing-1",
          confirmed_at: "2024-01-01T00:00:00.000Z",
        },
      ),
    ).toEqual({
      status: "unmatched",
      ingredient_id: null,
      confirmed_at: null,
    });
  });

  it("stamps confirmed_at when promoting to confirmed without timestamp", () => {
    const normalized = normalizeMatchStatusUpdate(
      { status: "confirmed", ingredient_id: "ing-2" },
      { status: "suggested", ingredient_id: "ing-2", confirmed_at: null },
    );
    expect(normalized.status).toBe("confirmed");
    expect(normalized.ingredient_id).toBe("ing-2");
    expect(normalized.confirmed_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});

describe("mapMatcherOutputToInitialMatchRecord", () => {
  const baseParams = {
    invoiceItemId: "item-1",
    invoiceId: "inv-1",
    userId: "user-1",
    now: "2024-06-01T12:00:00.000Z",
  };

  it("maps null matcher to unmatched tombstone", () => {
    expect(mapMatcherOutputToInitialMatchRecord({ ...baseParams, match: null })).toEqual({
      invoice_item_id: "item-1",
      invoice_id: "inv-1",
      user_id: "user-1",
      status: "unmatched",
      ingredient_id: null,
      match_kind: null,
      confirmed_at: null,
      corrected_at: null,
      previous_ingredient_id: null,
      pack_variant_id: null,
    });
  });

  it("maps semantic matcher to suggested with ingredient", () => {
    const match = {
      kind: "semantic",
      ingredient: { id: "ing-pepino", name: "Pepino", normalized_name: "pepino" },
    } as IngredientCanonicalMatch;

    expect(mapMatcherOutputToInitialMatchRecord({ ...baseParams, match })).toMatchObject({
      status: "suggested",
      ingredient_id: "ing-pepino",
      match_kind: "semantic",
      confirmed_at: null,
    });
  });

  it("maps confirmed-alias to confirmed with timestamp", () => {
    const match = {
      kind: "confirmed-alias",
      ingredient: { id: "ing-a", name: "Alpha", normalized_name: "alpha" },
    } as IngredientCanonicalMatch;

    expect(
      mapMatcherOutputToInitialMatchRecord({
        ...baseParams,
        match,
        confirmedAt: "2024-06-01T12:00:00.000Z",
      }),
    ).toMatchObject({
      status: "confirmed",
      ingredient_id: "ing-a",
      match_kind: "confirmed-alias",
      confirmed_at: "2024-06-01T12:00:00.000Z",
    });
  });

  it("maps bare exact match to suggested (conservative V1 seed policy)", () => {
    const match = {
      kind: "exact",
      ingredient: { id: "ing-pepino", name: "Pepino", normalized_name: "pepino" },
    } as IngredientCanonicalMatch;

    const record = mapMatcherOutputToInitialMatchRecord({ ...baseParams, match });
    expect(record.status).toBe("suggested");
    expect(record.match_kind).toBe("exact");
    expect(record.confirmed_at).toBeNull();
    expect(record.ingredient_id).toBe("ing-pepino");
  });

  it("maps unmatched when matcher returns null", () => {
    expect(
      mapMatcherOutputToInitialMatchRecord({ ...baseParams, match: null }).status,
    ).toBe("unmatched");
  });
});

describe("resolvePersistedMatchStatusFromMatcher", () => {
  it("classifies alias-backed kinds as confirmed", () => {
    expect(
      resolvePersistedMatchStatusFromMatcher({
        kind: "confirmed-alias",
        ingredient: { id: "ing-a", name: "A", normalized_name: "a" },
      } as IngredientCanonicalMatch),
    ).toBe("confirmed");
  });

  it("classifies bare exact and operational-memory as suggested", () => {
    expect(
      resolvePersistedMatchStatusFromMatcher({
        kind: "exact",
        ingredient: { id: "ing-pepino", name: "Pepino", normalized_name: "pepino" },
      } as IngredientCanonicalMatch),
    ).toBe("suggested");
    expect(
      resolvePersistedMatchStatusFromMatcher({
        kind: "operational-memory",
        ingredient: { id: "ing-pepino", name: "Pepino", normalized_name: "pepino" },
      } as IngredientCanonicalMatch),
    ).toBe("suggested");
  });
});
