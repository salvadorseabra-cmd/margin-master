import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { findCanonicalIngredientMatch } from "./ingredient-canonical";
import { resolveInvoiceIngredientDisplayState } from "./ingredient-match-explanation";
import { normalizeInvoiceItemFields } from "./invoice-item-fields";
import { resolveInvoiceTableRowIngredientMatch } from "./invoice-ingredient-row-display";
import {
  legacyInvoiceRowPossibleMatch,
  resolveInvoiceRowIngredientMatch,
  resolveInvoiceTableRowFromItem,
} from "./invoice-ingredient-match-propagation";

const palhaCatalog = [{ id: "bat-palha", name: "BATATA PALHA" }];
const cheddarCatalog = [{ id: "cheddar", name: "CHEDDAR" }];

/** Patterns that indicate invoice UI still treats only semantic matches as suggestions. */
const INVOICE_ROW_SEMANTIC_ONLY_FILTER_PATTERNS: ReadonlyArray<{
  id: string;
  pattern: RegExp;
}> = [
  { id: "semantic-kind-equality", pattern: /kind\s*===\s*["']semantic["']/ },
  { id: "semantic-kind-inequality", pattern: /kind\s*!==\s*["']semantic["']/ },
  { id: "legacy-get-item-match", pattern: /\bgetItemIngredientMatch\b/ },
  {
    id: "inline-unmatched-from-semantic-only",
    pattern:
      /!\s*(?:confirmedIngredientMatch|isConfirmedIngredientMatch\([^)]+\))\s*&&\s*!\s*possibleIngredientMatch/,
  },
  {
    id: "possible-match-semantic-ternary",
    pattern:
      /possibleIngredientMatch\s*=\s*[^;]*\?\.\s*kind\s*===\s*["']semantic["']/,
  },
];

type InvoiceRowSemanticOnlyFilterHit = {
  id: string;
  line: number;
  text: string;
};

function findSemanticOnlyInvoiceRowFilters(source: string): InvoiceRowSemanticOnlyFilterHit[] {
  const lines = source.split(/\r?\n/);
  const hits: InvoiceRowSemanticOnlyFilterHit[] = [];

  for (const { id, pattern } of INVOICE_ROW_SEMANTIC_ONLY_FILTER_PATTERNS) {
    lines.forEach((text, index) => {
      if (pattern.test(text)) {
        hits.push({ id, line: index + 1, text: text.trim() });
      }
    });
  }

  return hits;
}

function readInvoicesRouteSource(): string {
  const testDir = dirname(fileURLToPath(import.meta.url));
  return readFileSync(join(testDir, "../routes/invoices.tsx"), "utf-8");
}

describe("invoice row display (operational-equivalent regressions)", () => {
  it.each([
    {
      itemName: "BATATA PALHA 2KG SERVICE",
      catalog: palhaCatalog,
    },
    {
      itemName: "PALHA SNACK FOOD SERVICE 2KG",
      catalog: palhaCatalog,
    },
    {
      itemName: "QUEIJO CHEDDAR AUCHAN 1KG",
      catalog: cheddarCatalog,
    },
  ])("$itemName is not unmatched when catalog has a canonical match", ({ itemName, catalog }) => {
    const { match, state } = resolveInvoiceTableRowIngredientMatch(itemName, catalog);
    expect(match, `expected canonical match for ${itemName}`).not.toBeNull();

    if (match!.kind === "operational-equivalent") {
      expect(legacyInvoiceRowPossibleMatch(match)).toBeNull();
    }
    expect(state.unmatched).toBe(false);
    expect(state.showMatchTargetLine).toBe(true);
    expect(resolveInvoiceIngredientDisplayState(match)).not.toBe("unmatched");

    if (match!.kind === "operational-equivalent") {
      expect(state.displayState).toBe("suggested");
      expect(state.confirmedMatch).toBe(false);
      expect(state.possibleMatch).toBe(match);
      expect(state.badgeLabel).toBe("possible operational equivalent");
    }
  });

  it("PALHA SNACK FOOD SERVICE operational-equivalent is suggested, not confirmed", () => {
    const match = findCanonicalIngredientMatch("PALHA SNACK FOOD SERVICE 2KG", palhaCatalog);
    expect(match?.kind).toBe("operational-equivalent");

    const { state } = resolveInvoiceTableRowIngredientMatch(
      "PALHA SNACK FOOD SERVICE 2KG",
      palhaCatalog,
    );
    expect(state.displayState).toBe("suggested");
    expect(state.possibleMatch?.ingredient.name).toBe("BATATA PALHA");
    expect(state.badgeLabel).toBe("possible operational equivalent");
  });

  it("resolveInvoiceTableRowIngredientMatch matches propagation helper", () => {
    const itemName = "QUEIJO CHEDDAR AUCHAN 1KG";
    const fromTable = resolveInvoiceTableRowIngredientMatch(itemName, cheddarCatalog);
    const fromPropagation = resolveInvoiceRowIngredientMatch(itemName, cheddarCatalog);
    expect(fromTable.match).toEqual(fromPropagation.match);
    expect(fromTable.state).toEqual(fromPropagation.state);
  });
});

describe("invoice row display (production normalize + resolver chain)", () => {
  const makeRow = (name: string) =>
    normalizeInvoiceItemFields({
      id: `row-${name.slice(0, 12)}`,
      name,
      quantity: 2,
      unit: "kg",
      unit_price: 4.5,
      total: 9,
    });

  it.each([
    { rawName: "BATATA PALHA 2KG SERVICE", catalog: palhaCatalog },
    { rawName: "PALHA SNACK FOOD SERVICE 2KG", catalog: palhaCatalog },
    { rawName: "QUEIJO CHEDDAR AUCHAN 1KG", catalog: cheddarCatalog },
  ])(
    "$rawName survives normalizeInvoiceItemFields + ItemsTable resolver",
    ({ rawName, catalog }) => {
      const dbRow = {
        id: "db-1",
        name: rawName,
        quantity: 2,
        unit: "kg",
        unit_price: null,
        total: null,
      };
      const normalizedOnce = makeRow(rawName);
      const normalizedTwice = normalizeInvoiceItemFields(normalizedOnce);

      expect(normalizedTwice.name).toBe(normalizedOnce.name);

      const fromItem = resolveInvoiceTableRowFromItem(dbRow, catalog);
      const fromTable = resolveInvoiceTableRowIngredientMatch(normalizedOnce.name, catalog);

      expect(fromItem.match).toEqual(fromTable.match);
      expect(fromItem.state).toEqual(fromTable.state);
      expect(fromItem.state.unmatched).toBe(false);
      expect(fromItem.state.possibleMatch ?? fromItem.state.confirmedMatch).toBeTruthy();
    },
  );
});

describe("invoices.tsx render source (no semantic-only filters)", () => {
  it("does not use semantic-only possible-match filters in any render branch", () => {
    const hits = findSemanticOnlyInvoiceRowFilters(readInvoicesRouteSource());
    expect(hits).toEqual([]);
  });

  it("routes all row match resolution through shared table helper", () => {
    const source = readInvoicesRouteSource();
    expect(source).toContain("resolveInvoiceTableRowIngredientMatch");
    expect(source).not.toMatch(/\bgetItemIngredientMatch\b/);
    expect(source).not.toMatch(/kind\s*===\s*["']semantic["']/);
  });
});
