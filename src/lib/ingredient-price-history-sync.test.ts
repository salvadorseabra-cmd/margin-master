import { describe, expect, it } from "vitest";
import {
  appendIngredientPriceHistoryFromInvoiceLine,
  deleteIngredientPriceHistoryForInvoiceIngredient,
  fetchLatestHistoryNewPrice,
  operationalUnitPriceForPriceHistory,
  syncIngredientCurrentPrice,
} from "@/lib/ingredient-price-history";
import { persistOperationalIngredientCostFromInvoiceLine } from "@/lib/ingredient-auto-persist";
import { syncIngredientProcurementPrice } from "@/lib/ingredient-procurement-price-sync";

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

type InvoiceItemRow = {
  id: string;
  invoice_id: string;
  name: string;
  quantity: number | null;
  unit: string | null;
  unit_price: number | null;
  total: number | null;
  invoices?: InvoiceMeta | null;
};

function createSyncMockClient(options: {
  ingredient: {
    id?: string;
    name: string;
    normalized_name?: string;
    unit: string | null;
    current_price: number | null;
    purchase_quantity: number | null;
    purchase_unit?: string | null;
    base_unit?: string | null;
  };
  historyRows: HistoryRow[];
  invoiceItems?: InvoiceItemRow[];
}) {
  const historyRows = options.historyRows.map((row) => ({ ...row }));
  const invoiceItems = (options.invoiceItems ?? []).map((row) => ({ ...row }));
  const ingredient = {
    id: options.ingredient.id ?? "ing-tomato",
    normalized_name: options.ingredient.normalized_name ?? options.ingredient.name.toLowerCase(),
    purchase_unit: options.ingredient.purchase_unit ?? null,
    base_unit: options.ingredient.base_unit ?? null,
    ...options.ingredient,
  };

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
              if (payload.purchase_unit != null) {
                ingredient.purchase_unit = payload.purchase_unit as string;
              }
              if (payload.base_unit != null) {
                ingredient.base_unit = payload.base_unit as string;
              }
              if (payload.unit != null) {
                ingredient.unit = payload.unit as string;
              }
              return { error: null };
            },
          }),
        };
      }
      if (table === "invoice_items") {
        return {
          select: (_cols: string) => ({
            in: (_col: string, invoiceIds: string[]) => {
              const matched = invoiceItems.filter((row) => invoiceIds.includes(row.invoice_id));
              return Promise.resolve({
                data: matched.map((row) => ({
                  ...row,
                  invoices:
                    row.invoices ??
                    ({
                      invoice_date: null,
                      created_at: null,
                      supplier_name: null,
                    } as InvoiceMeta & { supplier_name: string | null }),
                })),
                error: null,
              });
            },
          }),
        };
      }
      if (table === "ingredient_aliases") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => Promise.resolve({ data: [], error: null }),
            }),
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
                cols.includes("invoices(invoice_date,created_at)") ||
                cols.includes("id,new_price"))
            ) {
              return buildHistoryQuery("select");
            }
            if (
              cols.includes("invoice_id") &&
              cols.includes("created_at") &&
              cols.includes("invoices")
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

  return { client, historyRows, ingredient, invoiceItems };
}

function tomatoInvoiceItems(): InvoiceItemRow[] {
  return [
    {
      id: "item-jan",
      invoice_id: "inv-jan",
      name: "Tomato",
      quantity: 1,
      unit: "kg",
      unit_price: 8,
      total: 8,
      invoices: { invoice_date: "2026-01-15", created_at: "2026-01-15T12:00:00.000Z" },
    },
    {
      id: "item-feb",
      invoice_id: "inv-feb",
      name: "Tomato",
      quantity: 1,
      unit: "kg",
      unit_price: 9,
      total: 9,
      invoices: { invoice_date: "2026-02-15", created_at: "2026-02-15T12:00:00.000Z" },
    },
    {
      id: "item-mar",
      invoice_id: "inv-mar",
      name: "Tomato",
      quantity: 1,
      unit: "kg",
      unit_price: 10,
      total: 10,
      invoices: { invoice_date: "2026-03-15", created_at: "2026-03-15T12:00:00.000Z" },
    },
  ];
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
      new_price: 0.008,
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
      previous_price: 0.008,
      new_price: 0.009,
      delta: 0.001,
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
      previous_price: 0.009,
      new_price: 0.01,
      delta: 0.001,
      delta_percent: 11.11,
      created_at: "2026-03-15T12:00:00.000Z",
      invoices: { invoice_date: "2026-03-15", created_at: "2026-03-15T12:00:00.000Z" },
    },
  ];
}

describe("syncIngredientProcurementPrice", () => {
  it("Case A: Peroni 24×33cl €1.07/bottle → current_price=1.07 not operational×24", async () => {
    const operational = operationalUnitPriceForPriceHistory(1.07, 7920);
    expect(operational).toBeCloseTo(0.000135, 6);

    const { client, ingredient } = createSyncMockClient({
      ingredient: {
        id: "ing-peroni",
        name: "Peroni",
        unit: "un",
        current_price: 22,
        purchase_quantity: 24,
        purchase_unit: "un",
        base_unit: "un",
      },
      historyRows: [
        {
          id: "hist-peroni",
          ingredient_id: "ing-peroni",
          invoice_id: "inv-peroni",
          previous_price: null,
          new_price: operational!,
          delta: null,
          delta_percent: null,
          created_at: "2026-03-01T12:00:00.000Z",
          invoices: { invoice_date: "2026-03-01", created_at: "2026-03-01T12:00:00.000Z" },
        },
      ],
      invoiceItems: [
        {
          id: "item-peroni",
          invoice_id: "inv-peroni",
          name: "Peroni 24x33cl",
          quantity: 24,
          unit: null,
          unit_price: 1.07,
          total: 25.68,
          invoices: { invoice_date: "2026-03-01", created_at: "2026-03-01T12:00:00.000Z" },
        },
      ],
    });

    const result = await syncIngredientProcurementPrice(client as never, "ing-peroni");

    expect(result.updated).toBe(true);
    expect(result.currentPrice).toBe(1.07);
    expect(ingredient.current_price).toBe(1.07);
    expect(ingredient.current_price).not.toBeCloseTo(operational! * 24, 4);
  });

  it("Case B: San Pellegrino 15×75cl €19.28 case → current_price=19.28 not history×15", async () => {
    const operational = operationalUnitPriceForPriceHistory(19.28, 11250);
    expect(operational).toBeCloseTo(0.001714, 5);

    const { client, ingredient } = createSyncMockClient({
      ingredient: {
        id: "ing-sp",
        name: "SanPellegrino - Acqua in vitro 75cl x 15ud",
        unit: "un",
        current_price: 18,
        purchase_quantity: 15,
        purchase_unit: "un",
        base_unit: "un",
      },
      historyRows: [
        {
          id: "hist-sp",
          ingredient_id: "ing-sp",
          invoice_id: "inv-sp",
          previous_price: null,
          new_price: operational!,
          delta: null,
          delta_percent: null,
          created_at: "2026-02-10T12:00:00.000Z",
          invoices: { invoice_date: "2026-02-10", created_at: "2026-02-10T12:00:00.000Z" },
        },
      ],
      invoiceItems: [
        {
          id: "item-sp",
          invoice_id: "inv-sp",
          name: "SanPellegrino - Acqua in vitro 75cl x 15ud",
          quantity: 1,
          unit: "un",
          unit_price: 19.28,
          total: 19.28,
          invoices: { invoice_date: "2026-02-10", created_at: "2026-02-10T12:00:00.000Z" },
        },
      ],
    });

    const result = await syncIngredientProcurementPrice(client as never, "ing-sp");

    expect(result.updated).toBe(true);
    expect(result.currentPrice).toBe(19.28);
    expect(ingredient.current_price).toBe(19.28);
    expect(ingredient.current_price).not.toBeCloseTo(operational! * 15, 4);
  });

  it("Case C: Aceto 2×5L €15.55 → current_price=15.55", async () => {
    const { client, ingredient } = createSyncMockClient({
      ingredient: {
        id: "ing-aceto",
        name: "Aceto balsamico di modena IGP",
        unit: "ml",
        current_price: 16,
        purchase_quantity: 10000,
      },
      historyRows: [
        {
          id: "hist-aceto",
          ingredient_id: "ing-aceto",
          invoice_id: "inv-aceto",
          previous_price: null,
          new_price: operationalUnitPriceForPriceHistory(15.55, 10000)!,
          delta: null,
          delta_percent: null,
          created_at: "2026-01-20T12:00:00.000Z",
          invoices: { invoice_date: "2026-01-20", created_at: "2026-01-20T12:00:00.000Z" },
        },
      ],
      invoiceItems: [
        {
          id: "item-aceto",
          invoice_id: "inv-aceto",
          name: "Aceto balsamico di modena IGP pet 5l*2 Toschi",
          quantity: 1,
          unit: "un",
          unit_price: 15.55,
          total: 15.55,
          invoices: { invoice_date: "2026-01-20", created_at: "2026-01-20T12:00:00.000Z" },
        },
      ],
    });

    const result = await syncIngredientProcurementPrice(client as never, "ing-aceto");

    expect(result.updated).toBe(true);
    expect(result.currentPrice).toBe(15.55);
    expect(ingredient.current_price).toBe(15.55);
  });

  it("Case D: delete latest history → current_price from prior procurement invoice", async () => {
    const { client, ingredient, historyRows } = createSyncMockClient({
      ingredient: {
        id: "ing-tomato",
        name: "Tomato",
        unit: "kg",
        current_price: 10,
        purchase_quantity: 1000,
      },
      historyRows: janFebMarRows("ing-tomato"),
      invoiceItems: tomatoInvoiceItems(),
    });

    await deleteIngredientPriceHistoryForInvoiceIngredient(client as never, "inv-mar", "ing-tomato");
    expect(historyRows.some((row) => row.invoice_id === "inv-mar")).toBe(false);

    const result = await syncIngredientProcurementPrice(client as never, "ing-tomato");

    expect(result.updated).toBe(true);
    expect(result.currentPrice).toBe(9);
    expect(ingredient.current_price).toBe(9);
  });

  it("Case E: exclude unmatched invoice → current_price from next procurement invoice", async () => {
    const { client, ingredient } = createSyncMockClient({
      ingredient: {
        id: "ing-tomato",
        name: "Tomato",
        unit: "kg",
        current_price: 10,
        purchase_quantity: 1000,
      },
      historyRows: janFebMarRows("ing-tomato"),
      invoiceItems: tomatoInvoiceItems(),
    });

    const result = await syncIngredientProcurementPrice(client as never, "ing-tomato", {
      excludeInvoiceId: "inv-mar",
    });

    expect(result.updated).toBe(true);
    expect(result.currentPrice).toBe(9);
    expect(ingredient.current_price).toBe(9);
  });
});

describe("syncIngredientCurrentPrice (deprecated wrapper)", () => {
  it("Scenario A: re-read Jan keeps current_price at Mar €10", async () => {
    const { client, ingredient } = createSyncMockClient({
      ingredient: {
        id: "ing-tomato",
        name: "Tomato",
        unit: "kg",
        current_price: 10,
        purchase_quantity: 1000,
      },
      historyRows: janFebMarRows("ing-tomato"),
      invoiceItems: tomatoInvoiceItems(),
    });

    await appendIngredientPriceHistoryFromInvoiceLine(client as never, {
      ingredientId: "ing-tomato",
      invoiceId: "inv-jan",
      ingredientName: "Tomato",
      ingredientUnit: "kg",
      previousPrice: 10,
      previousOperationalPrice: 8,
      newPrice: 8,
      previousPurchaseQuantity: 1000,
      newPurchaseQuantity: 1000,
      invoiceDate: "2026-01-15",
    });
    const result = await syncIngredientCurrentPrice(client as never, "ing-tomato");

    expect(result.currentPrice).toBe(10);
    expect(ingredient.current_price).toBe(10);
  });

  it("Scenario B: delete March → current_price becomes €9", async () => {
    const { client, ingredient } = createSyncMockClient({
      ingredient: {
        id: "ing-tomato",
        name: "Tomato",
        unit: "kg",
        current_price: 10,
        purchase_quantity: 1000,
      },
      historyRows: janFebMarRows("ing-tomato"),
      invoiceItems: tomatoInvoiceItems(),
    });

    await deleteIngredientPriceHistoryForInvoiceIngredient(client as never, "inv-mar", "ing-tomato");
    const result = await syncIngredientCurrentPrice(client as never, "ing-tomato");

    expect(result.updated).toBe(true);
    expect(result.currentPrice).toBe(9);
    expect(ingredient.current_price).toBe(9);
  });

  it("Scenario C: delete Feb after Mar removed → current_price becomes €8", async () => {
    const { client, ingredient } = createSyncMockClient({
      ingredient: {
        id: "ing-tomato",
        name: "Tomato",
        unit: "kg",
        current_price: 9,
        purchase_quantity: 1000,
      },
      historyRows: janFebMarRows("ing-tomato").filter((row) => row.invoice_id !== "inv-mar"),
      invoiceItems: tomatoInvoiceItems().filter((row) => row.invoice_id !== "inv-mar"),
    });

    await deleteIngredientPriceHistoryForInvoiceIngredient(client as never, "inv-feb", "ing-tomato");
    const result = await syncIngredientCurrentPrice(client as never, "ing-tomato");

    expect(result.updated).toBe(true);
    expect(result.currentPrice).toBe(8);
    expect(ingredient.current_price).toBe(8);
  });

  it("Scenario D: delete final history row → current_price unchanged (no linked invoices)", async () => {
    const { client, ingredient } = createSyncMockClient({
      ingredient: {
        id: "ing-tomato",
        name: "Tomato",
        unit: "kg",
        current_price: 8,
        purchase_quantity: 1000,
      },
      historyRows: [
        {
          id: "hist-jan",
          ingredient_id: "ing-tomato",
          invoice_id: "inv-jan",
          previous_price: null,
          new_price: 0.008,
          delta: null,
          delta_percent: null,
          created_at: "2026-01-15T12:00:00.000Z",
          invoices: { invoice_date: "2026-01-15", created_at: "2026-01-15T12:00:00.000Z" },
        },
      ],
      invoiceItems: tomatoInvoiceItems(),
    });

    await deleteIngredientPriceHistoryForInvoiceIngredient(client as never, "inv-jan", "ing-tomato");
    const result = await syncIngredientCurrentPrice(client as never, "ing-tomato");

    expect(result.updated).toBe(false);
    expect(ingredient.current_price).toBe(8);
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
        id: "ing-pack",
        name: "Widget",
        unit: "un",
        current_price: 10,
        purchase_quantity: 1,
      },
      historyRows: rows,
      invoiceItems: [
        {
          id: "item-jan",
          invoice_id: "inv-jan",
          name: "Widget",
          quantity: 1,
          unit: "un",
          unit_price: 8,
          total: 8,
          invoices: { invoice_date: "2026-01-15", created_at: "2026-01-15T12:00:00.000Z" },
        },
        {
          id: "item-feb",
          invoice_id: "inv-feb",
          name: "Widget",
          quantity: 1,
          unit: "un",
          unit_price: 9,
          total: 9,
          invoices: { invoice_date: "2026-02-15", created_at: "2026-02-15T12:00:00.000Z" },
        },
        {
          id: "item-mar",
          invoice_id: "inv-mar",
          name: "Widget",
          quantity: 1,
          unit: "un",
          unit_price: 10,
          total: 10,
          invoices: { invoice_date: "2026-03-15", created_at: "2026-03-15T12:00:00.000Z" },
        },
      ],
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
