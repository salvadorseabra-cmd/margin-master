import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildConfirmedAliasMapFromRows,
  buildIngredientAliasLookupKey,
  resolveNormalizedAliasFromConfirmedRow,
  type AppSupabaseClient,
  type ConfirmedIngredientAliasRow,
} from "@/lib/ingredient-alias-memory";
import { formatCanonicalIngredientDisplayName } from "@/lib/canonical-ingredient-display-name";
import { formatQuantityWithUnit } from "@/lib/display-format";
import type {
  IngredientAliasMap,
  IngredientCanonicalInput,
  IngredientCanonicalMatchKind,
} from "@/lib/ingredient-canonical";
import { shouldSkipByOperationalProductFamilyGate } from "@/lib/ingredient-operational-family-gate";
import { buildInvoiceMatchCatalog } from "@/lib/ingredient-canonical-synthesis";
import {
  buildMatchExplanation,
  type InvoiceIngredientDisplayState,
} from "@/lib/ingredient-match-explanation";
import {
  invoiceRowMatchSummaryBucket,
  resolveInvoiceTableRowIngredientMatch,
} from "@/lib/invoice-ingredient-row-display";
import { normalizeInvoiceItemFields } from "@/lib/invoice-item-fields";
import { isEligibleInvoiceIngredientRow } from "@/lib/invoice-unresolved-ingredient-count";
import { resolveInvoiceLineStockPresentation } from "@/lib/invoice-purchase-format";
import { normalizeIngredientName } from "@/lib/normalizeIngredient";
import { normalizeSupplierDisplayName } from "@/lib/supplier-identity";
import {
  normalizePurchasedToUsableStock,
  parsePurchaseStructureFromText,
  type PurchaseStructure,
} from "@/lib/stock-normalization";
import type { Database } from "@/integrations/supabase/types";

type DbClient = SupabaseClient<Database>;

const LOG_PREFIX = "[ingredient-operational-intelligence]";
const INVOICE_ITEM_SCAN_LIMIT = 800;
export const MATCHED_INVOICE_PRODUCTS_SCAN_LIMIT = 5000;
const MATCHED_INVOICE_PRODUCTS_CACHE_TTL_MS = 60_000;

export type IngredientMatchedInvoiceProduct = {
  /** Catalog ingredient id from the live matcher (`match.ingredient.id`). */
  matchedIngredientId: string;
  itemId: string;
  itemName: string;
  supplierName: string | null;
  invoiceDate: string | null;
  invoiceId: string;
  unitPrice: number | null;
  lineTotal: number | null;
  matchBucket: "matched" | "suggested";
  matchDisplayState: InvoiceIngredientDisplayState;
  matchKind: IngredientCanonicalMatchKind;
  confidenceLabel: string;
  matchSourceHeadline: string;
  matchSourceDetail: string;
  purchaseStructureSummary: string | null;
  normalizedUsableQuantityLabel: string | null;
};

export type IngredientMatchedInvoiceProductsResult = {
  ingredientId: string;
  canonicalName: string | null;
  products: IngredientMatchedInvoiceProduct[];
  truncated: boolean;
  scanLimit: number;
};

type MatchedInvoiceItemScanRow = {
  id: string;
  invoice_id: string;
  name: string;
  quantity: number | null;
  unit: string | null;
  unit_price: number | null;
  total: number | null;
  created_at: string;
  invoices: {
    invoice_date: string | null;
    supplier_name: string | null;
  } | null;
};

const matchedInvoiceProductsCache = new Map<
  string,
  { loadedAt: number; result: IngredientMatchedInvoiceProductsResult }
>();

export type IngredientAliasMatchSource =
  | "confirmed_alias"
  | "manual"
  | "database_alias"
  | "operational_memory";

export type IngredientOperationalAliasRow = {
  id: string;
  ingredientId: string;
  aliasName: string;
  normalizedAlias: string;
  supplierName: string | null;
  confidence: number;
  matchSource: IngredientAliasMatchSource;
  matchSourceLabel: string;
  confirmedByUser: boolean;
  createdAt: string;
  lastInvoiceUsageDate: string | null;
  sampleInvoiceLine: {
    name: string;
    quantity: number | null;
    unit: string | null;
  } | null;
  purchaseStructureSummary: string | null;
  usableQuantityPreview: string | null;
};

export type IngredientOperationalMemoryKey = {
  lookupKey: string;
  aliasName: string | null;
  supplierName: string | null;
};

export type IngredientOperationalProfile = {
  ingredientId: string;
  aliases: IngredientOperationalAliasRow[];
  memoryKeys: IngredientOperationalMemoryKey[];
};

type IngredientAliasDbRow = {
  id: string;
  ingredient_id: string;
  alias_name: string;
  normalized_alias: string;
  supplier_name: string | null;
  confidence: number;
  confirmed_by_user: boolean;
  created_at: string;
};

type InvoiceItemScanRow = {
  name: string;
  quantity: number | null;
  unit: string | null;
  created_at: string;
  invoices: {
    invoice_date: string | null;
    supplier_name: string | null;
  } | null;
};

function logQueryFailure(label: string, message: string): void {
  console.error(`${LOG_PREFIX} ${label} failed: ${message}`);
}

function normalizeSupplierScope(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null;
  return normalizeSupplierDisplayName(raw) || null;
}

function resolveMatchSource(row: Pick<IngredientAliasDbRow, "confirmed_by_user" | "confidence">): {
  matchSource: IngredientAliasMatchSource;
  matchSourceLabel: string;
} {
  if (row.confirmed_by_user) {
    return { matchSource: "confirmed_alias", matchSourceLabel: "Alias confirmado" };
  }
  if (row.confidence >= 8) {
    return { matchSource: "manual", matchSourceLabel: "Correção manual" };
  }
  return { matchSource: "database_alias", matchSourceLabel: "Alias na base de dados" };
}

export function formatPurchaseStructureSummary(structure: PurchaseStructure | null): string | null {
  if (!structure) return null;
  const parts: string[] = [];
  if (structure.purchaseQuantity != null && structure.purchaseFormat) {
    parts.push(`${structure.purchaseQuantity} ${structure.purchaseFormat}`);
  }
  if (structure.innerUnitCount != null && structure.innerUnitType) {
    parts.push(`${structure.innerUnitCount}× ${structure.innerUnitType}`);
  }
  if (structure.unitSize != null && structure.unitMeasurement) {
    parts.push(`${structure.unitSize} ${structure.unitMeasurement}`);
  }
  if (structure.totalUsableAmount != null && structure.usableUnit) {
    parts.push(
      `→ ${formatQuantityWithUnit(structure.totalUsableAmount, structure.usableUnit)} utilizável`,
    );
  }
  return parts.length > 0 ? parts.join(" · ") : structure.matchedText ?? null;
}

export function buildUsableQuantityPreview(
  lineName: string,
  quantity: number | null,
  unit: string | null,
): string | null {
  const trimmed = lineName.trim();
  if (!trimmed) return null;
  const stock = normalizePurchasedToUsableStock({
    name: trimmed,
    namePhrase: null,
    rowPhrase: null,
    rowQuantity: quantity,
    rowUnit: unit,
  });
  if (stock.usableQuantity == null || !stock.usableUnit) return null;
  return formatQuantityWithUnit(stock.usableQuantity, stock.usableUnit);
}

function buildAliasMatchKeys(row: ConfirmedIngredientAliasRow): Set<string> {
  const keys = new Set<string>();
  const resolved = resolveNormalizedAliasFromConfirmedRow(row);
  if (resolved) keys.add(resolved);
  const normalizedAlias = row.normalized_alias?.trim().toLowerCase();
  if (normalizedAlias) keys.add(normalizedAlias);
  const foldedName = normalizeIngredientName(row.alias_name);
  if (foldedName) keys.add(foldedName);
  keys.add(buildIngredientAliasLookupKey(resolved ?? normalizedAlias ?? foldedName, row.supplier_name));
  return keys;
}

function suppliersCompatible(
  aliasSupplier: string | null,
  invoiceSupplier: string | null,
): boolean {
  if (!aliasSupplier) return true;
  if (!invoiceSupplier) return false;
  return aliasSupplier === invoiceSupplier;
}

function invoiceLineMatchesAlias(
  alias: ConfirmedIngredientAliasRow,
  itemName: string,
  invoiceSupplier: string | null,
): boolean {
  const aliasSupplier = normalizeSupplierScope(alias.supplier_name);
  if (!suppliersCompatible(aliasSupplier, invoiceSupplier)) return false;

  const itemKeys = new Set<string>();
  const folded = normalizeIngredientName(itemName);
  if (folded) itemKeys.add(folded);
  const resolvedFromLine = resolveNormalizedAliasFromConfirmedRow({
    ingredient_id: alias.ingredient_id,
    alias_name: itemName,
    normalized_alias: folded,
    supplier_name: alias.supplier_name,
  });
  if (resolvedFromLine) itemKeys.add(resolvedFromLine);

  const aliasKeys = buildAliasMatchKeys(alias);
  for (const key of itemKeys) {
    if (aliasKeys.has(key)) return true;
  }
  return false;
}

function pickLatestInvoiceUsage(
  alias: ConfirmedIngredientAliasRow,
  items: InvoiceItemScanRow[],
): { date: string | null; sample: InvoiceItemScanRow | null } {
  let bestDate: string | null = null;
  let bestSample: InvoiceItemScanRow | null = null;

  for (const item of items) {
    const invoiceSupplier = normalizeSupplierScope(item.invoices?.supplier_name ?? null);
    if (!invoiceLineMatchesAlias(alias, item.name, invoiceSupplier)) continue;

    const candidate =
      item.invoices?.invoice_date?.trim() ||
      item.created_at?.trim() ||
      null;
    if (!candidate) continue;
    if (!bestDate || candidate > bestDate) {
      bestDate = candidate;
      bestSample = item;
    }
  }

  return { date: bestDate, sample: bestSample };
}

function enrichAliasRow(
  row: IngredientAliasDbRow,
  invoiceUsage: ReturnType<typeof pickLatestInvoiceUsage>,
): IngredientOperationalAliasRow {
  const structureSource = invoiceUsage.sample?.name ?? row.alias_name;
  const structure = parsePurchaseStructureFromText(structureSource.trim());
  const sampleQty = invoiceUsage.sample?.quantity ?? null;
  const sampleUnit = invoiceUsage.sample?.unit ?? null;
  const { matchSource, matchSourceLabel } = resolveMatchSource(row);

  return {
    id: row.id,
    ingredientId: row.ingredient_id,
    aliasName: row.alias_name,
    normalizedAlias: row.normalized_alias,
    supplierName: row.supplier_name,
    confidence: Number(row.confidence),
    matchSource,
    matchSourceLabel,
    confirmedByUser: row.confirmed_by_user,
    createdAt: row.created_at,
    lastInvoiceUsageDate:
      invoiceUsage.date ?? (row.created_at ? row.created_at.slice(0, 10) : null),
    sampleInvoiceLine: invoiceUsage.sample
      ? {
          name: invoiceUsage.sample.name,
          quantity: sampleQty,
          unit: sampleUnit,
        }
      : null,
    purchaseStructureSummary: formatPurchaseStructureSummary(structure),
    usableQuantityPreview: buildUsableQuantityPreview(structureSource, sampleQty, sampleUnit),
  };
}

function filterAliasRowsForIngredient(
  ingredientId: string,
  aliasRows: IngredientAliasDbRow[],
): IngredientAliasDbRow[] {
  const trimmedId = ingredientId.trim();
  if (!trimmedId) return [];
  return aliasRows.filter((row) => row.ingredient_id === trimmedId);
}

function buildScopedConfirmedAliasMap(
  aliasRows: IngredientAliasDbRow[],
): Record<string, string> {
  return buildConfirmedAliasMapFromRows(
    aliasRows.map((row) => ({
      ingredient_id: row.ingredient_id,
      alias_name: row.alias_name,
      normalized_alias: row.normalized_alias,
      supplier_name: row.supplier_name,
    })),
  );
}

function buildMemoryKeysForIngredient(
  ingredientId: string,
  aliasMap: Record<string, string>,
  aliasRows: IngredientAliasDbRow[],
): IngredientOperationalMemoryKey[] {
  const representedKeys = new Set<string>();
  for (const row of aliasRows) {
    const resolved = resolveNormalizedAliasFromConfirmedRow({
      ingredient_id: row.ingredient_id,
      alias_name: row.alias_name,
      normalized_alias: row.normalized_alias,
      supplier_name: row.supplier_name,
    });
    if (resolved) {
      representedKeys.add(buildIngredientAliasLookupKey(resolved, row.supplier_name));
      representedKeys.add(resolved);
    }
  }

  const keys: IngredientOperationalMemoryKey[] = [];
  for (const [lookupKey, mappedIngredientId] of Object.entries(aliasMap)) {
    if (mappedIngredientId !== ingredientId) continue;
    if (representedKeys.has(lookupKey)) continue;
    const supplierSep = lookupKey.indexOf("::");
    keys.push({
      lookupKey,
      aliasName: supplierSep >= 0 ? lookupKey.slice(supplierSep + 2) : lookupKey,
      supplierName: supplierSep >= 0 ? lookupKey.slice(0, supplierSep) : null,
    });
  }
  return keys.sort((a, b) => a.lookupKey.localeCompare(b.lookupKey));
}

async function loadIngredientAliasRows(
  client: DbClient,
  ingredientId: string,
): Promise<IngredientAliasDbRow[]> {
  const { data, error } = await client
    .from("ingredient_aliases")
    .select(
      "id, ingredient_id, alias_name, normalized_alias, supplier_name, confidence, confirmed_by_user, created_at",
    )
    .eq("ingredient_id", ingredientId)
    .order("created_at", { ascending: false });

  if (error) {
    logQueryFailure("loadIngredientAliasRows", error.message);
    return [];
  }
  return (data ?? []) as IngredientAliasDbRow[];
}

async function loadRecentInvoiceItemsForMatching(client: DbClient): Promise<InvoiceItemScanRow[]> {
  const { data, error } = await client
    .from("invoice_items")
    .select(
      "name, quantity, unit, created_at, invoices!inner(invoice_date, supplier_name)",
    )
    .order("created_at", { ascending: false })
    .limit(INVOICE_ITEM_SCAN_LIMIT);

  if (error) {
    logQueryFailure("loadRecentInvoiceItemsForMatching", error.message);
    return [];
  }
  return (data ?? []) as InvoiceItemScanRow[];
}

async function assertIngredientOwnedByUser(
  client: DbClient,
  ingredientId: string,
  userId: string,
): Promise<boolean> {
  const { data, error } = await client
    .from("ingredients")
    .select("id")
    .eq("id", ingredientId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    logQueryFailure("assertIngredientOwnedByUser", error.message);
    return false;
  }
  return Boolean(data?.id);
}

/**
 * Loads supplier alias + invoice operational context for one catalog ingredient.
 * Read-only presentation data; does not mutate matcher or alias persistence.
 */
export async function loadIngredientOperationalProfile(
  client: AppSupabaseClient,
  ingredientId: string,
  userId: string,
): Promise<IngredientOperationalProfile> {
  const empty: IngredientOperationalProfile = {
    ingredientId,
    aliases: [],
    memoryKeys: [],
  };

  const trimmedId = ingredientId?.trim();
  const trimmedUser = userId?.trim();
  if (!trimmedId || !trimmedUser) return empty;

  try {
    const owned = await assertIngredientOwnedByUser(client, trimmedId, trimmedUser);
    if (!owned) return empty;

    const [aliasRows, invoiceItems] = await Promise.all([
      loadIngredientAliasRows(client, trimmedId),
      loadRecentInvoiceItemsForMatching(client),
    ]);
    const scopedAliasRows = filterAliasRowsForIngredient(trimmedId, aliasRows);
    const scopedConfirmedMap = buildScopedConfirmedAliasMap(scopedAliasRows);

    const aliases = scopedAliasRows.map((row) => {
      const usage = pickLatestInvoiceUsage(
        {
          ingredient_id: row.ingredient_id,
          alias_name: row.alias_name,
          normalized_alias: row.normalized_alias,
          supplier_name: row.supplier_name,
        },
        invoiceItems,
      );
      return enrichAliasRow(row, usage);
    });

    const memoryKeys = buildMemoryKeysForIngredient(
      trimmedId,
      scopedConfirmedMap,
      scopedAliasRows,
    );

    return { ingredientId: trimmedId, aliases, memoryKeys };
  } catch (err) {
    logQueryFailure(
      "loadIngredientOperationalProfile",
      err instanceof Error ? err.message : String(err),
    );
    return empty;
  }
}

/** @internal exported for tests */
export function buildOperationalProfileFromAliasRows(
  ingredientId: string,
  aliasRows: IngredientAliasDbRow[],
  invoiceItems: InvoiceItemScanRow[] = [],
  confirmedMap: Record<string, string> = {},
): IngredientOperationalProfile {
  const scopedAliasRows = filterAliasRowsForIngredient(ingredientId, aliasRows);
  const scopedConfirmedMap =
    Object.keys(confirmedMap).length > 0
      ? Object.fromEntries(
          Object.entries(confirmedMap).filter(([, mappedId]) => mappedId === ingredientId),
        )
      : buildScopedConfirmedAliasMap(scopedAliasRows);

  const aliases = scopedAliasRows.map((row) =>
    enrichAliasRow(
      row,
      pickLatestInvoiceUsage(
        {
          ingredient_id: row.ingredient_id,
          alias_name: row.alias_name,
          normalized_alias: row.normalized_alias,
          supplier_name: row.supplier_name,
        },
        invoiceItems,
      ),
    ),
  );
  return {
    ingredientId,
    aliases,
    memoryKeys: buildMemoryKeysForIngredient(
      ingredientId,
      scopedConfirmedMap,
      scopedAliasRows,
    ),
  };
}

function resolveCanonicalNameForIngredient(
  ingredientId: string,
  catalog: readonly IngredientCanonicalInput[],
): string | null {
  const entry = catalog.find((row) => row.id === ingredientId);
  if (!entry?.name?.trim()) return null;
  return formatCanonicalIngredientDisplayName(entry.name.trim());
}

/** Confirmed alias keys that resolve to one ingredient id (purchase-memory scan scope). */
export function filterConfirmedAliasesForIngredientId(
  confirmedAliases: IngredientAliasMap,
  ingredientId: string,
): IngredientAliasMap {
  const trimmedId = ingredientId.trim();
  if (!trimmedId) return {};
  const scoped: IngredientAliasMap = {};
  for (const [key, mappedId] of Object.entries(confirmedAliases)) {
    if (mappedId?.trim() === trimmedId) scoped[key] = trimmedId;
  }
  return scoped;
}

/** Drops invoice rows whose stored match ingredient id differs from the selected ingredient. */
export function filterMatchedInvoiceProductsForIngredient(
  products: readonly IngredientMatchedInvoiceProduct[],
  ingredientId: string,
): IngredientMatchedInvoiceProduct[] {
  const trimmedId = ingredientId.trim();
  if (!trimmedId) return [];
  return products.filter((row) => row.matchedIngredientId?.trim() === trimmedId);
}

function compareInvoiceDatesDesc(a: string | null, b: string | null): number {
  const left = a?.trim() || "";
  const right = b?.trim() || "";
  if (!left && !right) return 0;
  if (!left) return 1;
  if (!right) return -1;
  return right.localeCompare(left);
}

/**
 * Resolves live invoice lines to one catalog ingredient via the same ItemsTable matcher.
 * Read-only; does not mutate alias memory or matching rules.
 */
export function buildMatchedInvoiceProductsFromScan(
  ingredientId: string,
  catalog: readonly IngredientCanonicalInput[],
  confirmedAliases: IngredientAliasMap,
  scanRows: readonly MatchedInvoiceItemScanRow[],
  options?: { truncated?: boolean; scanLimit?: number },
): IngredientMatchedInvoiceProductsResult {
  const trimmedId = ingredientId?.trim();
  const empty: IngredientMatchedInvoiceProductsResult = {
    ingredientId: trimmedId ?? ingredientId,
    canonicalName: resolveCanonicalNameForIngredient(trimmedId ?? "", catalog),
    products: [],
    truncated: options?.truncated ?? false,
    scanLimit: options?.scanLimit ?? MATCHED_INVOICE_PRODUCTS_SCAN_LIMIT,
  };
  if (!trimmedId) return empty;

  const scopedAliases = filterConfirmedAliasesForIngredientId(confirmedAliases, trimmedId);

  const eligibleRows = scanRows
    .map((row) =>
      normalizeInvoiceItemFields({
        id: row.id,
        name: row.name,
        quantity: row.quantity,
        unit: row.unit,
        unit_price: row.unit_price,
        total: row.total,
      }),
    )
    .filter(isEligibleInvoiceIngredientRow);

  if (eligibleRows.length === 0) return empty;

  const matchCatalog = buildInvoiceMatchCatalog(
    [...catalog],
    eligibleRows.map((row) => ({ name: row.name })),
  );
  const canonicalName = resolveCanonicalNameForIngredient(trimmedId, catalog);
  const sourceById = new Map(scanRows.map((row) => [row.id, row]));
  const seenItemIds = new Set<string>();
  const products: IngredientMatchedInvoiceProduct[] = [];

  for (let index = 0; index < eligibleRows.length; index += 1) {
    const normalized = eligibleRows[index]!;
    const source = sourceById.get(normalized.id);
    if (!source || seenItemIds.has(normalized.id)) continue;

    const supplierName = normalizeSupplierScope(source.invoices?.supplier_name ?? null);
    const { match, state } = resolveInvoiceTableRowIngredientMatch(
      normalized.name,
      matchCatalog,
      scopedAliases,
      supplierName,
    );
    const matchedIngredientId = match?.ingredient.id?.trim();
    if (!match || !matchedIngredientId || matchedIngredientId !== trimmedId) continue;
    if (
      canonicalName?.trim() &&
      shouldSkipByOperationalProductFamilyGate(normalized.name, canonicalName)
    ) {
      continue;
    }

    const bucket = invoiceRowMatchSummaryBucket(state.displayState);
    if (bucket === "unmatched") continue;

    seenItemIds.add(normalized.id);
    const explanation = buildMatchExplanation(match, {
      confirmedAliases,
      supplierName,
    });
    const stockPresentation = resolveInvoiceLineStockPresentation(
      {
        name: normalized.name,
        quantity: normalized.quantity,
        unit: normalized.unit,
        matchedIngredientName: canonicalName,
      },
      normalized.id,
    );
    const structure = parsePurchaseStructureFromText(normalized.name.trim());

    products.push({
      matchedIngredientId: trimmedId,
      itemId: normalized.id,
      itemName: source.name.trim() || normalized.name,
      supplierName,
      invoiceDate:
        source.invoices?.invoice_date?.trim() ||
        source.created_at?.trim()?.slice(0, 10) ||
        null,
      invoiceId: source.invoice_id,
      unitPrice: normalized.unit_price,
      lineTotal: normalized.total,
      matchBucket: bucket,
      matchDisplayState: state.displayState,
      matchKind: match.kind,
      confidenceLabel: explanation.confidenceLabel,
      matchSourceHeadline: explanation.headline,
      matchSourceDetail: explanation.detail,
      purchaseStructureSummary: formatPurchaseStructureSummary(structure),
      normalizedUsableQuantityLabel: stockPresentation.quantityLabel,
    });
  }

  products.sort((a, b) => compareInvoiceDatesDesc(a.invoiceDate, b.invoiceDate));

  return {
    ingredientId: trimmedId,
    canonicalName,
    products: filterMatchedInvoiceProductsForIngredient(products, trimmedId),
    truncated: options?.truncated ?? false,
    scanLimit: options?.scanLimit ?? MATCHED_INVOICE_PRODUCTS_SCAN_LIMIT,
  };
}

export type IngredientLatestPurchaseGlance = {
  lastPurchaseAt: string | null;
  supplierLabel: string | null;
};

/**
 * Latest matched invoice purchase (date + supplier) per catalog ingredient id.
 * Uses the same live ItemsTable matcher scan as purchase memory — one pass over invoice lines.
 */
export function buildLatestPurchaseGlanceByIngredientIdFromScan(
  catalog: readonly IngredientCanonicalInput[],
  confirmedAliases: IngredientAliasMap,
  scanRows: readonly MatchedInvoiceItemScanRow[],
): Record<string, IngredientLatestPurchaseGlance> {
  const catalogIds = new Set(
    catalog.map((row) => row.id?.trim()).filter((id): id is string => Boolean(id)),
  );
  if (catalogIds.size === 0 || scanRows.length === 0) return {};

  const eligibleRows = scanRows
    .map((row) =>
      normalizeInvoiceItemFields({
        id: row.id,
        name: row.name,
        quantity: row.quantity,
        unit: row.unit,
        unit_price: row.unit_price,
        total: row.total,
      }),
    )
    .filter(isEligibleInvoiceIngredientRow);
  if (eligibleRows.length === 0) return {};

  const matchCatalog = buildInvoiceMatchCatalog(
    [...catalog],
    eligibleRows.map((row) => ({ name: row.name })),
  );
  const canonicalNameById = new Map(
    catalog
      .map((row) => [row.id?.trim() ?? "", resolveCanonicalNameForIngredient(row.id ?? "", catalog)] as const)
      .filter(([id]) => Boolean(id)),
  );
  const sourceById = new Map(scanRows.map((row) => [row.id, row]));
  const seenItemIds = new Set<string>();
  const latest: Record<string, IngredientLatestPurchaseGlance> = {};

  for (const normalized of eligibleRows) {
    const source = sourceById.get(normalized.id);
    if (!source || seenItemIds.has(normalized.id)) continue;

    const supplierName = normalizeSupplierScope(source.invoices?.supplier_name ?? null);
    const { match, state } = resolveInvoiceTableRowIngredientMatch(
      normalized.name,
      matchCatalog,
      confirmedAliases,
      supplierName,
    );
    const matchedIngredientId = match?.ingredient.id?.trim();
    if (!match || !matchedIngredientId || !catalogIds.has(matchedIngredientId)) continue;

    const canonicalName = canonicalNameById.get(matchedIngredientId);
    if (
      canonicalName?.trim() &&
      shouldSkipByOperationalProductFamilyGate(normalized.name, canonicalName)
    ) {
      continue;
    }

    const bucket = invoiceRowMatchSummaryBucket(state.displayState);
    if (bucket === "unmatched") continue;

    seenItemIds.add(normalized.id);
    const invoiceDate =
      source.invoices?.invoice_date?.trim() ||
      source.created_at?.trim()?.slice(0, 10) ||
      null;
    if (!invoiceDate) continue;

    const previous = latest[matchedIngredientId]?.lastPurchaseAt ?? null;
    if (!previous || compareInvoiceDatesDesc(previous, invoiceDate) > 0) {
      latest[matchedIngredientId] = {
        lastPurchaseAt: invoiceDate,
        supplierLabel: supplierName,
      };
    }
  }

  return latest;
}

/**
 * Latest confirmed invoice purchase date (ISO or YYYY-MM-DD) per catalog ingredient id.
 * Uses the same live ItemsTable matcher scan as purchase memory — one pass over invoice lines.
 */
export function buildLatestConfirmedPurchaseAtByIngredientIdFromScan(
  catalog: readonly IngredientCanonicalInput[],
  confirmedAliases: IngredientAliasMap,
  scanRows: readonly MatchedInvoiceItemScanRow[],
): Record<string, string | null> {
  const glance = buildLatestPurchaseGlanceByIngredientIdFromScan(
    catalog,
    confirmedAliases,
    scanRows,
  );
  const latest: Record<string, string | null> = {};
  for (const [id, entry] of Object.entries(glance)) {
    latest[id] = entry.lastPurchaseAt;
  }
  return latest;
}

export async function loadInvoiceItemsForMatchedProductScan(
  client: DbClient,
): Promise<{ rows: MatchedInvoiceItemScanRow[]; truncated: boolean }> {
  const { data, error } = await client
    .from("invoice_items")
    .select(
      "id, invoice_id, name, quantity, unit, unit_price, total, created_at, invoices!inner(invoice_date, supplier_name)",
    )
    .order("created_at", { ascending: false })
    .limit(MATCHED_INVOICE_PRODUCTS_SCAN_LIMIT);

  if (error) {
    logQueryFailure("loadInvoiceItemsForMatchedProductScan", error.message);
    return { rows: [], truncated: false };
  }

  const rows = (data ?? []) as MatchedInvoiceItemScanRow[];
  return {
    rows,
    truncated: rows.length >= MATCHED_INVOICE_PRODUCTS_SCAN_LIMIT,
  };
}

/** Clears in-memory matched-invoice cache (tests / manual refresh). */
export function clearIngredientMatchedInvoiceProductsCache(ingredientId?: string): void {
  if (!ingredientId) {
    matchedInvoiceProductsCache.clear();
    return;
  }
  matchedInvoiceProductsCache.delete(ingredientId.trim());
}

/**
 * Loads invoice lines that resolve to `ingredientId` through the live ItemsTable matcher.
 * Results are cached briefly per ingredient id.
 */
export async function loadIngredientMatchedInvoiceProducts(
  client: AppSupabaseClient,
  userId: string,
  ingredientId: string,
  catalog: readonly IngredientCanonicalInput[],
  confirmedAliases: IngredientAliasMap,
): Promise<IngredientMatchedInvoiceProductsResult> {
  const trimmedId = ingredientId?.trim();
  const trimmedUser = userId?.trim();
  const empty: IngredientMatchedInvoiceProductsResult = {
    ingredientId: trimmedId ?? ingredientId,
    canonicalName: resolveCanonicalNameForIngredient(trimmedId ?? "", catalog),
    products: [],
    truncated: false,
    scanLimit: MATCHED_INVOICE_PRODUCTS_SCAN_LIMIT,
  };
  if (!trimmedId || !trimmedUser) return empty;

  const cached = matchedInvoiceProductsCache.get(trimmedId);
  if (cached && Date.now() - cached.loadedAt < MATCHED_INVOICE_PRODUCTS_CACHE_TTL_MS) {
    return cached.result;
  }

  try {
    const owned = await assertIngredientOwnedByUser(client, trimmedId, trimmedUser);
    if (!owned) return empty;

    const { rows, truncated } = await loadInvoiceItemsForMatchedProductScan(client);
    const result = buildMatchedInvoiceProductsFromScan(
      trimmedId,
      catalog,
      confirmedAliases,
      rows,
      { truncated, scanLimit: MATCHED_INVOICE_PRODUCTS_SCAN_LIMIT },
    );
    matchedInvoiceProductsCache.set(trimmedId, { loadedAt: Date.now(), result });
    return result;
  } catch (err) {
    logQueryFailure(
      "loadIngredientMatchedInvoiceProducts",
      err instanceof Error ? err.message : String(err),
    );
    return empty;
  }
}
