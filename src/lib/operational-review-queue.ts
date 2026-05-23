import type { SupabaseClient } from "@supabase/supabase-js";
import type { IngredientAliasMap, IngredientCanonicalInput } from "@/lib/ingredient-canonical";
import {
  buildActionableCanonicalNamingQueue,
  countActionableCanonicalNamingQueue,
} from "@/lib/canonical-ingredient-naming-queue";
import { filterCanonicalCatalogIngredients } from "@/lib/ingredient-kind";
import {
  loadActiveIngredientCatalog,
  loadMatchingIngredientCatalog,
} from "@/lib/ingredient-catalog-load";
import { findOperationalDuplicateClusters } from "@/lib/ingredient-identity-diagnostics";
import type { IngredientMergeCluster } from "@/lib/ingredient-merge-hooks";
import { loadConfirmedIngredientAliasMap } from "@/lib/ingredient-alias-memory";
import {
  detectOrphanCanonicalIngredients,
  isAliasOnlyOperationalDependency,
  isIngredientOperationallyOrphaned,
} from "@/lib/ingredient-orphan-detection";
import {
  countUnresolvedInvoiceIngredientsByInvoice,
  type InvoiceUnresolvedIngredientCountInput,
} from "@/lib/invoice-unresolved-ingredient-count";
import {
  normalizeInvoiceItemFields,
  shouldRejectInvoiceIngredientRow,
} from "@/lib/invoice-item-fields";
import type { Database } from "@/integrations/supabase/types";
import {
  countCatalogConfirmationPending,
  countStaleCatalogPrices,
  loadLatestConfirmedPurchaseAtByIngredientId,
  loadPriceHistoryLatestAtByIngredientId,
  STALE_REVIEW_THRESHOLD_DAYS,
} from "@/lib/ingredient-pricing-freshness";

type ReviewClient = SupabaseClient<Database>;

export type OperationalReviewCategory =
  | "unmatched_invoice_ingredients"
  | "low_quality_canonical_names"
  | "duplicate_canonical_risk"
  | "orphan_canonical_ingredients"
  | "catalog_confirmation_pending"
  | "stale_catalog_prices";

export type OperationalPriorityTier = "critical" | "attention" | "healthy";

export type OperationalListFilter =
  | "catalog-confirmation"
  | "stale-prices"
  | "duplicates"
  | "unused";

/** Page-level list filters on Ingredients — pricing queues are row states only. */
export const INGREDIENTS_PAGE_LIST_FILTERS = [
  "duplicates",
  "unused",
] as const satisfies readonly OperationalListFilter[];

export type OperationalReviewSeverity = "low" | "medium" | "high";

export type OperationalReviewCtaTarget =
  | { kind: "route"; path: string }
  | { kind: "naming_review" }
  | { kind: "ingredient_suggestions"; ingredientId: string }
  | { kind: "ingredient_family"; ingredientId: string }
  | { kind: "catalog_review" }
  | { kind: "informational" }
  | { kind: "list_filter"; filter: OperationalListFilter; ingredientId?: string };

export type OperationalReviewItem = {
  id: string;
  category: OperationalReviewCategory;
  title: string;
  count: number;
  explanation: string;
  severity: OperationalReviewSeverity;
  ctaLabel: string;
  ctaTarget: OperationalReviewCtaTarget;
};

export type BuildOperationalReviewQueueParams = {
  userId: string | undefined;
  supabase: ReviewClient;
  /** Visible canonical catalog from Ingredients list; loaded when omitted. */
  catalog?: readonly IngredientCanonicalInput[];
  /** Merged session + DB aliases for invoice matching. */
  confirmedAliases?: IngredientAliasMap;
  /** When true, includes unmatched invoice line count (not shown on Ingredients page). Default false. */
  includeInvoiceUnmatched?: boolean;
};

export type OperationalReviewQueueResult = {
  items: OperationalReviewItem[];
  error: string | null;
};

export type OperationalPriorityQueueCard = {
  id: string;
  label: string;
  count: number;
  explanation: string;
  ctaTarget: OperationalReviewCtaTarget;
};

export type OperationalPriorityTierGroup = {
  tier: OperationalPriorityTier;
  title: string;
  hint: string;
  totalCount: number;
  cards: OperationalPriorityQueueCard[];
};

const INVOICE_ALIAS_STORAGE_PREFIX = "marginly:invoice-ingredient-aliases:";

const SEVERITY_RANK: Record<OperationalReviewSeverity, number> = {
  high: 0,
  medium: 1,
  low: 2,
};

export function readLocalInvoiceIngredientAliases(userId: string | undefined): IngredientAliasMap {
  if (typeof window === "undefined" || !userId?.trim()) return {};
  try {
    const raw = window.localStorage.getItem(`${INVOICE_ALIAS_STORAGE_PREFIX}${userId}`);
    return raw ? (JSON.parse(raw) as IngredientAliasMap) : {};
  } catch {
    return {};
  }
}

export function countLowQualityCanonicalNames(
  catalog: readonly IngredientCanonicalInput[],
  userId?: string,
  confirmedAliases?: IngredientAliasMap,
): { count: number; firstIngredientId: string | null } {
  const queue = buildActionableCanonicalNamingQueue({
    catalog,
    userId,
    confirmedAliases,
  });
  return {
    count: queue.length,
    firstIngredientId: queue[0]?.ingredientId ?? null,
  };
}

export function countDuplicateCanonicalRisk(catalog: readonly IngredientCanonicalInput[]): {
  clusterCount: number;
  ingredientCount: number;
  firstIngredientId: string | null;
} {
  const clusters = findOperationalDuplicateClusters([...catalog]);
  const ingredientCount = clusters.reduce((sum, cluster) => sum + cluster.ingredientIds.length, 0);
  const firstIngredientId = clusters[0]?.ingredientIds[0]?.trim() ?? null;
  return {
    clusterCount: clusters.length,
    ingredientCount,
    firstIngredientId,
  };
}

export function countOrphanCanonicalIssues(
  catalog: readonly IngredientCanonicalInput[],
  orphanReports: Map<string, import("@/lib/ingredient-orphan-detection").IngredientOrphanReport>,
): {
  orphanCount: number;
  aliasOnlyCount: number;
  totalCount: number;
} {
  let orphanCount = 0;
  let aliasOnlyCount = 0;

  for (const entry of catalog) {
    const id = entry.id?.trim();
    if (!id) continue;
    const report = orphanReports.get(id);
    if (!report) continue;
    if (isIngredientOperationallyOrphaned(report)) {
      orphanCount += 1;
      continue;
    }
    if (isAliasOnlyOperationalDependency(report)) {
      aliasOnlyCount += 1;
    }
  }

  return {
    orphanCount,
    aliasOnlyCount,
    totalCount: orphanCount + aliasOnlyCount,
  };
}

export function sumUnresolvedInvoiceIngredientCounts(
  countsByInvoice: Readonly<Record<string, number>>,
): number {
  return Object.values(countsByInvoice).reduce((sum, count) => sum + Math.max(0, count), 0);
}

export async function loadAggregateUnresolvedInvoiceIngredientCount(
  client: ReviewClient,
  matchCatalog: readonly IngredientCanonicalInput[],
  confirmedAliases: IngredientAliasMap,
): Promise<{ unmatchedCount: number; error: string | null }> {
  if (matchCatalog.length === 0) {
    return { unmatchedCount: 0, error: null };
  }

  const [{ data: invoices, error: invoiceError }, { data: itemRows, error: itemError }] =
    await Promise.all([
      client.from("invoices").select("id, supplier_name"),
      client
        .from("invoice_items")
        .select("id, invoice_id, name, quantity, unit, unit_price, total"),
    ]);

  if (invoiceError) return { unmatchedCount: 0, error: invoiceError.message };
  if (itemError) return { unmatchedCount: 0, error: itemError.message };

  const supplierNameByInvoice: Record<string, string | null> = {};
  for (const row of invoices ?? []) {
    if (!row.id) continue;
    supplierNameByInvoice[row.id] = row.supplier_name ?? null;
  }

  const itemsByInvoice: Record<string, InvoiceUnresolvedIngredientCountInput[]> = {};
  for (const raw of itemRows ?? []) {
    if (!raw.invoice_id) continue;
    const normalized = normalizeInvoiceItemFields(raw);
    if (shouldRejectInvoiceIngredientRow(normalized)) continue;
    const bucket = itemsByInvoice[raw.invoice_id] ?? [];
    bucket.push(normalized);
    itemsByInvoice[raw.invoice_id] = bucket;
  }

  const countsByInvoice = countUnresolvedInvoiceIngredientsByInvoice(
    itemsByInvoice,
    matchCatalog,
    confirmedAliases,
    supplierNameByInvoice,
  );

  return {
    unmatchedCount: sumUnresolvedInvoiceIngredientCounts(countsByInvoice),
    error: null,
  };
}

function severityForUnmatched(count: number): OperationalReviewSeverity {
  if (count >= 8) return "high";
  if (count >= 3) return "medium";
  return "low";
}

function severityForLowQuality(count: number): OperationalReviewSeverity {
  if (count >= 5) return "high";
  if (count >= 2) return "medium";
  return "low";
}

function severityForDuplicates(clusterCount: number): OperationalReviewSeverity {
  if (clusterCount >= 3) return "high";
  if (clusterCount >= 1) return "medium";
  return "low";
}

function severityForOrphans(
  orphanCount: number,
  aliasOnlyCount: number,
): OperationalReviewSeverity {
  if (orphanCount >= 3) return "high";
  if (orphanCount >= 1) return "medium";
  if (aliasOnlyCount >= 1) return "low";
  return "low";
}

function sortReviewItems(items: OperationalReviewItem[]): OperationalReviewItem[] {
  return [...items].sort((a, b) => {
    const severityDelta = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
    if (severityDelta !== 0) return severityDelta;
    return b.count - a.count;
  });
}

export {
  countCatalogConfirmationPending,
  countStaleCatalogPrices,
} from "@/lib/ingredient-pricing-freshness";

/** Ingredient ids that sit in any operational duplicate cluster. */
export function duplicateClusterIngredientIds(
  catalog: readonly IngredientCanonicalInput[],
): Set<string> {
  const ids = new Set<string>();
  for (const cluster of findOperationalDuplicateClusters([...catalog])) {
    for (const id of cluster.ingredientIds) {
      const trimmed = id?.trim();
      if (trimmed) ids.add(trimmed);
    }
  }
  return ids;
}

/** Duplicate cluster containing `ingredientId`, if any. */
export function findOperationalDuplicateClusterForIngredient(
  catalog: readonly IngredientCanonicalInput[],
  ingredientId: string,
): IngredientMergeCluster | null {
  const id = ingredientId.trim();
  if (!id) return null;
  for (const cluster of findOperationalDuplicateClusters([...catalog])) {
    if (cluster.ingredientIds.some((memberId) => memberId.trim() === id)) {
      return cluster;
    }
  }
  return null;
}

export type DuplicateReviewListGroup = {
  cluster: IngredientMergeCluster;
  /** Ingredient ids in this cluster that appear in the duplicate review queue, in cluster order. */
  rowIds: string[];
};

/** Group duplicate-queue rows by operational cluster (preserves cluster detection order). */
export function buildDuplicateReviewListGroups(
  catalog: readonly IngredientCanonicalInput[],
  visibleRows: readonly { id: string }[],
): DuplicateReviewListGroup[] {
  const visibleIds = new Set(visibleRows.map((row) => row.id.trim()).filter(Boolean));
  if (visibleIds.size === 0) return [];

  const groups: DuplicateReviewListGroup[] = [];
  const assigned = new Set<string>();

  for (const cluster of findOperationalDuplicateClusters([...catalog])) {
    const rowIds = cluster.ingredientIds
      .map((id) => id.trim())
      .filter((id) => id && visibleIds.has(id));
    if (rowIds.length === 0) continue;
    for (const id of rowIds) assigned.add(id);
    groups.push({ cluster, rowIds });
  }

  for (const row of visibleRows) {
    const id = row.id.trim();
    if (!id || assigned.has(id)) continue;
    groups.push({
      cluster: {
        operationalKey: `ungrouped-${id}`,
        ingredientIds: [id],
        displayNames: [],
        confidence: "exact_operational_key",
      },
      rowIds: [id],
    });
  }

  return groups;
}

/** Priority card id used to highlight the active list filter control. */
export function operationalListFilterCardId(filter: OperationalListFilter): string {
  switch (filter) {
    case "duplicates":
      return "duplicate_canonical_risk";
    case "catalog-confirmation":
      return "catalog_confirmation_pending";
    case "stale-prices":
      return "stale_catalog_prices";
    case "unused":
      return "orphan_canonical_ingredients";
  }
}

/** Subtext under hygiene card titles on the Ingredients page. */
export function operationalHygieneCardSubtext(
  filter: (typeof INGREDIENTS_PAGE_LIST_FILTERS)[number],
  input: { clusterCount: number; entryCount: number },
): string {
  switch (filter) {
    case "duplicates":
      if (input.entryCount <= 0) return "Nothing to review";
      return input.clusterCount === 1
        ? "1 cluster to review"
        : `${input.clusterCount} clusters to review`;
    case "unused":
      return input.entryCount <= 0 ? "Queue clear" : "No recent activity";
  }
}

export function operationalListFilterLabel(filter: OperationalListFilter): string {
  switch (filter) {
    case "duplicates":
      return "Possible duplicates";
    case "catalog-confirmation":
      return "Confirm latest prices";
    case "stale-prices":
      return "Outdated pricing";
    case "unused":
      return "Unused catalog entries";
  }
}

export function operationalListFilterSubtitle(filter: OperationalListFilter): string {
  switch (filter) {
    case "duplicates":
      return "Compare before merge.";
    case "catalog-confirmation":
      return "Match pack to purchase.";
    case "stale-prices":
      return `${STALE_REVIEW_THRESHOLD_DAYS}+ days without update.`;
    case "unused":
      return "Not in recipes or purchases.";
  }
}

/** Review-mode banner title (operational wording, includes count). */
export function operationalListFilterReviewBarTitle(
  filter: OperationalListFilter,
  count: number,
): string {
  switch (filter) {
    case "duplicates":
      return count === 1 ? "1 duplicate to compare" : `${count} duplicates to compare`;
    case "catalog-confirmation":
      return count === 1 ? "1 price to confirm" : `${count} prices to confirm`;
    case "stale-prices":
      return count === 1 ? "1 outdated price" : `${count} outdated prices`;
    case "unused":
      return count === 1 ? "1 unused entry" : `${count} unused entries`;
  }
}

/** Selected list row in review mode — soft tint, no primary glow. */
export function operationalListReviewRowSelectedClass(_filter: OperationalListFilter): string {
  return "bg-muted/[0.09] shadow-[inset_2px_0_0_hsl(var(--border))]";
}

/** Browse-mode selected row (no active queue). */
export function operationalListBrowseRowSelectedClass(): string {
  return "bg-muted/[0.09] shadow-[inset_2px_0_0_hsl(var(--border))]";
}

/** Shared tint for an open review queue (priority card + list banner). */
export function operationalReviewWorkspaceTintClass(
  _filter?: OperationalListFilter | null,
): string {
  return "bg-foreground/[0.045]";
}

/** Priority tier column shell — left accent + typography, not loud cards. */
export function operationalPriorityTierShellClass(tier: OperationalPriorityTier): string {
  switch (tier) {
    case "critical":
      return "border-l-2 border-destructive/40 pl-2.5";
    case "attention":
      return "border-l border-warning/35 pl-2";
    case "healthy":
      return "pl-0.5";
  }
}

/** Tier total count — emphasis scales with urgency. */
export function operationalPriorityTierCountClass(tier: OperationalPriorityTier): string {
  switch (tier) {
    case "critical":
      return "text-foreground font-semibold";
    case "attention":
      return "text-muted-foreground/55 font-medium";
    case "healthy":
      return "text-muted-foreground/50 font-medium";
  }
}

/** Tier column title contrast. */
export function operationalPriorityTierTitleClass(tier: OperationalPriorityTier): string {
  switch (tier) {
    case "critical":
      return "text-foreground font-semibold";
    case "attention":
      return "text-foreground/72 font-medium";
    case "healthy":
      return "text-muted-foreground font-medium";
  }
}

/** Queue card count within a tier column. */
export function operationalPriorityQueueCardCountClass(tier: OperationalPriorityTier): string {
  switch (tier) {
    case "critical":
      return "font-semibold text-foreground/75";
    case "attention":
      return "font-medium text-muted-foreground/60";
    case "healthy":
      return "font-medium text-muted-foreground/55";
  }
}

/** Active queue card in priority columns — matches list review banner tint. */
export function operationalListFilterQueueCardActiveClass(filter: OperationalListFilter): string {
  return operationalReviewWorkspaceTintClass(filter);
}

/** Review-mode list banner shell. */
export function operationalListReviewBannerClass(filter: OperationalListFilter): string {
  return operationalReviewWorkspaceTintClass(filter);
}

/** Active review filter tab — calm navigation, one semantic tint. */
export function operationalListFilterTabActiveClass(filter: OperationalListFilter): string {
  switch (filter) {
    case "catalog-confirmation":
      return "border-transparent bg-warning/[0.08] text-foreground";
    case "stale-prices":
      return "border-transparent bg-warning/[0.08] text-foreground";
    case "duplicates":
      return "border-transparent bg-destructive/[0.06] text-foreground";
    case "unused":
      return "border-transparent bg-muted/40 text-foreground";
  }
}

/** Active “All ingredients” tab when no queue filter is applied. */
export function operationalListFilterTabBrowseActiveClass(): string {
  return "border-transparent bg-muted/40 text-foreground";
}

/** Detail panel review section shell. */
export function operationalListReviewPanelAccentClass(
  filter: OperationalListFilter | null | undefined,
): string {
  switch (filter) {
    case "catalog-confirmation":
      return "bg-warning/[0.04]";
    case "stale-prices":
      return "bg-warning/[0.04]";
    case "duplicates":
      return "bg-destructive/[0.03]";
    case "unused":
      return "bg-muted/[0.04]";
    default:
      return "bg-muted/[0.04]";
  }
}

/** Detail panel review mode label tint. */
export function operationalListReviewHeaderTextClass(filter: OperationalListFilter): string {
  switch (filter) {
    case "catalog-confirmation":
      return "text-warning/85";
    case "stale-prices":
      return "text-warning/85";
    case "duplicates":
      return "text-destructive/75";
    case "unused":
      return "text-muted-foreground";
  }
}

/** List row explanation line under ingredient name in pricing queues. */
export function operationalPricingRowReasonClass(filter: OperationalListFilter): string {
  switch (filter) {
    case "catalog-confirmation":
      return "text-warning/85";
    case "stale-prices":
      return "text-warning/85";
    case "duplicates":
      return "text-destructive/70";
    case "unused":
      return "text-muted-foreground/90";
  }
}

/** Ingredient ids eligible for the unused-entries review queue. */
export function unusedReviewIngredientIds(
  catalog: readonly IngredientCanonicalInput[],
  orphanReports: Map<string, import("@/lib/ingredient-orphan-detection").IngredientOrphanReport>,
): Set<string> {
  const ids = new Set<string>();
  for (const entry of catalog) {
    const id = entry.id?.trim();
    if (!id) continue;
    const report = orphanReports.get(id);
    if (!report) continue;
    if (isIngredientOperationallyOrphaned(report) || isAliasOnlyOperationalDependency(report)) {
      ids.add(id);
    }
  }
  return ids;
}

export function buildOperationalPriorityTiers(
  items: readonly OperationalReviewItem[],
  healthyIngredientCount: number,
): OperationalPriorityTierGroup[] {
  const byCategory = Object.fromEntries(items.map((item) => [item.category, item])) as Partial<
    Record<OperationalReviewCategory, OperationalReviewItem>
  >;

  const criticalCards: OperationalPriorityQueueCard[] = [];
  const duplicates = byCategory.duplicate_canonical_risk;
  if (duplicates && duplicates.count > 0) {
    criticalCards.push({
      id: duplicates.id,
      label: "Possible duplicates",
      count: duplicates.count,
      explanation: duplicates.explanation,
      ctaTarget:
        duplicates.ctaTarget.kind === "list_filter"
          ? duplicates.ctaTarget
          : { kind: "list_filter", filter: "duplicates", ingredientId: undefined },
    });
  }

  const attentionCards: OperationalPriorityQueueCard[] = [];
  const catalogPending = byCategory.catalog_confirmation_pending;
  if (catalogPending && catalogPending.count > 0) {
    attentionCards.push({
      id: catalogPending.id,
      label: "Confirm latest prices",
      count: catalogPending.count,
      explanation: catalogPending.explanation,
      ctaTarget: catalogPending.ctaTarget,
    });
  }
  const stale = byCategory.stale_catalog_prices;
  if (stale && stale.count > 0) {
    attentionCards.push({
      id: stale.id,
      label: "Outdated pricing",
      count: stale.count,
      explanation: stale.explanation,
      ctaTarget: stale.ctaTarget,
    });
  }
  const orphans = byCategory.orphan_canonical_ingredients;
  if (orphans && orphans.count > 0) {
    attentionCards.push({
      id: orphans.id,
      label: "Unused catalog entries",
      count: orphans.count,
      explanation: orphans.explanation,
      ctaTarget:
        orphans.ctaTarget.kind === "list_filter"
          ? orphans.ctaTarget
          : { kind: "list_filter", filter: "unused", ingredientId: undefined },
    });
  }
  const naming = byCategory.low_quality_canonical_names;
  if (naming && naming.count > 0) {
    attentionCards.push({
      id: naming.id,
      label: "Names to improve",
      count: naming.count,
      explanation: naming.explanation,
      ctaTarget: naming.ctaTarget,
    });
  }

  const tiers: OperationalPriorityTierGroup[] = [];

  if (criticalCards.length > 0) {
    tiers.push({
      tier: "critical",
      title: "Critical",
      hint: "Review today",
      totalCount: criticalCards.reduce((sum, card) => sum + card.count, 0),
      cards: criticalCards,
    });
  }

  if (attentionCards.length > 0) {
    tiers.push({
      tier: "attention",
      title: "Attention needed",
      hint: "When you have a moment",
      totalCount: attentionCards.reduce((sum, card) => sum + card.count, 0),
      cards: attentionCards,
    });
  }

  if (criticalCards.length === 0 && attentionCards.length === 0) {
    tiers.push({
      tier: "healthy",
      title: "Healthy",
      hint: "Queues clear",
      totalCount: healthyIngredientCount,
      cards: [
        {
          id: "healthy-stable",
          label: "Stable catalog",
          count: healthyIngredientCount,
          explanation:
            healthyIngredientCount === 1
              ? "1 ingredient · nothing to review"
              : `${healthyIngredientCount} ingredients · nothing to review`,
          ctaTarget: { kind: "informational" },
        },
      ],
    });
  }

  return tiers;
}

export type OperationalSummaryLine = {
  tier: OperationalPriorityTier;
  label: string;
  count: number;
  explanation: string;
};

export type OperationalSummarySnapshot = {
  lines: OperationalSummaryLine[];
  catalogStable: boolean;
};

/** Lightweight snapshot for the empty ingredient detail panel (queue card data only). */
export type OperationalGlanceTile = {
  id: string;
  label: string;
  count: number;
  filter: OperationalListFilter | null;
};

export function queueCardCount(
  tierGroups: readonly OperationalPriorityTierGroup[],
  filter: OperationalListFilter,
): number {
  for (const group of tierGroups) {
    for (const card of group.cards) {
      if (card.ctaTarget.kind === "list_filter" && card.ctaTarget.filter === filter) {
        return card.count;
      }
    }
  }
  return 0;
}

/** Compact stat tiles for the page header — derived from queue card counts only. */
export function buildOperationalGlanceTiles(
  tierGroups: readonly OperationalPriorityTierGroup[],
): OperationalGlanceTile[] {
  const criticalCount = tierGroups
    .filter((group) => group.tier === "critical")
    .reduce((sum, group) => sum + group.totalCount, 0);
  const staleCount = queueCardCount(tierGroups, "stale-prices");
  const confirmCount = queueCardCount(tierGroups, "catalog-confirmation");
  const unusedCount = queueCardCount(tierGroups, "unused");

  return [
    {
      id: "critical",
      label: "Critical",
      count: criticalCount,
      filter: criticalCount > 0 ? "duplicates" : null,
    },
    {
      id: "stale-prices",
      label: "Pricing risks",
      count: staleCount,
      filter: staleCount > 0 ? "stale-prices" : null,
    },
    {
      id: "catalog-confirmation",
      label: "Awaiting confirmation",
      count: confirmCount,
      filter: confirmCount > 0 ? "catalog-confirmation" : null,
    },
    {
      id: "unused",
      label: "Unused",
      count: unusedCount,
      filter: unusedCount > 0 ? "unused" : null,
    },
  ];
}

export function buildOperationalSummarySnapshot(
  tierGroups: readonly OperationalPriorityTierGroup[],
): OperationalSummarySnapshot {
  const lines: OperationalSummaryLine[] = [];
  for (const group of tierGroups) {
    if (group.tier === "healthy") continue;
    for (const card of group.cards) {
      if (card.ctaTarget.kind === "informational") continue;
      lines.push({
        tier: group.tier,
        label: card.label,
        count: card.count,
        explanation: card.explanation,
      });
    }
  }
  const catalogStable =
    tierGroups.length === 1 && tierGroups[0]?.tier === "healthy" && lines.length === 0;
  return { lines, catalogStable };
}

function firstOrphanIngredientId(
  catalog: readonly IngredientCanonicalInput[],
  orphanReports: Map<string, import("@/lib/ingredient-orphan-detection").IngredientOrphanReport>,
): string | null {
  for (const entry of catalog) {
    const id = entry.id?.trim();
    if (!id) continue;
    const report = orphanReports.get(id);
    if (report && isIngredientOperationallyOrphaned(report)) return id;
  }
  for (const entry of catalog) {
    const id = entry.id?.trim();
    if (!id) continue;
    const report = orphanReports.get(id);
    if (report && isAliasOnlyOperationalDependency(report)) return id;
  }
  return null;
}

export async function buildOperationalReviewQueue(
  params: BuildOperationalReviewQueueParams,
): Promise<OperationalReviewQueueResult> {
  const includeInvoiceUnmatched = params.includeInvoiceUnmatched ?? false;
  const items: OperationalReviewItem[] = [];
  let error: string | null = null;

  const [activeCatalogResult, matchCatalogResult, dbAliases] = await Promise.all([
    loadActiveIngredientCatalog(params.supabase),
    loadMatchingIngredientCatalog(params.supabase),
    loadConfirmedIngredientAliasMap(params.supabase),
  ]);

  if (activeCatalogResult.error) error = activeCatalogResult.error;
  const canonicalCatalog = filterCanonicalCatalogIngredients(activeCatalogResult.rows);
  const visibleCatalog = params.catalog ?? canonicalCatalog;
  const matchCatalog = matchCatalogResult.rows;

  const localAliases = readLocalInvoiceIngredientAliases(params.userId);
  const confirmedAliases: IngredientAliasMap = {
    ...localAliases,
    ...dbAliases,
    ...(params.confirmedAliases ?? {}),
  };

  if (includeInvoiceUnmatched && matchCatalog.length > 0) {
    const { unmatchedCount, error: unmatchedError } =
      await loadAggregateUnresolvedInvoiceIngredientCount(
        params.supabase,
        matchCatalog,
        confirmedAliases,
      );
    if (unmatchedError && !error) error = unmatchedError;
    if (unmatchedCount > 0) {
      items.push({
        id: "unmatched_invoice_ingredients",
        category: "unmatched_invoice_ingredients",
        title: "Unmatched invoice ingredients",
        count: unmatchedCount,
        explanation:
          unmatchedCount === 1 ? "1 unmatched line" : `${unmatchedCount} unmatched lines`,
        severity: severityForUnmatched(unmatchedCount),
        ctaLabel: "Review invoices",
        ctaTarget: { kind: "route", path: "/invoices" },
      });
    }
  }

  const actionableNamingCount = countActionableCanonicalNamingQueue({
    catalog: visibleCatalog,
    userId: params.userId,
    confirmedAliases,
  });
  if (actionableNamingCount > 0) {
    items.push({
      id: "low_quality_canonical_names",
      category: "low_quality_canonical_names",
      title: "Names to improve",
      count: actionableNamingCount,
      explanation:
        actionableNamingCount === 1 ? "1 name to fix" : `${actionableNamingCount} names to fix`,
      severity: severityForLowQuality(actionableNamingCount),
      ctaLabel: "Review names",
      ctaTarget: { kind: "naming_review" },
    });
  }

  const { clusterCount, firstIngredientId: duplicateId } =
    countDuplicateCanonicalRisk(visibleCatalog);
  if (clusterCount > 0 && duplicateId) {
    items.push({
      id: "duplicate_canonical_risk",
      category: "duplicate_canonical_risk",
      title: "Possible duplicates",
      count: clusterCount,
      explanation:
        clusterCount === 1 ? "1 duplicate cluster" : `${clusterCount} duplicate clusters`,
      severity: severityForDuplicates(clusterCount),
      ctaLabel: "Open queue",
      ctaTarget: {
        kind: "list_filter",
        filter: "duplicates",
        ingredientId: duplicateId,
      },
    });
  }

  const ingredientIds = visibleCatalog.map((row) => row.id ?? "").filter(Boolean);
  const [priceHistoryLatestAt, lastPurchaseAtByIngredientId] = await Promise.all([
    loadPriceHistoryLatestAtByIngredientId(params.supabase, ingredientIds),
    loadLatestConfirmedPurchaseAtByIngredientId(params.supabase, visibleCatalog, confirmedAliases),
  ]);
  const { count: catalogPendingCount, firstIngredientId: catalogPendingId } =
    countCatalogConfirmationPending(
      visibleCatalog,
      priceHistoryLatestAt,
      lastPurchaseAtByIngredientId,
    );
  if (catalogPendingCount > 0 && catalogPendingId) {
    items.push({
      id: "catalog_confirmation_pending",
      category: "catalog_confirmation_pending",
      title: "Confirm latest prices",
      count: catalogPendingCount,
      explanation:
        catalogPendingCount === 1
          ? "1 price to confirm"
          : `${catalogPendingCount} prices to confirm`,
      severity: catalogPendingCount >= 5 ? "high" : catalogPendingCount >= 2 ? "medium" : "low",
      ctaLabel: "Open queue",
      ctaTarget: {
        kind: "list_filter",
        filter: "catalog-confirmation",
        ingredientId: catalogPendingId,
      },
    });
  }

  const { count: staleCount, firstIngredientId: staleId } = countStaleCatalogPrices(
    visibleCatalog,
    priceHistoryLatestAt,
    lastPurchaseAtByIngredientId,
  );
  if (staleCount > 0 && staleId) {
    items.push({
      id: "stale_catalog_prices",
      category: "stale_catalog_prices",
      title: "Outdated pricing",
      count: staleCount,
      explanation:
        staleCount === 1 ? "1 outdated pricing risk" : `${staleCount} outdated pricing risks`,
      severity: staleCount >= 5 ? "high" : staleCount >= 2 ? "medium" : "low",
      ctaLabel: "Open queue",
      ctaTarget: {
        kind: "list_filter",
        filter: "stale-prices",
        ingredientId: staleId,
      },
    });
  }

  const { reports: orphanReports, error: orphanError } = await detectOrphanCanonicalIngredients(
    params.supabase,
    canonicalCatalog,
  );
  if (orphanError && !error) error = orphanError;

  const { orphanCount, aliasOnlyCount, totalCount } = countOrphanCanonicalIssues(
    canonicalCatalog,
    orphanReports,
  );
  if (totalCount > 0) {
    const parts: string[] = [];
    if (orphanCount > 0) {
      parts.push(orphanCount === 1 ? "1 unused" : `${orphanCount} unused`);
    }
    if (aliasOnlyCount > 0) {
      parts.push(aliasOnlyCount === 1 ? "1 alias-only" : `${aliasOnlyCount} alias-only`);
    }
    items.push({
      id: "orphan_canonical_ingredients",
      category: "orphan_canonical_ingredients",
      title: "Unused catalog entries",
      count: totalCount,
      explanation: parts.join(" · "),
      severity: severityForOrphans(orphanCount, aliasOnlyCount),
      ctaLabel: "Open queue",
      ctaTarget: (() => {
        const firstId = firstOrphanIngredientId(canonicalCatalog, orphanReports);
        return firstId
          ? { kind: "list_filter", filter: "unused", ingredientId: firstId }
          : { kind: "informational" };
      })(),
    });
  }

  return { items: sortReviewItems(items), error };
}
