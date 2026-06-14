import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import type { AppSupabaseClient } from "@/lib/invoice-item-match-repository";
import type { InvoiceItemMatchRow } from "@/lib/invoice-item-match-types";
import * as correctionMemory from "@/lib/ingredient-correction-memory";
import * as matchLifecycleFlags from "@/lib/match-lifecycle-flags";
import { unmatchInvoiceLineMatch } from "@/lib/match-lifecycle-unmatch";

const PEPINO_CONSERVA_ID = "635a1189-36ea-4ff2-9012-8172ab1ab81d";
const BIDFOOD_INVOICE_ID = "da472b7f-0fd9-4a26-a37c-80ad335f7f7e";
const PEPINO_LINE_ID = "8e9e727a-1d02-41f7-88e7-8eeea59c8b57";
const POISON_HISTORY_ID = "a689bd91-5b83-41d9-b060-b5a63ccfb3b4";

type HistoryRow = {
  id: string;
  ingredient_id: string;
  invoice_id: string;
  ingredient_name: string;
  supplier_name: string | null;
  ingredient_unit: string | null;
  previous_price: number | null;
  new_price: number;
  delta: number | null;
  delta_percent: number | null;
  created_at: string;
  invoices?: { invoice_date: string | null; created_at: string | null } | null;
};

function createPepinoUnmatchMock() {
  const matchRows = new Map<string, InvoiceItemMatchRow>([
    [
      PEPINO_LINE_ID,
      {
        invoice_item_id: PEPINO_LINE_ID,
        user_id: "user-1",
        invoice_id: BIDFOOD_INVOICE_ID,
        ingredient_id: PEPINO_CONSERVA_ID,
        status: "confirmed",
        match_kind: "exact",
        confirmed_at: "2026-06-09T22:36:41.000Z",
        corrected_at: null,
        previous_ingredient_id: null,
        pack_variant_id: null,
        created_at: "2026-06-09T22:36:41.000Z",
        updated_at: "2026-06-09T22:36:41.000Z",
      },
    ],
  ]);

  const historyRows = new Map<string, HistoryRow>([
    [
      POISON_HISTORY_ID,
      {
        id: POISON_HISTORY_ID,
        ingredient_id: PEPINO_CONSERVA_ID,
        invoice_id: BIDFOOD_INVOICE_ID,
        ingredient_name: "Pepino conserva",
        supplier_name: "Bidfood",
        ingredient_unit: "kg",
        previous_price: 3.748,
        new_price: 0.00177,
        delta: -3.74623,
        delta_percent: -99.95,
        created_at: "2026-05-25T12:00:00.000Z",
        invoices: { invoice_date: "2026-05-25", created_at: "2026-06-09T22:36:41.000Z" },
      },
    ],
    [
      "d723199d-jar",
      {
        id: "d723199d-jar",
        ingredient_id: PEPINO_CONSERVA_ID,
        invoice_id: "inv-april",
        ingredient_name: "Pepino conserva",
        supplier_name: null,
        ingredient_unit: "kg",
        previous_price: null,
        new_price: 3.665,
        delta: null,
        delta_percent: null,
        created_at: "2026-04-17T12:00:00.000Z",
        invoices: { invoice_date: "2026-04-17", created_at: "2026-04-17T12:00:00.000Z" },
      },
    ],
  ]);

  const ingredients = new Map([
    [
      PEPINO_CONSERVA_ID,
      {
        id: PEPINO_CONSERVA_ID,
        name: "Pepino conserva",
        unit: "kg",
        current_price: 1.77,
        purchase_quantity: 1000,
      },
    ],
  ]);

  const client = {
    from(table: string) {
      if (table === "invoice_item_matches") {
        return {
          select() {
            return {
              eq(column: string, value: string) {
                return {
                  maybeSingle: async () => {
                    if (column !== "invoice_item_id") throw new Error(column);
                    return { data: matchRows.get(value) ?? null, error: null };
                  },
                };
              },
            };
          },
          update(patch: Record<string, unknown>) {
            return {
              eq(column: string, value: string) {
                return {
                  select: () => ({
                    maybeSingle: async () => {
                      const existing = matchRows.get(value);
                      if (!existing) return { data: null, error: null };
                      const next = {
                        ...existing,
                        ...patch,
                        updated_at: "2026-06-14T12:00:00.000Z",
                      } as InvoiceItemMatchRow;
                      matchRows.set(value, next);
                      return { data: next, error: null };
                    },
                  }),
                };
              },
            };
          },
        };
      }

      if (table === "ingredient_price_history") {
        return {
          select(columns: string) {
            const chainSelect = columns.includes("invoices");
            return {
              eq(column: string, value: string) {
                const chain = {
                  not(_col: string, _op: string, _val: unknown) {
                    const rows = [...historyRows.values()].filter(
                      (row) => row.ingredient_id === value && row.invoice_id != null,
                    );
                    return {
                      async then() {
                        return { data: rows, error: null };
                      },
                      then(resolve: (v: unknown) => void) {
                        resolve({ data: rows, error: null });
                      },
                    };
                  },
                  order() {
                    return {
                      limit() {
                        return {
                          maybeSingle: async () => {
                            const linked = [...historyRows.values()]
                              .filter((row) => row.ingredient_id === value && row.invoice_id)
                              .sort((a, b) => b.created_at.localeCompare(a.created_at));
                            const top = linked[0];
                            return top
                              ? { data: { new_price: top.new_price, invoice_id: top.invoice_id }, error: null }
                              : { data: null, error: null };
                          },
                        };
                      },
                    };
                  },
                };

                if (chainSelect) {
                  return chain;
                }

                if (column === "invoice_id") {
                  return {
                    eq(col2: string, val2: string) {
                      return {
                        limit() {
                          return {
                            maybeSingle: async () => {
                              const row = [...historyRows.values()].find(
                                (r) => r.invoice_id === value && r.ingredient_id === val2,
                              );
                              return { data: row ?? null, error: null };
                            },
                          };
                        },
                      };
                    },
                  };
                }

                return chain;
              },
            };
          },
          delete() {
            return {
              eq(column: string, value: string) {
                const secondEq = {
                  eq(col2: string, val2: string) {
                    return {
                      select: async () => {
                        const toDelete = [...historyRows.entries()].filter(
                          ([, row]) =>
                            (column === "invoice_id" ? row.invoice_id === value : row.ingredient_id === value) &&
                            (col2 === "ingredient_id"
                              ? row.ingredient_id === val2
                              : row.invoice_id === val2),
                        );
                        for (const [id] of toDelete) historyRows.delete(id);
                        return { data: toDelete.map(([id]) => ({ id })), error: null };
                      },
                    };
                  },
                  is(col2: string, val2: unknown) {
                    return {
                      select: async () => {
                        const toDelete = [...historyRows.entries()].filter(
                          ([, row]) =>
                            row.ingredient_id === value && (col2 === "invoice_id" ? row.invoice_id == val2 : false),
                        );
                        for (const [id] of toDelete) historyRows.delete(id);
                        return { data: toDelete.map(([id]) => ({ id })), error: null };
                      },
                    };
                  },
                };
                return secondEq;
              },
            };
          },
          update(patch: Record<string, unknown>) {
            return {
              eq(_col: string, id: string) {
                return {
                  async then() {
                    const row = historyRows.get(id);
                    if (row) historyRows.set(id, { ...row, ...patch } as HistoryRow);
                    return { error: null };
                  },
                  then(resolve: (v: unknown) => void) {
                    const row = historyRows.get(id);
                    if (row) historyRows.set(id, { ...row, ...patch } as HistoryRow);
                    resolve({ error: null });
                  },
                };
              },
            };
          },
        };
      }

      if (table === "ingredients") {
        return {
          select() {
            return {
              eq(_col: string, id: string) {
                return {
                  maybeSingle: async () => ({
                    data: ingredients.get(id) ?? null,
                    error: null,
                  }),
                };
              },
            };
          },
          update(patch: Record<string, unknown>) {
            return {
              eq(_col: string, id: string) {
                return {
                  async then() {
                    const row = ingredients.get(id);
                    if (row) ingredients.set(id, { ...row, ...patch });
                    return { error: null };
                  },
                  then(resolve: (v: unknown) => void) {
                    const row = ingredients.get(id);
                    if (row) ingredients.set(id, { ...row, ...patch });
                    resolve({ error: null });
                  },
                };
              },
            };
          },
        };
      }

      throw new Error(`unexpected table ${table}`);
    },
  };

  return {
    client: client as unknown as AppSupabaseClient,
    matchRows,
    historyRows,
    ingredients,
  };
}

describe("unmatchInvoiceLineMatch — Pepino workflow", () => {
  beforeEach(() => {
    vi.spyOn(matchLifecycleFlags, "isMatchLifecycleSubtractivePricingEnabled").mockReturnValue(true);
    vi.spyOn(correctionMemory, "rejectIngredientMatchPair").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("Pepino conserva confirmed → No Match tombstones, deletes poison history, rejects pair", async () => {
    const { client, matchRows, historyRows, ingredients } = createPepinoUnmatchMock();

    const result = await unmatchInvoiceLineMatch({
      client,
      invoiceItemId: PEPINO_LINE_ID,
      invoiceId: BIDFOOD_INVOICE_ID,
      userId: "user-1",
      itemName: "Pepino",
      supplierName: "Bidfood",
      rawItemName: "Pepino",
      previousIngredientId: PEPINO_CONSERVA_ID,
      wasConfirmed: true,
    });

    expect(result.ok).toBe(true);
    expect(result.historyDeleted).toBe(true);
    expect(result.pricingCleaned).toBe(true);

    const match = matchRows.get(PEPINO_LINE_ID);
    expect(match?.status).toBe("unmatched");
    expect(match?.ingredient_id).toBeNull();
    expect(match?.previous_ingredient_id).toBe(PEPINO_CONSERVA_ID);

    expect(historyRows.has(POISON_HISTORY_ID)).toBe(false);
    expect(historyRows.has("d723199d-jar")).toBe(true);

    expect(correctionMemory.rejectIngredientMatchPair).toHaveBeenCalledWith(
      expect.objectContaining({
        itemName: "Pepino",
        rejectedIngredientId: PEPINO_CONSERVA_ID,
        supplierName: "Bidfood",
      }),
    );
  });

  it("suggested → unmatched skips pricing when no history row exists", async () => {
    const { client, historyRows } = createPepinoUnmatchMock();
    historyRows.clear();

    const result = await unmatchInvoiceLineMatch({
      client,
      invoiceItemId: PEPINO_LINE_ID,
      invoiceId: BIDFOOD_INVOICE_ID,
      userId: "user-1",
      itemName: "Pepino",
      previousIngredientId: PEPINO_CONSERVA_ID,
      wasConfirmed: false,
    });

    expect(result.ok).toBe(true);
    expect(result.historyDeleted).toBe(false);
    expect(result.pricingCleaned).toBe(false);
  });
});
