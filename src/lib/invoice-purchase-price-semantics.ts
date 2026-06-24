/**
 * Display-only purchase price semantics for invoice review rows.
 * Uses existing purchase/stock normalization — no calculation or schema changes.
 */

import { formatCurrency, formatUnitCostCurrency } from "@/lib/display-format";
import type { PackageType } from "@/lib/ingredient-unit-inference";
import {
  resolveInvoiceLinePurchaseFormat,
  resolveInvoiceLineStockPresentation,
  resolveStructuredPurchaseForDisplay,
  type InvoiceLineStockPresentation,
  shouldApplyCasePieceWeightOperationalShortcut,
  type InvoiceLinePurchaseInput,
  type StructuredPurchaseFormat,
} from "@/lib/invoice-purchase-format";
import type { BaseUnit } from "@/lib/recipe-unit-normalization";
import { inferUnitFamily } from "@/lib/recipe-unit-normalization";
import { detectObviousCountableUsage } from "@/lib/recipe-usage-unit-inference";

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
  "em",
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
  em: { singular: "pack", plural: "packs" },
  mo: { singular: "bunch", plural: "bunches" },
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
  em: "pack",
  mo: "bunch",
  bottle: "bottle",
  bottles: "bottle",
  garrafa: "bottle",
  garrafas: "bottle",
  lata: "can",
  latas: "can",
  can: "can",
  cans: "can",
  saco: "bag",
  sacos: "bag",
  bag: "bag",
  bags: "bag",
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

function isIndividualCountableRowUnit(rowUnit: string | null | undefined): boolean {
  const normalized = normalizeToken(rowUnit);
  if (!normalized || PACK_CONTAINER_UNITS.has(normalized)) return false;
  return (
    normalized === "un" ||
    normalized === "uni" ||
    normalized === "unid" ||
    normalized === "unit" ||
    normalized === "units" ||
    normalized === "pc" ||
    normalized === "pcs"
  );
}

/** True when invoice row unit is explicit bulk weight (Bidfood veg @ €/kg). */
function isTrueBulkPurchaseRow(rowUnit: string | null | undefined): boolean {
  const normalized = normalizeToken(rowUnit);
  return normalized === "kg" || normalized === "kgs";
}

/**
 * Display-only procurement container from product name when row metadata lacks pack unit.
 * Procurement answers "what did I buy?" — not inner content measure.
 */
function inferProcurementContainerFromName(
  name: string,
  rowUnit: string | null | undefined,
): string | null {
  const normalized = name.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

  if (/\b(cx|caixa|case|cases)\b/i.test(name) || /\(\s*cx\b/i.test(name) || /\bx\s*\d+\s*ud\b/i.test(normalized)) {
    return "case";
  }

  if (
    /\b(lata|latas|lt)\b/i.test(normalized) ||
    /\bli\b(?=\s*\d)/i.test(name) ||
    /\blt\b(?=\s*\d)/i.test(name)
  ) {
    return "can";
  }

  if (/\b(bolsa|bolsas|saco|sacos)\b/i.test(normalized)) {
    return "bag";
  }

  if (/\d+\s*cl\s*[*x×]/i.test(normalized)) {
    return "bottle";
  }

  const embeddedKg = normalized.match(/(\d+(?:[.,]\d+)?)\s*kg\b/i);
  if (embeddedKg && isIndividualCountableRowUnit(rowUnit)) {
    const kg = Number(embeddedKg[1]!.replace(",", "."));
    if (Number.isFinite(kg) && kg >= 2) return "bag";
  }

  return null;
}

function formatPurchaseCount(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

const PER_ITEM_TOTAL_TOLERANCE_ABS = 0.02;
const PER_ITEM_TOTAL_TOLERANCE_REL = 0.005;

/** True when invoice line total matches qty × unit_price — unit_price is per priced unit, not line aggregate. */
function isUnitPricePerPricedUnit(
  rowQty: number,
  unitPrice: number | null | undefined,
  lineTotal: number | null | undefined,
): boolean {
  if (rowQty <= 1) return false;
  const up = unitPrice == null ? null : Number(unitPrice);
  const total = lineTotal == null ? null : Number(lineTotal);
  if (up == null || !Number.isFinite(up) || total == null || !Number.isFinite(total)) return false;

  const expected = rowQty * up;
  const diff = Math.abs(total - expected);
  if (diff <= PER_ITEM_TOTAL_TOLERANCE_ABS) return true;
  return diff / Math.max(Math.abs(total), Math.abs(expected), 1e-9) <= PER_ITEM_TOTAL_TOLERANCE_REL;
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

/**
 * Procurement price suffix for invoice display ("€X / can").
 *
 * Ordering (before 2026-06 fix — content measure ran before row/name containers):
 * 1. case row with embedded piece weight only → row case suffix
 * 2. structured.packageType
 * 3. structured.purchaseContainerUnit → ROW_UNIT_PRICE_SUFFIX (incl. g/kg measure tokens)
 * 4. row unit → ROW_UNIT_PRICE_SUFFIX
 * 5. packageMeasurementUnit / usableQuantityUnit → kg, L, g, ml (content measure)
 *
 * Ordering (after fix — procurement container before content measure):
 * 1. case row with embedded piece weight only
 * 2. explicit packageType
 * 3. explicit procurement container (PACK_CONTAINER_UNITS only — not g/kg/L)
 * 4. row pack container (PACK_CONTAINER_UNITS, ROW_UNIT_CONTAINER_LABEL)
 * 5. inferred container from name (lata/LI→can, bolsa→bag, 33cl×N→bottle, CX/xNud→case, ≥2kg+un→bag)
 * 6. generic countable unit (un → unit)
 * 7. content measure fallback ONLY for true bulk rows (unit: kg — Bidfood veg)
 */
function resolvePriceSuffix(
  structured: StructuredPurchaseFormat,
  rowUnit: string | null | undefined,
  name: string,
): string | null {
  if (shouldApplyCasePieceWeightOperationalShortcut(name, rowUnit)) {
    const normalizedRowUnit = normalizeToken(rowUnit);
    if (normalizedRowUnit && ROW_UNIT_PRICE_SUFFIX[normalizedRowUnit]) {
      return ROW_UNIT_PRICE_SUFFIX[normalizedRowUnit];
    }
    return "case";
  }

  if (structured.packageType) {
    return PACKAGE_TYPE_PRICE_SUFFIX[structured.packageType];
  }

  const containerUnit = normalizeToken(structured.purchaseContainerUnit);
  if (containerUnit && PACK_CONTAINER_UNITS.has(containerUnit)) {
    if (ROW_UNIT_PRICE_SUFFIX[containerUnit]) {
      return ROW_UNIT_PRICE_SUFFIX[containerUnit];
    }
    return containerUnit === "cx" || containerUnit.startsWith("caixa") || containerUnit === "case"
      ? "case"
      : containerUnit;
  }

  const normalizedRowUnit = normalizeToken(rowUnit);
  if (normalizedRowUnit && PACK_CONTAINER_UNITS.has(normalizedRowUnit)) {
    const containerLabel = ROW_UNIT_CONTAINER_LABEL[normalizedRowUnit];
    if (containerLabel) return containerLabel.singular;
    if (ROW_UNIT_PRICE_SUFFIX[normalizedRowUnit]) {
      return ROW_UNIT_PRICE_SUFFIX[normalizedRowUnit];
    }
  }

  const inferredContainer = inferProcurementContainerFromName(name, rowUnit);
  if (inferredContainer) return inferredContainer;

  if (isIndividualCountableRowUnit(rowUnit)) {
    return "unit";
  }

  if (normalizedRowUnit && ROW_UNIT_PRICE_SUFFIX[normalizedRowUnit]) {
    const mapped = ROW_UNIT_PRICE_SUFFIX[normalizedRowUnit];
    if (mapped !== "kg" && mapped !== "g" && mapped !== "L" && mapped !== "ml") {
      return mapped;
    }
  }

  if (isTrueBulkPurchaseRow(rowUnit)) {
    const measureUnit = structured.packageMeasurementUnit ?? structured.inferred.base_unit;
    if (measureUnit === "kg" || measureUnit === "L") return measureUnit;
    if (measureUnit === "g") return "kg";
    if (measureUnit === "ml") return "L";
    if (structured.usableQuantityUnit === "g") return "kg";
    if (structured.usableQuantityUnit === "ml") return "L";
  }

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

/**
 * OCR often puts pack size on the row (`450 ml`) instead of an outer count (`1 un`).
 * That quantity is content measure, not a multiplier — do not divide usable stock by it.
 */
function isRowQuantityPackContentMeasure(
  metadata: InvoicePurchasePriceMetadata,
  structured: StructuredPurchaseFormat,
  totalUsable: number,
  usableUnit: "g" | "ml" | "un",
): boolean {
  const rowQuantity = metadata.quantity == null ? null : Number(metadata.quantity);
  if (!Number.isFinite(rowQuantity) || rowQuantity == null || rowQuantity <= 1) return false;

  const rowUnit = normalizeToken(metadata.unit);
  // Bidfood kg rows: quantity is purchased weight @ €/kg — not pack inner measure (OCR g/ml path).
  if (rowUnit === "kg" || rowUnit === "kgs") return false;

  if (usableUnit === "ml" && (rowUnit === "ml" || rowUnit === "l" || rowUnit === "lt" || rowUnit === "ltr")) {
    const rowMl = rowUnit === "ml" ? rowQuantity : rowQuantity * 1000;
    if (Math.abs(rowMl - totalUsable) < 0.01) return true;
  }
  if (usableUnit === "g" && (rowUnit === "g" || rowUnit === "kg" || rowUnit === "kgs")) {
    const rowG = rowUnit === "g" ? rowQuantity : rowQuantity * 1000;
    if (Math.abs(rowG - totalUsable) < 0.01) return true;
  }

  const pkgQty = structured.packageQuantity;
  const pkgUnit = structured.packageMeasurementUnit;
  if (pkgQty != null && pkgUnit != null && pkgUnit === usableUnit && Math.abs(pkgQty - rowQuantity) < 0.01) {
    if (rowUnit === pkgUnit) return true;
    if (rowUnit === "kg" && pkgUnit === "g") return true;
    if ((rowUnit === "l" || rowUnit === "lt") && pkgUnit === "ml") return true;
  }

  return false;
}

/**
 * Pack volume embedded in the product name (e.g. 33cl*24) survives qty=1 re-parse as case total.
 * When unit_price is per individual unit (un), scale to one priced unit for operational cost only.
 */
function resolveOperationalUsablePerPricedUnit(
  metadata: InvoicePurchasePriceMetadata,
  structured: StructuredPurchaseFormat,
  usable: { amount: number; unit: "g" | "ml" | "un" },
): { amount: number; unit: "g" | "ml" | "un" } {
  const totalUsable = structured.normalizedUsableQuantity;
  if (totalUsable == null || usable.amount !== totalUsable) return usable;

  const rowQuantity = metadata.quantity == null ? null : Number(metadata.quantity);
  if (!Number.isFinite(rowQuantity) || rowQuantity == null || rowQuantity <= 1) return usable;
  if (!isIndividualCountableRowUnit(metadata.unit)) return usable;

  const singleUnitStructured = resolveInvoiceLinePurchaseFormat({
    name: metadata.name,
    quantity: 1,
    unit: metadata.unit,
    matchedIngredientName: metadata.matchedIngredientName ?? null,
  });
  const singleUnitUsable = singleUnitStructured.normalizedUsableQuantity;
  if (singleUnitUsable == null || Math.abs(singleUnitUsable - totalUsable) >= 0.01) {
    return usable;
  }

  return { amount: totalUsable / rowQuantity, unit: usable.unit };
}

export function resolveUsablePerPricedUnit(
  metadata: InvoicePurchasePriceMetadata,
  structured: StructuredPurchaseFormat,
): { amount: number; unit: "g" | "ml" | "un" } | null {
  const totalUsable = structured.normalizedUsableQuantity;
  const usableUnit = structured.usableQuantityUnit;
  if (totalUsable == null || !usableUnit) return null;

  const rowUnit = normalizeToken(metadata.unit);
  // Invoice kg rows: unit_price is always €/kg (matches recipeOperationalCostFieldsFromInvoiceLine).
  if (rowUnit === "kg" || rowUnit === "kgs") {
    return { amount: 1000, unit: "g" };
  }

  const rowQuantity = metadata.quantity == null ? null : Number(metadata.quantity);
  if (!Number.isFinite(rowQuantity) || rowQuantity == null || rowQuantity <= 1) {
    return { amount: totalUsable, unit: usableUnit };
  }

  if (isRowQuantityPackContentMeasure(metadata, structured, totalUsable, usableUnit)) {
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

export function computeEffectiveUsableCost(
  unitPrice: number,
  metadata: InvoicePurchasePriceMetadata,
  structured: StructuredPurchaseFormat,
  name: string,
): { cost: number; unit: string } | null {
  if (shouldApplyCasePieceWeightOperationalShortcut(name, metadata.unit)) {
    return { cost: unitPrice, unit: "case" };
  }

  const usable = resolveUsablePerPricedUnit(metadata, structured);
  if (!usable || usable.amount <= 0) return null;

  const operationalUsable = resolveOperationalUsablePerPricedUnit(metadata, structured, usable);

  if (operationalUsable.unit === "g") {
    const kgPerPurchase = operationalUsable.amount / 1000;
    if (kgPerPurchase <= 0) return null;
    return { cost: unitPrice / kgPerPurchase, unit: "kg" };
  }

  if (operationalUsable.unit === "ml") {
    const litersPerPurchase = operationalUsable.amount / 1000;
    if (litersPerPurchase <= 0) return null;
    return { cost: unitPrice / litersPerPurchase, unit: "L" };
  }

  return {
    cost: unitPrice / operationalUsable.amount,
    unit: inferCountableCostUnit(name),
  };
}

export type RecipeOperationalCostFields = {
  current_price: number;
  purchase_quantity: number;
  cost_base_unit: BaseUnit;
  /** Usable grams per one countable purchase unit (overlay; not pack total). */
  usable_weight_grams?: number | null;
  usable_volume_ml?: number | null;
};

/** Grams/ml per priced countable unit from stock normalization or pack inner size. */
export function resolveCountableUsableMeasure(
  metadata: InvoicePurchasePriceMetadata,
  structured: StructuredPurchaseFormat,
): { usableWeightGrams: number | null; usableVolumeMl: number | null } {
  const perUnit = resolveUsablePerPricedUnit(metadata, structured);
  if (perUnit?.unit === "g" && perUnit.amount > 0) {
    return { usableWeightGrams: perUnit.amount, usableVolumeMl: null };
  }
  if (perUnit?.unit === "ml" && perUnit.amount > 0) {
    return { usableWeightGrams: null, usableVolumeMl: perUnit.amount };
  }

  const pkgQty = structured.packageQuantity;
  const pkgUnit = structured.packageMeasurementUnit;
  if (pkgQty != null && pkgQty > 0 && pkgUnit === "g") {
    return { usableWeightGrams: pkgQty, usableVolumeMl: null };
  }
  if (pkgQty != null && pkgQty > 0 && pkgUnit === "ml") {
    return { usableWeightGrams: null, usableVolumeMl: pkgQty };
  }

  return { usableWeightGrams: null, usableVolumeMl: null };
}

/**
 * Countable purchase denominator (un/cx/pack) — never gram weight from product name alone.
 * Root cause fix for buns priced as €/g: row `un` + name "80g" must not set purchase_quantity=80.
 */
export function resolveCountablePurchaseQuantityForCost(
  metadata: InvoicePurchasePriceMetadata,
  structured: StructuredPurchaseFormat,
): number | null {
  if (structured.usableQuantityUnit === "un" && structured.normalizedUsableQuantity != null) {
    const perUnit = resolveUsablePerPricedUnit(metadata, structured);
    if (perUnit?.unit === "un" && perUnit.amount > 0) return perUnit.amount;
  }

  const rowUnit = normalizeToken(metadata.unit);
  const rowQtyRaw = metadata.quantity == null ? 1 : Number(metadata.quantity);
  const rowQty = Number.isFinite(rowQtyRaw) && rowQtyRaw > 0 ? rowQtyRaw : 1;

  if (rowUnit && PACK_CONTAINER_UNITS.has(rowUnit)) {
    const unitsPerPack = resolveUnitsPerPack(structured);
    if (unitsPerPack != null && unitsPerPack > 0) return unitsPerPack;
    return 1;
  }

  if (
    rowUnit === "un" ||
    rowUnit === "uni" ||
    rowUnit === "unid" ||
    rowUnit === "unit" ||
    rowUnit === "units" ||
    rowUnit === "pc" ||
    rowUnit === "pcs"
  ) {
    if (isUnitPricePerPricedUnit(rowQty, metadata.unit_price, metadata.line_total)) {
      return 1;
    }
    return rowQty;
  }

  if (structured.kind === "unit_count") {
    const count = structured.purchaseContainerCount;
    if (count != null && count > 0) return count;
  }

  if (!rowUnit) return 1;
  return rowQty;
}

/**
 * Single bottle/jar (1 un) with ml/g in the name — cost per ml/g, not €/un.
 * Skips buns, cans, burgers (discrete count products) via {@link detectObviousCountableUsage}.
 */
function packMeasureCostFieldsFromSingleCountable(
  metadata: InvoicePurchasePriceMetadata,
  structured: StructuredPurchaseFormat,
  unitPrice: number,
  purchaseQty: number,
): RecipeOperationalCostFields | null {
  if (purchaseQty !== 1) return null;
  if (detectObviousCountableUsage(String(metadata.name ?? ""))) return null;

  const perUnit = resolveUsablePerPricedUnit(metadata, structured);
  if (!perUnit || perUnit.unit !== "ml" || perUnit.amount <= 0) return null;

  return {
    current_price: unitPrice,
    purchase_quantity: perUnit.amount,
    cost_base_unit: "ml",
  };
}

/**
 * Ingredient `current_price` / `purchase_quantity` for recipe costing from an invoice line.
 * Weight rows: denominator in g (kg invoice → purchase_quantity 1000). Countable rows: un/cx/pack count.
 */
export function recipeOperationalCostFieldsFromInvoiceLine(
  metadata: InvoicePurchasePriceMetadata,
): RecipeOperationalCostFields | null {
  const unitPrice = metadata.unit_price == null ? null : Number(metadata.unit_price);
  if (!Number.isFinite(unitPrice) || unitPrice < 0) return null;

  const rowUnit = metadata.unit?.trim().toLowerCase();
  if (rowUnit === "kg") {
    return { current_price: unitPrice, purchase_quantity: 1000, cost_base_unit: "g" };
  }

  const structured = resolveInvoiceLinePurchaseFormat(metadata);
  const family = inferUnitFamily(rowUnit, {
    usableQuantityUnit: structured.usableQuantityUnit,
    purchaseFormatKind: structured.kind,
  });

  if (family === "countable") {
    const purchaseQty = resolveCountablePurchaseQuantityForCost(metadata, structured);
    if (purchaseQty == null || purchaseQty <= 0) return null;

    const packMeasure = packMeasureCostFieldsFromSingleCountable(
      metadata,
      structured,
      unitPrice,
      purchaseQty,
    );
    if (packMeasure) return packMeasure;

    const usableMeasure = resolveCountableUsableMeasure(metadata, structured);
    return {
      current_price: unitPrice,
      purchase_quantity: purchaseQty,
      cost_base_unit: "un",
      ...(usableMeasure.usableWeightGrams != null
        ? { usable_weight_grams: usableMeasure.usableWeightGrams }
        : {}),
      ...(usableMeasure.usableVolumeMl != null
        ? { usable_volume_ml: usableMeasure.usableVolumeMl }
        : {}),
    };
  }

  const usable = resolveUsablePerPricedUnit(metadata, structured);
  if (!usable || usable.amount <= 0) return null;

  if (family === "volume" || usable.unit === "ml") {
    return {
      current_price: unitPrice,
      purchase_quantity: usable.amount,
      cost_base_unit: "ml",
    };
  }

  return {
    current_price: unitPrice,
    purchase_quantity: usable.amount,
    cost_base_unit: "g",
  };
}

/** Units-per-pack from metadata (not invoice row quantity). */
export function resolveUnitsPerPack(structured: StructuredPurchaseFormat): number | null {
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

const OPERATIONAL_COST_TOLERANCE_ABS = 0.005;

function normalizeTokenForComparison(value: string | null | undefined): string {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

function procurementUnitsEquivalent(
  procurementSuffix: string | null | undefined,
  operationalUnit: string | null | undefined,
): boolean {
  const procurement = normalizeTokenForComparison(procurementSuffix);
  const operational = normalizeTokenForComparison(operationalUnit);
  if (!procurement || !operational) return false;
  return procurement === operational;
}

function operationalCostsEquivalent(procurementCost: number, operationalCost: number): boolean {
  return Math.abs(procurementCost - operationalCost) <= OPERATIONAL_COST_TOLERANCE_ABS;
}

/** Row purchase quantity in the same base unit as stock normalization (g, ml, or un). */
function normalizePurchaseQuantityToUsableBase(
  metadata: InvoicePurchasePriceMetadata,
): { amount: number; unit: "g" | "ml" | "un" } | null {
  const rowQuantity = metadata.quantity == null ? null : Number(metadata.quantity);
  if (!Number.isFinite(rowQuantity) || rowQuantity == null || rowQuantity <= 0) return null;

  const rowUnit = normalizeToken(metadata.unit);
  if (rowUnit === "kg" || rowUnit === "kgs") return { amount: rowQuantity * 1000, unit: "g" };
  if (rowUnit === "g") return { amount: rowQuantity, unit: "g" };
  if (rowUnit === "l" || rowUnit === "lt" || rowUnit === "ltr") {
    return { amount: rowQuantity * 1000, unit: "ml" };
  }
  if (rowUnit === "ml") return { amount: rowQuantity, unit: "ml" };

  if (
    rowUnit === "un" ||
    rowUnit === "uni" ||
    rowUnit === "unid" ||
    rowUnit === "unit" ||
    rowUnit === "units" ||
    rowUnit === "pc" ||
    rowUnit === "pcs"
  ) {
    return { amount: rowQuantity, unit: "un" };
  }

  return null;
}

function usableQuantityMatchesPurchaseQuantity(
  metadata: InvoicePurchasePriceMetadata,
  stock: InvoiceLineStockPresentation,
): boolean {
  const purchase = normalizePurchaseQuantityToUsableBase(metadata);
  if (!purchase || stock.usableQuantity == null || !stock.usableUnit) return false;
  if (purchase.unit !== stock.usableUnit) return false;
  return Math.abs(purchase.amount - stock.usableQuantity) < 0.01;
}

export type InvoiceOperationalCollapseInput = {
  metadata: InvoicePurchasePriceMetadata;
  stock: InvoiceLineStockPresentation;
  unitPrice: number | null;
  priceSuffix: string | null;
  effective: { cost: number; unit: string } | null;
  usableStockLabel: string | null;
};

/**
 * Invoice Review display-only rule: hide the operational block when procurement and
 * operational semantics are identical (quantity, unit, and effective cost).
 */
export function shouldCollapseInvoiceOperationalDisplay(
  input: InvoiceOperationalCollapseInput,
): boolean {
  const { metadata, stock, unitPrice, priceSuffix, effective, usableStockLabel } = input;
  if (unitPrice == null || !Number.isFinite(unitPrice) || effective == null) return false;
  if (!procurementUnitsEquivalent(priceSuffix, effective.unit)) return false;
  if (!operationalCostsEquivalent(unitPrice, effective.cost)) return false;

  if (!usableStockLabel) return true;

  return usableQuantityMatchesPurchaseQuantity(metadata, stock);
}

function buildNormalizationCard(args: {
  rowQuantityLabel: string | null;
  purchasedPackDetail: string | null;
  priceDisplay: string | null;
  metadata: InvoicePurchasePriceMetadata;
  usableStockLabel: string | null;
  effectiveUsableCostLabel: string | null;
  effectiveUnit: string | null;
  collapseOperational: boolean;
}): InvoiceLineNormalizationCard {
  const totalLine = formatPurchaseTotalLine(args.metadata);
  const purchasePriceLine = joinPresentationParts([args.priceDisplay, totalLine?.text ?? null]);

  let usableCostLine: string | null = null;
  if (!args.collapseOperational && args.effectiveUsableCostLabel) {
    usableCostLine = args.effectiveUsableCostLabel;
  }

  return {
    purchaseQuantityLine: joinPresentationParts([args.rowQuantityLabel, args.purchasedPackDetail]),
    purchasePriceLine,
    normalizedLine: args.collapseOperational ? null : args.usableStockLabel,
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

/** Minimum percent increase vs last invoice before surfacing a price-spike chip. */
export const INVOICE_PRICE_SPIKE_THRESHOLD_PERCENT = 15;

export type InvoiceRowReviewWarningInput = {
  signals: readonly InvoicePricingInsightSignal[];
  previousInvoiceLinePrice?: number | null;
  currentUnitPrice?: number | null;
};

function finiteUnitPrice(value: number | null | undefined): number | null {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function isAbnormalPriceSpike(
  current: number,
  previous: number,
  thresholdPercent = INVOICE_PRICE_SPIKE_THRESHOLD_PERCENT,
): boolean {
  if (!Number.isFinite(previous) || previous <= 0) return false;
  const percent = ((current - previous) / previous) * 100;
  return percent > thresholdPercent;
}

const VISIBLE_ROW_WARNING_LABELS = new Set(["New supplier", "Price spike"]);

function isVisibleRowWarning(warning: string | null | undefined): warning is string {
  return Boolean(warning && VISIBLE_ROW_WARNING_LABELS.has(warning));
}

/**
 * At most one inline warning chip label for invoice rows.
 * Stale pricing, catalog deltas, and recency copy stay internal — not shown in the row UI.
 */
export function formatInvoiceRowReviewWarning(input: InvoiceRowReviewWarningInput): string | null {
  const signalByKind = new Map(input.signals.map((signal) => [signal.kind, signal]));
  const current = finiteUnitPrice(input.currentUnitPrice);
  const previous = finiteUnitPrice(input.previousInvoiceLinePrice);

  if (
    signalByKind.has("price-increased") &&
    current != null &&
    previous != null &&
    isAbnormalPriceSpike(current, previous)
  ) {
    return "Price spike";
  }

  if (signalByKind.has("new-supplier")) {
    return "New supplier";
  }

  return null;
}

/** Single calm status under the match target line (match confidence or one visible warning). */
export function formatInvoiceRowMatchStatusLine(args: {
  matchedAutomatically: boolean;
  confidenceLabel: string | null;
  warning: string | null;
  unmatched?: boolean;
  suggestedMatch?: boolean;
}): string | null {
  if (isVisibleRowWarning(args.warning)) return args.warning;
  if (args.unmatched) return "No match";
  if (args.suggestedMatch) return "Possible match";
  if (args.matchedAutomatically) return "Matched automatically";
  if (args.confidenceLabel === "High confidence") return "High confidence";
  return null;
}

export type InvoiceRowInlineChipTone = "muted" | "review" | "success" | "increase";

export type InvoiceRowInlineChip = {
  label: string;
  tone: InvoiceRowInlineChipTone;
  title?: string;
};

export type InvoiceRowInlineChipInput = {
  matchedAutomatically: boolean;
  confidenceLabel: string | null;
  unmatched: boolean;
  suggestedMatch: boolean;
  signals: readonly InvoicePricingInsightSignal[];
  previousInvoiceLinePrice?: number | null;
  currentUnitPrice?: number | null;
  matchTooltip?: string | null;
};

/** Up to two inline chips: one match-status chip plus an optional warning chip. */
export function deriveInvoiceRowInlineChips(input: InvoiceRowInlineChipInput): InvoiceRowInlineChip[] {
  const chips: InvoiceRowInlineChip[] = [];

  const matchLabel = formatInvoiceRowMatchStatusLine({
    matchedAutomatically: input.matchedAutomatically,
    confidenceLabel: input.confidenceLabel,
    warning: null,
    unmatched: input.unmatched,
    suggestedMatch: input.suggestedMatch,
  });
  if (matchLabel) {
    chips.push({
      label: matchLabel,
      tone:
        input.unmatched || input.suggestedMatch
          ? "review"
          : input.matchedAutomatically
            ? "success"
            : "muted",
      title: input.matchTooltip ?? undefined,
    });
  }

  const warning = formatInvoiceRowReviewWarning({
    signals: input.signals,
    previousInvoiceLinePrice: input.previousInvoiceLinePrice,
    currentUnitPrice: input.currentUnitPrice,
  });
  if (warning && chips.length < 2) {
    chips.push({
      label: warning,
      tone: warning === "Price spike" ? "increase" : "muted",
    });
  }

  return chips.slice(0, 2);
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
  const structured = resolveStructuredPurchaseForDisplay(metadata);
  const stock = resolveInvoiceLineStockPresentation(metadata);
  const name = String(metadata.name ?? "");
  const unitPrice = metadata.unit_price == null ? null : Number(metadata.unit_price);

  const priceKind = detectPurchasePriceKind(structured, metadata.unit, name);
  const priceLabel =
    priceKind === "pack" ? "Pack price" : priceKind === "purchase" ? "Purchase price" : "Price";

  let priceDisplay: string | null = null;
  let priceSuffix: string | null = null;
  let effectiveUnit: string | null = null;
  let effectiveUsableCostLabel: string | null = null;
  let effective: { cost: number; unit: string } | null = null;

  if (unitPrice != null && Number.isFinite(unitPrice)) {
    priceSuffix = resolvePriceSuffix(structured, metadata.unit, name);
    priceDisplay = priceSuffix
      ? `${formatUnitCostCurrency(unitPrice)} / ${priceSuffix}`
      : formatUnitCostCurrency(unitPrice);

    effective = computeEffectiveUsableCost(unitPrice, metadata, structured, name);
    if (effective != null && Number.isFinite(effective.cost) && effective.cost > 0) {
      effectiveUnit = effective.unit;
      effectiveUsableCostLabel = `${formatUnitCostCurrency(effective.cost)} / ${effective.unit}`;
    }
  }

  const rowQuantityLabel = formatRowPurchaseQuantityLabel(metadata);
  const purchasedPackDetail = formatPurchasedPackDetail(structured, name, metadata.unit);
  const usableStockLabel = stock.quantityLabel;

  const collapseOperational = shouldCollapseInvoiceOperationalDisplay({
    metadata,
    stock,
    unitPrice,
    priceSuffix,
    effective,
    usableStockLabel,
  });

  const card = buildNormalizationCard({
    rowQuantityLabel,
    purchasedPackDetail,
    priceDisplay,
    metadata,
    usableStockLabel,
    effectiveUsableCostLabel,
    effectiveUnit,
    collapseOperational,
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
