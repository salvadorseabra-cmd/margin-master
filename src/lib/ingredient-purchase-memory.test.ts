import { describe, expect, it } from "vitest";
import { buildIngredientPurchaseInsights } from "@/lib/ingredient-detail-panel";
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
  quantity: null,
  unit: null,
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

    expect(recognized.map((row) => row.name).sort()).toEqual(["BAC STRK 1KG", "BAT SHOE 2.5KG"]);
  });

  it("includes matched invoice lines even when line text differs from canonical family", () => {
    const recognized = buildRecognizedSupplierProducts(
      "ing-bacon",
      "Bacon streaky",
      [baconAlias],
      [potatoProduct()],
    );
    const recent = buildRecentPurchases("ing-bacon", "Bacon streaky", [potatoProduct()]);

    expect(recognized.map((row) => row.name).sort()).toEqual(["BAC STRK 1KG", "BAT SHOE 2.5KG"]);
    expect(recent).toHaveLength(1);
    expect(recent[0]?.itemId).toBe("line-potato");
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

  it("buildRecentPurchases formats supplier, date, and invoice line total", () => {
    const recent = buildRecentPurchases("ing-bacon", "Bacon", [
      potatoProduct({
        itemName: "BAC STRK 1KG",
        supplierName: "metro",
        invoiceDate: "2026-02-15",
        unitPrice: 9.99,
        lineTotal: 19.98,
      }),
    ]);

    expect(recent).toHaveLength(1);
    expect(recent[0]?.supplierLabel).toBe("Metro");
    expect(recent[0]?.dateLabel).toMatch(/2026/);
    expect(recent[0]?.priceLabel).toBe("€19.98");
    expect(recent[0]?.comparablePrice).toBe(9.99);
  });

  it("Peroni: operational unit cost is €/L per bottle not per full case", () => {
    const productName = "Birra Peroni Nastro Azzurro PNA 33cl*24 Nastro Azzurro";
    const purchases = buildRecentPurchases("ing-peroni", "Peroni", [
      potatoProduct({
        matchedIngredientId: "ing-peroni",
        itemId: "line-peroni",
        itemName: productName,
        supplierName: "Mammafiore",
        invoiceDate: "2026-05-19",
        quantity: 24,
        unit: "un",
        unitPrice: 1.07,
        lineTotal: 25.69,
      }),
    ]);

    expect(purchases[0]?.procurementCostLabel).toBe("€1.07 / unit");
    expect(purchases[0]?.operationalCostLabel).toMatch(/^€3\.24 \/ L$/);
    expect(purchases[0]?.unitCostLabel).toBe(purchases[0]?.operationalCostLabel);
    expect(purchases[0]?.comparablePrice).toBeCloseTo(3.24, 2);
    expect(purchases[0]?.comparablePrice).not.toBeCloseTo(0.1351, 3);
  });

  it("San Pellegrino: Best Buy ranks by per-case economics not invoice total", () => {
    const productName = "SanPellegrino - Acqua in vitro 75cl x 15ud";
    const purchases = buildRecentPurchases("ing-sp", "San Pellegrino", [
      potatoProduct({
        matchedIngredientId: "ing-sp",
        itemId: "line-a",
        itemName: productName,
        supplierName: "Emporio Italia",
        invoiceDate: "2026-05-01",
        quantity: 1,
        unit: "cx",
        unitPrice: 25.74,
        lineTotal: 25.74,
      }),
      potatoProduct({
        matchedIngredientId: "ing-sp",
        itemId: "line-b",
        itemName: productName,
        supplierName: "Emporio Italia",
        invoiceDate: "2026-06-10",
        quantity: 2,
        unit: "cx",
        unitPrice: 19.28,
        lineTotal: 38.56,
      }),
    ]);

    const latest = purchases.find((row) => row.itemId === "line-b");
    const bestValue = purchases.find((row) => row.itemId === "line-a");

    expect(latest?.priceLabel).toBe("€38.56");
    expect(bestValue?.priceLabel).toBe("€25.74");
    // 15×75cl/case → 11.25 L; comparablePrice is €/L via computeEffectiveUsableCost
    expect(latest?.comparablePrice).toBeCloseTo(19.28 / 11.25, 2);
    expect(bestValue?.comparablePrice).toBeCloseTo(25.74 / 11.25, 2);

    const insights = buildIngredientPurchaseInsights(purchases);
    expect(insights.best?.priceLabel).toBe("€38.56");
    expect(insights.worst?.priceLabel).toBe("€25.74");
  });

  it("purchaseMemorySummary describes counts", () => {
    expect(purchaseMemorySummary(2, 5)).toBe("2 products · 5 purchases");
    expect(purchaseMemorySummary(0, 0)).toBe("No purchase history yet");
  });

  it("Courgettes: last purchase quantity and unit cost from invoice line", () => {
    const recent = buildRecentPurchases("ing-courgettes", "Courgettes", [
      potatoProduct({
        matchedIngredientId: "ing-courgettes",
        itemId: "line-courgettes",
        itemName: "Courgettes",
        supplierName: "Bidfood Portugal",
        invoiceDate: "2026-05-25",
        quantity: 3.3,
        unit: "kg",
        unitPrice: 1.95,
        lineTotal: 5.15,
      }),
    ]);

    expect(recent[0]?.purchaseQuantityLabel).toBe("3.30 kg");
    expect(recent[0]?.procurementCostLabel).toBe("€1.95 / kg");
    expect(recent[0]?.operationalCostLabel).toBe("€1.95 / kg");
    expect(recent[0]?.unitCostLabel).toBe("€1.95 / kg");
    expect(recent[0]?.priceLabel).toBe("€5.15");
    expect(recent[0]?.supplierLabel).toBe("Bidfood Portugal");
  });

  it("Alho Francês: last purchase quantity from invoice line", () => {
    const recent = buildRecentPurchases("ing-alho", "Alho Francês", [
      potatoProduct({
        matchedIngredientId: "ing-alho",
        itemId: "line-alho",
        itemName: "Alho Francês",
        supplierName: "Bidfood Portugal",
        invoiceDate: "2026-05-25",
        quantity: 5.42,
        unit: "kg",
        unitPrice: 1.77,
        lineTotal: 7.67,
      }),
    ]);

    expect(recent[0]?.purchaseQuantityLabel).toBe("5.42 kg");
    expect(recent[0]?.unitCostLabel).toBe("€1.77 / kg");
    expect(recent[0]?.priceLabel).toBe("€7.67");
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
