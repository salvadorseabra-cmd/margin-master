import { describe, expect, it } from "vitest";
import type { AppSupabaseClient } from "./invoice-item-match-repository";
import {
  getInvoiceItemMatchByInvoiceItemId,
  getInvoiceItemMatchesByInvoiceId,
  updateInvoiceItemMatchStatus,
  upsertInvoiceItemMatch,
} from "./invoice-item-match-repository";
import type { InvoiceItemMatchRow } from "./invoice-item-match-types";

const sampleRow: InvoiceItemMatchRow = {
  invoice_item_id: "item-1",
  user_id: "user-1",
  invoice_id: "inv-1",
  ingredient_id: "ing-1",
  status: "suggested",
  match_kind: "semantic",
  confirmed_at: null,
  corrected_at: null,
  previous_ingredient_id: null,
  pack_variant_id: null,
  created_at: "2024-01-01T00:00:00.000Z",
  updated_at: "2024-01-01T00:00:00.000Z",
};

function createMockSupabase(initialRows: InvoiceItemMatchRow[] = [sampleRow]) {
  const rows = new Map(initialRows.map((row) => [row.invoice_item_id, { ...row }]));

  const client = {
    from(table: string) {
      if (table !== "invoice_item_matches") {
        throw new Error(`unexpected table ${table}`);
      }

      return {
        select() {
          return {
            eq(column: string, value: string) {
              return {
                maybeSingle: async () => {
                  if (column !== "invoice_item_id") {
                    throw new Error(`unexpected column ${column}`);
                  }
                  const row = rows.get(value) ?? null;
                  return { data: row, error: null };
                },
                order: async () => {
                  if (column !== "invoice_id") {
                    throw new Error(`unexpected column ${column}`);
                  }
                  const data = [...rows.values()].filter((row) => row.invoice_id === value);
                  return { data, error: null };
                },
              };
            },
            order: async () => ({ data: [...rows.values()], error: null }),
          };
        },
        upsert(payload: Record<string, unknown>, _options: { onConflict: string }) {
          const key = String(payload.invoice_item_id);
          const existing = rows.get(key);
          const next: InvoiceItemMatchRow = {
            invoice_item_id: key,
            user_id: String(payload.user_id),
            invoice_id: String(payload.invoice_id),
            ingredient_id: (payload.ingredient_id as string | null) ?? null,
            status: payload.status as InvoiceItemMatchRow["status"],
            match_kind: (payload.match_kind as string | null) ?? null,
            confirmed_at: (payload.confirmed_at as string | null) ?? null,
            corrected_at: (payload.corrected_at as string | null) ?? null,
            previous_ingredient_id: (payload.previous_ingredient_id as string | null) ?? null,
            pack_variant_id: (payload.pack_variant_id as string | null) ?? null,
            created_at: existing?.created_at ?? "2024-01-01T00:00:00.000Z",
            updated_at: "2024-01-02T00:00:00.000Z",
          };
          rows.set(key, next);
          return {
            select: () => ({
              single: async () => ({ data: next, error: null }),
            }),
          };
        },
        update(patch: Record<string, unknown>) {
          return {
            eq(column: string, value: string) {
              return {
                select: () => ({
                  maybeSingle: async () => {
                    if (column !== "invoice_item_id") {
                      throw new Error(`unexpected column ${column}`);
                    }
                    const existing = rows.get(value);
                    if (!existing) return { data: null, error: null };
                    const next = { ...existing, ...patch, updated_at: "2024-01-03T00:00:00.000Z" };
                    rows.set(value, next as InvoiceItemMatchRow);
                    return { data: next, error: null };
                  },
                }),
              };
            },
          };
        },
      };
    },
  };

  return { client: client as unknown as AppSupabaseClient, rows };
}

describe("invoice-item-match-repository", () => {
  it("loads a match by invoice item id", async () => {
    const { client } = createMockSupabase();
    const { data, error } = await getInvoiceItemMatchByInvoiceItemId(client, "item-1");
    expect(error).toBeNull();
    expect(data?.status).toBe("suggested");
    expect(data?.ingredient_id).toBe("ing-1");
  });

  it("loads all matches for an invoice", async () => {
    const { client } = createMockSupabase([
      sampleRow,
      {
        ...sampleRow,
        invoice_item_id: "item-2",
      },
    ]);

    const { data, error } = await getInvoiceItemMatchesByInvoiceId(client, "inv-1");
    expect(error).toBeNull();
    expect(data).toHaveLength(2);
  });

  it("upserts a valid match record", async () => {
    const { client, rows } = createMockSupabase([]);
    const { data, error } = await upsertInvoiceItemMatch(client, {
      invoice_item_id: "item-new",
      user_id: "user-1",
      invoice_id: "inv-1",
      status: "unmatched",
    });

    expect(error).toBeNull();
    expect(data?.status).toBe("unmatched");
    expect(rows.has("item-new")).toBe(true);
  });

  it("rejects invalid upsert payloads before calling supabase", async () => {
    const { client } = createMockSupabase([]);
    await expect(
      upsertInvoiceItemMatch(client, {
        invoice_item_id: "item-bad",
        user_id: "user-1",
        invoice_id: "inv-1",
        status: "confirmed",
        ingredient_id: "ing-1",
      }),
    ).rejects.toThrow(/confirmed_missing_timestamp/);
  });

  it("updates status with normalized confirmed_at", async () => {
    const { client } = createMockSupabase();
    const { data, error } = await updateInvoiceItemMatchStatus(
      client,
      "item-1",
      { status: "confirmed", ingredient_id: "ing-1" },
      sampleRow,
    );

    expect(error).toBeNull();
    expect(data?.status).toBe("confirmed");
    expect(data?.confirmed_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("clears assignment when updating to unmatched", async () => {
    const { client } = createMockSupabase();
    const { data, error } = await updateInvoiceItemMatchStatus(
      client,
      "item-1",
      { status: "unmatched" },
      sampleRow,
    );

    expect(error).toBeNull();
    expect(data?.status).toBe("unmatched");
    expect(data?.ingredient_id).toBeNull();
    expect(data?.confirmed_at).toBeNull();
  });
});
