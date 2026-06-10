import { describe, expect, it } from "vitest";
import {
  reconcileLineItemAmounts,
  reconcileLineItemsToNetSubtotal,
} from "../../supabase/functions/extract-invoice/invoice-line-reconcile.ts";

type Item = {
  name: string;
  quantity: number | null;
  unit: string | null;
  unit_price: number | null;
  total: number | null;
};

const mayItems = (): Item[] => [
  { name: "Anchovas", quantity: 2, unit: "un", unit_price: 9.99, total: 19.98 },
  { name: "Gema", quantity: 6, unit: "un", unit_price: 10.49, total: 62.94 },
  { name: "Pepino", quantity: 1, unit: "cx", unit_price: 22.49, total: 22.49 },
  { name: "Atum", quantity: 2, unit: "un", unit_price: 6.55, total: 13.1 },
  { name: "Arroz", quantity: 1, unit: "cx", unit_price: 13.95, total: 13.95 },
  { name: "Chocolate", quantity: 2, unit: "cx", unit_price: 29.99, total: 59.98 },
  { name: "Acucar", quantity: 1, unit: "cx", unit_price: 8.99, total: 8.99 },
  { name: "Nata", quantity: 5, unit: "cx", unit_price: 18.89, total: 94.45 },
];

describe("reconcileLineItemsToNetSubtotal", () => {
  it("fixes 8.99→9.99 acucar when net subtotal is 296.88", () => {
    const items = mayItems();
    const result = reconcileLineItemsToNetSubtotal(items, 296.88);
    const acucar = result.find((i) => i.name === "Acucar");
    expect(acucar?.unit_price).toBe(9.99);
    expect(acucar?.total).toBe(9.99);
    const sum = result.reduce((s, i) => s + (i.total ?? 0), 0);
    expect(sum).toBeCloseTo(296.88, 2);
  });

  it("fixes 9.49→9.99 acucar when net subtotal is 296.88", () => {
    const items = mayItems().map((i) =>
      i.name === "Acucar" ? { ...i, unit_price: 9.49, total: 9.49 } : i,
    );
    const result = reconcileLineItemsToNetSubtotal(items, 296.88);
    const acucar = result.find((i) => i.name === "Acucar");
    expect(acucar?.unit_price).toBe(9.99);
    expect(acucar?.total).toBe(9.99);
  });

  it("leaves items unchanged when net subtotal already matches", () => {
    const items = mayItems().map((i) =>
      i.name === "Acucar" ? { ...i, unit_price: 9.99, total: 9.99 } : i,
    );
    const result = reconcileLineItemsToNetSubtotal(items, 296.88);
    expect(result).toEqual(items);
  });

  it("does not fix when multiple sub-€10 single-pack lines could absorb the gap", () => {
    const items = mayItems().map((i) => {
      if (i.name === "Acucar") return { ...i, unit_price: 8.99, total: 8.99 };
      if (i.name === "Atum") return { ...i, quantity: 1, unit_price: 8.99, total: 8.99 };
      return i;
    });
    const result = reconcileLineItemsToNetSubtotal(items, 296.88);
    expect(result).toEqual(items);
  });
});

describe("reconcileLineItemAmounts", () => {
  it("derives unit_price from total when only total is present", () => {
    const items = [
      { name: "Gema", quantity: 6, unit: "un", unit_price: null, total: 62.94 },
    ];
    const result = reconcileLineItemAmounts(items);
    expect(result[0]?.unit_price).toBeCloseTo(10.49, 2);
  });

  it("preserves Bidfood Courgettes discounted line (3.3 kg × 1.95 ≠ 5.15)", () => {
    const items = [
      {
        name: "Courgettes",
        quantity: 3.3,
        unit: "kg",
        unit_price: 1.95,
        total: 5.15,
      },
    ];
    const result = reconcileLineItemAmounts(items);
    expect(result[0]).toEqual(items[0]);
    expect(result[0]?.quantity).toBe(3.3);
    expect(result[0]?.unit_price).toBe(1.95);
    expect(result[0]?.total).toBe(5.15);
  });

  it("preserves Bidfood Hortelã discounted line (0.5 mo × 6.74 ≠ 2.70)", () => {
    const items = [
      {
        name: "Hortelã",
        quantity: 0.5,
        unit: "mo",
        unit_price: 6.74,
        total: 2.7,
      },
    ];
    const result = reconcileLineItemAmounts(items);
    expect(result[0]).toEqual(items[0]);
    expect(result[0]?.quantity).toBe(0.5);
    expect(result[0]?.unit_price).toBe(6.74);
    expect(result[0]?.total).toBe(2.7);
  });

  it("does not back-solve quantity when all three amounts are present", () => {
    const backSolvedQty = Math.round((5.15 / 1.95) * 100) / 100;
    const items = [
      {
        name: "Courgettes",
        quantity: backSolvedQty,
        unit: "kg",
        unit_price: 1.95,
        total: 5.15,
      },
    ];
    const result = reconcileLineItemAmounts(items);
    expect(result[0]?.quantity).toBe(backSolvedQty);
  });
});
