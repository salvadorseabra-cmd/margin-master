import { describe, expect, it } from "vitest";
import {
  appendIngredientPriceHistoryFromInvoiceLine,
  operationalUnitPriceForPriceHistory,
} from "@/lib/ingredient-price-history";
import {
  operationalCostFieldsFromInvoiceLine,
  persistOperationalIngredientCostFromInvoiceLine,
} from "@/lib/ingredient-auto-persist";
import { createPersistenceMockClient } from "@/lib/ingredient-price-history-persistence.test";

function expectOperationalHistoryPrice(
  packPrice: number,
  purchaseQuantity: number | null | undefined,
  storedNewPrice: unknown,
): void {
  const expected = operationalUnitPriceForPriceHistory(packPrice, purchaseQuantity);
  expect(expected).not.toBeNull();
  expect(Number(storedNewPrice)).toBeCloseTo(expected!, 6);
  if (Math.abs(packPrice - expected!) > 1e-6) {
    expect(Number(storedNewPrice)).not.toBeCloseTo(packPrice, 6);
  }
}

describe("history contract — appendIngredientPriceHistoryFromInvoiceLine", () => {
  it("Case A: inserts history row when normalization succeeds", async () => {
    const { client, historyInserts } = createPersistenceMockClient({
      ingredient: { name: "Tomato", unit: "kg", current_price: 8, purchase_quantity: 1000 },
    });

    const result = await appendIngredientPriceHistoryFromInvoiceLine(client as never, {
      ingredientId: "ing-tomato",
      invoiceId: "inv-a",
      ingredientName: "Tomato",
      previousPrice: 8,
      newPrice: 9,
      previousPurchaseQuantity: 1000,
      newPurchaseQuantity: 1000,
    });

    expect(result.inserted).toBe(true);
    expect(historyInserts).toHaveLength(1);
    expectOperationalHistoryPrice(9, 1000, historyInserts[0].new_price);
  });

  it("Case B: skips insert when normalization returns null", async () => {
    const { client, historyInserts } = createPersistenceMockClient({});

    const result = await appendIngredientPriceHistoryFromInvoiceLine(client as never, {
      ingredientId: "ing-bad",
      invoiceId: "inv-b",
      ingredientName: "Bad pack",
      previousPrice: null,
      newPrice: 0,
      newPurchaseQuantity: 1,
    });

    expect(result.inserted).toBe(false);
    expect(result.skippedReason).toBe("normalization_failed");
    expect(historyInserts).toHaveLength(0);
  });

  it("Case C: never stores raw pack price when normalization yields €/base-unit", async () => {
    const { client, historyInserts } = createPersistenceMockClient({});

    await appendIngredientPriceHistoryFromInvoiceLine(client as never, {
      ingredientId: "bun-1",
      invoiceId: "inv-brioche",
      ingredientName: "Brioche Burger Bun 80g",
      previousPrice: 0.2,
      newPrice: 5.4,
      previousPurchaseQuantity: 1,
      newPurchaseQuantity: 24,
    });

    expect(historyInserts).toHaveLength(1);
    expectOperationalHistoryPrice(5.4, 24, historyInserts[0].new_price);
  });
});

describe("history contract — operational invoice patterns stay normalized", () => {
  it.each([
    {
      product: "Açúcar",
      line: {
        name: "Açúcar Branco METRO Chef 10x1 Kg",
        quantity: 1,
        unit: "un" as const,
        unit_price: 9.99,
      },
      ingredient: { name: "Açúcar branco", unit: "kg", current_price: 9.5, purchase_quantity: 1000 },
    },
    {
      product: "Arroz",
      line: {
        name: "Arroz Agulha Metro Chef 12x1kg",
        quantity: 1,
        unit: "cx" as const,
        unit_price: 13.95,
      },
      ingredient: { name: "Arroz agulha", unit: "kg", current_price: 12, purchase_quantity: 1000 },
    },
    {
      product: "Nata",
      line: {
        name: "Nata 6x1L",
        quantity: 1,
        unit: "un" as const,
        unit_price: 3.05,
      },
      ingredient: { name: "Nata", unit: "un", current_price: 2.8, purchase_quantity: 6 },
    },
    {
      product: "Pepino",
      line: { name: "Pepino", quantity: 3.36, unit: "kg" as const, unit_price: 1.77 },
      ingredient: { name: "Pepino", unit: "kg", current_price: 1.5, purchase_quantity: 1000 },
    },
  ])("Case D: $product persists operational normalized history.new_price", async ({ line, ingredient }) => {
    const fields = operationalCostFieldsFromInvoiceLine(line);
    expect(fields?.current_price).not.toBeNull();

    const { client, historyInserts } = createPersistenceMockClient({ ingredient });

    await persistOperationalIngredientCostFromInvoiceLine(client as never, "ing-op", line, {
      priceHistory: { invoiceId: `inv-${line.name}`, supplierName: "Metro" },
    });

    expect(historyInserts).toHaveLength(1);
    expectOperationalHistoryPrice(
      fields!.current_price!,
      fields!.purchase_quantity,
      historyInserts[0].new_price,
    );
  });

  it.each([
    {
      product: "Peroni",
      line: { name: "Peroni 24x33cl", quantity: 1, unit: null, unit_price: 24.5 },
      ingredient: { name: "Peroni", unit: "un", current_price: 22, purchase_quantity: 24 },
    },
    {
      product: "San Pellegrino",
      line: {
        name: "SanPellegrino - Acqua in vitro 75cl x 15ud",
        quantity: 1,
        unit: "un" as const,
        unit_price: 19.32,
      },
      ingredient: {
        name: "San Pellegrino",
        unit: "un",
        current_price: 18,
        purchase_quantity: 15,
      },
    },
    {
      product: "Aceto",
      line: {
        name: "Aceto balsamico di modena IGP pet 5l*2 Toschi",
        quantity: 1,
        unit: "un" as const,
        unit_price: 18.83,
      },
      ingredient: {
        name: "Aceto balsamico di modena IGP",
        unit: "ml",
        current_price: 16,
        purchase_quantity: 10000,
      },
    },
    {
      product: "Atum",
      line: {
        name: "Atum Óleo Bolsa Nau Catrineta 1 Kg",
        quantity: 2,
        unit: "un" as const,
        unit_price: 6.29,
        total: 12.58,
      },
      ingredient: { name: "Atum em óleo", unit: "kg", current_price: 6.55, purchase_quantity: 2 },
    },
    {
      product: "Gema",
      line: {
        name: "Ovo Gema 1kg",
        quantity: 6,
        unit: "un" as const,
        unit_price: 10.19,
        total: 61.14,
      },
      ingredient: { name: "Gema líquida", unit: "kg", current_price: 8.43, purchase_quantity: 1 },
    },
    {
      product: "Anchoas",
      line: {
        name: "Filete de Anchoas Alconfirosa LI 495 g",
        quantity: 2,
        unit: "un" as const,
        unit_price: 9.99,
        total: 19.98,
      },
      ingredient: { name: "Anchoas", unit: "un", current_price: 8, purchase_quantity: 1 },
    },
  ])("regression: $product never writes raw pack price to history", async ({ line, ingredient }) => {
    const fields = operationalCostFieldsFromInvoiceLine(line);
    expect(fields?.current_price).not.toBeNull();

    const { client, historyInserts } = createPersistenceMockClient({ ingredient });

    await persistOperationalIngredientCostFromInvoiceLine(client as never, "ing-reg", line, {
      priceHistory: { invoiceId: `inv-${line.name}`, supplierName: "Aviludo" },
    });

    expect(historyInserts).toHaveLength(1);
    expectOperationalHistoryPrice(
      fields!.current_price!,
      fields!.purchase_quantity,
      historyInserts[0].new_price,
    );
  });
});
