import { describe, expect, it } from "vitest";
import {
  applyManualIngredientCorrection,
  persistManualIngredientCorrection,
} from "./ingredient-correction-memory";
import type { AppSupabaseClient } from "./ingredient-alias-memory";
import {
  buildConfirmedAliasMapFromRows,
  type ConfirmedIngredientAliasRow,
} from "./ingredient-alias-memory";
import {
  buildIngredientAliasLookupKey,
  lookupIngredientIdFromAliasMap,
  rememberAliasInMap,
  rememberConfirmedAliasInMap,
} from "./ingredient-alias-lookup";
import { buildOverrideKeysFromInvoiceLine } from "./ingredient-match-override";

describe("ingredient alias lookup", () => {
  it("builds supplier-scoped and global keys", () => {
    expect(buildIngredientAliasLookupKey("oleo girassol", "Continente")).toMatch(
      /^continente::oleo girassol$/i,
    );
    expect(buildIngredientAliasLookupKey("oleo girassol", null)).toBe("oleo girassol");
  });

  it("prefers supplier-scoped alias over global", () => {
    const supplierKey = buildIngredientAliasLookupKey("tomate cherry", "Supplier A");
    const aliases = {
      [supplierKey]: "tom-supplier",
      "tomate cherry": "tom-global",
    };
    expect(
      lookupIngredientIdFromAliasMap(aliases, "tomate cherry", "Supplier A"),
    ).toBe("tom-supplier");
    expect(lookupIngredientIdFromAliasMap(aliases, "tomate cherry", null)).toBe("tom-global");
  });

  it("remembers aliases with the same key scheme used for lookup", () => {
    const next = rememberAliasInMap({}, "ketchup heinz", "ketchup-1", "Metro");
    const key = buildIngredientAliasLookupKey("ketchup heinz", "Metro");
    expect(next[key]).toBe("ketchup-1");
  });

  it("remembers supplier and global keys for shorthand corrections", () => {
    const next = rememberConfirmedAliasInMap(
      {},
      "CHK BREADED",
      "chicken breaded",
      "chk-1",
      "Metro",
    );
    expect(next["Metro::chicken breaded"]).toBe("chk-1");
    expect(next["chicken breaded"]).toBe("chk-1");
    expect(
      lookupIngredientIdFromAliasMap(next, "chicken breaded", "Metro", "CHK BREADED"),
    ).toBe("chk-1");
  });

  it("does not propagate confirmed palha alias to frita sibling on same invoice", () => {
    const supplier = "Snack Supplier";
    const palhaKeys = buildOverrideKeysFromInvoiceLine("BATATA PALHA 2KG SERVICE", supplier)!;
    const fritaKeys = buildOverrideKeysFromInvoiceLine("BATATA FRITA CORTE FINO 2KG", supplier)!;

    expect(palhaKeys.rawNormalized).not.toBe(fritaKeys.rawNormalized);

    const afterPalhaConfirm = rememberConfirmedAliasInMap(
      {},
      "BATATA PALHA 2KG SERVICE",
      palhaKeys.rawNormalized,
      "bat-palha",
      supplier,
    );

    expect(
      lookupIngredientIdFromAliasMap(
        afterPalhaConfirm,
        fritaKeys.rawNormalized,
        supplier,
        "BATATA FRITA CORTE FINO 2KG",
      ),
    ).toBeUndefined();
    expect(
      lookupIngredientIdFromAliasMap(
        afterPalhaConfirm,
        palhaKeys.rawNormalized,
        supplier,
        "BATATA PALHA 2KG SERVICE",
      ),
    ).toBe("bat-palha");
  });
});

describe("batata alias cluster independence", () => {
  const supplier = "Metro";
  const canonicalId = "bat-palha";
  const lines = [
    "BATATA PALHA 2KG SERVICE",
    "BATATA FRITA CORTE FINO 2KG",
    "PALHA SNACK FOOD SERVICE 2KG",
  ] as const;

  it("builds three distinct normalized alias keys for one canonical", () => {
    const keys = lines.map((line) => buildOverrideKeysFromInvoiceLine(line, supplier)!);
    const normalized = keys.map((k) => k.rawNormalized);
    expect(new Set(normalized).size).toBe(3);
  });

  it("persists three separate alias rows when confirming each line", async () => {
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

    let confirmedAliases = {};
    for (const itemName of lines) {
      const { applied, error } = await persistManualIngredientCorrection({
        itemName,
        ingredientId: canonicalId,
        ingredientName: "BATATA PALHA",
        supplierName: supplier,
        confirmedAliases,
        supabase,
      });
      expect(error).toBeNull();
      expect(applied).not.toBeNull();
      confirmedAliases = applied!.nextConfirmedAliases;
    }

    expect(insertCalls).toHaveLength(3);
    const normalizedAliases = insertCalls.map((row) => row.normalized_alias);
    expect(new Set(normalizedAliases).size).toBe(3);
    expect(insertCalls.every((row) => row.ingredient_id === canonicalId)).toBe(true);
  });

  it("reload map keeps distinct batata keys when DB normalized_alias was collapsed", () => {
    const rows: ConfirmedIngredientAliasRow[] = [
      {
        ingredient_id: "bat-palha",
        alias_name: "BATATA PALHA 2KG SERVICE",
        normalized_alias: "batata frita",
        supplier_name: "Metro",
      },
      {
        ingredient_id: "bat-frita",
        alias_name: "BATATA FRITA CORTE FINO 2KG",
        normalized_alias: "batata frita",
        supplier_name: "Metro",
      },
    ];

    const map = buildConfirmedAliasMapFromRows(rows);
    const palhaKeys = buildOverrideKeysFromInvoiceLine(rows[0].alias_name, rows[0].supplier_name)!;
    const fritaKeys = buildOverrideKeysFromInvoiceLine(rows[1].alias_name, rows[1].supplier_name)!;

    expect(palhaKeys.rawNormalized).toBe("batata palha");
    expect(fritaKeys.rawNormalized).toBe("batata frita");
    expect(
      lookupIngredientIdFromAliasMap(map, palhaKeys.rawNormalized, "Metro", rows[0].alias_name),
    ).toBe("bat-palha");
    expect(
      lookupIngredientIdFromAliasMap(map, fritaKeys.rawNormalized, "Metro", rows[1].alias_name),
    ).toBe("bat-frita");
  });

  it("only auto-resolves lines with their own confirmed alias key", () => {
    const palhaLine = lines[0];
    const fritaLine = lines[1];
    const palhaKeys = buildOverrideKeysFromInvoiceLine(palhaLine, supplier)!;

    const map = applyManualIngredientCorrection(
      {
        itemName: palhaLine,
        ingredientId: canonicalId,
        ingredientName: "BATATA PALHA",
        supplierName: supplier,
      },
      {},
    )!.nextConfirmedAliases;

    expect(
      lookupIngredientIdFromAliasMap(map, palhaKeys.rawNormalized, supplier, palhaLine),
    ).toBe(canonicalId);
    expect(
      lookupIngredientIdFromAliasMap(
        map,
        buildOverrideKeysFromInvoiceLine(fritaLine, supplier)!.rawNormalized,
        supplier,
        fritaLine,
      ),
    ).toBeUndefined();
  });
});
