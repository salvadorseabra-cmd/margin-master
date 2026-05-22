import { beforeEach, describe, expect, it, vi } from "vitest";
import type { IngredientCanonicalInput } from "./ingredient-canonical";
import {
  clearIngredientMatchOverridesForTests,
  ingredientMatchOverrides,
  rememberIngredientMatchOverride,
} from "./ingredient-match-override";
import {
  clearRejectedIngredientMatchesForTests,
  listRejectedIngredientMatches,
  rememberRejectedIngredientMatch,
  rejectedIngredientMatchStorageKey,
} from "./ingredient-rejected-match-memory";
import {
  mergeCanonicalIngredientDependencies,
  runBatShoestrToBatataPalhaMerge,
  suggestBatataPalhaForMisclassifiedBatShoestr,
} from "./canonical-canonical-merge";
import { isLegacyBatShoestrCatalogEntry } from "./ingredient-alias-reassignment";

function row(
  id: string,
  name: string,
  extra?: Partial<IngredientCanonicalInput>,
): IngredientCanonicalInput {
  return { id, name, normalized_name: name.toLowerCase(), ...extra };
}

type MockAliasRow = {
  id: string;
  ingredient_id: string;
  alias_name?: string;
  normalized_alias?: string;
  supplier_name?: string | null;
  confidence?: number;
};

function createMergeMockClient(options: {
  aliasRows?: MockAliasRow[];
  priceRows?: { id: string; ingredient_id: string }[];
  recipeRows?: { id: string; recipe_id: string; ingredient_id: string; quantity: number | null }[];
  archiveUpdates?: Record<string, unknown>[];
  ingredientOwners?: { id: string; user_id: string }[];
}) {
  const aliasRows = [...(options.aliasRows ?? [])];
  const priceRows = [...(options.priceRows ?? [])];
  const recipeRows = [...(options.recipeRows ?? [])];
  const archiveUpdates = options.archiveUpdates ?? [];
  const ingredientOwners = options.ingredientOwners ?? [];

  const toDbRow = (r: MockAliasRow) => ({
    id: r.id,
    ingredient_id: r.ingredient_id,
    alias_name: r.alias_name ?? r.id,
    normalized_alias: r.normalized_alias ?? r.alias_name ?? r.id,
    supplier_name: r.supplier_name ?? null,
    confidence: r.confidence ?? 1,
  });

  const client = {
    from: (table: string) => {
      if (table === "ingredient_aliases") {
        const allAliasRowsPromise = Promise.resolve({
          data: aliasRows.map(toDbRow),
          error: null,
        });
        return {
          select: (_cols: string, opts?: { count?: string; head?: boolean }) => {
            if (opts?.head) {
              return {
                eq: (_c: string, ingredientId: string) =>
                  Promise.resolve({
                    count: aliasRows.filter((r) => r.ingredient_id === ingredientId).length,
                    error: null,
                  }),
              };
            }
            return Object.assign(allAliasRowsPromise, {
              eq: (col: string, val: string) => {
                if (col === "ingredient_id") {
                  return Promise.resolve({
                    data: aliasRows.filter((r) => r.ingredient_id === val).map(toDbRow),
                    error: null,
                  });
                }
                return Promise.resolve({ data: [], error: null });
              },
            });
          },
          update: (payload: Partial<MockAliasRow & { ingredient_id: string }>) => ({
            eq: (col: string, val: string) => {
              const match = aliasRows.find((r) =>
                col === "id" ? r.id === val : r.ingredient_id === val,
              );
              if (match) Object.assign(match, payload);
              return Promise.resolve({ error: null });
            },
          }),
          delete: () => ({
            eq: (_col: string, val: string) => {
              const idx = aliasRows.findIndex((r) => r.id === val);
              if (idx >= 0) aliasRows.splice(idx, 1);
              return Promise.resolve({ error: null });
            },
          }),
        };
      }

      if (table === "ingredient_price_history") {
        return {
          select: (_cols: string, opts?: { count?: string; head?: boolean }) => ({
            eq: (_c: string, ingredientId: string) => {
              if (opts?.head) {
                return Promise.resolve({
                  count: priceRows.filter((r) => r.ingredient_id === ingredientId).length,
                  error: null,
                });
              }
              return Promise.resolve({
                data: priceRows.filter((r) => r.ingredient_id === ingredientId),
                error: null,
              });
            },
          }),
          update: (payload: { ingredient_id: string }) => ({
            eq: (_c: string, ingredientId: string) => {
              for (const row of priceRows) {
                if (row.ingredient_id === ingredientId) row.ingredient_id = payload.ingredient_id;
              }
              return Promise.resolve({ error: null });
            },
          }),
        };
      }

      if (table === "recipe_ingredients") {
        return {
          select: (_cols: string, opts?: { count?: string; head?: boolean }) => ({
            eq: (_c: string, ingredientId: string) => {
              if (opts?.head) {
                return Promise.resolve({
                  count: recipeRows.filter((r) => r.ingredient_id === ingredientId).length,
                  error: null,
                });
              }
              return Promise.resolve({
                data: recipeRows.filter((r) => r.ingredient_id === ingredientId),
                error: null,
              });
            },
            in: (_c: string, ids: string[]) =>
              Promise.resolve({
                data: recipeRows.filter((r) => ids.includes(r.ingredient_id)),
                error: null,
              }),
          }),
          update: (payload: { ingredient_id?: string; quantity?: number }) => ({
            eq: (_c: string, id: string) => {
              const match = recipeRows.find((r) => r.id === id);
              if (match) Object.assign(match, payload);
              return Promise.resolve({ error: null });
            },
          }),
          delete: () => ({
            eq: (_c: string, id: string) => {
              const idx = recipeRows.findIndex((r) => r.id === id);
              if (idx >= 0) recipeRows.splice(idx, 1);
              return Promise.resolve({ error: null });
            },
          }),
        };
      }

      if (table === "recipe_margin_impacts") {
        return {
          select: (_cols: string, opts?: { count?: string; head?: boolean }) => ({
            eq: (_c: string, ingredientId: string) =>
              Promise.resolve({
                count: 0,
                error: null,
                ...(opts?.head ? {} : { data: [] }),
              }),
          }),
          update: () => ({
            eq: () => Promise.resolve({ error: null }),
          }),
        };
      }

      if (table === "ingredients") {
        return {
          select: () => ({
            eq: (col: string, val: string) => {
              if (col === "user_id") {
                const userEqChain = {
                  eq: (_c2: string, id: string) => ({
                    maybeSingle: () =>
                      Promise.resolve({
                        data: ingredientOwners.some((o) => o.id === id && o.user_id === val)
                          ? { id }
                          : null,
                        error: null,
                      }),
                  }),
                  in: (_c2: string, ids: string[]) =>
                    Promise.resolve({
                      data: ids
                        .filter((id) => ingredientOwners.some((o) => o.id === id))
                        .map((id) => ({
                          id,
                          is_archived: true,
                          merged_into_ingredient_id:
                            archiveUpdates.find((u) => u.id === id)?.merged_into_ingredient_id ??
                            null,
                        })),
                      error: null,
                    }),
                };
                return userEqChain;
              }
              return Promise.resolve({ data: [], error: null });
            },
          }),
          update: (payload: Record<string, unknown>) => ({
            eq: (col: string, val: string) => {
              if (col === "user_id") {
                return {
                  in: (_c2: string, ids: string[]) => {
                    for (const id of ids) {
                      archiveUpdates.push({ id, ...payload });
                    }
                    return {
                      select: () =>
                        Promise.resolve({
                          data: ids.map((id) => ({
                            id,
                            is_archived: payload.is_archived,
                            merged_into_ingredient_id: payload.merged_into_ingredient_id,
                          })),
                          error: null,
                        }),
                    };
                  },
                };
              }
              return Promise.resolve({ error: null });
            },
          }),
        };
      }

      return {
        select: () => ({
          eq: () => Promise.resolve({ data: [], error: null, count: 0 }),
        }),
      };
    },
  };

  return { client, aliasRows, priceRows, archiveUpdates };
}

describe("BAT shoestr merge helpers", () => {
  it("detects legacy BAT shoestr catalog row", () => {
    expect(isLegacyBatShoestrCatalogEntry(row("s1", "BAT shoestr"))).toBe(true);
    expect(isLegacyBatShoestrCatalogEntry(row("p1", "Batata palha"))).toBe(false);
    expect(isLegacyBatShoestrCatalogEntry(row("ss1", "Batata shoestring"))).toBe(false);
  });

  it("suggests Batata palha for misclassified shorthand", () => {
    expect(suggestBatataPalhaForMisclassifiedBatShoestr("BAT shoestr")).toBe("Batata palha");
    expect(suggestBatataPalhaForMisclassifiedBatShoestr("Batata palha")).toBeNull();
  });
});

describe("mergeCanonicalIngredientDependencies", () => {
  beforeEach(() => {
    clearIngredientMatchOverridesForTests();
    clearRejectedIngredientMatchesForTests();
    vi.stubGlobal("window", {
      localStorage: {
        getItem: () => null,
        setItem: () => {},
        removeItem: () => {},
      },
    });
  });

  it("rewrites alias map and rejected pairs", async () => {
    rememberIngredientMatchOverride("BAT SHOESTR", "bat-id", "BAT shoestr");
    rememberRejectedIngredientMatch("BAT SHOESTR", "bat-id");
    const confirmed = { "metro::bat shoestr": "bat-id" };

    const { client, aliasRows } = createMergeMockClient({
      aliasRows: [{ id: "a1", ingredient_id: "bat-id", alias_name: "BAT SHOESTR LINE" }],
      ingredientOwners: [
        { id: "bat-id", user_id: "user-1" },
        { id: "palha-id", user_id: "user-1" },
      ],
    });

    const result = await mergeCanonicalIngredientDependencies({
      client: client as never,
      fromIngredientId: "bat-id",
      toIngredientId: "palha-id",
      userId: "user-1",
      confirmedAliases: confirmed,
      targetIngredientName: "Batata palha",
    });

    expect(result.error).toBeNull();
    expect(result.aliasesReassigned).toBe(1);
    expect(aliasRows[0]?.ingredient_id).toBe("palha-id");
    expect(result.nextConfirmedAliases?.["metro::bat shoestr"]).toBe("palha-id");
    expect([...ingredientMatchOverrides.values()][0]?.canonicalIngredientId).toBe("palha-id");
    expect(listRejectedIngredientMatches()[0]?.rejectedIngredientId).toBe("palha-id");
  });

  it("reassigns price history ingredient_id without deleting rows", async () => {
    const { client, priceRows } = createMergeMockClient({
      priceRows: [
        { id: "ph1", ingredient_id: "bat-id" },
        { id: "ph2", ingredient_id: "bat-id" },
      ],
      ingredientOwners: [
        { id: "bat-id", user_id: "user-1" },
        { id: "palha-id", user_id: "user-1" },
      ],
    });

    const result = await mergeCanonicalIngredientDependencies({
      client: client as never,
      fromIngredientId: "bat-id",
      toIngredientId: "palha-id",
      userId: "user-1",
    });

    expect(result.error).toBeNull();
    expect(result.priceHistoryRowsReassigned).toBe(2);
    expect(priceRows).toHaveLength(2);
    expect(priceRows.every((r) => r.ingredient_id === "palha-id")).toBe(true);
  });

  it("archives source with merged_into_ingredient_id", async () => {
    const { client, archiveUpdates } = createMergeMockClient({
      ingredientOwners: [
        { id: "bat-id", user_id: "user-1" },
        { id: "palha-id", user_id: "user-1" },
      ],
    });

    const result = await mergeCanonicalIngredientDependencies({
      client: client as never,
      fromIngredientId: "bat-id",
      toIngredientId: "palha-id",
      userId: "user-1",
    });

    expect(result.error).toBeNull();
    expect(result.archived).toBe(true);
    expect(archiveUpdates[0]).toMatchObject({
      id: "bat-id",
      is_archived: true,
      merged_into_ingredient_id: "palha-id",
    });
  });
});

describe("runBatShoestrToBatataPalhaMerge", () => {
  it("resolves BAT shoestr and Batata palha then merges", async () => {
    const { client } = createMergeMockClient({
      aliasRows: [{ id: "a1", ingredient_id: "bat-id", alias_name: "BAT SHOESTR" }],
      ingredientOwners: [
        { id: "bat-id", user_id: "user-1" },
        { id: "palha-id", user_id: "user-1" },
      ],
    });
    const catalog = [row("bat-id", "BAT shoestr"), row("palha-id", "Batata palha")];

    const result = await runBatShoestrToBatataPalhaMerge({
      client: client as never,
      userId: "user-1",
      catalog,
      confirmedAliases: {},
    });

    expect(result.resolutionError).toBeNull();
    expect(result.fromIngredientId).toBe("bat-id");
    expect(result.toIngredientId).toBe("palha-id");
    expect(result.archived).toBe(true);
  });
});

describe("rejected match localStorage key", () => {
  it("uses stable storage key for rejected pairs", () => {
    expect(rejectedIngredientMatchStorageKey("user-1")).toContain("rejected-ingredient-matches");
  });
});
