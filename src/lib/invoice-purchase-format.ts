/**
 * Structured purchase / package parsing for invoice line items.
 *
 * Separates ingredient identity from purchase container, per-package size, and
 * normalized usable quantity. Composes with {@link inferPurchaseUnitsFromLineItemName}
 * without changing ingredient matching or canonical normalization.
 */

import { formatQuantityWithUnit } from "@/lib/display-format";
import {
  inferPurchaseUnitsFromLineItemName,
  type PackageType,
  type UnitInferenceResult,
} from "@/lib/ingredient-unit-inference";
export type PackageMeasureUnit = "g" | "ml" | "kg" | "L" | "un";

export type PurchaseFormatKind =
  | "container_with_size"
  | "multi_unit_pack"
  | "unit_count"
  | "weight_or_volume"
  | "inferred"
  | "row_only";

/** Minimum confidence before trusting normalized usable quantity for stock display. */
export const USABLE_STOCK_MIN_CONFIDENCE = 0.9;

/** Confidence below which we keep raw invoice row/name text instead of a collapsed label. */
export const RAW_PURCHASE_DISPLAY_MIN_CONFIDENCE = 0.86;

export type StructuredPurchaseFormat = {
  kind: PurchaseFormatKind;
  /** Product name with explicit purchase-format tokens removed when possible. */
  ingredientIdentityHint: string;
  purchaseContainerCount: number;
  purchaseContainerUnit: string | null;
  packageQuantity: number | null;
  packageMeasurementUnit: PackageMeasureUnit | null;
  normalizedUsableQuantity: number | null;
  usableQuantityUnit: "g" | "ml" | "un" | null;
  packageType: PackageType | null;
  inferred: UnitInferenceResult;
  confidence: number;
  reason: string;
};

export type InvoiceLinePurchaseInput = {
  name: string;
  quantity?: number | null;
  unit?: string | null;
};

type ParsedPhrase = {
  kind: Exclude<PurchaseFormatKind, "inferred" | "row_only" | "multi_unit_pack"> | "multi_unit_pack";
  containerCount: number;
  containerUnit: string | null;
  packageQuantity: number | null;
  packageUnit: PackageMeasureUnit | null;
  matchedText: string;
  confidence: number;
  reason: string;
};

const DIACRITIC_RE = /\p{M}/gu;
const MULTIPLIER_SEP = String.raw`(?:x|×|\*|X)`;

const CONTAINER_TOKEN =
  String.raw`bottle|bottles|garrafa|garrafas|pack|packs|caixa|caixas|cx|case|cases|lata|latas|can|cans|saco|sacos|bag|bags`;

const MEASURE_UNIT_TOKEN = String.raw`kg|kgs|g|gr|grs|mg|ml|cl|l|lt|lts|ltr|ltrs`;

const GENERIC_UNIT_TOKEN = String.raw`un|uni|und|unds|unid|unids|unit|units|unidade|unidades|pc|pcs`;

const CONTAINER_WITH_SIZE_RE = new RegExp(
  String.raw`\b(?<count>\d+(?:[.,]\d+)?)\s*(?<container>${CONTAINER_TOKEN})\s*${MULTIPLIER_SEP}\s*(?<size>\d+(?:[.,]\d+)?)\s*(?<unit>${MEASURE_UNIT_TOKEN})\b`,
  "iu",
);

const MULTI_UNIT_PACK_RE = new RegExp(
  String.raw`\b(?<count>\d+(?:[.,]\d+)?)\s*${MULTIPLIER_SEP}\s*(?<size>\d+(?:[.,]\d+)?)\s*(?<unit>${MEASURE_UNIT_TOKEN})\b`,
  "iu",
);

const EMBEDDED_BARE_MEASURE_RE = new RegExp(
  String.raw`\b(?<count>\d+(?:[.,]\d+)?)\s*(?<unit>${MEASURE_UNIT_TOKEN})\b`,
  "giu",
);

function findLastRegexMatch(text: string, source: string): RegExpMatchArray | null {
  const re = new RegExp(source, "giu");
  let match: RegExpExecArray | null = null;
  let last: RegExpMatchArray | null = null;
  while ((match = re.exec(text)) !== null) {
    last = match;
  }
  return last;
}

function findContainerWithSizePhrase(text: string): RegExpMatchArray | null {
  return findLastRegexMatch(text, CONTAINER_WITH_SIZE_RE.source);
}

function findMultiUnitPackPhrase(text: string): RegExpMatchArray | null {
  const containerMatch = findContainerWithSizePhrase(text);
  const re = new RegExp(MULTI_UNIT_PACK_RE.source, "giu");
  let match: RegExpExecArray | null = null;
  let last: RegExpMatchArray | null = null;
  while ((match = re.exec(text)) !== null) {
    if (containerMatch?.[0]?.includes(match[0] ?? "")) continue;
    const before = text.slice(0, match.index ?? 0);
    if (new RegExp(String.raw`${CONTAINER_TOKEN}\s*${MULTIPLIER_SEP}\s*$`, "iu").test(before)) {
      continue;
    }
    last = match;
  }
  return last;
}

function findEmbeddedBareMeasurePhrase(text: string): RegExpMatchArray | null {
  if (BARE_MEASURE_RE.test(text.trim()) || BARE_UNIT_COUNT_RE.test(text.trim())) return null;
  const containerMatch = findContainerWithSizePhrase(text);
  const multiMatch = findMultiUnitPackPhrase(text);
  const re = new RegExp(EMBEDDED_BARE_MEASURE_RE.source, "giu");
  let match: RegExpExecArray | null = null;
  let best: RegExpMatchArray | null = null;
  let bestConfidence = 0;
  while ((match = re.exec(text)) !== null) {
    const hit = match[0] ?? "";
    if (containerMatch?.[0]?.includes(hit) || multiMatch?.[0]?.includes(hit)) continue;
    const unit = normalizeMeasureUnit(match.groups?.unit ?? "");
    if (!unit || unit === "un") continue;
    const confidence = unit === "kg" || unit === "L" ? 0.91 : 0.88;
    if (confidence >= bestConfidence) {
      best = match;
      bestConfidence = confidence;
    }
  }
  return best;
}

const BARE_MEASURE_RE = new RegExp(
  String.raw`^\s*(?<count>\d+(?:[.,]\d+)?)\s*(?<unit>${MEASURE_UNIT_TOKEN})\s*$`,
  "iu",
);

const BARE_UNIT_COUNT_RE = new RegExp(
  String.raw`^\s*(?<count>\d+(?:[.,]\d+)?)\s*(?<unit>${GENERIC_UNIT_TOKEN})\s*$`,
  "iu",
);

const PACKAGE_TYPE_BY_CONTAINER: Record<string, PackageType> = {
  pack: "pack",
  packs: "pack",
  caixa: "caixa",
  caixas: "caixa",
  cx: "caixa",
  case: "caixa",
  cases: "caixa",
  garrafa: "garrafa",
  garrafas: "garrafa",
  bottle: "garrafa",
  bottles: "garrafa",
  lata: "lata",
  latas: "lata",
  can: "lata",
  cans: "lata",
  saco: "saco",
  sacos: "saco",
  bag: "saco",
  bags: "saco",
};

function parseQuantityToken(raw: string): number | null {
  const t = raw.trim();
  if (!t) return null;
  const normalized = /^\d+,\d+$/.test(t) ? t.replace(",", ".") : t.replace(/(\d),(\d)/g, "$1.$2");
  const n = Number.parseFloat(normalized);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

function normalizeMeasureUnit(raw: string): PackageMeasureUnit | null {
  const unit = raw.trim().toLowerCase();
  if (unit === "kg" || unit === "kgs") return "kg";
  if (unit === "g" || unit === "gr" || unit === "grs" || unit === "mg") return "g";
  if (unit === "ml") return "ml";
  if (unit === "cl") return "ml";
  if (unit === "l" || unit === "lt" || unit === "lts" || unit === "ltr" || unit === "ltrs") return "L";
  if (
    ["un", "uni", "und", "unds", "unid", "unids", "unit", "units", "unidade", "unidades", "pc", "pcs"].includes(
      unit,
    )
  ) {
    return "un";
  }
  return null;
}

function measureToBase(quantity: number, unit: PackageMeasureUnit): { amount: number; base: "g" | "ml" | "un" } {
  if (unit === "kg") return { amount: quantity * 1000, base: "g" };
  if (unit === "g") return { amount: quantity, base: "g" };
  if (unit === "L") return { amount: quantity * 1000, base: "ml" };
  if (unit === "ml") return { amount: quantity, base: "ml" };
  return { amount: quantity, base: "un" };
}

function normalizeContainerToken(raw: string): string {
  const key = raw.trim().toLowerCase();
  if (key in PACKAGE_TYPE_BY_CONTAINER) return key;
  return key;
}

function resolvePackageType(containerUnit: string | null): PackageType | null {
  if (!containerUnit) return null;
  return PACKAGE_TYPE_BY_CONTAINER[containerUnit] ?? null;
}

function stripMatchedPurchaseText(name: string, matchedText: string): string {
  if (!matchedText) return name.trim();
  const escaped = matchedText.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return name.replace(new RegExp(escaped, "iu"), " ").replace(/\s+/g, " ").trim();
}

function parseMeasureSizeFromGroups(
  sizeRaw: string | undefined,
  unitRaw: string | undefined,
): { packageQuantity: number | null; packageUnit: PackageMeasureUnit | null } {
  let packageQuantity = parseQuantityToken(sizeRaw ?? "");
  let packageUnit = normalizeMeasureUnit(unitRaw ?? "");
  if (unitRaw?.toLowerCase() === "cl" && packageQuantity != null) {
    packageQuantity = packageQuantity * 10;
    packageUnit = "ml";
  }
  return { packageQuantity, packageUnit };
}

/**
 * Parses explicit purchase phrases such as `1 bottle x 450ml`, `250 g`, or `1 un`.
 */
export function parsePurchaseFormatPhrase(text: string): ParsedPhrase | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  const containerMatch = findContainerWithSizePhrase(trimmed);
  if (containerMatch?.groups) {
    const containerCount = parseQuantityToken(containerMatch.groups.count ?? "");
    const containerUnit = normalizeContainerToken(containerMatch.groups.container ?? "");
    const { packageQuantity, packageUnit } = parseMeasureSizeFromGroups(
      containerMatch.groups.size,
      containerMatch.groups.unit,
    );

    if (containerCount == null || packageQuantity == null || !packageUnit) return null;

    return {
      kind: "container_with_size",
      containerCount,
      containerUnit,
      packageQuantity,
      packageUnit,
      matchedText: containerMatch[0] ?? trimmed,
      confidence: 0.97,
      reason: `container×size "${containerMatch[0]?.trim()}"`,
    };
  }

  const multiMatch = findMultiUnitPackPhrase(trimmed);
  if (multiMatch?.groups) {
    const containerCount = parseQuantityToken(multiMatch.groups.count ?? "");
    const { packageQuantity, packageUnit } = parseMeasureSizeFromGroups(
      multiMatch.groups.size,
      multiMatch.groups.unit,
    );
    if (containerCount == null || packageQuantity == null || !packageUnit || packageUnit === "un") {
      return null;
    }
    return {
      kind: "multi_unit_pack",
      containerCount,
      containerUnit: "un",
      packageQuantity,
      packageUnit,
      matchedText: multiMatch[0] ?? trimmed,
      confidence: 0.96,
      reason: `multi-unit×size "${multiMatch[0]?.trim()}"`,
    };
  }

  const embeddedMeasure = findEmbeddedBareMeasurePhrase(trimmed);
  if (embeddedMeasure?.groups) {
    const containerCount = parseQuantityToken(embeddedMeasure.groups.count ?? "");
    const { packageQuantity, packageUnit } = parseMeasureSizeFromGroups(
      embeddedMeasure.groups.count,
      embeddedMeasure.groups.unit,
    );
    if (containerCount == null || packageQuantity == null || !packageUnit || packageUnit === "un") {
      return null;
    }
    return {
      kind: "weight_or_volume",
      containerCount: 1,
      containerUnit: packageUnit,
      packageQuantity: containerCount,
      packageUnit,
      matchedText: embeddedMeasure[0] ?? trimmed,
      confidence: 0.9,
      reason: `embedded measure "${embeddedMeasure[0]?.trim()}"`,
    };
  }

  const bareMeasure = trimmed.match(BARE_MEASURE_RE);
  if (bareMeasure?.groups) {
    const containerCount = parseQuantityToken(bareMeasure.groups.count ?? "");
    let packageUnit = normalizeMeasureUnit(bareMeasure.groups.unit ?? "");
    let packageQuantity = containerCount;
    if (bareMeasure.groups.unit?.toLowerCase() === "cl" && packageQuantity != null) {
      packageQuantity = packageQuantity * 10;
      packageUnit = "ml";
    }
    if (containerCount == null || !packageUnit || packageUnit === "un") return null;
    return {
      kind: "weight_or_volume",
      containerCount: 1,
      containerUnit: packageUnit,
      packageQuantity: containerCount,
      packageUnit,
      matchedText: bareMeasure[0] ?? trimmed,
      confidence: 0.95,
      reason: `bare measure "${bareMeasure[0]?.trim()}"`,
    };
  }

  const bareUnit = trimmed.match(BARE_UNIT_COUNT_RE);
  if (bareUnit?.groups) {
    const containerCount = parseQuantityToken(bareUnit.groups.count ?? "");
    if (containerCount == null) return null;
    return {
      kind: "unit_count",
      containerCount,
      containerUnit: "un",
      packageQuantity: 1,
      packageUnit: "un",
      matchedText: bareUnit[0] ?? trimmed,
      confidence: 0.94,
      reason: `unit count "${bareUnit[0]?.trim()}"`,
    };
  }

  return null;
}

function phraseFromRowFields(quantity: number | null, unit: string | null): ParsedPhrase | null {
  if (quantity == null || quantity <= 0 || !unit?.trim()) return null;
  return parsePurchaseFormatPhrase(`${quantity} ${unit}`.trim());
}

function usableFromPhrase(phrase: ParsedPhrase): {
  normalizedUsableQuantity: number | null;
  usableQuantityUnit: "g" | "ml" | "un" | null;
} {
  if (phrase.kind === "unit_count") {
    return {
      normalizedUsableQuantity: Math.max(1, Math.round(phrase.containerCount)),
      usableQuantityUnit: "un",
    };
  }

  if (phrase.packageQuantity == null || !phrase.packageUnit) {
    return { normalizedUsableQuantity: null, usableQuantityUnit: null };
  }

  if (phrase.kind === "container_with_size" || phrase.kind === "multi_unit_pack") {
    const perItem = measureToBase(phrase.packageQuantity, phrase.packageUnit);
    const total =
      phrase.packageUnit === "un"
        ? phrase.containerCount * phrase.packageQuantity
        : phrase.containerCount * perItem.amount;
    return {
      normalizedUsableQuantity: Math.max(1, Math.round(total)),
      usableQuantityUnit: perItem.base,
    };
  }

  const direct = measureToBase(phrase.packageQuantity, phrase.packageUnit);
  return {
    normalizedUsableQuantity: Math.max(1, Math.round(direct.amount)),
    usableQuantityUnit: direct.base,
  };
}

function usableFromInference(
  inferred: UnitInferenceResult,
  rowQuantity: number | null,
): {
  normalizedUsableQuantity: number | null;
  usableQuantityUnit: "g" | "ml" | "un" | null;
} {
  const purchaseQuantity =
    Number.isFinite(rowQuantity) && rowQuantity != null && rowQuantity > 0 ? rowQuantity : 1;

  if (inferred.normalized_stock_quantity != null && inferred.stock_unit) {
    const stockUnit = inferred.stock_unit === "L" ? "ml" : inferred.stock_unit;
    const baseUnit = stockUnit === "kg" ? "g" : (stockUnit as "g" | "ml" | "un");
    const stockQuantity = Math.max(1, purchaseQuantity * inferred.normalized_stock_quantity);
    return {
      normalizedUsableQuantity: stockQuantity,
      usableQuantityUnit: baseUnit,
    };
  }

  if (inferred.conversion_hint) {
    const estimated = Math.max(1, purchaseQuantity * inferred.conversion_hint.estimated_quantity);
    return {
      normalizedUsableQuantity: estimated,
      usableQuantityUnit: inferred.conversion_hint.stock_unit,
    };
  }

  if (inferred.base_unit === "g" || inferred.base_unit === "ml" || inferred.base_unit === "un") {
    return {
      normalizedUsableQuantity: inferred.purchase_quantity,
      usableQuantityUnit: inferred.base_unit,
    };
  }

  return { normalizedUsableQuantity: null, usableQuantityUnit: null };
}

function pickBestPhrase(
  namePhrase: ParsedPhrase | null,
  rowPhrase: ParsedPhrase | null,
): ParsedPhrase | null {
  if (namePhrase && rowPhrase) {
    return namePhrase.confidence >= rowPhrase.confidence ? namePhrase : rowPhrase;
  }
  return namePhrase ?? rowPhrase;
}

function inferenceHasPackSignals(inferred: UnitInferenceResult): boolean {
  return (
    inferred.normalized_stock_quantity != null ||
    inferred.pack_size != null ||
    inferred.package_type != null ||
    inferred.base_unit === "g" ||
    inferred.base_unit === "ml"
  );
}

/** Generic row `N un` is the outer purchase count, not a full format when the name carries size/pack signals. */
function shouldPreferInferenceOverRowPhrase(
  rowPhrase: ParsedPhrase | null,
  namePhrase: ParsedPhrase | null,
  inferred: UnitInferenceResult,
): boolean {
  if (!rowPhrase || rowPhrase.kind !== "unit_count") return false;
  if (inferred.confidence < 0.86 || !inferenceHasPackSignals(inferred)) return false;
  if (!namePhrase) return true;
  if (namePhrase.kind === "weight_or_volume" && namePhrase.confidence < 0.95) return true;
  return false;
}

/**
 * Resolves structured purchase data for an invoice line by combining explicit
 * format phrases (name or row qty/unit) with name-based unit inference.
 */
export function resolveInvoiceLinePurchaseFormat(
  item: InvoiceLinePurchaseInput,
): StructuredPurchaseFormat {
  const name = String(item.name ?? "").trim();
  const inferred = inferPurchaseUnitsFromLineItemName(name);
  const rowQuantity = item.quantity == null ? null : Number(item.quantity);
  const rowUnit = item.unit?.trim() || null;

  const namePhrase = parsePurchaseFormatPhrase(name);
  const rowPhrase = phraseFromRowFields(
    Number.isFinite(rowQuantity) && rowQuantity != null && rowQuantity > 0 ? rowQuantity : null,
    rowUnit,
  );
  let explicit = pickBestPhrase(namePhrase, rowPhrase);
  if (shouldPreferInferenceOverRowPhrase(rowPhrase, namePhrase, inferred)) {
    explicit = null;
  }

  if (explicit) {
    const usable = usableFromPhrase(explicit);
    return sanitizeStructuredUsable({
      kind: explicit.kind,
      ingredientIdentityHint: stripMatchedPurchaseText(name, explicit.matchedText),
      purchaseContainerCount: explicit.containerCount,
      purchaseContainerUnit: explicit.containerUnit,
      packageQuantity: explicit.packageQuantity,
      packageMeasurementUnit: explicit.packageUnit,
      normalizedUsableQuantity: usable.normalizedUsableQuantity,
      usableQuantityUnit: usable.usableQuantityUnit,
      packageType: resolvePackageType(explicit.containerUnit) ?? inferred.package_type,
      inferred,
      confidence: explicit.confidence,
      reason: explicit.reason,
    });
  }

  const rowOnly =
    Number.isFinite(rowQuantity) && rowQuantity != null && rowQuantity > 0 && Boolean(rowUnit);
  const usable = usableFromInference(inferred, rowQuantity);
  const purchaseContainerCount =
    Number.isFinite(rowQuantity) && rowQuantity != null && rowQuantity > 0 ? rowQuantity : 1;

  if (inferred.base_unit || inferred.normalized_stock_quantity != null || inferred.conversion_hint) {
    return sanitizeStructuredUsable({
      kind: "inferred",
      ingredientIdentityHint: name,
      purchaseContainerCount: inferred.package_type
        ? purchaseContainerCount
        : inferred.purchase_unit_count > 1
          ? inferred.purchase_unit_count
          : purchaseContainerCount,
      purchaseContainerUnit: inferred.purchase_unit ?? inferred.base_unit,
      packageQuantity: inferred.pack_size,
      packageMeasurementUnit: inferred.pack_size_unit,
      normalizedUsableQuantity: usable.normalizedUsableQuantity,
      usableQuantityUnit: usable.usableQuantityUnit,
      packageType: inferred.package_type,
      inferred,
      confidence: inferred.confidence,
      reason: inferred.reason,
    });
  }

  return sanitizeStructuredUsable({
    kind: rowOnly ? "row_only" : "inferred",
    ingredientIdentityHint: name,
    purchaseContainerCount,
    purchaseContainerUnit: rowUnit,
    packageQuantity: null,
    packageMeasurementUnit: normalizeMeasureUnit(rowUnit ?? ""),
    normalizedUsableQuantity: null,
    usableQuantityUnit: null,
    packageType: inferred.package_type,
    inferred,
    confidence: rowOnly ? 0.7 : 0,
    reason: rowOnly ? "invoice row quantity and unit only" : "no purchase format resolved",
  });
}

function isImpossibleUsableQuantity(quantity: number | null, unit: "g" | "ml" | "un" | null): boolean {
  if (quantity == null || !unit) return false;
  if (!Number.isFinite(quantity) || quantity <= 0) return true;
  if (unit === "g" && quantity > 500_000) return true;
  if (unit === "ml" && quantity > 500_000) return true;
  if (unit === "un" && quantity > 10_000) return true;
  return false;
}

/**
 * Detects collapsed stock labels such as `1 g usable` that carry no operational meaning.
 */
export function isMeaninglessUsableStockLabel(label: string): boolean {
  const normalized = label.trim().toLowerCase().replace(/\s+/g, " ");
  return /^(1 g|1 ml|1 units?)\s+usable$/.test(normalized);
}

export function isCollapsedMeaninglessUsable(
  quantity: number | null,
  unit: "g" | "ml" | "un" | null,
  structured: StructuredPurchaseFormat,
): boolean {
  if (quantity == null || !unit) return false;
  const rounded = Math.round(quantity);
  if (rounded !== 1) return false;

  if (unit === "g" || unit === "ml") {
    if (structured.kind === "weight_or_volume" && structured.packageQuantity === 1) return true;
    if (structured.kind === "inferred" || structured.kind === "row_only") {
      return structured.confidence < USABLE_STOCK_MIN_CONFIDENCE;
    }
    return structured.confidence < 0.88;
  }

  if (unit === "un") {
    if (structured.kind === "row_only") return true;
    if (structured.kind === "unit_count" && structured.purchaseContainerCount === 1) return true;
    if (structured.kind === "inferred" && structured.confidence < USABLE_STOCK_MIN_CONFIDENCE) {
      return true;
    }
  }

  return false;
}

export function shouldPreserveRawPurchaseDisplay(structured: StructuredPurchaseFormat): boolean {
  if (structured.confidence >= RAW_PURCHASE_DISPLAY_MIN_CONFIDENCE) return false;
  if (formatStructuredPurchaseDisplay(structured)) return false;
  return true;
}

/** Preserves invoice OCR text when structured parsing is weak or absent. */
export function formatInvoiceLineRawPurchaseFallback(item: InvoiceLinePurchaseInput): string | null {
  const rowQuantity = item.quantity == null ? null : Number(item.quantity);
  const rowUnit = item.unit?.trim();
  if (Number.isFinite(rowQuantity) && rowQuantity != null && rowQuantity > 0 && rowUnit) {
    return formatQuantityWithUnit(rowQuantity, rowUnit);
  }

  const explicit = parsePurchaseFormatPhrase(String(item.name ?? "").trim());
  if (explicit?.matchedText) return explicit.matchedText.trim();

  const name = String(item.name ?? "").trim();
  const multi = findMultiUnitPackPhrase(name);
  if (multi?.[0]) return multi[0].trim();
  const container = findContainerWithSizePhrase(name);
  if (container?.[0]) return container[0].trim();

  return name || null;
}

function sanitizeStructuredUsable(structured: StructuredPurchaseFormat): StructuredPurchaseFormat {
  const { normalizedUsableQuantity, usableQuantityUnit } = structured;
  if (
    isImpossibleUsableQuantity(normalizedUsableQuantity, usableQuantityUnit) ||
    isCollapsedMeaninglessUsable(normalizedUsableQuantity, usableQuantityUnit, structured)
  ) {
    return {
      ...structured,
      normalizedUsableQuantity: null,
      usableQuantityUnit: null,
      confidence: Math.min(structured.confidence, 0.55),
      reason: `${structured.reason}; suppressed weak usable collapse`,
    };
  }
  return structured;
}

function formatOperationalQuantity(value: number, unit: string): string {
  const normalizedUnit = unit.trim().toLowerCase();
  if (normalizedUnit === "g" && Math.abs(value) >= 1000) {
    return formatQuantityWithUnit(value / 1000, "kg");
  }
  if (normalizedUnit === "ml" && Math.abs(value) >= 1000) {
    return formatQuantityWithUnit(value / 1000, "L");
  }
  return formatQuantityWithUnit(value, unit);
}

export function formatUsableStockQuantityLabel(
  quantity: number,
  unit: string,
  structured: StructuredPurchaseFormat,
): string | null {
  const normalizedUnit = unit.trim().toLowerCase();
  const baseUnit: "g" | "ml" | "un" | null =
    normalizedUnit === "g"
      ? "g"
      : normalizedUnit === "ml"
        ? "ml"
        : normalizedUnit === "units" || normalizedUnit === "un" || normalizedUnit === "unit"
          ? "un"
          : null;
  if (
    isCollapsedMeaninglessUsable(quantity, baseUnit, structured) ||
    isImpossibleUsableQuantity(quantity, baseUnit)
  ) {
    return null;
  }
  const label = `${formatOperationalQuantity(quantity, unit)} usable`;
  return isMeaninglessUsableStockLabel(label) ? null : label;
}

const CONTAINER_DISPLAY_LABELS: Record<string, { singular: string; plural: string }> = {
  pack: { singular: "pack", plural: "packs" },
  packs: { singular: "pack", plural: "packs" },
  bottle: { singular: "bottle", plural: "bottles" },
  bottles: { singular: "bottle", plural: "bottles" },
  garrafa: { singular: "bottle", plural: "bottles" },
  garrafas: { singular: "bottle", plural: "bottles" },
  caixa: { singular: "case", plural: "cases" },
  caixas: { singular: "case", plural: "cases" },
  cx: { singular: "case", plural: "cases" },
  case: { singular: "case", plural: "cases" },
  cases: { singular: "case", plural: "cases" },
  lata: { singular: "can", plural: "cans" },
  latas: { singular: "can", plural: "cans" },
  can: { singular: "can", plural: "cans" },
  cans: { singular: "can", plural: "cans" },
  saco: { singular: "bag", plural: "bags" },
  sacos: { singular: "bag", plural: "bags" },
  bag: { singular: "bag", plural: "bags" },
  bags: { singular: "bag", plural: "bags" },
};

const PACKAGE_TYPE_DISPLAY_LABELS: Record<PackageType, { singular: string; plural: string }> = {
  pack: { singular: "pack", plural: "packs" },
  caixa: { singular: "case", plural: "cases" },
  garrafa: { singular: "bottle", plural: "bottles" },
  lata: { singular: "can", plural: "cans" },
  saco: { singular: "bag", plural: "bags" },
};

function formatPurchaseCount(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function formatPackageMeasureSize(quantity: number, unit: PackageMeasureUnit): string {
  if (unit === "kg" || unit === "L") {
    return formatQuantityWithUnit(quantity, unit);
  }
  if (unit === "g" && quantity >= 1000) {
    return formatQuantityWithUnit(quantity / 1000, "kg");
  }
  if (unit === "ml" && quantity >= 1000) {
    return formatQuantityWithUnit(quantity / 1000, "L");
  }
  return formatQuantityWithUnit(quantity, unit);
}

const BASE_MEASURE_UNITS = new Set(["g", "ml", "kg", "l"]);

function isBaseMeasureContainerUnit(unit: string | null | undefined): boolean {
  if (!unit) return false;
  return BASE_MEASURE_UNITS.has(unit.trim().toLowerCase());
}

/** Structured package size exists (not a bare generic unit row). */
export function hasRichPackageSemantics(structured: StructuredPurchaseFormat): boolean {
  return (
    structured.packageQuantity != null &&
    structured.packageMeasurementUnit != null &&
    structured.packageMeasurementUnit !== "un"
  );
}

/** Collapsed invoice purchase labels that hide real pack size. */
export function isCollapsedMeaninglessPurchaseLabel(label: string | null | undefined): boolean {
  if (!label) return false;
  const normalized = label.trim().toLowerCase().replace(/\s+/g, " ");
  return /^(1 g|1 ml|1 un|1 units?)$/.test(normalized);
}

function isBulkPurchaseMeasure(quantity: number, unit: PackageMeasureUnit): boolean {
  if (unit === "kg" || unit === "L") return true;
  if (unit === "g" && quantity >= 1000) return true;
  if (unit === "ml" && quantity >= 1000) return true;
  return false;
}

function enrichStructuredForPurchaseDisplay(
  structured: StructuredPurchaseFormat,
): StructuredPurchaseFormat {
  const inferred = structured.inferred;
  if (inferred.pack_size == null || !inferred.pack_size_unit) return structured;

  const collapsedRowMeasure =
    structured.packageQuantity === 1 &&
    (structured.packageMeasurementUnit === "g" || structured.packageMeasurementUnit === "ml") &&
    (structured.kind === "weight_or_volume" || structured.kind === "row_only");

  const nameMeasureSmallerThanPack =
    structured.kind === "weight_or_volume" &&
    structured.packageQuantity != null &&
    structured.packageMeasurementUnit === inferred.pack_size_unit &&
    inferred.pack_size > structured.packageQuantity;

  if (!collapsedRowMeasure && !nameMeasureSmallerThanPack) return structured;

  return {
    ...structured,
    packageQuantity: inferred.pack_size,
    packageMeasurementUnit: inferred.pack_size_unit,
    purchaseContainerCount:
      structured.purchaseContainerCount > 0 ? structured.purchaseContainerCount : 1,
    packageType: structured.packageType ?? inferred.package_type,
  };
}

function resolveContainerDisplayLabel(
  structured: StructuredPurchaseFormat,
): { singular: string; plural: string } | null {
  const raw = structured.purchaseContainerUnit?.trim().toLowerCase();
  if (raw && CONTAINER_DISPLAY_LABELS[raw]) return CONTAINER_DISPLAY_LABELS[raw];
  if (structured.packageType) return PACKAGE_TYPE_DISPLAY_LABELS[structured.packageType];
  return null;
}

/** Display-only container noun when structured unit is a base measure (g/ml) but pack size is known. */
function resolveInferredDisplayContainerLabel(
  structured: StructuredPurchaseFormat,
  enrichedFromCollapsedRow: boolean,
): { singular: string; plural: string } | null {
  const explicit = resolveContainerDisplayLabel(structured);
  if (explicit) return explicit;
  if (!hasRichPackageSemantics(structured)) return null;

  const measureUnit = structured.packageMeasurementUnit;
  const measureQty = structured.packageQuantity ?? 0;
  if (measureUnit && isBulkPurchaseMeasure(measureQty, measureUnit)) {
    if (!enrichedFromCollapsedRow) {
      if (measureUnit === "L" && measureQty === 1 && structured.inferred.stock_unit === "ml") {
        return PACKAGE_TYPE_DISPLAY_LABELS.garrafa;
      }
      return null;
    }
    if (measureUnit === "ml" || measureUnit === "L" || structured.inferred.stock_unit === "ml") {
      return PACKAGE_TYPE_DISPLAY_LABELS.garrafa;
    }
    return PACKAGE_TYPE_DISPLAY_LABELS.pack;
  }

  if (measureUnit === "ml" || structured.inferred.stock_unit === "ml") {
    return PACKAGE_TYPE_DISPLAY_LABELS.garrafa;
  }
  if (measureUnit === "g" || measureUnit === "kg") {
    return PACKAGE_TYPE_DISPLAY_LABELS.pack;
  }
  return null;
}

function shouldShowPurchaseContainer(
  structured: StructuredPurchaseFormat,
  enriched: StructuredPurchaseFormat,
): boolean {
  if (structured.kind === "inferred" || structured.kind === "multi_unit_pack") return true;
  if (resolveContainerDisplayLabel(structured)) return true;
  if (enriched !== structured) return true;
  if (!hasRichPackageSemantics(enriched)) return false;
  if (structured.kind !== "weight_or_volume") return false;

  const measureUnit = enriched.packageMeasurementUnit;
  const measureQty = enriched.packageQuantity ?? 0;
  if (!measureUnit || isBulkPurchaseMeasure(measureQty, measureUnit)) return false;

  return Boolean(enriched.ingredientIdentityHint.trim());
}

function formatContainerCountLabel(structured: StructuredPurchaseFormat): string | null {
  const labels = resolveContainerDisplayLabel(structured);
  if (!labels) return null;
  const count = structured.purchaseContainerCount;
  const noun = count === 1 ? labels.singular : labels.plural;
  return `${formatPurchaseCount(count)} ${noun}`;
}

/**
 * Human-readable purchase label from structured fields (container, pack size, units).
 * Does not collapse to normalized usable quantity — use that only for stock math.
 */
export function formatStructuredPurchaseDisplay(structured: StructuredPurchaseFormat): string | null {
  const enriched = enrichStructuredForPurchaseDisplay(structured);
  const packageQuantity = enriched.packageQuantity;
  const packageUnit = enriched.packageMeasurementUnit;

  if (enriched.kind === "unit_count" || (packageUnit === "un" && enriched.purchaseContainerUnit === "un")) {
    return formatQuantityWithUnit(enriched.purchaseContainerCount, "un");
  }

  const hasPackageSize =
    packageQuantity != null && packageUnit != null && packageUnit !== "un";
  const sizeLabel =
    hasPackageSize && packageUnit ? formatPackageMeasureSize(packageQuantity, packageUnit) : null;
  if (!sizeLabel) return null;

  const explicitContainerLabel = formatContainerCountLabel(enriched);
  if (explicitContainerLabel) {
    return `${explicitContainerLabel} x ${sizeLabel}`;
  }

  if (enriched.kind === "multi_unit_pack") {
    return `${formatPurchaseCount(enriched.purchaseContainerCount)} x ${sizeLabel}`;
  }

  if (shouldShowPurchaseContainer(structured, enriched)) {
    const containerLabels = resolveInferredDisplayContainerLabel(
      enriched,
      enriched !== structured,
    );
    if (containerLabels) {
      const count = enriched.purchaseContainerCount;
      const noun = count === 1 ? containerLabels.singular : containerLabels.plural;
      return `${formatPurchaseCount(count)} ${noun} x ${sizeLabel}`;
    }
  }

  if (enriched.kind === "weight_or_volume" || enriched.kind === "inferred" || enriched.kind === "row_only") {
    return sizeLabel;
  }

  if (enriched.kind === "container_with_size") {
    return sizeLabel;
  }

  return null;
}

/**
 * Best-effort purchase label: structured format first, then raw invoice text when parsing is weak.
 */
export function resolveInvoicePurchaseDisplayLabel(item: InvoiceLinePurchaseInput): string | null {
  const structured = resolveInvoiceLinePurchaseFormat(item);
  const display = formatStructuredPurchaseDisplay(structured);
  if (display && !isCollapsedMeaninglessPurchaseLabel(display)) return display;

  const raw = formatInvoiceLineRawPurchaseFallback(item);
  if (raw && !isCollapsedMeaninglessPurchaseLabel(raw)) return raw;

  return display ?? raw;
}

export type IngredientPurchaseFields = {
  purchase_quantity: number;
  purchase_unit: string;
  base_unit: string;
};

/** Maps structured purchase data to ingredient insert fields (matching prior invoice behavior). */
export function structuredPurchaseToIngredientFields(
  structured: StructuredPurchaseFormat,
  extractedUnit: string | null,
  isGenericUnit: (unit: string | null | undefined) => boolean,
): IngredientPurchaseFields {
  const inferred = structured.inferred;
  const conversionHint = inferred.conversion_hint;

  const stockUnit =
    inferred.base_unit && isGenericUnit(extractedUnit)
      ? inferred.base_unit
      : (extractedUnit ?? inferred.base_unit ?? conversionHint?.purchase_unit ?? "kg");

  if (inferred.base_unit) {
    return {
      purchase_quantity: inferred.purchase_quantity,
      purchase_unit: inferred.purchase_unit ?? stockUnit,
      base_unit: inferred.base_unit ?? stockUnit,
    };
  }

  if (structured.normalizedUsableQuantity != null && structured.usableQuantityUnit) {
    return {
      purchase_quantity: structured.normalizedUsableQuantity,
      purchase_unit: structured.usableQuantityUnit,
      base_unit: structured.usableQuantityUnit,
    };
  }

  return {
    purchase_quantity: 1,
    purchase_unit: stockUnit,
    base_unit: stockUnit,
  };
}
