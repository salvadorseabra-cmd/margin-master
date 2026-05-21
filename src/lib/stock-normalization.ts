/**
 * Purchase → usable stock normalization pipeline.
 *
 * PURCHASED (name + invoice row) → purchase structure → base units → usable quantity
 *
 * See docs/stock-normalization.md for fallback paths that previously produced tiny
 * g/ml values (invoice row qty mistaken for content size).
 */

export type UnitFamily = "mass" | "volume" | "count";

export type PackMeasureUnit = "g" | "ml" | "kg" | "L" | "un";

export type PackPhraseKind =
  | "container_with_size"
  | "multi_unit_pack"
  | "weight_or_volume"
  | "unit_count";

/** Minimal pack phrase shape shared with invoice purchase parsing. */
export type NormalizedPackPhrase = {
  kind: PackPhraseKind;
  containerCount: number;
  packageQuantity: number | null;
  packageUnit: PackMeasureUnit | null;
  confidence: number;
};

/** Parsed nested purchase layout (deterministic; no weak row g/ml math). */
export type PurchaseStructure = {
  purchaseQuantity: number;
  purchaseFormat: string;
  innerUnitCount?: number;
  innerUnitType?: string;
  unitSize: number;
  unitMeasurement: PackMeasureUnit;
  totalUsableAmount: number;
  usableUnit: "g" | "ml" | "un";
  matchedText: string;
  tier:
    | "triple_nested"
    | "caixa_units_size"
    | "container_size"
    | "count_size"
    | "bare_measure";
};

export type StockInferenceHints = {
  normalized_stock_quantity: number | null;
  stock_unit: string | null;
  purchase_quantity: number;
  base_unit: string | null;
  conversion_hint?: {
    estimated_quantity: number;
    stock_unit: "g";
  } | null;
};

export type StockNormalizeInput = {
  name: string;
  namePhrase: NormalizedPackPhrase | null;
  rowPhrase: NormalizedPackPhrase | null;
  rowQuantity: number | null;
  rowUnit: string | null;
  inferred?: StockInferenceHints | null;
};

/** Grep-friendly pipeline id logged per invoice row (`[stock_normalization_source]`). */
export type StockNormalizationPipelineId = "unified" | "suppressed" | "none";

export const STOCK_NORMALIZATION_SOURCE_LOG = "[stock_normalization_source]";

/** Final usableQuantity provenance (`[stock_usable_source]`). */
export const STOCK_USABLE_SOURCE_LOG = "[stock_usable_source]";

/** Stock-added column render path (`[stock_render_source]`). */
export type StockRenderSource = "unified" | "estimated_yield" | "none" | "legacy_fallback";

export const STOCK_RENDER_SOURCE_LOG = "[stock_render_source]";

/** Residual usable provenance for invoice stock column (`[stock_residual_source]`). */
export type StockResidualSource = "live_engine" | "persisted_item" | "extracted_snapshot" | "ingredient_row";

export const STOCK_RESIDUAL_SOURCE_LOG = "[stock_residual_source]";

/** Per-step g/ml qty before/after (`[stock_gram_ml_trace]`). */
export const STOCK_GRAM_ML_TRACE_LOG = "[stock_gram_ml_trace]";

/** Single outer container × size path (`[single_container_trace]`). */
export const SINGLE_CONTAINER_TRACE_LOG = "[single_container_trace]";

export type StockNormalizeResult = {
  explicitPhrase: NormalizedPackPhrase | null;
  purchaseStructure: PurchaseStructure | null;
  /** Outer purchase count (packs, bottles, etc.). */
  purchaseContainerCount: number;
  packQuantity: number | null;
  packUnit: PackMeasureUnit | null;
  usableQuantity: number | null;
  usableUnit: "g" | "ml" | "un" | null;
  unitFamily: UnitFamily | null;
  source: "purchase_structure" | "explicit_phrase" | "inference" | "none";
  pipelineId: StockNormalizationPipelineId;
  reason: string;
};

export class PurchaseStructureParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PurchaseStructureParseError";
  }
}

const MULTIPLIER_SEP = String.raw`(?:x|×|\*|X)`;

const CONTAINER_TOKEN =
  String.raw`bottle|bottles|garrafa|garrafas|pack|packs|caixa|caixas|cx|case|cases|emb|embalagem|embalagens|lata|latas|can|cans|saco|sacos|bag|bags|box|boxes`;

const MEASURE_UNIT_TOKEN = String.raw`kg|kgs|g|gr|grs|mg|ml|cl|l|lt|lts|ltr|ltrs`;

const GENERIC_UNIT_TOKEN = String.raw`un|uni|und|unds|unid|unids|unit|units|unidade|unidades|pc|pcs`;

const INNER_UNIT_TOKEN = String.raw`un|uni|und|unds|unid|unids|unit|units|can|cans|lata|latas|garrafa|garrafas|bottle|bottles`;

const GENERIC_PURCHASE_UNITS = new Set([
  "un",
  "uni",
  "und",
  "unds",
  "unid",
  "unids",
  "unit",
  "units",
  "unidade",
  "unidades",
  "pc",
  "pcs",
  "cx",
  "caixa",
  "caixas",
  "pack",
  "packs",
  "case",
  "cases",
  "emb",
  "embalagem",
  "embalagens",
]);

const STOCK_LOG =
  typeof import.meta !== "undefined" &&
  import.meta.env?.DEV &&
  import.meta.env?.MODE !== "test";

const TRIPLE_NESTED_RE = new RegExp(
  String.raw`\b(?<purchase>\d+(?:[.,]\d+)?)\s*(?<format>${CONTAINER_TOKEN})\s*${MULTIPLIER_SEP}\s*(?<inner>\d+(?:[.,]\d+)?)\s*${MULTIPLIER_SEP}\s*(?<size>\d+(?:[.,]\d+)?)\s*(?<unit>${MEASURE_UNIT_TOKEN})\b`,
  "iu",
);

const CAIXA_UNITS_SIZE_RE = new RegExp(
  String.raw`\b(?:caixa|caixas|cx)\s*(?<inner>\d+(?:[.,]\d+)?)\s*(?<innerUnit>${INNER_UNIT_TOKEN})\s*${MULTIPLIER_SEP}\s*(?<size>\d+(?:[.,]\d+)?)\s*(?<unit>${MEASURE_UNIT_TOKEN})\b`,
  "iu",
);

const CONTAINER_WITH_SIZE_RE = new RegExp(
  String.raw`\b(?<purchase>\d+(?:[.,]\d+)?)\s*(?<format>${CONTAINER_TOKEN})\s*${MULTIPLIER_SEP}\s*(?<size>\d+(?:[.,]\d+)?)\s*(?<unit>${MEASURE_UNIT_TOKEN})\b`,
  "iu",
);

const COUNT_SIZE_RE = new RegExp(
  String.raw`\b(?<purchase>\d+(?:[.,]\d+)?)\s*${MULTIPLIER_SEP}\s*(?<size>\d+(?:[.,]\d+)?)\s*(?<unit>${MEASURE_UNIT_TOKEN})\b`,
  "iu",
);

const BARE_MEASURE_RE = new RegExp(
  String.raw`^\s*(?<size>\d+(?:[.,]\d+)?)\s*(?<unit>${MEASURE_UNIT_TOKEN})\s*$`,
  "iu",
);

const FORMAT_LABEL: Record<string, string> = {
  pack: "pack",
  packs: "pack",
  case: "case",
  cases: "case",
  caixa: "case",
  caixas: "case",
  cx: "case",
  emb: "pack",
  embalagem: "pack",
  embalagens: "pack",
  bottle: "bottle",
  bottles: "bottle",
  garrafa: "bottle",
  garrafas: "bottle",
  lata: "can",
  latas: "can",
  can: "can",
  cans: "can",
  box: "box",
  boxes: "box",
  saco: "bag",
  sacos: "bag",
  bag: "bag",
  bags: "bag",
};

function findAllRegexMatches(text: string, re: RegExp): RegExpMatchArray[] {
  const regex = new RegExp(re.source, re.flags.includes("g") ? re.flags : `${re.flags}g`);
  const matches: RegExpMatchArray[] = [];
  let match: RegExpExecArray | null = null;
  while ((match = regex.exec(text)) !== null) {
    matches.push(match);
  }
  return matches;
}

/** Prefer the largest content measure when OCR appends a weak trailing pack (e.g. `1 pack x 3 g` after `1 pack x 250 g`). */
function findBestRegexMatch(
  text: string,
  re: RegExp,
  score: (match: RegExpMatchArray) => number,
): RegExpMatchArray | null {
  let best: RegExpMatchArray | null = null;
  let bestScore = -1;
  for (const match of findAllRegexMatches(text, re)) {
    const value = score(match);
    if (value > bestScore) {
      bestScore = value;
      best = match;
    }
  }
  return best;
}

function scoreTripleNestedMatch(match: RegExpMatchArray): number {
  const purchaseQuantity = parseQuantityToken(match.groups?.purchase ?? "");
  const innerUnitCount = parseQuantityToken(match.groups?.inner ?? "");
  const { unitSize, unitMeasurement } = parseSizeAndUnit(match.groups?.size, match.groups?.unit);
  if (purchaseQuantity == null || innerUnitCount == null || unitSize == null || !unitMeasurement) {
    return -1;
  }
  return (
    purchaseQuantity *
    innerUnitCount *
    measureToBase(unitSize, unitMeasurement).amount
  );
}

function scoreContainerSizeMatch(match: RegExpMatchArray): number {
  const purchaseQuantity = parseQuantityToken(match.groups?.purchase ?? "") ?? 1;
  const { unitSize, unitMeasurement } = parseSizeAndUnit(match.groups?.size, match.groups?.unit);
  if (unitSize == null || !unitMeasurement) return -1;
  return purchaseQuantity * measureToBase(unitSize, unitMeasurement).amount;
}

function scoreCaixaUnitsSizeMatch(match: RegExpMatchArray): number {
  const innerUnitCount = parseQuantityToken(match.groups?.inner ?? "");
  const { unitSize, unitMeasurement } = parseSizeAndUnit(match.groups?.size, match.groups?.unit);
  if (innerUnitCount == null || unitSize == null || !unitMeasurement) return -1;
  return innerUnitCount * measureToBase(unitSize, unitMeasurement).amount;
}

function scoreCountSizeMatch(match: RegExpMatchArray): number {
  const purchaseQuantity = parseQuantityToken(match.groups?.purchase ?? "");
  const { unitSize, unitMeasurement } = parseSizeAndUnit(match.groups?.size, match.groups?.unit);
  if (purchaseQuantity == null || unitSize == null || !unitMeasurement) return -1;
  return purchaseQuantity * measureToBase(unitSize, unitMeasurement).amount;
}

/** Numeric measure tokens in text (debug: detect row qty merged into the name). */
export function extractNumericMeasureTokens(
  text: string,
): Array<{ raw: string; value: number; unit: string; index: number }> {
  const re = new RegExp(
    String.raw`\b(?<value>\d+(?:[.,]\d+)?)\s*(?<unit>${MEASURE_UNIT_TOKEN})\b`,
    "giu",
  );
  const tokens: Array<{ raw: string; value: number; unit: string; index: number }> = [];
  let match: RegExpExecArray | null = null;
  while ((match = re.exec(text)) !== null) {
    const value = parseQuantityToken(match.groups?.value ?? "");
    const unit = match.groups?.unit ?? "";
    if (value == null || !unit) continue;
    tokens.push({
      raw: match[0] ?? "",
      value,
      unit,
      index: match.index ?? 0,
    });
  }
  return tokens;
}

export function purchaseStructureMultiplierChain(structure: PurchaseStructure): {
  purchaseQuantity: number;
  innerUnitCount: number;
  unitSize: number;
  unitMeasurement: PackMeasureUnit;
  perItemBase: number;
  usableUnit: "g" | "ml" | "un";
  totalUsableAmount: number;
  expression: string;
} {
  const inner = structure.innerUnitCount ?? 1;
  const perItem = measureToBase(structure.unitSize, structure.unitMeasurement);
  return {
    purchaseQuantity: structure.purchaseQuantity,
    innerUnitCount: inner,
    unitSize: structure.unitSize,
    unitMeasurement: structure.unitMeasurement,
    perItemBase: perItem.amount,
    usableUnit: perItem.base,
    totalUsableAmount: structure.totalUsableAmount,
    expression: `${structure.purchaseQuantity} × ${inner} × ${structure.unitSize} ${structure.unitMeasurement}`,
  };
}

export function parseQuantityToken(raw: string): number | null {
  const t = raw.trim();
  if (!t) return null;
  const normalized = /^\d+,\d+$/.test(t) ? t.replace(",", ".") : t.replace(/(\d),(\d)/g, "$1.$2");
  const n = Number.parseFloat(normalized);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

export function normalizeMeasureUnit(raw: string): PackMeasureUnit | null {
  const unit = raw.trim().toLowerCase();
  if (unit === "kg" || unit === "kgs") return "kg";
  if (unit === "g" || unit === "gr" || unit === "grs" || unit === "mg") return "g";
  if (unit === "ml") return "ml";
  if (unit === "cl") return "ml";
  if (unit === "l" || unit === "lt" || unit === "lts" || unit === "ltr" || unit === "ltrs") return "L";
  if (
    [
      "un",
      "uni",
      "und",
      "unds",
      "unid",
      "unids",
      "unit",
      "units",
      "unidade",
      "unidades",
      "pc",
      "pcs",
    ].includes(unit)
  ) {
    return "un";
  }
  return null;
}

function normalizePurchaseFormat(raw: string): string {
  const key = raw.trim().toLowerCase();
  return FORMAT_LABEL[key] ?? key;
}

function normalizeInnerUnitType(raw: string | undefined): string | undefined {
  if (!raw?.trim()) return undefined;
  const key = raw.trim().toLowerCase();
  if (["can", "cans", "lata", "latas"].includes(key)) return "can";
  if (["bottle", "bottles", "garrafa", "garrafas"].includes(key)) return "bottle";
  return "unit";
}

function parseSizeAndUnit(
  sizeRaw: string | undefined,
  unitRaw: string | undefined,
): { unitSize: number | null; unitMeasurement: PackMeasureUnit | null } {
  let unitSize = parseQuantityToken(sizeRaw ?? "");
  let unitMeasurement = normalizeMeasureUnit(unitRaw ?? "");
  if (unitRaw?.toLowerCase() === "cl" && unitSize != null) {
    unitSize = unitSize * 10;
    unitMeasurement = "ml";
  }
  if (unitSize == null || !unitMeasurement || unitMeasurement === "un") {
    return { unitSize: null, unitMeasurement: null };
  }
  return { unitSize, unitMeasurement };
}

function buildStructure(params: {
  purchaseQuantity: number;
  purchaseFormat: string;
  innerUnitCount?: number;
  innerUnitType?: string;
  unitSize: number;
  unitMeasurement: PackMeasureUnit;
  matchedText: string;
  tier: PurchaseStructure["tier"];
}): PurchaseStructure {
  const perItem = measureToBase(params.unitSize, params.unitMeasurement);
  const inner = params.innerUnitCount ?? 1;
  const rawTotal = params.purchaseQuantity * inner * perItem.amount;
  const totalUsableAmount = Math.max(1, Math.round(rawTotal));
  logStockGramMlTrace("buildStructure.measureToBase", {
    beforeQty: params.unitSize,
    afterQty: perItem.amount,
    unit: perItem.base,
    unitMeasurement: params.unitMeasurement,
    purchaseQuantity: params.purchaseQuantity,
    innerUnitCount: inner,
    rawTotal,
    totalUsableAmount,
    tier: params.tier,
  });
  return {
    purchaseQuantity: params.purchaseQuantity,
    purchaseFormat: params.purchaseFormat,
    innerUnitCount: params.innerUnitCount,
    innerUnitType: params.innerUnitType,
    unitSize: params.unitSize,
    unitMeasurement: params.unitMeasurement,
    totalUsableAmount,
    usableUnit: perItem.base,
    matchedText: params.matchedText,
    tier: params.tier,
  };
}

/** Best `N container x SIZE` match (largest content measure wins over weak OCR duplicates). */
export function findBestContainerWithSizeMatch(text: string): RegExpMatchArray | null {
  return findBestRegexMatch(text, CONTAINER_WITH_SIZE_RE, scoreContainerSizeMatch);
}

/**
 * Deterministic purchase-structure parser (regex tiers, most specific first).
 */
export function parsePurchaseStructureFromText(text: string): PurchaseStructure | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  const triple = findBestRegexMatch(trimmed, TRIPLE_NESTED_RE, scoreTripleNestedMatch);
  if (triple?.groups) {
    const purchaseQuantity = parseQuantityToken(triple.groups.purchase ?? "");
    const { unitSize, unitMeasurement } = parseSizeAndUnit(triple.groups.size, triple.groups.unit);
    const innerUnitCount = parseQuantityToken(triple.groups.inner ?? "");
    if (purchaseQuantity == null || unitSize == null || !unitMeasurement || innerUnitCount == null) {
      logPurchaseStructureParse(trimmed, null, "triple_nested");
      return null;
    }
    const structure = buildStructure({
      purchaseQuantity,
      purchaseFormat: normalizePurchaseFormat(triple.groups.format ?? "unit"),
      innerUnitCount,
      innerUnitType: "unit",
      unitSize,
      unitMeasurement,
      matchedText: triple[0] ?? trimmed,
      tier: "triple_nested",
    });
    logPurchaseStructureParse(trimmed, structure, "triple_nested");
    return structure;
  }

  const caixa = findBestRegexMatch(trimmed, CAIXA_UNITS_SIZE_RE, scoreCaixaUnitsSizeMatch);
  if (caixa?.groups) {
    const innerUnitCount = parseQuantityToken(caixa.groups.inner ?? "");
    const { unitSize, unitMeasurement } = parseSizeAndUnit(caixa.groups.size, caixa.groups.unit);
    if (innerUnitCount == null || unitSize == null || !unitMeasurement) {
      logPurchaseStructureParse(trimmed, null, "caixa_units_size");
      return null;
    }
    const structure = buildStructure({
      purchaseQuantity: 1,
      purchaseFormat: "case",
      innerUnitCount,
      innerUnitType: normalizeInnerUnitType(caixa.groups.innerUnit),
      unitSize,
      unitMeasurement,
      matchedText: caixa[0] ?? trimmed,
      tier: "caixa_units_size",
    });
    logPurchaseStructureParse(trimmed, structure, "caixa_units_size");
    return structure;
  }

  const container = findBestContainerWithSizeMatch(trimmed);
  if (container?.groups) {
    const purchaseQuantity = parseQuantityToken(container.groups.purchase ?? "");
    const { unitSize, unitMeasurement } = parseSizeAndUnit(container.groups.size, container.groups.unit);
    if (purchaseQuantity == null || unitSize == null || !unitMeasurement) {
      logPurchaseStructureParse(trimmed, null, "container_size");
      return null;
    }
    const structure = buildStructure({
      purchaseQuantity,
      purchaseFormat: normalizePurchaseFormat(container.groups.format ?? "unit"),
      unitSize,
      unitMeasurement,
      matchedText: container[0] ?? trimmed,
      tier: "container_size",
    });
    logPurchaseStructureParse(trimmed, structure, "container_size");
    logSingleContainerTrace("parse", {
      text: trimmed,
      containerCount: purchaseQuantity,
      unitSize,
      unitMeasurement,
      selectedMatch: container[0] ?? null,
      structureTotal: structure.totalUsableAmount,
    });
    return structure;
  }

  const countSize = findBestRegexMatch(trimmed, COUNT_SIZE_RE, scoreCountSizeMatch);
  if (countSize?.groups) {
    const before = trimmed.slice(0, countSize.index ?? 0);
    if (new RegExp(String.raw`${CONTAINER_TOKEN}\s*${MULTIPLIER_SEP}\s*$`, "iu").test(before)) {
      logPurchaseStructureParse(trimmed, null, "count_size_skipped");
      return null;
    }
    const purchaseQuantity = parseQuantityToken(countSize.groups.purchase ?? "");
    const { unitSize, unitMeasurement } = parseSizeAndUnit(countSize.groups.size, countSize.groups.unit);
    if (purchaseQuantity == null || unitSize == null || !unitMeasurement) {
      logPurchaseStructureParse(trimmed, null, "count_size");
      return null;
    }
    const structure = buildStructure({
      purchaseQuantity,
      purchaseFormat: "unit",
      unitSize,
      unitMeasurement,
      matchedText: countSize[0] ?? trimmed,
      tier: "count_size",
    });
    logPurchaseStructureParse(trimmed, structure, "count_size");
    return structure;
  }

  const bare = trimmed.match(BARE_MEASURE_RE);
  if (bare?.groups) {
    const { unitSize, unitMeasurement } = parseSizeAndUnit(bare.groups.size, bare.groups.unit);
    if (unitSize == null || !unitMeasurement) {
      logPurchaseStructureParse(trimmed, null, "bare_measure");
      return null;
    }
    const structure = buildStructure({
      purchaseQuantity: 1,
      purchaseFormat: "unit",
      unitSize,
      unitMeasurement,
      matchedText: bare[0] ?? trimmed,
      tier: "bare_measure",
    });
    logPurchaseStructureParse(trimmed, structure, "bare_measure");
    return structure;
  }

  logPurchaseStructureParse(trimmed, null, "none");
  logStockGramMlTrace("parsePurchaseStructureFromText", {
    beforeQty: null,
    afterQty: null,
    text: trimmed,
    tierAttempted: "none",
  });
  return null;
}

export function purchaseStructureToPackPhrase(structure: PurchaseStructure): NormalizedPackPhrase {
  const hasInner = structure.innerUnitCount != null && structure.innerUnitCount > 1;
  if (hasInner) {
    return {
      kind: "multi_unit_pack",
      containerCount: structure.purchaseQuantity,
      packageQuantity: (structure.innerUnitCount ?? 1) * structure.unitSize,
      packageUnit: structure.unitMeasurement,
      confidence: 0.98,
    };
  }
  if (structure.purchaseFormat !== "unit" || structure.tier === "container_size") {
    return {
      kind: "container_with_size",
      containerCount: structure.purchaseQuantity,
      packageQuantity: structure.unitSize,
      packageUnit: structure.unitMeasurement,
      confidence: 0.97,
    };
  }
  if (structure.tier === "count_size") {
    return {
      kind: "multi_unit_pack",
      containerCount: structure.purchaseQuantity,
      packageQuantity: structure.unitSize,
      packageUnit: structure.unitMeasurement,
      confidence: 0.96,
    };
  }
  return {
    kind: "weight_or_volume",
    containerCount: 1,
    packageQuantity: structure.unitSize,
    packageUnit: structure.unitMeasurement,
    confidence: 0.95,
  };
}

export function summarizePurchaseStructure(structure: PurchaseStructure): Record<string, unknown> {
  return {
    purchaseQuantity: structure.purchaseQuantity,
    purchaseFormat: structure.purchaseFormat,
    innerUnitCount: structure.innerUnitCount ?? null,
    innerUnitType: structure.innerUnitType ?? null,
    unitSize: structure.unitSize,
    unitMeasurement: structure.unitMeasurement,
    totalUsableAmount: structure.totalUsableAmount,
    usableUnit: structure.usableUnit,
    tier: structure.tier,
    matchedText: structure.matchedText,
    multiplierChain: purchaseStructureMultiplierChain(structure),
  };
}

function logPurchaseStructureParse(
  text: string,
  structure: PurchaseStructure | null,
  tierAttempted: string,
): void {
  if (!STOCK_LOG) return;
  console.debug("[purchase_structure_parse]", {
    text,
    tierAttempted,
    numericTokens: extractNumericMeasureTokens(text),
    parsed: structure ? summarizePurchaseStructure(structure) : null,
    multiplierChain: structure ? purchaseStructureMultiplierChain(structure) : null,
    totalUsableAmount: structure?.totalUsableAmount ?? null,
  });
  logStockGramMlTrace("parsePurchaseStructureFromText", {
    text,
    tierAttempted,
    beforeQty: null,
    afterQty: structure?.unitSize ?? null,
    unit: structure?.unitMeasurement ?? null,
    totalUsableAmount: structure?.totalUsableAmount ?? null,
    usableUnit: structure?.usableUnit ?? null,
    matchedText: structure?.matchedText ?? null,
  });
}

export function measureToBase(
  quantity: number,
  unit: PackMeasureUnit,
): { amount: number; base: "g" | "ml" | "un"; family: UnitFamily } {
  if (unit === "kg") return { amount: quantity * 1000, base: "g", family: "mass" };
  if (unit === "g") return { amount: quantity, base: "g", family: "mass" };
  if (unit === "L") return { amount: quantity * 1000, base: "ml", family: "volume" };
  if (unit === "ml") return { amount: quantity, base: "ml", family: "volume" };
  return { amount: quantity, base: "un", family: "count" };
}

export function isGenericPurchaseUnit(unit: string | null | undefined): boolean {
  const normalized = unit?.trim().toLowerCase();
  return !normalized || GENERIC_PURCHASE_UNITS.has(normalized);
}

/**
 * Invoice OCR often emits row qty + g/ml (e.g. `4 ml`) where qty is the number of packs
 * and the real per-pack size lives in the product name (`1 bottle x 450 ml`).
 */
export function isWeakInvoiceRowContentMeasure(
  rowPhrase: NormalizedPackPhrase | null,
  rowQuantity: number | null,
  namePhrase: NormalizedPackPhrase | null,
): boolean {
  if (!rowPhrase || !namePhrase || rowQuantity == null || rowQuantity <= 0) return false;
  if (rowPhrase.kind !== "weight_or_volume") return false;

  const rowAmount = rowPhrase.packageQuantity;
  const rowUnit = rowPhrase.packageUnit;
  if (rowAmount == null || !rowUnit || rowUnit === "un") return false;
  if (Math.abs(rowAmount - rowQuantity) >= 0.01) return false;

  const rowBase = measureToBase(rowAmount, rowUnit);

  if (namePhrase.kind === "container_with_size" || namePhrase.kind === "multi_unit_pack") {
    if (namePhrase.confidence < 0.9) return false;
    const perPack = measureToBase(namePhrase.packageQuantity ?? 0, namePhrase.packageUnit ?? "un");
    if (perPack.family === "count") return false;
    if (rowBase.family !== perPack.family) return false;
    return rowBase.amount < perPack.amount * 0.25;
  }

  // Product title embeds pack size (`CHEDDAR 1KG`, `BATATA PALHA 2KG`) while OCR row is `N g`/`N ml`.
  if (namePhrase.kind === "weight_or_volume") {
    if (namePhrase.confidence < 0.88) return false;
    if (namePhrase.packageQuantity == null || !namePhrase.packageUnit) return false;
    const nameBase = measureToBase(namePhrase.packageQuantity, namePhrase.packageUnit);
    if (nameBase.family === "count" || rowBase.family !== nameBase.family) return false;
    return rowBase.amount < nameBase.amount * 0.25;
  }

  return false;
}

function isWeakRowAgainstStructure(
  structure: PurchaseStructure,
  rowQuantity: number | null,
  rowUnit: string | null,
): boolean {
  if (rowQuantity == null || rowQuantity <= 0 || !rowUnit?.trim()) return false;
  const rowMeasure = normalizeMeasureUnit(rowUnit);
  if (!rowMeasure || rowMeasure === "un") return false;
  const rowBase = measureToBase(rowQuantity, rowMeasure);
  const perItem = measureToBase(structure.unitSize, structure.unitMeasurement);
  if (rowBase.family !== perItem.family) return false;
  return rowBase.amount < perItem.amount * 0.25;
}

/** OCR replaces inner unit count with g/ml (e.g. `40 un` → row `40 g`). */
function isRowQtyConflatedWithInnerCount(
  structure: PurchaseStructure,
  rowQuantity: number | null,
  rowUnit: string | null,
): boolean {
  if (structure.innerUnitCount == null || rowQuantity == null || rowQuantity <= 0) {
    return false;
  }
  if (Math.abs(rowQuantity - structure.innerUnitCount) >= 0.01) return false;
  const rowMeasure = normalizeMeasureUnit(rowUnit ?? "");
  return rowMeasure != null && rowMeasure !== "un";
}

/**
 * Resolves effective outer purchase count from structure + invoice row.
 * Nested structures and name-embedded counts use row qty when it matches a weak/generic row.
 */
export function resolveStructurePurchaseQuantity(
  structure: PurchaseStructure,
  rowQuantity: number | null,
  rowUnit: string | null,
): number {
  const fromName = Math.max(1, structure.purchaseQuantity);

  if (rowQuantity == null || !Number.isFinite(rowQuantity) || rowQuantity <= 0) {
    return fromName;
  }

  const hasInner = structure.innerUnitCount != null && structure.innerUnitCount > 1;

  if (hasInner || structure.tier === "triple_nested" || structure.tier === "caixa_units_size") {
    if (isRowQtyConflatedWithInnerCount(structure, rowQuantity, rowUnit)) {
      return fromName;
    }
    if (isGenericPurchaseUnit(rowUnit) || isWeakRowAgainstStructure(structure, rowQuantity, rowUnit)) {
      return Math.max(1, Math.round(rowQuantity));
    }
    return fromName;
  }

  if (structure.tier === "container_size" && fromName > 1) {
    if (isWeakRowAgainstStructure(structure, rowQuantity, rowUnit)) {
      return Math.max(fromName, Math.round(rowQuantity));
    }
    return fromName;
  }

  if (isGenericPurchaseUnit(rowUnit)) {
    return Math.max(1, Math.round(rowQuantity));
  }

  if (isWeakRowAgainstStructure(structure, rowQuantity, rowUnit)) {
    return fromName;
  }

  return fromName;
}

export type UsableQuantitySource =
  | "structure_total"
  | "structure_scaled_outer"
  | "structure_recomputed"
  | "phrase_weak_row"
  | "phrase_generic_row"
  | "phrase_direct"
  | "inference"
  | "none";

function scaleStructureTotal(
  structure: PurchaseStructure,
  purchaseContainerCount: number,
): number {
  const outerFromName = Math.max(1, structure.purchaseQuantity);
  if (purchaseContainerCount === outerFromName) {
    return structure.totalUsableAmount;
  }
  const scale = purchaseContainerCount / outerFromName;
  return Math.max(1, Math.round(structure.totalUsableAmount * scale));
}

export function computeUsableFromPurchaseStructure(
  structure: PurchaseStructure,
  rowQuantity: number | null,
  rowUnit: string | null,
): Pick<
  StockNormalizeResult,
  "usableQuantity" | "usableUnit" | "unitFamily" | "purchaseContainerCount"
> & {
  usableSource: UsableQuantitySource;
  fallbackReason: string | null;
  weak_scalar_activated: boolean;
} {
  const purchaseContainerCount = resolveStructurePurchaseQuantity(structure, rowQuantity, rowUnit);
  const inner = structure.innerUnitCount ?? 1;
  const perItem = measureToBase(structure.unitSize, structure.unitMeasurement);

  const hasInner = structure.innerUnitCount != null && structure.innerUnitCount > 1;
  const weakRow = isWeakRowAgainstStructure(structure, rowQuantity, rowUnit);
  const rowConflatedInner = isRowQtyConflatedWithInnerCount(structure, rowQuantity, rowUnit);
  const weak_scalar_activated = weakRow || rowConflatedInner;

  let total: number;
  let usableSource: UsableQuantitySource;
  let fallbackReason: string | null = null;

  if (hasInner || structure.tier === "triple_nested" || structure.tier === "caixa_units_size") {
    if (rowConflatedInner || purchaseContainerCount === structure.purchaseQuantity) {
      total = structure.totalUsableAmount;
      usableSource = "structure_total";
      if (rowConflatedInner) {
        fallbackReason = "row qty conflated with inner count; ignored row g/ml";
      }
    } else {
      total = scaleStructureTotal(structure, purchaseContainerCount);
      usableSource = "structure_scaled_outer";
      fallbackReason = `outer count ${purchaseContainerCount} (name ${structure.purchaseQuantity})`;
    }
  } else if (weakRow) {
    total = structure.totalUsableAmount;
    usableSource = "structure_total";
    fallbackReason = "weak invoice row g/ml; using name structure total";
  } else if (isGenericPurchaseUnit(rowUnit) && rowQuantity != null && rowQuantity > 0) {
    total = Math.max(1, Math.round(rowQuantity)) * perItem.amount;
    usableSource = "structure_recomputed";
    fallbackReason = `generic row unit × per-item (${rowQuantity} × ${structure.unitSize} ${structure.unitMeasurement})`;
  } else if (purchaseContainerCount === structure.purchaseQuantity) {
    total = structure.totalUsableAmount;
    usableSource = "structure_total";
  } else {
    total = scaleStructureTotal(structure, purchaseContainerCount);
    usableSource = "structure_scaled_outer";
    fallbackReason = `outer count ${purchaseContainerCount} (name ${structure.purchaseQuantity})`;
  }

  const roundedUsable = Math.max(1, Math.round(total));
  logStockGramMlTrace("computeUsableFromPurchaseStructure", {
    beforeQty: structure.totalUsableAmount,
    afterQty: roundedUsable,
    unit: perItem.base,
    rowQuantity,
    rowUnit,
    unitSize: structure.unitSize,
    purchaseContainerCount,
    usableSource,
    weak_scalar_activated: weak_scalar_activated,
    weakRow,
    rowConflatedInner,
    fallbackReason,
    rawTotal: total,
  });

  if (structure.tier === "container_size" && structure.purchaseQuantity === 1 && !hasInner) {
    logSingleContainerTrace("computeUsable", {
      containerCount: structure.purchaseQuantity,
      unitSize: structure.unitSize,
      unitMeasurement: structure.unitMeasurement,
      structureTotal: structure.totalUsableAmount,
      finalUsable: roundedUsable,
      rowQuantity,
      rowUnit,
      usableSource,
      weak_scalar_activated,
    });
  }

  return {
    purchaseContainerCount,
    usableQuantity: roundedUsable,
    usableUnit: perItem.base,
    unitFamily: perItem.family,
    usableSource,
    fallbackReason,
    weak_scalar_activated,
  };
}

export function pickExplicitPackPhrase(input: StockNormalizeInput): NormalizedPackPhrase | null {
  const structure = parsePurchaseStructureFromText(input.name);
  if (structure) {
    return purchaseStructureToPackPhrase(structure);
  }

  const { namePhrase, rowPhrase, rowQuantity } = input;

  if (namePhrase && rowPhrase) {
    if (isWeakInvoiceRowContentMeasure(rowPhrase, rowQuantity, namePhrase)) {
      logStockNormalize("pick_phrase", {
        chosen: "name",
        reason: "row g/ml is purchase count, not pack content",
        namePhrase,
        rowPhrase,
      });
      return namePhrase;
    }
    return namePhrase.confidence >= rowPhrase.confidence ? namePhrase : rowPhrase;
  }

  return namePhrase ?? rowPhrase;
}

function resolvePurchaseContainerCount(
  phrase: NormalizedPackPhrase,
  rowQuantity: number | null,
  rowUnit: string | null,
): number {
  const fromPhrase = Math.max(1, phrase.containerCount);

  if (rowQuantity == null || !Number.isFinite(rowQuantity) || rowQuantity <= 0) {
    return fromPhrase;
  }

  if (phrase.kind !== "container_with_size" && phrase.kind !== "multi_unit_pack") {
    return fromPhrase;
  }

  if (isGenericPurchaseUnit(rowUnit)) {
    return Math.max(1, Math.round(rowQuantity));
  }

  const rowMeasure = normalizeRowMeasureUnit(rowUnit);
  if (
    rowMeasure &&
    rowMeasure !== "un" &&
    phrase.packageQuantity != null &&
    phrase.packageUnit
  ) {
    const perPack = measureToBase(phrase.packageQuantity, phrase.packageUnit);
    const rowBase = measureToBase(rowQuantity, rowMeasure);
    if (rowBase.family === perPack.family && rowQuantity < perPack.amount * 0.25) {
      return fromPhrase;
    }
  }

  return fromPhrase;
}

function normalizeRowMeasureUnit(unit: string | null): PackMeasureUnit | null {
  return normalizeMeasureUnit(unit ?? "");
}

export function deriveUsableFromPackPhrase(
  phrase: NormalizedPackPhrase,
  rowQuantity: number | null,
  rowUnit: string | null,
): Pick<StockNormalizeResult, "usableQuantity" | "usableUnit" | "unitFamily" | "purchaseContainerCount"> {
  const purchaseContainerCount = resolvePurchaseContainerCount(phrase, rowQuantity, rowUnit);

  if (phrase.kind === "unit_count") {
    return {
      purchaseContainerCount,
      usableQuantity: Math.max(1, Math.round(purchaseContainerCount)),
      usableUnit: "un",
      unitFamily: "count",
    };
  }

  if (phrase.packageQuantity == null || !phrase.packageUnit) {
    return {
      purchaseContainerCount,
      usableQuantity: null,
      usableUnit: null,
      unitFamily: null,
    };
  }

  if (phrase.kind === "container_with_size" || phrase.kind === "multi_unit_pack") {
    const perItem = measureToBase(phrase.packageQuantity, phrase.packageUnit);
    const weakRow =
      rowQuantity != null &&
      rowQuantity > 0 &&
      !isGenericPurchaseUnit(rowUnit) &&
      normalizeRowMeasureUnit(rowUnit) != null &&
      rowQuantity < perItem.amount * 0.25;

    const nameEmbeddedOuter = phrase.containerCount > 1;
    let total: number;
    if (phrase.packageUnit === "un") {
      total = purchaseContainerCount * phrase.packageQuantity;
    } else if (weakRow && phrase.containerCount === 1) {
      total = perItem.amount;
    } else if (nameEmbeddedOuter) {
      total = purchaseContainerCount * perItem.amount;
    } else if (isGenericPurchaseUnit(rowUnit) && rowQuantity != null) {
      total = purchaseContainerCount * perItem.amount;
    } else {
      total = purchaseContainerCount * perItem.amount;
    }

    return {
      purchaseContainerCount,
      usableQuantity: Math.max(1, Math.round(total)),
      usableUnit: perItem.base,
      unitFamily: perItem.family,
    };
  }

  const direct = measureToBase(phrase.packageQuantity, phrase.packageUnit);
  return {
    purchaseContainerCount,
    usableQuantity: Math.max(1, Math.round(direct.amount)),
    usableUnit: direct.base,
    unitFamily: direct.family,
  };
}

function deriveUsableFromInference(
  inferred: StockInferenceHints,
  rowQuantity: number | null,
): Pick<StockNormalizeResult, "usableQuantity" | "usableUnit" | "unitFamily"> {
  const purchaseQuantity =
    Number.isFinite(rowQuantity) && rowQuantity != null && rowQuantity > 0 ? rowQuantity : 1;

  if (inferred.normalized_stock_quantity != null && inferred.stock_unit) {
    const stockUnit = inferred.stock_unit === "L" ? "ml" : inferred.stock_unit;
    const baseUnit = stockUnit === "kg" ? "g" : (stockUnit as "g" | "ml" | "un");
    const family: UnitFamily =
      baseUnit === "g" ? "mass" : baseUnit === "ml" ? "volume" : "count";
    return {
      usableQuantity: Math.max(1, Math.round(purchaseQuantity * inferred.normalized_stock_quantity)),
      usableUnit: baseUnit,
      unitFamily: family,
    };
  }

  if (inferred.conversion_hint) {
    return {
      usableQuantity: Math.max(1, Math.round(purchaseQuantity * inferred.conversion_hint.estimated_quantity)),
      usableUnit: inferred.conversion_hint.stock_unit,
      unitFamily: "mass",
    };
  }

  if (inferred.base_unit === "g" || inferred.base_unit === "ml" || inferred.base_unit === "un") {
    const family: UnitFamily =
      inferred.base_unit === "g" ? "mass" : inferred.base_unit === "ml" ? "volume" : "count";
    return {
      usableQuantity: inferred.purchase_quantity,
      usableUnit: inferred.base_unit,
      unitFamily: family,
    };
  }

  return { usableQuantity: null, usableUnit: null, unitFamily: null };
}

/**
 * Deterministic purchase → usable stock resolution.
 */
export function normalizePurchasedToUsableStock(input: StockNormalizeInput): StockNormalizeResult {
  const rowQuantity = input.rowQuantity;

  logStockNormalize("input", {
    name: input.name,
    rowQuantity: input.rowQuantity,
    rowUnit: input.rowUnit,
    namePhrase: input.namePhrase,
    rowPhrase: input.rowPhrase,
  });

  const structure = parsePurchaseStructureFromText(input.name);
  if (structure) {
    const derived = computeUsableFromPurchaseStructure(structure, rowQuantity, input.rowUnit);
    const explicitPhrase = purchaseStructureToPackPhrase(structure);
    const result: StockNormalizeResult = {
      explicitPhrase,
      purchaseStructure: structure,
      purchaseContainerCount: derived.purchaseContainerCount,
      packQuantity: structure.unitSize,
      packUnit: structure.unitMeasurement,
      usableQuantity: derived.usableQuantity,
      usableUnit: derived.usableUnit,
      unitFamily: derived.unitFamily,
      source: "purchase_structure",
      pipelineId: "unified",
      reason: `purchase structure (${structure.tier})`,
    };
    logStockUsableSource({
      name: input.name,
      structure: summarizePurchaseStructure(structure),
      numericTokens: extractNumericMeasureTokens(input.name),
      multiplierChain: purchaseStructureMultiplierChain(structure),
      computedTotal: derived.usableQuantity,
      structureTotal: structure.totalUsableAmount,
      usableSource: derived.usableSource,
      fallbackReason: derived.fallbackReason,
      weak_scalar_activated: derived.weak_scalar_activated,
      rowQuantity: input.rowQuantity,
      rowUnit: input.rowUnit,
    });
    logStockGramMlTrace("normalizePurchasedToUsableStock", {
      name: input.name,
      beforeQty: input.rowQuantity,
      afterQty: derived.usableQuantity,
      unit: derived.usableUnit,
      rowUnit: input.rowUnit,
      source: "purchase_structure",
      unitSize: structure.unitSize,
      structureTotal: structure.totalUsableAmount,
    });
    logStockNormalize("result", { ...result, structure: summarizePurchaseStructure(structure) });
    return result;
  }

  const explicitPhrase = pickExplicitPackPhrase(input);

  if (explicitPhrase) {
    const derived = deriveUsableFromPackPhrase(explicitPhrase, rowQuantity, input.rowUnit);
    const phraseUsableSource = phraseUsableSourceFromDerived(explicitPhrase, rowQuantity, input.rowUnit);
    const result: StockNormalizeResult = {
      explicitPhrase,
      purchaseStructure: null,
      purchaseContainerCount: derived.purchaseContainerCount,
      packQuantity: explicitPhrase.packageQuantity,
      packUnit: explicitPhrase.packageUnit,
      usableQuantity: derived.usableQuantity,
      usableUnit: derived.usableUnit,
      unitFamily: derived.unitFamily,
      source: "explicit_phrase",
      pipelineId: "unified",
      reason: `pack phrase (${explicitPhrase.kind})`,
    };
    logStockUsableSource({
      name: input.name,
      structure: null,
      computedTotal: derived.usableQuantity,
      structureTotal: null,
      usableSource: phraseUsableSource.source,
      fallbackReason: phraseUsableSource.fallbackReason,
      rowQuantity: input.rowQuantity,
      rowUnit: input.rowUnit,
      phraseKind: explicitPhrase.kind,
    });
    logStockNormalize("result", result);
    return result;
  }

  if (input.inferred) {
    const derived = deriveUsableFromInference(input.inferred, rowQuantity);
    const result: StockNormalizeResult = {
      explicitPhrase: null,
      purchaseStructure: null,
      purchaseContainerCount:
        Number.isFinite(rowQuantity) && rowQuantity != null && rowQuantity > 0 ? rowQuantity : 1,
      packQuantity: null,
      packUnit: null,
      usableQuantity: derived.usableQuantity,
      usableUnit: derived.usableUnit,
      unitFamily: derived.unitFamily,
      source: "inference",
      pipelineId: "unified",
      reason: "name inference",
    };
    logStockUsableSource({
      name: input.name,
      structure: null,
      computedTotal: derived.usableQuantity,
      structureTotal: null,
      usableSource: "inference",
      fallbackReason: "no purchase structure or pack phrase; scalar inference",
      rowQuantity: input.rowQuantity,
      rowUnit: input.rowUnit,
    });
    logStockNormalize("result", result);
    return result;
  }

  const empty: StockNormalizeResult = {
    explicitPhrase: null,
    purchaseStructure: null,
    purchaseContainerCount:
      Number.isFinite(rowQuantity) && rowQuantity != null && rowQuantity > 0 ? rowQuantity : 1,
    packQuantity: null,
    packUnit: null,
    usableQuantity: null,
    usableUnit: null,
    unitFamily: null,
    source: "none",
    pipelineId: "none",
    reason: "no pack phrase or inference",
  };
  logStockUsableSource({
    name: input.name,
    structure: null,
    computedTotal: null,
    structureTotal: null,
    usableSource: "none",
    fallbackReason: "no pack phrase or inference",
    rowQuantity: input.rowQuantity,
    rowUnit: input.rowUnit,
  });
  logStockNormalize("result", empty);
  return empty;
}

function phraseUsableSourceFromDerived(
  phrase: NormalizedPackPhrase,
  rowQuantity: number | null,
  rowUnit: string | null,
): { source: UsableQuantitySource; fallbackReason: string | null } {
  if (phrase.kind === "weight_or_volume" || phrase.kind === "unit_count") {
    return { source: "phrase_direct", fallbackReason: null };
  }
  if (phrase.packageQuantity == null || !phrase.packageUnit) {
    return { source: "none", fallbackReason: "phrase missing pack size" };
  }
  const perItem = measureToBase(phrase.packageQuantity, phrase.packageUnit);
  const weakRow =
    rowQuantity != null &&
    rowQuantity > 0 &&
    !isGenericPurchaseUnit(rowUnit) &&
    normalizeRowMeasureUnit(rowUnit) != null &&
    rowQuantity < perItem.amount * 0.25;
  if (weakRow && phrase.containerCount === 1) {
    return {
      source: "phrase_weak_row",
      fallbackReason: "weak invoice row g/ml; pack phrase per-item only",
    };
  }
  if (isGenericPurchaseUnit(rowUnit) && rowQuantity != null) {
    return {
      source: "phrase_generic_row",
      fallbackReason: `generic row unit × pack (${rowQuantity})`,
    };
  }
  return { source: "phrase_direct", fallbackReason: null };
}

/** Dev trace: parsed structure tree, computed usable, and assignment source. */
export function logStockUsableSource(payload: {
  name: string;
  structure: Record<string, unknown> | null;
  numericTokens?: Array<{ raw: string; value: number; unit: string; index: number }>;
  multiplierChain?: ReturnType<typeof purchaseStructureMultiplierChain> | null;
  structureTotal: number | null;
  computedTotal: number | null;
  usableSource: UsableQuantitySource;
  fallbackReason: string | null;
  weak_scalar_activated?: boolean;
  rowQuantity: number | null;
  rowUnit: string | null;
  phraseKind?: PackPhraseKind;
}): void {
  if (import.meta.env?.MODE === "test") return;
  console.debug(STOCK_USABLE_SOURCE_LOG, payload);
}

export function logStockNormalize(step: string, payload: unknown): void {
  if (!STOCK_LOG) return;
  console.debug(`[stock_normalize] ${step}`, payload);
}

/** Per-row pipeline trace (unified vs suppressed/none after sanitization). */
export function logStockNormalizationSource(
  rowKey: string,
  pipelineId: StockNormalizationPipelineId,
  details: Record<string, unknown>,
): void {
  if (import.meta.env?.MODE === "test") return;
  console.debug(STOCK_NORMALIZATION_SOURCE_LOG, { rowKey, pipelineId, ...details });
}

/** Dev trace for invoice Stock added column (canonical usable vs legacy row fallback). */
export function logStockRenderSource(
  rowKey: string,
  renderSource: StockRenderSource,
  details: Record<string, unknown>,
): void {
  if (import.meta.env?.MODE === "test") return;
  console.debug(STOCK_RENDER_SOURCE_LOG, { rowKey, renderSource, ...details });
}

/** Dev trace: which path supplied invoice stock-added usable (always live_engine in UI). */
export function logStockResidualSource(
  rowKey: string,
  source: StockResidualSource,
  details: Record<string, unknown>,
): void {
  if (import.meta.env?.MODE === "test") return;
  console.debug(STOCK_RESIDUAL_SOURCE_LOG, { rowKey, source, ...details });
}

function isGramMlTraceRelevant(
  unit: string | null | undefined,
  structure?: PurchaseStructure | null,
): boolean {
  const u = unit?.trim().toLowerCase();
  if (u === "g" || u === "ml" || u === "kg" || u === "l") return true;
  if (structure?.usableUnit === "g" || structure?.usableUnit === "ml") return true;
  if (structure?.unitMeasurement === "g" || structure?.unitMeasurement === "ml") return true;
  return false;
}

const GRAM_ML_PIPELINE_STEPS = new Set([
  "parsePurchaseStructureFromText",
  "buildStructure.measureToBase",
  "computeUsableFromPurchaseStructure",
  "normalizePurchasedToUsableStock",
  "resolveInvoiceLinePurchaseFormat.stock",
  "resolveInvoiceLinePurchaseFormat.structured",
  "sanitizeStructuredUsable.suppressed",
  "formatCanonicalUsableStockLabel",
  "structuredPurchaseToIngredientFields",
  "resolveInvoiceLineStockPresentation",
]);

/** Dev-only trace for `1 bottle x SIZE` / `1 pack x SIZE` (outer count = 1). */
export function logSingleContainerTrace(
  step: string,
  payload: {
    text?: string;
    containerCount?: number;
    unitSize?: number;
    unitMeasurement?: string | null;
    selectedMatch?: string | null;
    structureTotal?: number | null;
    finalUsable?: number | null;
    rowQuantity?: number | null;
    rowUnit?: string | null;
    usableSource?: UsableQuantitySource;
    weak_scalar_activated?: boolean;
    [key: string]: unknown;
  },
): void {
  if (!STOCK_LOG) return;
  console.debug(SINGLE_CONTAINER_TRACE_LOG, { step, ...payload });
}

/** Dev-only step trace for g/ml collapse debugging (row qty vs pack size). */
export function logStockGramMlTrace(
  step: string,
  payload: {
    beforeQty?: number | null;
    afterQty?: number | null;
    unit?: string | null;
    [key: string]: unknown;
  },
): void {
  if (!STOCK_LOG) return;
  const alwaysLog = GRAM_ML_PIPELINE_STEPS.has(step);
  const text = typeof payload.text === "string" ? payload.text : typeof payload.name === "string" ? payload.name : "";
  const unit = payload.unit ?? payload.rowUnit ?? payload.usableUnit ?? payload.unitMeasurement;
  if (
    !alwaysLog &&
    !isGramMlTraceRelevant(typeof unit === "string" ? unit : null, null) &&
    !(/\d\s*(?:g|ml|kg|l)\b/i.test(text))
  ) {
    return;
  }
  console.debug(STOCK_GRAM_ML_TRACE_LOG, { step, ...payload });
}
