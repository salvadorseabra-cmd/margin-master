import { describe, expect, it } from "vitest";
import type { BulkCanonicalCreateCandidate } from "@/lib/bulk-canonical-ingredient-create";
import {
  mergeBulkCanonicalIngredientRows,
  type BulkCanonicalIngredientCreateRowState,
} from "./bulk-canonical-ingredient-create-sheet";

const item = (id: string, name: string) => ({
  id,
  name,
  quantity: 1,
  unit: "un",
  unit_price: 5,
});

function candidate(
  id: string,
  invoiceAlias: string,
  suggestedCanonicalName: string,
): BulkCanonicalCreateCandidate {
  return {
    item: item(id, invoiceAlias),
    defaults: {
      itemId: id,
      invoiceAlias,
      suggestedCanonicalName,
      catalogReady: true,
      unit: "kg",
      purchase_quantity: "1",
      purchase_unit: "",
      base_unit: "kg",
      current_price: "5",
      invoiceQuantityLabel: "1 un",
      supplierName: null,
    },
  };
}

function editedRow(
  itemId: string,
  canonicalName: string,
): BulkCanonicalIngredientCreateRowState {
  return {
    itemId,
    selected: true,
    canonicalName,
    error: null,
  };
}

function submitCanonicalName(
  rows: BulkCanonicalIngredientCreateRowState[],
  itemId: string,
): string {
  const row = rows.find((entry) => entry.itemId === itemId);
  if (!row?.selected) throw new Error(`missing selected row for ${itemId}`);
  return row.canonicalName.trim();
}

describe("mergeBulkCanonicalIngredientRows", () => {
  it("initializes rows when the sheet opens with no prior state", () => {
    const rows = mergeBulkCanonicalIngredientRows(
      [],
      [candidate("strac", "Stracciatella 250gr", "Stracciatella 250gr")],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.canonicalName).toBe("Stracciatella 250gr");
  });

  it("keeps Stracciatella edit after candidates refresh", () => {
    const initial = mergeBulkCanonicalIngredientRows(
      [],
      [candidate("strac", "Stracciatella 250gr", "Stracciatella 250gr")],
    );
    const edited = initial.map((row) =>
      row.itemId === "strac" ? { ...row, canonicalName: "Stracciatella" } : row,
    );

    const refreshedCandidates = [
      candidate("strac", "Stracciatella 250gr", "Stracciatella 250gr"),
    ];
    const afterRefresh = mergeBulkCanonicalIngredientRows(edited, refreshedCandidates);

    expect(submitCanonicalName(afterRefresh, "strac")).toBe("Stracciatella");
  });

  it("keeps Mezzi paccheri edit after candidates refresh", () => {
    const initial = mergeBulkCanonicalIngredientRows(
      [],
      [candidate("paccheri", "Mezzi paccheri mancini", "Mezzi paccheri mancini")],
    );
    const edited = initial.map((row) =>
      row.itemId === "paccheri" ? { ...row, canonicalName: "Mezzi paccheri" } : row,
    );

    const refreshedCandidates = [
      candidate("paccheri", "Mezzi paccheri mancini", "Mezzi paccheri mancini"),
    ];
    const afterRefresh = mergeBulkCanonicalIngredientRows(edited, refreshedCandidates);

    expect(submitCanonicalName(afterRefresh, "paccheri")).toBe("Mezzi paccheri");
  });

  it("adds new candidates without resetting existing edits", () => {
    const edited = [editedRow("strac", "Stracciatella")];
    const merged = mergeBulkCanonicalIngredientRows(edited, [
      candidate("strac", "Stracciatella 250gr", "Stracciatella 250gr"),
      candidate("paccheri", "Mezzi paccheri mancini", "Mezzi paccheri mancini"),
    ]);

    expect(submitCanonicalName(merged, "strac")).toBe("Stracciatella");
    expect(submitCanonicalName(merged, "paccheri")).toBe("Mezzi paccheri mancini");
  });
});
