import type { IngredientAliasMap } from "@/lib/ingredient-canonical";
import { normalizeSupplierDisplayName } from "@/lib/supplier-identity";

/** Product prefixes stripped before brand fingerprint extraction (longest match first). */
export const BRAND_PRODUCT_PREFIXES = [
  "filete de anchovas",
  "filete de anchoas",
  "atum oleo",
  "pepinos extra",
  "pepino",
  "arroz agulha",
  "chocolate culinaria",
  "chocolate",
  "acucar branco",
  "nata culinaria",
  "nata",
  "ovo liquido past",
  "mozzarella",
] as const;

export const MIN_BRAND_FINGERPRINT_LENGTH = 4;
export const MAX_BRAND_FINGERPRINT_EDIT_DISTANCE = 2;

const UNIT_WEIGHT_TOKENS_RE = /\b(li|lt|l1|l4|l|kg|g|ml|cl|22|6x1)\b/g;

export function levenshteinDistance(a: string, b: string): number {
  if (a === b) return 0;
  const la = a.length;
  const lb = b.length;
  if (la === 0) return lb;
  if (lb === 0) return la;
  let prev = Array.from({ length: lb + 1 }, (_, i) => i);
  for (let i = 0; i < la; i++) {
    const cur = [i + 1];
    for (let j = 0; j < lb; j++) {
      cur.push(
        Math.min(prev[j + 1] + 1, cur[j] + 1, prev[j] + (a[i] === b[j] ? 0 : 1)),
      );
    }
    prev = cur;
  }
  return prev[lb]!;
}

function normalizeAnchovasSpelling(value: string): string {
  return value.replace(/anchovas/g, "anchoas");
}

export function extractProductPrefix(normalizedKey: string): string | null {
  const core = normalizedKey.toLowerCase().trim();
  for (const prefix of BRAND_PRODUCT_PREFIXES) {
    if (core.startsWith(prefix)) return prefix;
  }
  return null;
}

export function productPrefixesCompatible(
  queryPrefix: string | null,
  storedPrefix: string | null,
): boolean {
  if (queryPrefix === storedPrefix) return true;
  if (!queryPrefix || !storedPrefix) return false;
  return normalizeAnchovasSpelling(queryPrefix) === normalizeAnchovasSpelling(storedPrefix);
}

/** Brand stem fingerprint: product prefix stripped, units/weights removed, spaces collapsed. */
export function extractBrandFingerprint(normalizedKey: string): string {
  let core = normalizedKey.toLowerCase().trim();
  for (const prefix of BRAND_PRODUCT_PREFIXES) {
    if (core.startsWith(prefix)) {
      core = core.slice(prefix.length).trim();
      break;
    }
  }
  core = core
    .replace(/\b\d+\b/g, "")
    .replace(UNIT_WEIGHT_TOKENS_RE, "")
    .trim();
  return core.replace(/\s+/g, "");
}

function normalizeSupplierScope(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null;
  const normalized = normalizeSupplierDisplayName(raw);
  return normalized || null;
}

function resolveAliasPart(key: string): string {
  return key.includes("::") ? key.split("::").pop()! : key;
}

export type FuzzyAliasRecoveryResult = {
  ingredientId: string;
  candidateKey: string;
  matchedKey: string;
  distance: number;
};

/**
 * Supplier-scoped fuzzy alias recovery after exact-key miss.
 * Compares brand fingerprints within alias records for the same supplier only.
 * Returns null when ambiguous across different ingredient_ids at the best distance.
 */
export function fuzzyLookupIngredientIdFromAliasMap(
  aliases: IngredientAliasMap,
  normalizedKey: string,
  supplierName: string,
): FuzzyAliasRecoveryResult | null {
  const supplier = normalizeSupplierScope(supplierName);
  if (!supplier) return null;

  const aliasPart = resolveAliasPart(normalizedKey);
  const queryPrefix = extractProductPrefix(aliasPart);
  const queryFp = extractBrandFingerprint(aliasPart);
  if (queryFp.length < MIN_BRAND_FINGERPRINT_LENGTH) return null;

  const candidatesByIngredient = new Map<
    string,
    Array<{ matchedKey: string; distance: number }>
  >();

  for (const [mapKey, ingredientId] of Object.entries(aliases)) {
    if (!mapKey.includes("::")) continue;
    const [mapSupplier, storedAlias] = mapKey.split("::");
    if (!mapSupplier || !storedAlias) continue;
    if (mapSupplier.toUpperCase() !== supplier.toUpperCase()) continue;

    const storedPrefix = extractProductPrefix(storedAlias);
    if (!productPrefixesCompatible(queryPrefix, storedPrefix)) continue;

    const storedFp = extractBrandFingerprint(storedAlias);
    if (storedFp.length < MIN_BRAND_FINGERPRINT_LENGTH) continue;

    const distance = levenshteinDistance(queryFp, storedFp);
    if (distance > MAX_BRAND_FINGERPRINT_EDIT_DISTANCE) continue;

    const list = candidatesByIngredient.get(ingredientId) ?? [];
    list.push({ matchedKey: mapKey, distance });
    candidatesByIngredient.set(ingredientId, list);
  }

  if (candidatesByIngredient.size === 0) return null;

  const ingredientBests = [...candidatesByIngredient.entries()].map(([ingredientId, cands]) => ({
    ingredientId,
    best: cands.reduce((a, b) => (a.distance <= b.distance ? a : b)),
  }));

  ingredientBests.sort((a, b) => a.best.distance - b.best.distance);
  const bestDistance = ingredientBests[0]!.best.distance;
  const tiedAtBest = ingredientBests.filter((entry) => entry.best.distance === bestDistance);

  if (tiedAtBest.length > 1) return null;

  const winner = tiedAtBest[0]!;
  return {
    ingredientId: winner.ingredientId,
    candidateKey: aliasPart,
    matchedKey: winner.best.matchedKey,
    distance: winner.best.distance,
  };
}
