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

type ReviewClient = SupabaseClient<Database>;

export type OperationalReviewCategory =
  | "unmatched_invoice_ingredients"
  | "low_quality_canonical_names"
  | "duplicate_canonical_risk"
  | "orphan_canonical_ingredients";

export type OperationalReviewSeverity = "low" | "medium" | "high";

export type OperationalReviewCtaTarget =
  | { kind: "route"; path: string }
  | { kind: "naming_review" }
  | { kind: "ingredient_suggestions"; ingredientId: string }
  | { kind: "ingredient_family"; ingredientId: string }
  | { kind: "catalog_review" };

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

export function countDuplicateCanonicalRisk(
  catalog: readonly IngredientCanonicalInput[],
): { clusterCount: number; ingredientCount: number; firstIngredientId: string | null } {
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

function severityForOrphans(orphanCount: number, aliasOnlyCount: number): OperationalReviewSeverity {
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
          unmatchedCount === 1
            ? "One invoice line still needs a canonical ingredient match."
            : `${unmatchedCount} invoice lines still need canonical ingredient matches.`,
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
      title: "Low-quality canonical names",
      count: actionableNamingCount,
      explanation:
        actionableNamingCount === 1
          ? "One catalog name has a high-confidence rename ready."
          : `${actionableNamingCount} catalog names have high-confidence renames ready.`,
      severity: severityForLowQuality(actionableNamingCount),
      ctaLabel: "Improve naming",
      ctaTarget: { kind: "naming_review" },
    });
  }

  const {
    clusterCount,
    ingredientCount,
    firstIngredientId: duplicateId,
  } = countDuplicateCanonicalRisk(visibleCatalog);
  if (clusterCount > 0 && duplicateId) {
    const useFamilyCta = clusterCount === 1 && ingredientCount === 2;
    items.push({
      id: "duplicate_canonical_risk",
      category: "duplicate_canonical_risk",
      title: "Duplicate canonical risk",
      count: clusterCount,
      explanation:
        clusterCount === 1
          ? "One operational identity cluster may be split across two catalog rows."
          : `${clusterCount} operational clusters may be duplicate catalog entries (${ingredientCount} ingredients).`,
      severity: severityForDuplicates(clusterCount),
      ctaLabel: useFamilyCta ? "Compare related" : "Open catalog review",
      ctaTarget: useFamilyCta
        ? { kind: "ingredient_family", ingredientId: duplicateId }
        : { kind: "catalog_review" },
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
      parts.push(
        orphanCount === 1
          ? "1 orphan with no recipes or aliases"
          : `${orphanCount} orphans with no operational use`,
      );
    }
    if (aliasOnlyCount > 0) {
      parts.push(
        aliasOnlyCount === 1
          ? "1 alias-only legacy row"
          : `${aliasOnlyCount} alias-only legacy rows`,
      );
    }
    items.push({
      id: "orphan_canonical_ingredients",
      category: "orphan_canonical_ingredients",
      title: "Orphan catalog entries",
      count: totalCount,
      explanation: `${parts.join("; ")}. Hidden from the main list until reviewed.`,
      severity: severityForOrphans(orphanCount, aliasOnlyCount),
      ctaLabel: "Review catalog",
      ctaTarget: { kind: "catalog_review" },
    });
  }

  return { items: sortReviewItems(items), error };
}
