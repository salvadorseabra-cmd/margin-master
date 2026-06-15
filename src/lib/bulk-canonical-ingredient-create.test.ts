import { describe, expect, it, vi } from "vitest";
import {
  buildBulkSubmitValuesFromDefaults,
  collectUnmatchedRowsForBulkCreate,
  saveCanonicalIngredientFromInvoiceRow,
} from "./bulk-canonical-ingredient-create";
import {
  buildCanonicalIngredientCreateDefaults,
  buildExplicitCanonicalInsertPayload,
} from "./canonical-ingredient-create";
import { persistIngredientFromInvoiceItem } from "./ingredient-auto-persist";

function mockSupabaseForInsert(insert: ReturnType<typeof vi.fn>) {
  return {
    from: (table: string) => {
      if (table === "ingredients") {
        return {
          insert: () => ({
            select: () => ({
              single: insert,
            }),
          }),
          select: () => Promise.resolve({ data: [], error: null }),
        };
      }
      return {
        select: () => ({ eq: () => ({ maybeSingle: () => ({ data: null, error: null }) }) }),
      };
    },
  } as never;
}

const item = (id: string, name: string) => ({
  id,
  name,
  quantity: 10,
  unit: "un",
  unit_price: 12.5,
  total: 125,
});

describe("collectUnmatchedRowsForBulkCreate", () => {
  it("returns only unmatched eligible rows", () => {
    const candidates = collectUnmatchedRowsForBulkCreate({
      items: [item("a", "ANGUS PTY"), item("b", "Queijo mozzarella")],
      ingredientCatalog: [
        {
          id: "moz",
          name: "Queijo mozzarella",
          normalized_name: "queijo mozzarella",
        },
      ],
      confirmedAliases: {},
      supplierName: "Metro",
    });
    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.item.id).toBe("a");
    expect(candidates[0]?.defaults.suggestedCanonicalName).toBe("Angus patty");
  });

  it("skips placeholder and suggested-match rows", () => {
    const candidates = collectUnmatchedRowsForBulkCreate({
      items: [item("a", "unknown"), item("b", "BAC FUM FAT")],
      ingredientCatalog: [
        {
          id: "bacon",
          name: "Bacon fumado fatias",
          normalized_name: "bacon fumado fatias",
        },
      ],
      confirmedAliases: {},
    });
    expect(candidates).toHaveLength(0);
  });
});

describe("buildBulkSubmitValuesFromDefaults", () => {
  it("maps defaults to submit values like the single-row dialog", () => {
    const defaults = buildCanonicalIngredientCreateDefaults(item("a", "ANGUS PTY"), {
      supplierName: "Metro",
    });
    const values = buildBulkSubmitValuesFromDefaults(defaults, "Angus patty");
    expect(values.canonicalName).toBe("Angus patty");
    expect(values.unit).toBe(defaults.unit);
    expect(values.purchase_quantity).toBe(1);
    expect(values.purchase_unit).toBe(defaults.purchase_unit.trim() || null);
    expect(values.base_unit).toBe(defaults.base_unit);
    expect(values.current_price).toBe(12.5);
  });

  it("passes edited Stracciatella name through the bulk submit pipeline", () => {
    const invoiceItem = item("strac", "Stracciatella 250gr");
    const defaults = buildCanonicalIngredientCreateDefaults(invoiceItem);
    const values = buildBulkSubmitValuesFromDefaults(defaults, "Stracciatella");
    expect(values.canonicalName).toBe("Stracciatella");

    const payload = buildExplicitCanonicalInsertPayload({
      canonicalName: values.canonicalName,
      item: invoiceItem,
      userId: "user-1",
      unit: values.unit,
      current_price: values.current_price,
      purchase_quantity: values.purchase_quantity,
      purchase_unit: values.purchase_unit,
      base_unit: values.base_unit,
    });
    expect(payload?.name).toBe("Stracciatella");
  });

  it("passes edited Mezzi paccheri name through the bulk submit pipeline", () => {
    const invoiceItem = item("paccheri", "Mezzi paccheri mancini");
    const defaults = buildCanonicalIngredientCreateDefaults(invoiceItem);
    const values = buildBulkSubmitValuesFromDefaults(defaults, "Mezzi paccheri");
    expect(values.canonicalName).toBe("Mezzi paccheri");

    const payload = buildExplicitCanonicalInsertPayload({
      canonicalName: values.canonicalName,
      item: invoiceItem,
      userId: "user-1",
      unit: values.unit,
      current_price: values.current_price,
      purchase_quantity: values.purchase_quantity,
      purchase_unit: values.purchase_unit,
      base_unit: values.base_unit,
    });
    expect(payload?.name).toBe("Mezzi paccheri");
  });
});

describe("saveCanonicalIngredientFromInvoiceRow edited-name persistence", () => {
  it("persists edited Stracciatella through persistIngredientFromInvoiceItem", async () => {
    const invoiceItem = item("strac", "Stracciatella 250gr");
    const defaults = buildCanonicalIngredientCreateDefaults(invoiceItem);
    const values = buildBulkSubmitValuesFromDefaults(defaults, "Stracciatella");

    const insert = vi.fn().mockResolvedValue({
      data: { id: "ing-strac", name: "Stracciatella", normalized_name: "stracciatella", unit: "kg" },
      error: null,
    });
    const client = mockSupabaseForInsert(insert);

    const persistIngredientCorrection = vi.fn().mockResolvedValue({ ok: true });
    const result = await saveCanonicalIngredientFromInvoiceRow(
      {
        supabase: client,
        userId: "user-1",
        catalog: [],
        persistIngredientCorrection,
      },
      { item: invoiceItem, supplierName: null, invoiceId: "inv-1" },
      values,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.ingredientName).toBe("Stracciatella");

    const payload = buildExplicitCanonicalInsertPayload({
      canonicalName: values.canonicalName,
      item: invoiceItem,
      userId: "user-1",
      unit: values.unit,
      current_price: values.current_price,
      purchase_quantity: values.purchase_quantity,
      purchase_unit: values.purchase_unit,
      base_unit: values.base_unit,
    });
    const persistResult = await persistIngredientFromInvoiceItem(client, payload!, {
      catalog: [],
      source: "explicit_user",
    });
    expect(persistResult.blocked).toBeFalsy();
    expect(insert).toHaveBeenCalled();
    expect(payload?.name).toBe("Stracciatella");
  });

  it("persists edited Mezzi paccheri through persistIngredientFromInvoiceItem", async () => {
    const invoiceItem = item("paccheri", "Mezzi paccheri mancini");
    const defaults = buildCanonicalIngredientCreateDefaults(invoiceItem);
    const values = buildBulkSubmitValuesFromDefaults(defaults, "Mezzi paccheri");

    const insert = vi.fn().mockResolvedValue({
      data: {
        id: "ing-paccheri",
        name: "Mezzi paccheri",
        normalized_name: "mezzi paccheri",
        unit: "kg",
      },
      error: null,
    });
    const client = mockSupabaseForInsert(insert);

    const persistIngredientCorrection = vi.fn().mockResolvedValue({ ok: true });
    const result = await saveCanonicalIngredientFromInvoiceRow(
      {
        supabase: client,
        userId: "user-1",
        catalog: [],
        persistIngredientCorrection,
      },
      { item: invoiceItem, supplierName: null, invoiceId: "inv-1" },
      values,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.ingredientName).toBe("Mezzi paccheri");

    const payload = buildExplicitCanonicalInsertPayload({
      canonicalName: values.canonicalName,
      item: invoiceItem,
      userId: "user-1",
      unit: values.unit,
      current_price: values.current_price,
      purchase_quantity: values.purchase_quantity,
      purchase_unit: values.purchase_unit,
      base_unit: values.base_unit,
    });
    const persistResult = await persistIngredientFromInvoiceItem(client, payload!, {
      catalog: [],
      source: "explicit_user",
    });
    expect(persistResult.blocked).toBeFalsy();
    expect(insert).toHaveBeenCalled();
    expect(payload?.name).toBe("Mezzi paccheri");
  });
});
