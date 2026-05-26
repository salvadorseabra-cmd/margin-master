import { describe, expect, it } from "vitest";
import {
  buildRecentPurchases,
  buildRecognizedSupplierProducts,
  purchaseMemorySummary,
} from "@/lib/ingredient-purchase-memory";
import type {
  IngredientMatchedInvoiceProduct,
  IngredientOperationalAliasRow,
} from "@/lib/ingredient-operational-intelligence";

const baconAlias: IngredientOperationalAliasRow = {
  id: "alias-bacon",
  ingredientId: "ing-bacon",
  aliasName: "BAC STRK 1KG",
  normalizedAlias: "bacon",
  supplierName: "Metro",
  confidence: 10,
  matchSource: "confirmed_alias",
  matchSourceLabel: "Alias confirmado",
  confirmedByUser: true,
  createdAt: "2026-01-01T00:00:00.000Z",
  lastInvoiceUsageDate: null,
  invoiceId: null,
  sampleInvoiceLine: null,
  purchaseStructureSummary: null,
  usableQuantityPreview: null,
};

const potatoProduct = (
  overrides: Partial<IngredientMatchedInvoiceProduct> = {},
): IngredientMatchedInvoiceProduct => ({
  matchedIngredientId: "ing-bacon",
  itemId: "line-potato",
  itemName: "BAT SHOE 2.5KG",
  supplierName: "Makro",
  invoiceDate: "2026-03-01",
  chronologySourceType: "invoice_issue_date",
  invoiceId: "inv-1",
  invoiceCreatedAt: null,
  invoiceIssueDateRaw: "2026-03-01",
  itemCreatedAt: null,
  unitPrice: 12.5,
  lineTotal: 25,
  matchBucket: "matched",
  matchDisplayState: "matched",
  matchKind: "exact",
  confidenceLabel: "100%",
  matchSourceHeadline: "",
  matchSourceDetail: "",
  purchaseStructureSummary: null,
  normalizedUsableQuantityLabel: null,
  ...overrides,
});

describe("ingredient-purchase-memory", () => {
  it("dedupes recognized supplier product names from aliases and invoice lines", () => {
    const recognized = buildRecognizedSupplierProducts(
      "ing-bacon",
      "Bacon",
      [
        baconAlias,
        {
          ...baconAlias,
          id: "alias-other",
          ingredientId: "ing-other",
          aliasName: "OLEO GIRASSOL",
        },
      ],
      [
        potatoProduct(),
        potatoProduct({ itemId: "line-2", itemName: "BAC STRK 1KG" }),
      ],
    );

    expect(recognized.map((row) => row.name)).toEqual(["BAC STRK 1KG"]);
  });

  it("excludes invoice lines incompatible with canonical operational family", () => {
    const recognized = buildRecognizedSupplierProducts(
      "ing-bacon",
      "Bacon streaky",
      [baconAlias],
      [potatoProduct()],
    );
    const recent = buildRecentPurchases("ing-bacon", "Bacon streaky", [potatoProduct()]);

    expect(recognized.map((row) => row.name)).toEqual(["BAC STRK 1KG"]);
    expect(recent).toEqual([]);
  });

  it("buildRecentPurchases display date follows invoice issue date not item created_at", () => {
    const recent = buildRecentPurchases("ing-bacon", "Bacon", [
      potatoProduct({
        itemName: "BAC STRK CONTINENTE 1KG",
        supplierName: "Continente",
        invoiceDate: "2026-05-13",
        invoiceIssueDateRaw: "13/05/2026",
        chronologySourceType: "invoice_issue_date",
        itemCreatedAt: "2026-05-18T09:00:00.000Z",
        invoiceCreatedAt: "2026-05-18T08:00:00.000Z",
      }),
    ]);

    expect(recent[0]?.dateLabel).toMatch(/13/);
    expect(recent[0]?.dateLabel).not.toMatch(/18/);
  });

  it("buildRecentPurchases formats supplier, date, and unit price", () => {
    const recent = buildRecentPurchases("ing-bacon", "Bacon", [
      potatoProduct({
        itemName: "BAC STRK 1KG",
        supplierName: "metro",
        invoiceDate: "2026-02-15",
        unitPrice: 9.99,
      }),
    ]);

    expect(recent).toHaveLength(1);
    expect(recent[0]?.supplierLabel).toBe("Metro");
    expect(recent[0]?.dateLabel).toMatch(/2026/);
    expect(recent[0]?.priceLabel).toBe("€9.99");
  });

  it("purchaseMemorySummary describes counts", () => {
    expect(purchaseMemorySummary(2, 5)).toBe("2 products · 5 purchases");
    expect(purchaseMemorySummary(0, 0)).toBe("No purchase history yet");
  });

  it("Alface iceberg memory excludes oleo girassol invoice lines", () => {
    const recognized = buildRecognizedSupplierProducts(
      "ing-alface",
      "Alface iceberg",
      [],
      [
        potatoProduct({
          matchedIngredientId: "ing-alface",
          itemId: "line-alface",
          itemName: "ALFACE ICEBERG INTEIRA",
        }),
        potatoProduct({
          matchedIngredientId: "ing-oil",
          itemId: "line-oil",
          itemName: "OLEO GIRASSOL VAQUEIRO 1L",
        }),
      ],
    );
    const recent = buildRecentPurchases("ing-alface", "Alface iceberg", [
      potatoProduct({
        matchedIngredientId: "ing-alface",
        itemId: "line-alface",
        itemName: "ALFACE ICEBERG INTEIRA",
      }),
      potatoProduct({
        matchedIngredientId: "ing-oil",
        itemId: "line-oil",
        itemName: "OLEO GIRASSOL VAQUEIRO 1L",
      }),
    ]);

    expect(recognized.map((row) => row.name)).toEqual(["ALFACE ICEBERG INTEIRA"]);
    expect(recent.map((row) => row.itemId)).toEqual(["line-alface"]);
  });

  it("keeps batata palha and bacon purchase memory separate", () => {
    const palhaRecent = buildRecentPurchases("ing-palha", "Batata palha", [
      potatoProduct({
        matchedIngredientId: "ing-palha",
        itemId: "line-palha",
        itemName: "BATATA PALHA 2KG",
      }),
      potatoProduct({
        matchedIngredientId: "ing-bacon",
        itemId: "line-bacon",
        itemName: "BAC STRK 1KG",
      }),
    ]);
    const baconRecent = buildRecentPurchases("ing-bacon", "Bacon streaky", [
      potatoProduct({
        matchedIngredientId: "ing-palha",
        itemId: "line-palha",
        itemName: "BATATA PALHA 2KG",
      }),
      potatoProduct({
        matchedIngredientId: "ing-bacon",
        itemId: "line-bacon",
        itemName: "BAC STRK 1KG",
      }),
    ]);

    expect(palhaRecent.map((row) => row.itemId)).toEqual(["line-palha"]);
    expect(baconRecent.map((row) => row.itemId)).toEqual(["line-bacon"]);
  });
});
