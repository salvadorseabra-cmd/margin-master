/**
 * Purchase → usable stock normalization pipeline.
 *
 * PURCHASED (name + invoice row) → pack phrase → base units → usable quantity
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

export type StockNormalizeResult = {
  explicitPhrase: NormalizedPackPhrase | null;
  /** Outer purchase count (packs, bottles, etc.). */
  purchaseContainerCount: number;
  packQuantity: number | null;
  packUnit: PackMeasureUnit | null;
  usableQuantity: number | null;
  usableUnit: "g" | "ml" | "un" | null;
  unitFamily: UnitFamily | null;
  source: "explicit_phrase" | "inference" | "none";
  pipelineId: StockNormalizationPipelineId;
  reason: string;
};

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
]);

const STOCK_LOG =
  typeof import.meta !== "undefined" &&
  import.meta.env?.DEV &&
  import.meta.env?.MODE !== "test";

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
  if (namePhrase.kind !== "container_with_size" && namePhrase.kind !== "multi_unit_pack") {
    return false;
  }
  if (namePhrase.confidence < 0.9) return false;

  const rowAmount = rowPhrase.packageQuantity;
  const rowUnit = rowPhrase.packageUnit;
  if (rowAmount == null || !rowUnit || rowUnit === "un") return false;

  const perPack = measureToBase(namePhrase.packageQuantity ?? 0, namePhrase.packageUnit ?? "un");
  if (perPack.family === "count") return false;

  const rowBase = measureToBase(rowAmount, rowUnit);
  if (rowBase.family !== perPack.family) return false;

  // Row number matches invoice line qty, not per-pack content (4 ml vs 450 ml pack).
  if (Math.abs(rowAmount - rowQuantity) < 0.01 && rowBase.amount < perPack.amount * 0.25) {
    return true;
  }

  return false;
}

export function pickExplicitPackPhrase(input: StockNormalizeInput): NormalizedPackPhrase | null {
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
    // Weak g/ml row (qty=3 g, name says 250 g pack) — ignore row; keep phrase container count.
    if (rowBase.family === perPack.family && rowQuantity < perPack.amount * 0.25) {
      return fromPhrase;
    }
  }

  return fromPhrase;
}

function normalizeRowMeasureUnit(unit: string | null): PackMeasureUnit | null {
  const u = unit?.trim().toLowerCase();
  if (u === "kg" || u === "kgs") return "kg";
  if (u === "g" || u === "gr" || u === "grs") return "g";
  if (u === "l" || u === "lt" || u === "lts") return "L";
  if (u === "ml") return "ml";
  if (u === "un" || u === "unit" || u === "units") return "un";
  return null;
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
    const total =
      phrase.packageUnit === "un"
        ? purchaseContainerCount * phrase.packageQuantity
        : purchaseContainerCount * perItem.amount;
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
  const explicitPhrase = pickExplicitPackPhrase(input);
  const rowQuantity = input.rowQuantity;

  logStockNormalize("input", {
    name: input.name,
    rowQuantity: input.rowQuantity,
    rowUnit: input.rowUnit,
    namePhrase: input.namePhrase,
    rowPhrase: input.rowPhrase,
  });

  if (explicitPhrase) {
    const derived = deriveUsableFromPackPhrase(explicitPhrase, rowQuantity, input.rowUnit);
    const result: StockNormalizeResult = {
      explicitPhrase,
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
    logStockNormalize("result", result);
    return result;
  }

  if (input.inferred) {
    const derived = deriveUsableFromInference(input.inferred, rowQuantity);
    const result: StockNormalizeResult = {
      explicitPhrase: null,
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
    logStockNormalize("result", result);
    return result;
  }

  const empty: StockNormalizeResult = {
    explicitPhrase: null,
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
  logStockNormalize("result", empty);
  return empty;
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
