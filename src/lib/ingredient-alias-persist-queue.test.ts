import { describe, expect, it } from "vitest";
import {
  applyManualIngredientCorrection,
  persistManualIngredientCorrection,
} from "./ingredient-correction-memory";
import type { AppSupabaseClient } from "./ingredient-alias-memory";
import {
  buildIngredientAliasLookupKey,
  lookupIngredientIdFromAliasMap,
} from "./ingredient-alias-lookup";
import { buildOverrideKeysFromInvoiceLine } from "./ingredient-match-override";
import {
  createIngredientAliasPersistQueue,
  mergeConfirmedAliasMapsAfterReload,
} from "./ingredient-alias-persist-queue";
import type { IngredientAliasMap } from "./ingredient-canonical";

function createMockAliasSupabase() {
  const insertCalls: Record<string, unknown>[] = [];
  const supabase = {
    from(table: string) {
      if (table !== "ingredient_aliases") throw new Error(`unexpected table ${table}`);
      return {
        select() {
          return {
            eq() {
              return {
                eq() {
                  return {
                    is() {
                      return { maybeSingle: async () => ({ data: null, error: null }) };
                    },
                    eq() {
                      return { maybeSingle: async () => ({ data: null, error: null }) };
                    },
                  };
                },
              };
            },
          };
        },
        insert(payload: Record<string, unknown>) {
          insertCalls.push(payload);
          return Promise.resolve({ error: null });
        },
        update() {
          return { eq: () => Promise.resolve({ error: null }) };
        },
      };
    },
  } as unknown as AppSupabaseClient;
  return { supabase, insertCalls };
}

describe("ingredient alias persist queue", () => {
  const supplier = "Metro";
  const lines = ["TOMATE CHERRY 500G", "BACON FATIADO 1KG", "QUEIJO MOZARELLA 2KG"] as const;

  it("mergeConfirmedAliasMapsAfterReload lets DB overwrite session keys", () => {
    const session = { "metro::tomate": "old-id" };
    const db = { "metro::tomate": "new-id", "metro::bacon": "bac-id" };
    expect(mergeConfirmedAliasMapsAfterReload(session, db)).toEqual({
      "metro::tomate": "new-id",
      "metro::bacon": "bac-id",
    });
  });

  it("serializes three rapid manual persists without losing prior keys", async () => {
    const { supabase } = createMockAliasSupabase();
    let map: IngredientAliasMap = {};
    const queue = createIngredientAliasPersistQueue();

    await Promise.all(
      lines.map((itemName) =>
        queue.enqueue(async () => {
          const snapshot = map;
          const { applied, error } = await persistManualIngredientCorrection({
            itemName,
            ingredientId: `ing-${itemName}`,
            ingredientName: itemName,
            supplierName: supplier,
            confirmedAliases: snapshot,
            supabase,
          });
          expect(error).toBeNull();
          expect(applied).not.toBeNull();
          map = applied!.nextConfirmedAliases;
        }),
      ),
    );

    for (const itemName of lines) {
      const keys = buildOverrideKeysFromInvoiceLine(itemName, supplier)!;
      expect(
        lookupIngredientIdFromAliasMap(map, keys.rawNormalized, supplier, itemName),
      ).toBe(`ing-${itemName}`);
    }
  });

  it("documents unserialized concurrent persists losing earlier keys", async () => {
    const { supabase } = createMockAliasSupabase();
    let sharedMap: IngredientAliasMap = {};

    await Promise.all(
      lines.map((itemName) =>
        persistManualIngredientCorrection({
          itemName,
          ingredientId: `ing-${itemName}`,
          ingredientName: itemName,
          supplierName: supplier,
          confirmedAliases: sharedMap,
          supabase,
        }).then(({ applied }) => {
          if (applied) sharedMap = applied.nextConfirmedAliases;
        }),
      ),
    );

    const hits = lines.filter((itemName) => {
      const keys = buildOverrideKeysFromInvoiceLine(itemName, supplier)!;
      return (
        lookupIngredientIdFromAliasMap(sharedMap, keys.rawNormalized, supplier, itemName) ===
        `ing-${itemName}`
      );
    });

    expect(hits.length).toBeLessThan(lines.length);
  });

  it("unmatch reject then rematch keeps distinct keys when serialized", async () => {
    const { supabase } = createMockAliasSupabase();
    let map: IngredientAliasMap = {};
    const queue = createIngredientAliasPersistQueue();
    const lineA = lines[0];
    const lineB = lines[1];

    await queue.enqueue(async () => {
      const first = await persistManualIngredientCorrection({
        itemName: lineA,
        ingredientId: "ing-a",
        ingredientName: "A",
        supplierName: supplier,
        confirmedAliases: map,
        supabase,
      });
      map = first.applied!.nextConfirmedAliases;
    });

    await queue.enqueue(async () => {
      const second = await persistManualIngredientCorrection({
        itemName: lineB,
        ingredientId: "ing-b",
        ingredientName: "B",
        supplierName: supplier,
        confirmedAliases: map,
        supabase,
      });
      map = second.applied!.nextConfirmedAliases;
    });

    const keysA = buildOverrideKeysFromInvoiceLine(lineA, supplier)!;
    const keysB = buildOverrideKeysFromInvoiceLine(lineB, supplier)!;
    expect(lookupIngredientIdFromAliasMap(map, keysA.rawNormalized, supplier, lineA)).toBe("ing-a");
    expect(lookupIngredientIdFromAliasMap(map, keysB.rawNormalized, supplier, lineB)).toBe("ing-b");

    const rematch = applyManualIngredientCorrection(
      {
        itemName: lineA,
        ingredientId: "ing-a2",
        ingredientName: "A2",
        supplierName: supplier,
      },
      map,
    );
    expect(rematch).not.toBeNull();
    map = rematch!.nextConfirmedAliases;
    expect(lookupIngredientIdFromAliasMap(map, keysA.rawNormalized, supplier, lineA)).toBe("ing-a2");
    expect(lookupIngredientIdFromAliasMap(map, keysB.rawNormalized, supplier, lineB)).toBe("ing-b");
  });
});

describe("sequential manual matches (chained map)", () => {
  it("retains all three line keys when map is chained between persists", async () => {
    const { supabase } = createMockAliasSupabase();
    const supplier = "Snack Supplier";
    const lines = ["LINE ALPHA 1KG", "LINE BETA 2KG", "LINE GAMMA 3KG"] as const;

    let confirmedAliases: IngredientAliasMap = {};
    for (const itemName of lines) {
      const { applied, error } = await persistManualIngredientCorrection({
        itemName,
        ingredientId: `id-${itemName}`,
        ingredientName: itemName,
        supplierName: supplier,
        confirmedAliases,
        supabase,
      });
      expect(error).toBeNull();
      confirmedAliases = applied!.nextConfirmedAliases;
    }

    for (const itemName of lines) {
      const keys = buildOverrideKeysFromInvoiceLine(itemName, supplier)!;
      const lookupKey = buildIngredientAliasLookupKey(keys.rawNormalized, supplier);
      expect(confirmedAliases[lookupKey]).toBe(`id-${itemName}`);
    }
  });
});
