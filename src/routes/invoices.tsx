import { createFileRoute } from "@tanstack/react-router";
import { AppShell, Card } from "@/components/AppShell";
import { StatusPill } from "./index";
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
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { normalizeIngredientName } from "@/lib/normalizeIngredient";
import {
  inferPurchaseUnitsFromLineItemName,
  type UnitInferenceResult,
  type PackageType,
} from "@/lib/ingredient-unit-inference";
import { formatQuantityWithUnit } from "@/lib/display-format";
import {
  findCanonicalIngredientMatch,
  normalizeInvoiceIngredientName,
  type IngredientAliasMap,
  type IngredientCanonicalMatch,
} from "@/lib/ingredient-canonical";
import {
  fileNameFromInvoicePath,
  looksLikeUploadedFileName,
  normalizeInvoiceDate,
  normalizeInvoiceNumber,
  normalizeSupplierDisplayName,
} from "@/lib/supplier-identity";

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
  supplier: string;
  sourceFileName: string | null;
  supplierIsFallback: boolean;
  invoiceNumber: string | null;
  invoiceDate: string | null;
  displayDate: string;
  timelineDate: string;
  total: number;
  status: string;
  items_count: number;
  file_path: string | null;
  created_at: string;
};

type DbInvoiceRow = {
  id: string;
  supplier_name: string | null;
  total: number | null;
  file_url: string | null;
  created_at: string | null;
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
type SettlementState = "awaiting" | "settled";

const MAX_BYTES = 20 * 1024 * 1024;
const ACCEPT = ["application/pdf", "image/png", "image/jpeg", "image/webp"];

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: "newest", label: "Newest" },
  { value: "oldest", label: "Oldest" },
  { value: "supplier", label: "Supplier name" },
  { value: "highest", label: "Highest total" },
  { value: "lowest", label: "Lowest total" },
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
type InvoiceRowTailFields = {
  quantity: number | null;
  unit: string | null;
};
type InvoiceItemFieldSource = Partial<ItemRow> & Record<string, unknown>;

const traceInvoiceIdentity = (stage: string, details: InvoiceIdentityTrace) => {
  if (!import.meta.env.DEV) return;
  console.debug("[invoice-list]", stage, details);
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

const getSettlementState = (
  invoiceId: string,
  settlementByInvoice: Record<string, SettlementState>,
) => settlementByInvoice[invoiceId] ?? "awaiting";

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
  const invoiceDate = normalizeInvoiceDate(identityMeta?.invoiceDate);
  const timelineDate = invoiceDate ?? row.created_at ?? "";
  const invoiceRow = {
    id: row.id,
    supplier,
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
    persistedSupplierName: row.supplier_name,
    sourceFileName,
    renderedSupplier: invoiceRow.supplier,
    renderedInvoiceNumber: invoiceRow.invoiceNumber,
    renderedDate: invoiceRow.displayDate,
    usedFallback: invoiceRow.supplierIsFallback,
  });
  return invoiceRow;
};

const normalizeExtractedItemName = (name: string | null | undefined) =>
  name?.trim().toLowerCase() ?? "";

const INVOICE_NUMBER_TOKEN = String.raw`\d{1,3}(?:[.\s]\d{3})*(?:,\d+)?|\d{1,3}(?:,\d{3})*(?:\.\d+)?|\d+[.,]\d+|\d+`;
const INVOICE_UNIT_TOKEN = String.raw`un|uni|und|unds|unid|unids|unidade|unidades|kg|g|gr|l|lt|ml|cl|cx|caixa|caixas|dz|pack|packs|pc|pcs`;
const INVOICE_ROW_TAIL_RE = new RegExp(
  String.raw`\s+(?<quantity>${INVOICE_NUMBER_TOKEN})\s*(?<unit>${INVOICE_UNIT_TOKEN})\b\s+(?:€|EUR)?\s*${INVOICE_NUMBER_TOKEN}\s*(?:€|EUR)?\s*(?:\d{1,2}(?:[,.]\d+)?\s*%)?\s*$`,
  "iu",
);
const INVOICE_PRODUCT_CODE_RE = /^(?:[A-Z]{1,4}\d{3,8}|\d{2,8})\s+/iu;
const INVOICE_QUANTITY_FIELD_KEYS = [
  "quantity",
  "quantity_value",
  "quantityValue",
  "parsed_quantity",
  "parsedQuantity",
  "purchase_quantity",
  "purchased_quantity",
  "qty",
  "qtd",
] as const;
const INVOICE_UNIT_FIELD_KEYS = [
  "unit",
  "quantity_unit",
  "quantityUnit",
  "purchase_unit",
  "purchased_unit",
  "unit_name",
  "unitName",
  "unidade",
] as const;
const INVOICE_UNIT_PRICE_FIELD_KEYS = ["unit_price", "unitPrice"] as const;
const INVOICE_TOTAL_FIELD_KEYS = ["total", "total_price", "totalPrice"] as const;
const INVOICE_ADDRESS_RE =
  /(^|\s)(?:travessa|trav\.?|rua|r\.|avenida|av\.?|estrada|largo|praceta|praca|rotunda|urbanizacao|zona\s+industrial|parque\s+industrial|edificio|lote|loja|andar|sala|apartado|cod\.?\s+postal|cp)(?=\s|,|\.|:|$)/iu;
const INVOICE_BUSINESS_METADATA_RE =
  /(^|\s)(?:lda|l\.?da|unipessoal|sa|s\.?a\.?|sociedade|comercial|distribuicao|armazem|sede|delegacao|gerencia|gerente|eng\.?|engenheiro|dr\.?|dra\.?)(?=\s|,|\.|:|$)/iu;
const INVOICE_PAYMENT_METADATA_RE =
  /\b(?:iban|swift|bic|sepa|referencia\s+mb|ref\.?\s+mb|entidade|pagamento|transferencia|multibanco|mb\s*way|cartao|visa|mastercard)\b/iu;
const INVOICE_TAX_SUMMARY_RE =
  /\b(?:base\s+incidencia|incidencia|valor\s+iva|taxa\s+iva|iva\s+dedutivel|total\s+liquido|total\s+mercadoria|total\s+documento|valor\s+a\s+pagar)\b/iu;

const parseInvoiceNumberToken = (raw: string): number | null => {
  let value = raw
    .replace(/\u20AC/g, " ")
    .replace(/€/g, " ")
    .replace(/EUR/gi, " ")
    .replace(/\s+/g, "")
    .trim();
  if (!value) return null;
  value = value.replace(/[^\d.,-]/g, "");
  const lastComma = value.lastIndexOf(",");
  const lastDot = value.lastIndexOf(".");
  const normalized =
    lastComma > lastDot
      ? value.replace(/\./g, "").replace(",", ".")
      : lastDot > lastComma
        ? value.replace(/,/g, "")
        : value.replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
};

const normalizeInvoiceUnitToken = (raw: string | null | undefined) => {
  const unit = raw?.trim().toLowerCase();
  if (!unit) return null;
  if (["uni", "und", "unds", "unid", "unids", "unidade", "unidades", "pc", "pcs"].includes(unit)) {
    return "un";
  }
  if (unit === "lt") return "L";
  if (unit === "gr") return "g";
  return unit === "l" ? "L" : unit;
};

const invoiceAmountsNearlyEqual = (a: number, b: number) => Math.abs(a - b) < 0.005;

const extractInvoiceRowTailFields = (name: string): InvoiceRowTailFields => {
  const rowTail = name.match(INVOICE_ROW_TAIL_RE);
  if (!rowTail?.groups?.quantity || !rowTail.groups.unit) return { quantity: null, unit: null };

  return {
    quantity: parseInvoiceNumberToken(rowTail.groups.quantity),
    unit: normalizeInvoiceUnitToken(rowTail.groups.unit),
  };
};

const normalizeInvoiceNumberField = (value: unknown): number | null => {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") return parseInvoiceNumberToken(value);
  return null;
};

const normalizeInvoiceNumberFieldFromKeys = (
  item: InvoiceItemFieldSource,
  keys: readonly string[],
): number | null => {
  for (const key of keys) {
    const value = normalizeInvoiceNumberField(item[key]);
    if (value != null) return value;
  }
  return null;
};

const normalizeInvoiceUnitFieldFromKeys = (
  item: InvoiceItemFieldSource,
  keys: readonly string[],
): string | null => {
  for (const key of keys) {
    const value = typeof item[key] === "string" ? item[key] : null;
    const unit = normalizeInvoiceUnitToken(value);
    if (unit) return unit;
  }
  return null;
};

const normalizeInvoiceItemFields = <T extends Partial<ItemRow>>(item: T): T & ItemRow => {
  const fieldSource = item as InvoiceItemFieldSource;
  const rowTailFields = extractInvoiceRowTailFields(String(item.name ?? ""));
  const quantity =
    normalizeInvoiceNumberFieldFromKeys(fieldSource, INVOICE_QUANTITY_FIELD_KEYS) ??
    rowTailFields.quantity;
  const unit =
    normalizeInvoiceUnitFieldFromKeys(fieldSource, INVOICE_UNIT_FIELD_KEYS) ?? rowTailFields.unit;
  const unit_price = normalizeInvoiceNumberFieldFromKeys(
    fieldSource,
    INVOICE_UNIT_PRICE_FIELD_KEYS,
  );
  const total = normalizeInvoiceNumberFieldFromKeys(fieldSource, INVOICE_TOTAL_FIELD_KEYS);
  const normalized = {
    ...item,
    name: cleanInvoiceItemDisplayName({ name: item.name ?? "", quantity, unit }),
    quantity,
    unit,
    unit_price,
    total,
  };
  return normalized as T & ItemRow;
};

const cleanInvoiceItemDisplayName = (item: Pick<ItemRow, "name" | "quantity" | "unit">) => {
  let name = String(item.name ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(INVOICE_PRODUCT_CODE_RE, "")
    .trim();

  const rowTail = name.match(INVOICE_ROW_TAIL_RE);
  if (rowTail?.groups?.quantity && rowTail.groups.unit) {
    const quantity = parseInvoiceNumberToken(rowTail.groups.quantity);
    const rowUnit = normalizeInvoiceUnitToken(rowTail.groups.unit);
    const itemUnit = normalizeInvoiceUnitToken(item.unit);
    const quantityMatches =
      item.quantity == null ||
      quantity == null ||
      invoiceAmountsNearlyEqual(item.quantity, quantity);
    const unitMatches = !itemUnit || !rowUnit || itemUnit === rowUnit;
    if (quantityMatches && unitMatches) name = name.slice(0, rowTail.index).trim();
  }

  return name
    .replace(/\s+\d{1,2}(?:[,.]\d+)?\s*%\s*$/u, "")
    .replace(/\s+(?:€|EUR)\s*\d+(?:[,.]\d{1,4})?\s*$/iu, "")
    .replace(/\s+\d+[,.]\d{1,4}\s*(?:€|EUR)\s*$/iu, "")
    .replace(/\s+/g, " ")
    .trim();
};

const shouldRejectInvoiceItemName = (
  item: Pick<ItemRow, "name" | "quantity" | "unit" | "unit_price" | "total">,
) => {
  const name = cleanInvoiceItemDisplayName(item);
  if (!name || !/[A-Za-zÀ-ÿ]/u.test(name)) return true;

  const normalized = normalizeDisplayName(name);
  const hasParsedRowFields =
    item.quantity != null || item.unit != null || item.unit_price != null || item.total != null;
  if (INVOICE_PAYMENT_METADATA_RE.test(normalized) || INVOICE_TAX_SUMMARY_RE.test(normalized)) {
    return true;
  }
  if (INVOICE_ADDRESS_RE.test(normalized)) return true;
  if (INVOICE_BUSINESS_METADATA_RE.test(normalized) && !hasParsedRowFields) {
    return true;
  }
  return false;
};

const getItemIngredientMatch = (
  item: ItemRow,
  ingredientCatalog: IngredientMatchRow[],
  confirmedAliases: IngredientAliasMap,
) => findCanonicalIngredientMatch(item.name, ingredientCatalog, confirmedAliases);

const isConfirmedIngredientMatch = (match: IngredientCanonicalMatch | null) =>
  match?.kind === "exact" || match?.kind === "confirmed-alias";

const isPlaceholderItemName = (name: string) => {
  const normalizedName = normalizeExtractedItemName(name);
  return !normalizedName || normalizedName === "unknown";
};

const needsQuantityUnitConfirmation = (item: ItemRow) => {
  if (item.quantity != null && item.unit) return false;
  return !hasClearInferredQuantityUnit(item);
};

const needsAmountConfirmation = (item: ItemRow) => item.unit_price == null || item.total == null;

const needsExtractionConfirmation = (item: ItemRow) =>
  isPlaceholderItemName(item.name) ||
  needsQuantityUnitConfirmation(item) ||
  needsAmountConfirmation(item);

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
  return normalized;
};

const formatPurchaseCount = (value: number) => {
  const rounded = Number.isInteger(value) ? String(value) : value.toFixed(2);
  return rounded;
};

const hasClearInferredQuantityUnit = (item: Pick<ItemRow, "name" | "quantity" | "unit">) => {
  const inferred = inferPurchaseUnitsFromLineItemName(item.name);
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

const resolveInvoiceItemUnit = (item: Pick<ItemRow, "name" | "unit">) => {
  const extractedUnit = item.unit?.trim() || null;
  const inferred = inferPurchaseUnitsFromLineItemName(item.name);
  if (inferred.base_unit && isGenericUnit(extractedUnit)) return inferred.base_unit;
  return extractedUnit ?? inferred.base_unit ?? inferred.conversion_hint?.purchase_unit;
};

const getInvoiceItemOperationalSummary = (item: Pick<ItemRow, "name" | "quantity">) => {
  const inferred = inferPurchaseUnitsFromLineItemName(item.name);
  const hint = inferred.conversion_hint;
  if (hint) {
    return {
      tone: "review" as const,
      stockUnit: hint.stock_unit,
      badgeLabel: "estimated yield",
      badgeTitle: "Estimated kitchen-ready amount from the product type.",
    };
  }

  return null;
};

const getInvoiceItemPurchaseLabel = (item: Pick<ItemRow, "name" | "quantity" | "unit">) => {
  const inferred = inferPurchaseUnitsFromLineItemName(item.name);
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
  return unit
    ? formatOperationalQuantityWithUnit(item.quantity, unit)
    : formatPurchaseCount(item.quantity);
};

const getInvoiceItemStockPresentation = (item: Pick<ItemRow, "name" | "quantity" | "unit">) => {
  const inferred = inferPurchaseUnitsFromLineItemName(item.name);
  const rowQuantity = Number(item.quantity);
  const purchaseQuantity = Number.isFinite(rowQuantity) && rowQuantity > 0 ? rowQuantity : 1;

  if (inferred.size_is_metadata_only && inferred.stock_unit === "un") {
    const unitQuantity = resolveUnitDrivenQuantity(item, inferred);
    const sizeMetadata = formatUnitSizeMetadata(inferred);
    return {
      quantityLabel: `${formatQuantityWithUnit(unitQuantity, "units")} usable`,
      detailLabel: sizeMetadata,
    };
  }

  if (inferred.normalized_stock_quantity != null && inferred.stock_unit) {
    const stockQuantity = Math.max(1, purchaseQuantity * inferred.normalized_stock_quantity);
    return {
      quantityLabel: `${formatOperationalQuantityWithUnit(stockQuantity, inferred.stock_unit)} usable`,
      detailLabel: null,
    };
  }

  const hint = inferred.conversion_hint;
  if (hint) {
    const estimatedStockQuantity = Math.max(1, purchaseQuantity * hint.estimated_quantity);
    return {
      quantityLabel: `~${formatOperationalQuantityWithUnit(
        estimatedStockQuantity,
        hint.stock_unit,
      )} usable`,
      detailLabel: "estimated kitchen yield",
    };
  }

  const compatibleUnit = getRecipeCompatibleUnit(item.unit);
  if (compatibleUnit && item.quantity != null) {
    return {
      quantityLabel: `${formatOperationalQuantityWithUnit(item.quantity, compatibleUnit)} usable`,
      detailLabel: null,
    };
  }

  const displayUnit = getDisplayPurchaseUnit(item.unit);
  if (displayUnit && item.quantity != null) {
    return {
      quantityLabel: `${formatOperationalQuantityWithUnit(item.quantity, displayUnit)} usable`,
      detailLabel: null,
    };
  }

  return null;
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
  const { user } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);
  const [drop, setDrop] = useState(false);
  const [pending, setPending] = useState<Pending[]>([]);
  const [rows, setRows] = useState<InvoiceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [preview, setPreview] = useState<{ url: string; type: string; name: string } | null>(null);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [itemsByInvoice, setItemsByInvoice] = useState<Record<string, ItemRow[]>>({});
  const [priceComparisonsByInvoice, setPriceComparisonsByInvoice] = useState<
    Record<string, PriceComparisonMap>
  >({});
  const [ingredientCatalog, setIngredientCatalog] = useState<IngredientMatchRow[]>([]);
  const [confirmedIngredientAliases, setConfirmedIngredientAliases] = useState<IngredientAliasMap>(
    {},
  );
  const [, setInvoiceIdentities] = useState<InvoiceIdentityState>({});
  const invoiceIdentitiesRef = useRef<InvoiceIdentityState>({});
  const [creatingIngredientByItem, setCreatingIngredientByItem] = useState<IngredientCreationState>(
    {},
  );
  const [ingredientCreationErrors, setIngredientCreationErrors] =
    useState<IngredientCreationErrors>({});
  const [extracting, setExtracting] = useState<Record<string, boolean>>({});
  const [sortBy, setSortBy] = useState<SortOption>("newest");
  const [settlementByInvoice, setSettlementByInvoice] = useState<Record<string, SettlementState>>(
    {},
  );

  useEffect(() => {
    if (!user) {
      setConfirmedIngredientAliases({});
      setInvoiceIdentities({});
      invoiceIdentitiesRef.current = {};
      return;
    }

    try {
      const raw = window.localStorage.getItem(`marginly:invoice-ingredient-aliases:${user.id}`);
      setConfirmedIngredientAliases(raw ? (JSON.parse(raw) as IngredientAliasMap) : {});
    } catch {
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
  }, [user]);

  const load = useCallback(async () => {
    setLoading(true);
    setGlobalError(null);
    try {
      const { data, error } = await supabase
        .from("invoices")
        .select("id, supplier_name, total, file_url, created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;

      const invoiceRows = (data ?? []) as DbInvoiceRow[];
      const ids = invoiceRows.map((row) => row.id);
      const itemCounts: Record<string, number> = {};
      const { data: ingredientRows, error: ingredientError } = await supabase
        .from("ingredients")
        .select("id, name, normalized_name, unit");

      setIngredientCatalog(ingredientError ? [] : ((ingredientRows ?? []) as IngredientMatchRow[]));

      if (ids.length > 0) {
        const { data: itemRows, error: itemError } = await supabase
          .from("invoice_items")
          .select("invoice_id")
          .in("invoice_id", ids);
        if (!itemError) {
          for (const item of (itemRows ?? []) as { invoice_id: string | null }[]) {
            if (item.invoice_id)
              itemCounts[item.invoice_id] = (itemCounts[item.invoice_id] ?? 0) + 1;
          }
        }
      }

      const identityState = invoiceIdentitiesRef.current;
      setRows(
        invoiceRows.map((row) => toInvoiceRow(row, itemCounts[row.id] ?? 0, identityState[row.id])),
      );
    } catch (err) {
      setRows([]);
      setIngredientCatalog([]);
      setGlobalError(err instanceof Error ? err.message : "Could not load invoices");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user) load();
    else {
      setRows([]);
      setIngredientCatalog([]);
      setLoading(false);
    }
  }, [user, load]);

  // Cleanup preview URLs on unmount
  useEffect(
    () => () => {
      pending.forEach((p) => URL.revokeObjectURL(p.previewUrl));
    },
    [pending],
  );

  const stats = useMemo(() => {
    const total = rows.reduce((s, r) => s + Number(r.total ?? 0), 0);
    return {
      count: rows.length,
      total,
      processing: rows.filter((r) => r.status === "Processing").length,
    };
  }, [rows]);

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

  const sortedRows = useMemo(() => {
    return [...rows].sort((a, b) => {
      switch (sortBy) {
        case "oldest":
          return invoiceTime(a.timelineDate) - invoiceTime(b.timelineDate);
        case "supplier":
          return a.supplier.localeCompare(b.supplier, undefined, { sensitivity: "base" });
        case "highest":
          return Number(b.total) - Number(a.total);
        case "lowest":
          return Number(a.total) - Number(b.total);
        case "status": {
          const statusOrder =
            a.status.localeCompare(b.status, undefined, { sensitivity: "base" }) ||
            getSettlementState(a.id, settlementByInvoice).localeCompare(
              getSettlementState(b.id, settlementByInvoice),
              undefined,
              { sensitivity: "base" },
            );
          return (
            statusOrder || a.supplier.localeCompare(b.supplier, undefined, { sensitivity: "base" })
          );
        }
        case "newest":
        default:
          return invoiceTime(b.timelineDate) - invoiceTime(a.timelineDate);
      }
    });
  }, [rows, settlementByInvoice, sortBy]);

  const toggleSettlement = (invoiceId: string) => {
    setSettlementByInvoice((current) => ({
      ...current,
      [invoiceId]: getSettlementState(invoiceId, current) === "settled" ? "awaiting" : "settled",
    }));
  };

  const enqueue = (files: FileList | File[]) => {
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
        id: crypto.randomUUID(),
        file,
        previewUrl: URL.createObjectURL(file),
        progress: 0,
        status: "queued",
      });
    }
    if (next.length) {
      setPending((p) => [...next, ...p]);
      next.forEach(uploadOne);
    }
  };

  const fileToDataUrl = (file: File) =>
    new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result as string);
      r.onerror = () => reject(r.error);
      r.readAsDataURL(file);
    });

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
    setExtracting((s) => ({ ...s, [invoiceId]: true }));
    try {
      const { data, error } = await supabase.functions.invoke("extract-invoice", {
        body: { imageDataUrl: dataUrl },
      });
      if (error) throw error;
      const items = Array.isArray(data?.items) ? data.items : [];
      traceInvoiceQuantityStage("extract-response:first-item", items[0], { invoiceId });
      // wipe prior items then insert fresh
      await supabase.from("invoice_items").delete().eq("invoice_id", invoiceId);
      if (items.length && user) {
        const normalizedItems = items
          .map((it: ItemRow) => normalizeInvoiceItemFields(it))
          .filter((it: ItemRow) => !shouldRejectInvoiceItemName(it));
        traceInvoiceQuantityStage("insert-normalized:first-item", normalizedItems[0], {
          invoiceId,
        });
        const insertRows = normalizedItems.map((it: ItemRow) => {
          const name = String(it.name ?? "Unknown");
          const unit = resolveInvoiceItemUnit({ name, unit: it.unit });
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
        const { error: insertError } = await supabase.from("invoice_items").insert(insertRows);
        if (insertError) throw insertError;
      }
      const supplier = normalizeSupplierDisplayName(data?.supplier);
      const invoiceNumber = normalizeInvoiceNumber(data?.invoice_number);
      const invoiceDate = normalizeInvoiceDate(data?.invoice_date);
      traceInvoiceIdentity("extracted-metadata", {
        invoiceId,
        extractedSupplierName: supplier || null,
        extractedInvoiceNumber: invoiceNumber,
        extractedInvoiceDate: invoiceDate,
        rawInvoiceDate: data?.invoice_date,
        itemsCount: items.length,
      });
      return {
        supplier: supplier || undefined,
        invoiceNumber,
        invoiceDate,
        total: typeof data?.total === "number" ? data.total : undefined,
        itemsCount: items.length,
      };
    } catch {
      return null;
    } finally {
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

      setPending((p) => p.map((x) => (x.id === item.id ? { ...x, progress: 65 } : x)));

      const isImage = item.file.type.startsWith("image/");
      if (isImage) {
        const dataUrl = await fileToDataUrl(item.file);
        const ext = await runExtraction(inserted.id, dataUrl);
        const { error: invoiceUpdateError } = await supabase
          .from("invoices")
          .update({
            supplier_name: ext?.supplier?.slice(0, 120) ?? fallbackSupplier,
            total: ext?.total ?? 0,
          })
          .eq("id", inserted.id);
        traceInvoiceIdentity("persisted-invoice", {
          invoiceId: inserted.id,
          extractedSupplierName: ext?.supplier,
          extractedInvoiceNumber: ext?.invoiceNumber,
          extractedInvoiceDate: ext?.invoiceDate,
          persistedSupplierName: ext?.supplier?.slice(0, 120) ?? fallbackSupplier,
          persistenceError: invoiceUpdateError?.message,
        });
        rememberInvoiceIdentity(inserted.id, {
          sourceFileName,
          supplierName: ext?.supplier ?? null,
          invoiceNumber: ext?.invoiceNumber ?? null,
          invoiceDate: ext?.invoiceDate ?? null,
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
      .filter((item) => !shouldRejectInvoiceItemName(item));
    traceInvoiceQuantityStage("load-normalized:first-item", items[0], { invoiceId });
    const priceComparisons = await loadPriceComparisons(invoiceId, invoiceCreatedAt, items);
    setItemsByInvoice((s) => ({ ...s, [invoiceId]: items }));
    setPriceComparisonsByInvoice((s) => ({ ...s, [invoiceId]: priceComparisons }));
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

  const confirmIngredientMatch = (item: ItemRow, match: IngredientCanonicalMatch) => {
    if (!user) return;
    const normalizedItemName = normalizeInvoiceIngredientName(item.name);
    if (!normalizedItemName) return;

    setConfirmedIngredientAliases((current) => {
      const next = { ...current, [normalizedItemName]: match.ingredient.id };
      try {
        window.localStorage.setItem(
          `marginly:invoice-ingredient-aliases:${user.id}`,
          JSON.stringify(next),
        );
      } catch {
        // Local alias memory is an operational convenience; matching still works without it.
      }
      return next;
    });
  };

  const createIngredientFromItem = async (item: ItemRow) => {
    if (!user) return;

    const name = item.name.trim();
    const normalizedName = normalizeIngredientName(name);
    if (!normalizedName || isPlaceholderItemName(name)) {
      setIngredientCreationErrors((current) => ({
        ...current,
        [item.id]: "Confirm the extracted name before creating an ingredient.",
      }));
      return;
    }

    const extractedUnit = item.unit?.trim() || null;
    const inferred = inferPurchaseUnitsFromLineItemName(name);
    const conversionHint = inferred.conversion_hint;
    const stockUnit =
      inferred.base_unit && isGenericUnit(extractedUnit)
        ? inferred.base_unit
        : (extractedUnit ?? inferred.base_unit ?? conversionHint?.purchase_unit ?? "kg");
    const purchaseQuantity = inferred.base_unit ? inferred.purchase_quantity : 1;
    const purchaseUnit = inferred.purchase_unit ?? stockUnit;
    const baseUnit = inferred.base_unit ?? stockUnit;
    const detectedPrice = Number(item.unit_price);
    const currentPrice = Number.isFinite(detectedPrice) && detectedPrice >= 0 ? detectedPrice : 0;

    setCreatingIngredientByItem((current) => ({ ...current, [item.id]: true }));
    setIngredientCreationErrors((current) => removeKey(current, item.id));
    try {
      const { data, error } = await supabase
        .from("ingredients")
        .insert({
          user_id: user.id,
          name,
          normalized_name: normalizedName,
          unit: stockUnit,
          current_price: currentPrice,
          purchase_quantity: purchaseQuantity,
          purchase_unit: purchaseUnit,
          base_unit: baseUnit,
        })
        .select("id, name, normalized_name, unit")
        .single();
      if (error) throw error;

      if (data) {
        setIngredientCatalog((current) => [...current, data as IngredientMatchRow]);
      }
    } catch (err) {
      setIngredientCreationErrors((current) => ({
        ...current,
        [item.id]: err instanceof Error ? err.message : "Could not create ingredient.",
      }));
    } finally {
      setCreatingIngredientByItem((current) => removeKey(current, item.id));
    }
  };

  const reExtract = async (row: InvoiceRow) => {
    if (!row.file_path) return;
    const ext = row.file_path.split(".").pop()?.toLowerCase() ?? "";
    if (!["png", "jpg", "jpeg", "webp"].includes(ext)) return;
    const { data: signed } = await supabase.storage
      .from("invoices")
      .createSignedUrl(row.file_path, 120);
    if (!signed) return;
    const blob = await fetch(signed.signedUrl).then((r) => r.blob());
    const dataUrl = await new Promise<string>((res) => {
      const r = new FileReader();
      r.onload = () => res(r.result as string);
      r.readAsDataURL(blob);
    });
    const result = await runExtraction(row.id, dataUrl);
    if (result) {
      const { error: invoiceUpdateError } = await supabase
        .from("invoices")
        .update({
          supplier_name: result.supplier?.slice(0, 120) ?? row.supplier,
          total: result.total ?? row.total,
        })
        .eq("id", row.id);
      traceInvoiceIdentity("persisted-invoice", {
        invoiceId: row.id,
        extractedSupplierName: result.supplier,
        extractedInvoiceNumber: result.invoiceNumber,
        extractedInvoiceDate: result.invoiceDate,
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
    if (row.file_path) await supabase.storage.from("invoices").remove([row.file_path]);
    await supabase.from("invoices").delete().eq("id", row.id);
    load();
  };

  return (
    <AppShell
      title="Invoices"
      subtitle="Upload supplier invoices — your files stay private and are extracted automatically."
    >
      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <Stat label="Invoices" value={String(stats.count)} />
        <Stat label="Total spend" value={`€${stats.total.toFixed(2)}`} />
        <Stat label="In review" value={String(stats.processing)} />
        <Stat label="Storage" value="Private" hint="Encrypted" />
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
              <div className="mt-1 text-[11px] text-muted-foreground/75">{settlementOverview}</div>
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
            <span className="text-xs text-muted-foreground tabular-nums">{rows.length} total</span>
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
            <tbody className="divide-y divide-border">
              {loading && (
                <tr>
                  <td colSpan={8} className="py-12 text-center">
                    <Loader2 className="h-5 w-5 animate-spin inline text-muted-foreground" />
                  </td>
                </tr>
              )}
              {!loading && rows.length === 0 && (
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
              {sortedRows.map((r) => {
                const open = expanded === r.id;
                const isImage = r.file_path
                  ? ["png", "jpg", "jpeg", "webp"].some((e) =>
                      r.file_path!.toLowerCase().endsWith(e),
                    )
                  : false;
                const items = itemsByInvoice[r.id] ?? [];
                const settlementState = getSettlementState(r.id, settlementByInvoice);
                const subtitle = invoiceSubtitle(r);
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
                        <FileBadge path={r.file_path} />
                      </td>
                      <td className="py-3 px-5">
                        <div className="font-medium leading-tight">{r.supplier}</div>
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
                          <StatusPill status={r.status as "Processed" | "Processing" | "Review"} />
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
                        {isImage && (
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
                          onClick={() => removeRow(r)}
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
                            items={items}
                            priceComparisons={priceComparisonsByInvoice[r.id] ?? {}}
                            ingredientCatalog={ingredientCatalog}
                            confirmedIngredientAliases={confirmedIngredientAliases}
                            loading={itemsByInvoice[r.id] === undefined}
                            extracting={!!extracting[r.id]}
                            onExtract={isImage ? () => reExtract(r) : undefined}
                            onCreateIngredient={createIngredientFromItem}
                            onConfirmIngredientMatch={confirmIngredientMatch}
                            creatingIngredientByItem={creatingIngredientByItem}
                            ingredientCreationErrors={ingredientCreationErrors}
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
    </AppShell>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="card-surface p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold tabular-nums mt-0.5">{value}</div>
      {hint && <div className="text-[10px] uppercase tracking-wider text-success mt-1">{hint}</div>}
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
      className={`inline-flex items-center gap-1 rounded-md px-0.5 py-0 text-[10px] font-normal leading-tight transition hover:bg-muted/50 hover:text-foreground ${
        settled ? "text-success/70" : "text-muted-foreground/75"
      }`}
      title="Local settlement marker for this session"
    >
      <span
        className={`h-1 w-1 rounded-full ${settled ? "bg-success/60" : "bg-muted-foreground/40"}`}
      />
      {settled ? "Settled" : "Settlement pending"}
    </button>
  );
}

function PriceDeltaIndicator({
  currentPrice,
  previousPrice,
}: {
  currentPrice: number | null;
  previousPrice: number | undefined;
}) {
  const delta = getPriceDeltaDetails(currentPrice, previousPrice);
  if (!delta) return null;

  if (delta.direction === "stable") {
    return (
      <span
        className="text-[11px] text-muted-foreground/80 font-normal"
        title={delta.previousLabel}
      >
        Stable
      </span>
    );
  }

  const increasing = delta.direction === "increased";
  return (
    <span
      className={`text-[11px] font-medium ${increasing ? "text-destructive/80" : "text-success/80"}`}
      title={delta.previousLabel}
    >
      {increasing ? "↑ price increased" : "↓ price decreased"} {delta.percentLabel}
    </span>
  );
}

function MissingValue({ label }: { label: string }) {
  return (
    <span className="text-muted-foreground/60" title={`${label} was not separated confidently`}>
      Check
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

function ItemsTable({
  items,
  priceComparisons,
  ingredientCatalog,
  confirmedIngredientAliases,
  creatingIngredientByItem,
  ingredientCreationErrors,
  loading,
  extracting,
  onExtract,
  onCreateIngredient,
  onConfirmIngredientMatch,
}: {
  items: ItemRow[];
  priceComparisons: PriceComparisonMap;
  ingredientCatalog: IngredientMatchRow[];
  confirmedIngredientAliases: IngredientAliasMap;
  creatingIngredientByItem: IngredientCreationState;
  ingredientCreationErrors: IngredientCreationErrors;
  loading: boolean;
  extracting: boolean;
  onExtract?: () => void;
  onCreateIngredient: (item: ItemRow) => void;
  onConfirmIngredientMatch: (item: ItemRow, match: IngredientCanonicalMatch) => void;
}) {
  const operationalSummary = items.reduce(
    (summary, item) => {
      const ingredientMatch = getItemIngredientMatch(
        item,
        ingredientCatalog,
        confirmedIngredientAliases,
      );
      if (isConfirmedIngredientMatch(ingredientMatch)) {
        summary.matchedIngredients += 1;
      } else if (ingredientMatch) {
        summary.possibleIngredientMatches += 1;
      } else {
        summary.unmatchedIngredients += 1;
      }

      if (needsExtractionConfirmation(item)) summary.extractionReview += 1;
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
                <th className="py-2.5 px-4 font-medium">Ingredient</th>
                <th className="py-2.5 px-4 font-medium text-right">Purchased</th>
                <th className="py-2.5 px-4 font-medium">Stock added</th>
                <th className="py-2.5 px-4 font-medium text-right">Unit price</th>
                <th className="py-2.5 px-4 font-medium text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {items.map((it, index) => {
                const renderItem = normalizeInvoiceItemFields(it);
                const ingredientMatch = getItemIngredientMatch(
                  renderItem,
                  ingredientCatalog,
                  confirmedIngredientAliases,
                );
                const confirmedIngredientMatch = isConfirmedIngredientMatch(ingredientMatch);
                const possibleIngredientMatch =
                  ingredientMatch?.kind === "semantic" ? ingredientMatch : null;
                const unmatchedIngredient = !confirmedIngredientMatch && !possibleIngredientMatch;
                const extractionReview = needsExtractionConfirmation(renderItem);
                const quantityReview = needsQuantityUnitConfirmation(renderItem);
                const amountReview = needsAmountConfirmation(renderItem);
                const delta = getPriceDeltaDetails(
                  renderItem.unit_price,
                  priceComparisons[renderItem.id],
                );
                const canCreateIngredient = !isPlaceholderItemName(renderItem.name);
                const creatingIngredient = !!creatingIngredientByItem[renderItem.id];
                const creationError = ingredientCreationErrors[renderItem.id];
                const operationalSummary = getInvoiceItemOperationalSummary(renderItem);
                const purchaseLabel = getInvoiceItemPurchaseLabel(renderItem);
                const stockPresentation = getInvoiceItemStockPresentation(renderItem);
                if (index === 0) {
                  traceInvoiceQuantityStage("render-row:first-item", renderItem, {
                    purchaseLabel,
                    stockLabel: stockPresentation?.quantityLabel ?? null,
                  });
                }
                if (!purchaseLabel || !stockPresentation) {
                  traceInvoiceQuantityStage("render-fallback:first-missing", renderItem, {
                    missingPurchaseLabel: !purchaseLabel,
                    missingStockPresentation: !stockPresentation,
                  });
                }
                const showMatchedBadge =
                  confirmedIngredientMatch &&
                  !extractionReview &&
                  !quantityReview &&
                  !amountReview &&
                  !delta;
                return (
                  <tr
                    key={renderItem.id}
                    className={`transition-colors ${
                      extractionReview
                        ? "bg-amber-500/[0.04] hover:bg-amber-500/[0.07]"
                        : "hover:bg-muted/20"
                    }`}
                  >
                    <td className="py-2.5 px-4">
                      <div className="space-y-1">
                        <div className="font-medium leading-tight">{renderItem.name}</div>
                        <div className="flex flex-wrap items-center gap-1.5">
                          {extractionReview && (
                            <OperationalBadge label="needs review" tone="review" />
                          )}
                          {quantityReview && <OperationalBadge label="confirm quantity" />}
                          {amountReview && <OperationalBadge label="verify amounts" />}
                          {operationalSummary?.badgeLabel && (
                            <OperationalBadge
                              label={operationalSummary.badgeLabel}
                              tone={operationalSummary.tone}
                              title={operationalSummary.badgeTitle}
                            />
                          )}
                          {possibleIngredientMatch ? (
                            <>
                              <OperationalBadge
                                label="possible ingredient match"
                                tone="review"
                                title={`Possible existing ingredient: ${possibleIngredientMatch.ingredient.name ?? "Unnamed ingredient"}`}
                              />
                              <span className="text-[11px] text-muted-foreground">
                                Already buying this?{" "}
                                <span className="font-medium text-foreground">
                                  {possibleIngredientMatch.ingredient.name}
                                </span>
                              </span>
                              <button
                                type="button"
                                onClick={() =>
                                  onConfirmIngredientMatch(renderItem, possibleIngredientMatch)
                                }
                                className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground transition hover:bg-muted/70 hover:text-foreground"
                              >
                                Confirm ingredient match
                              </button>
                              <button
                                type="button"
                                onClick={() => onCreateIngredient(renderItem)}
                                disabled={creatingIngredient || !canCreateIngredient}
                                title={
                                  canCreateIngredient
                                    ? "Create a separate ingredient from this extracted row"
                                    : "Confirm the extracted name before creating an ingredient"
                                }
                                className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground transition hover:bg-muted/70 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                {creatingIngredient && <Loader2 className="h-3 w-3 animate-spin" />}
                                Create new ingredient
                              </button>
                            </>
                          ) : unmatchedIngredient ? (
                            <>
                              <OperationalBadge label="not in ingredient list" />
                              <button
                                type="button"
                                onClick={() => onCreateIngredient(renderItem)}
                                disabled={creatingIngredient || !canCreateIngredient}
                                title={
                                  canCreateIngredient
                                    ? "Create ingredient from this extracted row"
                                    : "Confirm the extracted name before creating an ingredient"
                                }
                                className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground transition hover:bg-muted/70 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                {creatingIngredient && <Loader2 className="h-3 w-3 animate-spin" />}
                                Create new ingredient
                              </button>
                            </>
                          ) : showMatchedBadge ? (
                            <OperationalBadge
                              label={
                                ingredientMatch?.kind === "confirmed-alias"
                                  ? "confirmed match"
                                  : "matched automatically"
                              }
                              tone="success"
                              title={
                                ingredientMatch?.ingredient.name
                                  ? `Suggested existing ingredient: ${ingredientMatch.ingredient.name}`
                                  : undefined
                              }
                            />
                          ) : null}
                          {delta?.direction === "increased" && (
                            <OperationalBadge label="price increased" tone="increase" />
                          )}
                          {delta?.direction === "decreased" && (
                            <OperationalBadge label="price decreased" tone="decrease" />
                          )}
                        </div>
                        {creationError && (
                          <div className="text-[11px] text-destructive">{creationError}</div>
                        )}
                      </div>
                    </td>
                    <td className="py-2.5 px-4 text-right tabular-nums">
                      {purchaseLabel ? (
                        <span className="inline-flex max-w-44 justify-end whitespace-normal text-right leading-snug">
                          <span>{purchaseLabel}</span>
                        </span>
                      ) : (
                        <MissingValue label="Quantity" />
                      )}
                    </td>
                    <td className="py-2.5 px-4 text-muted-foreground">
                      {stockPresentation ? (
                        <span className="inline-flex flex-col gap-0.5">
                          <span className="text-foreground tabular-nums">
                            {stockPresentation.quantityLabel}
                          </span>
                          {stockPresentation.detailLabel && (
                            <span className="text-[11px]">{stockPresentation.detailLabel}</span>
                          )}
                        </span>
                      ) : (
                        <span className="text-muted-foreground/60">Same as purchased</span>
                      )}
                    </td>
                    <td className="py-2.5 px-4 text-right tabular-nums">
                      {renderItem.unit_price != null ? (
                        <span className="inline-flex flex-col items-end gap-0.5">
                          <span className="font-medium">
                            €{Number(renderItem.unit_price).toFixed(2)}
                          </span>
                          <PriceDeltaIndicator
                            currentPrice={renderItem.unit_price}
                            previousPrice={priceComparisons[renderItem.id]}
                          />
                        </span>
                      ) : (
                        <MissingValue label="Unit price" />
                      )}
                    </td>
                    <td className="py-2.5 px-4 text-right tabular-nums font-medium">
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
