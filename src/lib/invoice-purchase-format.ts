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
import { looksLikeInvoiceShorthandName } from "@/lib/ingredient-kind";
import {
  isWeakInvoiceRowContentMeasure,
  logStockGramMlTrace,
  logStockNormalize,
  logStockNormalizationSource,
  logStockRenderSource,
  logStockResidualSource,
  type StockRenderSource,
  normalizeMeasureUnit,
  findBestContainerWithSizeMatch,
  normalizePurchasedToUsableStock,
  parsePurchaseStructureFromText,
  parseQuantityToken,
  purchaseStructureToPackPhrase,
  summarizePurchaseStructure,
  type NormalizedPackPhrase,
  type PurchaseStructure,
  type StockNormalizationPipelineId,
  type StockNormalizeResult,
} from "@/lib/stock-normalization";
import { inferUnitFamily } from "@/lib/recipe-unit-normalization";
import { detectObviousCountableUsage } from "@/lib/recipe-usage-unit-inference";
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
  /** Which pipeline produced `normalizedUsableQuantity` (always `unified` before sanitization). */
  stockNormalizationPipeline: StockNormalizationPipelineId;
};

export type InvoiceLinePurchaseInput = {
  name: string;
  quantity?: number | null;
  unit?: string | null;
  /** Matched catalog display name — used for shorthand per-piece weight when the line has no pack structure. */
  matchedIngredientName?: string | null;
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
  return findBestContainerWithSizeMatch(text);
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

const PACK_CONTAINER_ROW_UNITS = new Set([
  "pack",
  "packs",
  "caixa",
  "caixas",
  "cx",
  "case",
  "cases",
  "box",
  "boxes",
  "emb",
  "em",
  "embalagem",
  "embalagens",
  "tray",
  "trays",
  "bandeja",
  "bandejas",
  "bundle",
  "bundles",
]);

function hasExplicitCaseUnitCountInName(name: string): boolean {
  return (
    /\b(?:caixa|caixas|cx)\s*\d+/i.test(name) ||
    /\b\d+\s*(?:un|uni|und|unds|unid|unids|unit|units)\b/i.test(name) ||
    /\b\d+\s*(?:x|×|\*|X)\s*\d+/i.test(name)
  );
}

/**
 * Invoice row is a case/pack container but the product name only embeds per-piece weight
 * (e.g. `ANGUS 180G` @ 1 cx) — not total case weight for display.
 */
export function isCaseRowWithEmbeddedPieceWeightOnly(
  name: string,
  rowUnit: string | null | undefined,
): boolean {
  const normalizedRowUnit = rowUnit?.trim().toLowerCase();
  if (!normalizedRowUnit || !PACK_CONTAINER_ROW_UNITS.has(normalizedRowUnit)) {
    return false;
  }
  const structure = parsePurchaseStructureFromText(name.trim());
  if (!structure || structure.tier !== "bare_measure") return false;
  if (hasExplicitCaseUnitCountInName(name)) return false;
  return true;
}

function adjustCasePieceWeightDisplay(
  structured: StructuredPurchaseFormat,
  item: InvoiceLinePurchaseInput,
): StructuredPurchaseFormat {
  const name = String(item.name ?? "").trim();
  const rowUnit = item.unit?.trim() || null;
  if (!isCaseRowWithEmbeddedPieceWeightOnly(name, rowUnit)) return structured;

  return {
    ...structured,
    purchaseContainerUnit: rowUnit!.trim().toLowerCase(),
    normalizedUsableQuantity: null,
    usableQuantityUnit: null,
    reason: `${structured.reason}; case row piece-weight-only display`,
  };
}

/** Display-only wrapper — does not alter persistence / costing resolution. */
export function resolveStructuredPurchaseForDisplay(
  item: InvoiceLinePurchaseInput,
): StructuredPurchaseFormat {
  return adjustCasePieceWeightDisplay(resolveInvoiceLinePurchaseFormat(item), item);
}

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

function parsedPhraseFromPurchaseStructure(structure: PurchaseStructure): ParsedPhrase {
  const normalized = purchaseStructureToPackPhrase(structure);
  const hasInner = structure.innerUnitCount != null && structure.innerUnitCount > 1;
  const kind: ParsedPhrase["kind"] =
    hasInner || normalized.kind === "multi_unit_pack"
      ? "multi_unit_pack"
      : normalized.kind === "container_with_size"
        ? "container_with_size"
        : normalized.kind === "unit_count"
          ? "unit_count"
          : "weight_or_volume";

  const containerCount = hasInner
    ? structure.innerUnitCount ?? structure.purchaseQuantity
    : structure.tier === "count_size"
      ? structure.purchaseQuantity
      : structure.purchaseQuantity;

  return {
    kind,
    containerCount,
    containerUnit:
      structure.tier === "bare_measure" || structure.tier === "count_size"
        ? structure.unitMeasurement
        : structure.purchaseFormat === "unit"
          ? structure.innerUnitType ?? "un"
          : structure.purchaseFormat,
    packageQuantity: structure.unitSize,
    packageUnit: structure.unitMeasurement,
    matchedText: structure.matchedText,
    confidence: 0.98,
    reason: `purchase structure (${structure.tier})`,
  };
}

function toNormalizedPackPhrase(phrase: ParsedPhrase): NormalizedPackPhrase {
  return {
    kind: phrase.kind,
    containerCount: phrase.containerCount,
    packageQuantity: phrase.packageQuantity,
    packageUnit: phrase.packageUnit,
    confidence: phrase.confidence,
  };
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

  const structure = parsePurchaseStructureFromText(trimmed);
  if (structure) {
    return parsedPhraseFromPurchaseStructure(structure);
  }

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
      packageQuantity,
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

function parsedPhraseMatchesNormalized(
  parsed: ParsedPhrase,
  normalized: NormalizedPackPhrase,
): boolean {
  const n = toNormalizedPackPhrase(parsed);
  return (
    n.kind === normalized.kind &&
    n.containerCount === normalized.containerCount &&
    n.packageQuantity === normalized.packageQuantity &&
    n.packageUnit === normalized.packageUnit
  );
}

function pickExplicitPhrase(
  namePhrase: ParsedPhrase | null,
  rowPhrase: ParsedPhrase | null,
  rowQuantity: number | null,
): ParsedPhrase | null {
  if (namePhrase && rowPhrase) {
    if (
      isWeakInvoiceRowContentMeasure(
        toNormalizedPackPhrase(rowPhrase),
        rowQuantity,
        toNormalizedPackPhrase(namePhrase),
      )
    ) {
      return namePhrase;
    }
    return namePhrase.confidence >= rowPhrase.confidence ? namePhrase : rowPhrase;
  }
  return namePhrase ?? rowPhrase;
}

function inferenceHintsFromResult(
  inferred: UnitInferenceResult,
): NonNullable<Parameters<typeof normalizePurchasedToUsableStock>[0]["inferred"]> {
  return {
    normalized_stock_quantity: inferred.normalized_stock_quantity,
    stock_unit: inferred.stock_unit,
    purchase_quantity: inferred.purchase_quantity,
    base_unit: inferred.base_unit,
    conversion_hint: inferred.conversion_hint,
  };
}

function pipelineIdFromStock(stock: StockNormalizeResult): StockNormalizationPipelineId {
  return stock.pipelineId;
}

function isSemanticShorthandStock(
  stock: StockNormalizeResult,
  item: InvoiceLinePurchaseInput,
): boolean {
  if (!stock.reason.startsWith("shorthand usable")) return false;
  const name = String(item.name ?? "").trim();
  const hasMatch = Boolean(item.matchedIngredientName?.trim());
  if (!looksLikeInvoiceShorthandName(name) && !hasMatch) return false;
  return (
    stock.source === "inference" &&
    stock.pipelineId === "unified" &&
    stock.usableUnit != null &&
    stock.usableUnit !== "un" &&
    stock.packQuantity != null &&
    stock.packUnit != null &&
    stock.packUnit !== "un"
  );
}

/** Maps semantic shorthand stock (per-piece g/ml) into structured purchase fields for display. */
function structuredFromSemanticShorthandStock(
  stock: StockNormalizeResult,
  name: string,
  rowUnit: string | null,
  inferred: UnitInferenceResult,
): StructuredPurchaseFormat {
  return {
    kind: "weight_or_volume",
    ingredientIdentityHint: name,
    purchaseContainerCount: stock.purchaseContainerCount,
    purchaseContainerUnit: rowUnit?.trim() || "un",
    packageQuantity: stock.packQuantity,
    packageMeasurementUnit: stock.packUnit as PackageMeasureUnit,
    normalizedUsableQuantity: stock.usableQuantity,
    usableQuantityUnit: stock.usableUnit,
    packageType: inferred.package_type,
    inferred,
    confidence: 0.94,
    reason: stock.reason,
    stockNormalizationPipeline: pipelineIdFromStock(stock),
  };
}

function structuredFromExplicitPhrase(
  explicit: ParsedPhrase,
  stock: StockNormalizeResult,
  name: string,
  inferred: UnitInferenceResult,
): StructuredPurchaseFormat {
  const structure = stock.purchaseStructure;
  const packageQuantity = structure?.unitSize ?? explicit.packageQuantity;
  const packageUnit = structure?.unitMeasurement ?? explicit.packageUnit;
  const purchaseContainerCount =
    structure?.innerUnitCount != null && structure.innerUnitCount > 1
      ? structure.innerUnitCount
      : structure?.tier === "count_size"
        ? structure.purchaseQuantity
        : stock.purchaseContainerCount;

  return {
    kind: explicit.kind,
    ingredientIdentityHint: stripMatchedPurchaseText(name, explicit.matchedText),
    purchaseContainerCount,
    purchaseContainerUnit: explicit.containerUnit,
    packageQuantity,
    packageMeasurementUnit: packageUnit,
    normalizedUsableQuantity: stock.usableQuantity,
    usableQuantityUnit: stock.usableUnit,
    packageType: resolvePackageType(explicit.containerUnit) ?? inferred.package_type,
    inferred,
    confidence: explicit.confidence,
    reason: structure ? `${explicit.reason}; ${stock.reason}` : explicit.reason,
    stockNormalizationPipeline: pipelineIdFromStock(stock),
  };
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
  if (inferred.conversion_hint && rowPhrase?.kind === "unit_count") return true;
  if (inferred.conversion_hint && namePhrase?.kind === "unit_count") return true;
  if (!rowPhrase || rowPhrase.kind !== "unit_count") return false;
  if (inferred.confidence < 0.86 || !inferenceHasPackSignals(inferred)) return false;
  if (!namePhrase) return true;
  if (namePhrase.kind === "weight_or_volume" && namePhrase.confidence < 0.95) return true;
  return false;
}

/** Per-item weight in the name (80G) is metadata when inference found an outer unit count (120 UN). */
function shouldPreferInferenceOverNameWeightPhrase(
  namePhrase: ParsedPhrase | null,
  inferred: UnitInferenceResult,
): boolean {
  if (!namePhrase || namePhrase.kind !== "weight_or_volume") return false;
  if (inferred.size_is_metadata_only && inferred.stock_unit === "un") return true;
  if (
    inferred.purchase_unit_count > 1 &&
    inferred.normalized_stock_quantity != null &&
    inferred.stock_unit === "un"
  ) {
    return true;
  }
  return false;
}

function shouldPreferInferenceOverExplicitPhrase(
  rowPhrase: ParsedPhrase | null,
  namePhrase: ParsedPhrase | null,
  inferred: UnitInferenceResult,
): boolean {
  return (
    shouldPreferInferenceOverRowPhrase(rowPhrase, namePhrase, inferred) ||
    shouldPreferInferenceOverNameWeightPhrase(namePhrase, inferred)
  );
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
  const preferInference = shouldPreferInferenceOverExplicitPhrase(rowPhrase, namePhrase, inferred);
  const explicit = preferInference ? null : pickExplicitPhrase(namePhrase, rowPhrase, rowQuantity);

  const stock = normalizePurchasedToUsableStock({
    name,
    namePhrase:
      preferInference || !namePhrase ? null : toNormalizedPackPhrase(namePhrase),
    rowPhrase: preferInference ? null : rowPhrase ? toNormalizedPackPhrase(rowPhrase) : null,
    rowQuantity,
    rowUnit,
    inferred: inferenceHintsFromResult(inferred),
    matchedIngredientName: item.matchedIngredientName ?? null,
  });

  logStockNormalize("resolve_line", {
    name,
    rowQuantity,
    rowUnit,
    namePhrase: namePhrase ? toNormalizedPackPhrase(namePhrase) : null,
    rowPhrase: rowPhrase ? toNormalizedPackPhrase(rowPhrase) : null,
    explicitKind: explicit?.kind ?? null,
    stockSource: stock.source,
    pipelineId: stock.pipelineId,
    purchaseStructure: stock.purchaseStructure
      ? summarizePurchaseStructure(stock.purchaseStructure)
      : null,
  });

  logStockGramMlTrace("resolveInvoiceLinePurchaseFormat.stock", {
    name,
    beforeQty: rowQuantity,
    afterQty: stock.usableQuantity,
    unit: stock.usableUnit,
    rowUnit,
    stockSource: stock.source,
    unitSize: stock.purchaseStructure?.unitSize ?? null,
    structureTotal: stock.purchaseStructure?.totalUsableAmount ?? null,
  });

  if (isSemanticShorthandStock(stock, item)) {
    return sanitizeStructuredUsable(
      structuredFromSemanticShorthandStock(stock, name, rowUnit, inferred),
    );
  }

  if (stock.source === "explicit_phrase" || stock.source === "purchase_structure") {
    const phraseForStructured =
      explicit ??
      namePhrase ??
      (stock.purchaseStructure ? parsePurchaseFormatPhrase(name) : null) ??
      (namePhrase && stock.explicitPhrase && parsedPhraseMatchesNormalized(namePhrase, stock.explicitPhrase)
        ? namePhrase
        : null) ??
      (rowPhrase && stock.explicitPhrase && parsedPhraseMatchesNormalized(rowPhrase, stock.explicitPhrase)
        ? rowPhrase
        : null);
    if (phraseForStructured) {
      const structured = structuredFromExplicitPhrase(phraseForStructured, stock, name, inferred);
      logStockGramMlTrace("resolveInvoiceLinePurchaseFormat.structured", {
        name,
        beforeQty: stock.usableQuantity,
        afterQty: structured.normalizedUsableQuantity,
        unit: structured.usableQuantityUnit,
        packageQuantity: structured.packageQuantity,
        kind: structured.kind,
      });
      return sanitizeStructuredUsable(structured);
    }
  }

  const rowOnly =
    Number.isFinite(rowQuantity) && rowQuantity != null && rowQuantity > 0 && Boolean(rowUnit);
  const purchaseContainerCount =
    Number.isFinite(rowQuantity) && rowQuantity != null && rowQuantity > 0 ? rowQuantity : 1;

  if (inferred.base_unit || inferred.normalized_stock_quantity != null || inferred.conversion_hint) {
    return sanitizeStructuredUsable(
      backfillUsableFromPackageFields(
        {
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
          normalizedUsableQuantity: stock.usableQuantity,
          usableQuantityUnit: stock.usableUnit,
          packageType: inferred.package_type,
          inferred,
          confidence: inferred.confidence,
          reason: inferred.reason,
          stockNormalizationPipeline: pipelineIdFromStock(stock),
        },
        rowQuantity,
        rowUnit,
      ),
    );
  }

  return sanitizeStructuredUsable({
    kind: rowOnly ? "row_only" : "inferred",
    ingredientIdentityHint: name,
    purchaseContainerCount,
    purchaseContainerUnit: rowUnit,
    packageQuantity: null,
    packageMeasurementUnit: normalizeMeasureUnit(rowUnit ?? ""),
    normalizedUsableQuantity: stock.usableQuantity,
    usableQuantityUnit: stock.usableUnit,
    packageType: inferred.package_type,
    inferred,
    confidence: rowOnly ? 0.7 : 0,
    reason: rowOnly ? "invoice row quantity and unit only" : "no purchase format resolved",
    stockNormalizationPipeline: pipelineIdFromStock(stock),
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

/** When display enrichment adds pack size but usable was missing, derive from package fields. */
function backfillUsableFromPackageFields(
  structured: StructuredPurchaseFormat,
  rowQuantity: number | null,
  rowUnit: string | null,
): StructuredPurchaseFormat {
  if (structured.normalizedUsableQuantity != null && structured.usableQuantityUnit) {
    return structured;
  }

  const packQty = structured.packageQuantity ?? structured.inferred.pack_size;
  const packUnit = structured.packageMeasurementUnit ?? structured.inferred.pack_size_unit;
  if (packQty == null || !packUnit || packUnit === "un") return structured;

  const stock = normalizePurchasedToUsableStock({
    name: structured.ingredientIdentityHint,
    namePhrase: {
      kind: "container_with_size",
      containerCount: structured.purchaseContainerCount,
      packageQuantity: packQty,
      packageUnit: packUnit,
      confidence: structured.confidence,
    },
    rowPhrase: null,
    rowQuantity,
    rowUnit,
    inferred: inferenceHintsFromResult(structured.inferred),
    matchedIngredientName: null,
  });

  if (stock.usableQuantity == null || !stock.usableUnit) return structured;

  return {
    ...structured,
    packageQuantity: packQty,
    packageMeasurementUnit: packUnit,
    purchaseContainerCount: stock.purchaseContainerCount,
    normalizedUsableQuantity: stock.usableQuantity,
    usableQuantityUnit: stock.usableUnit,
    stockNormalizationPipeline: pipelineIdFromStock(stock),
    reason: `${structured.reason}; backfilled usable from pack size`,
  };
}

function sanitizeStructuredUsable(structured: StructuredPurchaseFormat): StructuredPurchaseFormat {
  const { normalizedUsableQuantity, usableQuantityUnit } = structured;
  if (
    isImpossibleUsableQuantity(normalizedUsableQuantity, usableQuantityUnit) ||
    isCollapsedMeaninglessUsable(normalizedUsableQuantity, usableQuantityUnit, structured)
  ) {
    logStockGramMlTrace("sanitizeStructuredUsable.suppressed", {
      beforeQty: normalizedUsableQuantity,
      afterQty: null,
      unit: usableQuantityUnit,
      kind: structured.kind,
      confidence: structured.confidence,
    });
    logStockNormalize("impossible_usable", {
      quantity: normalizedUsableQuantity,
      unit: usableQuantityUnit,
      kind: structured.kind,
    });
    return {
      ...structured,
      normalizedUsableQuantity: null,
      usableQuantityUnit: null,
      confidence: Math.min(structured.confidence, 0.55),
      stockNormalizationPipeline: "suppressed",
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

/** Maps canonical base usable (g/ml/un) to a stock-added label; optional kg/L display. */
export function formatCanonicalUsableStockLabel(
  totalUsableAmount: number,
  usableUnit: "g" | "ml" | "un",
): string | null {
  if (!Number.isFinite(totalUsableAmount) || totalUsableAmount <= 0) return null;
  if (isImpossibleUsableQuantity(totalUsableAmount, usableUnit)) return null;
  const label = `${formatOperationalQuantity(totalUsableAmount, usableUnit)} usable`;
  const result = isMeaninglessUsableStockLabel(label) ? null : label;
  logStockGramMlTrace("formatCanonicalUsableStockLabel", {
    beforeQty: totalUsableAmount,
    afterQty: result ? totalUsableAmount : null,
    unit: usableUnit,
    label: result,
  });
  return result;
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
  const structured = resolveStructuredPurchaseForDisplay(item);
  const display = formatStructuredPurchaseDisplay(structured);
  if (display && !isCollapsedMeaninglessPurchaseLabel(display)) return display;

  const raw = formatInvoiceLineRawPurchaseFallback(item);
  if (raw && !isCollapsedMeaninglessPurchaseLabel(raw)) return raw;

  return display ?? raw;
}

export type InvoiceLineStockPresentation = {
  quantityLabel: string | null;
  detailLabel: string | null;
  pipelineId: StockNormalizationPipelineId;
  usableQuantity: number | null;
  usableUnit: "g" | "ml" | "un" | null;
  renderSource: StockRenderSource;
};

/**
 * Stock-added column for invoice rows — single entry via {@link resolveInvoiceLinePurchaseFormat}.
 * Does not fall back to raw row g/ml or duplicate inference math.
 */
export function resolveInvoiceLineStockPresentation(
  item: InvoiceLinePurchaseInput,
  rowKey?: string,
): InvoiceLineStockPresentation {
  const structured = resolveStructuredPurchaseForDisplay(item);
  const inferred = structured.inferred;
  const totalUsableAmount = structured.normalizedUsableQuantity;
  const usableUnit = structured.usableQuantityUnit;
  const pipelineId = structured.stockNormalizationPipeline;

  const empty: InvoiceLineStockPresentation = {
    quantityLabel: null,
    detailLabel: null,
    pipelineId,
    usableQuantity: totalUsableAmount,
    usableUnit,
    renderSource: "none",
  };

  const purchaseStructure = parsePurchaseStructureFromText(String(item.name ?? "").trim());

  if (rowKey) {
    logStockNormalizationSource(rowKey, pipelineId, {
      name: item.name,
      quantity: item.quantity,
      unit: item.unit,
      kind: structured.kind,
      totalUsableAmount,
      usableUnit,
      reason: structured.reason,
      purchaseStructure: purchaseStructure ? summarizePurchaseStructure(purchaseStructure) : null,
    });
  }

  const logRender = (renderSource: StockRenderSource, quantityLabel: string | null) => {
    if (!rowKey) return;
    logStockRenderSource(rowKey, renderSource, {
      name: item.name,
      quantity: item.quantity,
      unit: item.unit,
      pipelineId,
      totalUsableAmount,
      usableUnit,
      purchaseStructure: purchaseStructure ? summarizePurchaseStructure(purchaseStructure) : null,
      quantityLabel,
    });
  };

  logStockGramMlTrace("resolveInvoiceLineStockPresentation", {
    name: item.name,
    beforeQty: item.quantity == null ? null : Number(item.quantity),
    afterQty: totalUsableAmount,
    unit: usableUnit,
    rowUnit: item.unit,
    pipelineId,
    kind: structured.kind,
    unitSize: purchaseStructure?.unitSize ?? null,
    structureTotal: purchaseStructure?.totalUsableAmount ?? null,
  });

  if (pipelineId === "unified" && totalUsableAmount != null && usableUnit) {
    if (structured.kind === "unit_count") {
      const quantityLabel = formatUsableStockQuantityLabel(
        totalUsableAmount ?? structured.purchaseContainerCount,
        "units",
        structured,
      );
      if (quantityLabel) {
        logRender("unified", quantityLabel);
        if (rowKey) {
          logStockResidualSource(rowKey, "live_engine", {
            name: item.name,
            quantity: item.quantity,
            unit: item.unit,
            pipelineId,
            quantityLabel,
            renderSource: "unified",
          });
        }
        return { ...empty, quantityLabel, renderSource: "unified" };
      }
    } else {
      const quantityLabel = formatCanonicalUsableStockLabel(totalUsableAmount, usableUnit);
      if (quantityLabel) {
        const estimatedYield = Boolean(inferred.conversion_hint);
        logRender(estimatedYield ? "estimated_yield" : "unified", quantityLabel);
        if (rowKey) {
          logStockResidualSource(rowKey, "live_engine", {
            name: item.name,
            quantity: item.quantity,
            unit: item.unit,
            pipelineId,
            quantityLabel,
            renderSource: estimatedYield ? "estimated_yield" : "unified",
          });
        }
        return {
          ...empty,
          quantityLabel,
          detailLabel: estimatedYield ? "estimated kitchen yield" : null,
          renderSource: estimatedYield ? "estimated_yield" : "unified",
        };
      }
    }
  }

  logRender("none", null);
  if (rowKey) {
    logStockResidualSource(rowKey, "live_engine", {
      name: item.name,
      quantity: item.quantity,
      unit: item.unit,
      pipelineId,
      totalUsableAmount,
      usableUnit,
      renderSource: "none",
    });
  }
  return empty;
}

export type IngredientPurchaseFields = {
  purchase_quantity: number;
  purchase_unit: string;
  base_unit: string;
};

/**
 * When OCR supplies a generic countable unit (e.g. `un`) on a unit-count or multi-pack row,
 * keep that unit instead of replacing it with embedded per-item weight from the name.
 */
export function preserveCountableExtractedUnit(
  extractedUnit: string | null,
  structured: StructuredPurchaseFormat,
  isGenericUnit: (unit: string | null | undefined) => boolean,
): string | null {
  if (!extractedUnit || !isGenericUnit(extractedUnit)) return null;

  const familyOpts = {
    usableQuantityUnit: structured.usableQuantityUnit,
    purchaseFormatKind: structured.kind,
  };
  if (inferUnitFamily(extractedUnit, familyOpts) !== "countable") return null;

  const structuredCountable =
    structured.kind === "unit_count" || structured.kind === "multi_unit_pack";
  const inferredBase = structured.inferred.base_unit;
  const embeddedMeasureConflictsWithRow =
    inferredBase != null && inferUnitFamily(inferredBase, familyOpts) !== "countable";

  if (structuredCountable || embeddedMeasureConflictsWithRow) {
    return extractedUnit;
  }
  return null;
}

/** Maps structured purchase data to ingredient insert fields (matching prior invoice behavior). */
export function structuredPurchaseToIngredientFields(
  structured: StructuredPurchaseFormat,
  extractedUnit: string | null,
  isGenericUnit: (unit: string | null | undefined) => boolean,
): IngredientPurchaseFields {
  const inferred = structured.inferred;
  const conversionHint = inferred.conversion_hint;

  const preservedUnit = preserveCountableExtractedUnit(extractedUnit, structured, isGenericUnit);
  const stockUnit =
    preservedUnit ??
    (inferred.base_unit && isGenericUnit(extractedUnit)
      ? inferred.base_unit
      : (extractedUnit ?? inferred.base_unit ?? conversionHint?.purchase_unit ?? "kg"));

  const familyOpts = {
    usableQuantityUnit: structured.usableQuantityUnit,
    purchaseFormatKind: structured.kind,
  };
  const extractedFamily = extractedUnit
    ? inferUnitFamily(extractedUnit, familyOpts)
    : null;
  const unitFamily = inferUnitFamily(structured.purchaseContainerUnit ?? extractedUnit, familyOpts);
  const countableInvoiceRow =
    extractedFamily === "countable" ||
    unitFamily === "countable" ||
    structured.kind === "unit_count" ||
    structured.kind === "multi_unit_pack";

  const shouldUseUsableAsCanonical =
    !countableInvoiceRow &&
    structured.normalizedUsableQuantity != null &&
    structured.usableQuantityUnit != null &&
    structured.usableQuantityUnit !== "un" &&
    (unitFamily === "weight" || unitFamily === "volume");

  if (shouldUseUsableAsCanonical) {
    const fields = {
      purchase_quantity: structured.normalizedUsableQuantity,
      purchase_unit: structured.usableQuantityUnit,
      base_unit: structured.usableQuantityUnit,
    };
    logStockGramMlTrace("structuredPurchaseToIngredientFields", {
      beforeQty: structured.normalizedUsableQuantity,
      afterQty: fields.purchase_quantity,
      unit: fields.purchase_unit,
      kind: structured.kind,
    });
    return fields;
  }

  if (countableInvoiceRow) {
    const purchaseQty =
      structured.purchaseContainerCount ??
      (inferred.purchase_unit === "un" || inferred.purchase_unit === "unit"
        ? inferred.purchase_quantity
        : null) ??
      1;

    const identityName = structured.ingredientIdentityHint || "";
    if (
      purchaseQty === 1 &&
      !detectObviousCountableUsage(identityName) &&
      structured.normalizedUsableQuantity != null &&
      structured.usableQuantityUnit === "ml"
    ) {
      return {
        purchase_quantity: structured.normalizedUsableQuantity,
        purchase_unit: "ml",
        base_unit: "ml",
      };
    }

    return {
      purchase_quantity: purchaseQty,
      purchase_unit: "un",
      base_unit: "un",
    };
  }

  if (inferred.base_unit) {
    return {
      purchase_quantity: inferred.purchase_quantity,
      purchase_unit: inferred.purchase_unit ?? stockUnit,
      base_unit: inferred.base_unit ?? stockUnit,
    };
  }

  return {
    purchase_quantity: 1,
    purchase_unit: stockUnit,
    base_unit: stockUnit,
  };
}
