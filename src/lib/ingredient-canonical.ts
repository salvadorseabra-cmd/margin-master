/**
 * Canonical ingredient keys strip pack sizes, units, and punctuation so
 * supplier-specific OCR strings can be deduped during invoice sync.
 *
 * Examples: "COCA COLA 33CL PACK24" → "coca cola"; "CHEDDAR FATIADO 1KG" → "cheddar fatiado".
 */

import { normalizeIngredientName } from "@/lib/normalizeIngredient";

/** Whole-word / full-string aliases after other normalization (lowercase). */
export const ALIAS_MAP: Record<string, string> = {
  coke: "coca cola",
};

const UNIT_TOKEN_RE =
  /\b(kg|kgs|g|gr|grs|mg|ml|mL|cl|l|lt|lts|ltr|ltrs|un|unid|unids|cx|caixa|pc|pcs|und|unds)\b/gi;

const PACK_PATTERNS: RegExp[] = [
  /\bpack\s*\d+\b/gi,
  /\bx\s*\d+\b/gi,
  /\b\d+\s*un\b/gi,
  /\b\d+un\b/gi,
];

function stripAccentsLower(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function applyAliases(s: string): string {
  let out = s.trim();
  const keys = Object.keys(ALIAS_MAP).sort((a, b) => b.length - a.length);
  for (const key of keys) {
    const val = ALIAS_MAP[key];
    if (!key || val == null) continue;
    const esc = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (out === key) {
      out = val;
      continue;
    }
    out = out.replace(new RegExp(`\\b${esc}\\b`, "g"), val);
  }
  return out.replace(/\s+/g, " ").trim();
}

/**
 * Lowercase, strip punctuation, remove pack/unit/noise tokens and standalone numbers,
 * then apply {@link ALIAS_MAP}.
 */
export function normalizeCanonicalIngredientName(raw: string): string {
  let s = stripAccentsLower(raw);
  s = s.replace(/[^a-z0-9\s]+/g, " ");
  for (const re of PACK_PATTERNS) {
    s = s.replace(re, " ");
  }
  s = s.replace(UNIT_TOKEN_RE, " ");
  s = s.replace(/\b\d+\b/g, " ");
  s = s.replace(/\s+/g, " ").trim();
  s = applyAliases(s);
  return s;
}

/** Sørensen–Dice coefficient on character bigrams (multiset), range [0, 1]. */
export function diceCoefficient(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;
  const bigrams = (str: string) => {
    const m = new Map<string, number>();
    for (let i = 0; i < str.length - 1; i++) {
      const bg = str.slice(i, i + 2);
      m.set(bg, (m.get(bg) ?? 0) + 1);
    }
    return m;
  };
  const A = bigrams(a);
  const B = bigrams(b);
  let intersection = 0;
  for (const [k, va] of A) {
    const vb = B.get(k) ?? 0;
    intersection += Math.min(va, vb);
  }
  let total = 0;
  for (const v of A.values()) total += v;
  for (const v of B.values()) total += v;
  return total === 0 ? 0 : (2 * intersection) / total;
}

const WEAK_MIN_SHORT = 5;

/** True if one canonical string contains the other as a contiguous token-bounded substring. */
export function canonicalWeakSubstringMatch(a: string, b: string): boolean {
  if (a.length < 4 || b.length < 4) return false;
  const short = a.length <= b.length ? a : b;
  const long = a.length <= b.length ? b : a;
  if (short.length < WEAK_MIN_SHORT) return false;
  return ` ${long} `.includes(` ${short} `);
}
