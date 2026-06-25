import type { SupabaseClient } from "@supabase/supabase-js";
import type { IngredientAliasMap, IngredientCanonicalInput } from "@/lib/ingredient-canonical";
import {
  buildLatestConfirmedPurchaseAtByIngredientIdFromScan,
  buildLatestPurchaseGlanceByIngredientIdFromScan,
  loadInvoiceItemsForMatchedProductScan,
  loadPersistedMatchByItemIdForScan,
  type IngredientLatestPurchaseGlance,
} from "@/lib/ingredient-operational-intelligence";
import type { Database } from "@/integrations/supabase/types";

/** Operational window: no confirmed purchase / pack refresh beyond this → stale review. */
export const STALE_REVIEW_THRESHOLD_DAYS = 90;

export const FRESHNESS_FRESH_MAX_DAYS = 30;
export const FRESHNESS_AGING_MAX_DAYS = 60;
export const FRESHNESS_CRITICAL_MIN_DAYS = 180;

export type PricingFreshnessLevel = "fresh" | "aging" | "stale" | "critical" | "unknown";

/** Presentation scope for pricing queue rows and badges (not filter logic). */
export type PricingFreshnessQueueMode = "catalog-confirmation" | "stale-prices";

export type PricingRecencySource = "confirmed_purchase" | "price_refresh" | "none";

export type PricingFreshnessInput = {
  currentPrice?: number | null;
  /** Latest ingredient_price_history row (invoice-confirmed pack refresh). */
  priceRefreshAt?: string | null;
  /** Latest matched invoice purchase date (ISO or locale date label). */
  lastPurchaseAt?: string | null;
};

export type PricingFreshnessSnapshot = {
  recencyAt: string | null;
  source: PricingRecencySource;
  daysSince: number | null;
  level: PricingFreshnessLevel;
  /** Recent invoice exists but catalog pack not refreshed since that purchase. */
  catalogConfirmationPending: boolean;
  /** 90+ days without confirmed pricing signal (excludes catalog-confirmation queue). */
  inStaleReview: boolean;
};

type CatalogRow = {
  id?: string | null;
  current_price?: number | null;
};

type ReviewClient = SupabaseClient<Database>;

function hasCatalogPrice(currentPrice: number | null | undefined): boolean {
  const price = Number(currentPrice);
  return Number.isFinite(price) && price > 0;
}

function parseRecencyTimestamp(value: string | null | undefined): number | null {
  if (!value?.trim()) return null;
  const trimmed = value.trim();
  if (trimmed.includes("T")) {
    const direct = new Date(trimmed).getTime();
    return Number.isFinite(direct) ? direct : null;
  }
  const isoDate = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoDate) {
    const year = Number(isoDate[1]);
    const month = Number(isoDate[2]) - 1;
    const day = Number(isoDate[3]);
    const parsed = new Date(year, month, day, 12, 0, 0).getTime();
    return Number.isFinite(parsed) ? parsed : null;
  }
  const slash = trimmed.match(/(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/);
  if (slash) {
    const day = Number(slash[1]);
    const month = Number(slash[2]) - 1;
    let year = Number(slash[3]);
    if (year < 100) year += 2000;
    const parsed = new Date(year, month, day, 12, 0, 0).getTime();
    return Number.isFinite(parsed) ? parsed : null;
  }
  const parsed = new Date(`${trimmed}T12:00:00`).getTime();
  return Number.isFinite(parsed) ? parsed : null;
}

export function daysSinceRecency(value: string | null | undefined): number | null {
  const timestamp = parseRecencyTimestamp(value);
  if (timestamp == null) return null;
  const ageMs = Date.now() - timestamp;
  if (ageMs < 0) return 0;
  return Math.floor(ageMs / 86_400_000);
}

export function resolvePricingRecency(input: PricingFreshnessInput): {
  recencyAt: string | null;
  source: PricingRecencySource;
  daysSince: number | null;
} {
  const refreshAt = input.priceRefreshAt?.trim() || null;
  const purchaseAt = input.lastPurchaseAt?.trim() || null;
  const refreshMs = parseRecencyTimestamp(refreshAt);
  const purchaseMs = parseRecencyTimestamp(purchaseAt);

  if (refreshMs == null && purchaseMs == null) {
    return { recencyAt: null, source: "none", daysSince: null };
  }

  if (purchaseMs != null && (refreshMs == null || purchaseMs >= refreshMs)) {
    return {
      recencyAt: purchaseAt,
      source: "confirmed_purchase",
      daysSince: daysSinceRecency(purchaseAt),
    };
  }

  return {
    recencyAt: refreshAt,
    source: "price_refresh",
    daysSince: daysSinceRecency(refreshAt),
  };
}

/** Recent invoice within 30d but catalog pack not applied since that purchase. */
export function isCatalogConfirmationPending(input: PricingFreshnessInput): boolean {
  if (!hasCatalogPrice(input.currentPrice)) return false;

  const purchaseAt = input.lastPurchaseAt?.trim() || null;
  const purchaseDays = daysSinceRecency(purchaseAt);
  if (purchaseDays == null || purchaseDays >= FRESHNESS_FRESH_MAX_DAYS) return false;

  const refreshAt = input.priceRefreshAt?.trim() || null;
  const purchaseMs = parseRecencyTimestamp(purchaseAt);
  const refreshMs = parseRecencyTimestamp(refreshAt);
  if (purchaseMs == null) return false;

  return refreshMs == null || purchaseMs > refreshMs;
}

export function derivePricingFreshnessLevel(
  daysSince: number | null,
  hasRecency: boolean,
): PricingFreshnessLevel {
  if (!hasRecency || daysSince == null) return "unknown";
  if (daysSince < FRESHNESS_FRESH_MAX_DAYS) return "fresh";
  if (daysSince < STALE_REVIEW_THRESHOLD_DAYS) return "aging";
  if (daysSince < FRESHNESS_CRITICAL_MIN_DAYS) return "stale";
  return "critical";
}

export function derivePricingFreshnessSnapshot(
  input: PricingFreshnessInput,
  staleThresholdDays = STALE_REVIEW_THRESHOLD_DAYS,
): PricingFreshnessSnapshot {
  const recency = resolvePricingRecency(input);
  const catalogConfirmationPending = isCatalogConfirmationPending(input);
  const level = derivePricingFreshnessLevel(recency.daysSince, recency.recencyAt != null);
  const inStaleReview =
    hasCatalogPrice(input.currentPrice) &&
    !catalogConfirmationPending &&
    (recency.recencyAt == null ||
      (recency.daysSince != null && recency.daysSince >= staleThresholdDays));

  return {
    recencyAt: recency.recencyAt,
    source: recency.source,
    daysSince: recency.daysSince,
    level,
    catalogConfirmationPending,
    inStaleReview,
  };
}

export function isStaleForPriceReview(
  input: PricingFreshnessInput,
  staleThresholdDays = STALE_REVIEW_THRESHOLD_DAYS,
): boolean {
  return derivePricingFreshnessSnapshot(input, staleThresholdDays).inStaleReview;
}

export function isCatalogConfirmationForReview(input: PricingFreshnessInput): boolean {
  return isCatalogConfirmationPending(input);
}

export function formatPricingFreshnessMonthYear(value: string | null | undefined): string {
  const timestamp = parseRecencyTimestamp(value);
  if (timestamp == null) return "unknown date";
  return new Date(timestamp).toLocaleDateString("en-GB", {
    month: "short",
    year: "numeric",
  });
}

/** Per-row explanation when the catalog confirmation queue is active. */
export function formatCatalogConfirmationListExplanation(
  snapshot: Pick<PricingFreshnessSnapshot, "recencyAt" | "daysSince">,
): string {
  if (snapshot.daysSince != null && snapshot.daysSince < FRESHNESS_FRESH_MAX_DAYS) {
    return `Purchase ${snapshot.daysSince}d ago · needs confirmation`;
  }
  if (snapshot.recencyAt) {
    return `Purchase ${formatPricingFreshnessMonthYear(snapshot.recencyAt)} · needs confirmation`;
  }
  return "Recent purchase · needs confirmation";
}

/** Per-row explanation when the truly stale price review filter is active. */
export function formatStaleReviewListExplanation(
  snapshot: Pick<PricingFreshnessSnapshot, "recencyAt" | "source" | "daysSince" | "level">,
): string {
  if (!snapshot.recencyAt) {
    return `No update in ${STALE_REVIEW_THRESHOLD_DAYS}+ days`;
  }
  if (snapshot.source === "confirmed_purchase" && snapshot.daysSince != null) {
    return `Last purchase ${snapshot.daysSince}d ago`;
  }
  if (snapshot.source === "price_refresh") {
    return `Pack ${formatPricingFreshnessMonthYear(snapshot.recencyAt)} · no purchase`;
  }
  if (snapshot.daysSince != null) {
    return `${snapshot.daysSince}d since update`;
  }
  return `Last signal ${formatPricingFreshnessMonthYear(snapshot.recencyAt)}`;
}

/** Primary list/detail line — never contradicts freshness badge. */
export function formatPricingFreshnessPositiveLine(
  snapshot: Pick<
    PricingFreshnessSnapshot,
    "recencyAt" | "source" | "level" | "catalogConfirmationPending"
  >,
  queue?: PricingFreshnessQueueMode,
): string | null {
  if (queue === "stale-prices") return null;
  if (snapshot.catalogConfirmationPending && snapshot.recencyAt) {
    return `Confirm price · ${formatPricingFreshnessMonthYear(snapshot.recencyAt)}`;
  }
  if (queue === "catalog-confirmation") {
    if (snapshot.recencyAt) {
      return `Purchase ${formatPricingFreshnessMonthYear(snapshot.recencyAt)} · confirm pack`;
    }
    return "Confirm pack from purchase";
  }
  if (snapshot.level !== "fresh" || !snapshot.recencyAt) return null;
  if (snapshot.source === "confirmed_purchase") {
    return `Fresh · invoice ${formatPricingFreshnessMonthYear(snapshot.recencyAt)}`;
  }
  if (snapshot.source === "price_refresh") {
    return `Pack confirmed · ${formatPricingFreshnessMonthYear(snapshot.recencyAt)}`;
  }
  return null;
}

/** List/detail row explanation scoped to a pricing review queue. */
export function formatPricingRowExplanation(
  snapshot: PricingFreshnessSnapshot,
  queue: PricingFreshnessQueueMode,
): string {
  if (queue === "catalog-confirmation") {
    return (
      formatPricingFreshnessPositiveLine(snapshot, queue) ??
      formatCatalogConfirmationListExplanation(snapshot)
    );
  }
  return formatStaleReviewListExplanation(snapshot);
}

/** Detail panel line — shorter than list copy; skips badge-redundant phrasing. */
export function formatPricingReviewPanelLine(
  snapshot: PricingFreshnessSnapshot,
  queue: PricingFreshnessQueueMode,
): string | null {
  if (pricingStatusDuplicatesBadge(snapshot, queue, formatPricingRowExplanation(snapshot, queue))) {
    return null;
  }

  return formatPricingReviewSecondaryContext(snapshot, queue, 0);
}

/** Dominant issue line for the ingredient review panel (one per block). */
export function formatPricingReviewPrimaryIssue(
  snapshot: PricingFreshnessSnapshot,
  queue: PricingFreshnessQueueMode,
): string {
  if (queue === "catalog-confirmation") {
    return "Recent purchase not applied to pack price";
  }
  if (!snapshot.recencyAt) {
    return `No purchase signal in ${STALE_REVIEW_THRESHOLD_DAYS}+ days`;
  }
  if (snapshot.level === "critical") {
    return "Pack price critically outdated — margins at risk";
  }
  return "Pack price likely understates true cost";
}

/** Optional quiet context below the primary issue (max one). */
export function formatPricingReviewSecondaryContext(
  snapshot: PricingFreshnessSnapshot,
  queue: PricingFreshnessQueueMode,
  recipeCount: number,
): string | null {
  if (queue === "stale-prices" && recipeCount > 0) {
    return `Feeds ${recipeCount} ${recipeCount === 1 ? "recipe" : "recipes"}`;
  }

  if (queue === "catalog-confirmation") {
    if (snapshot.daysSince != null && snapshot.daysSince < FRESHNESS_FRESH_MAX_DAYS) {
      return `Purchase ${snapshot.daysSince}d ago`;
    }
    if (snapshot.recencyAt) {
      return `Purchase ${formatPricingFreshnessMonthYear(snapshot.recencyAt)}`;
    }
    return null;
  }

  if (snapshot.source === "confirmed_purchase" && snapshot.daysSince != null) {
    return `Last purchase ${snapshot.daysSince}d ago`;
  }
  if (snapshot.source === "price_refresh" && snapshot.recencyAt) {
    return `Pack updated ${formatPricingFreshnessMonthYear(snapshot.recencyAt)} · no purchase on file`;
  }
  if (snapshot.daysSince != null) {
    return `${snapshot.daysSince}d since last signal`;
  }
  if (snapshot.recencyAt) {
    return `Last signal ${formatPricingFreshnessMonthYear(snapshot.recencyAt)}`;
  }
  return null;
}

/** True when a list/detail line repeats the header freshness badge. */
export function pricingStatusDuplicatesBadge(
  snapshot: PricingFreshnessSnapshot,
  queue: PricingFreshnessQueueMode,
  statusLine: string,
): boolean {
  const badge = pricingFreshnessBadgeLabel(
    snapshot.level,
    snapshot.catalogConfirmationPending,
    queue,
  );
  const normalized = statusLine.toLowerCase();

  if (badge === "Fresh" && /fresh|confirmed recently/.test(normalized)) {
    return true;
  }
  if (
    badge === "Aging" &&
    queue === "catalog-confirmation" &&
    /confirm|awaiting/.test(normalized)
  ) {
    return true;
  }
  if (badge === "Outdated" && queue === "stale-prices" && /outdated|90\+/.test(normalized)) {
    return true;
  }
  return false;
}

export function pricingFreshnessBadgeLabel(
  level: PricingFreshnessLevel,
  catalogConfirmationPending = false,
  queue?: PricingFreshnessQueueMode,
): string {
  if (queue === "catalog-confirmation") return "Aging";
  if (queue === "stale-prices") {
    switch (level) {
      case "fresh":
      case "aging":
        return "Outdated";
      case "stale":
      case "critical":
        return "Outdated";
      default:
        return "Outdated";
    }
  }
  if (catalogConfirmationPending) return "Aging";
  switch (level) {
    case "fresh":
      return "Fresh";
    case "aging":
      return "Aging";
    case "stale":
    case "critical":
      return "Outdated";
    default:
      return "Outdated";
  }
}

export function pricingFreshnessBadgeHint(
  level: PricingFreshnessLevel,
  source: PricingRecencySource = "none",
  catalogConfirmationPending = false,
  queue?: PricingFreshnessQueueMode,
): string {
  if (queue === "catalog-confirmation") {
    return catalogConfirmationPending
      ? "Recent purchase awaiting confirmation"
      : "Confirm pack price from latest purchase";
  }
  if (queue === "stale-prices") {
    if (!level || level === "unknown") {
      return `No pricing update in ${STALE_REVIEW_THRESHOLD_DAYS}+ days`;
    }
    if (source === "confirmed_purchase") {
      return "Last purchase on record — pricing may be outdated";
    }
    return `No pricing update in ${STALE_REVIEW_THRESHOLD_DAYS}+ days`;
  }
  if (catalogConfirmationPending) {
    return "Confirm latest price";
  }
  switch (level) {
    case "fresh":
      return source === "confirmed_purchase"
        ? "Fresh from recent invoices"
        : "Pack price confirmed recently";
    case "aging":
      return source === "confirmed_purchase"
        ? "30–89 days since last purchase on record"
        : "30–89 days since pack price was last confirmed";
    case "stale":
      return "No pricing update in 90+ days";
    case "critical":
      return "No pricing update in 180+ days";
    default:
      return "No recent invoice or pack price on record";
  }
}

export function pricingFreshnessBadgeClassName(
  level: PricingFreshnessLevel,
  catalogConfirmationPending = false,
  queue?: PricingFreshnessQueueMode,
): string {
  if (queue === "catalog-confirmation" || (catalogConfirmationPending && queue == null)) {
    return "border-transparent bg-warning/[0.1] text-warning/90";
  }
  if (queue === "stale-prices") {
    return level === "critical"
      ? "border-transparent bg-destructive/[0.08] text-destructive/85"
      : "border-transparent bg-warning/[0.1] text-warning/90";
  }
  if (catalogConfirmationPending) {
    return "border-transparent bg-warning/[0.1] text-warning/90";
  }
  switch (level) {
    case "fresh":
      return "border-transparent bg-success/[0.1] text-success";
    case "aging":
      return "border-transparent bg-warning/[0.1] text-warning/90";
    case "stale":
      return "border-transparent bg-warning/[0.1] text-warning/90";
    case "critical":
      return "border-transparent bg-destructive/[0.08] text-destructive/85";
    default:
      return "border-transparent bg-warning/[0.1] text-warning/90";
  }
}

export async function loadLatestConfirmedPurchaseAtByIngredientId(
  client: ReviewClient,
  catalog: readonly IngredientCanonicalInput[],
  confirmedAliases: IngredientAliasMap,
): Promise<Record<string, string | null>> {
  if (catalog.length === 0) return {};
  const { rows } = await loadInvoiceItemsForMatchedProductScan(client);
  const persistedMatchByItemId = await loadPersistedMatchByItemIdForScan(client, rows);
  return buildLatestConfirmedPurchaseAtByIngredientIdFromScan(
    catalog,
    confirmedAliases,
    rows,
    persistedMatchByItemId,
  );
}

export async function loadLatestPurchaseGlanceByIngredientId(
  client: ReviewClient,
  catalog: readonly IngredientCanonicalInput[],
  confirmedAliases: IngredientAliasMap,
): Promise<Record<string, IngredientLatestPurchaseGlance>> {
  if (catalog.length === 0) return {};
  const { rows } = await loadInvoiceItemsForMatchedProductScan(client);
  const persistedMatchByItemId = await loadPersistedMatchByItemIdForScan(client, rows);
  return buildLatestPurchaseGlanceByIngredientIdFromScan(
    catalog,
    confirmedAliases,
    rows,
    persistedMatchByItemId,
  );
}

export async function loadPriceHistoryLatestAtByIngredientId(
  client: ReviewClient,
  ingredientIds: readonly string[],
): Promise<Record<string, string | null>> {
  const ids = ingredientIds.map((id) => id.trim()).filter(Boolean);
  const latest: Record<string, string | null> = {};
  if (ids.length === 0) return latest;

  const { data, error } = await client
    .from("ingredient_price_history")
    .select("ingredient_id, created_at")
    .in("ingredient_id", ids)
    .order("created_at", { ascending: false });

  if (error) return latest;

  for (const row of data ?? []) {
    if (!row.ingredient_id || latest[row.ingredient_id]) continue;
    latest[row.ingredient_id] = row.created_at ?? null;
  }
  return latest;
}

export function buildPricingFreshnessInputForRow(
  row: CatalogRow,
  priceHistoryLatestAtByIngredientId: Readonly<Record<string, string | null>> = {},
  lastPurchaseAtByIngredientId: Readonly<Record<string, string | null>> = {},
): PricingFreshnessInput {
  const id = row.id?.trim() ?? "";
  return {
    currentPrice: row.current_price,
    priceRefreshAt: id ? (priceHistoryLatestAtByIngredientId[id] ?? null) : null,
    lastPurchaseAt: id ? (lastPurchaseAtByIngredientId[id] ?? null) : null,
  };
}

function countPricingQueueRows(
  catalog: readonly CatalogRow[],
  predicate: (input: PricingFreshnessInput) => boolean,
  priceHistoryLatestAtByIngredientId: Readonly<Record<string, string | null>>,
  lastPurchaseAtByIngredientId: Readonly<Record<string, string | null>>,
): { count: number; firstIngredientId: string | null } {
  const matched = catalog.filter((row) => {
    const id = row.id?.trim();
    if (!id) return false;
    return predicate(
      buildPricingFreshnessInputForRow(
        row,
        priceHistoryLatestAtByIngredientId,
        lastPurchaseAtByIngredientId,
      ),
    );
  });
  return {
    count: matched.length,
    firstIngredientId: matched[0]?.id?.trim() ?? null,
  };
}

export function countStaleCatalogPrices(
  catalog: readonly CatalogRow[],
  priceHistoryLatestAtByIngredientId: Readonly<Record<string, string | null>> = {},
  lastPurchaseAtByIngredientId: Readonly<Record<string, string | null>> = {},
): { count: number; firstIngredientId: string | null } {
  return countPricingQueueRows(
    catalog,
    isStaleForPriceReview,
    priceHistoryLatestAtByIngredientId,
    lastPurchaseAtByIngredientId,
  );
}

export function countCatalogConfirmationPending(
  catalog: readonly CatalogRow[],
  priceHistoryLatestAtByIngredientId: Readonly<Record<string, string | null>> = {},
  lastPurchaseAtByIngredientId: Readonly<Record<string, string | null>> = {},
): { count: number; firstIngredientId: string | null } {
  return countPricingQueueRows(
    catalog,
    isCatalogConfirmationPending,
    priceHistoryLatestAtByIngredientId,
    lastPurchaseAtByIngredientId,
  );
}

export function buildStaleReviewFilterSubtitle(count: number): string {
  if (count === 1) {
    return `No pricing update in ${STALE_REVIEW_THRESHOLD_DAYS}+ days.`;
  }
  return `${count} entries · no pricing update in ${STALE_REVIEW_THRESHOLD_DAYS}+ days.`;
}

export function buildCatalogConfirmationFilterSubtitle(count: number): string {
  if (count === 1) {
    return "1 recent purchase needs price confirmation.";
  }
  return `${count} recent purchases need price confirmation.`;
}
