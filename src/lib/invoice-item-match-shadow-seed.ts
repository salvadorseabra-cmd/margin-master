import type { IngredientAliasMap, IngredientCanonicalInput } from "@/lib/ingredient-canonical";
import { buildInvoiceMatchCatalog } from "@/lib/ingredient-canonical-synthesis";
import { mapMatcherOutputToInitialMatchRecord } from "@/lib/invoice-item-match-helpers";
import {
  type AppSupabaseClient,
  upsertInvoiceItemMatch,
} from "@/lib/invoice-item-match-repository";
import type { InvoiceItemMatchInsert, InvoiceItemMatchStatus } from "@/lib/invoice-item-match-types";
import { resolveInvoiceTableRowIngredientMatch } from "@/lib/invoice-ingredient-row-display";
import { isMatchLifecycleShadowSeedEnabled } from "@/lib/match-lifecycle-flags";

const LOG_PREFIX = "[invoice_item_matches shadow-seed]";

export type ShadowSeedInvoiceItemInput = {
  id: string;
  invoice_id: string;
  user_id: string;
  name: string;
};

export type BuildMatchRecordForInvoiceItemParams = {
  item: ShadowSeedInvoiceItemInput;
  ingredientCatalog: readonly IngredientCanonicalInput[];
  confirmedAliases: IngredientAliasMap;
  supplierName?: string | null;
  matchCatalog?: readonly IngredientCanonicalInput[];
  now?: string;
};

export type ShadowSeedBatchResult = {
  attempted: number;
  upserted: number;
  skipped: number;
  errors: string[];
  byStatus: Record<InvoiceItemMatchStatus, number>;
};

export type InvoiceItemMatchCoverageReport = {
  invoiceItemsCount: number;
  matchRecordsCount: number;
  missingInvoiceItemIds: string[];
  orphanMatchInvoiceItemIds: string[];
  duplicateInvoiceItemIds: string[];
  byStatus: Record<InvoiceItemMatchStatus, number>;
};

export type BackfillInvoiceItemMatchesOptions = {
  dryRun?: boolean;
  userId?: string;
  invoiceId?: string;
};

export type BackfillInvoiceItemMatchesResult = ShadowSeedBatchResult & {
  dryRun: boolean;
  coverage: InvoiceItemMatchCoverageReport;
};

function emptyStatusCounts(): Record<InvoiceItemMatchStatus, number> {
  return { unmatched: 0, suggested: 0, confirmed: 0 };
}

export function buildMatchRecordForInvoiceItem(
  params: BuildMatchRecordForInvoiceItemParams,
): InvoiceItemMatchInsert {
  const matchCatalog =
    params.matchCatalog ??
    buildInvoiceMatchCatalog(params.ingredientCatalog, [{ name: params.item.name }]);
  const { match } = resolveInvoiceTableRowIngredientMatch(
    params.item.name,
    [...matchCatalog],
    params.confirmedAliases,
    params.supplierName ?? null,
    undefined,
    { useReadCutover: false },
  );

  return mapMatcherOutputToInitialMatchRecord({
    invoiceItemId: params.item.id,
    invoiceId: params.item.invoice_id,
    userId: params.item.user_id,
    match,
    now: params.now,
  });
}

function buildMatchCatalogsByInvoiceId(
  ingredientCatalog: readonly IngredientCanonicalInput[],
  items: readonly ShadowSeedInvoiceItemInput[],
): Map<string, IngredientCanonicalInput[]> {
  const itemsByInvoice = new Map<string, ShadowSeedInvoiceItemInput[]>();
  for (const item of items) {
    const list = itemsByInvoice.get(item.invoice_id) ?? [];
    list.push(item);
    itemsByInvoice.set(item.invoice_id, list);
  }

  const catalogs = new Map<string, IngredientCanonicalInput[]>();
  for (const [invoiceId, invoiceItems] of itemsByInvoice) {
    catalogs.set(
      invoiceId,
      buildInvoiceMatchCatalog(
        ingredientCatalog,
        invoiceItems.map((row) => ({ name: row.name })),
      ),
    );
  }
  return catalogs;
}

export function computeInvoiceItemMatchCoverage(
  invoiceItemIds: readonly string[],
  matchRecords: readonly { invoice_item_id: string; status: InvoiceItemMatchStatus }[],
): InvoiceItemMatchCoverageReport {
  const itemIdSet = new Set(invoiceItemIds);
  const matchIdCounts = new Map<string, number>();
  const byStatus = emptyStatusCounts();
  const orphanMatchInvoiceItemIds: string[] = [];

  for (const record of matchRecords) {
    matchIdCounts.set(record.invoice_item_id, (matchIdCounts.get(record.invoice_item_id) ?? 0) + 1);
    byStatus[record.status] += 1;
    if (!itemIdSet.has(record.invoice_item_id)) {
      orphanMatchInvoiceItemIds.push(record.invoice_item_id);
    }
  }

  const missingInvoiceItemIds = invoiceItemIds.filter((id) => !matchIdCounts.has(id));
  const duplicateInvoiceItemIds = [...matchIdCounts.entries()]
    .filter(([, count]) => count > 1)
    .map(([id]) => id);

  return {
    invoiceItemsCount: invoiceItemIds.length,
    matchRecordsCount: matchRecords.length,
    missingInvoiceItemIds,
    orphanMatchInvoiceItemIds,
    duplicateInvoiceItemIds,
    byStatus,
  };
}

export async function shadowSeedInvoiceItemMatches(
  client: AppSupabaseClient,
  params: {
    items: readonly ShadowSeedInvoiceItemInput[];
    ingredientCatalog: readonly IngredientCanonicalInput[];
    confirmedAliases: IngredientAliasMap;
    supplierName?: string | null;
    aliasAutoConfirm?: boolean;
    now?: string;
  },
): Promise<ShadowSeedBatchResult> {
  const result: ShadowSeedBatchResult = {
    attempted: params.items.length,
    upserted: 0,
    skipped: 0,
    errors: [],
    byStatus: emptyStatusCounts(),
  };

  if (params.items.length === 0) return result;

  const matchCatalogsByInvoiceId = buildMatchCatalogsByInvoiceId(
    params.ingredientCatalog,
    params.items,
  );

  for (const item of params.items) {
    try {
      const record = buildMatchRecordForInvoiceItem({
        item,
        ingredientCatalog: params.ingredientCatalog,
        confirmedAliases: params.confirmedAliases,
        supplierName: params.supplierName,
        matchCatalog: matchCatalogsByInvoiceId.get(item.invoice_id),
        now: params.now,
      });
      result.byStatus[record.status] += 1;

      const { error } = await upsertInvoiceItemMatch(client, record);
      if (error) {
        result.errors.push(`${item.id}: ${error.message}`);
        result.skipped += 1;
        continue;
      }
      result.upserted += 1;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      result.errors.push(`${item.id}: ${message}`);
      result.skipped += 1;
    }
  }

  return result;
}

/**
 * Extract-path hook: upserts shadow match records after invoice_items insert.
 * No-op when shadow seed flag is disabled. Errors are logged, not thrown.
 */
export async function shadowSeedInvoiceItemMatchesAfterExtract(
  client: AppSupabaseClient,
  params: {
    invoiceId: string;
    userId: string;
    items: readonly Pick<ShadowSeedInvoiceItemInput, "id" | "name">[];
    ingredientCatalog: readonly IngredientCanonicalInput[];
    confirmedAliases: IngredientAliasMap;
    supplierName?: string | null;
  },
): Promise<ShadowSeedBatchResult | null> {
  if (!isMatchLifecycleShadowSeedEnabled()) return null;

  const seedItems: ShadowSeedInvoiceItemInput[] = params.items.map((item) => ({
    id: item.id,
    name: item.name,
    invoice_id: params.invoiceId,
    user_id: params.userId,
  }));

  const result = await shadowSeedInvoiceItemMatches(client, {
    items: seedItems,
    ingredientCatalog: params.ingredientCatalog,
    confirmedAliases: params.confirmedAliases,
    supplierName: params.supplierName,
  });

  if (result.errors.length > 0) {
    console.error(LOG_PREFIX, {
      action: "extract_seed_partial_failure",
      invoiceId: params.invoiceId,
      upserted: result.upserted,
      skipped: result.skipped,
      errors: result.errors,
    });
  } else if (result.upserted > 0) {
    console.info(LOG_PREFIX, {
      action: "extract_seed_complete",
      invoiceId: params.invoiceId,
      upserted: result.upserted,
      byStatus: result.byStatus,
    });
  }

  return result;
}

export async function backfillInvoiceItemMatches(
  client: AppSupabaseClient,
  ingredientCatalog: readonly IngredientCanonicalInput[],
  confirmedAliases: IngredientAliasMap,
  options: BackfillInvoiceItemMatchesOptions = {},
): Promise<BackfillInvoiceItemMatchesResult> {
  const dryRun = options.dryRun === true;

  let itemsQuery = client
    .from("invoice_items")
    .select("id,invoice_id,user_id,name,invoices!inner(supplier_name)");

  if (options.userId) {
    itemsQuery = itemsQuery.eq("user_id", options.userId);
  }
  if (options.invoiceId) {
    itemsQuery = itemsQuery.eq("invoice_id", options.invoiceId);
  }

  const [{ data: itemRows, error: itemsError }, { data: matchRows, error: matchesError }] =
    await Promise.all([
      itemsQuery,
      client.from("invoice_item_matches").select("invoice_item_id,status"),
    ]);

  if (itemsError) {
    throw new Error(`load invoice_items: ${itemsError.message}`);
  }
  if (matchesError) {
    throw new Error(`load invoice_item_matches: ${matchesError.message}`);
  }

  const items = (itemRows ?? []) as Array<{
    id: string;
    invoice_id: string;
    user_id: string;
    name: string;
    invoices: { supplier_name: string | null } | null;
  }>;

  const coverageBefore = computeInvoiceItemMatchCoverage(
    items.map((row) => row.id),
    (matchRows ?? []) as Array<{ invoice_item_id: string; status: InvoiceItemMatchStatus }>,
  );

  const seedResult: ShadowSeedBatchResult = {
    attempted: items.length,
    upserted: 0,
    skipped: 0,
    errors: [],
    byStatus: emptyStatusCounts(),
  };

  const seedItems: ShadowSeedInvoiceItemInput[] = items.map((row) => ({
    id: row.id,
    invoice_id: row.invoice_id,
    user_id: row.user_id,
    name: row.name,
  }));
  const matchCatalogsByInvoiceId = buildMatchCatalogsByInvoiceId(ingredientCatalog, seedItems);
  const supplierByInvoiceId = new Map(
    items.map((row) => [row.invoice_id, row.invoices?.supplier_name ?? null]),
  );

  for (const row of items) {
    try {
      const record = buildMatchRecordForInvoiceItem({
        item: {
          id: row.id,
          invoice_id: row.invoice_id,
          user_id: row.user_id,
          name: row.name,
        },
        ingredientCatalog,
        confirmedAliases,
        supplierName: supplierByInvoiceId.get(row.invoice_id) ?? null,
        matchCatalog: matchCatalogsByInvoiceId.get(row.invoice_id),
      });
      seedResult.byStatus[record.status] += 1;

      if (dryRun) {
        seedResult.upserted += 1;
        continue;
      }

      const { error } = await upsertInvoiceItemMatch(client, record);
      if (error) {
        seedResult.errors.push(`${row.id}: ${error.message}`);
        seedResult.skipped += 1;
        continue;
      }
      seedResult.upserted += 1;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      seedResult.errors.push(`${row.id}: ${message}`);
      seedResult.skipped += 1;
    }
  }

  const coverageAfter = dryRun
    ? {
        ...coverageBefore,
        byStatus: seedResult.byStatus,
      }
    : computeInvoiceItemMatchCoverage(
        items.map((row) => row.id),
        (matchRows ?? []).map((row) => ({
          invoice_item_id: (row as { invoice_item_id: string }).invoice_item_id,
          status: (row as { status: InvoiceItemMatchStatus }).status,
        })),
      );

  if (!dryRun) {
    const { data: refreshedMatches, error: refreshError } = await client
      .from("invoice_item_matches")
      .select("invoice_item_id,status");
    if (refreshError) {
      seedResult.errors.push(`coverage refresh: ${refreshError.message}`);
    } else {
      Object.assign(
        coverageAfter,
        computeInvoiceItemMatchCoverage(
          items.map((row) => row.id),
          (refreshedMatches ?? []) as Array<{
            invoice_item_id: string;
            status: InvoiceItemMatchStatus;
          }>,
        ),
      );
    }
  }

  return {
    ...seedResult,
    dryRun,
    coverage: coverageAfter,
  };
}
