import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import type { AppSupabaseClient } from "./invoice-item-match-repository";
import type { InvoiceItemMatchRow } from "./invoice-item-match-types";
import * as matchLifecycleFlags from "./match-lifecycle-flags";
import {
  confirmMatch,
  correctMatch,
  markUnmatched,
  reassignMatch,
} from "./match-lifecycle-service";

const baseContext = {
  invoiceItemId: "item-1",
  userId: "user-1",
  invoiceId: "inv-1",
};

const suggestedRow: InvoiceItemMatchRow = {
  invoice_item_id: "item-1",
  user_id: "user-1",
  invoice_id: "inv-1",
  ingredient_id: "ing-suggested",
  status: "suggested",
  match_kind: "semantic",
  confirmed_at: null,
  corrected_at: null,
  previous_ingredient_id: null,
  pack_variant_id: null,
  created_at: "2024-01-01T00:00:00.000Z",
  updated_at: "2024-01-01T00:00:00.000Z",
};

const confirmedRow: InvoiceItemMatchRow = {
  ...suggestedRow,
  ingredient_id: "ing-confirmed",
  status: "confirmed",
  match_kind: "confirmed-alias",
  confirmed_at: "2024-01-01T12:00:00.000Z",
};

function createMockSupabase(initialRows: InvoiceItemMatchRow[] = [suggestedRow]) {
  const rows = new Map(initialRows.map((row) => [row.invoice_item_id, { ...row }]));
  let writeCount = 0;

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
              };
            },
          };
        },
        upsert(payload: Record<string, unknown>, _options: { onConflict: string }) {
          writeCount += 1;
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
          writeCount += 1;
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

  return { client: client as unknown as AppSupabaseClient, rows, getWriteCount: () => writeCount };
}

describe("match-lifecycle-service", () => {
  beforeEach(() => {
    vi.spyOn(matchLifecycleFlags, "isMatchLifecycleDualWriteEnabled").mockReturnValue(true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("confirmMatch transitions suggested to confirmed", async () => {
    const { client, rows } = createMockSupabase();
    const fixedNow = "2024-06-01T10:00:00.000Z";

    const result = await confirmMatch(client, {
      ...baseContext,
      ingredientId: "ing-suggested",
      matchKind: "semantic",
      now: fixedNow,
    });

    expect(result.skipped).toBe(false);
    expect(result.error).toBeNull();
    expect(result.data?.status).toBe("confirmed");
    expect(result.data?.confirmed_at).toBe(fixedNow);
    expect(rows.get("item-1")?.status).toBe("confirmed");
  });

  it("confirmMatch is idempotent when already confirmed to same ingredient", async () => {
    const { client, getWriteCount } = createMockSupabase([confirmedRow]);

    const result = await confirmMatch(client, {
      ...baseContext,
      ingredientId: "ing-confirmed",
      now: "2024-06-01T10:00:00.000Z",
    });

    expect(result.skipped).toBe(false);
    expect(result.data?.status).toBe("confirmed");
    expect(getWriteCount()).toBe(0);
  });

  it("reassignMatch keeps confirmed status with new ingredient", async () => {
    const { client, rows } = createMockSupabase([confirmedRow]);
    const fixedNow = "2024-06-01T11:00:00.000Z";

    const result = await reassignMatch(client, {
      ...baseContext,
      newIngredientId: "ing-new",
      previousIngredientId: "ing-confirmed",
      now: fixedNow,
    });

    expect(result.error).toBeNull();
    expect(result.data?.status).toBe("confirmed");
    expect(result.data?.ingredient_id).toBe("ing-new");
    expect(result.data?.previous_ingredient_id).toBe("ing-confirmed");
    expect(result.data?.corrected_at).toBe(fixedNow);
    expect(result.data?.match_kind).toBe("manual");
    expect(rows.get("item-1")?.ingredient_id).toBe("ing-new");
  });

  it("correctMatch on suggested line stays suggested with manual kind", async () => {
    const { client, rows } = createMockSupabase();

    const result = await correctMatch(client, {
      ...baseContext,
      newIngredientId: "ing-other",
      previousIngredientId: "ing-suggested",
      keepConfirmed: false,
      now: "2024-06-01T12:00:00.000Z",
    });

    expect(result.error).toBeNull();
    expect(result.data?.status).toBe("suggested");
    expect(result.data?.ingredient_id).toBe("ing-other");
    expect(result.data?.previous_ingredient_id).toBe("ing-suggested");
    expect(rows.get("item-1")?.status).toBe("suggested");
  });

  it("correctMatch upserts manual confirmed assignment when no prior record", async () => {
    const { client, rows } = createMockSupabase([]);
    const fixedNow = "2024-06-01T13:00:00.000Z";

    const result = await correctMatch(client, {
      ...baseContext,
      newIngredientId: "ing-manual",
      keepConfirmed: true,
      now: fixedNow,
    });

    expect(result.error).toBeNull();
    expect(result.data?.status).toBe("confirmed");
    expect(result.data?.ingredient_id).toBe("ing-manual");
    expect(result.data?.match_kind).toBe("manual");
    expect(rows.has("item-1")).toBe(true);
  });

  it("does not write when dual-write flag is disabled", async () => {
    vi.spyOn(matchLifecycleFlags, "isMatchLifecycleDualWriteEnabled").mockReturnValue(false);
    const { client, getWriteCount } = createMockSupabase();

    const result = await confirmMatch(client, {
      ...baseContext,
      ingredientId: "ing-suggested",
    });

    expect(result.skipped).toBe(true);
    expect(result.data).toBeNull();
    expect(getWriteCount()).toBe(0);
  });

  it("markUnmatched clears assignment when flag enabled", async () => {
    const { client, rows } = createMockSupabase([confirmedRow]);

    const result = await markUnmatched(client, {
      ...baseContext,
      previousIngredientId: "ing-confirmed",
    });

    expect(result.error).toBeNull();
    expect(result.data?.status).toBe("unmatched");
    expect(result.data?.ingredient_id).toBeNull();
    expect(result.data?.previous_ingredient_id).toBe("ing-confirmed");
    expect(rows.get("item-1")?.status).toBe("unmatched");
  });
});
