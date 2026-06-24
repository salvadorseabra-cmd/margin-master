import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { defaultIsGenericUnit } from "./ingredient-auto-persist";
import { normalizeInvoiceItemFields } from "./invoice-item-fields";
import { resolveInvoicePersistedItemUnit } from "./invoice-purchase-format";

/** Mirrors invoices.tsx resolveInvoiceItemUnit — must match persistence insert path shape. */
function persistenceResolveInvoiceItemUnit(item: {
  name: string;
  quantity: number | null;
  unit: string | null;
}) {
  return resolveInvoicePersistedItemUnit(item, defaultIsGenericUnit);
}

function readInvoicesRouteSource(): string {
  const testDir = dirname(fileURLToPath(import.meta.url));
  return readFileSync(join(testDir, "../routes/invoices.tsx"), "utf-8");
}

function simulateInsertUnitFromNormalizedItem(it: {
  name: string;
  quantity: number | null;
  unit: string | null;
}) {
  const name = String(it.name ?? "Unknown");
  return persistenceResolveInvoiceItemUnit({
    name,
    quantity: it.quantity,
    unit: it.unit,
  });
}

describe("invoice persistence unit call site (invoices.tsx)", () => {
  it("passes quantity into resolveInvoiceItemUnit on insert and cost-sync paths", () => {
    const source = readInvoicesRouteSource();
    const resolveCalls = source.match(/resolveInvoiceItemUnit\(\{[^}]+\}/g) ?? [];
    expect(resolveCalls.length).toBeGreaterThanOrEqual(3);
    for (const call of resolveCalls) {
      expect(call, `missing quantity in ${call}`).toMatch(/quantity:\s*it\.quantity/);
    }
    expect(source).toMatch(
      /resolveInvoiceItemUnit\s*=\s*\(item:\s*Pick<ItemRow,\s*"name"\s*\|\s*"unit"\s*\|\s*"quantity">/,
    );
  });

  describe("insert path simulation (normalize → resolve with quantity)", () => {
    it.each([
      {
        product: "Paccheri 500g",
        ocr: {
          name: "De Cecco - Paccheri Lisci Nr. 125 - 500g",
          quantity: 24,
          unit: null as string | null,
          unit_price: 1.85,
          total: 44.4,
        },
        expectedUnit: "un",
      },
      {
        product: "Ginger Beer 0.20cl",
        ocr: {
          name: "Baladin - Ginger Beer 0.20cl",
          quantity: 24,
          unit: null as string | null,
          unit_price: 1.2,
          total: 28.8,
        },
        expectedUnit: "un",
      },
    ])("infers $expectedUnit for $product when OCR unit is null", ({ ocr, expectedUnit }) => {
      const normalized = normalizeInvoiceItemFields(ocr);
      const insertUnit = simulateInsertUnitFromNormalizedItem(normalized);
      expect(insertUnit).toBe(expectedUnit);
    });

    it.each([
      {
        product: "Pellegrino",
        ocr: {
          name: "San Pellegrino Acqua Minerale Naturale 75cl x15",
          quantity: 2,
          unit: null as string | null,
        },
        expectedUnit: "un",
      },
      {
        product: "Peroni",
        ocr: {
          name: "Peroni Nastro Azzurro 33cl x24",
          quantity: 1,
          unit: null as string | null,
        },
        expectedUnit: "un",
      },
      {
        product: "Açúcar",
        ocr: {
          name: "Açúcar Branco 10x1kg",
          quantity: 3,
          unit: null as string | null,
        },
        expectedUnit: "un",
      },
      {
        product: "Pomodori",
        ocr: {
          name: "Pomodori Pelati 2,5kg x6",
          quantity: 2,
          unit: null as string | null,
        },
        expectedUnit: "un",
      },
      {
        product: "Mozzarella",
        ocr: {
          name: "Mozzarella di Bufala 125g x8",
          quantity: 4,
          unit: null as string | null,
        },
        expectedUnit: "un",
      },
      {
        product: "Guanciale",
        ocr: {
          name: "Guanciale Stagionato",
          quantity: 2.5,
          unit: "kg" as string | null,
        },
        expectedUnit: "kg",
      },
    ])("no regression for $product", ({ ocr, expectedUnit }) => {
      const normalized = normalizeInvoiceItemFields(ocr);
      const insertUnit = simulateInsertUnitFromNormalizedItem(normalized);
      expect(insertUnit).toBe(expectedUnit);
    });

    it("returns null for embedded-measure countables when quantity is omitted (old bug shape)", () => {
      const normalized = normalizeInvoiceItemFields({
        name: "De Cecco - Paccheri Lisci Nr. 125 - 500g",
        quantity: 24,
        unit: null,
        unit_price: 1.85,
        total: 44.4,
      });
      const withoutQuantity = resolveInvoicePersistedItemUnit(
        { name: normalized.name, unit: normalized.unit },
        defaultIsGenericUnit,
      );
      expect(withoutQuantity).toBeNull();
      expect(simulateInsertUnitFromNormalizedItem(normalized)).toBe("un");
    });
  });
});
