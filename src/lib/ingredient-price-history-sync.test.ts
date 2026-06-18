import { describe, expect, it } from "vitest";
import {
  appendIngredientPriceHistoryFromInvoiceLine,
  deleteIngredientPriceHistoryForInvoiceIngredient,
  fetchLatestHistoryNewPrice,
  syncIngredientCurrentPrice,
} from "@/lib/ingredient-price-history";
import { persistOperationalIngredientCostFromInvoiceLine } from "@/lib/ingredient-auto-persist";

type InvoiceMeta = {
  invoice_date: string | null;
  created_at: string | null;
};

type HistoryRow = {
  id: string;
  ingredient_id: string;
  invoice_id: string | null;
  ingredient_name?: string;
  ingredient_unit?: string | null;
  previous_price: number | null;
  new_price: number;
  delta: number | null;
  delta_percent: number | null;
  created_at: string;
  invoices?: InvoiceMeta | null;
};

function invoiceMetaForRow(row: HistoryRow): InvoiceMeta | null {
  if (row.invoices) return row.invoices;
  if (!row.invoice_id) return null;
  const date = row.created_at.includes("T") ? row.created_at.slice(0, 10) : row.created_at;
  return { invoice_date: date, created_at: row.created_at };
}

function createSyncMockClient(options: {
  ingredient: {
    name: string;
    unit: string | null;
    current_price: number | null;
    purchase_quantity: number | null;
  };
  historyRows: HistoryRow[];
}) {
  const historyRows = options.historyRows.map((row) => ({ ...row }));
  const ingredient = { ...options.ingredient };

  function historyByInvoiceIngredient(invoiceId: string, ingredientId: string) {
    return historyRows.find(
      (row) => row.invoice_id === invoiceId && row.ingredient_id === ingredientId,
    );
  }

  function withInvoiceJoin(row: HistoryRow) {
    return { ...row, invoices: invoiceMetaForRow(row) };
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
              if (payload.current_price !== undefined) {
                ingredient.current_price = payload.current_price as number | null;
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
          updatePayload?: Partial<HistoryRow>,
        ) => {
          const filters: Array<(row: HistoryRow) => boolean> = [];
          let orderAsc: boolean | null = null;

          const builder = {
            select(_cols: string) {
              return builder;
            },
            delete() {
              return buildHistoryQuery("delete");
            },
            update(payload: Partial<HistoryRow>) {
              return buildHistoryQuery("update", payload);
            },
            eq(col: keyof HistoryRow, val: string) {
              filters.push((row) => String(row[col]) === val);
              return builder;
            },
            is(col: keyof HistoryRow, val: null) {
              filters.push((row) => (row[col] ?? null) === val);
              return builder;
            },
            not(col: keyof HistoryRow, _op: string, _val: null) {
              filters.push((row) => row[col] != null);
              return builder;
            },
            neq(col: keyof HistoryRow, val: string) {
              filters.push((row) => String(row[col]) !== val);
              return builder;
            },
            order(_col: keyof HistoryRow, opts: { ascending: boolean }) {
              orderAsc = opts.ascending;
              return builder;
            },
            limit: () => builder,
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
              if (mode === "delete") {
                for (const entry of matched) {
                  const index = historyRows.indexOf(entry);
                  if (index >= 0) historyRows.splice(index, 1);
                }
                return { data: matched.map((entry) => ({ id: entry.id })), error: null };
              }
              if (mode === "update" && updatePayload && row) {
                Object.assign(row, updatePayload);
                return { data: null, error: null };
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
              if (mode === "delete") {
                for (const entry of matched) {
                  const index = historyRows.indexOf(entry);
                  if (index >= 0) historyRows.splice(index, 1);
                }
                const result = { data: matched.map((entry) => ({ id: entry.id })), error: null as const };
                return resolve ? resolve(result) : result;
              }
              if (mode === "update" && updatePayload) {
                for (const row of matched) {
                  Object.assign(row, updatePayload);
                }
                const result = { error: null as const };
                return resolve ? resolve(result as { data: unknown; error: null }) : result;
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
              cols.includes("new_price") &&
              (cols.includes("invoices(invoice_date, created_at)") ||
                cols.includes("id,new_price"))
            ) {
              return buildHistoryQuery("select");
            }
            if (cols.includes("ingredient_id") && cols.includes("invoice_id")) {
              return buildHistoryQuery("select");
            }
            throw new Error(`unexpected select ${cols}`);
          },
          insert: (row: HistoryRow) => {
            historyRows.push({ id: `insert-${historyRows.length}`, ...row });
            return Promise.resolve({ error: null });
          },
          update: (payload: Partial<HistoryRow>) => buildHistoryQuery("update", payload),
          delete: () => buildHistoryQuery("delete"),
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  };

  return { client, historyRows, ingredient };
}

function janFebMarRows(ingredientId: string): HistoryRow[] {
  return [
    {
      id: "hist-jan",
      ingredient_id: ingredientId,
      invoice_id: "inv-jan",
      ingredient_name: "Tomato",
      ingredient_unit: "kg",
      previous_price: null,
      new_price: 8,
      delta: null,
      delta_percent: null,
      created_at: "2026-01-15T12:00:00.000Z",
      invoices: { invoice_date: "2026-01-15", created_at: "2026-01-15T12:00:00.000Z" },
    },
    {
      id: "hist-feb",
      ingredient_id: ingredientId,
      invoice_id: "inv-feb",
      ingredient_name: "Tomato",
      ingredient_unit: "kg",
      previous_price: 8,
      new_price: 9,
      delta: 1,
      delta_percent: 12.5,
      created_at: "2026-02-15T12:00:00.000Z",
      invoices: { invoice_date: "2026-02-15", created_at: "2026-02-15T12:00:00.000Z" },
    },
    {
      id: "hist-mar",
      ingredient_id: ingredientId,
      invoice_id: "inv-mar",
      ingredient_name: "Tomato",
      ingredient_unit: "kg",
      previous_price: 9,
      new_price: 10,
      delta: 1,
      delta_percent: 11.11,
      created_at: "2026-03-15T12:00:00.000Z",
      invoices: { invoice_date: "2026-03-15", created_at: "2026-03-15T12:00:00.000Z" },
    },
  ];
}

describe("syncIngredientCurrentPrice", () => {
  it("Scenario A: re-read Jan keeps current_price at Mar €10", async () => {
    const { client, ingredient } = createSyncMockClient({
      ingredient: {
        name: "Tomato",
        unit: "kg",
        current_price: 10,
        purchase_quantity: 1,
      },
      historyRows: janFebMarRows("ing-tomato"),
    });

    await appendIngredientPriceHistoryFromInvoiceLine(client as never, {
      ingredientId: "ing-tomato",
      invoiceId: "inv-jan",
      ingredientName: "Tomato",
      ingredientUnit: "kg",
      previousPrice: 10,
      previousOperationalPrice: 8,
      newPrice: 8,
      previousPurchaseQuantity: 1,
      newPurchaseQuantity: 1,
      invoiceDate: "2026-01-15",
    });
    const result = await syncIngredientCurrentPrice(client as never, "ing-tomato");

    expect(result.latestOperationalPrice).toBe(10);
    expect(ingredient.current_price).toBe(10);
  });

  it("Scenario B: delete March → current_price becomes €9", async () => {
    const { client, ingredient } = createSyncMockClient({
      ingredient: {
        name: "Tomato",
        unit: "kg",
        current_price: 10,
        purchase_quantity: 1,
      },
      historyRows: janFebMarRows("ing-tomato"),
    });

    await deleteIngredientPriceHistoryForInvoiceIngredient(client as never, "inv-mar", "ing-tomato");
    const result = await syncIngredientCurrentPrice(client as never, "ing-tomato");

    expect(result.updated).toBe(true);
    expect(result.latestOperationalPrice).toBe(9);
    expect(ingredient.current_price).toBe(9);
  });

  it("Scenario C: delete Feb after Mar removed → current_price becomes €8", async () => {
    const { client, ingredient } = createSyncMockClient({
      ingredient: {
        name: "Tomato",
        unit: "kg",
        current_price: 9,
        purchase_quantity: 1,
      },
      historyRows: janFebMarRows("ing-tomato").filter((row) => row.invoice_id !== "inv-mar"),
    });

    await deleteIngredientPriceHistoryForInvoiceIngredient(client as never, "inv-feb", "ing-tomato");
    const result = await syncIngredientCurrentPrice(client as never, "ing-tomato");

    expect(result.updated).toBe(true);
    expect(result.latestOperationalPrice).toBe(8);
    expect(ingredient.current_price).toBe(8);
  });

  it("Scenario D: delete final history row → current_price null fallback", async () => {
    const { client, ingredient } = createSyncMockClient({
      ingredient: {
        name: "Tomato",
        unit: "kg",
        current_price: 8,
        purchase_quantity: 1,
      },
      historyRows: [
        {
          id: "hist-jan",
          ingredient_id: "ing-tomato",
          invoice_id: "inv-jan",
          previous_price: null,
          new_price: 8,
          delta: null,
          delta_percent: null,
          created_at: "2026-01-15T12:00:00.000Z",
          invoices: { invoice_date: "2026-01-15", created_at: "2026-01-15T12:00:00.000Z" },
        },
      ],
    });

    await deleteIngredientPriceHistoryForInvoiceIngredient(client as never, "inv-jan", "ing-tomato");
    const result = await syncIngredientCurrentPrice(client as never, "ing-tomato");

    expect(result.updated).toBe(true);
    expect(result.latestOperationalPrice).toBeNull();
    expect(ingredient.current_price).toBeNull();
  });

  it("Scenario A via persist: re-read older invoice does not lower current_price", async () => {
    const rows = janFebMarRows("ing-pack").map((row) => ({
      ...row,
      ingredient_id: "ing-pack",
      ingredient_name: "Widget",
      ingredient_unit: "un",
    }));
    const { client, ingredient } = createSyncMockClient({
      ingredient: {
        name: "Widget",
        unit: "un",
        current_price: 10,
        purchase_quantity: 1,
      },
      historyRows: rows,
    });

    const line = { name: "Widget", quantity: 1, unit: "un", unit_price: 8 };
    await persistOperationalIngredientCostFromInvoiceLine(client as never, "ing-pack", line, {
      priceHistory: { invoiceId: "inv-jan", invoiceDate: "2026-01-15" },
    });

    expect(ingredient.purchase_quantity).toBe(1);
    expect(ingredient.current_price).toBe(10);
  });
});

describe("fetchLatestHistoryNewPrice chronology", () => {
  it("returns newest by invoice_date, not created_at DESC", async () => {
    const { client } = createSyncMockClient({
      ingredient: { name: "Tomato", unit: "kg", current_price: 10, purchase_quantity: 1 },
      historyRows: [
        {
          id: "hist-jan",
          ingredient_id: "ing-tomato",
          invoice_id: "inv-jan",
          previous_price: null,
          new_price: 8,
          delta: null,
          delta_percent: null,
          created_at: "2026-06-01T12:00:00.000Z",
          invoices: { invoice_date: "2026-01-15", created_at: "2026-06-01T12:00:00.000Z" },
        },
        {
          id: "hist-mar",
          ingredient_id: "ing-tomato",
          invoice_id: "inv-mar",
          previous_price: 8,
          new_price: 10,
          delta: 2,
          delta_percent: 25,
          created_at: "2026-01-01T12:00:00.000Z",
          invoices: { invoice_date: "2026-03-15", created_at: "2026-01-01T12:00:00.000Z" },
        },
      ],
    });

    const latest = await fetchLatestHistoryNewPrice(client as never, "ing-tomato");
    expect(latest).toBe(10);
  });
});
