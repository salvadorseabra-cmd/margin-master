/**
 * Display-only purchase price semantics for invoice review rows.
 * Uses existing purchase/stock normalization — no calculation or schema changes.
 */

import { formatCurrency, formatUnitCostCurrency } from "@/lib/display-format";
import { daysSinceRecency } from "@/lib/ingredient-pricing-freshness";
import type { PackageType } from "@/lib/ingredient-unit-inference";
import {
  resolveInvoiceLinePurchaseFormat,
  resolveInvoiceLineStockPresentation,
  type InvoiceLinePurchaseInput,
  type StructuredPurchaseFormat,
} from "@/lib/invoice-purchase-format";

export type InvoicePurchasePriceMetadata = InvoiceLinePurchaseInput & {
  unit_price?: number | null;
  /** Invoice line total — display only for purchase extension copy. */
  line_total?: number | null;
};

export type InvoicePricingBadgeKind = "purchase-pack" | "normalized" | "usable-cost";

export type InvoicePricingBadgeSeverity = "critical" | "watch" | "info";

export type InvoicePricingBadge = {
  kind: InvoicePricingBadgeKind;
  label: string;
  severity: InvoicePricingBadgeSeverity;
};

export type InvoicePresentationLineVariant = "default" | "muted" | "secondary" | "emphasis";

export type InvoicePresentationLine = {
  text: string;
  variant?: InvoicePresentationLineVariant;
};

export type InvoiceOperationalBlock = {
  id: "purchase" | "normalized" | "recipe-cost";
  title: string;
  lines: InvoicePresentationLine[];
};

/** Compact normalization card for invoice row right column (≤3 content lines). */
export type InvoiceLineNormalizationCard = {
  purchaseQuantityLine: string | null;
  purchasePriceLine: string | null;
  normalizedLine: string | null;
  usableCostLine: string | null;
};

export type InvoiceLinePricingPresentation = {
  /** Slim right-column card; preferred for invoice table rendering. */
  card: InvoiceLineNormalizationCard;
  /** @deprecated Prefer card — kept for gradual migration. */
  blocks: InvoiceOperationalBlock[];
  /** @deprecated Badges removed from default invoice row view. */
  badges: InvoicePricingBadge[];
  insights: string[];
  /** @deprecated Use card — kept for tests migrating to block assertions. */
  priceLabel: string;
  priceDisplay: string | null;
  purchasedPackDetail: string | null;
  usableStockLabel: string | null;
  effectiveUsableCostLabel: string | null;
};

const PACK_CONTAINER_UNITS = new Set([
  "pack",
  "packs",
  "caixa",
  "caixas",
  "cx",
  "case",
  "cases",
  "box",
  "boxes",
  "tray",
  "trays",
  "bandeja",
  "bandejas",
  "bundle",
  "bundles",
  "embalagem",
  "embalagens",
  "bottle",
  "bottles",
  "garrafa",
  "garrafas",
  "lata",
  "latas",
  "can",
  "cans",
  "saco",
  "sacos",
  "bag",
  "bags",
]);

const PACK_NAME_PATTERN =
  /\b(caixa|cx|case|cases|pack|packs|box|boxes|tray|trays|bandeja|bundle|embalagem)\b/i;

const PACKAGE_TYPE_PRICE_SUFFIX: Record<PackageType, string> = {
  pack: "pack",
  caixa: "case",
  garrafa: "bottle",
  lata: "can",
  saco: "bag",
};

const ROW_UNIT_CONTAINER_LABEL: Record<string, { singular: string; plural: string }> = {
  cx: { singular: "case", plural: "cases" },
  caixa: { singular: "case", plural: "cases" },
  caixas: { singular: "case", plural: "cases" },
  case: { singular: "case", plural: "cases" },
  cases: { singular: "case", plural: "cases" },
  pack: { singular: "pack", plural: "packs" },
  packs: { singular: "pack", plural: "packs" },
  box: { singular: "case", plural: "cases" },
  boxes: { singular: "case", plural: "cases" },
  bottle: { singular: "bottle", plural: "bottles" },
  bottles: { singular: "bottle", plural: "bottles" },
  garrafa: { singular: "bottle", plural: "bottles" },
  garrafas: { singular: "bottle", plural: "bottles" },
  lata: { singular: "can", plural: "cans" },
  latas: { singular: "can", plural: "cans" },
  can: { singular: "can", plural: "cans" },
  cans: { singular: "can", plural: "cans" },
  saco: { singular: "bag", plural: "bags" },
  sacos: { singular: "bag", plural: "bags" },
  bag: { singular: "bag", plural: "bags" },
  bags: { singular: "bag", plural: "bags" },
  tray: { singular: "tray", plural: "trays" },
  bandeja: { singular: "tray", plural: "trays" },
  bundle: { singular: "bundle", plural: "bundles" },
  embalagem: { singular: "pack", plural: "packs" },
};

const ROW_UNIT_PRICE_SUFFIX: Record<string, string> = {
  cx: "case",
  caixa: "case",
  case: "case",
  pack: "pack",
  box: "case",
  tray: "tray",
  bandeja: "tray",
  bundle: "bundle",
  embalagem: "pack",
  un: "unit",
  kg: "kg",
  g: "g",
  l: "L",
  ml: "ml",
};

type PurchasePriceKind = "pack" | "purchase" | "price";

function normalizeToken(value: string | null | undefined): string {
  return value?.trim().toLowerCase() ?? "";
}

function formatPurchaseCount(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function detectPurchasePriceKind(
  structured: StructuredPurchaseFormat,
  rowUnit: string | null | undefined,
  name: string,
): PurchasePriceKind {
  if (structured.packageType) return "pack";
  if (structured.kind === "container_with_size" || structured.kind === "multi_unit_pack") {
    return "pack";
  }

  const containerUnit = normalizeToken(structured.purchaseContainerUnit);
  if (containerUnit && PACK_CONTAINER_UNITS.has(containerUnit)) return "pack";
  if (PACK_NAME_PATTERN.test(name)) return "pack";

  const normalizedRowUnit = normalizeToken(rowUnit);
  if (normalizedRowUnit && PACK_CONTAINER_UNITS.has(normalizedRowUnit)) return "pack";

  if (structured.kind === "weight_or_volume") return "purchase";
  if (
    structured.kind === "inferred" &&
    (structured.packageMeasurementUnit === "kg" || structured.packageMeasurementUnit === "L")
  ) {
    return "purchase";
  }

  return "price";
}

/** Contextual price column label from invoice line metadata. */
export function formatInvoicePurchasePriceLabel(metadata: InvoicePurchasePriceMetadata): string {
  const structured = resolveInvoiceLinePurchaseFormat(metadata);
  const kind = detectPurchasePriceKind(structured, metadata.unit, String(metadata.name ?? ""));
  if (kind === "pack") return "Pack price";
  if (kind === "purchase") return "Purchase price";
  return "Price";
}

function resolvePriceSuffix(
  structured: StructuredPurchaseFormat,
  rowUnit: string | null | undefined,
): string | null {
  if (structured.packageType) {
    return PACKAGE_TYPE_PRICE_SUFFIX[structured.packageType];
  }

  const containerUnit = normalizeToken(structured.purchaseContainerUnit);
  if (containerUnit && ROW_UNIT_PRICE_SUFFIX[containerUnit]) {
    return ROW_UNIT_PRICE_SUFFIX[containerUnit];
  }
  if (containerUnit && PACK_CONTAINER_UNITS.has(containerUnit)) {
    return containerUnit === "cx" || containerUnit.startsWith("caixa") || containerUnit === "case"
      ? "case"
      : containerUnit;
  }

  const normalizedRowUnit = normalizeToken(rowUnit);
  if (normalizedRowUnit && ROW_UNIT_PRICE_SUFFIX[normalizedRowUnit]) {
    return ROW_UNIT_PRICE_SUFFIX[normalizedRowUnit];
  }

  const measureUnit = structured.packageMeasurementUnit ?? structured.inferred.base_unit;
  if (measureUnit === "kg" || measureUnit === "L") return measureUnit;
  if (measureUnit === "g") return "kg";
  if (measureUnit === "ml") return "L";
  if (structured.usableQuantityUnit === "g") return "kg";
  if (structured.usableQuantityUnit === "ml") return "L";
  if (structured.usableQuantityUnit === "un") return "unit";

  return null;
}

function inferCountableCostUnit(name: string): string {
  const normalized = name.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
  if (/\b(burger|hamburguer|hamburger|angus|patty|patties)\b/.test(normalized)) return "patty";
  if (/\b(bun|buns|brioche|pao|pão|bread|baguette|croissant|wrap|wraps)\b/.test(normalized)) {
    return "bun";
  }
  if (/\b(egg|eggs|ovo|ovos)\b/.test(normalized)) return "egg";
  return "unit";
}

function inferProductUnitNoun(name: string, count: number): string | null {
  const normalized = name.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
  if (/\b(burger|hamburguer|hamburger|angus)\b/.test(normalized)) {
    return count === 1 ? "burger" : "burgers";
  }
  if (/\b(patty|patties)\b/.test(normalized)) {
    return count === 1 ? "patty" : "patties";
  }
  if (/\b(bun|buns|brioche|pao|pão|bread|baguette|croissant|wrap|wraps)\b/.test(normalized)) {
    return count === 1 ? "piece" : "pieces";
  }
  if (/\b(egg|eggs|ovo|ovos)\b/.test(normalized)) {
    return count === 1 ? "egg" : "eggs";
  }
  return null;
}

function resolveUsablePerPricedUnit(
  metadata: InvoicePurchasePriceMetadata,
  structured: StructuredPurchaseFormat,
): { amount: number; unit: "g" | "ml" | "un" } | null {
  const totalUsable = structured.normalizedUsableQuantity;
  const usableUnit = structured.usableQuantityUnit;
  if (totalUsable == null || !usableUnit) return null;

  const rowQuantity = metadata.quantity == null ? null : Number(metadata.quantity);
  if (!Number.isFinite(rowQuantity) || rowQuantity == null || rowQuantity <= 1) {
    return { amount: totalUsable, unit: usableUnit };
  }

  const singleUnitStructured = resolveInvoiceLinePurchaseFormat({
    name: metadata.name,
    quantity: 1,
    unit: metadata.unit,
    matchedIngredientName: metadata.matchedIngredientName ?? null,
  });
  const singleUnitUsable = singleUnitStructured.normalizedUsableQuantity;
  if (singleUnitUsable != null && Math.abs(singleUnitUsable - totalUsable) < 0.01) {
    return { amount: totalUsable, unit: usableUnit };
  }

  return { amount: totalUsable / rowQuantity, unit: usableUnit };
}

function computeEffectiveUsableCost(
  unitPrice: number,
  metadata: InvoicePurchasePriceMetadata,
  structured: StructuredPurchaseFormat,
  name: string,
): { cost: number; unit: string } | null {
  const usable = resolveUsablePerPricedUnit(metadata, structured);
  if (!usable || usable.amount <= 0) return null;

  if (usable.unit === "g") {
    const kgPerPurchase = usable.amount / 1000;
    if (kgPerPurchase <= 0) return null;
    return { cost: unitPrice / kgPerPurchase, unit: "kg" };
  }

  if (usable.unit === "ml") {
    const litersPerPurchase = usable.amount / 1000;
    if (litersPerPurchase <= 0) return null;
    return { cost: unitPrice / litersPerPurchase, unit: "L" };
  }

  return {
    cost: unitPrice / usable.amount,
    unit: inferCountableCostUnit(name),
  };
}

/** Units-per-pack from metadata (not invoice row quantity). */
function resolveUnitsPerPack(structured: StructuredPurchaseFormat): number | null {
  if (
    structured.kind === "multi_unit_pack" ||
    (structured.purchaseContainerUnit === "un" && (structured.purchaseContainerCount ?? 0) > 1)
  ) {
    return structured.purchaseContainerCount;
  }
  if (structured.inferred.purchase_unit_count > 1) {
    return structured.inferred.purchase_unit_count;
  }
  return null;
}

function formatInnerPackMeasure(
  sizeQty: number,
  sizeUnit: NonNullable<StructuredPurchaseFormat["packageMeasurementUnit"]>,
): string {
  if (sizeUnit === "g" && sizeQty >= 1000) return `${sizeQty / 1000} kg`;
  if (sizeUnit === "ml" && sizeQty >= 1000) return `${sizeQty / 1000} L`;
  return `${Number.isInteger(sizeQty) ? sizeQty : sizeQty.toFixed(1)} ${sizeUnit}`;
}

/** Inner pack breakdown, e.g. "40 × 180 g" (units-per-pack × size). */
export function formatPurchasedPackDetail(
  structured: StructuredPurchaseFormat,
  name: string,
  rowUnit: string | null | undefined,
): string | null {
  const innerCount = resolveUnitsPerPack(structured);
  const sizeQty = structured.packageQuantity ?? structured.inferred.pack_size;
  const sizeUnit = structured.packageMeasurementUnit ?? structured.inferred.pack_size_unit;
  if (innerCount == null || innerCount <= 1 || sizeQty == null || !sizeUnit || sizeUnit === "un") {
    return null;
  }

  const sizeLabel = formatInnerPackMeasure(sizeQty, sizeUnit);
  const countLabel = formatPurchaseCount(innerCount);
  const normalizedRowUnit = normalizeToken(rowUnit);
  const rowIsPackContainer = normalizedRowUnit && PACK_CONTAINER_UNITS.has(normalizedRowUnit);

  if (!rowIsPackContainer) {
    const productNoun = inferProductUnitNoun(name, innerCount);
    if (productNoun) return `${countLabel} ${productNoun} × ${sizeLabel}`;
  }

  return `${countLabel} × ${sizeLabel}`;
}

/** Invoice row purchase quantity, e.g. "2 cases" from row qty + unit (cx). */
export function formatRowPurchaseQuantityLabel(
  metadata: InvoiceLinePurchaseInput,
): string | null {
  const rowQuantity = metadata.quantity == null ? null : Number(metadata.quantity);
  if (!Number.isFinite(rowQuantity) || rowQuantity == null || rowQuantity <= 0) return null;

  const normalizedRowUnit = normalizeToken(metadata.unit);
  const containerLabels = normalizedRowUnit
    ? ROW_UNIT_CONTAINER_LABEL[normalizedRowUnit]
    : null;
  if (containerLabels) {
    const noun = rowQuantity === 1 ? containerLabels.singular : containerLabels.plural;
    return `${formatPurchaseCount(rowQuantity)} ${noun}`;
  }

  if (normalizedRowUnit) {
    return `${formatPurchaseCount(rowQuantity)} ${normalizedRowUnit}`;
  }

  return formatPurchaseCount(rowQuantity);
}

function joinPresentationParts(parts: Array<string | null | undefined>, separator = " · "): string | null {
  const filtered = parts.map((part) => part?.trim()).filter((part): part is string => Boolean(part));
  return filtered.length > 0 ? filtered.join(separator) : null;
}

function formatPurchaseTotalLine(metadata: InvoicePurchasePriceMetadata): InvoicePresentationLine | null {
  const rowQuantity = metadata.quantity == null ? null : Number(metadata.quantity);
  if (!Number.isFinite(rowQuantity) || rowQuantity == null || rowQuantity <= 1) return null;

  const lineTotal = metadata.line_total == null ? null : Number(metadata.line_total);
  const unitPrice = metadata.unit_price == null ? null : Number(metadata.unit_price);
  let total: number | null = null;
  if (lineTotal != null && Number.isFinite(lineTotal)) {
    total = lineTotal;
  } else if (unitPrice != null && Number.isFinite(unitPrice)) {
    total = rowQuantity * unitPrice;
  }
  if (total == null || !Number.isFinite(total)) return null;

  return { text: `${formatCurrency(total)} total`, variant: "muted" };
}

function buildNormalizationCard(args: {
  rowQuantityLabel: string | null;
  purchasedPackDetail: string | null;
  priceDisplay: string | null;
  metadata: InvoicePurchasePriceMetadata;
  usableStockLabel: string | null;
  effectiveUsableCostLabel: string | null;
  effectiveUnit: string | null;
}): InvoiceLineNormalizationCard {
  const totalLine = formatPurchaseTotalLine(args.metadata);
  const purchasePriceLine = joinPresentationParts([args.priceDisplay, totalLine?.text ?? null]);

  let usableCostLine: string | null = null;
  if (args.effectiveUsableCostLabel && args.effectiveUnit) {
    const costOnly = args.effectiveUsableCostLabel.replace(/\s*\/\s*\S+$/, "").trim();
    usableCostLine = `${costOnly} / ${args.effectiveUnit} usable`;
  }

  return {
    purchaseQuantityLine: joinPresentationParts([args.rowQuantityLabel, args.purchasedPackDetail]),
    purchasePriceLine,
    normalizedLine: args.usableStockLabel,
    usableCostLine,
  };
}

function buildOperationalBlocksFromCard(card: InvoiceLineNormalizationCard): InvoiceOperationalBlock[] {
  const blocks: InvoiceOperationalBlock[] = [];
  const purchaseLines: InvoicePresentationLine[] = [];
  if (card.purchaseQuantityLine) {
    purchaseLines.push({ text: card.purchaseQuantityLine, variant: "default" });
  }
  if (card.purchasePriceLine) {
    purchaseLines.push({ text: card.purchasePriceLine, variant: "secondary" });
  }
  if (purchaseLines.length > 0) {
    blocks.push({ id: "purchase", title: "Purchase", lines: purchaseLines });
  }
  if (card.normalizedLine) {
    blocks.push({
      id: "normalized",
      title: "Normalized",
      lines: [{ text: card.normalizedLine, variant: "default" }],
    });
  }
  if (card.usableCostLine) {
    blocks.push({
      id: "recipe-cost",
      title: "Normalized",
      lines: [{ text: card.usableCostLine, variant: "emphasis" }],
    });
  }
  return blocks;
}

export type InvoicePricingInsightSignal = {
  kind: string;
  label: string;
  title?: string;
};

export type InvoiceLineBadgeSignal = InvoicePricingInsightSignal & {
  tone?: "muted" | "review" | "success" | "increase" | "decrease";
};

export type InvoiceLineBadgeGroupId = "pricing-risk" | "supplier-signals" | "recipe-exposure";

export type InvoiceLineBadgeGroup = {
  id: InvoiceLineBadgeGroupId;
  title: string;
  badges: InvoiceLineBadgeSignal[];
};

const PRICING_RISK_SIGNAL_KINDS = new Set([
  "catalog-price-up",
  "catalog-price-down",
  "stale-pricing",
  "catalog-confirmation",
  "price-increased",
  "price-decreased",
  "volatile",
]);

const SUPPLIER_SIGNAL_KINDS = new Set(["new-supplier", "alias-memory"]);

const RECIPE_EXPOSURE_SIGNAL_KINDS = new Set(["recipe-impact", "high-importance"]);

const BADGE_GROUP_ORDER: InvoiceLineBadgeGroupId[] = [
  "pricing-risk",
  "supplier-signals",
  "recipe-exposure",
];

const BADGE_GROUP_TITLES: Record<InvoiceLineBadgeGroupId, string> = {
  "pricing-risk": "Pricing risk",
  "supplier-signals": "Supplier signals",
  "recipe-exposure": "Recipe exposure",
};

/** Groups operational line badges into semantic rows for invoice review. */
export function groupInvoiceLineBadges(
  signals: readonly InvoiceLineBadgeSignal[],
): InvoiceLineBadgeGroup[] {
  const buckets: Record<InvoiceLineBadgeGroupId, InvoiceLineBadgeSignal[]> = {
    "pricing-risk": [],
    "supplier-signals": [],
    "recipe-exposure": [],
  };

  for (const signal of signals) {
    if (PRICING_RISK_SIGNAL_KINDS.has(signal.kind)) {
      buckets["pricing-risk"].push(signal);
    } else if (SUPPLIER_SIGNAL_KINDS.has(signal.kind)) {
      buckets["supplier-signals"].push(signal);
    } else if (RECIPE_EXPOSURE_SIGNAL_KINDS.has(signal.kind)) {
      buckets["recipe-exposure"].push(signal);
    }
  }

  return BADGE_GROUP_ORDER.map((id) => ({
    id,
    title: BADGE_GROUP_TITLES[id],
    badges: buckets[id],
  })).filter((group) => group.badges.length > 0);
}

function formatRecipeImpactInsight(label: string): string {
  const countMatch = label.match(/(\d+)/);
  if (!countMatch) return label;
  const count = Number(countMatch[1]);
  if (!Number.isFinite(count) || count <= 0) return label;
  return `Impacts ${count} recipe${count === 1 ? "" : "s"}`;
}

/** Concise insight one-liners from real operational signals and price delta. */
export function deriveInvoicePricingInsights(
  signals: readonly InvoicePricingInsightSignal[],
  priceDelta: { direction: "increased" | "decreased" | "stable"; percentLabel: string } | null,
): string[] {
  const insights: string[] = [];
  const signalByKind = new Map(signals.map((signal) => [signal.kind, signal]));

  if (priceDelta && priceDelta.direction !== "stable") {
    insights.push(`${priceDelta.percentLabel} vs previous`);
  }

  const recipeImpact = signalByKind.get("recipe-impact");
  if (recipeImpact) {
    insights.push(formatRecipeImpactInsight(recipeImpact.label));
  }

  if (signalByKind.has("high-importance")) {
    insights.push("Primary cost driver");
  }

  for (const signal of signals) {
    if (insights.length >= 3) break;
    if (insights.some((line) => line === signal.label)) continue;
    switch (signal.kind) {
      case "recipe-impact":
      case "high-importance":
        break;
      case "volatile":
        insights.push("Variable purchase pricing");
        break;
      case "price-increased":
      case "price-decreased":
        if (!priceDelta || priceDelta.direction === "stable") insights.push(signal.label);
        break;
      case "catalog-price-up":
      case "stale-pricing":
        insights.push(signal.label);
        break;
      default:
        break;
    }
  }

  return insights.slice(0, 3);
}

export type InvoiceRowReviewWarningInput = {
  signals: readonly InvoicePricingInsightSignal[];
  /** Latest purchase or price-refresh timestamp for recency copy. */
  pricingRecencyAt?: string | null;
};

/**
 * At most one calm warning for the invoice row left column.
 * Priority: stale pricing → last invoice age → price spike → new supplier → catalog delta.
 */
export function formatInvoiceRowReviewWarning(input: InvoiceRowReviewWarningInput): string | null {
  const signalByKind = new Map(input.signals.map((signal) => [signal.kind, signal]));

  if (signalByKind.has("stale-pricing") || signalByKind.has("catalog-confirmation")) {
    return "Pricing may be outdated";
  }

  if (signalByKind.has("price-increased") || signalByKind.has("catalog-price-up")) {
    return "Higher than recent purchases";
  }

  if (signalByKind.has("new-supplier")) {
    return "New supplier";
  }

  if (signalByKind.has("catalog-price-down")) {
    return "Below recent purchases";
  }

  const purchaseDays = daysSinceRecency(input.pricingRecencyAt);
  if (purchaseDays != null && purchaseDays >= 1) {
    return `Last invoice ${purchaseDays}d ago`;
  }

  return null;
}

/** Single calm status under the match target line (match confidence or one warning). */
export function formatInvoiceRowMatchStatusLine(args: {
  matchedAutomatically: boolean;
  confidenceLabel: string | null;
  warning: string | null;
}): string | null {
  if (args.warning) return args.warning;
  if (args.matchedAutomatically) return "Matched automatically";
  if (args.confidenceLabel === "High confidence") return "High confidence";
  return null;
}

/** Maps badge severity to UI tone keys used by invoice review chips. */
export function invoicePricingBadgeUiTone(
  severity: InvoicePricingBadgeSeverity,
): "muted" | "review" | "increase" {
  if (severity === "critical") return "increase";
  if (severity === "watch") return "review";
  return "muted";
}

/** Full display DTO for invoice row pricing from existing row fields. */
export function resolveInvoiceLinePricingPresentation(
  metadata: InvoicePurchasePriceMetadata,
): InvoiceLinePricingPresentation {
  const structured = resolveInvoiceLinePurchaseFormat(metadata);
  const stock = resolveInvoiceLineStockPresentation(metadata);
  const name = String(metadata.name ?? "");
  const unitPrice = metadata.unit_price == null ? null : Number(metadata.unit_price);

  const priceKind = detectPurchasePriceKind(structured, metadata.unit, name);
  const priceLabel =
    priceKind === "pack" ? "Pack price" : priceKind === "purchase" ? "Purchase price" : "Price";

  let priceDisplay: string | null = null;
  let effectiveUnit: string | null = null;
  if (unitPrice != null && Number.isFinite(unitPrice)) {
    const suffix = resolvePriceSuffix(structured, metadata.unit);
    priceDisplay = suffix
      ? `${formatUnitCostCurrency(unitPrice)} / ${suffix}`
      : formatUnitCostCurrency(unitPrice);
  }

  const rowQuantityLabel = formatRowPurchaseQuantityLabel(metadata);
  const purchasedPackDetail = formatPurchasedPackDetail(structured, name, metadata.unit);
  const usableStockLabel = stock.quantityLabel;

  let effectiveUsableCostLabel: string | null = null;
  if (unitPrice != null && Number.isFinite(unitPrice)) {
    const effective = computeEffectiveUsableCost(unitPrice, metadata, structured, name);
    if (effective != null && Number.isFinite(effective.cost) && effective.cost > 0) {
      effectiveUnit = effective.unit;
      effectiveUsableCostLabel = `${formatUnitCostCurrency(effective.cost)} / ${effective.unit}`;
    }
  }

  const card = buildNormalizationCard({
    rowQuantityLabel,
    purchasedPackDetail,
    priceDisplay,
    metadata,
    usableStockLabel,
    effectiveUsableCostLabel,
    effectiveUnit,
  });
  const blocks = buildOperationalBlocksFromCard(card);

  return {
    card,
    blocks,
    badges: [],
    insights: [],
    priceLabel,
    priceDisplay,
    purchasedPackDetail,
    usableStockLabel,
    effectiveUsableCostLabel,
  };
}
