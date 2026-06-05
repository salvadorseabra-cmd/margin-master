import { describe, expect, it } from "vitest";
import {
  appendIngredientPriceHistoryFromInvoiceLine,
  computePriceHistoryDelta,
  invoiceLinePricesUnchanged,
  operationalUnitPriceForPriceHistory,
  resolveIngredientPriceHistoryCreatedAt,
  resolvePreviousOperationalPriceForHistory,
  resolvePreviousPackPriceForHistory,
} from "@/lib/ingredient-price-history";
import { resolvedOperationalUnitCostEur } from "@/lib/ingredient-unit-cost";
import {
  operationalCostFieldsFromInvoiceLine,
  persistOperationalIngredientCostFromInvoiceLine,
} from "@/lib/ingredient-auto-persist";
import {
  buildOperationalWindows,
  buildOwnerReviewViewModel,
} from "@/lib/operational-intelligence-synthesis";

type HistoryInsert = Record<string, unknown>;

function createPersistenceMockClient(options: {
  ingredient?: {
    name: string;
    unit: string | null;
    current_price: number | null;
    purchase_quantity: number | null;
  };
  existingHistoryKeys?: Set<string>;
  latestHistoryNewPrice?: number | null;
}) {
  const historyInserts: HistoryInsert[] = [];
  const existing = options.existingHistoryKeys ?? new Set<string>();
  const ingredient = options.ingredient ?? {
    name: "Tomato passata",
    unit: "kg",
    current_price: 10,
    purchase_quantity: 1,
  };

  const client = {
    from: (table: string) => {
      if (table === "ingredients") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: ingredient, error: null }),
            }),
          }),
          update: (payload: Record<string, unknown>) => ({
            eq: async () => {
              if (payload.current_price != null) {
                ingredient.current_price = payload.current_price as number;
              }
              if (payload.purchase_quantity != null) {
                ingredient.purchase_quantity = payload.purchase_quantity as number;
              }
              return { error: null };
            },
          }),
        };
      }
      if (table === "ingredient_price_history") {
        return {
          select: (cols: string) => {
            if (cols === "id") {
              return {
                eq: (col: string, val: string) => {
                  const chain = {
                    eq: (col2: string, val2: string) => ({
                      limit: () => ({
                        maybeSingle: async () => {
                          if (col === "invoice_id" && col2 === "ingredient_id") {
                            const key = `${val}:${val2}`;
                            return existing.has(key)
                              ? { data: { id: "existing" }, error: null }
                              : { data: null, error: null };
                          }
                          return { data: null, error: null };
                        },
                      }),
                    }),
                  };
                  return chain;
                },
              };
            }
            if (cols === "new_price") {
              return {
                eq: () => ({
                  order: () => ({
                    limit: () => ({
                      maybeSingle: async () => ({
                        data:
                          options.latestHistoryNewPrice != null
                            ? { new_price: options.latestHistoryNewPrice }
                            : null,
                        error: null,
                      }),
                    }),
                  }),
                }),
              };
            }
            throw new Error(`unexpected select ${cols}`);
          },
          insert: (row: HistoryInsert) => {
            historyInserts.push(row);
            if (row.invoice_id && row.ingredient_id) {
              existing.add(`${row.invoice_id}:${row.ingredient_id}`);
            }
            return Promise.resolve({ error: null });
          },
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  };

  return { client, historyInserts, ingredient };
}

describe("resolvePreviousOperationalPriceForHistory", () => {
  it("normalizes catalog pack price from snapshot", () => {
    const operational = resolvePreviousOperationalPriceForHistory(
      { name: "Bun", unit: "un", current_price: 5.4, purchase_quantity: 24 },
      null,
    );
    expect(operational).toBeCloseTo(0.225, 4);
  });

  it("returns latest history new_price without re-normalizing", () => {
    const operational = resolvePreviousOperationalPriceForHistory(
      { name: "Bun", unit: "un", current_price: null, purchase_quantity: 24 },
      0.2,
    );
    expect(operational).toBeCloseTo(0.2, 4);
  });

  it("prefers catalog pack over history fallback", () => {
    expect(
      resolvePreviousPackPriceForHistory({
        name: "Bun",
        unit: "un",
        current_price: 4.8,
        purchase_quantity: 24,
      }),
    ).toBe(4.8);
    expect(
      resolvePreviousOperationalPriceForHistory(
        { name: "Bun", unit: "un", current_price: 4.8, purchase_quantity: 24 },
        0.2,
      ),
    ).toBeCloseTo(0.2, 4);
  });
});

describe("operationalUnitPriceForPriceHistory", () => {
  it("matches resolvedOperationalUnitCostEur for pack + purchase_quantity", () => {
    const fields = {
      current_price: 5.4,
      purchase_quantity: 24,
      cost_base_unit: "un" as const,
    };
    expect(operationalUnitPriceForPriceHistory(5.4, 24)).toBeCloseTo(
      resolvedOperationalUnitCostEur(fields)!,
      6,
    );
    expect(operationalUnitPriceForPriceHistory(5.4, 24)).toBeCloseTo(0.225, 3);
  });
});

describe("appendIngredientPriceHistoryFromInvoiceLine", () => {
  it("inserts first price with null previous and delta", async () => {
    const { client, historyInserts } = createPersistenceMockClient({
      ingredient: { name: "Oil", unit: "L", current_price: null, purchase_quantity: 1 },
    });

    const result = await appendIngredientPriceHistoryFromInvoiceLine(client as never, {
      ingredientId: "ing-1",
      invoiceId: "inv-1",
      ingredientName: "Oil",
      supplierName: "Metro",
      previousPrice: null,
      newPrice: 12.5,
      invoiceDate: "2026-04-15",
    });

    expect(result.inserted).toBe(true);
    expect(historyInserts).toHaveLength(1);
    expect(historyInserts[0]).toMatchObject({
      ingredient_id: "ing-1",
      invoice_id: "inv-1",
      previous_price: null,
      new_price: 12.5,
      supplier_name: "Metro",
      created_at: "2026-04-15T12:00:00.000Z",
    });
    expect(historyInserts[0].delta).toBeNull();
  });

  it("records price increase with delta_percent on normalized unit prices", async () => {
    const { client, historyInserts } = createPersistenceMockClient({});
    const result = await appendIngredientPriceHistoryFromInvoiceLine(client as never, {
      ingredientId: "ing-1",
      invoiceId: "inv-2",
      ingredientName: "Tomato",
      previousPrice: 10,
      newPrice: 12,
      previousPurchaseQuantity: 1,
      newPurchaseQuantity: 1,
      invoiceDate: "2026-05-01",
    });
    expect(result.inserted).toBe(true);
    expect(historyInserts[0].previous_price).toBe(10);
    expect(historyInserts[0].new_price).toBe(12);
    expect(historyInserts[0].delta).toBe(2);
    expect(historyInserts[0].delta_percent).toBe(20);
    expect(computePriceHistoryDelta(10, 12)).toEqual({ delta: 2, delta_percent: 20 });
  });

  it("stores normalized €/un for brioche case line, not case pack price", async () => {
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
    expect(historyInserts[0].new_price).toBeCloseTo(0.225, 4);
    expect(historyInserts[0].previous_price).toBeCloseTo(0.2, 4);
    expect(historyInserts[0].delta).toBeCloseTo(0.025, 4);
  });

  it("stores normalized €/un for hamburger case line, not case pack price", async () => {
    const { client, historyInserts } = createPersistenceMockClient({});
    await appendIngredientPriceHistoryFromInvoiceLine(client as never, {
      ingredientId: "beef-1",
      invoiceId: "inv-beef",
      ingredientName: "Hambúrguer Bovino 180g",
      previousPrice: 1.3,
      newPrice: 55,
      previousPurchaseQuantity: 1,
      newPurchaseQuantity: 40,
    });
    expect(historyInserts[0].new_price).toBeCloseTo(1.375, 4);
    expect(historyInserts[0].previous_price).toBeCloseTo(1.3, 4);
    expect(historyInserts[0].delta).toBeCloseTo(0.075, 4);
  });

  it("records price decrease", async () => {
    const { client, historyInserts } = createPersistenceMockClient({});
    await appendIngredientPriceHistoryFromInvoiceLine(client as never, {
      ingredientId: "ing-1",
      invoiceId: "inv-3",
      ingredientName: "Tomato",
      previousPrice: 12,
      newPrice: 9,
      previousPurchaseQuantity: 1,
      newPurchaseQuantity: 1,
    });
    expect(historyInserts[0].delta).toBe(-3);
    expect(historyInserts[0].delta_percent).toBe(-25);
  });

  it("skips duplicate invoice_id + ingredient_id", async () => {
    const existing = new Set(["inv-1:ing-1"]);
    const { client, historyInserts } = createPersistenceMockClient({ existingHistoryKeys: existing });
    const result = await appendIngredientPriceHistoryFromInvoiceLine(client as never, {
      ingredientId: "ing-1",
      invoiceId: "inv-1",
      ingredientName: "Tomato",
      previousPrice: 10,
      newPrice: 15,
    });
    expect(result.inserted).toBe(false);
    expect(result.skippedReason).toBe("duplicate_invoice");
    expect(historyInserts).toHaveLength(0);
  });

  it("skips unchanged effective unit price", async () => {
    const { client, historyInserts } = createPersistenceMockClient({});
    expect(
      invoiceLinePricesUnchanged(10, 2, 20, 4),
    ).toBe(true);
    const result = await appendIngredientPriceHistoryFromInvoiceLine(client as never, {
      ingredientId: "ing-1",
      invoiceId: "inv-4",
      ingredientName: "Tomato",
      previousPrice: 10,
      newPrice: 20,
      previousPurchaseQuantity: 2,
      newPurchaseQuantity: 4,
    });
    expect(result.skippedReason).toBe("unchanged_price");
    expect(historyInserts).toHaveLength(0);
  });

  it("uses invoice issue date for created_at chronology", () => {
    expect(
      resolveIngredientPriceHistoryCreatedAt({
        invoiceDate: "2026-03-10",
        invoiceCreatedAt: "2026-06-01T08:00:00.000Z",
      }),
    ).toBe("2026-03-10T12:00:00.000Z");
  });

  it("orders history timestamps by invoice date not upload time", async () => {
    const { client, historyInserts } = createPersistenceMockClient({});
    await appendIngredientPriceHistoryFromInvoiceLine(client as never, {
      ingredientId: "ing-1",
      invoiceId: "inv-old",
      ingredientName: "Tomato",
      previousPrice: 8,
      newPrice: 9,
      invoiceDate: "2026-01-15",
      invoiceCreatedAt: "2026-06-01T00:00:00.000Z",
    });
    await appendIngredientPriceHistoryFromInvoiceLine(client as never, {
      ingredientId: "ing-1",
      invoiceId: "inv-new",
      ingredientName: "Tomato",
      previousPrice: 9,
      newPrice: 11,
      invoiceDate: "2026-05-20",
      invoiceCreatedAt: "2026-01-01T00:00:00.000Z",
    });
    expect(historyInserts[0]?.created_at).toBe("2026-01-15T12:00:00.000Z");
    expect(historyInserts[1]?.created_at).toBe("2026-05-20T12:00:00.000Z");
  });
});

describe("persistOperationalIngredientCostFromInvoiceLine", () => {
  it("stores normalized unit price for brioche 24-pack case invoice line", async () => {
    const line = {
      name: "PAO BRIOCHE 24X80G",
      quantity: 1,
      unit: "cx",
      unit_price: 5.4,
    };
    const fields = operationalCostFieldsFromInvoiceLine(line);
    expect(fields?.purchase_quantity).toBe(24);
    const { client, historyInserts } = createPersistenceMockClient({
      ingredient: {
        name: "Brioche Burger Bun 80g",
        unit: "un",
        current_price: 4.8,
        purchase_quantity: fields!.purchase_quantity,
      },
    });

    const result = await persistOperationalIngredientCostFromInvoiceLine(
      client as never,
      "ing-1",
      line,
      { priceHistory: { invoiceId: "inv-brioche", supplierName: "Padaria" } },
    );

    expect(result.historyInserted).toBe(true);
    expect(historyInserts[0].new_price).toBeCloseTo(0.225, 4);
    expect(historyInserts[0].new_price).not.toBe(5.4);
  });

  it("stores per-patty normalized price for single-unit hamburger line", async () => {
    const line = {
      name: "Hambúrguer Bovino 180g",
      quantity: 1,
      unit: "un",
      unit_price: 0.98,
    };
    const fields = operationalCostFieldsFromInvoiceLine(line);
    const { client, historyInserts } = createPersistenceMockClient({
      ingredient: {
        name: "Hambúrguer Bovino 180g",
        unit: "un",
        current_price: 0.9,
        purchase_quantity: 1,
      },
    });

    await persistOperationalIngredientCostFromInvoiceLine(client as never, "ing-1", line, {
      priceHistory: { invoiceId: "inv-patty", supplierName: "Carnes" },
    });

    expect(historyInserts[0].new_price).toBeCloseTo(0.98, 4);
    expect(fields?.purchase_quantity).toBe(1);
  });

  it("appends history after successful ingredients update", async () => {
    const line = {
      name: "QUEIJO MOZARELLA FATIADO 1KG",
      quantity: 1,
      unit: "kg",
      unit_price: 9.5,
    };
    const fields = operationalCostFieldsFromInvoiceLine(line);
    const { client, historyInserts, ingredient } = createPersistenceMockClient({
      ingredient: {
        name: "Mozzarella 1kg",
        unit: "kg",
        current_price: 8,
        purchase_quantity: fields!.purchase_quantity,
      },
    });

    const result = await persistOperationalIngredientCostFromInvoiceLine(
      client as never,
      "ing-1",
      line,
      {
        priceHistory: {
          invoiceId: "inv-a",
          supplierName: "Continente",
          invoiceDate: "2026-02-01",
        },
      },
    );

    expect(result.updated).toBe(true);
    expect(result.historyInserted).toBe(true);
    expect(ingredient.current_price).toBe(9.5);
    expect(historyInserts).toHaveLength(1);
    expect(historyInserts[0]).toMatchObject({
      invoice_id: "inv-a",
      supplier_name: "Continente",
    });
    expect(historyInserts[0].previous_price).toBeCloseTo(0.008, 4);
    expect(historyInserts[0].new_price).toBeCloseTo(0.0095, 4);
  });

  it("uses history fallback operational price without double normalization", async () => {
    const line = {
      name: "PAO BRIOCHE 24X80G",
      quantity: 1,
      unit: "cx",
      unit_price: 5.4,
    };
    const fields = operationalCostFieldsFromInvoiceLine(line);
    const { client, historyInserts } = createPersistenceMockClient({
      ingredient: {
        name: "Brioche Burger Bun 80g",
        unit: "un",
        current_price: null,
        purchase_quantity: fields!.purchase_quantity,
      },
      latestHistoryNewPrice: 0.2,
    });

    await persistOperationalIngredientCostFromInvoiceLine(client as never, "ing-1", line, {
      priceHistory: { invoiceId: "inv-brioche-2", supplierName: "Padaria" },
    });

    expect(historyInserts[0].previous_price).toBeCloseTo(0.2, 4);
    expect(historyInserts[0].new_price).toBeCloseTo(0.225, 4);
    expect(historyInserts[0].previous_price).not.toBeCloseTo(0.2 / 24, 6);
  });

  it("does not append history when price unchanged", async () => {
    const line = { name: "SAL 1KG", quantity: 1, unit: "kg", unit_price: 2 };
    const fields = operationalCostFieldsFromInvoiceLine(line);
    expect(fields?.current_price).not.toBeNull();
    const { client, historyInserts } = createPersistenceMockClient({
      ingredient: {
        name: "Salt",
        unit: "kg",
        current_price: fields!.current_price,
        purchase_quantity: fields!.purchase_quantity,
      },
    });

    const result = await persistOperationalIngredientCostFromInvoiceLine(
      client as never,
      "ing-1",
      line,
      { priceHistory: { invoiceId: "inv-b", supplierName: "Metro" } },
    );

    expect(result.historyInserted).toBe(false);
    expect(historyInserts).toHaveLength(0);
  });
});

describe("OI supplier movement after persistence", () => {
  it("buildOwnerReviewViewModel surfaces supplier increases from history rows", () => {
    const windows = buildOperationalWindows(new Date("2026-06-03T12:00:00.000Z"));
    const data = {
      ingredients: [
        { id: "beef-1", name: "Novilho", unit: "kg", current_price: 12, purchase_quantity: 1 },
      ],
      recipes: [],
      invoices: [
        { id: "inv-1", supplier_name: "Alpha Foods", total: 120, created_at: "2026-05-01T00:00:00.000Z" },
      ],
      priceHistory: [
        {
          id: "h1",
          ingredient_id: "beef-1",
          invoice_id: "inv-1",
          ingredient_name: "Novilho",
          supplier_name: "Alpha Foods",
          ingredient_unit: "kg",
          previous_price: 10,
          new_price: 12,
          delta: 2,
          delta_percent: 20,
          created_at: "2026-05-01T12:00:00.000Z",
        },
      ],
    };

    const ownerReview = buildOwnerReviewViewModel({
      data,
      alerts: [],
      monthlyMarginPressure: {
        estimatedMarginPressureEur: 0,
        estimatedMarginPressureLine: "",
        biggestInflationDriver: null,
        mostAffectedCategory: null,
        supplierVolatilityLevel: "stable",
        supplierVolatilityLabel: "Stable",
        recipesBelowTarget: 0,
        calmSummaryLine: "",
      },
      prioritizedInsights: [],
      concentrationGroups: [],
      operationalSynthesisGroups: {
        supplierMovements: { largestIncreases: [], stablePricing: [] },
        supplierSwitchImpacts: {
          badSwitches: [],
          goodSwitches: [],
          stableSwitches: [],
          volatilityReductions: [],
        },
        recipeMarginMovements: { worsening: [], improving: [] },
        recoverySignals: [],
        stableOperationalAreas: {
          categories: [],
          highOperationalExposureIngredients: [],
        },
      },
      monitorInsights: [],
      operationalWindows: windows,
      selectedWindowKey: "last_3_months",
    });

    expect(ownerReview.weeklySnapshot.supplierIncreases).toBeGreaterThanOrEqual(1);
    const alpha = ownerReview.suppliersToWatch.find((r) => r.supplierName === "Alpha Foods");
    expect(alpha?.ingredientChanges?.length).toBeGreaterThan(0);
  });
});
