import { describe, expect, it } from "vitest";
import {
  buildIngredientDetailInsights,
  buildOperationalInsights,
  buildIngredientDetailKpis,
  buildIngredientDetailSections,
  buildIngredientDetailSummaryNotes,
  buildIngredientPurchaseInsights,
  buildRecipeImpactLabel,
  findCheapestPurchaseItemId,
  findMostExpensivePurchaseItemId,
  formatIngredientPackPrice,
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
): IngredientMatchedInvoiceProduct => ({
  matchedIngredientId: "ing-1",
  itemId: "line-1",
  itemName: "LINE",
  supplierName: "Continente",
  invoiceDate: "2026-05-18",
  invoiceId: "inv-1",
  unitPrice: 1.39,
  lineTotal: 1.39,
  matchBucket: "matched",
  matchDisplayState: "matched",
  matchKind: "exact",
  confidenceLabel: "100%",
  matchSourceHeadline: "",
  matchSourceDetail: "",
  purchaseStructureSummary: null,
  normalizedUsableQuantityLabel: null,
  ...overrides,
});

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
      }),
      invoiceLine({
        matchedIngredientId: "ing-bacon",
        itemId: "line-auchan",
        itemName: "BAC STRK 1KG",
        supplierName: "Auchan",
        invoiceDate: "2026-04-10",
        unitPrice: 8.5,
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
    expect(insights.some((chip) => chip.label === "High volatility")).toBe(true);
    expect(insights.some((chip) => chip.label === "Supplier variation detected")).toBe(
      true,
    );
    expect(insights.some((chip) => chip.label === "High recipe exposure")).toBe(false);
    expect(insights.some((chip) => chip.label.startsWith("Lowest recorded"))).toBe(false);
    expect(insights.some((chip) => chip.label === "2 suppliers tracked")).toBe(false);
    expect(purchaseInsights.showWorstPurchase).toBe(true);
    expect(formatPurchaseInsightLine(purchaseInsights.best!)).toMatch(/Auchan.*€8\.50/);
    expect(formatPurchaseInsightLine(purchaseInsights.worst!)).toMatch(/Metro.*€9\.99/);
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

    expect(insights.some((chip) => chip.label === "Single supplier dependency")).toBe(true);
    expect(insights.some((chip) => chip.label === "High volatility")).toBe(false);
    expect(insights.some((chip) => chip.label === "High recipe exposure")).toBe(true);
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
    expect(insights.some((chip) => chip.label === "Price stable")).toBe(true);
    expect(insights.some((chip) => chip.label === "Multiple suppliers available")).toBe(true);
    expect(insights.some((chip) => chip.label === "Best supplier changed recently")).toBe(
      true,
    );
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

    expect(byId.volatility?.tone).toBe("caution");
    expect(byId["supplier-variation"]?.tone).toBe("info");
    expect(insightChipDotClassName("positive")).toContain("bg-success");
    expect(insightChipDotClassName("negative")).toContain("bg-destructive");
    expect(insightChipDotClassName("caution")).toContain("bg-warning");
    expect(insightChipDotClassName("info")).toContain("bg-primary");
    expect(insightChipDotClassName("neutral")).toContain("bg-muted-foreground/55");
  });

  it("purchase row dots mark cheapest and priciest rows", () => {
    const purchases = buildRecentPurchases("ing-dots", "Regression oil", [
      invoiceLine({
        matchedIngredientId: "ing-dots",
        itemId: "line-low",
        itemName: "REGRESSION OIL 1L",
        supplierName: "A",
        unitPrice: 2,
      }),
      invoiceLine({
        matchedIngredientId: "ing-dots",
        itemId: "line-mid",
        itemName: "REGRESSION OIL 1L",
        supplierName: "C",
        unitPrice: 3.5,
      }),
      invoiceLine({
        matchedIngredientId: "ing-dots",
        itemId: "line-high",
        itemName: "REGRESSION OIL 1L",
        supplierName: "B",
        unitPrice: 5,
      }),
    ]);

    expect(findCheapestPurchaseItemId(purchases)).toBe("line-low");
    expect(findMostExpensivePurchaseItemId(purchases)).toBe("line-high");
    expect(purchasePriceExtentsDiffer(purchases)).toBe(true);
    expect(purchaseRowDotClassName("line-low", purchases)).toContain("bg-success");
    expect(purchaseRowDotClassName("line-high", purchases)).toContain("bg-destructive");
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
    expect(purchaseRowDotClassName("line-only", purchases)).toContain("bg-muted-foreground/55");
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
    expect(chips.some((c) => c.id === "volatility")).toBe(true);
    expect(chips.some((c) => c.id === "recipe-exposure")).toBe(true);
    expect(purchaseInsights.showWorstPurchase).toBe(true);
    expect(purchaseInsights.best?.supplierLabel).toBe("Supplier A");
    expect(purchaseInsights.worst?.supplierLabel).toBe("Supplier B");
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
});
