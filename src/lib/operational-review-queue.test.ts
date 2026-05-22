import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { IngredientCanonicalInput } from "./ingredient-canonical";
import {
  buildOperationalReviewQueue,
  countDuplicateCanonicalRisk,
  countLowQualityCanonicalNames,
  countOrphanCanonicalIssues,
  sumUnresolvedInvoiceIngredientCounts,
} from "./operational-review-queue";
import { emptyOrphanReport } from "./ingredient-orphan-detection";
import { countUnresolvedInvoiceIngredientsByInvoice } from "./invoice-unresolved-ingredient-count";
import * as catalogLoad from "./ingredient-catalog-load";
import * as aliasMemory from "./ingredient-alias-memory";
import * as orphanDetection from "./ingredient-orphan-detection";

function ingredient(id: string, name: string): IngredientCanonicalInput {
  return { id, name, normalized_name: name.toLowerCase() };
}

describe("countLowQualityCanonicalNames", () => {
  it("counts actionable naming suggestions only", () => {
    const result = countLowQualityCanonicalNames([
      ingredient("a", "BAT SHOESTR"),
      ingredient("b", "Batata palha"),
      ingredient("c", "Acém novilho extra s/ osso"),
    ]);
    expect(result.count).toBe(1);
    expect(result.firstIngredientId).toBe("a");
  });
});

describe("countDuplicateCanonicalRisk", () => {
  it("detects operational duplicate clusters", () => {
    const result = countDuplicateCanonicalRisk([
      ingredient("a1", "ANGUS PTY"),
      ingredient("a2", "Angus Patty"),
      ingredient("a3", "ANG PTY"),
    ]);
    expect(result.clusterCount).toBeGreaterThanOrEqual(1);
    expect(result.ingredientCount).toBeGreaterThanOrEqual(2);
  });
});

describe("countOrphanCanonicalIssues", () => {
  it("separates orphans and alias-only rows", () => {
    const reports = new Map([
      ["orphan", emptyOrphanReport("orphan")],
      [
        "alias-only",
        {
          ...emptyOrphanReport("alias-only"),
          invoiceAliasCount: 2,
        },
      ],
      [
        "active",
        {
          ...emptyOrphanReport("active"),
          recipeIngredientCount: 1,
        },
      ],
    ]);
    const result = countOrphanCanonicalIssues(
      [ingredient("orphan", "PALHA"), ingredient("alias-only", "BAT"), ingredient("active", "Cebola")],
      reports,
    );
    expect(result.orphanCount).toBe(1);
    expect(result.aliasOnlyCount).toBe(1);
    expect(result.totalCount).toBe(2);
  });
});

describe("sumUnresolvedInvoiceIngredientCounts", () => {
  it("sums per-invoice unmatched counts", () => {
    expect(sumUnresolvedInvoiceIngredientCounts({ a: 2, b: 0, c: 1 })).toBe(3);
  });
});

describe("buildOperationalReviewQueue", () => {
  const supabase = {} as SupabaseClient;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("builds review items without invoice scan when disabled", async () => {
    const activeCatalog = [
      ingredient("low", "BAT SHOESTR"),
      ingredient("a1", "ANGUS PTY"),
      ingredient("a2", "Angus Patty"),
      ingredient("orphan-id", "PALHA"),
    ];

    vi.spyOn(catalogLoad, "loadActiveIngredientCatalog").mockResolvedValue({
      rows: activeCatalog,
      error: null,
    });
    vi.spyOn(catalogLoad, "loadMatchingIngredientCatalog").mockResolvedValue({
      rows: [ingredient("can-1", "Batata palha")],
      error: null,
    });
    vi.spyOn(aliasMemory, "loadConfirmedIngredientAliasMap").mockResolvedValue({});
    vi.spyOn(orphanDetection, "detectOrphanCanonicalIngredients").mockResolvedValue({
      reports: new Map([["orphan-id", emptyOrphanReport("orphan-id")]]),
      error: null,
    });

    const result = await buildOperationalReviewQueue({
      userId: "user-1",
      supabase,
      catalog: activeCatalog.filter((row) => row.id !== "orphan-id"),
      includeInvoiceUnmatched: false,
    });

    const categories = result.items.map((item) => item.category);
    expect(categories).toContain("low_quality_canonical_names");
    const namingItem = result.items.find((item) => item.category === "low_quality_canonical_names");
    expect(namingItem?.ctaTarget).toEqual({ kind: "naming_review" });
    expect(categories).toContain("duplicate_canonical_risk");
    expect(categories).toContain("orphan_canonical_ingredients");
    expect(categories).not.toContain("unmatched_invoice_ingredients");
  });

  it("includes unmatched invoice lines when aggregate count is positive", async () => {
    const matchCatalog = [ingredient("can-1", "Batata palha")];
    const itemsByInvoice = {
      inv1: [{ id: "1", name: "MYSTERY LINE", quantity: 1, unit: "kg", unit_price: 1, total: 1 }],
    };
    const counts = countUnresolvedInvoiceIngredientsByInvoice(itemsByInvoice, matchCatalog, {});
    expect(sumUnresolvedInvoiceIngredientCounts(counts)).toBeGreaterThan(0);

    vi.spyOn(catalogLoad, "loadActiveIngredientCatalog").mockResolvedValue({
      rows: matchCatalog,
      error: null,
    });
    vi.spyOn(catalogLoad, "loadMatchingIngredientCatalog").mockResolvedValue({
      rows: matchCatalog,
      error: null,
    });
    vi.spyOn(aliasMemory, "loadConfirmedIngredientAliasMap").mockResolvedValue({});
    vi.spyOn(orphanDetection, "detectOrphanCanonicalIngredients").mockResolvedValue({
      reports: new Map(),
      error: null,
    });

    const client = {
      from: vi.fn((table: string) => ({
        select: vi.fn(() => {
          if (table === "invoices") {
            return Promise.resolve({
              data: [{ id: "inv1", supplier_name: "Supplier" }],
              error: null,
            });
          }
          return Promise.resolve({
            data: [
              {
                id: "1",
                invoice_id: "inv1",
                name: "MYSTERY LINE",
                quantity: 1,
                unit: "kg",
                unit_price: 1,
                total: 1,
              },
            ],
            error: null,
          });
        }),
      })),
    } as unknown as SupabaseClient;

    const result = await buildOperationalReviewQueue({
      userId: "user-1",
      supabase: client,
      catalog: matchCatalog,
      includeInvoiceUnmatched: true,
    });

    expect(result.items.some((item) => item.category === "unmatched_invoice_ingredients")).toBe(
      true,
    );
  });
});
