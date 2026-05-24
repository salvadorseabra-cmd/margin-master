import { describe, expect, it } from "vitest";
import {
  buildCatalogReviewAliasRows,
  buildCatalogReviewInvoiceAliasNames,
  formatCatalogReviewAliasContextLine,
} from "./catalog-review-alias-rows";
import type { CatalogReviewPersistedAliasRow } from "./catalog-review-persisted-aliases";

function persistedAlias(
  partial: Partial<CatalogReviewPersistedAliasRow> & { id: string; aliasName: string },
): CatalogReviewPersistedAliasRow {
  return {
    ingredientId: "ing-palha",
    supplierName: null,
    invoiceLineId: null,
    invoiceId: null,
    invoiceDate: null,
    invoiceDateSource: null,
    ...partial,
  };
}

describe("buildCatalogReviewAliasRows", () => {
  it("maps persisted aliases with supplier and invoice date when joined", () => {
    const rows = buildCatalogReviewAliasRows({
      persistedAliases: [
        persistedAlias({
          id: "alias-1",
          aliasName: "CHK BREADED",
          supplierName: "Metro",
          invoiceLineId: "item-1",
          invoiceId: "inv-1",
          invoiceDate: "2024-06-15",
          invoiceDateSource: "invoice_date",
        }),
      ],
      catalogIngredientId: "ing-palha",
      catalogDisplayName: "Palha",
    });

    expect(rows).toEqual([
      {
        key: "alias-1",
        aliasId: "alias-1",
        invoiceWording: "CHK BREADED",
        supplierName: "Metro",
        invoiceDate: expect.any(String),
        invoiceDateSource: "invoice_date",
        invoiceLineId: "item-1",
        invoiceId: "inv-1",
        persistedIngredientId: "ing-palha",
        persistedIngredientName: "Palha",
      },
    ]);
    expect(rows[0]).not.toHaveProperty("suggestedIngredientId");
    expect(rows[0]).not.toHaveProperty("suggestedIngredientName");
  });

  it("includes all persisted aliases for the ingredient, including rows without invoice_item_id", () => {
    const rows = buildCatalogReviewAliasRows({
      persistedAliases: [
        persistedAlias({
          id: "alias-with-invoice",
          aliasName: "CHK BREADED",
          supplierName: "Metro",
          invoiceLineId: "item-1",
          invoiceId: "inv-1",
          invoiceDate: "2024-06-15",
          invoiceDateSource: "invoice_date",
        }),
        persistedAlias({
          id: "alias-no-invoice-fk",
          aliasName: "PALHA SNACK",
          supplierName: "Continente",
        }),
        persistedAlias({
          id: "alias-orphan-invoice-fk",
          aliasName: "BATATA FRITA",
          invoiceLineId: "missing-item",
        }),
      ],
      catalogIngredientId: "ing-palha",
      catalogDisplayName: "Palha",
    });

    expect(rows).toHaveLength(3);
    expect(rows.map((row) => row.aliasId)).toEqual([
      "alias-with-invoice",
      "alias-no-invoice-fk",
      "alias-orphan-invoice-fk",
    ]);
    expect(rows.find((row) => row.aliasId === "alias-no-invoice-fk")).toMatchObject({
      invoiceLineId: null,
      invoiceId: null,
      invoiceDate: null,
      supplierName: "Continente",
    });
    expect(rows.find((row) => row.aliasId === "alias-orphan-invoice-fk")).toMatchObject({
      invoiceLineId: "missing-item",
      invoiceId: null,
      invoiceDate: null,
    });
  });

  it("omits invoice date when alias has no invoice join", () => {
    const rows = buildCatalogReviewAliasRows({
      persistedAliases: [
        persistedAlias({
          id: "alias-1",
          aliasName: "CHK BREADED",
          supplierName: "Metro",
        }),
      ],
      catalogIngredientId: "ing-palha",
      catalogDisplayName: "Palha",
    });

    expect(rows[0]?.supplierName).toBe("Metro");
    expect(rows[0]?.invoiceDate).toBeNull();
    expect(formatCatalogReviewAliasContextLine(rows[0]!.supplierName, rows[0]!.invoiceDate)).toBe(
      "Metro",
    );
  });

  it("excludes aliases linked to a different ingredient_id", () => {
    const rows = buildCatalogReviewAliasRows({
      persistedAliases: [
        persistedAlias({
          id: "alias-1",
          aliasName: "PALHA SNACK",
          ingredientId: "ing-palha",
        }),
        persistedAlias({
          id: "alias-2",
          aliasName: "BAC STRK",
          ingredientId: "ing-bacon",
        }),
        persistedAlias({
          id: "alias-3",
          aliasName: "OLEO GIRASSOL OLIVEIRA DA SERRA 1L",
          ingredientId: "ing-oil",
        }),
      ],
      catalogIngredientId: "ing-palha",
      catalogDisplayName: "Palha",
    });

    expect(rows.map((row) => row.invoiceWording)).toEqual(["PALHA SNACK"]);
    expect(rows.every((row) => row.persistedIngredientId === "ing-palha")).toBe(true);
    expect(rows.some((row) => row.invoiceWording.includes("OLEO"))).toBe(false);
  });

  it("returns no rows when persisted aliases are empty", () => {
    expect(
      buildCatalogReviewAliasRows({
        persistedAliases: [],
        catalogIngredientId: "ing-palha",
        catalogDisplayName: "Palha",
      }),
    ).toEqual([]);
  });

  it("never fabricates rows from invoice scan names without persisted alias ids", () => {
    const rows = buildCatalogReviewAliasRows({
      persistedAliases: [],
      catalogIngredientId: "ing-iceberg",
      catalogDisplayName: "Alface iceberg",
    });

    expect(rows).toEqual([]);
    expect(rows.some((row) => row.invoiceWording === "BATATA FRITA")).toBe(false);
  });
});

describe("buildCatalogReviewInvoiceAliasNames", () => {
  it("returns sorted alias names for the selected canonical only", () => {
    expect(
      buildCatalogReviewInvoiceAliasNames(
        [
          persistedAlias({ id: "a1", aliasName: "Z", ingredientId: "ing-1" }),
          persistedAlias({ id: "a2", aliasName: "A", ingredientId: "ing-1" }),
          persistedAlias({ id: "a3", aliasName: "OTHER", ingredientId: "ing-2" }),
        ],
        "ing-1",
      ),
    ).toEqual(["A", "Z"]);
  });
});

describe("formatCatalogReviewAliasContextLine", () => {
  it("joins supplier and date when both exist", () => {
    expect(formatCatalogReviewAliasContextLine("Metro", "Jun 15, 2024")).toBe(
      "Metro · Jun 15, 2024",
    );
    expect(formatCatalogReviewAliasContextLine("Metro", null)).toBe("Metro");
  });
});
