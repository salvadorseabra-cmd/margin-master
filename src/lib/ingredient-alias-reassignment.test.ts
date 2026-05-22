import { describe, expect, it, vi } from "vitest";
import { normalizeInvoiceAliasMemoryKey } from "./normalize-ingredient-name";
import type { IngredientCanonicalInput } from "./ingredient-canonical";
import {
  aliasReassignmentOwnershipKey,
  findActiveCanonicalIdsByNormalizedName,
  findSourceCanonicalFromAliasOwnership,
  isAliasOnlyOperationalDependency,
  isLegacyPalhaAliasField,
  reassignAliasesAndArchiveIfOrphan,
  reassignIngredientAliases,
  resolveCanonicalIngredientForReassignment,
  runPalhaToBatataPalhaAliasReassignment,
  validateReassignIngredientAliasesParams,
} from "./ingredient-alias-reassignment";
import {
  emptyOrphanReport,
  filterOperationallyActiveCatalog,
} from "./ingredient-orphan-detection";

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

function createReassignMockClient(options: {
  aliasRows?: MockAliasRow[];
  archiveUpdates?: Record<string, unknown>[];
  ingredientOwners?: { id: string; user_id: string }[];
}) {
  const aliasRows = [...(options.aliasRows ?? [])];
  const archiveUpdates = options.archiveUpdates ?? [];
  const ingredientOwners = options.ingredientOwners ?? [];
  const deletedIds: string[] = [];

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
          select: () =>
            Object.assign(allAliasRowsPromise, {
              eq: (col: string, val: string) => {
                if (col === "ingredient_id") {
                  return Promise.resolve({
                    data: aliasRows.filter((r) => r.ingredient_id === val).map(toDbRow),
                    error: null,
                  });
                }
                return Promise.resolve({ data: [], error: null });
              },
              in: (_col: string, ids: string[]) =>
                Promise.resolve({
                  data: aliasRows
                    .filter((r) => ids.includes(r.ingredient_id))
                    .map((r) => ({
                      ingredient_id: r.ingredient_id,
                      supplier_name: r.supplier_name ?? null,
                    })),
                  error: null,
                }),
            }),
          update: (payload: Partial<MockAliasRow & { ingredient_id: string; confidence: number }>) => ({
            eq: (col: string, val: string) => {
              const row = aliasRows.find((r) =>
                col === "id" ? r.id === val : col === "ingredient_id" && r.ingredient_id === val,
              );
              if (row) Object.assign(row, payload);
              return Promise.resolve({ error: null });
            },
          }),
          delete: () => ({
            eq: (_col: string, val: string) => {
              deletedIds.push(val);
              const idx = aliasRows.findIndex((r) => r.id === val);
              if (idx >= 0) aliasRows.splice(idx, 1);
              return Promise.resolve({ error: null });
            },
          }),
        };
      }
      if (table === "ingredients") {
        return {
          select: () => ({
            eq: (col: string, val: string) => ({
              eq: (col2: string, val2: string) => ({
                maybeSingle: () => {
                  if (col === "user_id" && col2 === "id") {
                    const owned = ingredientOwners.find(
                      (row) => row.user_id === val && row.id === val2,
                    );
                    return Promise.resolve({ data: owned ? { id: owned.id } : null, error: null });
                  }
                  return Promise.resolve({ data: null, error: null });
                },
              }),
            }),
          }),
          update: (payload: Record<string, unknown>) => ({
            eq: () => ({
              eq: () => ({
                is: () => {
                  archiveUpdates.push(payload);
                  return Promise.resolve({ error: null });
                },
              }),
            }),
          }),
        };
      }
      if (
        table === "recipe_ingredients" ||
        table === "ingredient_price_history" ||
        table === "recipe_margin_impacts"
      ) {
        return {
          select: () => ({
            in: () => Promise.resolve({ data: [], error: null }),
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  };
  return { client, deletedIds, aliasRows };
}

describe("validateReassignIngredientAliasesParams", () => {
  it("rejects same source and target", () => {
    expect(
      validateReassignIngredientAliasesParams({
        fromIngredientId: "a",
        toIngredientId: "a",
      }),
    ).toContain("same_source_and_target");
  });
});

describe("isAliasOnlyOperationalDependency", () => {
  it("flags PALHA-style alias-only blocker", () => {
    const report = { ...emptyOrphanReport("palha"), invoiceAliasCount: 3 };
    expect(isAliasOnlyOperationalDependency(report)).toBe(true);
  });

  it("returns false when recipes exist", () => {
    const report = {
      ...emptyOrphanReport("palha"),
      invoiceAliasCount: 2,
      recipeIngredientCount: 1,
    };
    expect(isAliasOnlyOperationalDependency(report)).toBe(false);
  });
});

describe("findActiveCanonicalIdsByNormalizedName", () => {
  it("resolves PALHA and Batata palha", () => {
    const catalog = [row("palha-id", "PALHA"), row("batata-id", "Batata palha")];
    const map = findActiveCanonicalIdsByNormalizedName(catalog, ["PALHA", "Batata palha"]);
    expect(map.get("palha")).toBe("palha-id");
    expect(map.get("batata palha")).toBe("batata-id");
  });
});

describe("reassignIngredientAliases", () => {
  it("moves 3 alias rows from PALHA to batata and rewrites in-memory map", async () => {
    const aliasRows = [
      {
        id: "a1",
        ingredient_id: "palha-id",
        alias_name: "PALHA AUCHAN",
        normalized_alias: "palha auchan metro",
        supplier_name: "Metro",
      },
      {
        id: "a2",
        ingredient_id: "palha-id",
        alias_name: "BAT PALHA",
        normalized_alias: "bat palha continente",
        supplier_name: "Continente",
      },
      {
        id: "a3",
        ingredient_id: "palha-id",
        alias_name: "PALHA SNACK",
        normalized_alias: "palha snack global",
        supplier_name: null,
      },
    ];
    const { client, aliasRows: liveRows } = createReassignMockClient({ aliasRows });
    const confirmedAliases = {
      "metro|batata palha": "palha-id",
      "global|palha snack": "palha-id",
      "other|batata": "batata-id",
    };

    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});

    const { aliasesReassigned, nextConfirmedAliases, error } = await reassignIngredientAliases({
      client: client as never,
      fromIngredientId: "palha-id",
      toIngredientId: "batata-id",
      userId: "user-1",
      confirmedAliases,
    });

    expect(error).toBeNull();
    expect(aliasesReassigned).toBe(3);
    expect(liveRows.every((r) => r.ingredient_id === "batata-id")).toBe(true);
    expect(nextConfirmedAliases?.["metro|batata palha"]).toBe("batata-id");
    expect(nextConfirmedAliases?.["global|palha snack"]).toBe("batata-id");
    expect(nextConfirmedAliases?.["other|batata"]).toBe("batata-id");
    expect(infoSpy).toHaveBeenCalled();
    infoSpy.mockRestore();
  });
});

describe("reassignAliasesAndArchiveIfOrphan", () => {
  it("archives PALHA after reassignment when zero refs remain", async () => {
    const aliasRows = [
      { id: "a1", ingredient_id: "palha-id" },
      { id: "a2", ingredient_id: "palha-id" },
      { id: "a3", ingredient_id: "palha-id" },
    ];
    const archiveUpdates: Record<string, unknown>[] = [];
    const { client } = createReassignMockClient({ aliasRows, archiveUpdates });
    const catalog = [row("palha-id", "PALHA"), row("batata-id", "Batata palha")];

    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});

    const result = await reassignAliasesAndArchiveIfOrphan({
      client: client as never,
      fromIngredientId: "palha-id",
      toIngredientId: "batata-id",
      userId: "user-1",
      catalog,
    });

    expect(result.error).toBeNull();
    expect(result.aliasesReassigned).toBe(3);
    expect(result.sourceOrphanReport).not.toBeNull();
    expect(result.archived).toBe(true);
    expect(archiveUpdates[0]).toEqual({ is_archived: true });
    infoSpy.mockRestore();
  });
});

describe("aliasReassignmentOwnershipKey", () => {
  it("normalizes alias keys before compare", () => {
    const a = aliasReassignmentOwnershipKey({
      alias_name: "BATATA PALHA 2KG SERVICE",
      normalized_alias: "batata palha 2kg",
      supplier_name: "Metro",
    });
    const b = aliasReassignmentOwnershipKey({
      alias_name: "Batata Palha 2kg",
      normalized_alias: "BATATA PALHA 2KG",
      supplier_name: "metro",
    });
    expect(a).toBe(b);
  });
});

describe("reassignIngredientAliases duplicate collision", () => {
  it("merges when target already owns the same alias+supplier key", async () => {
    const sourceRow = {
      alias_name: "KETCHUP GULOSO TOP DOWN 570G",
      normalized_alias: "ketchup guloso top",
      supplier_name: null as string | null,
    };
    const targetRow = {
      alias_name: "KETCHUP GULOSO 570G",
      normalized_alias: "ketchup guloso top",
      supplier_name: null as string | null,
    };
    const sourceKey = aliasReassignmentOwnershipKey(sourceRow);
    const targetKey = aliasReassignmentOwnershipKey(targetRow);
    expect(sourceKey).toBe(targetKey);
    expect(sourceKey).toBe(normalizeInvoiceAliasMemoryKey(sourceRow.normalized_alias));

    const aliasRows = [
      {
        id: "src-1",
        ingredient_id: "palha-id",
        ...sourceRow,
        confidence: 5,
      },
      {
        id: "tgt-1",
        ingredient_id: "batata-id",
        ...targetRow,
        confidence: 2,
      },
      {
        id: "src-2",
        ingredient_id: "palha-id",
        alias_name: "BAT PALHA METRO",
        normalized_alias: "bat palha metro scoped",
        supplier_name: "Metro",
        confidence: 1,
      },
    ];
    const { client, deletedIds, aliasRows: liveRows } = createReassignMockClient({ aliasRows });

    const { aliasesReassigned, error } = await reassignIngredientAliases({
      client: client as never,
      fromIngredientId: "palha-id",
      toIngredientId: "batata-id",
      userId: "user-1",
    });

    expect(error).toBeNull();
    expect(aliasesReassigned).toBe(2);
    expect(deletedIds).toContain("src-1");
    expect(liveRows.find((r) => r.id === "src-1")).toBeUndefined();
    expect(liveRows.find((r) => r.id === "tgt-1")?.confidence).toBe(5);
    expect(liveRows.find((r) => r.id === "src-2")?.ingredient_id).toBe("batata-id");
    expect(liveRows.filter((r) => r.ingredient_id === "palha-id")).toHaveLength(0);
  });
});

describe("PALHA archive hides from operationally active catalog", () => {
  it("drops archived PALHA after reassignment via filterOperationallyActiveCatalog", () => {
    const catalog = [
      row("palha-id", "PALHA", { is_archived: true }),
      row("batata-id", "Batata palha"),
    ];
    const reports = new Map([
      ["palha-id", emptyOrphanReport("palha-id")],
      ["batata-id", { ...emptyOrphanReport("batata-id"), invoiceAliasCount: 3 }],
    ]);
    const active = filterOperationallyActiveCatalog(catalog, reports);
    expect(active.map((r) => r.id)).toEqual(["batata-id"]);
  });
});

describe("isLegacyPalhaAliasField", () => {
  it("matches PALHA aliases but not Batata palha invoice lines", () => {
    expect(isLegacyPalhaAliasField("PALHA SNACK")).toBe(true);
    expect(isLegacyPalhaAliasField("BAT PALHA METRO")).toBe(true);
    expect(isLegacyPalhaAliasField("BATATA PALHA 2KG SERVICE")).toBe(false);
  });
});

describe("findSourceCanonicalFromAliasOwnership", () => {
  it("returns legacy PALHA id from alias rows when catalog name is absent", async () => {
    const aliasRows = [
      {
        id: "a1",
        ingredient_id: "palha-id",
        alias_name: "PALHA SNACK",
        normalized_alias: "palha snack",
      },
      {
        id: "a2",
        ingredient_id: "palha-id",
        alias_name: "BAT PAL",
        normalized_alias: "bat pal",
      },
      {
        id: "a3",
        ingredient_id: "batata-id",
        alias_name: "BATATA PALHA 2KG",
        normalized_alias: "batata palha 2kg",
      },
    ];
    const { client } = createReassignMockClient({
      aliasRows,
      ingredientOwners: [{ id: "palha-id", user_id: "user-1" }],
    });

    const result = await findSourceCanonicalFromAliasOwnership(
      client as never,
      "user-1",
      ["PALHA", "palha"],
    );

    expect(result.ingredientId).toBe("palha-id");
    expect(result.aliasCount).toBe(2);
  });
});

describe("resolveCanonicalIngredientForReassignment", () => {
  it("resolves archived PALHA via alias ownership when not in active catalog", async () => {
    const aliasRows = [
      {
        id: "a1",
        ingredient_id: "palha-id",
        alias_name: "PALHA AUCHAN",
        normalized_alias: "palha auchan",
      },
    ];
    const { client } = createReassignMockClient({
      aliasRows,
      ingredientOwners: [{ id: "palha-id", user_id: "user-1" }],
    });
    const catalog = [
      row("palha-id", "LEGACY SNACK", {
        is_archived: true,
        normalized_name: "legacy snack",
      }),
      row("batata-id", "Batata palha"),
    ];

    const source = await resolveCanonicalIngredientForReassignment({
      client: client as never,
      userId: "user-1",
      hints: {
        normalizedNames: ["PALHA"],
        aliasSearchTerms: ["PALHA", "palha"],
        legacyPalhaFuzzyCatalog: true,
        excludeNormalizedNames: ["Batata palha"],
        catalog,
        includeArchived: true,
      },
    });

    expect(source.ingredientId).toBe("palha-id");
    expect(source.resolverMethod).toBe("alias_ownership");
    expect(source.aliasCount).toBe(1);
    expect(source.sourceState).toBe("archived");
  });
});

describe("runPalhaToBatataPalhaAliasReassignment", () => {
  it("resolves names and runs full flow", async () => {
    const aliasRows = [{ id: "a1", ingredient_id: "palha-id" }];
    const { client } = createReassignMockClient({
      aliasRows,
      ingredientOwners: [{ id: "palha-id", user_id: "user-1" }],
    });
    const catalog = [row("palha-id", "PALHA"), row("batata-id", "Batata palha")];

    const result = await runPalhaToBatataPalhaAliasReassignment({
      client: client as never,
      userId: "user-1",
      catalog,
      confirmedAliases: {},
    });

    expect(result.resolutionError).toBeNull();
    expect(result.fromIngredientId).toBe("palha-id");
    expect(result.toIngredientId).toBe("batata-id");
    expect(result.aliasesReassigned).toBe(1);
    expect(result.archived).toBe(true);
  });

  it("fromIngredientId is set when only archived PALHA exists in catalog", async () => {
    const aliasRows = [
      { id: "a1", ingredient_id: "palha-id", alias_name: "PALHA", normalized_alias: "palha" },
      { id: "a2", ingredient_id: "palha-id", alias_name: "BAT PAL", normalized_alias: "bat pal" },
    ];
    const { client } = createReassignMockClient({
      aliasRows,
      ingredientOwners: [{ id: "palha-id", user_id: "user-1" }],
    });
    const catalog = [
      row("palha-id", "RENAMED LEGACY", {
        is_archived: true,
        normalized_name: "renamed legacy",
      }),
      row("batata-id", "Batata palha"),
    ];

    const result = await runPalhaToBatataPalhaAliasReassignment({
      client: client as never,
      userId: "user-1",
      catalog,
      confirmedAliases: {},
    });

    expect(result.resolutionError).toBeNull();
    expect(result.fromIngredientId).toBe("palha-id");
    expect(result.resolutionDiagnostics?.resolverMethod).toBe("alias_ownership");
    expect(result.resolutionDiagnostics?.sourceState).toBe("archived");
    expect(result.toIngredientId).toBe("batata-id");
  });
});
