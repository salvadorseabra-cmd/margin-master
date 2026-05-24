import { describe, expect, it } from "vitest";
import {
  loadPersistedIngredientAliasesForCatalogReview,
  resolveCatalogReviewInvoiceDate,
} from "./catalog-review-persisted-aliases";

describe("resolveCatalogReviewInvoiceDate", () => {
  it("prefers invoice_date over created_at", () => {
    expect(
      resolveCatalogReviewInvoiceDate({
        invoice_date: "2024-06-15",
        created_at: "2024-01-01T00:00:00.000Z",
      }),
    ).toEqual({ invoiceDate: "2024-06-15", invoiceDateSource: "invoice_date" });
  });

  it("falls back to invoice created_at when invoice_date is null", () => {
    expect(
      resolveCatalogReviewInvoiceDate({
        invoice_date: null,
        created_at: "2024-03-20T08:00:00.000Z",
      }),
    ).toEqual({ invoiceDate: "2024-03-20", invoiceDateSource: "invoice_created_at" });
  });
});

describe("loadPersistedIngredientAliasesForCatalogReview", () => {
  it("returns only aliases whose ingredient_id matches the requested ingredient", async () => {
    const allAliasRows = [
      {
        id: "alias-a",
        ingredient_id: "ing-a",
        alias_name: "PALHA SNACK",
        supplier_name: null,
      },
      {
        id: "alias-b",
        ingredient_id: "ing-b",
        alias_name: "OLEO GIRASSOL OLIVEIRA DA SERRA 1L",
        supplier_name: "Metro",
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
        throw new Error(`unexpected table ${table}`);
      },
    };

    const rows = await loadPersistedIngredientAliasesForCatalogReview(
      client as never,
      "ing-a",
      "user-1",
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]?.aliasName).toBe("PALHA SNACK");
    expect(rows.every((row) => row.ingredientId === "ing-a")).toBe(true);
    expect(rows.some((row) => row.aliasName.includes("OLEO"))).toBe(false);
    expect(rows[0]?.invoiceDate).toBeNull();
    expect(rows[0]?.invoiceDateSource).toBeNull();
    expect(rows[0]?.invoiceLineId).toBeNull();
    expect(rows[0]?.invoiceId).toBeNull();
  });

  it("returns every alias row for the ingredient with real schema columns only", async () => {
    const aliasRows = [
      {
        id: "alias-linked",
        ingredient_id: "ing-a",
        alias_name: "CHK BREADED",
        supplier_name: "Metro",
      },
      {
        id: "alias-unlinked",
        ingredient_id: "ing-a",
        alias_name: "PALHA SNACK",
        supplier_name: "Continente",
      },
      {
        id: "alias-no-supplier",
        ingredient_id: "ing-a",
        alias_name: "BATATA FRITA",
        supplier_name: null,
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
              eq: () => ({
                order: async () => ({ data: aliasRows, error: null }),
              }),
            }),
          };
        }
        throw new Error(`unexpected table ${table}`);
      },
    };

    const rows = await loadPersistedIngredientAliasesForCatalogReview(
      client as never,
      "ing-a",
      "user-1",
    );

    expect(rows).toHaveLength(3);
    expect(rows.map((row) => row.id)).toEqual([
      "alias-linked",
      "alias-unlinked",
      "alias-no-supplier",
    ]);
    expect(rows.find((row) => row.id === "alias-unlinked")).toMatchObject({
      invoiceLineId: null,
      invoiceDate: null,
      invoiceDateSource: null,
      supplierName: "Continente",
    });
    expect(rows.find((row) => row.id === "alias-linked")).toMatchObject({
      supplierName: "Metro",
      invoiceLineId: null,
      invoiceId: null,
      invoiceDate: null,
      invoiceDateSource: null,
    });
  });

  it("returns empty when ingredient is not owned", async () => {
    const client = {
      from: (table: string) => ({
        select: () => ({
          eq: () => ({
            eq: () => ({
              maybeSingle: async () =>
                table === "ingredients" ? { data: null, error: null } : { data: null, error: null },
            }),
          }),
        }),
      }),
    };

    await expect(
      loadPersistedIngredientAliasesForCatalogReview(client as never, "ing-x", "user-1"),
    ).resolves.toEqual([]);
  });
});
