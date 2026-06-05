import { describe, expect, it } from "vitest";
import { resolvePreviousUnitPriceEur } from "@/lib/recipe-impact";

type HistoryRow = {
  ingredient_id: string;
  previous_price: number | null;
  new_price: number;
  created_at: string;
};

function row(
  previous: number | null,
  newPrice: number,
  createdAt: string,
): HistoryRow {
  return {
    ingredient_id: "ing-1",
    previous_price: previous,
    new_price: newPrice,
    created_at: createdAt,
  };
}

describe("resolvePreviousUnitPriceEur", () => {
  it("uses L.previous_price directly for normalized brioche bun history", () => {
    const currentUnit = 0.225;
    const history = [row(0.2, 0.225, "2026-05-01T12:00:00.000Z")];
    expect(resolvePreviousUnitPriceEur(currentUnit, history)).toBeCloseTo(0.2, 6);
  });

  it("uses L.previous_price directly for normalized hamburger patty history", () => {
    const currentUnit = 1.375;
    const history = [row(1.3, 1.375, "2026-05-01T12:00:00.000Z")];
    expect(resolvePreviousUnitPriceEur(currentUnit, history)).toBeCloseTo(1.3, 6);
  });

  it("does not divide operational history prices by purchase_quantity", () => {
    const currentUnit = 0.225;
    const history = [row(0.2, 0.225, "2026-05-01T12:00:00.000Z")];
    const previous = resolvePreviousUnitPriceEur(currentUnit, history);
    expect(previous).not.toBeCloseTo(0.2 / 24, 6);
    expect(previous).toBeCloseTo(0.2, 6);
  });

  it("falls back to P.new_price when L.previous_price is null", () => {
    const currentUnit = 1.375;
    const history = [
      row(null, 1.375, "2026-05-20T12:00:00.000Z"),
      row(1.25, 1.3, "2026-04-01T12:00:00.000Z"),
    ];
    expect(resolvePreviousUnitPriceEur(currentUnit, history)).toBeCloseTo(1.3, 6);
  });

  it("uses current unit price when history is empty", () => {
    expect(resolvePreviousUnitPriceEur(0.225, [])).toBeCloseTo(0.225, 6);
  });
});
