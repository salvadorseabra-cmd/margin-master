import { describe, expect, it } from "vitest";
import {
  countCatalogConfirmationPending,
  countStaleCatalogPrices,
  derivePricingFreshnessLevel,
  derivePricingFreshnessSnapshot,
  daysSinceRecency,
  formatCatalogConfirmationListExplanation,
  formatPricingRowExplanation,
  formatStaleReviewListExplanation,
  formatPricingReviewPanelLine,
  formatPricingReviewPrimaryIssue,
  formatPricingReviewSecondaryContext,
  pricingStatusDuplicatesBadge,
  pricingFreshnessBadgeClassName,
  pricingFreshnessBadgeHint,
  pricingFreshnessBadgeLabel,
  isCatalogConfirmationPending,
  isStaleForPriceReview,
  resolvePricingRecency,
  STALE_REVIEW_THRESHOLD_DAYS,
} from "@/lib/ingredient-pricing-freshness";

describe("ingredient-pricing-freshness", () => {
  it("treats recent price refresh as fresh", () => {
    const snapshot = derivePricingFreshnessSnapshot({
      currentPrice: 4,
      priceRefreshAt: new Date().toISOString(),
    });
    expect(snapshot.inStaleReview).toBe(false);
    expect(snapshot.catalogConfirmationPending).toBe(false);
    expect(snapshot.level).toBe("fresh");
  });

  it("marks stale when only old price refresh exists", () => {
    expect(
      isStaleForPriceReview({
        currentPrice: 3,
        priceRefreshAt: "2020-01-01T00:00:00Z",
      }),
    ).toBe(true);
  });

  it("ignores catalog updated_at — no recency means stale", () => {
    expect(
      isStaleForPriceReview({
        currentPrice: 2,
        priceRefreshAt: null,
        lastPurchaseAt: null,
      }),
    ).toBe(true);
  });

  it("prefers the more recent confirmed purchase over older refresh", () => {
    const recency = resolvePricingRecency({
      priceRefreshAt: "2020-01-01T00:00:00Z",
      lastPurchaseAt: new Date().toISOString(),
    });
    expect(recency.source).toBe("confirmed_purchase");
    expect(
      isStaleForPriceReview({
        currentPrice: 2,
        priceRefreshAt: "2020-01-01T00:00:00Z",
        lastPurchaseAt: new Date().toISOString(),
      }),
    ).toBe(false);
  });

  it("parses ISO purchase dates from invoice scan", () => {
    const recent = new Date();
    recent.setDate(recent.getDate() - 15);
    const isoDate = recent.toISOString().slice(0, 10);
    const days = daysSinceRecency(isoDate);
    expect(days).not.toBeNull();
    expect(days!).toBeLessThan(30);
  });

  it("derives aging and critical levels from days since refresh", () => {
    expect(derivePricingFreshnessLevel(20, true)).toBe("fresh");
    expect(derivePricingFreshnessLevel(45, true)).toBe("aging");
    expect(derivePricingFreshnessLevel(STALE_REVIEW_THRESHOLD_DAYS, true)).toBe("stale");
    expect(derivePricingFreshnessLevel(200, true)).toBe("critical");
    expect(derivePricingFreshnessLevel(null, false)).toBe("unknown");
  });

  it("excludes fresh confirmed purchases from stale review queue", () => {
    const fourDaysAgo = new Date(Date.now() - 4 * 86_400_000).toISOString().slice(0, 10);
    expect(
      isStaleForPriceReview({
        currentPrice: 2,
        priceRefreshAt: "2020-01-01T00:00:00Z",
        lastPurchaseAt: fourDaysAgo,
      }),
    ).toBe(false);
    expect(
      derivePricingFreshnessSnapshot({
        currentPrice: 2,
        priceRefreshAt: "2020-01-01T00:00:00Z",
        lastPurchaseAt: fourDaysAgo,
      }).level,
    ).toBe("fresh");
  });

  it("flags catalog confirmation when recent invoice beats pack refresh", () => {
    const fourDaysAgo = new Date(Date.now() - 4 * 86_400_000).toISOString().slice(0, 10);
    expect(
      isCatalogConfirmationPending({
        currentPrice: 2,
        priceRefreshAt: "2020-01-01T00:00:00Z",
        lastPurchaseAt: fourDaysAgo,
      }),
    ).toBe(true);
    const snapshot = derivePricingFreshnessSnapshot({
      currentPrice: 2,
      priceRefreshAt: "2020-01-01T00:00:00Z",
      lastPurchaseAt: fourDaysAgo,
    });
    expect(snapshot.inStaleReview).toBe(false);
    expect(snapshot.catalogConfirmationPending).toBe(true);
    expect(snapshot.level).toBe("fresh");
  });

  it("splits catalog confirmation from stale catalog counts", () => {
    const recentPurchase = new Date().toISOString().slice(0, 10);
    const catalog = [
      { id: "pending", current_price: 2 },
      { id: "stale", current_price: 3 },
    ];
    const history = { pending: "2020-01-01T00:00:00Z", stale: "2020-01-01T00:00:00Z" };
    const purchases = { pending: recentPurchase };
    expect(countCatalogConfirmationPending(catalog, history, purchases).count).toBe(1);
    expect(countStaleCatalogPrices(catalog, history, purchases).count).toBe(1);
  });

  it("uses semantic badge colors for freshness chips", () => {
    expect(pricingFreshnessBadgeClassName("fresh", false)).toContain("success");
    expect(pricingFreshnessBadgeClassName("stale", false)).toContain("warning");
    expect(pricingFreshnessBadgeClassName("critical", false)).toContain("destructive");
    expect(pricingFreshnessBadgeClassName("fresh", true)).toContain("warning");
    expect(pricingFreshnessBadgeClassName("fresh", true)).not.toContain("primary");
  });

  it("uses list-friendly freshness badge labels", () => {
    expect(pricingFreshnessBadgeLabel("fresh", false)).toBe("Fresh");
    expect(pricingFreshnessBadgeLabel("aging", false)).toBe("Aging");
    expect(pricingFreshnessBadgeLabel("stale", false)).toBe("Outdated");
    expect(pricingFreshnessBadgeLabel("critical", false)).toBe("Outdated");
    expect(pricingFreshnessBadgeLabel("fresh", true)).toBe("Aging");
  });

  it("scopes row explanations per pricing queue", () => {
    const fourDaysAgo = new Date(Date.now() - 4 * 86_400_000).toISOString().slice(0, 10);
    const snapshot = derivePricingFreshnessSnapshot({
      currentPrice: 2,
      priceRefreshAt: "2020-01-01T00:00:00Z",
      lastPurchaseAt: fourDaysAgo,
    });
    const catalogLine = formatPricingRowExplanation(snapshot, "catalog-confirmation");
    const staleLine = formatPricingRowExplanation(snapshot, "stale-prices");

    expect(catalogLine).toMatch(/confirm|awaiting|recent/i);
    expect(catalogLine).not.toMatch(/outdated|90\+/i);
    expect(staleLine).not.toMatch(/confirm|awaiting/i);
    expect(formatCatalogConfirmationListExplanation(snapshot)).toMatch(/confirm/i);
  });

  it("uses queue-scoped badge labels and hints", () => {
    expect(pricingFreshnessBadgeLabel("fresh", true, "catalog-confirmation")).toBe("Aging");
    expect(pricingFreshnessBadgeLabel("fresh", true, "stale-prices")).toBe("Outdated");
    expect(pricingFreshnessBadgeHint("fresh", "confirmed_purchase", true, "stale-prices")).not.toMatch(
      /confirm|awaiting/i,
    );
    expect(
      pricingFreshnessBadgeHint("fresh", "confirmed_purchase", true, "catalog-confirmation"),
    ).toMatch(/awaiting confirmation/i);
  });

  it("dedupes catalog panel copy that repeats the Aging badge", () => {
    const fourDaysAgo = new Date(Date.now() - 4 * 86_400_000).toISOString().slice(0, 10);
    const snapshot = derivePricingFreshnessSnapshot({
      currentPrice: 4,
      priceRefreshAt: "2020-01-01T00:00:00Z",
      lastPurchaseAt: fourDaysAgo,
    });
    const listLine = formatPricingRowExplanation(snapshot, "catalog-confirmation");
    expect(
      pricingStatusDuplicatesBadge(snapshot, "catalog-confirmation", listLine),
    ).toBe(true);
    expect(formatPricingReviewPanelLine(snapshot, "catalog-confirmation")).toBeNull();
  });

  it("formats review panel primary and secondary copy", () => {
    const fourDaysAgo = new Date(Date.now() - 4 * 86_400_000).toISOString().slice(0, 10);
    const snapshot = derivePricingFreshnessSnapshot({
      currentPrice: 2,
      priceRefreshAt: "2020-01-01T00:00:00Z",
      lastPurchaseAt: fourDaysAgo,
    });
    expect(formatPricingReviewPrimaryIssue(snapshot, "catalog-confirmation")).toMatch(
      /not applied/i,
    );
    expect(formatPricingReviewSecondaryContext(snapshot, "catalog-confirmation", 0)).toMatch(
      new RegExp(`${snapshot.daysSince}d ago`, "i"),
    );
    expect(formatPricingReviewPrimaryIssue(snapshot, "stale-prices")).not.toMatch(/not applied/i);
  });

  it("formats list explanations for stale review rows", () => {
    expect(
      formatStaleReviewListExplanation({
        recencyAt: null,
        source: "none",
        daysSince: null,
        level: "unknown",
      }),
    ).toMatch(/no update/i);

    expect(
      formatStaleReviewListExplanation({
        recencyAt: "2020-01-01T00:00:00Z",
        source: "confirmed_purchase",
        daysSince: 124,
        level: "stale",
      }),
    ).toMatch(/124d ago/i);

    expect(
      formatStaleReviewListExplanation({
        recencyAt: "2026-01-15T00:00:00Z",
        source: "price_refresh",
        daysSince: 120,
        level: "stale",
      }),
    ).toMatch(/pack/i);
  });
});
