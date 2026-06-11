/**
 * Continente receipt line parsing — deterministic regex only.
 */

import { splitOcrIntoLines, filterNonItemLines } from "./stages.ts";

const LOG_PREFIX = "[invoice-extract]";
const MAX_REJECT_LOGS_PER_BATCH = 12;

/** Shape returned to callers; `price` mirrors line total for legacy + index `parsedContinenteToRecord`. */
export type ParsedItem = {
  name: string;
  price: number | null;
  quantity?: number | null;
  unit?: string | null;
  unit_price?: number | null;
  total_price?: number | null;
};

/** Strip accents for case-insensitive substring checks. */
function normalizeAccents(s: string): string {
  return s.normalize("NFD").replace(/\p{M}/gu, "");
}

function normalizeForReject(s: string): string {
  return normalizeAccents(s).toLowerCase();
}

/** PT/EU digit string → number (comma decimal, dot thousands), same rules as money helper. */
function parseEuropeanNumberString(raw: string): number | null {
  let s = raw.replace(/\u20AC/g, " ").replace(/€/g, " ").replace(/EUR/gi, " ").replace(/\s+/g, " ").trim();
  if (!s) return null;
  const neg = /^\s*[-–—]/.test(s) || s.startsWith("-");
  s = s.replace(/^[-–—]\s*/, "").replace(/[^\d.,]/g, "");
  if (!s) return null;
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  let normalized: string;
  if (lastComma > lastDot) {
    normalized = s.replace(/\./g, "").replace(",", ".");
  } else if (lastDot > lastComma) {
    normalized = s.replace(/,/g, "");
  } else if (lastComma !== -1) {
    normalized = s.replace(",", ".");
  } else {
    normalized = s;
  }
  const n = Number(normalized);
  if (!Number.isFinite(n)) return null;
  return neg ? -n : n;
}

/** PT/EU money string → number (same rules as main edge helper). */
function parseEuropeanMoneyString(raw: string): number | null {
  return parseEuropeanNumberString(raw);
}

/**
 * Header/footer / metadata (accent-stripped, lowercased).
 * Word boundaries avoid false positives; `(^|\s)r\.` catches abbreviated Rua.
 */
const HARD_REJECT_RE =
  /(\brua\b|(^|\s)r\.|\btelefone\b|\btel\b|\bnif\b|\boperador\b|\bcartao\b|\btroco\b|\btotal\b|\biva\b|\bresumo\b|\bcontinente\b|\bloja\b|\bcodigo\s+postal\b)/iu;

export function shouldHardRejectContinenteLine(line: string): boolean {
  return HARD_REJECT_RE.test(normalizeForReject(line));
}

function countWords(line: string): number {
  return line.trim().split(/\s+/).filter(Boolean).length;
}

/** PT-style quantity signals: grouped decimals, qty+unit, or embedded 1KG. */
function hasQuantityStylePattern(s: string): boolean {
  const t = s.trim();
  if (/\d{1,3}(?:\.\d{3})+(?:,\d+)?/.test(t)) return true;
  if (/\d{1,3}(?:,\d{3})+(?:\.\d+)?/.test(t)) return true;
  if (/\d+[.,]\d+\s+(?:kg|un|cx|ml|l)\b/i.test(t)) return true;
  if (/\b\d+\s+(?:kg|un|cx|ml|l)\b/i.test(t)) return true;
  if (/\b\d+(?:kg|g|un|ml|cx|l)\b/i.test(t)) return true;
  return false;
}

/** Trailing money token (optional € / EUR). */
function hasTrailingMoneyPattern(s: string): boolean {
  const t = s.trim();
  return /(?:\d{1,3}(?:\.\d{3})*(?:,\d{1,4})?|\d{1,3}(?:,\d{3})*(?:\.\d{1,4})?|\d+[.,]\d{1,4}|\d+)\s*(?:€|EUR)?\s*$/i.test(t);
}

/**
 * Supermarket batch path: keyword reject, then word/qty/price gates (before strict regex).
 */
function getContinenteBatchRejectReason(line: string): string | null {
  const t = line.trim();
  if (!t) return "empty_line";
  if (shouldHardRejectContinenteLine(t)) return "keyword_header_footer";
  if (countWords(t) < 2) return "too_few_words";
  if (!hasQuantityStylePattern(t)) return "no_quantity_pattern";
  if (!hasTrailingMoneyPattern(t)) return "no_price_pattern";
  return null;
}

const QTY_GROUP =
  String.raw`\d{1,3}(?:\.\d{3})*(?:,\d+)?|\d{1,3}(?:,\d{3})*(?:\.\d+)?|\d+[.,]\d+|\d+`;
const PRICE_GROUP =
  String.raw`\d{1,3}(?:\.\d{3})*(?:,\d{1,4})?|\d{1,3}(?:,\d{3})*(?:\.\d{1,4})?|\d+[.,]\d{1,4}|\d+`;

/**
 * Strict tail: `<qty> <unit> <price>` at line end; greedy name swallows embedded tokens like `1KG`.
 * Unit set: kg, un, cx, L, ml (case-insensitive; stored as kg|un|cx|L|ml).
 */
const CONTINENTE_STRICT_TAIL_RE = new RegExp(
  String.raw`^(?<name>.+)\s+(?<qty>${QTY_GROUP})\s+(?<unit>ml|kg|un|cx|l)\s+(?<price>${PRICE_GROUP})\s*(?:€|EUR)?\s*$`,
  "iu",
);

function normalizeUnitToken(u: string): string {
  const x = u.toLowerCase();
  return x === "l" ? "L" : x;
}

/** Strict Continente supermarket row (caller applies batch pre-filters or Padaria keyword-only gate). */
function parseContinenteStrictShape(line: string): ParsedItem | null {
  const t = line.trim();
  if (!t) return null;

  const m = t.match(CONTINENTE_STRICT_TAIL_RE);
  if (!m?.groups?.name || !m.groups.qty || !m.groups.unit || !m.groups.price) return null;

  const rawName = m.groups.name.replace(/\s+/g, " ").trim();
  if (!rawName || rawName.length < 2) return null;
  if (!/[a-zA-ZÀ-ÿ]/.test(rawName)) return null;

  const quantity = parseEuropeanNumberString(m.groups.qty);
  if (quantity == null || !Number.isFinite(quantity) || quantity <= 0) return null;

  const unit = normalizeUnitToken(m.groups.unit);

  const total_price = parseEuropeanMoneyString(m.groups.price);
  if (total_price == null || !Number.isFinite(total_price) || total_price < 0) return null;

  const unit_price = quantity > 0 ? total_price / quantity : total_price;

  const name = rawName.slice(0, 200);
  return {
    name,
    price: total_price,
    quantity,
    unit,
    unit_price,
    total_price,
  };
}

/**
 * Legacy single tail: description then trailing money, e.g. "CEBOLA ROXA 1.89".
 * Used by `parseContinenteLine` (Padaria); not used after batch pre-filters pass.
 */
function parseContinenteLegacySimpleLine(line: string): ParsedItem | null {
  const t = line.trim();
  if (!t) return null;

  const re =
    /^(?<name>.+?)\s+(?<amount>\d{1,3}(?:\.\d{3})*(?:,\d{1,4})?|\d{1,3}(?:,\d{3})*(?:\.\d{1,4})?|\d+[.,]\d{1,4}|\d+)\s*(?:€|EUR)?\s*$/iu;
  const m = t.match(re);
  if (!m?.groups?.name || !m.groups.amount) return null;

  const name = m.groups.name.replace(/\s+/g, " ").trim();
  if (!name || name.length < 2) return null;

  const price = parseEuropeanMoneyString(m.groups.amount);
  if (price == null || !Number.isFinite(price) || price < 0) return null;

  return { name: name.slice(0, 200), price };
}

/**
 * Padaria import: keyword hard-reject, strict supermarket row, else legacy `<name> <price>`.
 * Continente batch uses `parseContinente` (full pre-filter + strict only).
 */
export function parseContinenteLine(line: string): ParsedItem | null {
  const t = line.trim();
  if (!t) return null;
  if (shouldHardRejectContinenteLine(t)) return null;
  return parseContinenteStrictShape(t) ?? parseContinenteLegacySimpleLine(t);
}

function logAcceptedSupermarketLine(line: string, fields: ParsedItem) {
  const sample = {
    name: fields.name,
    quantity: fields.quantity,
    unit: fields.unit,
    unit_price: fields.unit_price,
    total_price: fields.total_price,
    price: fields.price,
  };
  console.log(
    `${LOG_PREFIX} accepted_supermarket_line=${JSON.stringify(line.slice(0, 200))} parsed_fields=${JSON.stringify(sample)}`,
  );
}

function logRejectedSupermarketLine(reason: string, line: string, counter: { n: number }) {
  if (counter.n >= MAX_REJECT_LOGS_PER_BATCH) return;
  counter.n++;
  console.log(
    `${LOG_PREFIX} rejected_supermarket_line=${JSON.stringify(line.slice(0, 200))} reject_reason=${JSON.stringify(reason)}`,
  );
}

export function parseContinente(lines: string[]): ParsedItem[] {
  const out: ParsedItem[] = [];
  const rejectCounter = { n: 0 };
  for (const line of lines) {
    const t = line.trim();
    if (!t) continue;

    const pre = getContinenteBatchRejectReason(t);
    if (pre) {
      logRejectedSupermarketLine(pre, t, rejectCounter);
      continue;
    }

    const p = parseContinenteStrictShape(t);
    if (p) {
      logAcceptedSupermarketLine(t, p);
      out.push(p);
    } else {
      logRejectedSupermarketLine("strict_shape_mismatch", t, rejectCounter);
    }
  }
  return out;
}

/** Full path from raw OCR blob (for tests / optional reuse). */
export function parseContinenteFromOcrText(ocr: string): ParsedItem[] {
  const raw = splitOcrIntoLines(ocr);
  const { parsedLines } = filterNonItemLines(raw);
  return parseContinente(parsedLines);
}

/** Stub for future DASS-specific parser. */
export function parseDass(_lines: string[]): ParsedItem[] {
  return [];
}

/** Stub for future Makro-specific parser. */
export function parseMakro(_lines: string[]): ParsedItem[] {
  return [];
}
