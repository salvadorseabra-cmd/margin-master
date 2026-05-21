import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearRejectedIngredientMatchesForTests,
  hydrateRejectedIngredientMatchesFromStorage,
  isIngredientMatchPairRejected,
  listRejectedIngredientMatches,
  persistRejectedIngredientMatchesToStorage,
  rejectedIngredientMatchStorageKey,
  rememberRejectedIngredientMatch,
} from "./ingredient-rejected-match-memory";
import { findCanonicalIngredientMatch, type IngredientCanonicalInput } from "./ingredient-canonical";
import { findInvoiceItemIngredientMatch } from "./invoice-ingredient-match-propagation";
import { clearIngredientMatchOverridesForTests } from "./ingredient-match-override";
import { clearOperationalAliasMemoryForTests } from "./ingredient-operational-alias-memory";
import { buildCanonicalIngredientPickerOptions } from "./ingredient-picker-options";

function ingredient(id: string, name: string): IngredientCanonicalInput {
  return { id, name, normalized_name: name.toLowerCase(), unit: "kg" };
}

const storage = new Map<string, string>();

describe("ingredient rejected match memory", () => {
  beforeEach(() => {
    clearRejectedIngredientMatchesForTests();
    clearIngredientMatchOverridesForTests();
    clearOperationalAliasMemoryForTests();
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

  it("persists rejected pair and blocks matcher on reload", () => {
    const catalog = [ingredient("angus-1", "Angus Burger Patty 180g")];
    const before = findInvoiceItemIngredientMatch("ANGUS PTY", catalog);
    expect(before?.ingredient.id).toBe("angus-1");

    rememberRejectedIngredientMatch("ANGUS PTY", "angus-1");
    expect(isIngredientMatchPairRejected("ANGUS PTY", "angus-1")).toBe(true);

    const afterReject = findInvoiceItemIngredientMatch("ANGUS PTY", catalog);
    expect(afterReject).toBeNull();

    clearRejectedIngredientMatchesForTests();
    const reloaded = findInvoiceItemIngredientMatch("ANGUS PTY", catalog);
    expect(reloaded?.ingredient.id).toBe("angus-1");

    rememberRejectedIngredientMatch("ANGUS PTY", "angus-1");
    persistRejectedIngredientMatchesToStorage("user-1");
    clearRejectedIngredientMatchesForTests();

    hydrateRejectedIngredientMatchesFromStorage("user-1");
    expect(findInvoiceItemIngredientMatch("ANGUS PTY", catalog)).toBeNull();
    expect(listRejectedIngredientMatches()).toHaveLength(1);
  });

  it("keeps ingredient catalog intact and only blocks the rejected pair", () => {
    const catalog = [
      ingredient("angus-1", "Angus Burger Patty 180g"),
      ingredient("pickles-1", "Pickles Sliced 1KG"),
    ];
    rememberRejectedIngredientMatch("ANGUS PTY", "angus-1");

    expect(findInvoiceItemIngredientMatch("ANGUS PTY", catalog)).toBeNull();
    expect(findInvoiceItemIngredientMatch("Pickles Sliced 1KG", catalog)?.ingredient.id).toBe(
      "pickles-1",
    );
    expect(catalog.map((row) => row.id)).toEqual(["angus-1", "pickles-1"]);
  });

  it("skips rejected pair in semantic candidate loop", () => {
    const catalog = [
      ingredient("angus-1", "ANGUS BURGER PATTY 180G"),
      ingredient("smash-1", "SMASH BURGER PATTY 90G"),
    ];
    rememberRejectedIngredientMatch("ANG PTY 180", "angus-1");

    const match = findCanonicalIngredientMatch("ANG PTY 180", catalog, {}, null, {
      rawItemName: "ANG PTY 180",
    });
    expect(match?.ingredient.id).not.toBe("angus-1");
  });

  it("stores supplier-scoped rejection without blocking other suppliers", () => {
    rememberRejectedIngredientMatch("ANGUS PTY", "angus-1", "Metro Cash");
    expect(isIngredientMatchPairRejected("ANGUS PTY", "angus-1", "Metro Cash")).toBe(true);
    expect(isIngredientMatchPairRejected("ANGUS PTY", "angus-1", "Other Supplier")).toBe(false);
  });

  it("blocks confirmed-alias rematch after wrong-match rejection", () => {
    const catalog = [ingredient("angus-1", "Angus Burger Patty 180g")];
    const aliases = { "angus pty": "angus-1" };
    expect(findCanonicalIngredientMatch("ANGUS PTY", catalog, aliases)?.kind).toBe(
      "confirmed-alias",
    );

    rememberRejectedIngredientMatch("ANGUS PTY", "angus-1");
    expect(findCanonicalIngredientMatch("ANGUS PTY", catalog, aliases)).toBeNull();
  });

  it("blocks exact self-match when rejection was stored from raw invoice wording", () => {
    const catalog = [ingredient("angus-1", "Angus Burger Patty 180g")];
    rememberRejectedIngredientMatch("ANG PTY 180", "angus-1", null, Date.now(), ["ANG PTY 180"]);
    expect(
      findInvoiceItemIngredientMatch("ANG PTY 180", catalog, {}, null),
    ).toBeNull();
  });

  it("round-trips through localStorage", () => {
    rememberRejectedIngredientMatch("ANGUS PTY", "angus-1", "Metro");
    persistRejectedIngredientMatchesToStorage("user-test");
    clearRejectedIngredientMatchesForTests();

    const merged = hydrateRejectedIngredientMatchesFromStorage("user-test");
    expect(merged).toBe(1);
    expect(localStorage.getItem(rejectedIngredientMatchStorageKey("user-test"))).toContain(
      "angus-1",
    );
  });
});

describe("rejection side effects", () => {
  it("does not mutate ingredient catalog or duplicate picker ids", () => {
    const catalog = [
      ingredient("angus-1", "Angus Burger Patty 180g"),
      ingredient("pickles-1", "Pickles Sliced 1KG"),
    ];
    const catalogBefore = catalog.map((row) => row.id);
    rememberRejectedIngredientMatch("ANGUS PTY", "angus-1");
    expect(catalog.map((row) => row.id)).toEqual(catalogBefore);

    const pickerOptions = buildCanonicalIngredientPickerOptions(catalog);
    expect(new Set(pickerOptions.map((row) => row.id)).size).toBe(pickerOptions.length);
  });
});
