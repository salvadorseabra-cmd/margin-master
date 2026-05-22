/**
 * Full dependency diagnostics for a canonical ingredient — every row blocking true orphan status.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { loadConfirmedIngredientAliasMap } from "@/lib/ingredient-alias-memory";
import type { IngredientAliasMap, IngredientCanonicalInput } from "@/lib/ingredient-canonical";
import {
  isArchivedIngredientEntry,
  normalizeCanonicalIngredientName,
} from "@/lib/ingredient-canonical";
import {
  hydrateIngredientMatchOverridesFromConfirmedMap,
  ingredientMatchOverrides,
} from "@/lib/ingredient-match-override";
import {
  buildOrphanReportsFromDependencyRows,
  emptyOrphanReport,
  fetchOrphanDependencyRows,
  isIngredientOperationallyOrphaned,
  orphanBlockingReasons,
  ORPHAN_REASON_LABELS,
  type IngredientOrphanReport,
  type OrphanDependencyKey,
} from "@/lib/ingredient-orphan-detection";
import {
  buildMatchedInvoiceProductsFromScan,
  buildOperationalProfileFromAliasRows,
  loadInvoiceItemsForMatchedProductScan,
  MATCHED_INVOICE_PRODUCTS_SCAN_LIMIT,
  type IngredientOperationalMemoryKey,
} from "@/lib/ingredient-operational-intelligence";
import {
  catalogOperationalIdentityKeyForEntry,
  operationalIdentityKeyForCatalogEntry,
} from "@/lib/ingredient-operational-identity";
import {
  buildRejectedIngredientMatchKey,
  listRejectedIngredientMatches,
  type RejectedIngredientMatch,
} from "@/lib/ingredient-rejected-match-memory";
import type { Database } from "@/integrations/supabase/types";

type DiagnosticsClient = SupabaseClient<Database>;

export const DEPENDENCY_RECORD_ID_CAP = 50;

export type DependencyDiagnosticEntry = {
  dependencyType: string;
  count: number;
  totalCount: number;
  recordIds: string[];
  sourceTable: string;
  notes?: string;
  blocksOrphanStatus: boolean;
  orphanBlockingKey?: OrphanDependencyKey;
};

export type BrowserStorageDependencySnapshot = {
  rejectedMatches?: RejectedIngredientMatch[];
  invoiceIngredientAliases?: IngredientAliasMap;
};

export type CanonicalIngredientDependencyReport = {
  ingredientId: string;
  ingredientName: string | null;
  userId: string;
  generatedAt: string;
  orphanReport: IngredientOrphanReport;
  isOperationallyOrphaned: boolean;
  orphanBlockingReasons: OrphanDependencyKey[];
  orphanBlockingLabels: string[];
  dependencies: DependencyDiagnosticEntry[];
  operationalMemoryKeys: IngredientOperationalMemoryKey[];
  catalogVisibility: {
    hiddenFromMainCatalogHeuristic: boolean;
    isArchived: boolean;
    mergedIntoIngredientId: string | null;
  };
};

export type InspectCanonicalIngredientDependenciesParams = {
  client: DiagnosticsClient;
  ingredientId: string;
  userId: string;
  catalog?: IngredientCanonicalInput[];
  confirmedAliases?: IngredientAliasMap;
  browserStorage?: BrowserStorageDependencySnapshot;
};

function capRecordIds(ids: string[]): { recordIds: string[]; totalCount: number } {
  const unique = [...new Set(ids.map((id) => id?.trim()).filter(Boolean))] as string[];
  return {
    recordIds: unique.slice(0, DEPENDENCY_RECORD_ID_CAP),
    totalCount: unique.length,
  };
}

function entry(
  partial: Omit<DependencyDiagnosticEntry, "count" | "totalCount" | "recordIds"> & {
    recordIds: string[];
  },
): DependencyDiagnosticEntry {
  const capped = capRecordIds(partial.recordIds);
  return {
    ...partial,
    count: capped.recordIds.length,
    totalCount: capped.totalCount,
    recordIds: capped.recordIds,
  };
}

function findCatalogEntry(
  catalog: IngredientCanonicalInput[] | undefined,
  ingredientId: string,
): IngredientCanonicalInput | null {
  if (!catalog?.length) return null;
  return catalog.find((row) => row.id?.trim() === ingredientId) ?? null;
}

function collectOperationalIdentityCollisions(
  ingredientId: string,
  catalog: IngredientCanonicalInput[],
): DependencyDiagnosticEntry[] {
  const target = catalog.find((row) => row.id?.trim() === ingredientId);
  if (!target || isArchivedIngredientEntry(target)) {
    return [];
  }

  const catalogKey = catalogOperationalIdentityKeyForEntry(target);
  const matcherKey = operationalIdentityKeyForCatalogEntry(target);
  const collisions: { key: string; otherIds: string[] }[] = [];

  if (catalogKey) {
    const otherIds = catalog
      .filter(
        (row) =>
          row.id?.trim() &&
          row.id.trim() !== ingredientId &&
          !isArchivedIngredientEntry(row) &&
          catalogOperationalIdentityKeyForEntry(row) === catalogKey,
      )
      .map((row) => row.id.trim());
    if (otherIds.length > 0) collisions.push({ key: catalogKey, otherIds });
  }

  if (matcherKey && matcherKey !== catalogKey) {
    const otherIds = catalog
      .filter(
        (row) =>
          row.id?.trim() &&
          row.id.trim() !== ingredientId &&
          !isArchivedIngredientEntry(row) &&
          operationalIdentityKeyForCatalogEntry(row) === matcherKey,
      )
      .map((row) => row.id.trim());
    if (otherIds.length > 0) collisions.push({ key: matcherKey, otherIds });
  }

  if (collisions.length === 0) {
    return [
      entry({
        dependencyType: "normalized_identity_links",
        sourceTable: "ingredients (derived)",
        recordIds: [],
        blocksOrphanStatus: false,
        notes: "No operational/catalog identity key collision with other active canonicals",
      }),
    ];
  }

  return collisions.map(({ key, otherIds }) =>
    entry({
      dependencyType: "normalized_identity_links",
      sourceTable: "ingredients (derived)",
      recordIds: otherIds,
      blocksOrphanStatus: false,
      notes: `Operational identity key "${key}" shared with other active canonical(s)`,
    }),
  );
}

function scanConfirmedAliasMapKeys(
  ingredientId: string,
  confirmedAliases: IngredientAliasMap,
): DependencyDiagnosticEntry {
  const keys = Object.entries(confirmedAliases)
    .filter(([, mappedId]) => mappedId?.trim() === ingredientId)
    .map(([lookupKey]) => lookupKey);
  return entry({
    dependencyType: "confirmed_alias_map_keys",
    sourceTable: "ingredient_aliases (in-memory map)",
    recordIds: keys,
    blocksOrphanStatus: false,
    notes: "Keys from loadConfirmedIngredientAliasMap / session map pointing at this ingredient id",
  });
}

function scanMatchOverrides(ingredientId: string): DependencyDiagnosticEntry {
  const keys: string[] = [];
  for (const [lookupKey, override] of ingredientMatchOverrides.entries()) {
    if (override.canonicalIngredientId?.trim() === ingredientId) keys.push(lookupKey);
  }
  return entry({
    dependencyType: "match_overrides_in_memory",
    sourceTable: "ingredientMatchOverrides (session)",
    recordIds: keys,
    blocksOrphanStatus: false,
    notes: "Hydrated from confirmed aliases; not persisted separately in localStorage",
  });
}

function scanRejectedMatches(
  ingredientId: string,
  browserRejected?: RejectedIngredientMatch[],
): DependencyDiagnosticEntry[] {
  const rows = browserRejected ?? listRejectedIngredientMatches();
  const hits = rows.filter((row) => row.rejectedIngredientId?.trim() === ingredientId);
  const recordIds = hits.map((row) =>
    buildRejectedIngredientMatchKey(
      row.normalizedInvoiceText,
      row.rejectedIngredientId,
      row.supplierId,
    ),
  );
  return [
    entry({
      dependencyType: "rejected_match_pairs",
      sourceTable: browserRejected
        ? "localStorage marginly:rejected-ingredient-matches:*"
        : "rejectedIngredientMatches (memory)",
      recordIds,
      blocksOrphanStatus: false,
      notes: "Blocks automatic re-match only; does not block orphan detection",
    }),
  ];
}

function scanLegacyInvoiceAliasStorage(
  ingredientId: string,
  map?: IngredientAliasMap,
): DependencyDiagnosticEntry | null {
  if (!map) return null;
  const keys = Object.entries(map)
    .filter(([, mappedId]) => mappedId?.trim() === ingredientId)
    .map(([lookupKey]) => lookupKey);
  return entry({
    dependencyType: "legacy_invoice_ingredient_aliases_localStorage",
    sourceTable: "localStorage marginly:invoice-ingredient-aliases:*",
    recordIds: keys,
    blocksOrphanStatus: false,
    notes: "Legacy browser cache; may diverge from Supabase confirmed aliases",
  });
}

function aliasRowsToOrphanCounts(
  aliasRows: { id: string; supplier_name: string | null }[],
): { invoiceIds: string[]; supplierIds: string[] } {
  const invoiceIds: string[] = [];
  const supplierIds: string[] = [];
  for (const row of aliasRows) {
    invoiceIds.push(row.id);
    if (row.supplier_name?.trim()) supplierIds.push(row.id);
  }
  return { invoiceIds, supplierIds };
}

async function loadIngredientRow(
  client: DiagnosticsClient,
  ingredientId: string,
  userId: string,
): Promise<{
  name: string | null;
  isArchived: boolean;
  mergedInto: string | null;
  error: string | null;
}> {
  const { data, error } = await client
    .from("ingredients")
    .select("id, name, is_archived, merged_into_ingredient_id")
    .eq("id", ingredientId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) return { name: null, isArchived: false, mergedInto: null, error: error.message };
  return {
    name: data?.name ?? null,
    isArchived: Boolean(data?.is_archived),
    mergedInto: data?.merged_into_ingredient_id?.trim() ?? null,
    error: data ? null : "ingredient not found for user",
  };
}

async function loadAliasRowsForIngredient(
  client: DiagnosticsClient,
  ingredientId: string,
): Promise<
  {
    id: string;
    alias_name: string;
    normalized_alias: string;
    supplier_name: string | null;
    confirmed_by_user: boolean | null;
  }[]
> {
  const { data, error } = await client
    .from("ingredient_aliases")
    .select("id, alias_name, normalized_alias, supplier_name, confirmed_by_user")
    .eq("ingredient_id", ingredientId)
    .order("created_at", { ascending: false });

  if (error) return [];
  return (data ?? []) as {
    id: string;
    alias_name: string;
    normalized_alias: string;
    supplier_name: string | null;
    confirmed_by_user: boolean | null;
  }[];
}

async function loadRecipeIngredientIds(
  client: DiagnosticsClient,
  ingredientId: string,
): Promise<{ ids: string[]; prepIds: string[] }> {
  const { data, error } = await client
    .from("recipe_ingredients")
    .select("id, recipes!recipe_ingredients_recipe_id_fkey(type)")
    .eq("ingredient_id", ingredientId);

  if (error) return { ids: [], prepIds: [] };
  const ids: string[] = [];
  const prepIds: string[] = [];
  for (const row of data ?? []) {
    const id = (row as { id?: string }).id?.trim();
    if (!id) continue;
    ids.push(id);
    const recipeType = (row as { recipes?: { type?: string | null } | null }).recipes?.type;
    if (recipeType === "prep") prepIds.push(id);
  }
  return { ids, prepIds };
}

async function loadPriceHistoryIds(
  client: DiagnosticsClient,
  ingredientId: string,
): Promise<{ allIds: string[]; invoiceLinkedIds: string[] }> {
  const { data, error } = await client
    .from("ingredient_price_history")
    .select("id, invoice_id")
    .eq("ingredient_id", ingredientId);

  if (error) return { allIds: [], invoiceLinkedIds: [] };
  const allIds: string[] = [];
  const invoiceLinkedIds: string[] = [];
  for (const row of data ?? []) {
    const id = (row as { id?: string }).id?.trim();
    if (!id) continue;
    allIds.push(id);
    if ((row as { invoice_id?: string | null }).invoice_id?.trim()) invoiceLinkedIds.push(id);
  }
  return { allIds, invoiceLinkedIds };
}

async function loadMarginImpactIds(client: DiagnosticsClient, ingredientId: string): Promise<string[]> {
  const { data, error } = await client
    .from("recipe_margin_impacts")
    .select("id")
    .eq("ingredient_id", ingredientId);

  if (error) return [];
  return (data ?? [])
    .map((row) => (row as { id?: string }).id?.trim())
    .filter(Boolean) as string[];
}

function shouldHideFromMainCatalogHeuristic(
  entry: IngredientCanonicalInput | null,
  catalog: IngredientCanonicalInput[],
  orphanReport: IngredientOrphanReport,
): boolean {
  if (!entry?.id?.trim() || !isIngredientOperationallyOrphaned(orphanReport)) return false;
  const id = entry.id.trim();
  const entryNorm = normalizeCanonicalIngredientName(entry.name ?? "");
  if (!entryNorm) return false;

  const upperName = (entry.name ?? "").replace(/[^A-Za-zÀ-ÿ]/g, "");
  const upperCount = (entry.name?.match(/[A-Z]/g) ?? []).length;
  if (upperName.length >= 2 && upperCount / upperName.length >= 0.82) return true;

  const entryTokens = entryNorm.split(/\s+/).filter(Boolean);
  for (const other of catalog) {
    const otherId = other.id?.trim();
    if (!otherId || otherId === id || isArchivedIngredientEntry(other)) continue;
    const otherNorm = normalizeCanonicalIngredientName(other.name ?? "");
    if (!otherNorm) continue;
    if (otherNorm.includes(entryNorm)) return true;
    if (entryTokens.length > 0 && entryTokens.every((token) => otherNorm.includes(token))) {
      return true;
    }
  }
  return false;
}

/** Build the summary orphan report used by catalog load and reassignment archive. */
export function orphanReportFromDiagnostics(
  dependencies: DependencyDiagnosticEntry[],
  ingredientId: string,
): IngredientOrphanReport {
  const report = emptyOrphanReport(ingredientId);
  for (const dep of dependencies) {
    if (!dep.blocksOrphanStatus || !dep.orphanBlockingKey) continue;
    switch (dep.orphanBlockingKey) {
      case "invoice_aliases":
        report.invoiceAliasCount = dep.totalCount;
        break;
      case "supplier_aliases":
        report.supplierAliasCount = dep.totalCount;
        break;
      case "recipe_ingredients":
        report.recipeIngredientCount = dep.totalCount;
        break;
      case "prep_recipe_ingredients":
        report.prepRecipeIngredientCount = dep.totalCount;
        break;
      case "price_history":
        report.priceHistoryCount = dep.totalCount;
        break;
      case "margin_impacts":
        report.marginImpactCount = dep.totalCount;
        break;
      default:
        break;
    }
  }
  return report;
}

/**
 * Inspect every known dependency dimension for one canonical ingredient.
 */
export async function inspectCanonicalIngredientDependencies(
  params: InspectCanonicalIngredientDependenciesParams,
): Promise<{ report: CanonicalIngredientDependencyReport | null; error: string | null }> {
  const ingredientId = params.ingredientId?.trim();
  const userId = params.userId?.trim();
  if (!ingredientId || !userId) {
    return { report: null, error: "ingredientId and userId are required" };
  }

  const [ingredientRow, aliasRows, recipeIds, priceHistory, marginIds, orphanRows] =
    await Promise.all([
      loadIngredientRow(params.client, ingredientId, userId),
      loadAliasRowsForIngredient(params.client, ingredientId),
      loadRecipeIngredientIds(params.client, ingredientId),
      loadPriceHistoryIds(params.client, ingredientId),
      loadMarginImpactIds(params.client, ingredientId),
      fetchOrphanDependencyRows(params.client, [ingredientId]),
    ]);

  if (ingredientRow.error) {
    return { report: null, error: ingredientRow.error };
  }
  if (orphanRows.error) {
    return { report: null, error: orphanRows.error };
  }

  const catalog = params.catalog ?? [];
  const catalogEntry = findCatalogEntry(catalog, ingredientId);
  const confirmedAliases =
    params.confirmedAliases ?? (await loadConfirmedIngredientAliasMap(params.client));

  hydrateIngredientMatchOverridesFromConfirmedMap(confirmedAliases, catalog);

  const { supplierIds } = aliasRowsToOrphanCounts(aliasRows);
  const supplierWordingNames = aliasRows
    .filter((row) => row.supplier_name?.trim())
    .map((row) => row.alias_name?.trim() || row.normalized_alias?.trim())
    .filter(Boolean) as string[];

  const dependencies: DependencyDiagnosticEntry[] = [
    entry({
      dependencyType: "ingredient_aliases",
      sourceTable: "ingredient_aliases",
      recordIds: aliasRows.map((row) => row.id),
      blocksOrphanStatus: aliasRows.length > 0,
      orphanBlockingKey: aliasRows.length > 0 ? "invoice_aliases" : undefined,
      notes:
        aliasRows.length > 0
          ? `${aliasRows.length} row(s); ${supplierIds.length} supplier-scoped`
          : "No alias rows — reassignment complete for this table",
    }),
    entry({
      dependencyType: "supplier_wording_memory",
      sourceTable: "ingredient_aliases",
      recordIds: supplierWordingNames,
      blocksOrphanStatus: supplierIds.length > 0,
      orphanBlockingKey: supplierIds.length > 0 ? "supplier_aliases" : undefined,
      notes: "alias_name values on supplier-scoped rows",
    }),
    entry({
      dependencyType: "recipe_ingredients",
      sourceTable: "recipe_ingredients",
      recordIds: recipeIds.ids,
      blocksOrphanStatus: recipeIds.ids.length > 0,
      orphanBlockingKey: recipeIds.ids.length > 0 ? "recipe_ingredients" : undefined,
    }),
    entry({
      dependencyType: "prep_recipe_ingredients",
      sourceTable: "recipe_ingredients + recipes.type=prep",
      recordIds: recipeIds.prepIds,
      blocksOrphanStatus: recipeIds.prepIds.length > 0,
      orphanBlockingKey: recipeIds.prepIds.length > 0 ? "prep_recipe_ingredients" : undefined,
    }),
    entry({
      dependencyType: "ingredient_price_history",
      sourceTable: "ingredient_price_history",
      recordIds: priceHistory.allIds,
      blocksOrphanStatus: priceHistory.allIds.length > 0,
      orphanBlockingKey: priceHistory.allIds.length > 0 ? "price_history" : undefined,
    }),
    entry({
      dependencyType: "historical_invoice_references",
      sourceTable: "ingredient_price_history",
      recordIds: priceHistory.invoiceLinkedIds,
      blocksOrphanStatus: false,
      notes: "Subset with non-null invoice_id (informational; counts toward price_history orphan block)",
    }),
    entry({
      dependencyType: "recipe_margin_impacts",
      sourceTable: "recipe_margin_impacts",
      recordIds: marginIds,
      blocksOrphanStatus: marginIds.length > 0,
      orphanBlockingKey: marginIds.length > 0 ? "margin_impacts" : undefined,
    }),
    entry({
      dependencyType: "archived_references",
      sourceTable: "ingredients",
      recordIds: ingredientRow.isArchived || ingredientRow.mergedInto ? [ingredientId] : [],
      blocksOrphanStatus: false,
      notes: ingredientRow.isArchived
        ? `is_archived=true${ingredientRow.mergedInto ? `; merged_into=${ingredientRow.mergedInto}` : ""}`
        : ingredientRow.mergedInto
          ? `merged_into_ingredient_id=${ingredientRow.mergedInto}`
          : "Active canonical row (not archived)",
    }),
    scanConfirmedAliasMapKeys(ingredientId, confirmedAliases),
    scanMatchOverrides(ingredientId),
    ...scanRejectedMatches(ingredientId, params.browserStorage?.rejectedMatches),
  ];

  if (params.browserStorage?.invoiceIngredientAliases) {
    const legacy = scanLegacyInvoiceAliasStorage(
      ingredientId,
      params.browserStorage.invoiceIngredientAliases,
    );
    if (legacy) dependencies.push(legacy);
  }

  if (catalog.length > 0) {
    dependencies.push(...collectOperationalIdentityCollisions(ingredientId, catalog));
  }

  const { rows: invoiceScanRows, truncated } = await loadInvoiceItemsForMatchedProductScan(
    params.client,
  );
  const matched = buildMatchedInvoiceProductsFromScan(
    ingredientId,
    catalog,
    confirmedAliases,
    invoiceScanRows,
    { truncated, scanLimit: MATCHED_INVOICE_PRODUCTS_SCAN_LIMIT },
  );
  dependencies.push(
    entry({
      dependencyType: "matched_invoice_lines",
      sourceTable: "invoice_items (live matcher scan)",
      recordIds: matched.products.map((product) => product.itemId),
      blocksOrphanStatus: false,
      notes: truncated
        ? `Scan truncated at ${MATCHED_INVOICE_PRODUCTS_SCAN_LIMIT} newest lines`
        : `Live ItemsTable matcher resolved ${matched.products.length} line(s)`,
    }),
  );

  const orphanFromFetch = buildOrphanReportsFromDependencyRows(
    [ingredientId],
    orphanRows.rows,
  ).get(ingredientId)!;

  const orphanReport = orphanFromFetch;
  const isOperationallyOrphaned = isIngredientOperationallyOrphaned(orphanReport);
  const blocking = orphanBlockingReasons(orphanReport);

  const aliasRowsForMemory = aliasRows.map((row) => ({
    id: row.id,
    ingredient_id: ingredientId,
    alias_name: row.alias_name,
    normalized_alias: row.normalized_alias,
    supplier_name: row.supplier_name,
    confidence: 0,
    confirmed_by_user: row.confirmed_by_user ?? false,
    created_at: "",
  }));
  const operationalMemoryKeys = buildOperationalProfileFromAliasRows(
    ingredientId,
    aliasRowsForMemory,
    [],
    Object.fromEntries(
      Object.entries(confirmedAliases).filter(([, id]) => id?.trim() === ingredientId),
    ),
  ).memoryKeys;

  return {
    report: {
      ingredientId,
      ingredientName: ingredientRow.name ?? catalogEntry?.name ?? null,
      userId,
      generatedAt: new Date().toISOString(),
      orphanReport,
      isOperationallyOrphaned,
      orphanBlockingReasons: blocking,
      orphanBlockingLabels: blocking.map((key) => ORPHAN_REASON_LABELS[key]),
      dependencies,
      operationalMemoryKeys,
      catalogVisibility: {
        hiddenFromMainCatalogHeuristic: shouldHideFromMainCatalogHeuristic(
          catalogEntry ?? { id: ingredientId, name: ingredientRow.name ?? ingredientId },
          catalog,
          orphanReport,
        ),
        isArchived: ingredientRow.isArchived,
        mergedIntoIngredientId: ingredientRow.mergedInto,
      },
    },
    error: null,
  };
}

export function formatDependencyDiagnosticsTable(
  report: CanonicalIngredientDependencyReport,
): string {
  const lines: string[] = [];
  lines.push(
    `Ingredient: ${report.ingredientName ?? report.ingredientId} (${report.ingredientId})`,
  );
  lines.push(
    `Orphan: ${report.isOperationallyOrphaned ? "YES" : "NO"} — blockers: ${
      report.orphanBlockingLabels.length > 0
        ? report.orphanBlockingLabels.join("; ")
        : "(none)"
    }`,
  );
  lines.push(
    `Catalog: archived=${report.catalogVisibility.isArchived} hidden_heuristic=${report.catalogVisibility.hiddenFromMainCatalogHeuristic}`,
  );
  lines.push("");
  lines.push(
    padRow(["dependencyType", "count", "total", "blocks", "sourceTable", "notes"]),
  );
  lines.push(padRow(["─".repeat(14), "─".repeat(5), "─".repeat(5), "─".repeat(6), "─".repeat(22), ""]));

  for (const dep of report.dependencies) {
    lines.push(
      padRow([
        dep.dependencyType,
        String(dep.count),
        String(dep.totalCount),
        dep.blocksOrphanStatus ? "yes" : "no",
        dep.sourceTable,
        dep.notes ?? dep.recordIds.slice(0, 3).join(", "),
      ]),
    );
  }

  return lines.join("\n");
}

function padRow(cells: string[]): string {
  const widths = [28, 6, 6, 6, 26, 40];
  return cells
    .map((cell, index) => {
      const width = widths[index] ?? 20;
      const text = cell.length > width ? `${cell.slice(0, width - 1)}…` : cell;
      return text.padEnd(width);
    })
    .join(" ");
}

export function summarizeOrphanBlockingChecks(
  report: CanonicalIngredientDependencyReport,
): { check: OrphanDependencyKey; blocks: boolean; count: number; label: string }[] {
  const keys: OrphanDependencyKey[] = [
    "invoice_aliases",
    "supplier_aliases",
    "recipe_ingredients",
    "prep_recipe_ingredients",
    "price_history",
    "margin_impacts",
  ];
  return keys.map((check) => ({
    check,
    blocks: report.orphanBlockingReasons.includes(check),
    count: (() => {
      const r = report.orphanReport;
      switch (check) {
        case "invoice_aliases":
          return r.invoiceAliasCount;
        case "supplier_aliases":
          return r.supplierAliasCount;
        case "recipe_ingredients":
          return r.recipeIngredientCount;
        case "prep_recipe_ingredients":
          return r.prepRecipeIngredientCount;
        case "price_history":
          return r.priceHistoryCount;
        case "margin_impacts":
          return r.marginImpactCount;
        default:
          return 0;
      }
    })(),
    label: ORPHAN_REASON_LABELS[check],
  }));
}
