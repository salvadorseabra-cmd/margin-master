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
type HistoryRow = HistoryInsert & { id: string };

export function createPersistenceMockClient(options: {
  ingredient?: {
    name: string;
    unit: string | null;
    current_price: number | null;
    purchase_quantity: number | null;
  };
  existingHistoryRows?: HistoryRow[];
  latestHistoryNewPrice?: number | null;
}) {
  const historyInserts: HistoryInsert[] = [];
  const historyUpdates: Array<{ id: string; payload: HistoryInsert }> = [];
  const historyRows: HistoryRow[] = (options.existingHistoryRows ?? []).map((row, index) => ({
    id: String(row.id ?? `hist-${index}`),
    ...row,
  }));
  const ingredient = options.ingredient ?? {
    name: "Tomato passata",
    unit: "kg",
    current_price: 10,
    purchase_quantity: 1,
  };

  function historyByInvoiceIngredient(invoiceId: string, ingredientId: string) {
    return historyRows.find(
      (row) => row.invoice_id === invoiceId && row.ingredient_id === ingredientId,
    );
  }

  function invoiceMetaForHistoryRow(row: HistoryRow) {
    const createdAt = String(row.created_at ?? "");
    const invoiceDate = createdAt.includes("T") ? createdAt.slice(0, 10) : createdAt || null;
    return { invoice_date: invoiceDate, created_at: createdAt || null };
  }

  function withInvoiceJoin(row: HistoryRow) {
    return { ...row, invoices: invoiceMetaForHistoryRow(row) };
  }

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
        const buildHistoryQuery = (
          mode: "select" | "delete" | "update",
          updatePayload?: HistoryInsert,
        ) => {
          const filters: Array<(row: HistoryRow) => boolean> = [];
          let orderAsc: boolean | null = null;
          let excludesInvoice = false;

          const builder = {
            select(_cols: string) {
              return builder;
            },
            delete() {
              return buildHistoryQuery("delete");
            },
            update(payload: HistoryInsert) {
              return buildHistoryQuery("update", payload);
            },
            eq(col: string, val: string) {
              filters.push((row) => String(row[col as keyof HistoryRow]) === val);
              return builder;
            },
            is(col: string, val: null) {
              filters.push((row) => (row[col as keyof HistoryRow] ?? null) === val);
              return builder;
            },
            not(col: string, _op: string, _val: null) {
              filters.push((row) => row[col as keyof HistoryRow] != null);
              return builder;
            },
            neq(col: string, val: string) {
              excludesInvoice = true;
              filters.push((row) => String(row[col as keyof HistoryRow]) !== val);
              return builder;
            },
            order(_col: string, opts: { ascending: boolean }) {
              orderAsc = opts.ascending;
              return builder;
            },
            limit() {
              return builder;
            },
            maybeSingle: async () => {
              const matched = historyRows.filter((row) => filters.every((filter) => filter(row)));
              let selected = [...matched];
              if (orderAsc != null) {
                selected = selected.sort((a, b) =>
                  orderAsc
                    ? String(a.created_at ?? "").localeCompare(String(b.created_at ?? ""))
                    : String(b.created_at ?? "").localeCompare(String(a.created_at ?? "")),
                );
              }
              const row = selected[0];
              if (mode === "update" && updatePayload && row) {
                Object.assign(row, updatePayload);
                historyUpdates.push({ id: row.id, payload: updatePayload });
                return { data: null, error: null };
              }
              if (mode === "delete") {
                for (const entry of matched) {
                  const index = historyRows.indexOf(entry);
                  if (index >= 0) historyRows.splice(index, 1);
                }
                return { data: matched.map((entry) => ({ id: entry.id })), error: null };
              }
              if (
                !row &&
                !excludesInvoice &&
                options.latestHistoryNewPrice != null &&
                mode === "select"
              ) {
                return {
                  data: {
                    new_price: options.latestHistoryNewPrice,
                    invoice_id: "inv-linked",
                  },
                  error: null,
                };
              }
              return row ? { data: row, error: null } : { data: null, error: null };
            },
            then(resolve?: (value: { data: unknown; error: null }) => unknown) {
              const matched = historyRows.filter((row) => filters.every((filter) => filter(row)));
              let selected = [...matched];
              if (orderAsc != null) {
                selected = selected.sort((a, b) =>
                  orderAsc
                    ? String(a.created_at ?? "").localeCompare(String(b.created_at ?? ""))
                    : String(b.created_at ?? "").localeCompare(String(a.created_at ?? "")),
                );
              }
              if (mode === "update" && updatePayload) {
                for (const row of matched) {
                  Object.assign(row, updatePayload);
                  historyUpdates.push({ id: row.id, payload: updatePayload });
                }
                const result = { error: null as const };
                return resolve ? resolve(result as { data: unknown; error: null }) : result;
              }
              if (mode === "delete") {
                for (const entry of matched) {
                  const index = historyRows.indexOf(entry);
                  if (index >= 0) historyRows.splice(index, 1);
                }
                const result = { data: matched.map((entry) => ({ id: entry.id })), error: null as const };
                return resolve ? resolve(result) : result;
              }
              const result = {
                data: selected.map((row) => withInvoiceJoin(row)),
                error: null as const,
              };
              return resolve ? resolve(result) : result;
            },
          };
          return builder;
        };

        return {
          select: (cols: string) => {
            if (cols === "id,created_at,previous_price,new_price") {
              return {
                eq: (col: string, val: string) => ({
                  eq: (col2: string, val2: string) => ({
                    limit: () => ({
                      maybeSingle: async () => {
                        if (col === "invoice_id" && col2 === "ingredient_id") {
                          const row = historyByInvoiceIngredient(val, val2);
                          return row
                            ? {
                                data: {
                                  id: row.id,
                                  created_at: row.created_at,
                                  previous_price: row.previous_price,
                                  new_price: row.new_price,
                                },
                                error: null,
                              }
                            : { data: null, error: null };
                        }
                        return { data: null, error: null };
                      },
                    }),
                  }),
                }),
              };
            }
            if (
              cols === "new_price, invoice_id" ||
              cols === "id,new_price,invoice_id,created_at,invoices(invoice_date, created_at)" ||
              cols === "new_price, invoice_id, created_at, id, invoices(invoice_date, created_at)" ||
              cols ===
                "new_price, ingredient_name, ingredient_unit, invoice_id, created_at, id, invoices(invoice_date, created_at)"
            ) {
              return buildHistoryQuery("select");
            }
            if (cols === "new_price") {
              return {
                eq: () => ({
                  not: () => ({
                    order: () => ({
                      limit: () => ({
                        maybeSingle: async () => ({
                          data:
                            options.latestHistoryNewPrice != null
                              ? {
                                  new_price: options.latestHistoryNewPrice,
                                  invoice_id: "inv-linked",
                                }
                              : null,
                          error: null,
                        }),
                      }),
                    }),
                  }),
                }),
              };
            }
            if (cols.includes("ingredient_id") && cols.includes("invoice_id")) {
              return buildHistoryQuery("select");
            }
            throw new Error(`unexpected select ${cols}`);
          },
          insert: (row: HistoryInsert) => {
            historyInserts.push(row);
            historyRows.push({ id: `insert-${historyRows.length}`, ...row });
            return Promise.resolve({ error: null });
          },
          update: (payload: HistoryInsert) => buildHistoryQuery("update", payload),
          delete: () => buildHistoryQuery("delete"),
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  };

  return { client, historyInserts, historyUpdates, historyRows, ingredient };
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

  it("refreshes existing invoice_id + ingredient_id on re-extract", async () => {
    const line = {
      name: "Ovo Gema 1kg",
      quantity: 6,
      unit: "un",
      unit_price: 10.49,
      total: 62.94,
    };
    const fields = operationalCostFieldsFromInvoiceLine(line);
    expect(fields?.purchase_quantity).toBe(1);
    const { client, historyInserts, historyUpdates, historyRows } = createPersistenceMockClient({
      ingredient: {
        name: "Gema líquida",
        unit: "kg",
        current_price: 10.49,
        purchase_quantity: fields!.purchase_quantity,
      },
      existingHistoryRows: [
        {
          id: "hist-april",
          ingredient_id: "ing-gema",
          invoice_id: "inv-april",
          ingredient_name: "Gema líquida",
          ingredient_unit: "kg",
          previous_price: null,
          new_price: 1.698,
          created_at: "2026-04-17T12:00:00.000Z",
        },
        {
          id: "e143080d",
          ingredient_id: "ing-gema",
          invoice_id: "inv-may",
          ingredient_name: "Gema líquida",
          ingredient_unit: "kg",
          previous_price: 1.698,
          new_price: 0.9,
          delta: -0.798,
          delta_percent: -47,
          created_at: "2026-05-19T12:00:00.000Z",
        },
      ],
    });
    const result = await persistOperationalIngredientCostFromInvoiceLine(
      client as never,
      "ing-gema",
      line,
      { priceHistory: { invoiceId: "inv-may", supplierName: "Aviludo" } },
    );
    expect(result.updated).toBe(true);
    expect(result.historyInserted).toBe(true);
    expect(historyInserts).toHaveLength(0);
    const mayUpdate = historyUpdates.find((entry) => entry.id === "e143080d");
    expect(mayUpdate).toBeDefined();
    expect(mayUpdate?.payload.new_price).toBeCloseTo(10.49, 4);
    expect(mayUpdate?.payload.new_price).not.toBeCloseTo(10.49 / 6, 4);
    expect(mayUpdate?.payload.previous_price).toBeCloseTo(1.698, 4);
    const mayRow = historyRows.find((row) => row.id === "e143080d");
    expect(mayRow?.created_at).toBe("2026-05-19T12:00:00.000Z");
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

  it("stores per-pack operational price for multi-un Atum line with line total", async () => {
    const line = {
      name: "Atum Óleo Bolsa Nau Catrineta 1 Kg",
      quantity: 2,
      unit: "un",
      unit_price: 6.29,
      total: 12.58,
    };
    const fields = operationalCostFieldsFromInvoiceLine(line);
    expect(fields?.purchase_quantity).toBe(1);
    const { client, historyInserts } = createPersistenceMockClient({
      ingredient: {
        name: "Atum em óleo",
        unit: "kg",
        current_price: 6.55,
        purchase_quantity: 2,
      },
    });

    await persistOperationalIngredientCostFromInvoiceLine(client as never, "ing-atum", line, {
      priceHistory: { invoiceId: "inv-atum", supplierName: "Aviludo" },
    });

    expect(historyInserts[0].new_price).toBeCloseTo(6.29, 2);
    expect(historyInserts[0].new_price).not.toBeCloseTo(6.29 / 2, 4);
  });

  it("stores per-pack operational price for multi-un Gema line with line total", async () => {
    const line = {
      name: "Ovo Gema 1kg",
      quantity: 6,
      unit: "un",
      unit_price: 10.19,
      total: 61.14,
    };
    const fields = operationalCostFieldsFromInvoiceLine(line);
    expect(fields?.purchase_quantity).toBe(1);
    const { client, historyInserts } = createPersistenceMockClient({
      ingredient: {
        name: "Gema líquida",
        unit: "kg",
        current_price: 8.43,
        purchase_quantity: 1,
      },
    });

    await persistOperationalIngredientCostFromInvoiceLine(client as never, "ing-gema", line, {
      priceHistory: { invoiceId: "inv-gema", supplierName: "Aviludo" },
    });

    expect(historyInserts[0].new_price).toBeCloseTo(10.19, 2);
    expect(historyInserts[0].new_price).not.toBeCloseTo(10.19 / 6, 4);
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
      existingHistoryRows: [
        {
          id: "hist-prior",
          ingredient_id: "ing-1",
          invoice_id: "inv-prior",
          ingredient_name: "Brioche Burger Bun 80g",
          ingredient_unit: "un",
          previous_price: null,
          new_price: 0.2,
          created_at: "2026-01-01T12:00:00.000Z",
        },
      ],
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
          id: "h0",
          ingredient_id: "beef-1",
          invoice_id: "inv-0",
          ingredient_name: "Novilho",
          supplier_name: "Alpha Foods",
          ingredient_unit: "kg",
          previous_price: null,
          new_price: 10,
          delta: null,
          delta_percent: null,
          created_at: "2026-04-01T12:00:00.000Z",
        },
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
