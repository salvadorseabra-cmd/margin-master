import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { IngredientCanonicalInput } from "./ingredient-canonical";
import {
  buildDuplicateReviewListGroups,
  buildOperationalGlanceTiles,
  buildOperationalPriorityTiers,
  buildOperationalReviewQueue,
  buildOperationalSummarySnapshot,
  operationalListBrowseRowBaseClass,
  operationalListBrowseRowHoverClass,
  operationalListBrowseRowSelectedClass,
  countDuplicateCanonicalRisk,
  countLowQualityCanonicalNames,
  countOrphanCanonicalIssues,
  countCatalogConfirmationPending,
  countStaleCatalogPrices,
  findOperationalDuplicateClusterForIngredient,
  operationalHygieneCardSubtext,
  operationalListFilterLabel,
  operationalListReviewRowSelectedClass,
  sumUnresolvedInvoiceIngredientCounts,
  unusedReviewIngredientIds,
} from "./operational-review-queue";
import { emptyOrphanReport } from "./ingredient-orphan-detection";
import { countUnresolvedInvoiceIngredientsByInvoice } from "./invoice-unresolved-ingredient-count";
import * as catalogLoad from "./ingredient-catalog-load";
import * as aliasMemory from "./ingredient-alias-memory";
import * as orphanDetection from "./ingredient-orphan-detection";
import * as pricingFreshness from "./ingredient-pricing-freshness";

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

describe("countStaleCatalogPrices", () => {
  it("counts ingredients with stale price history, not catalog updated_at", () => {
    const result = countStaleCatalogPrices(
      [
        { id: "fresh", current_price: 2 },
        { id: "stale", current_price: 3 },
        { id: "free", current_price: 0 },
        { id: "no-history", current_price: 4 },
      ],
      {
        fresh: new Date().toISOString(),
        stale: "2020-01-01T00:00:00Z",
      },
    );
    expect(result.count).toBe(2);
    expect(result.firstIngredientId).toBe("stale");
  });

  it("excludes ingredients with recent confirmed invoice purchases", () => {
    const recentPurchase = new Date().toISOString().slice(0, 10);
    const result = countStaleCatalogPrices(
      [
        { id: "invoice-fresh", current_price: 2 },
        { id: "stale", current_price: 3 },
      ],
      { "invoice-fresh": "2020-01-01T00:00:00Z", stale: "2020-01-01T00:00:00Z" },
      { "invoice-fresh": recentPurchase },
    );
    expect(result.count).toBe(1);
    expect(result.firstIngredientId).toBe("stale");
  });
});

describe("countCatalogConfirmationPending", () => {
  it("counts recent invoice rows without matching pack refresh", () => {
    const recentPurchase = new Date().toISOString().slice(0, 10);
    const result = countCatalogConfirmationPending(
      [
        { id: "pending", current_price: 2 },
        { id: "confirmed", current_price: 3 },
      ],
      { pending: "2020-01-01T00:00:00Z", confirmed: new Date().toISOString() },
      { pending: recentPurchase },
    );
    expect(result.count).toBe(1);
    expect(result.firstIngredientId).toBe("pending");
  });
});

describe("operationalHygieneCardSubtext", () => {
  it("describes duplicate clusters and unused entry activity", () => {
    expect(
      operationalHygieneCardSubtext("duplicates", { clusterCount: 1, entryCount: 2 }),
    ).toBe("1 cluster to review");
    expect(
      operationalHygieneCardSubtext("duplicates", { clusterCount: 3, entryCount: 7 }),
    ).toBe("3 clusters to review");
    expect(
      operationalHygieneCardSubtext("unused", { clusterCount: 0, entryCount: 46 }),
    ).toBe("No recent activity");
    expect(
      operationalHygieneCardSubtext("unused", { clusterCount: 0, entryCount: 0 }),
    ).toBe("Queue clear");
  });
});

describe("operationalListFilterLabel", () => {
  it("labels each list filter for review mode UI", () => {
    expect(operationalListFilterLabel("duplicates")).toMatch(/duplicate/i);
    expect(operationalListFilterLabel("catalog-confirmation")).toMatch(/confirm latest prices/i);
    expect(operationalListFilterLabel("stale-prices")).toMatch(/outdated pricing/i);
    expect(operationalListFilterLabel("unused")).toMatch(/unused catalog entries/i);
  });
});

describe("operational review accent classes", () => {
  it("uses soft muted selection for list rows in all review modes", () => {
    expect(operationalListReviewRowSelectedClass("catalog-confirmation")).toContain("muted");
    expect(operationalListReviewRowSelectedClass("stale-prices")).toContain("muted");
    expect(operationalListBrowseRowSelectedClass()).toContain("muted");
    expect(operationalListReviewRowSelectedClass("duplicates")).not.toContain("primary");
    expect(operationalListBrowseRowSelectedClass()).not.toContain("primary");
  });

  it("makes selected rows stronger than hover", () => {
    expect(operationalListBrowseRowSelectedClass()).toContain("bg-muted/15");
    expect(operationalListBrowseRowHoverClass()).toContain("bg-muted/[0.05]");
    expect(operationalListBrowseRowSelectedClass()).toContain("border-l-foreground");
    expect(operationalListBrowseRowSelectedClass()).toContain("shadow-sm");
    expect(operationalListBrowseRowSelectedClass()).toContain("ring-border/40");
    expect(operationalListBrowseRowBaseClass()).toContain("border-l-transparent");
  });
});

describe("findOperationalDuplicateClusterForIngredient", () => {
  it("returns cluster containing the ingredient id", () => {
    const catalog = [
      ingredient("a1", "ANGUS PTY"),
      ingredient("a2", "Angus Patty"),
    ];
    const cluster = findOperationalDuplicateClusterForIngredient(catalog, "a2");
    expect(cluster?.ingredientIds).toContain("a1");
    expect(cluster?.ingredientIds).toContain("a2");
  });
});

describe("buildDuplicateReviewListGroups", () => {
  it("groups visible duplicate rows by operational cluster", () => {
    const catalog = [
      ingredient("a1", "ANGUS PTY"),
      ingredient("a2", "Angus Patty"),
      ingredient("solo", "Cebola"),
    ];
    const groups = buildDuplicateReviewListGroups(catalog, [
      { id: "a2" },
      { id: "a1" },
      { id: "solo" },
    ]);
    expect(groups).toHaveLength(2);
    expect(groups[0]?.rowIds).toEqual(["a1", "a2"]);
    expect(groups[1]?.rowIds).toEqual(["solo"]);
  });
});

describe("unusedReviewIngredientIds", () => {
  it("includes orphans and alias-only rows", () => {
    const reports = new Map([
      ["orphan", emptyOrphanReport("orphan")],
      [
        "alias-only",
        { ...emptyOrphanReport("alias-only"), invoiceAliasCount: 1 },
      ],
      [
        "active",
        { ...emptyOrphanReport("active"), recipeIngredientCount: 1 },
      ],
    ]);
    const ids = unusedReviewIngredientIds(
      [ingredient("orphan", "A"), ingredient("alias-only", "B"), ingredient("active", "C")],
      reports,
    );
    expect(ids.has("orphan")).toBe(true);
    expect(ids.has("alias-only")).toBe(true);
    expect(ids.has("active")).toBe(false);
  });
});

describe("buildOperationalPriorityTiers", () => {
  it("groups critical and attention tiers from review items", () => {
    const tiers = buildOperationalPriorityTiers(
      [
        {
          id: "duplicate_canonical_risk",
          category: "duplicate_canonical_risk",
          title: "Possible duplicates",
          count: 1,
          explanation: "test",
          severity: "medium",
          ctaLabel: "Open",
          ctaTarget: { kind: "list_filter", filter: "duplicates" },
        },
        {
          id: "stale_catalog_prices",
          category: "stale_catalog_prices",
          title: "Stale",
          count: 2,
          explanation: "test",
          severity: "low",
          ctaLabel: "Open",
          ctaTarget: { kind: "list_filter", filter: "stale-prices" },
        },
      ],
      10,
    );
    expect(tiers.map((t) => t.tier)).toEqual(["critical", "attention"]);
    expect(tiers[0]?.cards[0]?.label).toMatch(/duplicate/i);
  });

  it("shows healthy tier when no issues", () => {
    const tiers = buildOperationalPriorityTiers([], 5);
    expect(tiers).toHaveLength(1);
    expect(tiers[0]?.tier).toBe("healthy");
    expect(tiers[0]?.totalCount).toBe(5);
  });
});

describe("buildOperationalSummarySnapshot", () => {
  it("flattens actionable queue cards for the empty detail panel", () => {
    const tiers = buildOperationalPriorityTiers(
      [
        {
          id: "duplicate_canonical_risk",
          category: "duplicate_canonical_risk",
          title: "Possible duplicates",
          count: 2,
          explanation: "Compare names",
          severity: "medium",
          ctaLabel: "Open",
          ctaTarget: { kind: "list_filter", filter: "duplicates" },
        },
        {
          id: "stale_catalog_prices",
          category: "stale_catalog_prices",
          title: "Stale",
          count: 3,
          explanation: "No recent update",
          severity: "low",
          ctaLabel: "Open",
          ctaTarget: { kind: "list_filter", filter: "stale-prices" },
        },
      ],
      10,
    );
    const snapshot = buildOperationalSummarySnapshot(tiers);
    expect(snapshot.catalogStable).toBe(false);
    expect(snapshot.lines).toHaveLength(2);
    expect(snapshot.lines[0]?.label).toMatch(/duplicate/i);
    expect(snapshot.lines[1]?.count).toBe(3);
  });

  it("marks catalog stable when only the healthy tier is present", () => {
    const tiers = buildOperationalPriorityTiers([], 4);
    const snapshot = buildOperationalSummarySnapshot(tiers);
    expect(snapshot.catalogStable).toBe(true);
    expect(snapshot.lines).toHaveLength(0);
  });
});

describe("buildOperationalGlanceTiles", () => {
  it("derives compact stat tiles from tier groups", () => {
    const tiers = buildOperationalPriorityTiers(
      [
        {
          id: "duplicate_canonical_risk",
          category: "duplicate_canonical_risk",
          title: "Possible duplicates",
          count: 2,
          explanation: "2 clusters",
          severity: "medium",
          ctaLabel: "Open",
          ctaTarget: { kind: "list_filter", filter: "duplicates" },
        },
        {
          id: "stale_catalog_prices",
          category: "stale_catalog_prices",
          title: "Stale",
          count: 5,
          explanation: "5 risks",
          severity: "low",
          ctaLabel: "Open",
          ctaTarget: { kind: "list_filter", filter: "stale-prices" },
        },
        {
          id: "catalog_confirmation_pending",
          category: "catalog_confirmation_pending",
          title: "Confirm",
          count: 3,
          explanation: "3 pending",
          severity: "low",
          ctaLabel: "Open",
          ctaTarget: { kind: "list_filter", filter: "catalog-confirmation" },
        },
        {
          id: "orphan_canonical_ingredients",
          category: "orphan_canonical_ingredients",
          title: "Unused",
          count: 1,
          explanation: "1 unused",
          severity: "low",
          ctaLabel: "Open",
          ctaTarget: { kind: "list_filter", filter: "unused" },
        },
      ],
      10,
    );

    const tiles = buildOperationalGlanceTiles(tiers);
    expect(tiles).toHaveLength(4);
    expect(tiles.find((t) => t.id === "critical")?.count).toBe(2);
    expect(tiles.find((t) => t.id === "stale-prices")?.count).toBe(5);
    expect(tiles.find((t) => t.id === "catalog-confirmation")?.count).toBe(3);
    expect(tiles.find((t) => t.id === "unused")?.count).toBe(1);
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
    vi.spyOn(pricingFreshness, "loadPriceHistoryLatestAtByIngredientId").mockResolvedValue({});
    vi.spyOn(pricingFreshness, "loadLatestConfirmedPurchaseAtByIngredientId").mockResolvedValue(
      {},
    );

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
    vi.spyOn(pricingFreshness, "loadPriceHistoryLatestAtByIngredientId").mockResolvedValue({});
    vi.spyOn(pricingFreshness, "loadLatestConfirmedPurchaseAtByIngredientId").mockResolvedValue(
      {},
    );

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
