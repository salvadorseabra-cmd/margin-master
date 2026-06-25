import { beforeEach, describe, expect, it } from "vitest";
import { stripInvoiceBrandPrefix } from "./canonical-ingredient-display-name";
import {
  buildConfirmedAliasMapFromRows,
  detectAliasOwnershipCollisions,
  upsertConfirmedAliasDualIdentity,
  type AppSupabaseClient,
} from "./ingredient-alias-memory";
import { lookupIngredientIdFromAliasMap } from "./ingredient-alias-lookup";
import { applyManualIngredientCorrection } from "./ingredient-correction-memory";
import {
  buildOverrideKeysFromInvoiceLine,
  clearIngredientMatchOverridesForTests,
  lookupIngredientMatchOverride,
  rememberIngredientMatchOverride,
} from "./ingredient-match-override";
import {
  buildOperationalIdentityAliasKey,
  clearOperationalAliasMemoryForTests,
} from "./ingredient-operational-alias-memory";

const PROSCIUTTO_LINE =
  "Rovagnati - Assaporami Prosciutto Cotto Scelto HC 4,3-4,5kg";
const PROSCIUTTO_RAW_KEY = "rovagnati assaporami prosciutto cotto sceltohc";
const PROSCIUTTO_OP_KEY = "assaporami prosciutto cotto sceltohc";
const PROSCIUTTO_ID = "b924480a-91f3-4aa2-9852-a900795a6f92";
const EMPOrio = "Emporio Italia";

const PELLEGRINO_LINE = "SanPellegrino - Acqua in vitro 75cl x 15ud";
const PELLEGRINO_ID = "50783e60-702f-42b2-bccd-0b6a98d7635f";

describe("Model D brand prefix strip", () => {
  it("strips commodity charcuterie prefixes", () => {
    expect(stripInvoiceBrandPrefix("Rovagnati - Prosciutto")).toBe("Prosciutto");
    expect(stripInvoiceBrandPrefix("De Cecco - Paccheri")).toBe("Paccheri");
  });

  it("does not strip San Pellegrino beverage brand", () => {
    expect(stripInvoiceBrandPrefix(PELLEGRINO_LINE)).toBe(PELLEGRINO_LINE);
  });

  it("buildOperationalIdentityAliasKey diverges from raw key for prefixed prosciutto", () => {
    const keys = buildOverrideKeysFromInvoiceLine(PROSCIUTTO_LINE, EMPOrio)!;
    expect(keys.rawNormalized).toBe(PROSCIUTTO_RAW_KEY);
    expect(keys.operationalIdentityKey).toBe(PROSCIUTTO_OP_KEY);
    expect(buildOperationalIdentityAliasKey(PROSCIUTTO_LINE)).toBe(PROSCIUTTO_OP_KEY);
  });
});

describe("Model D read path", () => {
  beforeEach(() => {
    clearIngredientMatchOverridesForTests();
    clearOperationalAliasMemoryForTests();
  });

  it("recovers Prosciutto via operational identity when raw alias misses", () => {
    const aliasMap = buildConfirmedAliasMapFromRows([
      {
        ingredient_id: PROSCIUTTO_ID,
        alias_name: "Assaporami Prosciutto Cotto Scelto HC 4,3-4,5kg",
        normalized_alias: PROSCIUTTO_OP_KEY,
        supplier_name: EMPOrio,
      },
    ]);

    const rawHit = lookupIngredientIdFromAliasMap(
      aliasMap,
      PROSCIUTTO_RAW_KEY,
      EMPOrio,
      PROSCIUTTO_LINE,
    );
    expect(rawHit).toBe(PROSCIUTTO_ID);

    rememberIngredientMatchOverride(
      "Assaporami Prosciutto Cotto Scelto HC 4,3-4,5kg",
      PROSCIUTTO_ID,
      "Prosciutto cotto scelto",
      EMPOrio,
    );
    const overrideHit = lookupIngredientMatchOverride(PROSCIUTTO_LINE, EMPOrio);
    expect(overrideHit?.canonicalIngredientId).toBe(PROSCIUTTO_ID);
  });

  it("keeps San Pellegrino keys unchanged (beverage exclusion)", () => {
    const keys = buildOverrideKeysFromInvoiceLine(PELLEGRINO_LINE, EMPOrio)!;
    expect(keys.operationalIdentityKey).toBe(keys.rawNormalized);
  });

  it("preserves Mortadella ingredient id with prefix line", () => {
    const mortadellaId = "9c853a47-82fe-4d6d-88bc-f0aa007e0a59";
    const line =
      "Rovagnati - Mortadella IGP 'Massima' con Pistacchio 1/2 - 3,5kg";
    const aliasMap = buildConfirmedAliasMapFromRows([
      {
        ingredient_id: mortadellaId,
        alias_name: line,
        normalized_alias: "mortadellaigp massimacon pistacchio",
        supplier_name: EMPOrio,
      },
    ]);
    expect(
      lookupIngredientIdFromAliasMap(aliasMap, "rovagnati mortadellaigp massimacon pistacchio", EMPOrio, line),
    ).toBe(mortadellaId);
  });
});

type MockAliasRow = {
  id: string;
  ingredient_id: string;
  alias_name: string;
  normalized_alias: string;
  supplier_name: string | null;
  confidence: number;
  confirmed_by_user: boolean;
};

function createDualWriteMockClient(initialRows: MockAliasRow[] = []) {
  const rows = initialRows.map((row) => ({ ...row }));
  const insertCalls: Record<string, unknown>[] = [];

  const client = {
    from(table: string) {
      if (table !== "ingredient_aliases") throw new Error(`unexpected table ${table}`);
      const filters: Array<(row: MockAliasRow) => boolean> = [];
      return {
        select() {
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
              const matches = rows.filter((row) => filters.every((fn) => fn(row)));
              return { data: matches[0] ?? null, error: null, status: 200 };
            },
            then(onFulfilled: (value: { data: MockAliasRow[]; error: null }) => unknown) {
              const matches = rows.filter((row) => filters.every((fn) => fn(row)));
              return Promise.resolve(onFulfilled({ data: matches, error: null }));
            },
          };
          return builder;
        },
        insert(payload: Record<string, unknown>) {
          insertCalls.push(payload);
          rows.push({
            id: `new-${rows.length + 1}`,
            ingredient_id: String(payload.ingredient_id),
            alias_name: String(payload.alias_name),
            normalized_alias: String(payload.normalized_alias),
            supplier_name: (payload.supplier_name as string | null) ?? null,
            confidence: Number(payload.confidence ?? 1),
            confirmed_by_user: Boolean(payload.confirmed_by_user),
          });
          return Promise.resolve({ error: null, data: null, status: 201, statusText: "Created" });
        },
        update() {
          return { eq: async () => ({ error: null, data: null, status: 200, statusText: "OK" }) };
        },
        delete() {
          return { eq: async () => ({ error: null }) };
        },
      };
    },
    _state: { rows, insertCalls },
  };

  return client as unknown as AppSupabaseClient & { _state: typeof client._state };
}

describe("Model D write path", () => {
  it("persistManualIngredientCorrection seeds both raw and operational keys in memory", () => {
    const applied = applyManualIngredientCorrection(
      {
        itemName: PROSCIUTTO_LINE,
        ingredientId: PROSCIUTTO_ID,
        ingredientName: "Prosciutto cotto scelto",
        supplierName: EMPOrio,
      },
      {},
    );
    expect(applied?.normalizedAlias).toBe(PROSCIUTTO_RAW_KEY);
    expect(applied?.operationalAliasKey).toBe(PROSCIUTTO_OP_KEY);
    expect(applied?.nextConfirmedAliases[`emporio italia::${PROSCIUTTO_RAW_KEY}`]).toBe(
      PROSCIUTTO_ID,
    );
    expect(applied?.nextConfirmedAliases[`emporio italia::${PROSCIUTTO_OP_KEY}`]).toBe(
      PROSCIUTTO_ID,
    );
  });

  it("upsertConfirmedAliasDualIdentity writes two rows when keys differ", async () => {
    const client = createDualWriteMockClient();
    const { error } = await upsertConfirmedAliasDualIdentity({
      ingredientId: PROSCIUTTO_ID,
      aliasName: PROSCIUTTO_LINE,
      rawNormalizedAlias: PROSCIUTTO_RAW_KEY,
      supplierName: EMPOrio,
      supabase: client,
      manualConfirmation: true,
    });

    expect(error).toBeNull();
    expect(client._state.insertCalls).toHaveLength(2);
    expect(client._state.rows.map((r) => r.normalized_alias).sort()).toEqual(
      [PROSCIUTTO_OP_KEY, PROSCIUTTO_RAW_KEY].sort(),
    );
    expect(detectAliasOwnershipCollisions(client._state.rows)).toHaveLength(0);
  });

  it("upsertConfirmedAliasDualIdentity writes one row when keys match (Pellegrino)", async () => {
    const keys = buildOverrideKeysFromInvoiceLine(PELLEGRINO_LINE, EMPOrio)!;
    const client = createDualWriteMockClient();
    const { error } = await upsertConfirmedAliasDualIdentity({
      ingredientId: PELLEGRINO_ID,
      aliasName: PELLEGRINO_LINE,
      rawNormalizedAlias: keys.rawNormalized,
      supplierName: EMPOrio,
      supabase: client,
      manualConfirmation: true,
    });

    expect(error).toBeNull();
    expect(client._state.insertCalls).toHaveLength(1);
  });
});
