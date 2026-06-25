import { describe, expect, it } from "vitest";
import {
  detectAliasOwnershipCollisions,
  releaseStaleAliasOwnership,
  upsertConfirmedAlias,
  type AppSupabaseClient,
} from "./ingredient-alias-memory";

type MockAliasRow = {
  id: string;
  ingredient_id: string;
  alias_name: string;
  normalized_alias: string;
  supplier_name: string | null;
  confidence: number;
  confirmed_by_user: boolean;
};

function createMockAliasClient(initialRows: MockAliasRow[] = []) {
  const rows = initialRows.map((row) => ({ ...row }));
  const deletedIds: string[] = [];
  const insertCalls: Record<string, unknown>[] = [];
  const updateCalls: Array<{ id: string; payload: Record<string, unknown> }> = [];

  const client = {
    from(table: string) {
      if (table !== "ingredient_aliases") throw new Error(`unexpected table ${table}`);

      const applyFilters = (source: MockAliasRow[], filters: Array<(row: MockAliasRow) => boolean>) =>
        source.filter((row) => filters.every((fn) => fn(row)));

      return {
        select(columns: string) {
          const filters: Array<(row: MockAliasRow) => boolean> = [];
          const builder = {
            eq(column: keyof MockAliasRow, value: unknown) {
              filters.push((row) => row[column] === value);
              return builder;
            },
            is(column: keyof MockAliasRow, value: null) {
              filters.push((row) => row[column] === value);
              return builder;
            },
            maybeSingle: async () => {
              const matches = applyFilters(rows, filters);
              return { data: matches[0] ?? null, error: null, status: 200 };
            },
            then(onFulfilled: (value: { data: MockAliasRow[]; error: null }) => unknown) {
              const matches = applyFilters(rows, filters);
              const selected = matches.map((row) => {
                const out: Record<string, unknown> = {};
                for (const col of columns.split(",").map((c) => c.trim())) {
                  out[col] = row[col as keyof MockAliasRow];
                }
                return out as MockAliasRow;
              });
              return Promise.resolve(onFulfilled({ data: selected, error: null }));
            },
          };
          return builder;
        },
        insert(payload: Record<string, unknown>) {
          insertCalls.push(payload);
          const id = `new-${rows.length + 1}`;
          rows.push({
            id,
            ingredient_id: String(payload.ingredient_id),
            alias_name: String(payload.alias_name),
            normalized_alias: String(payload.normalized_alias),
            supplier_name: (payload.supplier_name as string | null) ?? null,
            confidence: Number(payload.confidence ?? 1),
            confirmed_by_user: Boolean(payload.confirmed_by_user),
          });
          return Promise.resolve({ error: null, data: null, status: 201, statusText: "Created" });
        },
        update(payload: Record<string, unknown>) {
          return {
            eq(column: keyof MockAliasRow, value: unknown) {
              const target = rows.find((row) => row[column] === value);
              if (target) {
                updateCalls.push({ id: target.id, payload });
                Object.assign(target, payload);
              }
              return Promise.resolve({ error: null, data: null, status: 200, statusText: "OK" });
            },
          };
        },
        delete() {
          return {
            eq(column: keyof MockAliasRow, value: unknown) {
              const index = rows.findIndex((row) => row[column] === value);
              if (index >= 0) {
                deletedIds.push(rows[index]!.id);
                rows.splice(index, 1);
              }
              return Promise.resolve({ error: null });
            },
          };
        },
      };
    },
    _state: { rows, deletedIds, insertCalls, updateCalls },
  };

  return client as unknown as AppSupabaseClient & { _state: typeof client._state };
}

describe("detectAliasOwnershipCollisions", () => {
  it("flags same supplier + normalized_alias on different ingredients", () => {
    const collisions = detectAliasOwnershipCollisions([
      {
        id: "stale",
        ingredient_id: "fior-di-latte",
        alias_name: "MOZZA Fior di Latte Expet Julienne 3kg Simonetta",
        normalized_alias: "mozzarella fior di latte expet julienne simonetta",
        supplier_name: "Mammafiore Portugal",
      },
      {
        id: "correct",
        ingredient_id: "julienne",
        alias_name: "MOZZA Fior di Latte Expet Julienne 3kg Simonetta",
        normalized_alias: "mozzarella fior di latte expet julienne simonetta",
        supplier_name: "Mammafiore Portugal",
      },
    ]);

    expect(collisions).toHaveLength(1);
    expect(collisions[0]!.rows).toHaveLength(2);
    expect(collisions[0]!.lookupKey).toMatch(/mammafiore portugal::mozzarella fior di latte expet julienne simonetta/i);
  });

  it("does not flag distinct suppliers with same normalized alias", () => {
    const collisions = detectAliasOwnershipCollisions([
      {
        id: "a",
        ingredient_id: "ing-1",
        alias_name: "CHK BREADED",
        normalized_alias: "chicken breaded",
        supplier_name: "Metro",
      },
      {
        id: "b",
        ingredient_id: "ing-2",
        alias_name: "CHK BREADED",
        normalized_alias: "chicken breaded",
        supplier_name: "Continente",
      },
    ]);
    expect(collisions).toHaveLength(0);
  });

  it("does not flag multiple aliases on same ingredient", () => {
    const collisions = detectAliasOwnershipCollisions([
      {
        id: "a",
        ingredient_id: "bat-palha",
        alias_name: "BATATA PALHA 2KG",
        normalized_alias: "batata palha",
        supplier_name: "Metro",
      },
      {
        id: "b",
        ingredient_id: "bat-palha",
        alias_name: "PALHA SNACK",
        normalized_alias: "palha snack",
        supplier_name: "Metro",
      },
    ]);
    expect(collisions).toHaveLength(0);
  });
});

describe("releaseStaleAliasOwnership", () => {
  it("deletes rows on other ingredients only", async () => {
    const client = createMockAliasClient([
      {
        id: "stale",
        ingredient_id: "fior-di-latte",
        alias_name: "MOZZA julienne",
        normalized_alias: "mozzarella fior di latte expet julienne simonetta",
        supplier_name: "Mammafiore Portugal",
        confidence: 10,
        confirmed_by_user: true,
      },
      {
        id: "correct",
        ingredient_id: "julienne",
        alias_name: "MOZZA julienne",
        normalized_alias: "mozzarella fior di latte expet julienne simonetta",
        supplier_name: "Mammafiore Portugal",
        confidence: 10,
        confirmed_by_user: true,
      },
    ]);

    const { releasedIds, error } = await releaseStaleAliasOwnership(
      client,
      "julienne",
      "mozzarella fior di latte expet julienne simonetta",
      "Mammafiore Portugal",
    );

    expect(error).toBeNull();
    expect(releasedIds).toEqual(["stale"]);
    expect(client._state.rows.map((r) => r.id)).toEqual(["correct"]);
  });
});

describe("upsertConfirmedAlias ownership integrity", () => {
  const mozzarellaAlias = "MOZZA Fior di Latte Expet Julienne 3kg Simonetta";
  const mozzarellaNorm = "mozzarella fior di latte expet julienne simonetta";
  const mammafiore = "Mammafiore Portugal";

  it("Confirm Match: inserts when no prior ownership exists", async () => {
    const client = createMockAliasClient();
    const { error } = await upsertConfirmedAlias({
      ingredientId: "prosciutto",
      aliasName: "Rovagnati - Assaporami Prosciutto Cotto Scelto HC 4,3-4,5kg",
      normalizedAlias: "assaporami prosciutto cotto sceltohc",
      supplierName: mammafiore,
      supabase: client,
      manualConfirmation: true,
    });

    expect(error).toBeNull();
    expect(client._state.insertCalls).toHaveLength(1);
    expect(client._state.rows).toHaveLength(1);
    expect(client._state.rows[0]!.ingredient_id).toBe("prosciutto");
  });

  it("Review&Create: removes stale ownership on wrong ingredient before insert", async () => {
    const client = createMockAliasClient([
      {
        id: "stale",
        ingredient_id: "fior-di-latte",
        alias_name: mozzarellaAlias,
        normalized_alias: mozzarellaNorm,
        supplier_name: mammafiore,
        confidence: 10,
        confirmed_by_user: true,
      },
    ]);

    const { error } = await upsertConfirmedAlias({
      ingredientId: "julienne",
      aliasName: mozzarellaAlias,
      normalizedAlias: mozzarellaNorm,
      supplierName: mammafiore,
      supabase: client,
      manualConfirmation: true,
    });

    expect(error).toBeNull();
    expect(client._state.deletedIds).toEqual(["stale"]);
    expect(client._state.rows).toHaveLength(1);
    expect(client._state.rows[0]!.ingredient_id).toBe("julienne");
    expect(detectAliasOwnershipCollisions(client._state.rows)).toHaveLength(0);
  });

  it("repeated confirms update target row without duplicate ownership", async () => {
    const client = createMockAliasClient([
      {
        id: "existing",
        ingredient_id: "julienne",
        alias_name: mozzarellaAlias,
        normalized_alias: mozzarellaNorm,
        supplier_name: mammafiore,
        confidence: 10,
        confirmed_by_user: true,
      },
    ]);

    const { error } = await upsertConfirmedAlias({
      ingredientId: "julienne",
      aliasName: mozzarellaAlias,
      normalizedAlias: mozzarellaNorm,
      supplierName: mammafiore,
      supabase: client,
      manualConfirmation: true,
    });

    expect(error).toBeNull();
    expect(client._state.insertCalls).toHaveLength(0);
    expect(client._state.updateCalls).toHaveLength(1);
    expect(client._state.rows).toHaveLength(1);
    expect(client._state.rows[0]!.id).toBe("existing");
  });

  it("supplier changes keep separate ownership scopes", async () => {
    const client = createMockAliasClient([
      {
        id: "metro",
        ingredient_id: "chk-1",
        alias_name: "CHK BREADED",
        normalized_alias: "chicken breaded",
        supplier_name: "Metro",
        confidence: 10,
        confirmed_by_user: true,
      },
    ]);

    const { error } = await upsertConfirmedAlias({
      ingredientId: "chk-2",
      aliasName: "CHK BREADED",
      normalizedAlias: "chicken breaded",
      supplierName: "Continente",
      supabase: client,
      manualConfirmation: true,
    });

    expect(error).toBeNull();
    expect(client._state.deletedIds).toHaveLength(0);
    expect(client._state.rows).toHaveLength(2);
    expect(detectAliasOwnershipCollisions(client._state.rows)).toHaveLength(0);
  });

  it("Mozzarella Julienne: resolves known VL collision on confirm", async () => {
    const client = createMockAliasClient([
      {
        id: "5ec7b0f7-f87a-46c5-b11c-b151efd130b0",
        ingredient_id: "2a99cecd-08fb-48d5-87cf-cc9ea5282a6d",
        alias_name: mozzarellaAlias,
        normalized_alias: mozzarellaNorm,
        supplier_name: mammafiore,
        confidence: 10,
        confirmed_by_user: true,
      },
      {
        id: "26ff7bd7-6846-42f7-a6c6-4efc941df4e1",
        ingredient_id: "5e9e7f89-7141-44f7-b8d4-bc92bad9bc36",
        alias_name: mozzarellaAlias,
        normalized_alias: mozzarellaNorm,
        supplier_name: mammafiore,
        confidence: 10,
        confirmed_by_user: true,
      },
    ]);

    expect(detectAliasOwnershipCollisions(client._state.rows)).toHaveLength(1);

    const { error } = await upsertConfirmedAlias({
      ingredientId: "5e9e7f89-7141-44f7-b8d4-bc92bad9bc36",
      aliasName: mozzarellaAlias,
      normalizedAlias: mozzarellaNorm,
      supplierName: mammafiore,
      supabase: client,
      manualConfirmation: true,
    });

    expect(error).toBeNull();
    expect(client._state.deletedIds).toContain("5ec7b0f7-f87a-46c5-b11c-b151efd130b0");
    expect(detectAliasOwnershipCollisions(client._state.rows)).toHaveLength(0);
    expect(client._state.rows.every((r) => r.ingredient_id === "5e9e7f89-7141-44f7-b8d4-bc92bad9bc36")).toBe(
      true,
    );
  });

  it("Prosciutto confirm does not disturb unrelated aliases", async () => {
    const client = createMockAliasClient([
      {
        id: "mozza",
        ingredient_id: "julienne",
        alias_name: mozzarellaAlias,
        normalized_alias: mozzarellaNorm,
        supplier_name: mammafiore,
        confidence: 10,
        confirmed_by_user: true,
      },
      {
        id: "mortadella",
        ingredient_id: "mortadella",
        alias_name: "Rigamonti - Mortadella",
        normalized_alias: "mortadella",
        supplier_name: mammafiore,
        confidence: 10,
        confirmed_by_user: true,
      },
    ]);

    const { error } = await upsertConfirmedAlias({
      ingredientId: "prosciutto",
      aliasName: "Rovagnati - Assaporami Prosciutto Cotto Scelto HC 4,3-4,5kg",
      normalizedAlias: "assaporami prosciutto cotto sceltohc",
      supplierName: mammafiore,
      supabase: client,
      manualConfirmation: true,
    });

    expect(error).toBeNull();
    expect(client._state.deletedIds).toHaveLength(0);
    expect(client._state.rows).toHaveLength(3);
    expect(detectAliasOwnershipCollisions(client._state.rows)).toHaveLength(0);
  });
});
