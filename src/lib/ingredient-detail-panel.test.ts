import { describe, expect, it } from "vitest";
import {
  buildDuplicateReviewDetail,
  buildIngredientDetailInsights,
  buildIngredientOperationalCostPresentation,
  buildOperationalInsights,
  buildPricingFreshnessReviewDetail,
  buildUnusedEntryReviewDetail,
  buildIngredientDeltaIntelligence,
  buildIngredientDetailKpis,
  buildIngredientDetailSections,
  buildIngredientDetailSummaryNotes,
  buildIngredientPurchaseInsights,
  buildMatchCatalogIntelligenceLines,
  buildPanelOperationalNotes,
  buildRecipeImpactLabel,
  findCheapestPurchaseItemId,
  findMostExpensivePurchaseItemId,
  formatIngredientPackPrice,
  formatIngredientWorkspaceMatchLine,
  formatPurchaseExtentLine,
  formatPurchaseHistoryCatalogLine,
  formatPurchaseHistoryDatePriceLine,
  formatPurchaseHistoryRowLine,
  formatPurchaseHistorySupplierLine,
  purchaseHistoryPriceTextClassName,
  purchaseHistoryRowTextClassName,
  formatIngredientUnitCostKpi,
  formatLastPurchaseDateKpi,
  formatPurchaseInsightLine,
  formatRecentPurchaseLine,
  formatRecipesLinkedKpi,
  formatShortPurchaseDate,
  insightChipDotClassName,
  purchasePriceExtentsDiffer,
  purchaseRowDotClassName,
} from "@/lib/ingredient-detail-panel";
import { buildRecentPurchases } from "@/lib/ingredient-purchase-memory";
import type { IngredientMatchedInvoiceProduct } from "@/lib/ingredient-operational-intelligence";
import { emptyOrphanReport } from "@/lib/ingredient-orphan-detection";
import { derivePricingFreshnessSnapshot } from "@/lib/ingredient-pricing-freshness";
import type { Tables } from "@/integrations/supabase/types";

type IngredientRow = Tables<"ingredients">;

function ingredient(
  overrides: Partial<IngredientRow> & Pick<IngredientRow, "name">,
): IngredientRow {
  return {
    id: overrides.id ?? "ing-1",
    user_id: "user-1",
    name: overrides.name,
    normalized_name: overrides.name.toLowerCase(),
    unit: overrides.unit ?? "kg",
    current_price: overrides.current_price ?? 0,
    purchase_quantity: overrides.purchase_quantity ?? 1,
    purchase_unit: overrides.purchase_unit ?? null,
    base_unit: overrides.base_unit ?? null,
    ingredient_kind: "canonical",
    created_at: "2026-01-01",
    updated_at: "2026-01-01",
    ...overrides,
  } as IngredientRow;
}

const invoiceLine = (
  overrides: Partial<IngredientMatchedInvoiceProduct> = {},
): IngredientMatchedInvoiceProduct => {
  const unitPrice = overrides.unitPrice ?? 1.39;
  const lineTotal = overrides.lineTotal ?? unitPrice;
  return {
    matchedIngredientId: "ing-1",
    itemId: "line-1",
    itemName: "LINE",
    supplierName: "Continente",
    invoiceDate: "2026-05-18",
    chronologySourceType: "invoice_issue_date",
    invoiceId: "inv-1",
    invoiceCreatedAt: null,
    invoiceIssueDateRaw: "2026-05-18",
    itemCreatedAt: null,
    matchBucket: "matched",
    matchDisplayState: "matched",
    matchKind: "exact",
    confidenceLabel: "100%",
    matchSourceHeadline: "",
    matchSourceDetail: "",
    purchaseStructureSummary: null,
    normalizedUsableQuantityLabel: null,
    ...overrides,
    unitPrice,
    lineTotal,
  };
};

describe("ingredient-detail-panel", () => {
  it("alface: hides purchases, recipes, and price history when empty", () => {
    const alface = ingredient({
      id: "ing-alface",
      name: "Alface iceberg",
      unit: "un",
      current_price: 1.2,
      base_unit: "un",
    });
    const purchases = buildRecentPurchases("ing-alface", "Alface iceberg", []);
    const insights = buildIngredientDetailInsights({
      recentPurchases: purchases,
      recipeCount: 0,
    });
    const sections = buildIngredientDetailSections({
      recentPurchaseCount: purchases.length,
      recipeCount: 0,
      priceHistoryReady: true,
      priceHistoryCount: 0,
      insightCount: insights.length,
      purchaseInsightReady: false,
      summaryNoteCount: 0,
    });

    const kpis = buildIngredientDetailKpis({
      ingredient: alface,
      recipeCount: 0,
      recentPurchases: purchases,
    });

    expect(formatIngredientUnitCostKpi(alface)).toMatch(/€.*\/un/);
    expect(formatIngredientPackPrice(alface)).toBe("€1.20");
    expect(kpis.find((k) => k.label === "Pack price")?.value).toBe("€1.20");
    expect(formatRecipesLinkedKpi(0)).toBe("—");
    expect(formatLastPurchaseDateKpi(purchases)).toBe("—");
    expect(sections.showRecentPurchases).toBe(false);
    expect(sections.showRecipeImpact).toBe(false);
    expect(sections.showPriceHistory).toBe(false);
    expect(sections.showInsights).toBe(false);
    expect(buildRecipeImpactLabel(0, [])).toBeNull();
  });

  it("bacon: operational chips when multi-supplier data exists", () => {
    const purchases = buildRecentPurchases("ing-bacon", "Bacon streaky", [
      invoiceLine({
        matchedIngredientId: "ing-bacon",
        itemId: "line-bacon",
        itemName: "BAC STRK 1KG",
        supplierName: "Metro",
        invoiceDate: "2026-05-18",
        unitPrice: 9.99,
        lineTotal: 9.99,
      }),
      invoiceLine({
        matchedIngredientId: "ing-bacon",
        itemId: "line-auchan",
        itemName: "BAC STRK 1KG",
        supplierName: "Auchan",
        invoiceDate: "2026-04-10",
        unitPrice: 8.5,
        lineTotal: 8.5,
      }),
    ]);
    const insights = buildOperationalInsights({
      recentPurchases: purchases,
      recipeCount: 2,
    });
    const purchaseInsights = buildIngredientPurchaseInsights(purchases);
    const sections = buildIngredientDetailSections({
      recentPurchaseCount: purchases.length,
      recipeCount: 2,
      priceHistoryReady: true,
      priceHistoryCount: 3,
      insightCount: insights.length,
      purchaseInsightReady: purchaseInsights.best != null,
      summaryNoteCount: buildIngredientDetailSummaryNotes({
        recentPurchases: purchases,
      }).length,
    });

    expect(sections.showRecentPurchases).toBe(true);
    expect(sections.showRecipeImpact).toBe(true);
    expect(sections.showPriceHistory).toBe(true);
    expect(sections.showInsights).toBe(true);
    expect(sections.showPurchaseInsights).toBe(true);
    expect(
      insights.some((chip) => chip.label.includes("vary") || /inconsistent/i.test(chip.label)),
    ).toBe(true);
    expect(insights.some((chip) => chip.label.includes("Supplier pricing varies"))).toBe(true);
    expect(insights.some((chip) => chip.label === "Used in many recipes")).toBe(false);
    expect(insights.some((chip) => chip.label.startsWith("Lowest recorded"))).toBe(false);
    expect(insights.some((chip) => chip.label === "2 suppliers tracked")).toBe(false);
    expect(purchaseInsights.showWorstPurchase).toBe(true);
    expect(formatPurchaseInsightLine(purchaseInsights.best!)).toMatch(/Auchan · .* · €8\.50/);
    expect(formatPurchaseInsightLine(purchaseInsights.worst!)).toMatch(/Metro · .* · €9\.99/);
    expect(formatRecentPurchaseLine(purchases[0]!)).toMatch(/Metro.*€9\.99/);
    expect(buildRecipeImpactLabel(2, ["Chicken Burger", "Club Sandwich"])).toBe(
      "Used in: Chicken Burger, Club Sandwich",
    );
  });

  it("batata: single supplier and recipe exposure without volatility noise", () => {
    const purchases = buildRecentPurchases("ing-palha", "Batata palha", [
      invoiceLine({
        matchedIngredientId: "ing-palha",
        itemId: "line-palha",
        itemName: "BATATA PALHA 2KG",
        supplierName: "Continente",
        unitPrice: 4.5,
      }),
    ]);
    const insights = buildIngredientDetailInsights({
      recentPurchases: purchases,
      recipeCount: 4,
    });
    const sections = buildIngredientDetailSections({
      recentPurchaseCount: purchases.length,
      recipeCount: 4,
      priceHistoryReady: true,
      priceHistoryCount: 0,
      insightCount: insights.length,
      purchaseInsightReady: buildIngredientPurchaseInsights(purchases).best != null,
      summaryNoteCount: 0,
    });

    expect(insights.some((chip) => chip.label === "Single supplier in recent purchases")).toBe(
      false,
    );
    expect(insights.some((chip) => chip.id === "volatility")).toBe(false);
    expect(insights.some((chip) => chip.label === "Used in many recipes")).toBe(true);
    expect(sections.showPriceHistory).toBe(false);
    expect(sections.showRecipeImpact).toBe(true);
    expect(buildRecipeImpactLabel(4, [])).toBe("Used in 4 recipes");
  });

  it("oleo: stable multi-supplier pricing and best-supplier shift", () => {
    const purchases = buildRecentPurchases("ing-oleo", "Óleo girassol", [
      invoiceLine({
        matchedIngredientId: "ing-oleo",
        itemId: "line-oleo-c",
        itemName: "OLEO GIRASSOL 1L",
        supplierName: "Continente",
        invoiceDate: "2026-05-18",
        unitPrice: 3.19,
      }),
      invoiceLine({
        matchedIngredientId: "ing-oleo",
        itemId: "line-oleo-a",
        itemName: "OLEO GIRASSOL 1L",
        supplierName: "Auchan",
        invoiceDate: "2026-04-01",
        unitPrice: 3.2,
      }),
    ]);
    const insights = buildIngredientDetailInsights({
      recentPurchases: purchases,
      recipeCount: 1,
    });
    const purchaseInsights = buildIngredientPurchaseInsights(purchases);
    const notes = buildIngredientDetailSummaryNotes({ recentPurchases: purchases });

    expect(formatShortPurchaseDate("18/05/2026")).toBe("18/05");
    expect(
      buildIngredientDeltaIntelligence({ recentPurchases: purchases }).some((line) =>
        /stable|supplier/i.test(line.text),
      ),
    ).toBe(true);
    expect(
      buildIngredientDeltaIntelligence({ recentPurchases: purchases }).some(
        (line) => line.text.includes("Supplier changed") || line.text.includes("supplier shifted"),
      ),
    ).toBe(true);
    expect(insights.some((chip) => chip.label === "High volatility")).toBe(false);
    expect(notes.some((n) => n.startsWith("Cheapest supplier:"))).toBe(false);
    expect(purchaseInsights.best?.supplierLabel).toBe("Continente");
    expect(formatRecentPurchaseLine(purchases[0]!)).toMatch(/—/);
  });

  it("operational chips assign semantic tones for status dots", () => {
    const purchases = buildRecentPurchases("ing-tones", "Regression oil", [
      invoiceLine({
        matchedIngredientId: "ing-tones",
        itemId: "line-low",
        itemName: "REGRESSION OIL 1L",
        supplierName: "Supplier A",
        unitPrice: 2,
      }),
      invoiceLine({
        matchedIngredientId: "ing-tones",
        itemId: "line-high",
        itemName: "REGRESSION OIL 1L",
        supplierName: "Supplier B",
        unitPrice: 5,
      }),
    ]);
    const chips = buildOperationalInsights({ recentPurchases: purchases, recipeCount: 0 });
    const byId = Object.fromEntries(chips.map((chip) => [chip.id, chip]));

    expect(byId.volatility?.tone ?? byId["trend-volatile"]?.tone).toBe("caution");
    expect(byId["supplier-variation"]?.tone).toBe("info");
    expect(insightChipDotClassName("positive")).toContain("bg-success");
    expect(insightChipDotClassName("negative")).toContain("bg-destructive/55");
    expect(insightChipDotClassName("caution")).toContain("bg-warning");
    expect(insightChipDotClassName("info")).toContain("bg-primary");
    expect(insightChipDotClassName("neutral")).toContain("bg-muted-foreground/45");
  });

  it("purchase row dots mark cheapest and priciest rows", () => {
    const purchases = buildRecentPurchases("ing-dots", "Regression oil", [
      invoiceLine({
        matchedIngredientId: "ing-dots",
        itemId: "line-low",
        itemName: "REGRESSION OIL 1L",
        supplierName: "A",
        unitPrice: 2,
        lineTotal: 10,
      }),
      invoiceLine({
        matchedIngredientId: "ing-dots",
        itemId: "line-mid",
        itemName: "REGRESSION OIL 1L",
        supplierName: "C",
        unitPrice: 3.5,
        lineTotal: 15,
      }),
      invoiceLine({
        matchedIngredientId: "ing-dots",
        itemId: "line-high",
        itemName: "REGRESSION OIL 1L",
        supplierName: "B",
        unitPrice: 5,
        lineTotal: 20,
      }),
    ]);

    expect(findCheapestPurchaseItemId(purchases)).toBe("line-low");
    expect(findMostExpensivePurchaseItemId(purchases)).toBe("line-high");
    expect(purchasePriceExtentsDiffer(purchases)).toBe(true);
    expect(purchaseRowDotClassName("line-low", purchases)).toContain("bg-success");
    expect(purchaseRowDotClassName("line-high", purchases)).toContain("bg-destructive/55");
    expect(purchaseRowDotClassName("line-mid", purchases)).toBe("bg-border");
  });

  it("single-price purchases use neutral extent dot", () => {
    const purchases = buildRecentPurchases("ing-one", "Regression oil", [
      invoiceLine({
        matchedIngredientId: "ing-one",
        itemId: "line-only",
        itemName: "REGRESSION OIL 1L",
        unitPrice: 4,
      }),
    ]);
    expect(purchasePriceExtentsDiffer(purchases)).toBe(false);
    expect(purchaseRowDotClassName("line-only", purchases)).toContain("bg-muted-foreground/45");
  });

  it("regression: buildOperationalInsights emits chips when purchase rows exist", () => {
    const purchases = buildRecentPurchases("ing-reg", "Regression oil", [
      invoiceLine({
        matchedIngredientId: "ing-reg",
        itemId: "line-a",
        supplierName: "Supplier A",
        unitPrice: 5,
      }),
      invoiceLine({
        matchedIngredientId: "ing-reg",
        itemId: "line-b",
        supplierName: "Supplier B",
        unitPrice: 7.5,
      }),
    ]);
    const chips = buildOperationalInsights({ recentPurchases: purchases, recipeCount: 3 });
    const purchaseInsights = buildIngredientPurchaseInsights(purchases);
    const sections = buildIngredientDetailSections({
      recentPurchaseCount: purchases.length,
      recipeCount: 3,
      priceHistoryReady: true,
      priceHistoryCount: 0,
      insightCount: chips.length,
      purchaseInsightReady: purchaseInsights.best != null,
      summaryNoteCount: 0,
    });

    expect(chips.length).toBeGreaterThan(0);
    expect(sections.showInsights).toBe(true);
    expect(sections.showPurchaseInsights).toBe(true);
    expect(chips.some((c) => c.id === "volatility" || c.id === "trend-volatile")).toBe(true);
    expect(chips.some((c) => c.id === "recipe-exposure")).toBe(true);
    expect(purchaseInsights.showWorstPurchase).toBe(true);
    expect(purchaseInsights.best?.supplierLabel).toBe("Supplier A");
    expect(purchaseInsights.worst?.supplierLabel).toBe("Supplier B");
  });

  it("buildIngredientDeltaIntelligence surfaces above-lowest copy", () => {
    const purchases = buildRecentPurchases("ing-delta", "Regression oil", [
      invoiceLine({
        matchedIngredientId: "ing-delta",
        itemId: "line-high",
        supplierName: "Metro",
        invoiceDate: "2026-05-18",
        unitPrice: 10,
      }),
      invoiceLine({
        matchedIngredientId: "ing-delta",
        itemId: "line-low",
        supplierName: "Auchan",
        invoiceDate: "2026-04-01",
        unitPrice: 8,
      }),
    ]);
    const lines = buildIngredientDeltaIntelligence({ recentPurchases: purchases });
    expect(lines.some((l) => /trending high/i.test(l.text))).toBe(true);
    expect(lines.some((l) => l.text.includes("suppliers tracked"))).toBe(false);
  });

  it("buildDuplicateReviewDetail lists cluster members and guidance", () => {
    const section = buildDuplicateReviewDetail({
      cluster: {
        operationalKey: "angus-pty",
        ingredientIds: ["a1", "a2"],
        displayNames: ["ANGUS PTY", "Angus Patty"],
        confidence: "exact_operational_key",
      },
      catalog: [
        { id: "a1", name: "ANGUS PTY", created_at: "2020-01-01" },
        { id: "a2", name: "Angus Patty", created_at: "2021-01-01" },
      ],
      recipeCountById: { a1: 2, a2: 0 },
    });
    expect(section.lines[0]?.id).toBe("primary");
    expect(section.lines[0]?.text).toMatch(/catalog entr/i);
    expect(section.guidance).toMatch(/duplicate cluster/i);
  });

  it("buildPricingFreshnessReviewDetail uses amber/red tones for stale pricing", () => {
    const staleRefresh = new Date(Date.now() - 120 * 86_400_000).toISOString();
    const section = buildPricingFreshnessReviewDetail({
      ingredientName: "Batata palha",
      currentPrice: 4,
      priceRefreshAt: staleRefresh,
      recipeCount: 0,
      reviewMode: "stale-prices",
    });
    expect(section.lines[0]?.id).toBe("primary");
    expect(section.lines[0]?.tone).toBe("caution");
    expect(section.lines[0]?.text).toMatch(/understates|outdated|purchase signal/i);
  });

  it("buildPricingFreshnessReviewDetail uses negative tone for critical stale pricing", () => {
    const section = buildPricingFreshnessReviewDetail({
      ingredientName: "Batata palha",
      currentPrice: 4,
      priceRefreshAt: "2018-01-01T00:00:00Z",
      recipeCount: 0,
      reviewMode: "stale-prices",
    });
    expect(section.lines[0]?.id).toBe("primary");
    expect(section.lines[0]?.tone).toBe("negative");
    expect(section.lines[0]?.text).toMatch(/critically outdated|margins at risk/i);
  });

  it("buildPricingFreshnessReviewDetail uses info tone for catalog confirmation", () => {
    const fourDaysAgo = new Date(Date.now() - 4 * 86_400_000).toISOString().slice(0, 10);
    const section = buildPricingFreshnessReviewDetail({
      ingredientName: "Batata palha",
      currentPrice: 4,
      priceRefreshAt: "2020-01-01T00:00:00Z",
      lastPurchaseAt: fourDaysAgo,
      recipeCount: 0,
      reviewMode: "catalog-confirmation",
    });
    expect(section.lines[0]?.id).toBe("primary");
    expect(section.lines[0]?.tone).toBe("caution");
    expect(section.lines[0]?.text).toMatch(/not applied/i);
    expect(section.lines.some((line) => line.id === "operational-warning")).toBe(false);
    expect(section.guidance).toMatch(/supplier price/i);
  });

  it("buildPricingFreshnessReviewDetail explains stale review context", () => {
    const section = buildPricingFreshnessReviewDetail({
      ingredientName: "Batata palha",
      currentPrice: 3.5,
      priceRefreshAt: "2020-01-01T00:00:00Z",
      recipeCount: 2,
      reviewMode: "stale-prices",
    });
    expect(section.title).toMatch(/Outdated pricing/i);
    expect(section.lines[0]?.text).toMatch(/understates|outdated|purchase signal/i);
    expect(section.guidance).toMatch(/supplier price/i);
  });

  it("buildPricingFreshnessReviewDetail explains catalog confirmation queue", () => {
    const fourDaysAgo = new Date(Date.now() - 4 * 86_400_000).toISOString().slice(0, 10);
    const section = buildPricingFreshnessReviewDetail({
      ingredientName: "Batata palha",
      currentPrice: 3.5,
      priceRefreshAt: "2020-01-01T00:00:00Z",
      lastPurchaseAt: fourDaysAgo,
      recipeCount: 0,
      reviewMode: "catalog-confirmation",
    });
    expect(section.lines[0]?.text).toMatch(/not applied/i);
    expect(section.lines[0]?.text).not.toMatch(/outdated|90\+/i);
    expect(section.lines.some((line) => line.id === "operational-warning")).toBe(false);
    expect(section.guidance).toMatch(/supplier price/i);
  });

  it("buildPricingFreshnessReviewDetail never leaks confirmation copy into stale queue", () => {
    const fourDaysAgo = new Date(Date.now() - 4 * 86_400_000).toISOString().slice(0, 10);
    const section = buildPricingFreshnessReviewDetail({
      ingredientName: "Batata palha",
      currentPrice: 3.5,
      priceRefreshAt: "2020-01-01T00:00:00Z",
      lastPurchaseAt: fourDaysAgo,
      recipeCount: 2,
      reviewMode: "stale-prices",
    });
    expect(section.lines[0]?.text).not.toMatch(/confirm|awaiting|not applied/i);
    expect(
      section.lines.some((line) => line.id === "secondary" && /Feeds 2 recipes/i.test(line.text)),
    ).toBe(true);
  });

  it("buildOperationalInsights returns no chips in queue review mode", () => {
    const purchases = buildRecentPurchases("ing-1", "Test", [
      invoiceLine({ unitPrice: 9 }),
      invoiceLine({ itemId: "line-2", unitPrice: 5, invoiceDate: "2026-04-01" }),
    ]);
    expect(
      buildOperationalInsights({
        recentPurchases: purchases,
        recipeCount: 4,
        listReviewMode: "unused",
      }),
    ).toEqual([]);
  });

  it("buildUnusedEntryReviewDetail distinguishes orphan rows", () => {
    const section = buildUnusedEntryReviewDetail(emptyOrphanReport("orphan-id"));
    expect(section.title).toMatch(/Unused/i);
    expect(section.guidance).toMatch(/archive|Delete/i);
  });

  it("formats KPI last purchase date from sorted purchases", () => {
    const purchases = buildRecentPurchases("ing-oleo", "Óleo", [
      invoiceLine({
        matchedIngredientId: "ing-oleo",
        itemId: "line-new",
        invoiceDate: "2026-05-18",
        unitPrice: 3.2,
      }),
      invoiceLine({
        matchedIngredientId: "ing-oleo",
        itemId: "line-old",
        invoiceDate: "2026-04-01",
        unitPrice: 2.89,
      }),
    ]);
    const sorted = [...purchases].sort(
      (a, b) =>
        new Date(b.dateLabel.includes("T") ? b.dateLabel : `${b.dateLabel}T12:00:00`).getTime() -
        new Date(a.dateLabel.includes("T") ? a.dateLabel : `${a.dateLabel}T12:00:00`).getTime(),
    );

    expect(formatLastPurchaseDateKpi(sorted)).toMatch(/18.*2026/i);
  });

  it("formatPurchaseHistoryRowLine uses supplier, month-day, and price", () => {
    const purchases = buildRecentPurchases("ing-1", "Test", [
      invoiceLine({
        supplierName: "DASS Bebidas",
        invoiceDate: "2026-05-18",
        unitPrice: 7.8,
      }),
    ]);
    const line = formatPurchaseHistoryRowLine(purchases[0]!);
    expect(line).toMatch(/DASS Bebidas · 18 May · €7\.80/);
  });

  it("formatPurchaseHistoryCatalogLine prefixes invoice product hint", () => {
    const purchases = buildRecentPurchases("ing-1", "Acém novilho", [
      invoiceLine({
        itemName: "Acém novilho c/ osso",
        supplierName: "Makro",
        unitPrice: 8.9,
      }),
    ]);
    expect(formatPurchaseHistoryCatalogLine(purchases[0]!)).toBe("catalog: Acém novilho c/ osso");
  });

  it("formatPurchaseExtentLine uses calm inline copy", () => {
    const purchases = buildRecentPurchases("ing-1", "Test", [
      invoiceLine({
        itemId: "low",
        supplierName: "Makro",
        unitPrice: 8.9,
        invoiceDate: "2026-05-05",
      }),
      invoiceLine({
        itemId: "high",
        supplierName: "Metro",
        unitPrice: 9.5,
        invoiceDate: "2026-05-18",
      }),
    ]);
    const insights = buildIngredientPurchaseInsights(purchases);
    expect(formatPurchaseExtentLine("best", insights.best!)).toMatch(
      /^Best purchase: Makro · €8\.90 · \d{1,2} May/,
    );
    expect(formatPurchaseExtentLine("worst", insights.worst!)).toMatch(
      /^Highest purchase: Metro · €9\.50 · \d{1,2} May/,
    );
  });

  it("stacked purchase history formatters split supplier and date·price", () => {
    const purchases = buildRecentPurchases("ing-1", "Test", [
      invoiceLine({
        supplierName: "Makro",
        invoiceDate: "2026-05-05",
        unitPrice: 8.9,
      }),
    ]);
    expect(formatPurchaseHistorySupplierLine(purchases[0]!)).toBe("Makro");
    expect(formatPurchaseHistoryDatePriceLine(purchases[0]!)).toMatch(/5 May · €8\.90/);
  });

  it("purchaseHistoryPriceTextClassName highlights cheapest and priciest prices", () => {
    const purchases = buildRecentPurchases("ing-1", "Test", [
      invoiceLine({ itemId: "high", unitPrice: 9, invoiceDate: "2026-05-20" }),
      invoiceLine({ itemId: "low", unitPrice: 5, invoiceDate: "2026-05-18" }),
    ]);
    expect(purchaseHistoryPriceTextClassName("low", purchases)).toContain("success");
    expect(purchaseHistoryPriceTextClassName("high", purchases)).toContain("destructive");
    expect(purchaseHistoryPriceTextClassName("mid", purchases)).toContain("muted");
    expect(purchaseHistoryRowTextClassName("low", purchases)).toContain("success");
  });

  it("buildMatchCatalogIntelligenceLines stays terse", () => {
    const snapshot = derivePricingFreshnessSnapshot({
      currentPrice: 10,
      priceRefreshAt: null,
      lastPurchaseAt: "2026-05-01",
    });
    expect(
      buildMatchCatalogIntelligenceLines({
        aliasCount: 3,
        duplicateCandidateCount: 2,
        pricingSnapshot: snapshot,
        listReviewMode: "catalog-confirmation",
      }),
    ).toEqual(
      expect.arrayContaining([
        "3 aliases detected",
        "1 duplicate candidate",
        expect.stringMatching(/needs confirmation/i),
      ]),
    );
    expect(
      formatIngredientWorkspaceMatchLine({
        aliasCount: 3,
        duplicateCandidateCount: 2,
        pricingSnapshot: snapshot,
        listReviewMode: "catalog-confirmation",
      }),
    ).toMatch(/3 aliases detected/);
  });

  it("buildMatchCatalogIntelligenceLines omits pricing copy in browse mode", () => {
    const recentPurchase = new Date(Date.now() - 4 * 86_400_000).toISOString().slice(0, 10);
    const snapshot = derivePricingFreshnessSnapshot({
      currentPrice: 10,
      priceRefreshAt: null,
      lastPurchaseAt: recentPurchase,
    });
    expect(snapshot.catalogConfirmationPending).toBe(true);
    expect(
      buildMatchCatalogIntelligenceLines({
        aliasCount: 0,
        duplicateCandidateCount: 1,
        pricingSnapshot: snapshot,
        listReviewMode: null,
      }),
    ).toEqual([]);
  });

  it("buildPanelOperationalNotes omits generic delta and invoice copy", () => {
    const notes = buildPanelOperationalNotes({
      deltaLines: [
        {
          id: "shift",
          text: "Best-value supplier shifted",
          tone: "info",
        },
        {
          id: "volatile",
          text: "Inconsistent across recent purchases",
          tone: "caution",
        },
      ],
      reviewLines: [],
      recipeCount: 6,
      latestPurchaseDate: "2026-01-01",
      duplicateClusterSize: 3,
      catalogConfirmationPending: true,
      inListReview: false,
    });
    expect(notes).not.toContain("Best-value supplier shifted");
    expect(notes).not.toContain("Price volatility detected");
    expect(notes).not.toContain("Latest invoice not confirmed");
    expect(notes).not.toContain("Ingredient unused in recipes");
  });

  it("buildIngredientOperationalCostPresentation shows normalized pack and unit costs", () => {
    const peroni = ingredient({
      name: "Peroni Nastro Azzurro 24 x 33cl",
      current_price: 25.69,
      purchase_quantity: 7920,
      purchase_unit: "pack",
      base_unit: "ml",
      unit: "ml",
    });
    const presentation = buildIngredientOperationalCostPresentation(peroni);
    expect(presentation?.lines.some((line) => line.label === "Cost per litre")).toBe(true);
    expect(presentation?.lines.some((line) => line.label.startsWith("Cost per"))).toBe(true);
  });
});
