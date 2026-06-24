import { createFileRoute, useRouterState } from "@tanstack/react-router";
import { AppShell, Card } from "@/components/AppShell";
import {
  UploadCloud,
  FileText,
  Sparkles,
  Check,
  Loader2,
  ImageIcon,
  Eye,
  Trash2,
  X,
  ChevronDown,
  ChevronRight,
  Wand2,
} from "lucide-react";
import { toast } from "sonner";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  buildInvoiceKpiSummaryCards,
  collectAvailableInvoiceMonths,
  formatInvoiceMonthLabel,
  resolveDefaultInvoiceKpiMonth,
  type InvoiceKpiSummaryCard,
} from "@/lib/invoice-kpi-summary";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { normalizeIngredientName } from "@/lib/normalizeIngredient";
import { type UnitInferenceResult, type PackageType } from "@/lib/ingredient-unit-inference";
import {
  formatStructuredPurchaseDisplay,
  hasRichPackageSemantics,
  isCollapsedMeaninglessPurchaseLabel,
  preserveCountableExtractedUnit,
  resolveInvoicePersistedItemUnit,
  resolveInvoiceLinePurchaseFormat,
  resolveInvoiceLineStockPresentation,
  resolveInvoicePurchaseDisplayLabel,
} from "@/lib/invoice-purchase-format";
import {
  deriveMathematicalReconciliationReviewReason,
  deriveOcrQtyMismatchReviewReason,
  MATHEMATICAL_RECONCILIATION_FAILURE_MESSAGE,
  needsMathematicalReconciliationReview,
  needsOcrQtyMismatchReview,
  OCR_QUANTITY_MISMATCH_MESSAGE,
  type InvoiceOcrQtyExtractionMeta,
} from "@/lib/invoice-extraction-review";
import {
  deriveInvoiceRowInlineChips,
  resolveInvoiceLinePricingPresentation,
  type InvoiceLineNormalizationCard,
} from "@/lib/invoice-purchase-price-semantics";
import { formatQuantityWithUnit } from "@/lib/display-format";
import {
  normalizeInvoiceIngredientName,
  type IngredientAliasMap,
  type IngredientCanonicalMatch,
} from "@/lib/ingredient-canonical";
import { loadMatchingIngredientCatalog } from "@/lib/ingredient-catalog-load";
import {
  buildMatchExplanation,
  buildMatchTargetLabel,
  formatMatchTargetLabel,
  formatMatchReasoningTooltip,
  type MatchReasoning,
} from "@/lib/ingredient-match-explanation";
import { buildInvoiceMatchCatalog } from "@/lib/ingredient-canonical-synthesis";
import {
  invoiceRowMatchSummaryBucket,
  resolveInvoiceTableRowIngredientMatch,
} from "@/lib/invoice-ingredient-row-display";
import {
  buildCutoverContextForInvoiceItem,
  buildPersistedMatchMapFromRows,
} from "@/lib/invoice-item-match-read-cutover";
import {
  getInvoiceItemMatchesByInvoiceId,
  getInvoiceItemMatchesForItemIds,
} from "@/lib/invoice-item-match-repository";
import { isMatchLifecycleReadCutoverEnabled } from "@/lib/match-lifecycle-flags";
import { traceInvoiceIngredientMatchPipeline } from "@/lib/invoice-ingredient-match-trace";
import {
  getAliasTraceCompareBucket,
  traceIngredientAliases,
  traceIngredientAliasesCatch,
} from "@/lib/ingredient-aliases-trace";
import {
  cleanInvoiceItemDisplayName,
  normalizeInvoiceItemFields,
  normalizeInvoiceUnitToken,
  shouldRejectInvoiceIngredientRow,
} from "@/lib/invoice-item-fields";
import {
  fileToExtractionDataUrl,
  isExtractableFile,
  isExtractableInvoicePath,
  isPdfFile,
} from "@/lib/invoice-extraction-input";
import {
  countUnresolvedInvoiceIngredients,
  countUnresolvedInvoiceIngredientsByInvoice,
  deriveInvoiceListIngredientStatus,
} from "@/lib/invoice-unresolved-ingredient-count";
import {
  buildKnownSupplierNames,
  deriveInvoiceLineOperationalSignals,
  isNewSupplierForInvoice,
} from "@/lib/ingredient-operational-signals";
import {
  emptyInvoiceOperationalMetadata,
  loadIngredientPriceFieldsById,
  loadInvoiceOperationalMetadata,
  mergeIngredientPriceFields,
  type InvoiceOperationalMetadata,
} from "@/lib/invoice-operational-metadata";
import {
  compareAliasMapsForDesync,
  traceAliasMapSnapshot,
  traceAliasPersistCycle,
} from "@/lib/alias-state-trace";
import { loadConfirmedIngredientAliasMap } from "@/lib/ingredient-alias-memory";
import {
  createIngredientAliasPersistQueue,
  mergeConfirmedAliasMapsAfterReload,
} from "@/lib/ingredient-alias-persist-queue";
import { traceManualIngredientMatch } from "@/lib/manual-ingredient-match-trace";
import {
  buildManualIngredientCorrectionKeys,
  persistManualIngredientCorrection,
  rejectIngredientMatchPair,
  resolveIngredientCorrectionUiState,
} from "@/lib/ingredient-correction-memory";
import {
  ensureRejectedIngredientMatchesHydrated,
  hydrateRejectedIngredientMatchesFromStorage,
  persistRejectedIngredientMatchesToStorage,
} from "@/lib/ingredient-rejected-match-memory";
import { hydrateIngredientMatchOverridesFromAliasRows } from "@/lib/ingredient-match-override";
import { hydrateOperationalAliasMemoryFromConfirmedMap } from "@/lib/ingredient-operational-alias-memory";
import { IngredientCorrectionActions } from "@/components/invoice-ingredient-correction";
import { InvoiceIngredientCorrectionPicker } from "@/components/invoice-ingredient-correction-picker";
import {
  CanonicalIngredientCreateDialog,
  type CanonicalIngredientCreateSubmitValues,
} from "@/components/canonical-ingredient-create-dialog";
import {
  BulkCanonicalIngredientCreateSheet,
  type BulkCanonicalIngredientCreateSubmitRow,
} from "@/components/bulk-canonical-ingredient-create-sheet";
import { buildCanonicalIngredientCreateDefaults } from "@/lib/canonical-ingredient-create";
import {
  buildBulkSubmitValuesFromDefaults,
  collectUnmatchedRowsForBulkCreate,
  executeBulkCanonicalIngredientCreate,
  saveCanonicalIngredientFromInvoiceRow,
} from "@/lib/bulk-canonical-ingredient-create";
import { buildIngredientPickerOptionsForInvoice } from "@/lib/ingredient-picker-options";
import {
  isIngredientPickerTraceEnabled,
  traceIngredientPickerCatalogStage,
  traceIngredientPickerOptionsStage,
} from "@/lib/ingredient-picker-trace";
import {
  autoPersistUnmatchedInvoiceItems,
  persistOperationalIngredientCostFromInvoiceLine,
} from "@/lib/ingredient-auto-persist";
import {
  collectIngredientIdsForInvoiceHistory,
  reconcileAfterInvoiceDelete,
} from "@/lib/ingredient-price-history-reconcile";
import { syncIngredientProcurementPrice } from "@/lib/ingredient-procurement-price-sync";
import { traceCanonicalCreateAttempt } from "@/lib/ingredient-catalog-diagnostics";
import { traceFoodCostRecalculationSource } from "@/lib/recipe-canonical-graph-trace";
import {
  clearIngredientMatchedInvoiceProductsCache,
  syncOperationalIngredientCostsFromInvoiceLines,
} from "@/lib/ingredient-operational-intelligence";
import { shadowSeedInvoiceItemMatchesAfterExtract } from "@/lib/invoice-item-match-shadow-seed";
import {
  confirmMatch,
  correctMatch,
  reassignMatch,
} from "@/lib/match-lifecycle-service";
import { subtractivePricingCleanupForReassign } from "@/lib/match-lifecycle-reassign-pricing";
import { unmatchInvoiceLineMatch } from "@/lib/match-lifecycle-unmatch";
import { dispatchOperationalIngredientCostChanged } from "@/lib/resolve-operational-ingredient-cost";
import {
  fileNameFromInvoicePath,
  looksLikeUploadedFileName,
  normalizeInvoiceDate,
  normalizeInvoiceNumber,
  normalizeSupplierDisplayName,
} from "@/lib/supplier-identity";
import { ConfirmDeleteDialog } from "@/components/confirm-delete-dialog";

type IngredientSelectLifecycleOptions = {
  previousIngredientId?: string | null;
  wasConfirmed?: boolean;
};

async function dualWriteMatchLifecycleAfterIngredientPersist(params: {
  item: { id: string };
  ingredientId: string;
  invoiceId: string;
  userId: string;
  matchKind?: string | null;
  lifecycle?: IngredientSelectLifecycleOptions;
}): Promise<void> {
  const { item, ingredientId, invoiceId, userId, matchKind, lifecycle } = params;
  try {
    if (
      lifecycle?.previousIngredientId &&
      lifecycle.previousIngredientId !== ingredientId
    ) {
      const result = lifecycle.wasConfirmed
        ? await reassignMatch(supabase, {
            invoiceItemId: item.id,
            userId,
            invoiceId,
            newIngredientId: ingredientId,
            previousIngredientId: lifecycle.previousIngredientId,
          })
        : await correctMatch(supabase, {
            invoiceItemId: item.id,
            userId,
            invoiceId,
            newIngredientId: ingredientId,
            previousIngredientId: lifecycle.previousIngredientId,
            keepConfirmed: false,
          });
      if (result.error) {
        console.error(
          "[invoices] match lifecycle correct dual-write failed:",
          item.id,
          result.error.message,
        );
      }
      return;
    }

    const result = await confirmMatch(supabase, {
      invoiceItemId: item.id,
      userId,
      invoiceId,
      ingredientId,
      matchKind: matchKind ?? "manual",
    });
    if (result.error) {
      console.error(
        "[invoices] match lifecycle confirm dual-write failed:",
        item.id,
        result.error.message,
      );
    }
  } catch (err) {
    console.error("[invoices] match lifecycle dual-write unexpected error:", item.id, err);
  }
}

export const Route = createFileRoute("/invoices")({
  head: () => ({
    meta: [
      { title: "Invoices — Marginly" },
      { name: "description", content: "Upload supplier invoices and let AI extract line items." },
    ],
  }),
  component: InvoicesPage,
});

type InvoiceRow = {
  id: string;
  supplier_name: string;
  sourceFileName: string | null;
  supplierIsFallback: boolean;
  invoiceNumber: string | null;
  invoiceDate: string | null;
  displayDate: string;
  timelineDate: string;
  total: number;
  status: string;
  items_count: number;
  file_url: string | null;
  created_at: string;
};

type DbInvoiceRow = {
  id: string;
  supplier_name: string | null;
  invoice_date: string | null;
  total: number | null;
  file_url: string | null;
  created_at: string | null;
  settlement_status: string | null;
};

type Pending = {
  id: string;
  file: File;
  previewUrl: string;
  progress: number;
  status: "queued" | "uploading" | "done" | "error";
  error?: string;
};

type SortOption = "newest" | "oldest" | "supplier" | "highest" | "lowest" | "status";
type SettlementState = "pending" | "settled";

const MAX_BYTES = 20 * 1024 * 1024;
const ACCEPT = ["application/pdf", "image/png", "image/jpeg", "image/webp"];

function createPendingId(): string {
  return (
    globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
}

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: "newest", label: "Newest" },
  { value: "oldest", label: "Oldest" },
  { value: "supplier", label: "Supplier" },
  { value: "highest", label: "Highest value" },
  { value: "status", label: "Status" },
];

const invoiceIdentityStorageKey = (userId: string) => `marginly:invoice-identities:${userId}`;

type ItemRow = {
  id: string;
  name: string;
  quantity: number | null;
  unit: string | null;
  unit_price: number | null;
  total: number | null;
};

type PreviousInvoiceRow = {
  id: string;
};

type PreviousItemRow = {
  invoice_id: string | null;
  name: string | null;
  unit_price: number | null;
};

type IngredientMatchRow = {
  id: string;
  name: string | null;
  normalized_name?: string | null;
  unit?: string | null;
  current_price?: number | null;
  updated_at?: string | null;
};

type PriceComparisonMap = Record<string, number>;
type IngredientCreationState = Record<string, boolean>;
type IngredientCreationErrors = Record<string, string>;
type InvoiceIdentityMeta = {
  supplierName?: string | null;
  invoiceNumber?: string | null;
  invoiceDate?: string | null;
  sourceFileName?: string | null;
};
type InvoiceIdentityState = Record<string, InvoiceIdentityMeta>;
type InvoiceIdentityTrace = Record<string, string | number | boolean | null | undefined>;
type PriceDeltaDetails = {
  direction: "increased" | "decreased" | "stable";
  percentLabel: string;
  previousLabel: string;
};
const traceInvoiceIdentity = (stage: string, details: InvoiceIdentityTrace) => {
  if (!import.meta.env.DEV) return;
  console.debug("[invoice-list]", stage, details);
};

const traceInvoiceDatePersistence = (stage: string, details: InvoiceIdentityTrace) => {
  if (!import.meta.env.DEV) return;
  console.debug("[invoice-date]", stage, details);
};

const traceInvoiceRender = (stage: string, details: unknown) => {
  if (!import.meta.env.DEV) return;
  console.debug("[invoice-render]", stage, details);
};

const QUANTITY_TRACE_KEYS = [
  "quantity",
  "quantity_value",
  "parsed_quantity",
  "usable_quantity",
  "unit",
  "purchase_unit",
  "unit_name",
  "pack_quantity",
  "stock_added",
  "unit_price",
  "total",
];

const traceInvoiceQuantityStage = (
  stage: string,
  item: unknown,
  extra?: Record<string, unknown>,
) => {
  if (!import.meta.env.DEV || !item || typeof item !== "object") return;

  const row = item as Record<string, unknown>;
  const relatedKeys = Object.keys(row).filter((key) =>
    /quantity|qty|unit|pack|stock|usable/i.test(key),
  );
  const keys = [...new Set(["id", "name", ...QUANTITY_TRACE_KEYS, ...relatedKeys])];
  const fields = keys.reduce<Record<string, unknown>>((acc, key) => {
    if (key in row) acc[key] = row[key];
    return acc;
  }, {});

  console.debug("[invoice-quantity]", stage, { ...extra, fields });
};

const formatInvoiceDate = (createdAt: string | null) => {
  if (!createdAt) return "—";
  const date = new Date(createdAt);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString();
};

const invoiceTime = (createdAt: string) => {
  const time = new Date(createdAt).getTime();
  return Number.isNaN(time) ? 0 : time;
};

const safeSortString = (value: unknown) => String(value ?? "").trim();

const compareSortStrings = (a: unknown, b: unknown) =>
  safeSortString(a).localeCompare(safeSortString(b), undefined, { sensitivity: "base" });

const normalizeSettlementStatus = (value: string | null | undefined): SettlementState =>
  value === "settled" ? "settled" : "pending";

const getSettlementState = (
  invoiceId: string,
  settlementByInvoice: Record<string, SettlementState>,
) => settlementByInvoice[invoiceId] ?? "pending";

const invoiceSubtitle = (row: InvoiceRow) => {
  if (row.invoiceNumber) return row.invoiceNumber;
  if (row.supplierIsFallback && row.sourceFileName) return "Uploaded file";
  return null;
};

const toInvoiceRow = (
  row: DbInvoiceRow,
  itemCount = 0,
  identityMeta?: InvoiceIdentityMeta,
): InvoiceRow => {
  const total = Number(row.total ?? 0);
  const sourceFileName = identityMeta?.sourceFileName ?? fileNameFromInvoicePath(row.file_url);
  const supplierCandidate = identityMeta?.supplierName ?? row.supplier_name;
  const normalizedSupplier = normalizeSupplierDisplayName(supplierCandidate);
  const supplierIsFallback =
    !normalizedSupplier || looksLikeUploadedFileName(normalizedSupplier, sourceFileName);
  const supplier = supplierIsFallback
    ? (sourceFileName ?? normalizedSupplier ?? "Unknown supplier")
    : normalizedSupplier;
  const invoiceDate = normalizeInvoiceDate(identityMeta?.invoiceDate ?? row.invoice_date);
  const timelineDate = invoiceDate ?? row.created_at ?? "";
  const invoiceRow = {
    id: row.id,
    supplier_name: supplier,
    sourceFileName,
    supplierIsFallback,
    invoiceNumber: normalizeInvoiceNumber(identityMeta?.invoiceNumber),
    invoiceDate,
    displayDate: formatInvoiceDate(timelineDate),
    timelineDate,
    total,
    status: itemCount > 0 || total > 0 ? "Processed" : "Review",
    items_count: itemCount,
    file_path: row.file_url,
    created_at: row.created_at ?? "",
  };
  traceInvoiceIdentity("resolved-row", {
    invoiceId: row.id,
    extractedSupplierName: identityMeta?.supplierName,
    extractedInvoiceNumber: identityMeta?.invoiceNumber,
    extractedInvoiceDate: identityMeta?.invoiceDate,
    persistedInvoiceDate: row.invoice_date,
    persistedSupplierName: row.supplier_name,
    sourceFileName,
    renderedSupplier: invoiceRow.supplier,
    renderedInvoiceNumber: invoiceRow.invoiceNumber,
    renderedDate: invoiceRow.displayDate,
    usedFallback: invoiceRow.supplierIsFallback,
  });
  traceInvoiceDatePersistence("render-resolved-date", {
    invoiceId: row.id,
    identityInvoiceDate: identityMeta?.invoiceDate,
    persistedInvoiceDate: row.invoice_date,
    normalizedInvoiceDate: invoiceDate,
    displayedDate: invoiceRow.displayDate,
  });
  return invoiceRow;
};

const normalizeExtractedItemName = (name: string | null | undefined) =>
  name?.trim().toLowerCase() ?? "";

const isPlaceholderItemName = (name: string) => {
  const normalizedName = normalizeExtractedItemName(name);
  return !normalizedName || normalizedName === "unknown";
};

const needsQuantityUnitConfirmation = (item: ItemRow) => {
  if (item.quantity != null && item.unit) return false;
  return !hasClearInferredQuantityUnit(item);
};

const needsAmountConfirmation = (item: ItemRow) => item.unit_price == null || item.total == null;

const needsExtractionConfirmation = (
  item: ItemRow,
  ocrMeta?: InvoiceOcrQtyExtractionMeta | null,
) =>
  isPlaceholderItemName(item.name) ||
  needsQuantityUnitConfirmation(item) ||
  needsAmountConfirmation(item) ||
  needsMathematicalReconciliationReview(item) ||
  needsOcrQtyMismatchReview(ocrMeta);

const GENERIC_UNIT_TOKENS = new Set(["un", "unit", "units", "und", "unds", "unid", "unids"]);
const RECIPE_COMPATIBLE_DISPLAY_UNITS = new Set(["kg", "g", "ml", "l"]);

const isGenericUnit = (unit: string | null | undefined) => {
  const normalized = unit?.trim().toLowerCase();
  return !normalized || GENERIC_UNIT_TOKENS.has(normalized);
};

const getRecipeCompatibleUnit = (unit: string | null | undefined) => {
  const normalized = unit?.trim().toLowerCase();
  if (normalized === "l") return "L";
  return normalized && RECIPE_COMPATIBLE_DISPLAY_UNITS.has(normalized) ? normalized : null;
};

const getDisplayPurchaseUnit = (unit: string | null | undefined) => {
  const normalized = normalizeInvoiceUnitToken(unit);
  if (!normalized) return null;
  if (isGenericUnit(normalized)) return "units";
  if (normalized === "cx") return "cases";
  if (normalized === "dz") return "dozens";
  if (normalized === "mo") return "bunches";
  if (normalized === "em") return "packs";
  return normalized;
};

const formatPurchaseCount = (value: number) => {
  const rounded = Number.isInteger(value) ? String(value) : value.toFixed(2);
  return rounded;
};

type InvoicePurchaseContext = Pick<ItemRow, "name" | "quantity" | "unit"> & {
  matchedIngredientName?: string | null;
};

const resolveItemPurchaseFormat = (item: InvoicePurchaseContext) =>
  resolveInvoiceLinePurchaseFormat({
    name: item.name,
    quantity: item.quantity,
    unit: item.unit,
    matchedIngredientName: item.matchedIngredientName ?? null,
  });

const hasClearInferredQuantityUnit = (item: Pick<ItemRow, "name" | "quantity" | "unit">) => {
  const inferred = resolveItemPurchaseFormat(item).inferred;
  const hasUsableInference =
    inferred.confidence >= 0.86 &&
    inferred.purchase_quantity > 0 &&
    inferred.purchase_unit != null &&
    inferred.base_unit != null;
  if (!hasUsableInference) return false;
  if (item.quantity == null) {
    return inferred.purchase_unit_count > 1 || inferred.size_is_metadata_only;
  }
  return isGenericUnit(item.unit) || !item.unit;
};

const resolveUnitDrivenQuantity = (
  item: Pick<ItemRow, "quantity">,
  inferred: UnitInferenceResult,
) => {
  const rowQuantity = Number(item.quantity);
  const inferredUnits = Math.max(
    1,
    inferred.normalized_stock_quantity ?? inferred.purchase_quantity,
  );

  if (!Number.isFinite(rowQuantity) || rowQuantity <= 0) return inferredUnits;
  if (Math.abs(rowQuantity - inferredUnits) < 0.01) return rowQuantity;
  if (inferred.package_type) return Math.max(1, rowQuantity * inferredUnits);
  return inferredUnits;
};

const formatUnitSizeMetadata = (inferred: UnitInferenceResult) => {
  if (inferred.pack_size == null || !inferred.pack_size_unit) return null;
  return `${formatOperationalQuantityWithUnit(inferred.pack_size, inferred.pack_size_unit)} each`;
};

const PACKAGE_TYPE_LABELS: Record<PackageType, { singular: string; plural: string }> = {
  pack: { singular: "pack", plural: "packs" },
  caixa: { singular: "case", plural: "cases" },
  garrafa: { singular: "bottle", plural: "bottles" },
  lata: { singular: "can", plural: "cans" },
  saco: { singular: "bag", plural: "bags" },
};

const resolvePackageLabel = (
  packageType: PackageType | null,
  stockUnit: string | null,
): { singular: string; plural: string } => {
  if (packageType) return PACKAGE_TYPE_LABELS[packageType];
  if (stockUnit === "ml") return PACKAGE_TYPE_LABELS.garrafa;
  return PACKAGE_TYPE_LABELS.pack;
};

const formatPackageCount = (
  value: number,
  packageType: PackageType | null,
  stockUnit: string | null,
) => {
  const label = resolvePackageLabel(packageType, stockUnit);
  return `${formatPurchaseCount(value)} ${value === 1 ? label.singular : label.plural}`;
};

const formatOperationalQuantityWithUnit = (value: number, unit: string | null | undefined) => {
  const normalizedUnit = unit?.trim().toLowerCase();
  if (normalizedUnit === "g" && Math.abs(value) >= 1000) {
    return formatQuantityWithUnit(value / 1000, "kg");
  }
  if (normalizedUnit === "ml" && Math.abs(value) >= 1000) {
    return formatQuantityWithUnit(value / 1000, "L");
  }
  return formatQuantityWithUnit(value, unit);
};

const normalizeDisplayName = (name: string) =>
  name.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

const inferDisplayUnitNoun = (name: string) => {
  const normalizedName = normalizeDisplayName(name);
  if (/\b(patty|patties|hamburguer|hamburger)\b/.test(normalizedName)) return "patties";
  if (/\b(bun|buns|brioche|pao|bread|baguette|croissant|wrap|wraps)\b/.test(normalizedName)) {
    return "pieces";
  }
  if (/\b(can|cans|lata|latas)\b/.test(normalizedName)) return "cans";
  if (/\b(bottle|bottles|garrafa|garrafas)\b/.test(normalizedName)) return "bottles";
  return null;
};

const formatPackSize = (inferred: UnitInferenceResult) => {
  if (inferred.pack_size == null || !inferred.pack_size_unit) return null;
  return formatOperationalQuantityWithUnit(inferred.pack_size, inferred.pack_size_unit);
};

const resolveInvoiceItemUnit = (item: Pick<ItemRow, "name" | "unit" | "quantity">) =>
  resolveInvoicePersistedItemUnit(item, isGenericUnit);

const pickUnitTracePayload = (item: {
  name?: unknown;
  quantity?: unknown;
  unit?: unknown;
}) => ({
  name: String(item.name ?? ""),
  quantity:
    typeof item.quantity === "number"
      ? item.quantity
      : item.quantity == null
        ? null
        : Number.isFinite(Number(item.quantity))
          ? Number(item.quantity)
          : null,
  unit: item.unit == null || item.unit === "" ? null : String(item.unit),
});

const traceUnitForAllItems = (
  stage: "OCR" | "NORMALIZED" | "RESOLVE_INPUT" | "RESOLVE_OUTPUT" | "INSERT",
  items: Array<{ name?: unknown; quantity?: unknown; unit?: unknown }>,
  extra?: Record<string, unknown>,
) => {
  if (!import.meta.env.DEV) return;
  items.forEach((item, index) => {
    console.debug(`[UNIT_TRACE] ${stage}`, {
      index,
      ...pickUnitTracePayload(item),
      ...extra,
    });
  });
};

const traceUnitResolveForAllItems = (items: ItemRow[], extra?: Record<string, unknown>) => {
  if (!import.meta.env.DEV) return;
  items.forEach((it, index) => {
    const name = String(it.name ?? "Unknown");
    const fields = pickUnitTracePayload({ name, quantity: it.quantity, unit: it.unit });
    console.debug("[UNIT_TRACE] RESOLVE_INPUT", { index, ...fields, ...extra });
    const resolvedUnit = resolveInvoiceItemUnit({
      name,
      quantity: it.quantity,
      unit: it.unit,
    });
    console.debug("[UNIT_TRACE] RESOLVE_OUTPUT", {
      index,
      ...fields,
      unit: resolvedUnit,
      ...extra,
    });
  });
};

const getInvoiceItemPurchaseLabel = (item: InvoicePurchaseContext) => {
  const structured = resolveItemPurchaseFormat(item);
  const structuredLabel = resolveInvoicePurchaseDisplayLabel({
    name: item.name,
    quantity: item.quantity,
    unit: item.unit,
    matchedIngredientName: item.matchedIngredientName ?? null,
  });
  if (structuredLabel && !isCollapsedMeaninglessPurchaseLabel(structuredLabel)) {
    return structuredLabel;
  }

  const structuredDisplay = formatStructuredPurchaseDisplay(structured);
  if (structuredDisplay) return structuredDisplay;
  const inferred = structured.inferred;
  const rowQuantity = Number(item.quantity);
  const hasPositiveQuantity = Number.isFinite(rowQuantity) && rowQuantity > 0;

  if (inferred.size_is_metadata_only && inferred.stock_unit === "un") {
    const sizeLabel = formatPackSize(inferred);
    const unitQuantity = resolveUnitDrivenQuantity(item, inferred);
    const unitNoun = inferDisplayUnitNoun(item.name);
    if (sizeLabel) {
      return `${formatPurchaseCount(unitQuantity)} × ${sizeLabel}${unitNoun ? ` ${unitNoun}` : ""}`;
    }
    return formatQuantityWithUnit(unitQuantity, "units");
  }

  if (inferred.normalized_stock_quantity != null && inferred.stock_unit) {
    const purchaseQuantity = hasPositiveQuantity ? rowQuantity : 1;
    const sizeLabel = formatPackSize(inferred);
    if (sizeLabel) {
      if (inferred.purchase_unit_count > 1 && !inferred.package_type) {
        const unitNoun = inferDisplayUnitNoun(item.name);
        return `${formatPurchaseCount(inferred.purchase_unit_count)} × ${sizeLabel}${
          unitNoun ? ` ${unitNoun}` : ""
        }`;
      }
      return `${formatPackageCount(
        purchaseQuantity,
        inferred.package_type,
        inferred.stock_unit,
      )} × ${sizeLabel}`;
    }
    return formatPackageCount(purchaseQuantity, inferred.package_type, inferred.stock_unit);
  }

  const hint = inferred.conversion_hint;
  if (hint) {
    const purchaseQuantity = hasPositiveQuantity ? rowQuantity : 1;
    return `${formatPurchaseCount(purchaseQuantity)} ${hint.purchase_unit}`;
  }

  if (item.quantity == null) return null;
  const unit = getDisplayPurchaseUnit(item.unit);
  const rowFallback = unit
    ? formatOperationalQuantityWithUnit(item.quantity, unit)
    : formatPurchaseCount(item.quantity);
  if (isCollapsedMeaninglessPurchaseLabel(rowFallback) && hasRichPackageSemantics(structured)) {
    return structuredDisplay ?? rowFallback;
  }
  return rowFallback;
};

const getInvoiceItemStockPresentation = (
  item: Pick<ItemRow, "id" | "name" | "quantity" | "unit">,
  matchedIngredientName?: string | null,
) => {
  const presentation = resolveInvoiceLineStockPresentation(
    {
      name: item.name,
      quantity: item.quantity,
      unit: item.unit,
      matchedIngredientName: matchedIngredientName ?? null,
    },
    item.id,
  );
  if (!presentation.quantityLabel) return null;
  return {
    quantityLabel: presentation.quantityLabel,
    detailLabel: presentation.detailLabel,
  };
};

const removeKey = <T,>(record: Record<string, T>, key: string) => {
  const next = { ...record };
  delete next[key];
  return next;
};

const getPriceDeltaDetails = (
  currentPrice: number | null,
  previousPrice: number | undefined,
): PriceDeltaDetails | null => {
  const current = Number(currentPrice);
  const previous = Number(previousPrice);
  if (!Number.isFinite(current) || !Number.isFinite(previous) || previous <= 0) return null;

  const percent = Math.round(((current - previous) / previous) * 100);
  const direction = percent > 0 ? "increased" : percent < 0 ? "decreased" : ("stable" as const);

  return {
    direction,
    percentLabel: percent === 0 ? "0%" : `${percent > 0 ? "+" : ""}${percent}%`,
    previousLabel: `Previous €${previous.toFixed(2)}`,
  };
};

function InvoicesPage() {
  const { user, loading: authLoading } = useAuth();
  if (user?.id) {
    ensureRejectedIngredientMatchesHydrated(user.id);
  }
  const inputRef = useRef<HTMLInputElement>(null);
  const [drop, setDrop] = useState(false);
  const [pending, setPending] = useState<Pending[]>([]);
  const [rows, setRows] = useState<InvoiceRow[]>([]);
  const [invoicesLoading, setInvoicesLoading] = useState(true);
  const [hasLoadedInvoicesOnce, setHasLoadedInvoicesOnce] = useState(false);
  const isLoadingInvoices = authLoading || invoicesLoading || (!!user && !hasLoadedInvoicesOnce);
  const showInvoiceTableLoading = isLoadingInvoices && rows.length === 0;
  const showInvoiceTableEmpty = !isLoadingInvoices && rows.length === 0 && hasLoadedInvoicesOnce;
  const [preview, setPreview] = useState<{ url: string; type: string; name: string } | null>(null);
  const [pendingDeleteRow, setPendingDeleteRow] = useState<InvoiceRow | null>(null);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [itemsByInvoice, setItemsByInvoice] = useState<Record<string, ItemRow[]>>({});
  const [priceComparisonsByInvoice, setPriceComparisonsByInvoice] = useState<
    Record<string, PriceComparisonMap>
  >({});
  const [ingredientCatalog, setIngredientCatalog] = useState<IngredientMatchRow[]>([]);
  const [invoiceOperationalMetadata, setInvoiceOperationalMetadata] =
    useState<InvoiceOperationalMetadata>(emptyInvoiceOperationalMetadata());
  const [confirmedIngredientAliases, setConfirmedIngredientAliases] = useState<IngredientAliasMap>(
    {},
  );
  const confirmedIngredientAliasesRef = useRef<IngredientAliasMap>({});
  const aliasPersistQueueRef = useRef(createIngredientAliasPersistQueue());
  const [, setInvoiceIdentities] = useState<InvoiceIdentityState>({});
  const invoiceIdentitiesRef = useRef<InvoiceIdentityState>({});
  const [creatingIngredientByItem, setCreatingIngredientByItem] = useState<IngredientCreationState>(
    {},
  );
  const [ingredientCreationErrors, setIngredientCreationErrors] =
    useState<IngredientCreationErrors>({});
  const [canonicalCreateContext, setCanonicalCreateContext] = useState<{
    item: ItemRow;
    supplierName: string | null;
    invoiceId: string;
  } | null>(null);
  const [canonicalCreateError, setCanonicalCreateError] = useState<string | null>(null);
  const [canonicalCreateSaving, setCanonicalCreateSaving] = useState(false);
  const [rejectedMatchItemIds, setRejectedMatchItemIds] = useState<Set<string>>(() => new Set());
  const [extracting, setExtracting] = useState<Record<string, boolean>>({});
  const [extractionMetaByItemId, setExtractionMetaByItemId] = useState<
    Record<string, InvoiceOcrQtyExtractionMeta>
  >({});
  const extractionInFlightRef = useRef<Record<string, boolean>>({});
  const [sortBy, setSortBy] = useState<SortOption>("newest");
  const [selectedKpiMonth, setSelectedKpiMonth] = useState<string | null>(null);
  const [settlementByInvoice, setSettlementByInvoice] = useState<Record<string, SettlementState>>(
    {},
  );
  const settlementByInvoiceRef = useRef<Record<string, SettlementState>>({});
  const invoiceLoadSeqRef = useRef(0);
  const hasLoadedInvoicesOnceRef = useRef(false);
  const autoPersistAttemptedRef = useRef<Set<string>>(new Set());
  const allInvoiceItemsRef = useRef<Record<string, ItemRow[]>>({});
  const [unresolvedIngredientCountByInvoice, setUnresolvedIngredientCountByInvoice] = useState<
    Record<string, number>
  >({});
  const [persistedMatchByItemId, setPersistedMatchByItemId] = useState<
    Map<string, import("@/lib/invoice-item-match-read-cutover").PersistedMatchForCutover>
  >(() => new Map());
  const persistedMatchByItemIdRef = useRef(persistedMatchByItemId);

  useEffect(() => {
    settlementByInvoiceRef.current = settlementByInvoice;
  }, [settlementByInvoice]);

  const supplierNameByInvoiceId = useMemo(
    () => Object.fromEntries(rows.map((row) => [row.id, row.supplier_name])),
    [rows],
  );

  useEffect(() => {
    persistedMatchByItemIdRef.current = persistedMatchByItemId;
  }, [persistedMatchByItemId]);

  const buildPersistedMatchMapsByInvoice = useCallback(
    (
      itemsMap: Record<string, ItemRow[]>,
      matchMap: ReadonlyMap<
        string,
        import("@/lib/invoice-item-match-read-cutover").PersistedMatchForCutover
      >,
    ) => {
      return Object.fromEntries(
        Object.keys(itemsMap).map((invoiceId) => [invoiceId, matchMap]),
      );
    },
    [],
  );

  const refreshUnresolvedIngredientCounts = useCallback(
    (itemsMap: Record<string, ItemRow[]>) => {
      if (ingredientCatalog.length === 0) return;
      const matchMap = persistedMatchByItemIdRef.current;
      setUnresolvedIngredientCountByInvoice(
        countUnresolvedInvoiceIngredientsByInvoice(
          itemsMap,
          ingredientCatalog,
          confirmedIngredientAliases,
          supplierNameByInvoiceId,
          isMatchLifecycleReadCutoverEnabled()
            ? buildPersistedMatchMapsByInvoice(itemsMap, matchMap)
            : {},
        ),
      );
    },
    [
      ingredientCatalog,
      confirmedIngredientAliases,
      supplierNameByInvoiceId,
      buildPersistedMatchMapsByInvoice,
    ],
  );

  useEffect(() => {
    refreshUnresolvedIngredientCounts(allInvoiceItemsRef.current);
  }, [refreshUnresolvedIngredientCounts]);

  useEffect(() => {
    confirmedIngredientAliasesRef.current = confirmedIngredientAliases;
  }, [confirmedIngredientAliases]);

  useEffect(() => {
    if (!user) {
      setConfirmedIngredientAliases({});
      confirmedIngredientAliasesRef.current = {};
      setInvoiceIdentities({});
      invoiceIdentitiesRef.current = {};
      return;
    }

    try {
      const raw = window.localStorage.getItem(`marginly:invoice-ingredient-aliases:${user.id}`);
      const stored = raw ? (JSON.parse(raw) as IngredientAliasMap) : {};
      confirmedIngredientAliasesRef.current = stored;
      setConfirmedIngredientAliases(stored);
    } catch {
      confirmedIngredientAliasesRef.current = {};
      setConfirmedIngredientAliases({});
    }

    try {
      const raw = window.localStorage.getItem(invoiceIdentityStorageKey(user.id));
      const storedIdentities = raw ? (JSON.parse(raw) as InvoiceIdentityState) : {};
      invoiceIdentitiesRef.current = storedIdentities;
      setInvoiceIdentities(storedIdentities);
    } catch {
      invoiceIdentitiesRef.current = {};
      setInvoiceIdentities({});
    }
    ensureRejectedIngredientMatchesHydrated(user.id);
  }, [user]);

  const load = useCallback(async () => {
    const loadSeq = ++invoiceLoadSeqRef.current;
    setInvoicesLoading(true);
    setGlobalError(null);
    try {
      const { data, error } = await supabase
        .from("invoices")
        .select("id, supplier_name, invoice_date, total, file_url, created_at, settlement_status")
        .order("created_at", { ascending: false });
      if (error) throw error;

      const invoiceRows = (data ?? []) as DbInvoiceRow[];
      const settlementMap = Object.fromEntries(
        invoiceRows.map((row) => [row.id, normalizeSettlementStatus(row.settlement_status)]),
      ) as Record<string, SettlementState>;
      console.log("[settlement] reload", {
        loadSeq,
        invoiceCount: invoiceRows.length,
        settlementMap,
      });
      if (loadSeq !== invoiceLoadSeqRef.current) return;
      setSettlementByInvoice(settlementMap);
      settlementByInvoiceRef.current = settlementMap;
      const ids = invoiceRows.map((row) => row.id);
      const itemCounts: Record<string, number> = {};
      const { rows: catalogBase, error: ingredientCatalogError } =
        await loadMatchingIngredientCatalog(supabase);
      if (ingredientCatalogError) {
        console.error("[invoices] ingredients catalog load failed:", ingredientCatalogError);
      }
      const ingredientIds = catalogBase.map((row) => row.id);

      const [operationalMetadata, priceById] = await Promise.all([
        loadInvoiceOperationalMetadata(supabase, ingredientIds),
        loadIngredientPriceFieldsById(supabase),
      ]);
      const catalog = mergeIngredientPriceFields(catalogBase, priceById);

      if (loadSeq !== invoiceLoadSeqRef.current) return;
      setIngredientCatalog(catalog);
      dispatchOperationalIngredientCostChanged({ trigger: "invoices_catalog_reload" });
      if (isIngredientPickerTraceEnabled()) {
        traceIngredientPickerCatalogStage("01_catalog_fetch_merged", catalog, {
          source: "supabase.ingredients + mergeIngredientPriceFields",
          rowCountFromDb: catalogBase.length,
        });
      }
      setInvoiceOperationalMetadata(operationalMetadata);

      const { data: aliasRows } = await supabase
        .from("ingredient_aliases")
        .select("ingredient_id, alias_name, normalized_alias, supplier_name")
        .eq("confirmed_by_user", true);
      if (aliasRows?.length) {
        hydrateIngredientMatchOverridesFromAliasRows(
          aliasRows as {
            ingredient_id: string;
            alias_name: string;
            normalized_alias: string;
            supplier_name: string | null;
          }[],
          catalog,
        );
      }
      const dbAliases = await loadConfirmedIngredientAliasMap(supabase);
      let mergedConfirmedAliases: IngredientAliasMap = {};
      setConfirmedIngredientAliases((current) => {
        mergedConfirmedAliases = { ...current, ...dbAliases };
        hydrateOperationalAliasMemoryFromConfirmedMap(mergedConfirmedAliases, catalog);
        compareAliasMapsForDesync(current, dbAliases, "load:merge_local_and_db");
        traceManualIngredientMatch("[manual_match_reload_result]", {
          phase: "merge_local_and_db",
          reloadSource: "merge",
          localKeyCount: Object.keys(current).length,
          dbKeyCount: Object.keys(dbAliases).length,
          mergedKeyCount: Object.keys(mergedConfirmedAliases).length,
          sampleMergedKeys: Object.keys(mergedConfirmedAliases).slice(0, 12),
        });
        return mergedConfirmedAliases;
      });
      confirmedIngredientAliasesRef.current = mergedConfirmedAliases;

      const itemsByInvoiceId: Record<string, ItemRow[]> = {};
      if (ids.length > 0) {
        const { data: itemRows, error: itemError } = await supabase
          .from("invoice_items")
          .select("id, invoice_id, name, quantity, unit, unit_price, total")
          .in("invoice_id", ids);
        if (!itemError) {
          for (const raw of (itemRows ?? []) as (ItemRow & { invoice_id: string | null })[]) {
            if (!raw.invoice_id) continue;
            const normalized = normalizeInvoiceItemFields(raw);
            if (shouldRejectInvoiceIngredientRow(normalized)) continue;
            itemCounts[raw.invoice_id] = (itemCounts[raw.invoice_id] ?? 0) + 1;
            const bucket = itemsByInvoiceId[raw.invoice_id] ?? [];
            bucket.push(normalized);
            itemsByInvoiceId[raw.invoice_id] = bucket;
          }
        }
      }
      allInvoiceItemsRef.current = itemsByInvoiceId;

      if (loadSeq !== invoiceLoadSeqRef.current) return;

      let nextPersistedMatchByItemId = persistedMatchByItemIdRef.current;
      if (isMatchLifecycleReadCutoverEnabled()) {
        const allItemIds = Object.values(itemsByInvoiceId)
          .flat()
          .map((item) => item.id);
        const { data: matchRows } = await getInvoiceItemMatchesForItemIds(supabase, allItemIds);
        if (loadSeq !== invoiceLoadSeqRef.current) return;
        nextPersistedMatchByItemId = buildPersistedMatchMapFromRows(matchRows ?? []);
        setPersistedMatchByItemId(nextPersistedMatchByItemId);
        persistedMatchByItemIdRef.current = nextPersistedMatchByItemId;
      }

      const identityState = invoiceIdentitiesRef.current;
      if (catalog.length > 0) {
        setUnresolvedIngredientCountByInvoice(
          countUnresolvedInvoiceIngredientsByInvoice(
            itemsByInvoiceId,
            catalog,
            mergedConfirmedAliases,
            Object.fromEntries(
              invoiceRows.map((row) => [
                row.id,
                normalizeSupplierDisplayName(
                  identityState[row.id]?.supplierName ?? row.supplier_name,
                ) || null,
              ]),
            ),
            isMatchLifecycleReadCutoverEnabled()
              ? buildPersistedMatchMapsByInvoice(itemsByInvoiceId, nextPersistedMatchByItemId)
              : {},
          ),
        );
      }
      setRows(
        invoiceRows.map((row) => toInvoiceRow(row, itemCounts[row.id] ?? 0, identityState[row.id])),
      );
      hasLoadedInvoicesOnceRef.current = true;
      setHasLoadedInvoicesOnce(true);
    } catch (err) {
      if (loadSeq !== invoiceLoadSeqRef.current) return;
      setGlobalError(err instanceof Error ? err.message : "Could not load invoices");
      if (!hasLoadedInvoicesOnceRef.current) {
        setRows([]);
      }
    } finally {
      if (loadSeq === invoiceLoadSeqRef.current) {
        setInvoicesLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    if (user) load();
    else {
      setRows([]);
      setIngredientCatalog([]);
      setInvoiceOperationalMetadata(emptyInvoiceOperationalMetadata());
      setSettlementByInvoice({});
      hasLoadedInvoicesOnceRef.current = false;
      setHasLoadedInvoicesOnce(false);
      setInvoicesLoading(authLoading);
      autoPersistAttemptedRef.current.clear();
    }
  }, [user, load, authLoading]);

  useEffect(() => {
    if (!user || !expanded || ingredientCatalog.length === 0) return;
    const items = itemsByInvoice[expanded];
    if (!items?.length) return;

    const supplierName = rows.find((row) => row.id === expanded)?.supplier_name ?? null;
    void autoPersistUnmatchedInvoiceItems({
      client: supabase,
      userId: user.id,
      invoiceId: expanded,
      items,
      catalog: ingredientCatalog,
      confirmedAliases: confirmedIngredientAliases,
      supplierName,
      attemptedKeys: autoPersistAttemptedRef.current,
      isGenericUnit,
      onIngredientCreated: (row) => {
        setIngredientCatalog((current) => {
          if (current.some((entry) => entry.id === row.id)) return current;
          return [...current, row as IngredientMatchRow];
        });
        dispatchOperationalIngredientCostChanged({
          trigger: "invoice_auto_persist",
          ingredientId: row.id,
        });
      },
    });
  }, [user, expanded, itemsByInvoice, ingredientCatalog, confirmedIngredientAliases, rows]);

  // Cleanup preview URLs on unmount
  useEffect(
    () => () => {
      pending.forEach((p) => URL.revokeObjectURL(p.previewUrl));
    },
    [pending],
  );

  const availableKpiMonths = useMemo(() => collectAvailableInvoiceMonths(rows), [rows]);
  const defaultKpiMonth = useMemo(
    () => resolveDefaultInvoiceKpiMonth(availableKpiMonths),
    [availableKpiMonths],
  );

  useEffect(() => {
    if (availableKpiMonths.length === 0) {
      setSelectedKpiMonth(null);
      return;
    }
    setSelectedKpiMonth((current) => {
      if (current && availableKpiMonths.includes(current)) return current;
      return defaultKpiMonth;
    });
  }, [availableKpiMonths, defaultKpiMonth]);

  const operationalSummaryCards = useMemo(() => {
    if (!selectedKpiMonth) return [];
    return buildInvoiceKpiSummaryCards(rows, selectedKpiMonth);
  }, [rows, selectedKpiMonth]);

  const settlementOverview = useMemo(() => {
    if (rows.length === 0) return null;

    let settled = 0;
    let awaiting = 0;
    let awaitingTotal = 0;

    for (const row of rows) {
      if (getSettlementState(row.id, settlementByInvoice) === "settled") {
        settled += 1;
      } else {
        awaiting += 1;
        awaitingTotal += Number(row.total ?? 0);
      }
    }

    const settledLabel = `${settled} settled`;
    const awaitingLabel = awaiting === 1 ? "1 to follow up" : `${awaiting} to follow up`;
    const awaitingAmount =
      awaiting > 0 && awaitingTotal > 0 ? ` (€${awaitingTotal.toFixed(2)})` : "";

    return `${settledLabel} • ${awaitingLabel}${awaitingAmount}`;
  }, [rows, settlementByInvoice]);

  const supplierHistoryFilter = useRouterState({
    select: (state) =>
      new URLSearchParams(state.location.searchStr).get("supplier")?.trim() || null,
  });

  const sortedRows = useMemo(() => {
    return [...rows].sort((a, b) => {
      switch (sortBy) {
        case "oldest":
          return invoiceTime(a.timelineDate) - invoiceTime(b.timelineDate);
        case "supplier":
          return compareSortStrings(a.supplier_name, b.supplier_name);
        case "highest":
          return Number(b.total) - Number(a.total);
        case "lowest":
          return Number(a.total) - Number(b.total);
        case "status": {
          const statusOrder =
            compareSortStrings(a.status, b.status) ||
            compareSortStrings(
              getSettlementState(a.id, settlementByInvoice),
              getSettlementState(b.id, settlementByInvoice),
            );
          return statusOrder || compareSortStrings(a.supplier_name, b.supplier_name);
        }
        case "newest":
        default:
          return invoiceTime(b.timelineDate) - invoiceTime(a.timelineDate);
      }
    });
  }, [rows, settlementByInvoice, sortBy]);

  const invoiceRowsForDisplay = useMemo(() => {
    if (!supplierHistoryFilter) return sortedRows;
    const normalized = supplierHistoryFilter.toLowerCase();
    return sortedRows.filter(
      (row) => (row.supplier_name?.trim() || "").toLowerCase() === normalized,
    );
  }, [sortedRows, supplierHistoryFilter]);

  const toggleSettlement = async (invoiceId: string) => {
    invoiceLoadSeqRef.current += 1;

    const previous = getSettlementState(invoiceId, settlementByInvoiceRef.current);
    const next: SettlementState = previous === "settled" ? "pending" : "settled";

    console.log("[settlement] toggle", { invoiceId, previous, next });

    setSettlementByInvoice((current) => ({
      ...current,
      [invoiceId]: next,
    }));

    const { data, error } = await supabase
      .from("invoices")
      .update({ settlement_status: next })
      .eq("id", invoiceId)
      .select("id, settlement_status")
      .maybeSingle();

    console.log("[settlement] update response", {
      invoiceId,
      next,
      data,
      error: error?.message ?? null,
    });

    if (error || !data) {
      setSettlementByInvoice((current) => ({
        ...current,
        [invoiceId]: previous,
      }));
      setGlobalError(error?.message ?? "Could not update settlement status");
      return;
    }

    const persisted = normalizeSettlementStatus(data.settlement_status);
    setSettlementByInvoice((current) => ({
      ...current,
      [invoiceId]: persisted,
    }));
    settlementByInvoiceRef.current = {
      ...settlementByInvoiceRef.current,
      [invoiceId]: persisted,
    };
  };

  const enqueue = (files: FileList | File[]) => {
    console.log("[invoices] enqueue called with", files.length, "file(s)");
    setGlobalError(null);
    const arr = Array.from(files);
    const next: Pending[] = [];
    for (const file of arr) {
      if (!ACCEPT.includes(file.type) && !file.name.toLowerCase().endsWith(".pdf")) {
        setGlobalError(`Unsupported file: ${file.name}`);
        continue;
      }
      if (file.size > MAX_BYTES) {
        setGlobalError(`${file.name} is over 20 MB`);
        continue;
      }
      next.push({
        id: createPendingId(),
        file,
        previewUrl: URL.createObjectURL(file),
        progress: 0,
        status: "queued",
      });
    }
    if (next.length) {
      console.log("[invoices] enqueue queued", next.length, "file(s)");
      setPending((p) => [...next, ...p]);
      next.forEach(uploadOne);
    }
  };

  const runExtraction = async (
    invoiceId: string,
    dataUrl: string,
  ): Promise<{
    supplier?: string;
    invoiceNumber?: string | null;
    invoiceDate?: string | null;
    total?: number;
    itemsCount: number;
  } | null> => {
    if (extractionInFlightRef.current[invoiceId]) {
      console.log("[invoice-ocr] extraction-skipped", {
        invoiceId,
        reason: "already_in_flight",
      });
      return null;
    }
    extractionInFlightRef.current[invoiceId] = true;
    console.log("[invoice-ocr] stage=2 ocr-trigger", {
      invoiceId,
      dataUrlLength: dataUrl.length,
      dataUrlPrefix: dataUrl.slice(0, 64),
    });
    setExtracting((s) => ({ ...s, [invoiceId]: true }));
    try {
      console.log("[invoice-ocr] stage=3 provider-request", {
        invoiceId,
        function: "extract-invoice",
      });
      const { data, error } = await supabase.functions.invoke("extract-invoice", {
        body: { imageDataUrl: dataUrl },
      });
      console.log("[invoice-ocr] stage=4 provider-response", {
        invoiceId,
        hasError: Boolean(error),
        errorMessage: error?.message ?? null,
        hasData: Boolean(data),
        dataKeys: data && typeof data === "object" ? Object.keys(data) : [],
      });
      if (error) throw error;
      const rawItems = Array.isArray(data?.items) ? data.items : [];
      const extractionMetaByName = new Map<string, InvoiceOcrQtyExtractionMeta>();
      const items = rawItems.map((raw: ItemRow & { extraction_meta?: InvoiceOcrQtyExtractionMeta }) => {
        if (raw.extraction_meta) {
          extractionMetaByName.set(String(raw.name ?? ""), raw.extraction_meta);
        }
        const { extraction_meta: _meta, ...line } = raw;
        return line as ItemRow;
      });
      console.log("[invoice-ocr] stage=5 raw-extraction-received", {
        invoiceId,
        rawItemsCount: items.length,
        rawTextPreview: JSON.stringify(data).slice(0, 1000),
        supplier: data?.supplier ?? null,
        total: data?.total ?? null,
        invoiceDate: data?.invoice_date ?? data?.invoiceDate ?? null,
      });
      traceInvoiceQuantityStage("extract-response:first-item", items[0], { invoiceId });
      traceUnitForAllItems("OCR", items, { invoiceId });
      if (import.meta.env.DEV && items[0]) {
        const sample = normalizeInvoiceItemFields(items[0] as ItemRow);
        console.debug("[invoice-purchase]", resolveInvoiceLinePurchaseFormat(sample));
      }
      const normalizedItems = items
        .map((it: ItemRow) => normalizeInvoiceItemFields(it))
        .filter((it: ItemRow) => !shouldRejectInvoiceIngredientRow(it));
      const rejectedCount = items.length - normalizedItems.length;
      console.log("[invoice-ocr] stage=6 table-detection", {
        invoiceId,
        method: "client-side shouldRejectInvoiceIngredientRow filter",
        note: "deterministic parseContinente/parsePadaria not used in active pipeline",
        rawItemsCount: items.length,
        acceptedItemsCount: normalizedItems.length,
        rejectedItemsCount: rejectedCount,
      });
      console.log("[invoice-ocr] stage=7 row-extraction", {
        invoiceId,
        parsedRowsCount: normalizedItems.length,
        parsedRowsPreview: normalizedItems.slice(0, 5),
      });
      traceUnitForAllItems("NORMALIZED", normalizedItems, { invoiceId });
      if (normalizedItems.length === 0) {
        console.log("[invoice-ocr] stage=9 persistence-skipped", {
          invoiceId,
          reason: "no accepted rows after normalization",
          rawItemsCount: items.length,
          rejectedItemsCount: rejectedCount,
        });
        toast.error("Extraction returned no line items — existing rows kept.");
        return null;
      }
      if (!user) {
        console.log("[invoice-ocr] stage=9 persistence-skipped", {
          invoiceId,
          reason: "no user session",
          acceptedItemsCount: normalizedItems.length,
        });
        return null;
      }
      const { error: deleteError } = await supabase
        .from("invoice_items")
        .delete()
        .eq("invoice_id", invoiceId);
      if (deleteError) {
        console.error("[invoice-ocr] persistence-delete-failed", {
          invoiceId,
          error: deleteError.message,
        });
        toast.error(`Could not replace invoice rows: ${deleteError.message}`);
        return null;
      }
      traceInvoiceQuantityStage("insert-normalized:first-item", normalizedItems[0], {
        invoiceId,
      });
      traceUnitResolveForAllItems(normalizedItems, { invoiceId });
      const insertRows = normalizedItems.map((it: ItemRow) => {
        const name = String(it.name ?? "Unknown");
        const unit = resolveInvoiceItemUnit({
          name,
          quantity: it.quantity,
          unit: it.unit,
        });
        return {
          invoice_id: invoiceId,
          user_id: user.id,
          name: name.slice(0, 200),
          quantity: it.quantity ?? null,
          unit: unit ? unit.slice(0, 20) : null,
          unit_price: it.unit_price ?? null,
          total: it.total ?? null,
        };
      });
      traceInvoiceQuantityStage("insert-payload:first-item", insertRows[0], { invoiceId });
      traceUnitForAllItems("INSERT", insertRows, { invoiceId });
      const { error: insertError } = await supabase.from("invoice_items").insert(insertRows);
      console.log("[invoice-ocr] stage=9 persistence-result", {
        invoiceId,
        insertRowCount: insertRows.length,
        success: !insertError,
        error: insertError?.message ?? null,
      });
      if (insertError) {
        console.error("[invoice-ocr] persistence-insert-failed", {
          invoiceId,
          error: insertError.message,
        });
        toast.error(`Could not save extracted rows: ${insertError.message}`);
        return null;
      }

      const supplierForSync = normalizeSupplierDisplayName(data?.supplier);
      const rawInvoiceDateForHistory = data?.invoice_date ?? data?.invoiceDate;
      const invoiceDateForHistory = normalizeInvoiceDate(rawInvoiceDateForHistory);
      const invoiceRowForHistory = rows.find((row) => row.id === invoiceId);
      const costSync = await syncOperationalIngredientCostsFromInvoiceLines(
        supabase,
        ingredientCatalog,
        confirmedIngredientAliasesRef.current,
        normalizedItems.map((it: ItemRow) => {
          const name = String(it.name ?? "");
          return {
            name,
            quantity: it.quantity ?? null,
            unit: resolveInvoiceItemUnit({
              name,
              quantity: it.quantity,
              unit: it.unit,
            }),
            unit_price: it.unit_price ?? null,
            total: it.total ?? null,
            supplierName: supplierForSync,
          };
        }),
        {
          isGenericUnit,
          priceHistory: {
            invoiceId,
            supplierName: supplierForSync,
            invoiceDate: invoiceDateForHistory,
            invoiceCreatedAt: invoiceRowForHistory?.created_at ?? null,
          },
        },
      );
      if (costSync.updatedIngredientIds.length > 0) {
        clearIngredientMatchedInvoiceProductsCache();
        dispatchOperationalIngredientCostChanged({
          trigger: "invoice_extract_cost_sync",
        });
      }

      const { data: persistedItemRows, error: persistedItemsLoadError } = await supabase
        .from("invoice_items")
        .select("id,name")
        .eq("invoice_id", invoiceId);
      if (persistedItemsLoadError) {
        console.error("[invoice_item_matches] persisted-items-load-failed", {
          invoiceId,
          error: persistedItemsLoadError.message,
        });
      } else {
        const nextExtractionMeta: Record<string, InvoiceOcrQtyExtractionMeta> = {};
        for (const row of persistedItemRows ?? []) {
          const meta = extractionMetaByName.get(String(row.name ?? ""));
          if (meta) nextExtractionMeta[row.id] = meta;
        }
        if (Object.keys(nextExtractionMeta).length > 0) {
          setExtractionMetaByItemId((current) => ({ ...current, ...nextExtractionMeta }));
        }
        await shadowSeedInvoiceItemMatchesAfterExtract(supabase, {
          invoiceId,
          userId: user.id,
          items: persistedItemRows ?? [],
          ingredientCatalog,
          confirmedAliases: confirmedIngredientAliasesRef.current,
          supplierName: supplierForSync,
        });
      }

      const supplier = normalizeSupplierDisplayName(data?.supplier);
      const invoiceNumber = normalizeInvoiceNumber(data?.invoice_number);
      const rawInvoiceDate = data?.invoice_date ?? data?.invoiceDate;
      const invoiceDate = normalizeInvoiceDate(rawInvoiceDate);
      console.log("RAW INVOICE DATE:", rawInvoiceDate);
      console.log("NORMALIZED INVOICE DATE:", invoiceDate);
      console.log("FULL EXTRACTION DATA:", data);

      traceInvoiceDatePersistence("extracted-date", {
        invoiceId,
        rawInvoiceDateSnake: data?.invoice_date,
        rawInvoiceDateCamel: data?.invoiceDate,
        normalizedInvoiceDate: invoiceDate,
      });
      traceInvoiceIdentity("extracted-metadata", {
        invoiceId,
        extractedSupplierName: supplier || null,
        extractedInvoiceNumber: invoiceNumber,
        extractedInvoiceDate: invoiceDate,
        rawInvoiceDate,
        itemsCount: items.length,
      });
      console.log("[invoice-ocr] stage=10 final-summary", {
        invoiceId,
        supplier: supplier || null,
        invoiceNumber,
        invoiceDate,
        total: typeof data?.total === "number" ? data.total : null,
        rawItemsCount: items.length,
        persistedItemsCount: normalizedItems.length,
      });
      return {
        supplier: supplier || undefined,
        invoiceNumber,
        invoiceDate,
        total: typeof data?.total === "number" ? data.total : undefined,
        itemsCount: normalizedItems.length,
      };
    } catch (err) {
      console.error("[invoice-ocr] extraction-failed", {
        invoiceId,
        error: err instanceof Error ? err.message : String(err),
      });
      toast.error(err instanceof Error ? err.message : "Invoice extraction failed");
      return null;
    } finally {
      delete extractionInFlightRef.current[invoiceId];
      setExtracting((s) => ({ ...s, [invoiceId]: false }));
    }
  };

  const uploadOne = async (item: Pending) => {
    if (!user) return;
    setPending((p) =>
      p.map((x) => (x.id === item.id ? { ...x, status: "uploading", progress: 10 } : x)),
    );
    try {
      const safeName = item.file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const path = `${user.id}/${Date.now()}-${safeName}`;

      const { error: upErr } = await supabase.storage
        .from("invoices")
        .upload(path, item.file, { contentType: item.file.type, upsert: false });
      if (upErr) throw upErr;

      console.log("[invoice-ocr] stage=1 upload-complete", {
        fileName: item.file.name,
        fileType: item.file.type,
        fileSize: item.file.size,
        storagePath: path,
      });

      setPending((p) => p.map((x) => (x.id === item.id ? { ...x, progress: 40 } : x)));

      const sourceFileName = item.file.name.replace(/\.[^.]+$/, "").slice(0, 120) || "Invoice";
      const fallbackSupplier = sourceFileName.slice(0, 60) || "Unknown supplier";
      const { data: inserted, error: insErr } = await supabase
        .from("invoices")
        .insert({
          user_id: user.id,
          supplier_name: fallbackSupplier,
          total: 0,
          file_url: path,
        })
        .select("id")
        .single();
      if (insErr || !inserted) throw insErr ?? new Error("Insert failed");
      rememberInvoiceIdentity(inserted.id, { sourceFileName });

      console.log("[invoice-ocr] stage=1 invoice-row-created", {
        invoiceId: inserted.id,
        fallbackSupplier,
        storagePath: path,
      });

      setPending((p) => p.map((x) => (x.id === item.id ? { ...x, progress: 65 } : x)));

      const isExtractable = isExtractableFile(item.file);
      if (isExtractable) {
        console.log("[invoice-ocr] stage=2 ocr-will-run", {
          invoiceId: inserted.id,
          reason: isPdfFile(item.file) ? "pdf rasterized to png" : "image file type",
          fileType: item.file.type,
        });
        const dataUrl = await fileToExtractionDataUrl(item.file);
        const ext = await runExtraction(inserted.id, dataUrl);
        const invoiceUpdatePayload: {
          supplier_name: string;
          invoice_date?: string;
          total: number;
        } = {
          supplier_name: ext?.supplier?.slice(0, 120) ?? fallbackSupplier,
          ...(normalizeInvoiceDate(ext?.invoiceDate)
            ? { invoice_date: normalizeInvoiceDate(ext?.invoiceDate)! }
            : {}),
          total: typeof ext?.total === "number" && ext.total > 0 ? ext.total : 0,
        };
        const { data: updatedInvoice, error: invoiceUpdateError } = await supabase
          .from("invoices")
          .update(invoiceUpdatePayload)
          .eq("id", inserted.id)
          .select("invoice_date")
          .single();
        traceInvoiceDatePersistence("upload-persist-date", {
          invoiceId: inserted.id,
          extractedInvoiceDate: ext?.invoiceDate,
          persistedInvoiceDate: updatedInvoice?.invoice_date ?? invoiceUpdatePayload.invoice_date,
          persistenceError: invoiceUpdateError?.message,
        });
        if (invoiceUpdateError) throw invoiceUpdateError;
        traceInvoiceIdentity("persisted-invoice", {
          invoiceId: inserted.id,
          extractedSupplierName: ext?.supplier,
          extractedInvoiceNumber: ext?.invoiceNumber,
          extractedInvoiceDate: ext?.invoiceDate,
          persistedInvoiceDate: updatedInvoice?.invoice_date ?? invoiceUpdatePayload.invoice_date,
          persistedSupplierName: ext?.supplier?.slice(0, 120) ?? fallbackSupplier,
          persistenceError: invoiceUpdateError?.message,
        });
        rememberInvoiceIdentity(inserted.id, {
          sourceFileName,
          supplierName: ext?.supplier ?? null,
          invoiceNumber: ext?.invoiceNumber ?? null,
          invoiceDate: ext?.invoiceDate ?? null,
        });
        console.log("[invoice-ocr] stage=10 upload-summary-updated", {
          invoiceId: inserted.id,
          extractionSucceeded: ext !== null,
          itemsCount: ext?.itemsCount ?? 0,
          total: invoiceUpdatePayload.total,
          supplier: invoiceUpdatePayload.supplier_name,
        });
      } else {
        console.log("[invoice-ocr] stage=2 ocr-skipped", {
          invoiceId: inserted.id,
          reason: "unsupported file type for extraction",
          fileType: item.file.type,
        });
      }

      setPending((p) =>
        p.map((x) => (x.id === item.id ? { ...x, progress: 100, status: "done" } : x)),
      );
      load();
      setTimeout(() => {
        setPending((p) => {
          const target = p.find((x) => x.id === item.id);
          if (target) URL.revokeObjectURL(target.previewUrl);
          return p.filter((x) => x.id !== item.id);
        });
      }, 1600);
    } catch (err: unknown) {
      setPending((p) =>
        p.map((x) =>
          x.id === item.id
            ? { ...x, status: "error", error: err instanceof Error ? err.message : "Upload failed" }
            : x,
        ),
      );
    }
  };

  const loadPriceComparisons = async (
    invoiceId: string,
    invoiceCreatedAt: string,
    items: ItemRow[],
  ): Promise<PriceComparisonMap> => {
    const neededNames = new Set(
      items.map((item) => normalizeExtractedItemName(item.name)).filter(Boolean),
    );
    const invoiceDate = new Date(invoiceCreatedAt);
    if (neededNames.size === 0 || Number.isNaN(invoiceDate.getTime())) return {};

    const { data: previousInvoices, error: invoiceError } = await supabase
      .from("invoices")
      .select("id")
      .lt("created_at", invoiceCreatedAt)
      .neq("id", invoiceId)
      .order("created_at", { ascending: false })
      .limit(50);
    if (invoiceError || !previousInvoices?.length) return {};

    const previousInvoiceIds = ((previousInvoices ?? []) as PreviousInvoiceRow[]).map(
      (row) => row.id,
    );
    const invoiceOrder = new Map(previousInvoiceIds.map((id, index) => [id, index]));
    const { data: previousItems, error: itemError } = await supabase
      .from("invoice_items")
      .select("invoice_id, name, unit_price")
      .in("invoice_id", previousInvoiceIds);
    if (itemError || !previousItems?.length) return {};

    const latestPriceByName: Record<string, number> = {};
    const sortedItems = [...((previousItems ?? []) as PreviousItemRow[])].sort(
      (a, b) =>
        (invoiceOrder.get(a.invoice_id ?? "") ?? Number.MAX_SAFE_INTEGER) -
        (invoiceOrder.get(b.invoice_id ?? "") ?? Number.MAX_SAFE_INTEGER),
    );

    for (const item of sortedItems) {
      const name = normalizeExtractedItemName(item.name);
      const price = Number(item.unit_price);
      if (
        !neededNames.has(name) ||
        latestPriceByName[name] !== undefined ||
        !Number.isFinite(price)
      ) {
        continue;
      }
      latestPriceByName[name] = price;
    }

    return items.reduce<PriceComparisonMap>((comparisons, item) => {
      const previousPrice = latestPriceByName[normalizeExtractedItemName(item.name)];
      if (previousPrice !== undefined) comparisons[item.id] = previousPrice;
      return comparisons;
    }, {});
  };

  const loadItems = async (invoiceId: string, invoiceCreatedAt: string) => {
    const { data } = await supabase
      .from("invoice_items")
      .select("id, name, quantity, unit, unit_price, total")
      .eq("invoice_id", invoiceId)
      .order("created_at", { ascending: true });
    traceInvoiceQuantityStage("load-raw:first-item", (data ?? [])[0], { invoiceId });
    const items = ((data ?? []) as ItemRow[])
      .map((item) => normalizeInvoiceItemFields(item))
      .filter((item) => !shouldRejectInvoiceIngredientRow(item));
    traceInvoiceQuantityStage("load-normalized:first-item", items[0], { invoiceId });
    const priceComparisons = await loadPriceComparisons(invoiceId, invoiceCreatedAt, items);
    allInvoiceItemsRef.current = { ...allInvoiceItemsRef.current, [invoiceId]: items };
    setItemsByInvoice((s) => ({ ...s, [invoiceId]: items }));
    setPriceComparisonsByInvoice((s) => ({ ...s, [invoiceId]: priceComparisons }));

    if (isMatchLifecycleReadCutoverEnabled()) {
      const { data: matchRows } = await getInvoiceItemMatchesByInvoiceId(supabase, invoiceId);
      const invoiceMatchMap = buildPersistedMatchMapFromRows(matchRows ?? []);
      setPersistedMatchByItemId((current) => {
        const next = new Map(current);
        for (const [itemId, row] of invoiceMatchMap) {
          next.set(itemId, row);
        }
        persistedMatchByItemIdRef.current = next;
        return next;
      });
    }

    const supplierName = rows.find((row) => row.id === invoiceId)?.supplier_name ?? null;
    const matchMap = persistedMatchByItemIdRef.current;
    if (ingredientCatalog.length > 0) {
      setUnresolvedIngredientCountByInvoice((current) => ({
        ...current,
        [invoiceId]: countUnresolvedInvoiceIngredients({
          items,
          ingredientCatalog,
          confirmedAliases: confirmedIngredientAliases,
          supplierName,
          persistedMatchByItemId: isMatchLifecycleReadCutoverEnabled() ? matchMap : undefined,
        }).unmatchedCount,
      }));
    }
  };

  const toggleExpand = (row: InvoiceRow) => {
    setExpanded((id) => (id === row.id ? null : row.id));
    if (!itemsByInvoice[row.id]) loadItems(row.id, row.created_at);
  };

  const rememberInvoiceIdentity = (invoiceId: string, identity: InvoiceIdentityMeta) => {
    if (!user) return;
    setInvoiceIdentities((current) => {
      const previous = current[invoiceId] ?? {};
      const nextIdentity = {
        ...previous,
        ...identity,
        supplierName: identity.supplierName ?? previous.supplierName ?? null,
        invoiceNumber: identity.invoiceNumber ?? previous.invoiceNumber ?? null,
        invoiceDate: identity.invoiceDate ?? previous.invoiceDate ?? null,
        sourceFileName: identity.sourceFileName ?? previous.sourceFileName ?? null,
      };
      const next = { ...current, [invoiceId]: nextIdentity };
      invoiceIdentitiesRef.current = next;
      traceInvoiceIdentity("remembered-identity", {
        invoiceId,
        extractedSupplierName: nextIdentity.supplierName,
        extractedInvoiceNumber: nextIdentity.invoiceNumber,
        extractedInvoiceDate: nextIdentity.invoiceDate,
        sourceFileName: nextIdentity.sourceFileName,
      });
      try {
        window.localStorage.setItem(invoiceIdentityStorageKey(user.id), JSON.stringify(next));
      } catch {
        // Invoice number/date have no current DB columns; local memory keeps the UI useful.
      }
      return next;
    });
  };

  const resolveInvoicePriceHistoryContext = useCallback(
    (invoiceId: string, supplierName?: string | null) => {
      const row = rows.find((r) => r.id === invoiceId);
      const identity = invoiceIdentitiesRef.current[invoiceId];
      return {
        invoiceId,
        supplierName: supplierName ?? row?.supplier_name ?? identity?.supplierName ?? null,
        invoiceDate: row?.invoiceDate ?? identity?.invoiceDate ?? null,
        invoiceCreatedAt: row?.created_at ?? null,
      };
    },
    [rows],
  );

  const persistIngredientCorrectionForItem = (
    item: ItemRow,
    ingredientId: string,
    ingredientName: string,
    invoiceId: string,
    supplierName?: string | null,
  ): Promise<{ ok: boolean; error?: string }> =>
    aliasPersistQueueRef.current.enqueue(async () => {
      traceIngredientAliases("persistIngredientCorrectionForItem:enter", {
        function: "persistIngredientCorrectionForItem",
        itemId: item.id,
        itemName: item.name,
        compareBucket: getAliasTraceCompareBucket(item.name),
        ingredientId,
        ingredientName,
        supplierName: supplierName ?? null,
        queueGeneration: aliasPersistQueueRef.current.getGeneration(),
      });
      if (!user) {
        traceIngredientAliases("persistIngredientCorrectionForItem:early-return", {
          branch: "not_signed_in",
          itemName: item.name,
        });
        return { ok: false, error: "Not signed in" };
      }

      const mapBeforePersist = confirmedIngredientAliasesRef.current;
      traceAliasPersistCycle({
        phase: "before_persist",
        itemName: item.name,
        aliasKeyBefore:
          buildManualIngredientCorrectionKeys(item.name, supplierName)?.aliasLookupKey ?? null,
        mapKeyCount: Object.keys(mapBeforePersist).length,
        sampleKeys: Object.keys(mapBeforePersist).slice(0, 12),
        reloadSource: "memory",
        queueGeneration: aliasPersistQueueRef.current.getGeneration(),
      });

      traceManualIngredientMatch("[manual_match_attempt]", {
        itemId: item.id,
        rawName: item.name,
        ingredientId,
        supplierName: supplierName ?? null,
        mapKeyCountBefore: Object.keys(mapBeforePersist).length,
        queueGeneration: aliasPersistQueueRef.current.getGeneration(),
      });

      const { applied, error, clearedRejectedPairs } = await persistManualIngredientCorrection({
        itemName: item.name,
        ingredientId,
        ingredientName,
        supplierName,
        confirmedAliases: mapBeforePersist,
        supabase,
      });

      if (!applied) {
        traceCanonicalCreateFailure("alias-persist-invalid-line", {
          itemId: item.id,
          itemName: item.name,
        });
        traceIngredientAliases("persistIngredientCorrectionForItem:early-return", {
          branch: "applied_null",
          itemName: item.name,
          insertAttempted: false,
        });
        return { ok: false, error: "Invalid invoice line name" };
      }

      if (error) {
        const message = error.message || "Could not save ingredient alias";
        traceIngredientAliases("persistIngredientCorrectionForItem:alias-error", {
          itemName: item.name,
          message,
          code: error.code,
        });
        setGlobalError(message);
        return { ok: false, error: message };
      }

      const costSync = await persistOperationalIngredientCostFromInvoiceLine(
        supabase,
        ingredientId,
        {
          name: item.name,
          quantity: item.quantity,
          unit: item.unit,
          unit_price: item.unit_price,
          total: item.total ?? null,
        },
        {
          isGenericUnit,
          priceHistory: resolveInvoicePriceHistoryContext(invoiceId, supplierName),
        },
      );
      if (costSync.error) {
        console.error("[invoices] operational cost sync failed:", costSync.error.message);
      } else if (costSync.updated) {
        clearIngredientMatchedInvoiceProductsCache(ingredientId);
      }

      traceAliasPersistCycle({
        phase: "after_persist",
        itemName: item.name,
        aliasLookupKey: applied.aliasLookupKey,
        aliasKeyBefore: applied.aliasLookupKey,
        aliasKeyAfter: applied.aliasLookupKey,
        mapKeyCount: Object.keys(applied.nextConfirmedAliases).length,
        sampleKeys: Object.keys(applied.nextConfirmedAliases).slice(0, 12),
        reloadSource: "persist",
        queueGeneration: aliasPersistQueueRef.current.getGeneration(),
      });

      const dbAliases = await loadConfirmedIngredientAliasMap(supabase);
      const mergedAfterDb = mergeConfirmedAliasMapsAfterReload(
        applied.nextConfirmedAliases,
        dbAliases,
      );
      compareAliasMapsForDesync(
        applied.nextConfirmedAliases,
        dbAliases,
        "persistIngredientCorrectionForItem:after_upsert",
      );
      traceAliasPersistCycle({
        phase: "after_db_reload",
        itemName: item.name,
        aliasLookupKey: applied.aliasLookupKey,
        mapKeyCount: Object.keys(mergedAfterDb).length,
        sampleKeys: Object.keys(mergedAfterDb).slice(0, 12),
        reloadSource: "supabase",
        queueGeneration: aliasPersistQueueRef.current.getGeneration(),
      });
      traceAliasMapSnapshot("after_db_reload", mergedAfterDb, {
        itemName: item.name,
        ingredientId,
      });

      traceIngredientAliases("persistIngredientCorrectionForItem:ok", {
        itemName: item.name,
        aliasLookupKey: applied.aliasLookupKey,
        ingredientId,
        mergedKeyCount: Object.keys(mergedAfterDb).length,
      });
      traceManualIngredientMatch("[manual_match_reload_result]", {
        phase: "post_persist_db_merge",
        itemName: item.name,
        aliasLookupKey: applied.aliasLookupKey,
        sessionKeyCount: Object.keys(applied.nextConfirmedAliases).length,
        dbKeyCount: Object.keys(dbAliases).length,
        mergedKeyCount: Object.keys(mergedAfterDb).length,
      });

      confirmedIngredientAliasesRef.current = mergedAfterDb;
      setConfirmedIngredientAliases(mergedAfterDb);
      hydrateOperationalAliasMemoryFromConfirmedMap(mergedAfterDb, ingredientCatalog);
      if (clearedRejectedPairs > 0) {
        persistRejectedIngredientMatchesToStorage(user.id);
      }
      setRejectedMatchItemIds((current) => {
        if (!current.has(item.id)) return current;
        const next = new Set(current);
        next.delete(item.id);
        return next;
      });
      try {
        window.localStorage.setItem(
          `marginly:invoice-ingredient-aliases:${user.id}`,
          JSON.stringify(mergedAfterDb),
        );
      } catch (localStorageErr) {
        traceIngredientAliasesCatch(
          "persistIngredientCorrectionForItem:localStorage",
          localStorageErr,
          {
            itemName: item.name,
          },
        );
      }
      return { ok: true };
    });

  const confirmIngredientMatch = async (
    item: ItemRow,
    match: IngredientCanonicalMatch,
    invoiceId: string,
    supplierName?: string | null,
  ) => {
    traceCanonicalCreateAttempt({
      flowFunction: "confirmIngredientMatch",
      flowOrigin: "rematch",
      stage: "alias-only",
      rawInvoiceText: item.name,
      normalized: match.ingredient.normalized_name ?? null,
      finalCanonicalName: match.ingredient.name ?? null,
      nameSource: "invoice_line",
      insertAttempted: false,
      blocked: true,
      blockReason: "ingredient_aliases_only",
    });
    const aliasResult = await persistIngredientCorrectionForItem(
      item,
      match.ingredient.id,
      match.ingredient.name ?? match.ingredient.normalized_name ?? "",
      invoiceId,
      supplierName,
    );
    if (aliasResult.ok) {
      if (user) {
        void dualWriteMatchLifecycleAfterIngredientPersist({
          item,
          ingredientId: match.ingredient.id,
          invoiceId,
          userId: user.id,
          matchKind: match.kind,
        });
      }
      dispatchOperationalIngredientCostChanged({
        trigger: "invoice_match_confirm",
        ingredientId: match.ingredient.id,
      });
    }
    traceFoodCostRecalculationSource("match_confirm", {
      canonicalIngredientId: match.ingredient.id,
      invoiceItemId: item.id,
      surface: "invoices",
      note: "Alias link only; recipe food cost updates when ingredient price/catalog reloads",
    });
  };

  const selectIngredientForItem = async (
    item: ItemRow,
    ingredientId: string,
    invoiceId: string,
    supplierName?: string | null,
    lifecycle?: IngredientSelectLifecycleOptions,
  ): Promise<{ ok: boolean; error?: string }> => {
    const ingredient = ingredientCatalog.find((row) => row.id === ingredientId);
    if (!ingredient) return { ok: false, error: "Ingredient not found" };
    traceCanonicalCreateAttempt({
      flowFunction: "selectIngredientForItem",
      flowOrigin: "rematch",
      stage: "manual-link-alias-only",
      rawInvoiceText: item.name,
      normalized: ingredient.normalized_name ?? null,
      finalCanonicalName: ingredient.name ?? null,
      nameSource: "invoice_line",
      insertAttempted: false,
      blocked: true,
      blockReason: "ingredient_aliases_only",
    });
    if (
      lifecycle?.previousIngredientId &&
      lifecycle.previousIngredientId !== ingredientId
    ) {
      const cleanupResult = await subtractivePricingCleanupForReassign(supabase, {
        invoiceId,
        previousIngredientId: lifecycle.previousIngredientId,
        wasConfirmed: lifecycle.wasConfirmed === true,
      });
      if (cleanupResult.error) {
        console.error(
          "[invoices] reassign subtractive cleanup failed:",
          lifecycle.previousIngredientId,
          cleanupResult.error.message,
        );
      }
      dispatchOperationalIngredientCostChanged({
        trigger: "invoice_reassign",
        ingredientId: lifecycle.previousIngredientId,
      });
    }

    const result = await persistIngredientCorrectionForItem(
      item,
      ingredientId,
      ingredient.name ?? ingredient.normalized_name ?? "",
      invoiceId,
      supplierName,
    );
    if (result.ok) {
      if (user) {
        void dualWriteMatchLifecycleAfterIngredientPersist({
          item,
          ingredientId,
          invoiceId,
          userId: user.id,
          lifecycle,
        });
      }
      dispatchOperationalIngredientCostChanged({
        trigger: "invoice_manual_match",
        ingredientId,
      });
      traceFoodCostRecalculationSource("match_confirm", {
        canonicalIngredientId: ingredientId,
        invoiceItemId: item.id,
        surface: "invoices",
        note: "Alias link only; recipe food cost updates when ingredient price/catalog reloads",
      });
    }
    return result;
  };

  const unmatchInvoiceLine = async (
    item: ItemRow,
    invoiceId: string,
    supplierName: string | null | undefined,
    options: {
      previousIngredientId?: string | null;
      wasConfirmed?: boolean;
      rawItemName?: string | null;
    },
  ): Promise<{ ok: boolean; error?: string }> => {
    if (!user) return { ok: false, error: "Not signed in" };

    const result = await unmatchInvoiceLineMatch({
      client: supabase,
      invoiceItemId: item.id,
      invoiceId,
      userId: user.id,
      itemName: item.name,
      supplierName,
      rawItemName: options.rawItemName ?? item.name,
      previousIngredientId: options.previousIngredientId,
      wasConfirmed: options.wasConfirmed,
    });

    if (!result.ok) {
      return { ok: false, error: result.error ?? "Could not remove match" };
    }

    if (isMatchLifecycleReadCutoverEnabled()) {
      setPersistedMatchByItemId((current) => {
        const next = new Map(current);
        next.set(item.id, {
          ingredient_id: null,
          status: "unmatched",
          match_kind: null,
        });
        persistedMatchByItemIdRef.current = next;
        return next;
      });
    }

    if (options.previousIngredientId) {
      dispatchOperationalIngredientCostChanged({
        trigger: "invoice_unmatch",
        ingredientId: options.previousIngredientId,
      });
    }

    return { ok: true };
  };

  const canonicalCreateDefaults = useMemo(() => {
    if (!canonicalCreateContext) return null;
    return buildCanonicalIngredientCreateDefaults(canonicalCreateContext.item, {
      supplierName: canonicalCreateContext.supplierName,
      isGenericUnit,
    });
  }, [canonicalCreateContext]);

  const openCanonicalIngredientCreate = (
    item: ItemRow,
    supplierName: string | null | undefined,
    invoiceId: string,
  ) => {
    const name = item.name.trim();
    if (!name || isPlaceholderItemName(name)) {
      setIngredientCreationErrors((current) => ({
        ...current,
        [item.id]: "Confirm the extracted name before creating an ingredient.",
      }));
      return;
    }
    setIngredientCreationErrors((current) => removeKey(current, item.id));
    setCanonicalCreateError(null);
    setCanonicalCreateContext({
      item,
      supplierName: supplierName?.trim() || null,
      invoiceId,
    });
  };

  const saveCanonicalIngredientFromInvoice = async (
    values: CanonicalIngredientCreateSubmitValues,
  ) => {
    if (!user || !canonicalCreateContext) {
      traceIngredientAliases("saveCanonicalIngredientFromInvoice:early-return", {
        branch: !user ? "no_user" : "no_context",
      });
      return;
    }
    const { item, supplierName, invoiceId: canonicalInvoiceId } = canonicalCreateContext;

    setCanonicalCreateSaving(true);
    setCanonicalCreateError(null);
    setCreatingIngredientByItem((current) => ({ ...current, [item.id]: true }));
    try {
      const result = await saveCanonicalIngredientFromInvoiceRow(
        {
          supabase,
          userId: user.id,
          catalog: ingredientCatalog,
          isGenericUnit,
          persistIngredientCorrection: persistIngredientCorrectionForItem,
        },
        { item, supplierName, invoiceId: canonicalInvoiceId },
        values,
      );
      if (!result.ok) {
        setCanonicalCreateError(result.error);
        return;
      }

      void dualWriteMatchLifecycleAfterIngredientPersist({
        item,
        ingredientId: result.ingredientId,
        invoiceId: canonicalInvoiceId,
        userId: user.id,
        matchKind: "manual",
      });

      setIngredientCatalog((current) =>
        current.some((row) => row.id === result.catalogRow.id)
          ? current
          : [...current, result.catalogRow as IngredientMatchRow],
      );
      dispatchOperationalIngredientCostChanged({
        trigger: "invoice_canonical_save",
        ingredientId: result.ingredientId,
      });
      void load();
      setCanonicalCreateContext(null);
      setCanonicalCreateError(null);
      setIngredientCreationErrors((current) => removeKey(current, item.id));
    } catch (err) {
      traceIngredientAliasesCatch("saveCanonicalIngredientFromInvoice", err, {
        invoiceAlias: canonicalCreateContext?.item.name,
      });
      setCanonicalCreateError(err instanceof Error ? err.message : "Could not create ingredient.");
    } finally {
      setCanonicalCreateSaving(false);
      setCreatingIngredientByItem((current) => removeKey(current, item.id));
    }
  };

  const saveBulkCanonicalIngredientsFromInvoice = async (
    invoiceId: string,
    supplierName: string | null | undefined,
    submissions: BulkCanonicalIngredientCreateSubmitRow[],
    candidates: ReturnType<typeof collectUnmatchedRowsForBulkCreate>,
  ) => {
    if (!user || submissions.length === 0) return { ok: false as const };

    const submissionByItemId = new Map(submissions.map((row) => [row.itemId, row]));
    const rows = candidates
      .filter((candidate) => submissionByItemId.has(candidate.item.id))
      .map((candidate) => {
        const submission = submissionByItemId.get(candidate.item.id)!;
        return {
          context: {
            item: candidate.item,
            supplierName: supplierName?.trim() || null,
            invoiceId,
          },
          values: buildBulkSubmitValuesFromDefaults(candidate.defaults, submission.canonicalName),
        };
      });

    setCreatingIngredientByItem((current) => {
      const next = { ...current };
      for (const row of rows) next[row.context.item.id] = true;
      return next;
    });

    const result = await executeBulkCanonicalIngredientCreate(
      {
        supabase,
        userId: user.id,
        catalog: ingredientCatalog,
        isGenericUnit,
        persistIngredientCorrection: persistIngredientCorrectionForItem,
        onCatalogRow: (row) => {
          setIngredientCatalog((current) =>
            current.some((entry) => entry.id === row.id)
              ? current
              : [...current, row as IngredientMatchRow],
          );
        },
      },
      rows,
    );

    setCreatingIngredientByItem((current) => {
      const next = { ...current };
      for (const row of rows) delete next[row.context.item.id];
      return next;
    });

    for (const outcome of result.outcomes) {
      if (outcome.result.ok) {
        const bulkRow = rows.find((row) => row.context.item.id === outcome.itemId);
        if (bulkRow) {
          void dualWriteMatchLifecycleAfterIngredientPersist({
            item: bulkRow.context.item,
            ingredientId: outcome.result.ingredientId,
            invoiceId,
            userId: user.id,
            matchKind: "manual",
          });
        }
        dispatchOperationalIngredientCostChanged({
          trigger: "invoice_canonical_save",
          ingredientId: outcome.result.ingredientId,
        });
        setIngredientCreationErrors((current) => removeKey(current, outcome.itemId));
      }
    }

    if (result.succeeded > 0) {
      void load();
    }

    return result;
  };

  const reExtract = async (row: InvoiceRow) => {
    if (!row.file_path) return;
    if (!isExtractableInvoicePath(row.file_path)) return;
    const ext = row.file_path.split(".").pop()?.toLowerCase() ?? "";
    const { data: signed } = await supabase.storage
      .from("invoices")
      .createSignedUrl(row.file_path, 120);
    if (!signed) return;
    const blob = await fetch(signed.signedUrl).then((r) => r.blob());
    const dataUrl = await fileToExtractionDataUrl(blob, row.file_path.split("/").pop() ?? `invoice.${ext}`);
    const result = await runExtraction(row.id, dataUrl);
    if (result) {
      const invoiceUpdatePayload: {
        supplier_name: string;
        invoice_date?: string;
        total: number;
      } = {
        supplier_name: result.supplier?.slice(0, 120) ?? row.supplier,
        ...(normalizeInvoiceDate(result.invoiceDate)
          ? { invoice_date: normalizeInvoiceDate(result.invoiceDate)! }
          : {}),
        total: typeof result?.total === "number" && result.total > 0 ? result.total : row.total,
      };
      const { data: updatedInvoice, error: invoiceUpdateError } = await supabase
        .from("invoices")
        .update(invoiceUpdatePayload)
        .eq("id", row.id)
        .select("invoice_date")
        .single();
      traceInvoiceDatePersistence("reextract-persist-date", {
        invoiceId: row.id,
        previousInvoiceDate: row.invoiceDate,
        extractedInvoiceDate: result.invoiceDate,
        persistedInvoiceDate: updatedInvoice?.invoice_date ?? invoiceUpdatePayload.invoice_date,
        persistenceError: invoiceUpdateError?.message,
      });
      if (invoiceUpdateError) throw invoiceUpdateError;
      traceInvoiceIdentity("persisted-invoice", {
        invoiceId: row.id,
        extractedSupplierName: result.supplier,
        extractedInvoiceNumber: result.invoiceNumber,
        extractedInvoiceDate: result.invoiceDate,
        persistedInvoiceDate: updatedInvoice?.invoice_date ?? invoiceUpdatePayload.invoice_date,
        persistedSupplierName: result.supplier?.slice(0, 120) ?? row.supplier,
        persistenceError: invoiceUpdateError?.message,
      });
      rememberInvoiceIdentity(row.id, {
        sourceFileName: row.sourceFileName,
        supplierName: result.supplier ?? null,
        invoiceNumber: result.invoiceNumber ?? null,
        invoiceDate: result.invoiceDate ?? null,
      });
      await loadItems(row.id, row.created_at);
      load();
    }
  };

  const openPreview = async (row: InvoiceRow) => {
    if (!row.file_path) return;
    const { data, error } = await supabase.storage
      .from("invoices")
      .createSignedUrl(row.file_path, 60 * 5);
    if (error || !data) return;
    const ext = row.file_path.split(".").pop()?.toLowerCase() ?? "";
    const type = ext === "pdf" ? "application/pdf" : `image/${ext === "jpg" ? "jpeg" : ext}`;
    setPreview({ url: data.signedUrl, type, name: row.supplier });
  };

  const removeRow = async (row: InvoiceRow) => {
    const affectedIngredientIds = await collectIngredientIdsForInvoiceHistory(supabase, row.id);
    if (row.file_path) await supabase.storage.from("invoices").remove([row.file_path]);
    const { error: deleteError } = await supabase.from("invoices").delete().eq("id", row.id);
    if (deleteError) {
      console.error("[invoices] delete failed:", deleteError.message);
      return;
    }
    if (affectedIngredientIds.length > 0) {
      const reconcileResult = await reconcileAfterInvoiceDelete(
        supabase,
        row.id,
        affectedIngredientIds,
      );
      const reconcileErrors = reconcileResult.ingredients.flatMap((entry) => entry.errors);
      if (reconcileErrors.length > 0) {
        console.error("[invoices] price history reconcile had errors:", reconcileErrors);
      }
      for (const ingredientId of affectedIngredientIds) {
        const syncResult = await syncIngredientProcurementPrice(supabase, ingredientId, {
          excludeInvoiceId: row.id,
        });
        if (syncResult.error) {
          console.error(
            "[invoices] syncIngredientProcurementPrice failed:",
            syncResult.error.message,
          );
        }
      }
    }
    load();
  };

  const confirmDeleteRow = async () => {
    if (!pendingDeleteRow) return;
    const row = pendingDeleteRow;
    setPendingDeleteRow(null);
    await removeRow(row);
  };

  return (
    <AppShell title="Invoices">
      <div className="app-route-scroll">
        <div className="min-w-0 shrink-0 pb-4 pt-6 lg:pt-10">
          <h1 className="text-2xl lg:text-3xl font-semibold tracking-tight text-foreground">
            Invoices
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Upload supplier invoices — your files stay private and are extracted automatically.
          </p>
        </div>
        {/* Operational snapshot */}
        <div className="mb-4">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-medium text-foreground">Purchasing Overview</h2>
            {availableKpiMonths.length > 0 && selectedKpiMonth ? (
              <Select value={selectedKpiMonth} onValueChange={setSelectedKpiMonth}>
                <SelectTrigger className="h-8 w-auto min-w-[132px] border-border bg-background px-2.5 text-sm font-medium">
                  <SelectValue>{formatInvoiceMonthLabel(selectedKpiMonth)}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {availableKpiMonths.map((monthKey) => (
                    <SelectItem key={monthKey} value={monthKey}>
                      {formatInvoiceMonthLabel(monthKey)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : null}
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {operationalSummaryCards.map((card) => (
              <Stat key={card.label} {...card} />
            ))}
          </div>
        </div>

        <div className="grid lg:grid-cols-3 gap-4">
          {/* Dropzone */}
          <Card className="lg:col-span-2">
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDrop(true);
              }}
              onDragLeave={() => setDrop(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDrop(false);
                if (e.dataTransfer.files?.length) enqueue(e.dataTransfer.files);
              }}
              onClick={() => inputRef.current?.click()}
              className={`cursor-pointer border-2 border-dashed rounded-2xl p-8 sm:p-12 text-center transition ${
                drop
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-foreground/30 hover:bg-muted/40"
              }`}
            >
              <input
                ref={inputRef}
                type="file"
                multiple
                className="hidden"
                accept=".pdf,.jpg,.jpeg,.png,.webp"
                onChange={(e) => {
                  if (e.target.files) enqueue(e.target.files);
                  e.target.value = "";
                }}
              />
              <div className="mx-auto h-14 w-14 rounded-2xl bg-foreground text-background grid place-items-center shadow-sm">
                <UploadCloud className="h-6 w-6" />
              </div>
              <div className="mt-4 text-base font-semibold">Drop invoices here</div>
              <div className="text-xs text-muted-foreground mt-1">
                or click to browse · PDF, JPG, PNG, WEBP · up to 20 MB each
              </div>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  inputRef.current?.click();
                }}
                className="mt-5 inline-flex items-center gap-2 bg-foreground text-background rounded-lg px-4 py-2 text-sm font-medium hover:opacity-90"
              >
                Choose files
              </button>
            </div>

            {globalError && (
              <div className="mt-3 text-xs text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2">
                {globalError}
              </div>
            )}

            {/* Pending uploads */}
            {pending.length > 0 && (
              <div className="mt-5 space-y-2">
                {pending.map((p) => (
                  <PendingItem key={p.id} item={p} />
                ))}
              </div>
            )}
          </Card>

          {/* Invoice reading side card */}
          <Card>
            <div className="flex items-start gap-3">
              <div className="h-9 w-9 rounded-lg bg-foreground text-background grid place-items-center shrink-0">
                <Sparkles className="h-4 w-4" />
              </div>
              <div>
                <div className="text-sm font-medium">Invoice reading</div>
                <div className="text-xs text-muted-foreground">What happens next</div>
              </div>
            </div>
            <ul className="mt-4 space-y-2.5 text-sm">
              {[
                "Files are uploaded to your private vault",
                "Supplier and invoice rows are prepared for review",
                "Quantities, units, and totals are separated when clear",
                "Prices compared with previous invoices",
                "Ingredient matches are shown separately",
              ].map((t) => (
                <li key={t} className="flex items-start gap-2">
                  <Check className="h-4 w-4 text-success mt-0.5 shrink-0" />
                  <span>{t}</span>
                </li>
              ))}
            </ul>
          </Card>
        </div>

        {/* Table */}
        <Card className="mt-4 p-0 overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 border-b border-border">
            <div>
              <div className="text-sm font-semibold">Your invoices</div>
              <div className="text-xs text-muted-foreground">All files are stored privately</div>
              {settlementOverview && (
                <div className="mt-1 text-[11px] text-muted-foreground/75">
                  {settlementOverview}
                </div>
              )}
            </div>
            <div className="flex items-center gap-3">
              <label className="inline-flex items-center gap-2 text-xs text-muted-foreground">
                Sort
                <select
                  value={sortBy}
                  onChange={(event) => setSortBy(event.target.value as SortOption)}
                  className="h-8 rounded-md border border-border bg-background px-2 text-xs text-foreground shadow-sm outline-none hover:bg-muted/40 focus:border-foreground/30"
                >
                  {SORT_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <span className="text-xs text-muted-foreground tabular-nums">
                {rows.length} total
              </span>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40">
                <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="py-3 px-5 font-medium w-8"></th>
                  <th className="py-3 px-5 font-medium">Source</th>
                  <th className="py-3 px-5 font-medium">Invoice</th>
                  <th className="py-3 px-5 font-medium hidden sm:table-cell">Date</th>
                  <th className="py-3 px-5 font-medium text-right hidden md:table-cell">Items</th>
                  <th className="py-3 px-5 font-medium text-right">Total</th>
                  <th className="py-3 px-5 font-medium hidden sm:table-cell">Status</th>
                  <th className="py-3 px-5 font-medium w-28"></th>
                </tr>
              </thead>
              <tbody
                className={`divide-y divide-border${invoicesLoading && rows.length > 0 ? " opacity-60" : ""}`}
              >
                {showInvoiceTableLoading && (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-sm text-muted-foreground">
                      <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
                      Loading invoices…
                    </td>
                  </tr>
                )}
                {showInvoiceTableEmpty && (
                  <tr>
                    <td colSpan={8} className="py-16 text-center">
                      <div className="mx-auto h-10 w-10 rounded-full bg-muted grid place-items-center mb-3">
                        <FileText className="h-5 w-5 text-muted-foreground" />
                      </div>
                      <div className="text-sm font-medium">No invoices yet</div>
                      <div className="text-xs text-muted-foreground mt-1">
                        Drop your first invoice above to get started.
                      </div>
                    </td>
                  </tr>
                )}
                {invoiceRowsForDisplay.map((r) => {
                  const open = expanded === r.id;
                  const isExtractable = isExtractableInvoicePath(r.file_path);
                  const items = itemsByInvoice[r.id] ?? [];
                  const settlementState = getSettlementState(r.id, settlementByInvoice);
                  const subtitle = invoiceSubtitle(r);
                  const unmatchedIngredientCount = unresolvedIngredientCountByInvoice[r.id] ?? 0;
                  return (
                    <Fragment key={r.id}>
                      <tr
                        className="hover:bg-muted/30 cursor-pointer"
                        onClick={() => toggleExpand(r)}
                      >
                        <td className="py-3 px-5 text-muted-foreground">
                          {open ? (
                            <ChevronDown className="h-4 w-4" />
                          ) : (
                            <ChevronRight className="h-4 w-4" />
                          )}
                        </td>
                        <td className="py-3 px-5">
                          <FileBadge path={r.file_url} />
                        </td>
                        <td className="py-3 px-5">
                          <div className="font-medium leading-tight">{r.supplier_name}</div>
                          {subtitle && (
                            <div className="mt-0.5 text-xs text-muted-foreground">
                              {r.supplierIsFallback ? subtitle : `Invoice ${subtitle}`}
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-5 text-muted-foreground hidden sm:table-cell">
                          {r.displayDate}
                        </td>
                        <td className="py-3 px-5 text-right tabular-nums hidden md:table-cell">
                          {r.items_count}
                        </td>
                        <td className="py-3 px-5 text-right tabular-nums font-medium">
                          €{Number(r.total).toFixed(2)}
                        </td>
                        <td className="py-3 px-5 hidden sm:table-cell">
                          <div className="flex flex-col items-start gap-1">
                            <InvoiceListIngredientStatusBadge
                              baseStatus={r.status}
                              unmatchedCount={unmatchedIngredientCount}
                            />
                            <SettlementBadge
                              state={settlementState}
                              onToggle={() => toggleSettlement(r.id)}
                            />
                          </div>
                        </td>
                        <td
                          className="py-3 px-5 text-right whitespace-nowrap"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {isExtractable && (
                            <button
                              onClick={() => reExtract(r)}
                              disabled={!!extracting[r.id]}
                              className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-30"
                              title="Re-read invoice"
                            >
                              {extracting[r.id] ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Wand2 className="h-4 w-4" />
                              )}
                            </button>
                          )}
                          <button
                            onClick={() => openPreview(r)}
                            disabled={!r.file_path}
                            className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-30"
                            title="Preview"
                          >
                            <Eye className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => setPendingDeleteRow(r)}
                            className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-muted"
                            title="Delete"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                      {open && (
                        <tr className="bg-muted/20">
                          <td colSpan={8} className="px-5 py-4">
                            <ItemsTable
                              invoiceId={r.id}
                              items={items}
                              extractionMetaByItemId={extractionMetaByItemId}
                              priceComparisons={priceComparisonsByInvoice[r.id] ?? {}}
                              ingredientCatalog={ingredientCatalog}
                              operationalMetadata={invoiceOperationalMetadata}
                              allInvoiceSupplierNames={rows.map((row) => row.supplier_name)}
                              confirmedIngredientAliases={confirmedIngredientAliases}
                              supplierName={r.supplier_name}
                              persistedMatchByItemId={
                                isMatchLifecycleReadCutoverEnabled()
                                  ? persistedMatchByItemId
                                  : undefined
                              }
                              userId={user?.id}
                              loading={itemsByInvoice[r.id] === undefined}
                              extracting={!!extracting[r.id]}
                              onExtract={isExtractable ? () => reExtract(r) : undefined}
                              onCreateIngredient={(item) =>
                                openCanonicalIngredientCreate(item, r.supplier_name, r.id)
                              }
                              onConfirmIngredientMatch={(item, match) =>
                                confirmIngredientMatch(item, match, r.id, r.supplier_name)
                              }
                              onSelectIngredientForItem={(item, ingredientId, lifecycle) =>
                                selectIngredientForItem(
                                  item,
                                  ingredientId,
                                  r.id,
                                  r.supplier_name,
                                  lifecycle,
                                )
                              }
                              onUnmatchInvoiceLine={(item, options) =>
                                unmatchInvoiceLine(item, r.id, r.supplier_name, options)
                              }
                              onBulkCreateIngredients={(submissions, candidates) =>
                                saveBulkCanonicalIngredientsFromInvoice(
                                  r.id,
                                  r.supplier_name,
                                  submissions,
                                  candidates,
                                )
                              }
                              creatingIngredientByItem={creatingIngredientByItem}
                              ingredientCreationErrors={ingredientCreationErrors}
                              rejectedMatchItemIds={rejectedMatchItemIds}
                              onRejectedMatchItemIdsChange={setRejectedMatchItemIds}
                            />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>

        {preview && <PreviewModal preview={preview} onClose={() => setPreview(null)} />}
        <CanonicalIngredientCreateDialog
          open={canonicalCreateContext !== null}
          onOpenChange={(open) => {
            if (!open) {
              setCanonicalCreateContext(null);
              setCanonicalCreateError(null);
            }
          }}
          defaults={canonicalCreateDefaults}
          saving={canonicalCreateSaving}
          error={canonicalCreateError}
          onSubmit={(values) => void saveCanonicalIngredientFromInvoice(values)}
        />
        <ConfirmDeleteDialog
          open={pendingDeleteRow !== null}
          onOpenChange={(open) => {
            if (!open) setPendingDeleteRow(null);
          }}
          onConfirm={() => void confirmDeleteRow()}
        />
      </div>
    </AppShell>
  );
}

function Stat({ label, value, detail, tone = "muted" }: InvoiceKpiSummaryCard) {
  const detailClass =
    tone === "increase"
      ? "text-destructive/75"
      : tone === "decrease"
        ? "text-success/75"
        : tone === "steady"
          ? "text-foreground/60"
          : "text-muted-foreground";

  return (
    <div className="card-surface p-4 min-h-[112px]">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-2 text-lg font-semibold leading-tight tabular-nums">{value}</div>
      <div className={`mt-2 text-[11px] leading-snug ${detailClass}`}>{detail}</div>
    </div>
  );
}

function PendingItem({ item }: { item: Pending }) {
  const isImage = item.file.type.startsWith("image/");
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-3">
      <div className="h-12 w-12 rounded-lg bg-muted grid place-items-center overflow-hidden shrink-0">
        {isImage ? (
          <img src={item.previewUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <FileText className="h-5 w-5 text-muted-foreground" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <div className="text-sm font-medium truncate">{item.file.name}</div>
          <span className="text-xs text-muted-foreground tabular-nums shrink-0">
            {(item.file.size / 1024).toFixed(0)} KB
          </span>
        </div>
        <div className="mt-2 h-1.5 rounded-full bg-muted overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${
              item.status === "error"
                ? "bg-destructive"
                : item.status === "done"
                  ? "bg-success"
                  : "bg-foreground"
            }`}
            style={{ width: `${item.progress}%` }}
          />
        </div>
        {item.status === "error" && (
          <div className="text-xs text-destructive mt-1">{item.error}</div>
        )}
      </div>
      <div className="text-xs text-muted-foreground shrink-0 inline-flex items-center gap-1.5">
        {item.status === "uploading" && (
          <>
            <Loader2 className="h-3 w-3 animate-spin" /> Uploading
          </>
        )}
        {item.status === "done" && (
          <>
            <Check className="h-3 w-3 text-success" /> Done
          </>
        )}
        {item.status === "error" && <>Failed</>}
        {item.status === "queued" && <>Queued</>}
      </div>
    </div>
  );
}

function FileBadge({ path }: { path: string | null }) {
  if (!path) {
    return (
      <div className="h-9 w-9 rounded-lg bg-muted grid place-items-center">
        <FileText className="h-4 w-4 text-muted-foreground" />
      </div>
    );
  }
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  const isImage = ["png", "jpg", "jpeg", "webp"].includes(ext);
  return (
    <div
      className={`h-9 w-9 rounded-lg grid place-items-center ${isImage ? "bg-chart-2/20 text-chart-2" : "bg-foreground/5 text-foreground"}`}
    >
      {isImage ? <ImageIcon className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
    </div>
  );
}

function SettlementBadge({ state, onToggle }: { state: SettlementState; onToggle: () => void }) {
  const settled = state === "settled";
  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        onToggle();
      }}
      className={`inline-flex items-center gap-1 rounded-md px-0.5 py-0 text-[10px] font-normal leading-tight transition hover:bg-muted/50 ${
        settled
          ? "text-success/70 hover:text-success"
          : "text-destructive/65 hover:text-destructive/80"
      }`}
      title={settled ? "Mark as settlement pending" : "Mark as settled"}
    >
      <span className={`h-1 w-1 rounded-full ${settled ? "bg-success/60" : "bg-destructive/45"}`} />
      {settled ? "Settled" : "Settlement pending"}
    </button>
  );
}

function MissingValue({ label }: { label: string }) {
  return (
    <span className="text-muted-foreground/60" title={`${label} was not separated confidently`}>
      Check
    </span>
  );
}

function InvoiceListIngredientStatusBadge({
  baseStatus,
  unmatchedCount,
}: {
  baseStatus: string;
  unmatchedCount: number;
}) {
  const { tone, label } = deriveInvoiceListIngredientStatus({ baseStatus, unmatchedCount });
  const toneClass =
    tone === "success"
      ? "bg-success/10 text-success"
      : tone === "warning"
        ? "bg-amber-500/10 text-amber-700 dark:text-amber-300"
        : tone === "review"
          ? "bg-destructive/10 text-destructive"
          : "bg-warning/15 text-warning-foreground";

  return (
    <span
      className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium leading-snug ${toneClass}`}
      title={
        tone === "warning"
          ? "Invoice lines extracted but some ingredients are not linked to your catalog yet."
          : undefined
      }
    >
      {label}
    </span>
  );
}

function OperationalBadge({
  label,
  tone = "muted",
  title,
}: {
  label: string;
  tone?: "muted" | "review" | "success" | "increase" | "decrease";
  title?: string;
}) {
  const toneClass =
    tone === "review"
      ? "border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-300"
      : tone === "success"
        ? "border-success/20 bg-success/10 text-success/80"
        : tone === "increase"
          ? "border-destructive/20 bg-destructive/10 text-destructive/80"
          : tone === "decrease"
            ? "border-success/20 bg-success/10 text-success/80"
            : "border-border bg-muted/40 text-muted-foreground";

  return (
    <span
      className={`rounded-full border px-2 py-0.5 text-[11px] font-medium leading-none ${toneClass}`}
      title={title}
    >
      {label}
    </span>
  );
}

function PreviewModal({
  preview,
  onClose,
}: {
  preview: { url: string; type: string; name: string };
  onClose: () => void;
}) {
  const isPdf = preview.type === "application/pdf";
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center p-4 bg-foreground/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-card border border-border rounded-2xl shadow-xl max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 h-14 border-b border-border">
          <div className="text-sm font-semibold truncate">{preview.name}</div>
          <button onClick={onClose} className="p-1.5 rounded-md hover:bg-muted">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 bg-muted/30 overflow-auto grid place-items-center">
          {isPdf ? (
            <iframe src={preview.url} title={preview.name} className="w-full h-[80vh]" />
          ) : (
            <img
              src={preview.url}
              alt={preview.name}
              className="max-w-full max-h-[80vh] object-contain"
            />
          )}
        </div>
      </div>
    </div>
  );
}

function InvoiceNormalizationCardCell({ card }: { card: InvoiceLineNormalizationCard }) {
  const lines = [
    card.purchaseQuantityLine,
    card.purchasePriceLine,
    card.normalizedLine,
    card.usableCostLine,
  ].filter((line): line is string => Boolean(line?.trim()));

  if (lines.length === 0) {
    return <span className="text-muted-foreground/60">—</span>;
  }

  return (
    <div className="min-w-[10.5rem] max-w-xs space-y-0.5 text-xs leading-snug tabular-nums">
      {card.purchaseQuantityLine && (
        <div className="text-foreground">{card.purchaseQuantityLine}</div>
      )}
      {card.purchasePriceLine && (
        <div className="text-muted-foreground">{card.purchasePriceLine}</div>
      )}
      {card.normalizedLine && <div className="text-foreground">{card.normalizedLine}</div>}
      {card.usableCostLine && (
        <div className="font-medium text-foreground">{card.usableCostLine}</div>
      )}
    </div>
  );
}

function ItemsTable({
  invoiceId,
  items,
  extractionMetaByItemId,
  priceComparisons,
  ingredientCatalog,
  operationalMetadata,
  allInvoiceSupplierNames,
  confirmedIngredientAliases,
  supplierName,
  persistedMatchByItemId,
  userId,
  creatingIngredientByItem,
  ingredientCreationErrors,
  loading,
  extracting,
  onExtract,
  onCreateIngredient,
  onConfirmIngredientMatch,
  onSelectIngredientForItem,
  onUnmatchInvoiceLine,
  onBulkCreateIngredients,
  rejectedMatchItemIds,
  onRejectedMatchItemIdsChange,
}: {
  invoiceId: string;
  items: ItemRow[];
  extractionMetaByItemId: Record<string, InvoiceOcrQtyExtractionMeta>;
  priceComparisons: PriceComparisonMap;
  ingredientCatalog: IngredientMatchRow[];
  operationalMetadata: InvoiceOperationalMetadata;
  allInvoiceSupplierNames: string[];
  confirmedIngredientAliases: IngredientAliasMap;
  supplierName?: string | null;
  persistedMatchByItemId?: ReadonlyMap<
    string,
    import("@/lib/invoice-item-match-read-cutover").PersistedMatchForCutover
  >;
  userId?: string;
  creatingIngredientByItem: IngredientCreationState;
  ingredientCreationErrors: IngredientCreationErrors;
  rejectedMatchItemIds: Set<string>;
  onRejectedMatchItemIdsChange: React.Dispatch<React.SetStateAction<Set<string>>>;
  loading: boolean;
  extracting: boolean;
  onExtract?: () => void;
  onCreateIngredient: (item: ItemRow) => void;
  onConfirmIngredientMatch: (item: ItemRow, match: IngredientCanonicalMatch) => void;
  onSelectIngredientForItem: (
    item: ItemRow,
    ingredientId: string,
    lifecycle?: IngredientSelectLifecycleOptions,
  ) => Promise<{ ok: boolean; error?: string }>;
  onUnmatchInvoiceLine: (
    item: ItemRow,
    options: {
      previousIngredientId?: string | null;
      wasConfirmed?: boolean;
      rawItemName?: string | null;
    },
  ) => Promise<{ ok: boolean; error?: string }>;
  onBulkCreateIngredients: (
    submissions: BulkCanonicalIngredientCreateSubmitRow[],
    candidates: ReturnType<typeof collectUnmatchedRowsForBulkCreate>,
  ) => Promise<
    | { ok: false }
    | {
        outcomes: Array<{
          itemId: string;
          invoiceAlias: string;
          result: { ok: boolean; error?: string };
        }>;
        succeeded: number;
        failed: number;
      }
  >;
}) {
  const [editingMatchRowId, setEditingMatchRowId] = useState<string | null>(null);
  const [savingCorrectionLineId, setSavingCorrectionLineId] = useState<string | null>(null);
  const [bulkCreateSheetOpen, setBulkCreateSheetOpen] = useState(false);
  const [bulkCreateSaving, setBulkCreateSaving] = useState(false);
  const [bulkCreateError, setBulkCreateError] = useState<string | null>(null);
  const correctionSnapshotRef = useRef<
    Map<string, { previousIngredientId: string | null; wasConfirmed: boolean }>
  >(new Map());

  const ingredientPickerOptions = useMemo(() => {
    const built = buildIngredientPickerOptionsForInvoice(
      ingredientCatalog,
      confirmedIngredientAliases,
    );
    traceIngredientPickerOptionsStage("05b_invoice_table_picker_options", built, {
      component: "ItemsTable",
      catalogLength: ingredientCatalog.length,
      confirmedAliasCount: Object.keys(confirmedIngredientAliases).length,
    });
    return built;
  }, [ingredientCatalog, confirmedIngredientAliases]);
  const knownSupplierNames = buildKnownSupplierNames(
    allInvoiceSupplierNames,
    normalizeSupplierDisplayName(supplierName).toLocaleLowerCase() || null,
  );
  const isNewSupplier = isNewSupplierForInvoice(supplierName, knownSupplierNames);
  const ingredientById = useMemo(
    () => new Map(ingredientCatalog.map((row) => [row.id, row])),
    [ingredientCatalog],
  );
  const matchCatalog = useMemo(
    () =>
      buildInvoiceMatchCatalog(
        ingredientCatalog,
        items.map((item) => ({ name: normalizeInvoiceItemFields(item).name })),
      ),
    [ingredientCatalog, items],
  );

  const openIngredientCorrection = (
    item: ItemRow,
    options: {
      ingredientMatch?: IngredientCanonicalMatch | null;
      possibleIngredientMatch?: IngredientCanonicalMatch | null;
      wasConfirmed?: boolean;
    },
  ) => {
    const previousIngredientId =
      options.ingredientMatch?.ingredient.id ??
      options.possibleIngredientMatch?.ingredient.id ??
      null;
    correctionSnapshotRef.current.set(item.id, {
      previousIngredientId,
      wasConfirmed: options.wasConfirmed === true,
    });
    setEditingMatchRowId(item.id);
  };

  const closeIngredientCorrection = (itemId: string) => {
    correctionSnapshotRef.current.delete(itemId);
    setEditingMatchRowId((current) => (current === itemId ? null : current));
  };

  const handleSelectCorrectionIngredient = async (
    item: ItemRow,
    ingredientId: string,
    rawName: string,
  ) => {
    const snapshot = correctionSnapshotRef.current.get(item.id);
    const previousIngredientId = snapshot?.previousIngredientId ?? null;
    const wasConfirmed = snapshot?.wasConfirmed ?? false;
    correctionSnapshotRef.current.delete(item.id);
    setEditingMatchRowId(null);

    if (previousIngredientId && previousIngredientId !== ingredientId) {
      rejectIngredientMatchPair({
        itemName: item.name,
        rawItemName: rawName,
        rejectedIngredientId: previousIngredientId,
        supplierName,
        userId,
      });
    }

    if (previousIngredientId === ingredientId) {
      return;
    }

    setSavingCorrectionLineId(item.id);
    onRejectedMatchItemIdsChange((current) => {
      const next = new Set(current);
      next.delete(item.id);
      return next;
    });
    const result = await onSelectIngredientForItem(item, ingredientId, {
      previousIngredientId,
      wasConfirmed,
    });
    setSavingCorrectionLineId(null);
    if (result.ok) {
      toast("Ingredient mapping saved");
      return;
    }
    if (result.error) {
      toast.error(result.error);
    }
  };

  const handleRemoveCorrectionMatch = async (item: ItemRow, rawName: string) => {
    const snapshot = correctionSnapshotRef.current.get(item.id);
    const previousIngredientId = snapshot?.previousIngredientId ?? null;
    const wasConfirmed = snapshot?.wasConfirmed ?? false;
    correctionSnapshotRef.current.delete(item.id);
    setEditingMatchRowId(null);

    if (!previousIngredientId) {
      return;
    }

    setSavingCorrectionLineId(item.id);
    const result = await onUnmatchInvoiceLine(item, {
      previousIngredientId,
      wasConfirmed,
      rawItemName: rawName,
    });
    setSavingCorrectionLineId(null);
    if (result.ok) {
      toast("Match removed");
      return;
    }
    if (result.error) {
      toast.error(result.error);
    }
  };

  const operationalSummary = items.reduce(
    (summary, item) => {
      const rawName = item.name;
      const rowItem = normalizeInvoiceItemFields(item);
      traceInvoiceIngredientMatchPipeline({
        stage: "summary:after-normalize",
        rowId: rowItem.id,
        rawName,
        resolvedName: rowItem.name,
        nameChanged: rawName !== rowItem.name,
        ingredientCatalogLength: ingredientCatalog.length,
      });
      const { state } = resolveInvoiceTableRowIngredientMatch(
        rowItem.name,
        matchCatalog,
        confirmedIngredientAliases,
        supplierName,
        { stage: "summary:after-canonical", rowId: rowItem.id, rawName },
        buildCutoverContextForInvoiceItem(rowItem.id, persistedMatchByItemId),
      );
      const bucket = invoiceRowMatchSummaryBucket(state.displayState);
      if (bucket === "matched") {
        summary.matchedIngredients += 1;
      } else if (bucket === "suggested") {
        summary.possibleIngredientMatches += 1;
      } else {
        summary.unmatchedIngredients += 1;
      }

      if (needsExtractionConfirmation(item, extractionMetaByItemId[rowItem.id])) {
        summary.extractionReview += 1;
      }
      if (needsQuantityUnitConfirmation(item)) summary.quantityReview += 1;

      const delta = getPriceDeltaDetails(item.unit_price, priceComparisons[item.id]);
      if (delta?.direction === "increased") summary.priceIncreases += 1;
      if (delta?.direction === "decreased") summary.priceDecreases += 1;

      return summary;
    },
    {
      matchedIngredients: 0,
      possibleIngredientMatches: 0,
      unmatchedIngredients: 0,
      extractionReview: 0,
      quantityReview: 0,
      priceIncreases: 0,
      priceDecreases: 0,
    },
  );
  const hasExtractionReview = operationalSummary.extractionReview > 0;
  const hasUnmatchedIngredients = operationalSummary.unmatchedIngredients > 0;
  const hasPossibleIngredientMatches = operationalSummary.possibleIngredientMatches > 0;
  const priceMovementCount = operationalSummary.priceIncreases + operationalSummary.priceDecreases;

  const bulkCreateCandidates = useMemo(
    () =>
      collectUnmatchedRowsForBulkCreate({
        items,
        ingredientCatalog,
        confirmedAliases: confirmedIngredientAliases,
        supplierName,
        isGenericUnit,
      }),
    [items, ingredientCatalog, confirmedIngredientAliases, supplierName],
  );

  const handleBulkCreateSubmit = async (submissions: BulkCanonicalIngredientCreateSubmitRow[]) => {
    setBulkCreateSaving(true);
    setBulkCreateError(null);
    try {
      const result = await onBulkCreateIngredients(submissions, bulkCreateCandidates);
      if ("ok" in result && result.ok === false) {
        setBulkCreateError("Could not create ingredients.");
        return;
      }
      if (result.failed > 0 && result.succeeded === 0) {
        const firstError = result.outcomes.find((outcome) => !outcome.result.ok)?.result.error;
        setBulkCreateError(firstError ?? "Could not create ingredients.");
        return;
      }
      if (result.failed > 0) {
        toast.error(
          `Created ${result.succeeded} ingredient${result.succeeded === 1 ? "" : "s"}; ${result.failed} failed.`,
        );
      } else {
        toast(`Created ${result.succeeded} ingredient${result.succeeded === 1 ? "" : "s"}`);
      }
      setBulkCreateSheetOpen(false);
      setBulkCreateError(null);
    } finally {
      setBulkCreateSaving(false);
    }
  };

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-border">
        <div>
          <div className="text-sm font-semibold inline-flex items-center gap-2">
            <Sparkles className="h-3.5 w-3.5 text-primary" /> Extracted invoice rows
            {hasExtractionReview && !loading && !extracting && (
              <OperationalBadge label="Needs review" tone="review" />
            )}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            <span>Invoice lines are ready for costing review</span>
            {!loading && !extracting && items.length > 0 && (
              <>
                <span className="text-muted-foreground/40">•</span>
                <span>{operationalSummary.matchedIngredients} ingredient matches</span>
                {hasExtractionReview && (
                  <>
                    <span className="text-muted-foreground/40">•</span>
                    <span>{operationalSummary.extractionReview} rows need review</span>
                  </>
                )}
                {operationalSummary.quantityReview > 0 && (
                  <>
                    <span className="text-muted-foreground/40">•</span>
                    <span>{operationalSummary.quantityReview} need quantity check</span>
                  </>
                )}
                {hasPossibleIngredientMatches && (
                  <>
                    <span className="text-muted-foreground/40">•</span>
                    <span>
                      {operationalSummary.possibleIngredientMatches} possible ingredient matches
                    </span>
                  </>
                )}
                {hasUnmatchedIngredients && (
                  <>
                    <span className="text-muted-foreground/40">•</span>
                    <span>{operationalSummary.unmatchedIngredients} not in ingredient list</span>
                  </>
                )}
                {priceMovementCount > 0 && (
                  <>
                    <span className="text-muted-foreground/40">•</span>
                    <span>{priceMovementCount} price movements</span>
                  </>
                )}
              </>
            )}
          </div>
        </div>
        {onExtract && (
          <button
            onClick={onExtract}
            disabled={extracting}
            className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-md border border-border hover:bg-muted disabled:opacity-50"
          >
            {extracting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Wand2 className="h-3.5 w-3.5" />
            )}
            {extracting ? "Reading…" : "Re-read"}
          </button>
        )}
      </div>
      {hasUnmatchedIngredients && !loading && !extracting && bulkCreateCandidates.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-amber-500/[0.06] px-4 py-3">
          <p className="text-sm">
            <span className="font-medium">{bulkCreateCandidates.length}</span> new ingredient
            {bulkCreateCandidates.length === 1 ? "" : "s"} detected
          </p>
          <button
            type="button"
            onClick={() => {
              setBulkCreateError(null);
              setBulkCreateSheetOpen(true);
            }}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium hover:bg-muted"
          >
            Review &amp; Create
          </button>
        </div>
      )}
      <BulkCanonicalIngredientCreateSheet
        open={bulkCreateSheetOpen}
        onOpenChange={(open) => {
          if (!open) setBulkCreateError(null);
          setBulkCreateSheetOpen(open);
        }}
        candidates={bulkCreateCandidates}
        saving={bulkCreateSaving}
        error={bulkCreateError}
        onSubmit={(rows) => void handleBulkCreateSubmit(rows)}
      />
      {loading || extracting ? (
        <div className="py-8 text-center text-xs text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin inline mr-2" /> Reading invoice…
        </div>
      ) : items.length === 0 ? (
        <div className="py-8 text-center">
          <div className="text-sm font-medium">No invoice rows yet</div>
          <div className="text-xs text-muted-foreground mt-1">
            {onExtract
              ? "The invoice table was not prepared into rows. Re-read after checking the file image."
              : "This file has no parsed table rows to review."}
          </div>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40">
              <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="py-2 px-3 font-medium">Ingredient</th>
                <th className="py-2 px-3 font-medium">Operational cost</th>
                <th className="py-2 px-3 font-medium text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {items.map((it, index) => {
                const rawName = it.name;
                const renderItem = normalizeInvoiceItemFields(it);
                traceInvoiceIngredientMatchPipeline({
                  stage: "render:after-normalize",
                  rowId: renderItem.id,
                  rawName,
                  resolvedName: renderItem.name,
                  nameChanged: rawName !== renderItem.name,
                  ingredientCatalogLength: ingredientCatalog.length,
                });
                const { match: ingredientMatch, state: ingredientMatchState } =
                  resolveInvoiceTableRowIngredientMatch(
                    renderItem.name,
                    matchCatalog,
                    confirmedIngredientAliases,
                    supplierName,
                    { stage: "render:after-canonical", rowId: renderItem.id, rawName },
                    buildCutoverContextForInvoiceItem(renderItem.id, persistedMatchByItemId),
                  );
                traceInvoiceIngredientMatchPipeline({
                  stage: "render:final-jsx",
                  rowId: renderItem.id,
                  rawName,
                  resolvedName: renderItem.name,
                  ingredientCatalogLength: ingredientCatalog.length,
                  match: ingredientMatch
                    ? {
                        kind: ingredientMatch.kind,
                        ingredientId: ingredientMatch.ingredient.id ?? null,
                        ingredientName: ingredientMatch.ingredient.name ?? null,
                        scoreBreakdown: ingredientMatch.scoreBreakdown,
                      }
                    : null,
                  display: {
                    displayState: ingredientMatchState.displayState,
                    possibleMatch: ingredientMatchState.possibleMatch,
                    unmatched: ingredientMatchState.unmatched,
                    showMatchTargetLine: ingredientMatchState.showMatchTargetLine,
                    badgeLabel: ingredientMatchState.badgeLabel,
                  },
                });
                const {
                  confirmedMatch: confirmedIngredientMatch,
                  possibleMatch: possibleIngredientMatch,
                  unmatched: unmatchedIngredient,
                  badgeLabel: suggestedMatchBadgeLabel,
                } = ingredientMatchState;
                const extractionReview = needsExtractionConfirmation(
                  renderItem,
                  extractionMetaByItemId[renderItem.id],
                );
                const quantityReview = needsQuantityUnitConfirmation(renderItem);
                const amountReview = needsAmountConfirmation(renderItem);
                const mathematicalReconciliationReviewReason =
                  deriveMathematicalReconciliationReviewReason(renderItem);
                const ocrQtyMismatchReviewReason = deriveOcrQtyMismatchReviewReason(
                  extractionMetaByItemId[renderItem.id],
                );
                const canCreateIngredient = !isPlaceholderItemName(renderItem.name);
                const creatingIngredient = !!creatingIngredientByItem[renderItem.id];
                const creationError = ingredientCreationErrors[renderItem.id];
                const matchedIngredientForStock = ingredientMatch
                  ? (ingredientById.get(ingredientMatch.ingredient.id)?.name ??
                    ingredientMatch.ingredient.name ??
                    null)
                  : null;
                const purchaseLabel = getInvoiceItemPurchaseLabel({
                  ...renderItem,
                  matchedIngredientName: matchedIngredientForStock,
                });
                const stockPresentation = getInvoiceItemStockPresentation(
                  renderItem,
                  matchedIngredientForStock,
                );
                if (index === 0) {
                  const stockMeta = resolveInvoiceLineStockPresentation(
                    {
                      name: renderItem.name,
                      quantity: renderItem.quantity,
                      unit: renderItem.unit,
                      matchedIngredientName: matchedIngredientForStock,
                    },
                    renderItem.id,
                  );
                  traceInvoiceQuantityStage("render-row:first-item", renderItem, {
                    purchaseLabel,
                    stockLabel: stockPresentation?.quantityLabel ?? null,
                    stockNormalizationPipeline: stockMeta.pipelineId,
                    stockRenderSource: stockMeta.renderSource,
                  });
                }
                if (!purchaseLabel || !stockPresentation) {
                  traceInvoiceQuantityStage("render-fallback:first-missing", renderItem, {
                    missingPurchaseLabel: !purchaseLabel,
                    missingStockPresentation: !stockPresentation,
                  });
                }
                const correctionUi = resolveIngredientCorrectionUiState(
                  renderItem.id,
                  ingredientMatchState,
                  rejectedMatchItemIds,
                );
                const showSuggestedMatch =
                  possibleIngredientMatch &&
                  suggestedMatchBadgeLabel &&
                  !correctionUi.suppressMatchPresentation;
                const matchContext = {
                  confirmedAliases: confirmedIngredientAliases,
                  supplierName,
                };
                const matchExplanation = ingredientMatch
                  ? buildMatchExplanation(ingredientMatch, matchContext)
                  : null;
                const matchedIngredient = ingredientMatch
                  ? ingredientById.get(ingredientMatch.ingredient.id)
                  : undefined;
                const matchTargetLabel = ingredientMatch
                  ? buildMatchTargetLabel(ingredientMatch, matchContext, matchedIngredient)
                  : null;
                const lineSignals = deriveInvoiceLineOperationalSignals(
                  renderItem,
                  matchedIngredient ?? ingredientMatch?.ingredient ?? null,
                  {
                    previousInvoiceLinePrice: priceComparisons[renderItem.id],
                    recipeCountByIngredientId: operationalMetadata.recipeCountByIngredientId,
                    volatileIngredientIds: operationalMetadata.volatileIngredientIds,
                    priceHistoryLatestAtByIngredientId:
                      operationalMetadata.priceHistoryLatestAtByIngredientId,
                    aliasCreatedAtByLookupKey: operationalMetadata.aliasCreatedAtByLookupKey,
                    isNewSupplier,
                    currentSupplierName: supplierName,
                    matchKind: ingredientMatch?.kind ?? null,
                    normalizedItemName: normalizeInvoiceIngredientName(renderItem.name),
                  },
                );
                const pricingPresentation = resolveInvoiceLinePricingPresentation({
                  name: renderItem.name,
                  quantity: renderItem.quantity,
                  unit: renderItem.unit,
                  unit_price: renderItem.unit_price,
                  line_total: renderItem.total,
                  matchedIngredientName: matchedIngredientForStock,
                });
                const inlineChips = deriveInvoiceRowInlineChips({
                  matchedAutomatically:
                    confirmedIngredientMatch &&
                    !correctionUi.suppressMatchPresentation &&
                    !extractionReview &&
                    !quantityReview &&
                    !amountReview,
                  confidenceLabel: matchExplanation?.confidenceLabel ?? null,
                  unmatched:
                    unmatchedIngredient ||
                    (correctionUi.suppressMatchPresentation && !ingredientMatch),
                  suggestedMatch: showSuggestedMatch,
                  signals: lineSignals,
                  previousInvoiceLinePrice: priceComparisons[renderItem.id],
                  currentUnitPrice: renderItem.unit_price,
                  matchTooltip: matchExplanation
                    ? formatMatchReasoningTooltip(matchExplanation)
                    : null,
                });
                const correctionOpen = editingMatchRowId === renderItem.id;
                const correctionBusy = savingCorrectionLineId === renderItem.id;
                const showIngredientMatchPicker =
                  Boolean(matchTargetLabel) ||
                  correctionUi.showPicker ||
                  correctionOpen ||
                  unmatchedIngredient;

                return (
                  <tr
                    key={renderItem.id}
                    className={`transition-colors ${
                      extractionReview
                        ? "bg-amber-500/[0.04] hover:bg-amber-500/[0.07]"
                        : "hover:bg-muted/20"
                    }`}
                  >
                    <td className="px-3 py-2">
                      <div className="space-y-0.5">
                        <div className="text-sm font-medium leading-tight">{renderItem.name}</div>
                        {showIngredientMatchPicker && (
                          <InvoiceIngredientCorrectionPicker
                            open={correctionOpen}
                            onOpenChange={(nextOpen) => {
                              if (nextOpen) {
                                openIngredientCorrection(renderItem, {
                                  ingredientMatch,
                                  possibleIngredientMatch,
                                  wasConfirmed: ingredientMatchState.displayState === "confirmed",
                                });
                                return;
                              }
                              closeIngredientCorrection(renderItem.id);
                            }}
                            onCancel={() => closeIngredientCorrection(renderItem.id)}
                            ingredients={ingredientPickerOptions}
                            selectedIngredientId={ingredientMatch?.ingredient.id ?? null}
                            matchLabel={
                              matchTargetLabel ? formatMatchTargetLabel(matchTargetLabel) : null
                            }
                            ingredientId={ingredientMatch?.ingredient.id ?? null}
                            onSelect={(ingredientId) =>
                              void handleSelectCorrectionIngredient(
                                renderItem,
                                ingredientId,
                                rawName,
                              )
                            }
                            onSelectNoMatch={() =>
                              void handleRemoveCorrectionMatch(renderItem, rawName)
                            }
                            onCreateIngredient={() => onCreateIngredient(renderItem)}
                            createIngredientDisabled={
                              creatingIngredient || !canCreateIngredient
                            }
                            disabled={correctionBusy}
                          />
                        )}
                        {(inlineChips.length > 0 ||
                          mathematicalReconciliationReviewReason ||
                          ocrQtyMismatchReviewReason) && (
                          <div className="flex flex-wrap items-center gap-1 pt-0.5">
                            {inlineChips.map((chip) => (
                              <OperationalBadge
                                key={chip.label}
                                label={chip.label}
                                tone={chip.tone}
                                title={chip.title}
                              />
                            ))}
                            {mathematicalReconciliationReviewReason && (
                              <OperationalBadge
                                key="mathematical-reconciliation"
                                label="Math mismatch"
                                tone="review"
                                title={MATHEMATICAL_RECONCILIATION_FAILURE_MESSAGE}
                              />
                            )}
                            {ocrQtyMismatchReviewReason && (
                              <OperationalBadge
                                key="ocr-quantity-mismatch"
                                label="OCR qty mismatch"
                                tone="review"
                                title={OCR_QUANTITY_MISMATCH_MESSAGE}
                              />
                            )}
                          </div>
                        )}
                        {correctionUi.showConfirm && possibleIngredientMatch && (
                          <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                            <IngredientCorrectionActions
                              showConfirm
                              onConfirm={() =>
                                onConfirmIngredientMatch(renderItem, possibleIngredientMatch)
                              }
                            />
                          </div>
                        )}
                        {creationError && (
                          <div className="text-[11px] text-destructive">{creationError}</div>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2 align-top">
                      <InvoiceNormalizationCardCell card={pricingPresentation.card} />
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-sm font-medium">
                      {renderItem.total != null ? (
                        `€${Number(renderItem.total).toFixed(2)}`
                      ) : (
                        <MissingValue label="Total" />
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
