import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  archiveIngredient,
  clearIngredientArchiveReason,
  filterOperationallyArchivedIngredients,
  formatArchivedDateLabel,
  formatArchivedRecency,
  formatIngredientArchiveReasonLine,
  formatLastPurchaseRecencyPhrase,
  getIngredientArchiveReason,
  isOperationallyArchivedEntry,
  loadArchivedIngredientCatalog,
  setIngredientArchiveReason,
  sortOperationallyArchivedIngredients,
} from "./ingredient-archive";

describe("isOperationallyArchivedEntry", () => {
  it("is true for user-archived rows without merge target", () => {
    expect(isOperationallyArchivedEntry({ is_archived: true, merged_into_ingredient_id: null })).toBe(
      true,
    );
  });

  it("is false for merge-absorbed duplicates", () => {
    expect(
      isOperationallyArchivedEntry({
        is_archived: true,
        merged_into_ingredient_id: "canonical-1",
      }),
    ).toBe(false);
  });

  it("is false for active rows", () => {
    expect(isOperationallyArchivedEntry({ is_archived: false })).toBe(false);
  });
});

describe("sortOperationallyArchivedIngredients", () => {
  it("orders by archived_at descending", () => {
    const sorted = sortOperationallyArchivedIngredients([
      {
        id: "old",
        name: "Old",
        is_archived: true,
        archived_at: "2026-01-01T00:00:00.000Z",
      },
      {
        id: "new",
        name: "New",
        is_archived: true,
        archived_at: "2026-05-01T00:00:00.000Z",
      },
    ]);
    expect(sorted.map((row) => row.id)).toEqual(["new", "old"]);
  });
});

describe("loadArchivedIngredientCatalog", () => {
  it("retries without archived_at when the column is missing", async () => {
    const archivedRow = {
      id: "arch-1",
      name: "Archived spice",
      normalized_name: "archived spice",
      unit: "kg",
      is_archived: true,
      merged_into_ingredient_id: null,
    };
    let selectCall = 0;
    const client = {
      from: () => ({
        select: (select: string) => {
          selectCall += 1;
          if (selectCall === 1 && select.includes("archived_at")) {
            return {
              eq: () => ({
                is: () => ({
                  order: () =>
                    Promise.resolve({
                      data: null,
                      error: { message: 'column "archived_at" does not exist' },
                    }),
                }),
              }),
            };
          }
          if (select.includes("archived_at")) {
            throw new Error("unexpected archived_at select");
          }
          return {
            eq: () => ({
              is: () => ({
                order: () => Promise.resolve({ data: [archivedRow], error: null }),
              }),
            }),
          };
        },
      }),
    };

    const { rows, error } = await loadArchivedIngredientCatalog(client as never);
    expect(error).toBeNull();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe("arch-1");
    expect(selectCall).toBe(2);
  });

  it("filters merge-absorbed duplicates from archived results", async () => {
    const client = {
      from: () => ({
        select: () => ({
          eq: () => ({
            is: () => ({
              order: () =>
                Promise.resolve({
                  data: [
                    {
                      id: "op",
                      name: "Operational",
                      is_archived: true,
                      merged_into_ingredient_id: null,
                    },
                    {
                      id: "dup",
                      name: "Duplicate",
                      is_archived: true,
                      merged_into_ingredient_id: "op",
                    },
                  ],
                  error: null,
                }),
            }),
          }),
        }),
      }),
    };

    const { rows, error } = await loadArchivedIngredientCatalog(client as never);
    expect(error).toBeNull();
    expect(rows.map((row) => row.id)).toEqual(["op"]);
  });
});

describe("archiveIngredient", () => {
  it("returns an error when no row is updated", async () => {
    const client = {
      from: () => ({
        update: () => ({
          eq: () => ({
            eq: () => ({
              is: () => ({
                select: () => Promise.resolve({ data: [], error: null }),
              }),
            }),
          }),
        }),
      }),
    };

    const { error } = await archiveIngredient({
      client: client as never,
      ingredientId: "missing",
      userId: "user-1",
    });
    expect(error?.message).toMatch(/not found/i);
  });
});

describe("filterOperationallyArchivedIngredients", () => {
  it("keeps only operational archives", () => {
    const filtered = filterOperationallyArchivedIngredients([
      { id: "a", name: "Active", is_archived: false },
      { id: "b", name: "Archived", is_archived: true },
      { id: "c", name: "Merged", is_archived: true, merged_into_ingredient_id: "a" },
    ]);
    expect(filtered.map((row) => row.id)).toEqual(["b"]);
  });
});

describe("formatArchivedRecency", () => {
  it("formats days ago", () => {
    const twelveDaysAgo = new Date(Date.now() - 12 * 24 * 60 * 60 * 1000).toISOString();
    expect(formatArchivedRecency(twelveDaysAgo)).toBe("Archived 12 days ago");
  });
});

describe("formatLastPurchaseRecencyPhrase", () => {
  it("formats months ago", () => {
    const fourMonthsAgo = new Date(Date.now() - 120 * 24 * 60 * 60 * 1000).toISOString();
    expect(formatLastPurchaseRecencyPhrase(fourMonthsAgo)).toMatch(/Last purchase 4 months ago/);
  });
});

describe("formatArchivedDateLabel", () => {
  it("formats day and month", () => {
    expect(formatArchivedDateLabel("2026-05-12T10:00:00.000Z")).toMatch(/^Archived 12 /);
  });
});

describe("formatIngredientArchiveReasonLine", () => {
  it("maps reason enums to copy", () => {
    expect(formatIngredientArchiveReasonLine("unused")).toBe("Archived because unused");
    expect(formatIngredientArchiveReasonLine("catalog_review")).toBe(
      "Archived from catalog review",
    );
    expect(formatIngredientArchiveReasonLine(null)).toBe("Archived manually");
  });
});

describe("ingredient archive reason storage", () => {
  const userId = "test-user-archive-reason";
  let store: Record<string, string>;

  beforeEach(() => {
    store = {};
    const localStorage = {
      getItem: (key: string) => store[key] ?? null,
      setItem: (key: string, value: string) => {
        store[key] = value;
      },
      removeItem: (key: string) => {
        delete store[key];
      },
      clear: () => {
        store = {};
      },
    };
    vi.stubGlobal("localStorage", localStorage);
    vi.stubGlobal("window", { localStorage });
  });

  it("stores and clears per-ingredient reasons", () => {
    setIngredientArchiveReason(userId, "ing-1", "catalog_review");
    expect(getIngredientArchiveReason(userId, "ing-1")).toBe("catalog_review");
    clearIngredientArchiveReason(userId, "ing-1");
    expect(getIngredientArchiveReason(userId, "ing-1")).toBeNull();
  });
});
