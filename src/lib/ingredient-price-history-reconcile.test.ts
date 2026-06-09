import { describe, expect, it } from "vitest";
import {
  collectIngredientIdsForInvoiceHistory,
  reconcileAfterInvoiceDelete,
  reconcileIngredientPriceHistoryChain,
} from "@/lib/ingredient-price-history-reconcile";

type InvoiceMeta = {
  invoice_date: string | null;
  created_at: string | null;
};

type HistoryRow = {
  id: string;
  ingredient_id: string;
  invoice_id: string | null;
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

function createReconcileMockClient(seed: HistoryRow[]) {
  const rows = seed.map((row) => ({ ...row }));

  function queryHistory() {
    const filters: Array<(row: HistoryRow) => boolean> = [];
    let mode: "select" | "delete" | "update" = "select";
    let updatePayload: Partial<HistoryRow> | null = null;
    let orderAsc: boolean | null = null;

    const builder = {
      select(_cols: string) {
        if (mode !== "delete" && mode !== "update") {
          mode = "select";
        }
        return builder;
      },
      delete() {
        mode = "delete";
        return builder;
      },
      update(payload: Partial<HistoryRow>) {
        mode = "update";
        updatePayload = payload;
        return builder;
      },
      eq(col: keyof HistoryRow, val: string) {
        filters.push((row) => String(row[col]) === val);
        return builder;
      },
      is(col: keyof HistoryRow, val: null) {
        filters.push((row) => row[col] === val);
        return builder;
      },
      not(col: keyof HistoryRow, _op: string, _val: null) {
        filters.push((row) => row[col] != null);
        return builder;
      },
      order(_col: keyof HistoryRow, opts: { ascending: boolean }) {
        orderAsc = opts.ascending;
        return builder;
      },
      async then<TResult1 = { data: unknown; error: null }, TResult2 = never>(
        resolve?: (value: { data: unknown; error: null }) => TResult1 | TResult2,
      ) {
        const matched = rows.filter((row) => filters.every((filter) => filter(row)));

        if (mode === "delete") {
          for (const row of matched) {
            const index = rows.indexOf(row);
            if (index >= 0) rows.splice(index, 1);
          }
          const result = { data: matched.map((row) => ({ id: row.id })), error: null as const };
          return resolve ? resolve(result) : result;
        }

        if (mode === "update") {
          for (const row of matched) {
            Object.assign(row, updatePayload);
          }
          const result = { error: null as const };
          return resolve ? resolve(result as { data: unknown; error: null }) : result;
        }

        let selected = [...matched];
        if (orderAsc != null) {
          selected = selected.sort((a, b) =>
            orderAsc
              ? a.created_at.localeCompare(b.created_at)
              : b.created_at.localeCompare(a.created_at),
          );
        }

        const result = {
          data: selected.map((row) => ({
            ...row,
            invoices: invoiceMetaForRow(row),
          })),
          error: null as const,
        };
        return resolve ? resolve(result) : result;
      },
    };

    return builder;
  }

  const client = {
    from(table: string) {
      if (table !== "ingredient_price_history") {
        throw new Error(`unexpected table: ${table}`);
      }
      return queryHistory();
    },
  };

  return { client: client as never, rows };
}

describe("collectIngredientIdsForInvoiceHistory", () => {
  it("returns distinct ingredient ids for an invoice", async () => {
    const { client } = createReconcileMockClient([
      {
        id: "h1",
        ingredient_id: "ing-a",
        invoice_id: "inv-april",
        previous_price: 1,
        new_price: 2,
        delta: 1,
        delta_percent: 100,
        created_at: "2026-04-17T12:00:00.000Z",
      },
      {
        id: "h2",
        ingredient_id: "ing-b",
        invoice_id: "inv-april",
        previous_price: 3,
        new_price: 4,
        delta: 1,
        delta_percent: 33,
        created_at: "2026-04-17T12:00:00.000Z",
      },
    ]);

    const ids = await collectIngredientIdsForInvoiceHistory(client, "inv-april");
    expect(ids.sort()).toEqual(["ing-a", "ing-b"]);
  });
});

describe("reconcileIngredientPriceHistoryChain", () => {
  it("deletes orphans and nulls previous_price on sole surviving linked row", async () => {
    const { client, rows } = createReconcileMockClient([
      {
        id: "orphan",
        ingredient_id: "ing-gema",
        invoice_id: null,
        previous_price: 0.00843,
        new_price: 1.698,
        delta: 1.69,
        delta_percent: 20046,
        created_at: "2026-04-17T12:00:00.000Z",
      },
      {
        id: "linked-may",
        ingredient_id: "ing-gema",
        invoice_id: "inv-may",
        previous_price: 1.698,
        new_price: 0.9,
        delta: -0.798,
        delta_percent: -47,
        created_at: "2026-05-19T12:00:00.000Z",
      },
    ]);

    const result = await reconcileIngredientPriceHistoryChain(client, "ing-gema");
    expect(result.orphansDeleted).toBe(1);
    expect(result.rowsUpdated).toBe(1);
    expect(result.linkedRowCount).toBe(1);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: "linked-may",
      previous_price: null,
      delta: null,
      delta_percent: null,
    });
  });

  it("rechains multiple linked rows chronologically", async () => {
    const { client, rows } = createReconcileMockClient([
      {
        id: "may",
        ingredient_id: "ing-arroz",
        invoice_id: "inv-may",
        previous_price: 1.042,
        new_price: 1.39,
        delta: 0.348,
        delta_percent: 33.4,
        created_at: "2026-05-19T12:00:00.000Z",
      },
      {
        id: "june",
        ingredient_id: "ing-arroz",
        invoice_id: "inv-june",
        previous_price: 99,
        new_price: 1.5,
        delta: -97.5,
        delta_percent: -98,
        created_at: "2026-06-01T12:00:00.000Z",
      },
    ]);

    const result = await reconcileIngredientPriceHistoryChain(client, "ing-arroz");
    expect(result.orphansDeleted).toBe(0);
    expect(result.rowsUpdated).toBe(2);
    expect(rows[0]?.previous_price).toBeNull();
    expect(rows[1]?.previous_price).toBe(1.39);
    expect(rows[1]?.delta_percent).toBeCloseTo(((1.5 - 1.39) / 1.39) * 100, 4);
  });

  it("orders by invoice_date when created_at disagrees (Gema re-extract refresh)", async () => {
    const { client, rows } = createReconcileMockClient([
      {
        id: "hist-may",
        ingredient_id: "ing-gema",
        invoice_id: "inv-may",
        previous_price: 1.698333,
        new_price: 1.748333,
        delta: 0.05,
        delta_percent: 2.94,
        created_at: "2023-05-19T12:00:00.000Z",
        invoices: {
          invoice_date: "2026-05-19",
          created_at: "2023-05-19T12:00:00.000Z",
        },
      },
      {
        id: "hist-april",
        ingredient_id: "ing-gema",
        invoice_id: "inv-april",
        previous_price: 1.748333,
        new_price: 1.698333,
        delta: -0.05,
        delta_percent: -2.86,
        created_at: "2026-04-17T12:00:00.000Z",
        invoices: {
          invoice_date: "2026-04-17",
          created_at: "2026-04-17T12:00:00.000Z",
        },
      },
    ]);

    const result = await reconcileIngredientPriceHistoryChain(client, "ing-gema");
    expect(result.orphansDeleted).toBe(0);
    expect(result.rowsUpdated).toBe(2);
    expect(result.linkedRowCount).toBe(2);

    const april = rows.find((row) => row.id === "hist-april");
    const may = rows.find((row) => row.id === "hist-may");
    expect(april).toMatchObject({
      previous_price: null,
      new_price: 1.698333,
      delta: null,
      delta_percent: null,
    });
    expect(may).toMatchObject({
      previous_price: 1.698333,
      new_price: 1.748333,
    });
    expect(may?.delta_percent).toBeCloseTo(((1.748333 - 1.698333) / 1.698333) * 100, 2);
  });
});

describe("reconcileAfterInvoiceDelete", () => {
  it("reconciles each affected ingredient once", async () => {
    const { client } = createReconcileMockClient([
      {
        id: "o1",
        ingredient_id: "ing-a",
        invoice_id: null,
        previous_price: 1,
        new_price: 2,
        delta: 1,
        delta_percent: 100,
        created_at: "2026-04-17T12:00:00.000Z",
      },
      {
        id: "l1",
        ingredient_id: "ing-a",
        invoice_id: "inv-may",
        previous_price: 2,
        new_price: 3,
        delta: 1,
        delta_percent: 50,
        created_at: "2026-05-19T12:00:00.000Z",
      },
    ]);

    const summary = await reconcileAfterInvoiceDelete(client, "inv-april", ["ing-a", "ing-a"]);
    expect(summary.ingredients).toHaveLength(1);
    expect(summary.ingredients[0]?.orphansDeleted).toBe(1);
    expect(summary.ingredients[0]?.rowsUpdated).toBe(1);
  });
});
