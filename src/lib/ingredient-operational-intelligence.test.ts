import { describe, expect, it, beforeEach } from "vitest";
import {
  buildLatestConfirmedPurchaseAtByIngredientIdFromScan,
  buildLatestPurchaseGlanceByIngredientIdFromScan,
  buildMatchedInvoiceProductsFromScan,
  buildOperationalProfileFromAliasRows,
  buildUsableQuantityPreview,
  clearIngredientMatchedInvoiceProductsCache,
  formatPurchaseStructureSummary,
  loadIngredientOperationalProfile,
} from "@/lib/ingredient-operational-intelligence";
import { parsePurchaseStructureFromText } from "@/lib/stock-normalization";

const palhaCatalog = [{ id: "bat-palha", name: "BATATA PALHA" }];

describe("ingredient-operational-intelligence", () => {
  beforeEach(() => {
    clearIngredientMatchedInvoiceProductsCache();
  });

  it("buildMatchedInvoiceProductsFromScan includes lines resolving to target ingredient", () => {
    const result = buildMatchedInvoiceProductsFromScan(
      "bat-palha",
      palhaCatalog,
      {},
      [
        {
          id: "line-1",
          invoice_id: "inv-1",
          name: "BATATA PALHA EXTRA FINA FS 2KG",
          quantity: 2,
          unit: "un",
          unit_price: 10,
          total: 20,
          created_at: "2026-02-01T00:00:00.000Z",
          invoices: { invoice_date: "2026-02-10", supplier_name: "Metro" },
        },
        {
          id: "line-2",
          invoice_id: "inv-2",
          name: "PALHA AUCHAN 2KG",
          quantity: 1,
          unit: "un",
          unit_price: 8,
          total: 8,
          created_at: "2026-01-15T00:00:00.000Z",
          invoices: { invoice_date: "2026-01-20", supplier_name: "Auchan" },
        },
      ],
    );

    expect(result.products).toHaveLength(2);

    const scanRows = [
      {
        id: "line-1",
        invoice_id: "inv-1",
        name: "BATATA PALHA EXTRA FINA FS 2KG",
        quantity: 2,
        unit: "un",
        unit_price: 10,
        total: 20,
        created_at: "2026-02-01T00:00:00.000Z",
        invoices: { invoice_date: "2026-02-10", supplier_name: "Metro" },
      },
      {
        id: "line-2",
        invoice_id: "inv-2",
        name: "PALHA AUCHAN 2KG",
        quantity: 1,
        unit: "un",
        unit_price: 8,
        total: 8,
        created_at: "2026-01-15T00:00:00.000Z",
        invoices: { invoice_date: "2026-01-20", supplier_name: "Auchan" },
      },
    ];
    const latestById = buildLatestConfirmedPurchaseAtByIngredientIdFromScan(
      palhaCatalog,
      {},
      scanRows,
    );
    const glanceById = buildLatestPurchaseGlanceByIngredientIdFromScan(palhaCatalog, {}, scanRows);
    expect(glanceById["bat-palha"]?.supplierLabel).toBe("Metro");
    expect(glanceById["bat-palha"]?.lastPurchaseAt).toBe("2026-02-10");
    expect(latestById["bat-palha"]).toBe("2026-02-10");
    expect(result.products.map((row) => row.itemName)).toEqual([
      "BATATA PALHA EXTRA FINA FS 2KG",
      "PALHA AUCHAN 2KG",
    ]);
    expect(result.products[0]?.invoiceDate).toBe("2026-02-10");
    expect(result.products[0]?.matchBucket).toBeTruthy();
    expect(result.products[0]?.matchSourceHeadline).toBeTruthy();
    expect(result.canonicalName).toBe("Batata palha");
  });

  it("buildMatchedInvoiceProductsFromScan excludes lines resolving to another ingredient", () => {
    const result = buildMatchedInvoiceProductsFromScan(
      "bat-palha",
      palhaCatalog,
      {},
      [
        {
          id: "line-cheddar",
          invoice_id: "inv-3",
          name: "QUEIJO CHEDDAR AUCHAN 1KG",
          quantity: 1,
          unit: "un",
          unit_price: 12,
          total: 12,
          created_at: "2026-03-01T00:00:00.000Z",
          invoices: { invoice_date: "2026-03-05", supplier_name: "Auchan" },
        },
      ],
    );

    expect(result.products).toEqual([]);
  });

  it("buildMatchedInvoiceProductsFromScan returns empty products for zero matches", () => {
    const result = buildMatchedInvoiceProductsFromScan("bat-palha", palhaCatalog, {}, []);
    expect(result.products).toEqual([]);
    expect(result.truncated).toBe(false);
  });

  it("buildMatchedInvoiceProductsFromScan excludes oleo lines when scanning alface iceberg", () => {
    const catalog = [
      { id: "ing-alface", name: "ALFACE ICEBERG" },
      { id: "ing-oil", name: "OLEO GIRASSOL FULA 1L" },
    ];
    const result = buildMatchedInvoiceProductsFromScan("ing-alface", catalog, {}, [
      {
        id: "line-oil",
        invoice_id: "inv-oil",
        name: "OLEO GIRASSOL VAQUEIRO 1L",
        quantity: 1,
        unit: "un",
        unit_price: 4.5,
        total: 4.5,
        created_at: "2026-03-01T00:00:00.000Z",
        invoices: { invoice_date: "2026-03-02", supplier_name: "Metro" },
      },
      {
        id: "line-alface",
        invoice_id: "inv-alface",
        name: "ALFACE ICEBERG INTEIRA",
        quantity: 2,
        unit: "un",
        unit_price: 2.1,
        total: 4.2,
        created_at: "2026-02-01T00:00:00.000Z",
        invoices: { invoice_date: "2026-02-10", supplier_name: "Metro" },
      },
    ]);

    expect(result.products.map((row) => row.itemName)).toEqual(["ALFACE ICEBERG INTEIRA"]);
    expect(result.products.every((row) => row.matchedIngredientId === "ing-alface")).toBe(
      true,
    );
  });

  it("buildMatchedInvoiceProductsFromScan ignores confirmed aliases for other ingredients", () => {
    const catalog = [
      { id: "ing-alface", name: "ALFACE ICEBERG" },
      { id: "ing-oil", name: "OLEO GIRASSOL FULA 1L" },
    ];
    const result = buildMatchedInvoiceProductsFromScan(
      "ing-alface",
      catalog,
      { "oleo girassol": "ing-oil" },
      [
        {
          id: "line-oil",
          invoice_id: "inv-oil",
          name: "OLEO GIRASSOL VAQUEIRO 1L",
          quantity: 1,
          unit: "un",
          unit_price: 4.5,
          total: 4.5,
          created_at: "2026-03-01T00:00:00.000Z",
          invoices: { invoice_date: "2026-03-02", supplier_name: "Metro" },
        },
      ],
    );

    expect(result.products).toEqual([]);
  });

  it("buildMatchedInvoiceProductsFromScan dedupes by invoice item id", () => {
    const row = {
      id: "line-dup",
      invoice_id: "inv-dup",
      name: "BATATA PALHA 2KG",
      quantity: 1,
      unit: "un",
      unit_price: 5,
      total: 5,
      created_at: "2026-02-01T00:00:00.000Z",
      invoices: { invoice_date: "2026-02-01", supplier_name: null },
    };
    const result = buildMatchedInvoiceProductsFromScan("bat-palha", palhaCatalog, {}, [row, row]);
    expect(result.products).toHaveLength(1);
  });

  it("buildOperationalProfileFromAliasRows lists alias rows with match metadata", () => {
    const profile = buildOperationalProfileFromAliasRows("ing-1", [
      {
        id: "alias-1",
        ingredient_id: "ing-1",
        alias_name: "BAT PALHA 1KG",
        normalized_alias: "batata palha",
        supplier_name: "Metro",
        confidence: 10,
        confirmed_by_user: true,
        created_at: "2026-01-10T12:00:00.000Z",
      },
    ]);

    expect(profile.ingredientId).toBe("ing-1");
    expect(profile.aliases).toHaveLength(1);
    expect(profile.aliases[0]).toMatchObject({
      ingredientId: "ing-1",
      aliasName: "BAT PALHA 1KG",
      supplierName: "Metro",
      matchSource: "confirmed_alias",
      matchSourceLabel: "Alias confirmado",
      confirmedByUser: true,
    });
    expect(profile.aliases[0]?.purchaseStructureSummary).toBeTruthy();
  });

  it("buildOperationalProfileFromAliasRows returns empty aliases for empty input", () => {
    const profile = buildOperationalProfileFromAliasRows("ing-2", []);
    expect(profile.aliases).toEqual([]);
    expect(profile.memoryKeys).toEqual([]);
  });

  it("buildOperationalProfileFromAliasRows only includes aliases for the target ingredient", () => {
    const profile = buildOperationalProfileFromAliasRows("ing-a", [
      {
        id: "alias-a",
        ingredient_id: "ing-a",
        alias_name: "ALFACE ICEBERG",
        normalized_alias: "alface iceberg",
        supplier_name: null,
        confidence: 10,
        confirmed_by_user: true,
        created_at: "2026-01-10T12:00:00.000Z",
      },
      {
        id: "alias-b",
        ingredient_id: "ing-b",
        alias_name: "OLEO GIRASSOL",
        normalized_alias: "oleo girassol",
        supplier_name: null,
        confidence: 10,
        confirmed_by_user: true,
        created_at: "2026-01-11T12:00:00.000Z",
      },
      {
        id: "alias-c",
        ingredient_id: "ing-c",
        alias_name: "BATATA FRITA",
        normalized_alias: "batata frita",
        supplier_name: null,
        confidence: 10,
        confirmed_by_user: true,
        created_at: "2026-01-12T12:00:00.000Z",
      },
    ]);

    expect(profile.aliases).toHaveLength(1);
    expect(profile.aliases[0]?.aliasName).toBe("ALFACE ICEBERG");
    expect(profile.aliases[0]?.ingredientId).toBe("ing-a");
  });

  it("buildOperationalProfileFromAliasRows scopes memory keys to the target ingredient", () => {
    const profile = buildOperationalProfileFromAliasRows(
      "ing-a",
      [
        {
          id: "alias-a",
          ingredient_id: "ing-a",
          alias_name: "ALFACE ICEBERG",
          normalized_alias: "alface iceberg",
          supplier_name: null,
          confidence: 10,
          confirmed_by_user: true,
          created_at: "2026-01-10T12:00:00.000Z",
        },
      ],
      [],
      {
        "alface iceberg": "ing-a",
        "oleo girassol": "ing-b",
        "batata frita": "ing-c",
      },
    );

    expect(profile.memoryKeys.map((key) => key.lookupKey)).not.toContain("oleo girassol");
    expect(profile.memoryKeys.map((key) => key.lookupKey)).not.toContain("batata frita");
  });

  it("links latest invoice usage when line text matches alias", () => {
    const profile = buildOperationalProfileFromAliasRows(
      "ing-3",
      [
        {
          id: "alias-2",
          ingredient_id: "ing-3",
          alias_name: "MAYO 1 pack x 250 g",
          normalized_alias: "maionese",
          supplier_name: "makro",
          confidence: 10,
          confirmed_by_user: true,
          created_at: "2026-01-01T00:00:00.000Z",
        },
      ],
      [
        {
          name: "MAYO 1 pack x 250 g",
          quantity: 2,
          unit: "un",
          created_at: "2026-02-01T00:00:00.000Z",
          invoices: { invoice_date: "2026-02-15", supplier_name: "Makro" },
        },
      ],
    );

    expect(profile.aliases[0]?.lastInvoiceUsageDate).toBe("2026-02-15");
    expect(profile.aliases[0]?.sampleInvoiceLine).toMatchObject({
      name: "MAYO 1 pack x 250 g",
      quantity: 2,
      unit: "un",
    });
  });

  it("formatPurchaseStructureSummary and usable preview handle pack lines", () => {
    const structure = parsePurchaseStructureFromText("MAYO 1 pack x 250 g");
    expect(formatPurchaseStructureSummary(structure)).toContain("250");
    expect(buildUsableQuantityPreview("MAYO 1 pack x 250 g", 2, "un")).toBeTruthy();
  });

  it("loadIngredientOperationalProfile only loads aliases for the requested ingredient", async () => {
    const allAliasRows = [
      {
        id: "alias-a",
        ingredient_id: "ing-a",
        alias_name: "ALFACE ICEBERG",
        normalized_alias: "alface iceberg",
        supplier_name: null,
        confidence: 10,
        confirmed_by_user: true,
        created_at: "2026-01-10T12:00:00.000Z",
      },
      {
        id: "alias-b",
        ingredient_id: "ing-b",
        alias_name: "OLEO GIRASSOL",
        normalized_alias: "oleo girassol",
        supplier_name: null,
        confidence: 10,
        confirmed_by_user: true,
        created_at: "2026-01-11T12:00:00.000Z",
      },
    ];

    const client = {
      from: (table: string) => {
        if (table === "ingredients") {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  maybeSingle: async () => ({ data: { id: "ing-a" }, error: null }),
                }),
              }),
            }),
          };
        }
        if (table === "ingredient_aliases") {
          return {
            select: () => ({
              eq: (column: string, value: string) => ({
                order: async () => ({
                  data:
                    column === "ingredient_id"
                      ? allAliasRows.filter((row) => row.ingredient_id === value)
                      : allAliasRows,
                  error: null,
                }),
              }),
            }),
          };
        }
        if (table === "invoice_items") {
          return {
            select: () => ({
              order: () => ({
                limit: async () => ({ data: [], error: null }),
              }),
            }),
          };
        }
        throw new Error(`unexpected table ${table}`);
      },
    };

    const profile = await loadIngredientOperationalProfile(
      client as never,
      "ing-a",
      "user-1",
    );

    expect(profile.aliases).toHaveLength(1);
    expect(profile.aliases[0]?.aliasName).toBe("ALFACE ICEBERG");
    expect(profile.aliases.every((row) => row.ingredientId === "ing-a")).toBe(true);
  });

  it("loadIngredientOperationalProfile returns empty when ingredient is not owned", async () => {
    const client = {
      from: (table: string) => ({
        select: () => ({
          eq: () => ({
            eq: () => ({
              maybeSingle: async () =>
                table === "ingredients"
                  ? { data: null, error: null }
                  : { data: null, error: null },
            }),
          }),
        }),
      }),
    };

    await expect(
      loadIngredientOperationalProfile(client as never, "ing-x", "user-1"),
    ).resolves.toEqual({
      ingredientId: "ing-x",
      aliases: [],
      memoryKeys: [],
    });
  });
});
