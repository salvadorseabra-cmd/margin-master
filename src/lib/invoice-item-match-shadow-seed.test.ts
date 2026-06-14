import { describe, expect, it, vi } from "vitest";
import type { IngredientAliasMap, IngredientCanonicalInput } from "@/lib/ingredient-canonical";
import type { AppSupabaseClient } from "@/lib/invoice-item-match-repository";
import * as matchRepository from "./invoice-item-match-repository";
import * as matchLifecycleFlags from "./match-lifecycle-flags";
import {
  buildMatchRecordForInvoiceItem,
  computeInvoiceItemMatchCoverage,
  shadowSeedInvoiceItemMatches,
  shadowSeedInvoiceItemMatchesAfterExtract,
} from "./invoice-item-match-shadow-seed";

const catalog: IngredientCanonicalInput[] = [
  { id: "ing-pepino", name: "Pepino", normalized_name: "pepino", unit: "kg" },
  { id: "ing-tomato", name: "Tomate cherry", normalized_name: "tomate cherry", unit: "kg" },
];

describe("buildMatchRecordForInvoiceItem", () => {
  it("creates unmatched record when matcher returns null", () => {
    const record = buildMatchRecordForInvoiceItem({
      item: {
        id: "item-1",
        invoice_id: "inv-1",
        user_id: "user-1",
        name: "Mystery spice xyz",
      },
      ingredientCatalog: catalog,
      confirmedAliases: {},
    });

    expect(record.status).toBe("unmatched");
    expect(record.ingredient_id).toBeNull();
  });

  it("creates suggested record for bare exact match", () => {
    const record = buildMatchRecordForInvoiceItem({
      item: {
        id: "item-pepino",
        invoice_id: "inv-1",
        user_id: "user-1",
        name: "Pepino",
      },
      ingredientCatalog: catalog,
      confirmedAliases: {},
    });

    expect(record.status).toBe("suggested");
    expect(record.ingredient_id).toBe("ing-pepino");
    expect(record.confirmed_at).toBeNull();
    expect(record.match_kind).toBeTruthy();
  });

  it("creates confirmed record for alias-backed match", () => {
    const record = buildMatchRecordForInvoiceItem({
      item: {
        id: "item-alias",
        invoice_id: "inv-1",
        user_id: "user-1",
        name: "Tomate cherry",
      },
      ingredientCatalog: catalog,
      confirmedAliases: { "tomate cherry": "ing-tomato" },
      now: "2024-06-01T12:00:00.000Z",
    });

    expect(record.status).toBe("confirmed");
    expect(record.ingredient_id).toBe("ing-tomato");
    expect(record.match_kind).toBe("confirmed-alias");
    expect(record.confirmed_at).toBe("2024-06-01T12:00:00.000Z");
  });
});

describe("computeInvoiceItemMatchCoverage", () => {
  it("reports missing items and orphan matches", () => {
    const report = computeInvoiceItemMatchCoverage(
      ["item-1", "item-2"],
      [
        { invoice_item_id: "item-1", status: "suggested" },
        { invoice_item_id: "item-orphan", status: "unmatched" },
      ],
    );

    expect(report.invoiceItemsCount).toBe(2);
    expect(report.matchRecordsCount).toBe(2);
    expect(report.missingInvoiceItemIds).toEqual(["item-2"]);
    expect(report.orphanMatchInvoiceItemIds).toEqual(["item-orphan"]);
    expect(report.byStatus.suggested).toBe(1);
    expect(report.byStatus.unmatched).toBe(1);
  });
});

describe("shadowSeedInvoiceItemMatches", () => {
  it("upserts one record per invoice item", async () => {
    const upsert = vi.spyOn(matchRepository, "upsertInvoiceItemMatch").mockResolvedValue({
      data: null,
      error: null,
    });

    const result = await shadowSeedInvoiceItemMatches({} as AppSupabaseClient, {
      items: [
        {
          id: "item-1",
          invoice_id: "inv-1",
          user_id: "user-1",
          name: "Pepino",
        },
      ],
      ingredientCatalog: catalog,
      confirmedAliases: {},
    });

    expect(result.attempted).toBe(1);
    expect(result.upserted).toBe(1);
    expect(result.byStatus.suggested).toBe(1);
    expect(upsert).toHaveBeenCalledTimes(1);
    expect(upsert.mock.calls[0]?.[1]?.status).toBe("suggested");

    upsert.mockRestore();
  });
});

describe("shadowSeedInvoiceItemMatchesAfterExtract", () => {
  it("no-ops when shadow seed flag is disabled", async () => {
    vi.spyOn(matchLifecycleFlags, "isMatchLifecycleShadowSeedEnabled").mockReturnValue(false);
    const upsert = vi.spyOn(matchRepository, "upsertInvoiceItemMatch");

    const result = await shadowSeedInvoiceItemMatchesAfterExtract({} as AppSupabaseClient, {
      invoiceId: "inv-1",
      userId: "user-1",
      items: [{ id: "item-1", name: "Pepino" }],
      ingredientCatalog: catalog,
      confirmedAliases: {},
    });

    expect(result).toBeNull();
    expect(upsert).not.toHaveBeenCalled();

    upsert.mockRestore();
    vi.restoreAllMocks();
  });
});

describe("backfillInvoiceItemMatches idempotency", () => {
  it("produces identical upsert payloads on repeated shadow seed", async () => {
    const upsert = vi.spyOn(matchRepository, "upsertInvoiceItemMatch").mockResolvedValue({
      data: null,
      error: null,
    });

    const params = {
      items: [
        {
          id: "item-1",
          invoice_id: "inv-1",
          user_id: "user-1",
          name: "Pepino",
        },
      ],
      ingredientCatalog: catalog,
      confirmedAliases: {},
      now: "2024-06-01T12:00:00.000Z",
    };

    await shadowSeedInvoiceItemMatches({} as AppSupabaseClient, params);
    await shadowSeedInvoiceItemMatches({} as AppSupabaseClient, params);

    expect(upsert).toHaveBeenCalledTimes(2);
    expect(upsert.mock.calls[0]?.[1]).toEqual(upsert.mock.calls[1]?.[1]);

    upsert.mockRestore();
  });
});
