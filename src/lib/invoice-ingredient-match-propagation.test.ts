import { describe, expect, it } from "vitest";
import { normalizeInvoiceItemFields } from "./invoice-item-fields";
import {
  findInvoiceItemIngredientMatch,
  legacyInvoiceRowPossibleMatch,
  resolveInvoiceRowIngredientMatch,
  resolveInvoiceTableRowFromItem,
} from "./invoice-ingredient-match-propagation";

const palhaCatalog = [{ id: "bat-palha", name: "BATATA PALHA" }];
const cheddarCatalog = [{ id: "cheddar", name: "CHEDDAR" }];

describe("invoice ingredient match propagation", () => {
  it.each([
    {
      itemName: "BATATA PALHA 2KG SERVICE",
      catalog: palhaCatalog,
      expectedTarget: "BATATA PALHA",
    },
    {
      itemName: "PALHA SNACK FOOD SERVICE 2KG",
      catalog: palhaCatalog,
      expectedTarget: "BATATA PALHA",
      kind: "operational-equivalent" as const,
    },
    {
      itemName: "QUEIJO CHEDDAR AUCHAN 1KG",
      catalog: cheddarCatalog,
      expectedTarget: "CHEDDAR",
    },
  ])(
    "$itemName reaches invoice row UI with a real match object",
    ({ itemName, catalog, expectedTarget, kind }) => {
      const { match, state } = resolveInvoiceRowIngredientMatch(itemName, catalog);

      expect(match, "canonical match must exist").not.toBeNull();
      if (kind) expect(match!.kind).toBe(kind);
      expect(match!.ingredient.name).toMatch(expectedTarget);

      if (match!.kind === "operational-equivalent") {
        expect(legacyInvoiceRowPossibleMatch(match)).toBeNull();
        expect(state.displayState).toBe("suggested");
        expect(state.possibleMatch).toBe(match);
        expect(state.badgeLabel).toBe("possible operational equivalent");
      }

      expect(state.unmatched).toBe(false);
      expect(state.showMatchTargetLine).toBe(true);
    },
  );

  it("findInvoiceItemIngredientMatch matches invoices.tsx lookup", () => {
    const itemName = "PALHA SNACK FOOD SERVICE 2KG";
    expect(findInvoiceItemIngredientMatch(itemName, palhaCatalog)?.kind).toBe(
      "operational-equivalent",
    );
  });

  it("resolveInvoiceTableRowFromItem mirrors loadItems + render double-normalize", () => {
    const raw = {
      id: "line-1",
      name: "BATATA PALHA 2KG SERVICE",
      quantity: 2,
      unit: "kg",
      unit_price: 3.2,
      total: 6.4,
    };
    const loaded = normalizeInvoiceItemFields(raw);
    const rendered = normalizeInvoiceItemFields(loaded);
    const { state } = resolveInvoiceTableRowFromItem(raw, palhaCatalog);

    expect(rendered.name).toBe(loaded.name);
    expect(state.unmatched).toBe(false);
    expect(state.displayState).not.toBe("unmatched");
  });
});
