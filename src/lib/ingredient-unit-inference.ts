/**
 * Heuristic parsing of supplier invoice line item names into canonical purchase units.
 *
 * ## Edge cases (non-exhaustive)
 * - **Multipack vs nominal size**: When both a per-item volume/weight (e.g. `33CL`) and an outer
 *   pack count (`PACK24`) appear, we treat the **pack count** as `purchase_quantity` because invoice
 *   totals are usually for the outer pack, not a single can. This differs from a naive
 *   weight-first ordering on the raw string.
 * - **Ambiguous numbers**: Bare `1` or `24` without a unit token is ignored (too many false positives).
 * - **European decimals**: `1,5` and `1.5` are parsed as decimal separators when attached to a unit.
 * - **Multiple matches**: First token match wins within each detector; `inferBaseUnit` picks one branch.
 * - **OCR noise**: Diacritics are stripped and matching is case-insensitive; odd spacing may still miss.
 */

export type InferenceMeta = {
  confidence: number;
  reason: string;
};

export type WeightDetection = InferenceMeta & {
  /** Canonical mass in grams (integer-ish; rounded). */
  grams: number;
};

export type VolumeDetection = InferenceMeta & {
  /** Canonical volume in millilitres (rounded). */
  milliliters: number;
};

export type PackageType = "pack" | "caixa" | "garrafa" | "lata" | "saco";

export type PackageDetection = InferenceMeta & {
  type: PackageType;
  label: string;
};

export type PackDetection = InferenceMeta & {
  /** Number of consumer units in the outer pack (>= 1). */
  count: number;
  packageType: PackageType | null;
  packageLabel: string | null;
  source: "package_count" | "multiplier" | "explicit_unit_count";
};

export type ConversionHint = InferenceMeta & {
  purchase_unit: "un";
  estimated_quantity: number;
  stock_unit: "g";
  recipe_usage_unit: "g";
  label: string;
};

export type UnitDrivenDetection = InferenceMeta & {
  label: string;
};

export type ParsedUnitSignals = {
  weight: WeightDetection | null;
  volume: VolumeDetection | null;
  pack: PackDetection | null;
  packageType: PackageDetection | null;
  conversionHint: ConversionHint | null;
  unitDriven: UnitDrivenDetection | null;
};

export type UnitInferenceResult = InferenceMeta & {
  purchase_quantity: number;
  purchase_unit: string | null;
  base_unit: string | null;
  package_type: PackageType | null;
  package_count: number | null;
  purchase_unit_count: number;
  pack_size: number | null;
  pack_size_unit: "g" | "ml" | null;
  size_is_metadata_only: boolean;
  normalized_stock_quantity: number | null;
  stock_unit: string | null;
  recipe_usage_unit: string | null;
  conversion_hint: ConversionHint | null;
};

const DIACRITIC_RE = /\p{M}/gu;

/** Uppercase ASCII + collapse spaces; strip combining marks for robust token matching. */
export function normalizeForUnitMatch(name: string): string {
  const decomposed = name.normalize("NFD").replace(DIACRITIC_RE, "");
  return decomposed.toUpperCase().replace(/\s+/g, " ").trim();
}

function parseQuantityToken(raw: string): number | null {
  const t = raw.trim();
  if (!t) return null;
  // Prefer comma as decimal when a single comma exists (common in PT invoices).
  const normalized = /^\d+,\d+$/.test(t) ? t.replace(",", ".") : t.replace(/(\d),(\d)/g, "$1.$2");
  const n = Number.parseFloat(normalized);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

/**
 * Detects a mass token (`KG`, `G`) and returns grams.
 * Examples: `1KG`, `500G`, `1,5 kg`, `CHEDDAR 1KG`.
 */
export function detectWeight(name: string): WeightDetection | null {
  const s = normalizeForUnitMatch(name);
  const re = /(\d+(?:[.,]\d+)?)\s*(KG|KGS|G|GR|GRS)\b/g;
  let m: RegExpExecArray | null;
  let best: WeightDetection | null = null;
  while ((m = re.exec(s)) !== null) {
    const qty = parseQuantityToken(m[1] ?? "");
    if (qty == null) continue;
    const unit = m[2] ?? "";
    const grams = unit === "KG" || unit === "KGS" ? qty * 1000 : qty;
    const rounded = Math.max(1, Math.round(grams));
    const hit = m[0] ?? "";
    const det: WeightDetection = {
      grams: rounded,
      confidence: /^(\d+(?:[.,]\d+)?)\s*(KG|KGS|G|GR|GRS)$/.test(hit.trim()) ? 0.98 : 0.9,
      reason: `weight token "${hit.trim()}" → ${rounded}g`,
    };
    if (!best || det.confidence > best.confidence) best = det;
  }
  return best;
}

/**
 * Detects a liquid measure (`ML`, `CL`, `L`) and returns millilitres.
 * Examples: `450ML`, `33CL` → 330 ml, `5L`, `ÓLEO 5L` → 5000 ml.
 */
export function detectVolume(name: string): VolumeDetection | null {
  const s = normalizeForUnitMatch(name);
  // Order: ML and CL before bare L to avoid eating the L from ML.
  const patterns: { re: RegExp; toMl: (n: number) => number; label: string }[] = [
    { re: /(\d+(?:[.,]\d+)?)\s*ML\b/g, toMl: (n) => n, label: "ML" },
    { re: /(\d+(?:[.,]\d+)?)\s*CL\b/g, toMl: (n) => n * 10, label: "CL" },
    { re: /(\d+(?:[.,]\d+)?)\s*(L|LT|LTS|LTR|LTRS)\b/g, toMl: (n) => n * 1000, label: "L" },
  ];
  let best: VolumeDetection | null = null;
  for (const { re, toMl, label } of patterns) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(s)) !== null) {
      const qty = parseQuantityToken(m[1] ?? "");
      if (qty == null) continue;
      const ml = Math.max(1, Math.round(toMl(qty)));
      const hit = m[0] ?? "";
      const det: VolumeDetection = {
        milliliters: ml,
        confidence: label === "L" && ml < 50 ? 0.75 : 0.92,
        reason: `volume token "${hit.trim()}" (${label}) → ${ml}ml`,
      };
      if (
        !best ||
        det.confidence > best.confidence ||
        (det.confidence === best.confidence && det.milliliters > best.milliliters)
      ) {
        best = det;
      }
    }
  }
  return best;
}

/**
 * Detects package words without forcing stock unit decisions.
 * Examples: `CX`, `CAIXA`, `GARRAFA`, `LATA`, `SACO`.
 */
export function detectPackageType(name: string): PackageDetection | null {
  const s = normalizeForUnitMatch(name);
  const candidates: { re: RegExp; type: PackageType; label: string; confidence: number }[] = [
    { re: /\bPACK\b/, type: "pack", label: "PACK", confidence: 0.9 },
    { re: /\b(CX|CAIXA|CAIXAS)\b/, type: "caixa", label: "CAIXA", confidence: 0.88 },
    { re: /\b(GARRAFA|GARRAFAS)\b/, type: "garrafa", label: "GARRAFA", confidence: 0.82 },
    { re: /\b(LATA|LATAS)\b/, type: "lata", label: "LATA", confidence: 0.82 },
    { re: /\b(SACO|SACOS)\b/, type: "saco", label: "SACO", confidence: 0.82 },
  ];

  for (const candidate of candidates) {
    const match = s.match(candidate.re);
    if (!match) continue;
    const hit = match[0] ?? candidate.label;
    return {
      type: candidate.type,
      label: candidate.label,
      confidence: candidate.confidence,
      reason: `package token "${hit.trim()}"`,
    };
  }
  return null;
}

/**
 * Detects multipack / unit-count hints: `PACK24`, `PACK 24`, `CX 6`, `X24`, `24UN`.
 */
export function detectPackQuantity(name: string): PackDetection | null {
  const s = normalizeForUnitMatch(name);
  const candidates: {
    re: RegExp;
    group: number;
    confidence: number;
    label: string;
    packageType: PackageType | null;
    source: PackDetection["source"];
  }[] = [
    {
      re: /\bPACK\s*(\d+)\b/g,
      group: 1,
      confidence: 0.96,
      label: "PACK",
      packageType: "pack",
      source: "package_count",
    },
    {
      re: /\b(CX|CAIXA|CAIXAS)\s*(\d+)\b/g,
      group: 2,
      confidence: 0.92,
      label: "CAIXA",
      packageType: "caixa",
      source: "package_count",
    },
    {
      re: /\b(\d+)\s*(CX|CAIXA|CAIXAS)\b/g,
      group: 1,
      confidence: 0.9,
      label: "N CAIXA",
      packageType: "caixa",
      source: "package_count",
    },
    {
      re: /\bX\s*(\d+)\b/g,
      group: 1,
      confidence: 0.9,
      label: "X",
      packageType: null,
      source: "multiplier",
    },
    {
      re: /\b(\d+)\s*UN\b/g,
      group: 1,
      confidence: 0.88,
      label: "N UN",
      packageType: null,
      source: "explicit_unit_count",
    },
    {
      re: /\b(\d+)UN\b/g,
      group: 1,
      confidence: 0.88,
      label: "NUN",
      packageType: null,
      source: "explicit_unit_count",
    },
  ];
  let best: PackDetection | null = null;
  for (const { re, group, confidence, label, packageType, source } of candidates) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(s)) !== null) {
      const raw = m[group] ?? "";
      const n = Number.parseInt(raw, 10);
      if (!Number.isFinite(n) || n < 1) continue;
      const count = Math.max(1, n);
      const hit = m[0] ?? "";
      const det: PackDetection = {
        count,
        packageType,
        packageLabel: packageType ? label : null,
        source,
        confidence,
        reason: `${label} "${hit.trim()}" → ${count} un`,
      };
      if (
        !best ||
        det.count > best.count ||
        (det.count === best.count && det.confidence > best.confidence)
      ) {
        best = det;
      }
    }
  }
  return best;
}

const UNIT_DRIVEN_PRODUCT_TOKENS = [
  "PAO",
  "BREAD",
  "BRIOCHE",
  "HAMBURGUER",
  "HAMBURGER",
  "BURGER BUN",
  "BUN",
  "BUNS",
  "BAGUETTE",
  "PASTRY",
  "PASTRIES",
  "CROISSANT",
  "PADARIA",
  "TORTILLA",
  "TORTILLAS",
  "WRAP",
  "WRAPS",
  "FATIA",
  "FATIAS",
  "SLICED BREAD",
];

/**
 * Detects rows where a weight/volume token describes each piece, not the stock unit.
 * Examples: `Pão Brioche 80g 120 un`, `burger bun 100g 48 un`.
 */
export function detectUnitDrivenProduct(
  name: string,
  parsed: Pick<ParsedUnitSignals, "weight" | "volume" | "pack">,
): UnitDrivenDetection | null {
  const s = normalizeForUnitMatch(name);
  const token = UNIT_DRIVEN_PRODUCT_TOKENS.find((candidate) => s.includes(candidate));
  const hasExplicitUnitCount = parsed.pack?.source === "explicit_unit_count";
  const hasHighUnitCount = (parsed.pack?.count ?? 0) >= 12;
  const hasPerUnitSize = Boolean(parsed.weight || parsed.volume);

  if (hasExplicitUnitCount && (token || hasPerUnitSize || hasHighUnitCount)) {
    return {
      label: token ? "unit-driven bakery item" : "explicit unit count",
      confidence: token && hasPerUnitSize ? 0.96 : 0.9,
      reason: token
        ? `${token} with explicit unit count → stock by unit`
        : "explicit unit count → stock by unit",
    };
  }

  if (token && hasPerUnitSize && hasHighUnitCount) {
    return {
      label: "unit-driven product",
      confidence: 0.86,
      reason: `${token} with per-unit size → stock by unit`,
    };
  }

  return null;
}

const PRODUCE_CONVERSION_HINTS: {
  tokens: string[];
  estimatedQuantity: number;
  label: string;
  confidence: number;
}[] = [
  {
    tokens: ["ALFACE", "LETTUCE", "RUCULA", "ARUGULA", "AGRIAO", "ESPINAFRE", "COUVE"],
    estimatedQuantity: 500,
    label: "leafy produce",
    confidence: 0.62,
  },
  {
    tokens: ["COENTROS", "SALSA", "MANJERICAO", "HORTELA", "CEBOLINHO"],
    estimatedQuantity: 100,
    label: "fresh herbs",
    confidence: 0.58,
  },
  {
    tokens: ["BROCOLOS", "COUVE-FLOR", "COUVE FLOR", "REPOLHO"],
    estimatedQuantity: 700,
    label: "whole vegetable",
    confidence: 0.56,
  },
];

/**
 * Lightweight operational hints for fresh items normally bought by the piece.
 * These are intentionally not persisted automatically because the schema has no
 * field for "estimated usable yield" distinct from stored pack cost fields.
 */
export function detectConversionHint(name: string): ConversionHint | null {
  const s = normalizeForUnitMatch(name);
  for (const hint of PRODUCE_CONVERSION_HINTS) {
    const token = hint.tokens.find((candidate) => s.includes(candidate));
    if (!token) continue;
    return {
      purchase_unit: "un",
      estimated_quantity: hint.estimatedQuantity,
      stock_unit: "g",
      recipe_usage_unit: "g",
      label: hint.label,
      confidence: hint.confidence,
      reason: `${hint.label} token "${token}" → estimated ${hint.estimatedQuantity}g usable`,
    };
  }
  return null;
}

function withOperationalFields(
  result: Omit<
    UnitInferenceResult,
    | "purchase_unit_count"
    | "pack_size"
    | "pack_size_unit"
    | "size_is_metadata_only"
    | "normalized_stock_quantity"
    | "stock_unit"
    | "recipe_usage_unit"
    | "conversion_hint"
  >,
  parsed: ParsedUnitSignals,
): UnitInferenceResult {
  const unitSize = parsed.weight?.grams ?? parsed.volume?.milliliters ?? null;
  const unitSizeUnit = parsed.weight ? "g" : parsed.volume ? "ml" : null;
  const isUnitDriven = result.base_unit === "un" && parsed.unitDriven != null;
  const stockUnit = isUnitDriven
    ? "un"
    : parsed.weight
      ? "g"
      : parsed.volume
        ? "ml"
        : result.base_unit;
  const purchaseUnitCount = parsed.pack?.count ?? 1;
  const normalizedStockQuantity =
    isUnitDriven && parsed.pack
      ? purchaseUnitCount
      : unitSize != null
        ? Math.max(1, Math.round(unitSize * purchaseUnitCount))
        : null;

  return {
    ...result,
    purchase_unit_count: purchaseUnitCount,
    pack_size: unitSize,
    pack_size_unit: unitSizeUnit,
    size_is_metadata_only: isUnitDriven && unitSize != null,
    normalized_stock_quantity: normalizedStockQuantity,
    stock_unit: normalizedStockQuantity != null ? stockUnit : result.base_unit,
    recipe_usage_unit: result.base_unit,
    conversion_hint: parsed.conversionHint,
  };
}

/**
 * Combines {@link detectWeight}, {@link detectVolume}, and {@link detectPackQuantity}.
 *
 * **Priority**: outer **pack** (when present) overrides nominal per-item weight/volume in the name,
 * then **weight**, then **volume**. Fallback keeps `purchase_unit` / `base_unit` null so
 * {@link ingredientDisplayBaseUnit} can fall back to catalog `unit`.
 */
export function inferBaseUnit(parsed: ParsedUnitSignals): UnitInferenceResult {
  const fallback = withOperationalFields(
    {
      purchase_quantity: 1,
      purchase_unit: null,
      base_unit: null,
      package_type: parsed.packageType?.type ?? null,
      package_count: null,
      confidence: 0,
      reason: "no unit tokens matched",
    },
    parsed,
  );

  if (parsed.pack) {
    const purchase_quantity = Math.max(1, Math.round(parsed.pack.count));
    return withOperationalFields(
      {
        purchase_quantity,
        purchase_unit: "un",
        base_unit: "un",
        package_type: parsed.pack.packageType ?? parsed.packageType?.type ?? null,
        package_count: purchase_quantity,
        confidence: parsed.pack.confidence,
        reason: parsed.pack.reason,
      },
      parsed,
    );
  }
  if (parsed.weight) {
    return withOperationalFields(
      {
        purchase_quantity: parsed.weight.grams,
        purchase_unit: "g",
        base_unit: "g",
        package_type: parsed.packageType?.type ?? null,
        package_count: parsed.pack?.count ?? null,
        confidence: parsed.weight.confidence,
        reason: parsed.weight.reason,
      },
      parsed,
    );
  }
  if (parsed.volume) {
    return withOperationalFields(
      {
        purchase_quantity: parsed.volume.milliliters,
        purchase_unit: "ml",
        base_unit: "ml",
        package_type: parsed.packageType?.type ?? null,
        package_count: parsed.pack?.count ?? null,
        confidence: parsed.volume.confidence,
        reason: parsed.volume.reason,
      },
      parsed,
    );
  }
  return fallback;
}

/** Runs all detectors on `name` and returns canonical purchase fields + meta. */
export function inferPurchaseUnitsFromLineItemName(name: string): UnitInferenceResult {
  const baseParsed = {
    weight: detectWeight(name),
    volume: detectVolume(name),
    pack: detectPackQuantity(name),
    packageType: detectPackageType(name),
    conversionHint: detectConversionHint(name),
  };
  const parsed: ParsedUnitSignals = {
    ...baseParsed,
    unitDriven: detectUnitDrivenProduct(name, baseParsed),
  };
  return inferBaseUnit(parsed);
}
