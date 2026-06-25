import { describe, expect, it } from "vitest";
import {
  isLinkedPriceHistoryRow,
  linkedIngredientPriceHistoryRows,
  type IngredientPriceHistoryRow,
} from "@/lib/ingredient-price-history";
import {
  buildOperationalAlertItems,
  getLatestHistoryByIngredient,
  type PriceHistoryRecord,
} from "@/lib/margin-alert-data";
import { buildSupplierWatchlist } from "@/lib/operational-intelligence-view";

const ATUM_ID = "0f30ccb3-0000-4000-8000-000000000001";
const GEMA_ID = "32dbf47d-0000-4000-8000-000000000002";
const ATUM_ORPHAN = "eff7e459-749a-4eda-b506-39e7bcb1c49d";
const ATUM_VALID = "4aa0a5b4-0000-4000-8000-000000000003";
const GEMA_ORPHAN = "9992c1a3-9533-4422-8fae-c6ad2f0af2d8";

function row(
  partial: Partial<PriceHistoryRecord> & Pick<PriceHistoryRecord, "id" | "ingredient_id">,
): PriceHistoryRecord {
  return {
    invoice_id: "37acd777-0000-4000-8000-000000000099",
    ingredient_name: "Test",
    supplier_name: "AVILUDO",
    ingredient_unit: "kg",
    previous_price: 1,
    new_price: 2,
    delta: 1,
    delta_percent: 100,
    created_at: "2026-04-17T12:00:00.000Z",
    ...partial,
  };
}

describe("isLinkedPriceHistoryRow", () => {
  it("rejects null and empty invoice_id", () => {
    expect(isLinkedPriceHistoryRow({ invoice_id: null })).toBe(false);
    expect(isLinkedPriceHistoryRow({ invoice_id: "" })).toBe(false);
    expect(isLinkedPriceHistoryRow({ invoice_id: "   " })).toBe(false);
  });

  it("accepts non-empty invoice_id", () => {
    expect(isLinkedPriceHistoryRow({ invoice_id: "inv-1" })).toBe(true);
  });
});

describe("orphan quarantine — VL Atum / Gema", () => {
  const atumHistory: PriceHistoryRecord[] = [
    row({
      id: ATUM_ORPHAN,
      ingredient_id: ATUM_ID,
      ingredient_name: "Atum em óleo",
      invoice_id: null,
      previous_price: 0.01239,
      new_price: 3.145,
      delta_percent: 25283.37,
      created_at: "2026-04-17T12:00:00.000Z",
    }),
    row({
      id: ATUM_VALID,
      ingredient_id: ATUM_ID,
      ingredient_name: "Atum em óleo",
      invoice_id: "37acd777-8b3f-45f3-9f2d-6f15e9f438a2",
      previous_price: 16.03,
      new_price: 3.145,
      delta_percent: -80.38,
      created_at: "2026-04-17T12:00:00.000Z",
    }),
  ];

  const gemaHistory: PriceHistoryRecord[] = [
    row({
      id: GEMA_ORPHAN,
      ingredient_id: GEMA_ID,
      ingredient_name: "Gema líquida",
      invoice_id: null,
      previous_price: 0.00843,
      new_price: 1.698,
      delta_percent: 20046,
      created_at: "2026-04-17T12:00:00.000Z",
    }),
  ];

  it("getLatestHistoryByIngredient selects linked Atum row over newer orphan", () => {
    const latest = getLatestHistoryByIngredient(atumHistory);
    expect(latest).toHaveLength(1);
    expect(latest[0]?.id).toBe(ATUM_VALID);
  });

  it("getLatestHistoryByIngredient returns empty for Gema when only orphan exists", () => {
    const latest = getLatestHistoryByIngredient(gemaHistory);
    expect(latest).toHaveLength(0);
  });

  it("buildOperationalAlertItems skips orphan Gema and untrusted linked Atum movement", () => {
    const data = {
      ingredients: [
        { id: ATUM_ID, name: "Atum em óleo", unit: "kg", current_price: 6.29, purchase_quantity: 2 },
        { id: GEMA_ID, name: "Gema líquida", unit: "kg", current_price: 8.43, purchase_quantity: 1 },
      ],
      recipes: [],
      invoices: [],
      priceHistory: [...atumHistory, ...gemaHistory],
    };
    const alerts = buildOperationalAlertItems(data);
    const atumAlert = alerts.find((a) => a.id === `price-decrease-${ATUM_ID}`);
    const gemaAlert = alerts.find((a) => a.id.startsWith("price-") && a.id.includes(GEMA_ID));
    expect(atumAlert).toBeUndefined();
    expect(gemaAlert).toBeUndefined();
  });

  it("buildSupplierWatchlist ignores orphan spike rows", () => {
    const data = {
      ingredients: [],
      recipes: [],
      invoices: [],
      priceHistory: [...atumHistory, ...gemaHistory],
    };
    const watch = buildSupplierWatchlist(data, [], 10);
    const orphanSpikes = watch.filter(
      (w) => w.pricingNote.includes("25283") || w.pricingNote.includes("20046"),
    );
    expect(orphanSpikes).toHaveLength(0);
  });

  it("linkedIngredientPriceHistoryRows matches getLatestHistoryByIngredient filter", () => {
    const linked = linkedIngredientPriceHistoryRows(atumHistory as IngredientPriceHistoryRow[]);
    expect(linked.map((r) => r.id)).toEqual([ATUM_VALID]);
  });
});
