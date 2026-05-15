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

export type PackDetection = InferenceMeta & {
  /** Number of consumer units in the outer pack (>= 1). */
  count: number;
};

export type ParsedUnitSignals = {
  weight: WeightDetection | null;
  volume: VolumeDetection | null;
  pack: PackDetection | null;
};

export type UnitInferenceResult = InferenceMeta & {
  purchase_quantity: number;
  purchase_unit: string | null;
  base_unit: string | null;
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
  const re = /(\d+(?:[.,]\d+)?)\s*(KG|G)\b/g;
  let m: RegExpExecArray | null;
  let best: WeightDetection | null = null;
  while ((m = re.exec(s)) !== null) {
    const qty = parseQuantityToken(m[1] ?? "");
    if (qty == null) continue;
    const unit = m[2] ?? "";
    const grams = unit === "KG" ? qty * 1000 : qty;
    const rounded = Math.max(1, Math.round(grams));
    const hit = m[0] ?? "";
    const det: WeightDetection = {
      grams: rounded,
      confidence: /^(\d+(?:[.,]\d+)?)\s*(KG|G)$/.test(hit.trim()) ? 0.98 : 0.9,
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
    { re: /(\d+(?:[.,]\d+)?)\s*L\b/g, toMl: (n) => n * 1000, label: "L" },
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
 * Detects multipack / unit-count hints: `PACK24`, `PACK 24`, `X24`, `24UN`.
 */
export function detectPackQuantity(name: string): PackDetection | null {
  const s = normalizeForUnitMatch(name);
  const candidates: { re: RegExp; group: number; confidence: number; label: string }[] = [
    { re: /\bPACK\s*(\d+)\b/g, group: 1, confidence: 0.96, label: "PACK" },
    { re: /\bX\s*(\d+)\b/g, group: 1, confidence: 0.9, label: "X" },
    { re: /\b(\d+)\s*UN\b/g, group: 1, confidence: 0.88, label: "N UN" },
    { re: /\b(\d+)UN\b/g, group: 1, confidence: 0.88, label: "NUN" },
  ];
  let best: PackDetection | null = null;
  for (const { re, group, confidence, label } of candidates) {
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
        confidence,
        reason: `${label} "${hit.trim()}" → ${count} un`,
      };
      if (!best || det.count > best.count || (det.count === best.count && det.confidence > best.confidence)) {
        best = det;
      }
    }
  }
  return best;
}

/**
 * Combines {@link detectWeight}, {@link detectVolume}, and {@link detectPackQuantity}.
 *
 * **Priority**: outer **pack** (when present) overrides nominal per-item weight/volume in the name,
 * then **weight**, then **volume**. Fallback keeps `purchase_unit` / `base_unit` null so
 * {@link ingredientDisplayBaseUnit} can fall back to catalog `unit`.
 */
export function inferBaseUnit(parsed: ParsedUnitSignals): UnitInferenceResult {
  const fallback: UnitInferenceResult = {
    purchase_quantity: 1,
    purchase_unit: null,
    base_unit: null,
    confidence: 0,
    reason: "no unit tokens matched",
  };

  if (parsed.pack) {
    const purchase_quantity = Math.max(1, Math.round(parsed.pack.count));
    return {
      purchase_quantity,
      purchase_unit: "un",
      base_unit: "un",
      confidence: parsed.pack.confidence,
      reason: parsed.pack.reason,
    };
  }
  if (parsed.weight) {
    return {
      purchase_quantity: parsed.weight.grams,
      purchase_unit: "g",
      base_unit: "g",
      confidence: parsed.weight.confidence,
      reason: parsed.weight.reason,
    };
  }
  if (parsed.volume) {
    return {
      purchase_quantity: parsed.volume.milliliters,
      purchase_unit: "ml",
      base_unit: "ml",
      confidence: parsed.volume.confidence,
      reason: parsed.volume.reason,
    };
  }
  return fallback;
}

/** Runs all detectors on `name` and returns canonical purchase fields + meta. */
export function inferPurchaseUnitsFromLineItemName(name: string): UnitInferenceResult {
  const parsed: ParsedUnitSignals = {
    weight: detectWeight(name),
    volume: detectVolume(name),
    pack: detectPackQuantity(name),
  };
  return inferBaseUnit(parsed);
}
