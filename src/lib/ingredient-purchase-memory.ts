import { formatCurrency } from "@/lib/display-format";
import { logChronologyAudit } from "@/lib/invoice-chronology";
import { resolveInvoiceLinePurchaseFormat } from "@/lib/invoice-purchase-format";
import {
  computeEffectiveUsableCost,
  type InvoicePurchasePriceMetadata,
} from "@/lib/invoice-purchase-price-semantics";
import {
  filterMatchedInvoiceProductsForIngredient,
  type IngredientMatchedInvoiceProduct,
  type IngredientOperationalAliasRow,
} from "@/lib/ingredient-operational-intelligence";
import { normalizeSupplierDisplayName } from "@/lib/supplier-identity";

export type RecognizedSupplierProduct = {
  name: string;
};

export type RecentPurchaseRow = {
  itemId: string;
  supplierLabel: string;
  dateLabel: string;
  /** ISO issue date for operational recency (preferred over localized dateLabel). */
  dateIso?: string | null;
  priceLabel: string;
  /** Normalized comparable unit economics for intelligence (not invoice total). */
  comparablePrice: number | null;
  /** Short invoice line wording for timeline display (no ids or match metadata). */
  productHint?: string | null;
};

/** Comparable unit economics for ranking and trends — not invoice line totals. */
export function purchaseComparablePrice(row: RecentPurchaseRow): number | null {
  const price = row.comparablePrice;
  return price != null && Number.isFinite(price) ? price : null;
}

function invoiceMetadataFromProduct(
  product: IngredientMatchedInvoiceProduct,
): InvoicePurchasePriceMetadata {
  return {
    name: product.itemName,
    quantity: product.quantity,
    unit: product.unit,
    unit_price: product.unitPrice,
    total: product.lineTotal,
  };
}

function resolveComparablePurchasePrice(
  product: IngredientMatchedInvoiceProduct,
): number | null {
  const metadata = invoiceMetadataFromProduct(product);
  const unitPrice =
    product.unitPrice != null && Number.isFinite(product.unitPrice)
      ? product.unitPrice
      : null;

  if (unitPrice != null) {
    const structured = resolveInvoiceLinePurchaseFormat(metadata);
    const effective = computeEffectiveUsableCost(
      unitPrice,
      metadata,
      structured,
      product.itemName,
    );
    if (effective != null && Number.isFinite(effective.cost) && effective.cost > 0) {
      return effective.cost;
    }
    return unitPrice;
  }

  const qty =
    product.quantity != null && Number.isFinite(product.quantity) && product.quantity > 0
      ? product.quantity
      : null;
  if (product.lineTotal != null && Number.isFinite(product.lineTotal)) {
    return qty != null ? product.lineTotal / qty : product.lineTotal;
  }

  return null;
}

function normalizeProductNameKey(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function isSameIngredientScopedAlias(
  row: IngredientOperationalAliasRow,
  ingredientId: string,
): boolean {
  return row.ingredientId.trim() === ingredientId.trim();
}

function isIngredientScopedMatchedProduct(
  product: IngredientMatchedInvoiceProduct,
  ingredientId: string,
): boolean {
  return product.matchedIngredientId?.trim() === ingredientId.trim();
}

function formatPurchaseDate(value: string | null | undefined): string {
  if (!value?.trim()) return "—";
  const parsed = new Date(value.includes("T") ? value : `${value}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString("pt-PT");
}

function formatPurchasePrice(product: IngredientMatchedInvoiceProduct): string {
  if (product.lineTotal != null && Number.isFinite(product.lineTotal)) {
    return formatCurrency(product.lineTotal);
  }
  if (product.unitPrice != null && Number.isFinite(product.unitPrice)) {
    return formatCurrency(product.unitPrice);
  }
  return "—";
}

/**
 * Distinct supplier product names for one ingredient (aliases + matched invoice lines).
 * Scoped to ingredient id.
 */
export function buildRecognizedSupplierProducts(
  ingredientId: string,
  _canonicalName: string | null | undefined,
  aliases: readonly IngredientOperationalAliasRow[],
  matchedProducts: readonly IngredientMatchedInvoiceProduct[],
): RecognizedSupplierProduct[] {
  const trimmedId = ingredientId.trim();
  if (!trimmedId) return [];

  const scopedProducts = filterMatchedInvoiceProductsForIngredient(
    matchedProducts,
    trimmedId,
  );

  const seen = new Set<string>();
  const names: string[] = [];

  const addName = (raw: string | null | undefined) => {
    const name = raw?.trim();
    if (!name) return;
    const key = normalizeProductNameKey(name);
    if (seen.has(key)) return;
    seen.add(key);
    names.push(name);
  };

  for (const alias of aliases) {
    if (!isSameIngredientScopedAlias(alias, trimmedId)) continue;
    addName(alias.aliasName);
    addName(alias.sampleInvoiceLine?.name);
  }

  for (const product of scopedProducts) {
    if (!isIngredientScopedMatchedProduct(product, trimmedId)) continue;
    addName(product.itemName);
  }

  return names.sort((a, b) => a.localeCompare(b, "pt")).map((name) => ({ name }));
}

/**
 * Chronological purchase rows for one ingredient (matched invoice lines only).
 */
export function buildRecentPurchases(
  ingredientId: string,
  _canonicalName: string | null | undefined,
  matchedProducts: readonly IngredientMatchedInvoiceProduct[],
): RecentPurchaseRow[] {
  const trimmedId = ingredientId.trim();
  if (!trimmedId) return [];

  return filterMatchedInvoiceProductsForIngredient(matchedProducts, trimmedId)
    .filter((product) => isIngredientScopedMatchedProduct(product, trimmedId))
    .map((product) => {
      const row: RecentPurchaseRow = {
        itemId: product.itemId,
        supplierLabel:
          normalizeSupplierDisplayName(product.supplierName) || "Unknown supplier",
        dateLabel: formatPurchaseDate(product.invoiceDate),
        dateIso: product.invoiceIssueDateRaw ?? product.invoiceDate ?? null,
        priceLabel: formatPurchasePrice(product),
        comparablePrice: resolveComparablePurchasePrice(product),
        productHint: product.itemName?.trim() || null,
      };
      logChronologyAudit({
        surface: "ingredient_purchase_history",
        ingredientId: trimmedId,
        itemId: product.itemId,
        invoiceId: product.invoiceId,
        supplierName: product.supplierName,
        sourceInvoiceIssueDate: product.invoiceIssueDateRaw,
        displayedDate: row.dateLabel,
        persistenceTimestamp: product.invoiceCreatedAt ?? null,
        chronologySourceType: product.chronologySourceType,
        invoiceItemCreatedAt: product.itemCreatedAt ?? null,
      });
      return row;
    });
}

export function purchaseMemorySummary(
  recognizedCount: number,
  purchaseCount: number,
): string {
  const parts: string[] = [];
  if (recognizedCount > 0) {
    parts.push(
      `${recognizedCount} product${recognizedCount === 1 ? "" : "s"}`,
    );
  }
  if (purchaseCount > 0) {
    parts.push(
      `${purchaseCount} purchase${purchaseCount === 1 ? "" : "s"}`,
    );
  }
  return parts.join(" · ") || "No purchase history yet";
}
