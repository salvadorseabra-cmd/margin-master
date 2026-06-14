/**
 * P0 cross-format guard for ingredient_price_history chains.
 * Breaks incompatible prior links (unit family, preservation, extreme ratio) without schema changes.
 */

import {
  canonicalizeIngredientIdentity,
  hasCompatibleCanonicalForms,
} from "@/lib/ingredient-identity";
import { resolveInvoiceLinePurchaseFormat } from "@/lib/invoice-purchase-format";
import { extractLineWeightGrams } from "@/lib/ingredient-weight-match";
import { inferUnitFamily, type UnitFamily } from "@/lib/recipe-unit-normalization";

export type PreservationClass = "fresh" | "preserved" | "unknown";

export type ChainGuardReason =
  | "unit_family_mismatch"
  | "countable_weight_mismatch"
  | "preservation_mismatch"
  | "form_mismatch"
  | "extreme_price_ratio"
  | "extreme_price_ratio_with_contract_change"
  | "pack_weight_magnitude"
  | "format_change"
  | "implausible_volume";

export type ChainGuardAction = "chain" | "break_chain" | "block_insert";

export type ChainGuardResult = {
  compatible: boolean;
  reason: ChainGuardReason | null;
  action: ChainGuardAction;
};

export type PurchaseContractSnapshot = {
  name: string;
  ingredientUnit: string | null;
  purchaseQuantity: number | null;
  operationalUnitPrice: number;
  unitFamily: UnitFamily;
  canonicalForm: string | null;
  preservationClass: PreservationClass;
  contractKey: string;
};

/** Minimal history row shape for guard derivation and read-path filtering. */
export type ChainGuardHistoryRow = {
  id?: string;
  ingredient_id?: string;
  ingredient_name?: string | null;
  ingredient_unit?: string | null;
  previous_price?: number | null;
  new_price?: number | null;
  delta_percent?: number | null;
  created_at?: string | null;
};

const RATIO_WITH_MISMATCH = 25;
const RATIO_HARD_CEILING = 14;
const PACK_WEIGHT_RATIO = 10;
const MAX_EUR_PER_LITER = 50;
const MIN_PACK_ML = 50;

const PRESERVED_PHRASES = [
  "em conserva",
  "conserva",
  "pickled",
  "escabeche",
  "em salmoura",
] as const;

const PRESERVED_TOKENS = new Set([
  "conserva",
  "pickled",
  "escabeche",
  "frasco",
  "jar",
  "lata",
  "canned",
  "embalagem",
]);

const FRESH_TOKENS = new Set(["fresco", "fresh"]);

const BEVERAGE_HINT =
  /\b(beer|cerveja|cola|soda|agua|água|water|juice|sumo|refrigerante|tonic|ginger|limonada|lemonade|drink|bebida)\b/i;

function finitePositive(value: number | null | undefined): number | null {
  const n = value == null ? NaN : Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function stripForTokens(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, " ");
}

export function detectPreservationClass(name: string): PreservationClass {
  const normalized = stripForTokens(name);
  if (!normalized) return "unknown";
  const padded = ` ${normalized} `;
  if (PRESERVED_PHRASES.some((phrase) => padded.includes(` ${phrase} `))) return "preserved";
  const tokens = normalized.split(/\s+/).filter(Boolean);
  if (tokens.some((token) => PRESERVED_TOKENS.has(token))) return "preserved";
  if (tokens.some((token) => FRESH_TOKENS.has(token))) return "fresh";
  return "unknown";
}

function pqBucket(purchaseQuantity: number | null | undefined): string {
  const pq = finitePositive(purchaseQuantity);
  if (pq == null) return "na";
  if (pq >= 1000) return "1000+";
  if (pq >= 100) return "100+";
  if (pq >= 10) return "10+";
  return "1+";
}

function resolveUnitFamily(
  name: string,
  ingredientUnit: string | null | undefined,
): UnitFamily {
  const format = resolveInvoiceLinePurchaseFormat({ name });
  const fromUnit = inferUnitFamily(ingredientUnit, {
    usableQuantityUnit: format.usableQuantityUnit,
    purchaseFormatKind: format.kind,
  });
  if (ingredientUnit?.trim()) return fromUnit;
  if (format.usableQuantityUnit === "g" || format.packageMeasurementUnit === "kg") return "weight";
  if (format.usableQuantityUnit === "ml" || format.packageMeasurementUnit === "L") return "volume";
  if (format.usableQuantityUnit === "un") return "countable";
  return fromUnit;
}

function operationalPriceRatio(a: number, b: number): number {
  const min = Math.min(a, b);
  const max = Math.max(a, b);
  if (min <= 0) return Number.POSITIVE_INFINITY;
  return max / min;
}

function isBeverageName(name: string): boolean {
  return BEVERAGE_HINT.test(name);
}

function eurPerLiterFromSnapshot(snapshot: PurchaseContractSnapshot): number | null {
  if (snapshot.unitFamily !== "volume") return null;
  const unit = snapshot.ingredientUnit?.trim().toLowerCase() ?? "";
  if (unit === "l" || unit === "lt") return snapshot.operationalUnitPrice;
  if (unit === "ml" || snapshot.operationalUnitPrice > 0) {
    return snapshot.operationalUnitPrice * 1000;
  }
  return snapshot.operationalUnitPrice * 1000;
}

export function derivePurchaseContractSnapshot(input: {
  name: string;
  operationalUnitPrice: number;
  purchaseQuantity?: number | null;
  ingredientUnit?: string | null;
}): PurchaseContractSnapshot {
  const name = input.name.trim() || "Ingredient";
  const operationalUnitPrice = Number(input.operationalUnitPrice);
  const ingredientUnit = input.ingredientUnit?.trim() || null;
  const purchaseQuantity =
    input.purchaseQuantity == null ? null : Number(input.purchaseQuantity);
  const unitFamily = resolveUnitFamily(name, ingredientUnit);
  const identity = canonicalizeIngredientIdentity(name);
  const preservationClass = detectPreservationClass(name);
  const contractKey = [
    unitFamily,
    ingredientUnit ?? "na",
    identity.form ?? "none",
    preservationClass,
  ].join(":");

  return {
    name,
    ingredientUnit,
    purchaseQuantity:
      purchaseQuantity != null && Number.isFinite(purchaseQuantity) ? purchaseQuantity : null,
    operationalUnitPrice,
    unitFamily,
    canonicalForm: identity.form,
    preservationClass,
    contractKey,
  };
}

export function deriveSnapshotFromHistoryRow(
  row: ChainGuardHistoryRow,
  purchaseQuantity?: number | null,
  nameFallback?: string | null,
): PurchaseContractSnapshot {
  const newPrice = finitePositive(row.new_price) ?? 0;
  return derivePurchaseContractSnapshot({
    name: row.ingredient_name?.trim() || nameFallback?.trim() || "Ingredient",
    operationalUnitPrice: newPrice,
    purchaseQuantity: purchaseQuantity ?? null,
    ingredientUnit: row.ingredient_unit ?? null,
  });
}

export function shouldBlockHistoryInsert(snapshot: PurchaseContractSnapshot): boolean {
  if (snapshot.unitFamily !== "volume" && !isBeverageName(snapshot.name)) return false;
  const eurPerLiter = eurPerLiterFromSnapshot(snapshot);
  if (eurPerLiter != null && eurPerLiter > MAX_EUR_PER_LITER) return true;

  const format = resolveInvoiceLinePurchaseFormat({ name: snapshot.name });
  const packMl =
    format.usableQuantityUnit === "ml" && format.normalizedUsableQuantity != null
      ? format.normalizedUsableQuantity
      : snapshot.purchaseQuantity != null &&
          snapshot.purchaseQuantity > 0 &&
          snapshot.purchaseQuantity < MIN_PACK_ML
        ? snapshot.purchaseQuantity
        : null;
  return packMl != null && packMl > 0 && packMl < MIN_PACK_ML;
}

export function purchaseContractsChainCompatible(
  prior: PurchaseContractSnapshot,
  next: PurchaseContractSnapshot,
): ChainGuardResult {
  if (shouldBlockHistoryInsert(next)) {
    return { compatible: false, reason: "implausible_volume", action: "block_insert" };
  }

  if (prior.unitFamily !== next.unitFamily) {
    return { compatible: false, reason: "unit_family_mismatch", action: "break_chain" };
  }

  if (
    (prior.unitFamily === "countable" && next.unitFamily === "weight") ||
    (prior.unitFamily === "weight" && next.unitFamily === "countable")
  ) {
    return { compatible: false, reason: "countable_weight_mismatch", action: "break_chain" };
  }

  if (
    prior.preservationClass !== "unknown" &&
    next.preservationClass !== "unknown" &&
    prior.preservationClass !== next.preservationClass
  ) {
    return { compatible: false, reason: "preservation_mismatch", action: "break_chain" };
  }

  if (!hasCompatibleCanonicalForms(prior.canonicalForm, next.canonicalForm)) {
    return { compatible: false, reason: "form_mismatch", action: "break_chain" };
  }

  const priorWeight = extractLineWeightGrams(prior.name);
  const nextWeight = extractLineWeightGrams(next.name);
  if (priorWeight && nextWeight) {
    const ratio = operationalPriceRatio(priorWeight.grams, nextWeight.grams);
    if (ratio > PACK_WEIGHT_RATIO) {
      return { compatible: false, reason: "pack_weight_magnitude", action: "break_chain" };
    }
  }

  const priceRatio = operationalPriceRatio(
    prior.operationalUnitPrice,
    next.operationalUnitPrice,
  );
  if (priceRatio > RATIO_HARD_CEILING) {
    return { compatible: false, reason: "extreme_price_ratio", action: "break_chain" };
  }

  if (priceRatio > RATIO_WITH_MISMATCH && prior.contractKey !== next.contractKey) {
    return {
      compatible: false,
      reason: "extreme_price_ratio_with_contract_change",
      action: "break_chain",
    };
  }

  if (prior.contractKey !== next.contractKey) {
    if (priceRatio > 2) {
      return { compatible: false, reason: "format_change", action: "break_chain" };
    }
  }

  return { compatible: true, reason: null, action: "chain" };
}

/** Returns null when the prior operational price must not chain into the candidate. */
export function guardOperationalPreviousPrice(
  prior: PurchaseContractSnapshot | null,
  next: PurchaseContractSnapshot,
): number | null {
  if (!prior) return null;
  const result = purchaseContractsChainCompatible(prior, next);
  if (!result.compatible) return null;
  return prior.operationalUnitPrice;
}

export type PriorChainCandidateRow = ChainGuardHistoryRow & {
  new_price: number | null;
};

/** Walk chronologically newer → older; return first compatible prior operational price. */
export function selectChainCompatiblePriorOperationalPrice(
  priorRowsNewestFirst: readonly PriorChainCandidateRow[],
  next: PurchaseContractSnapshot,
): number | null {
  const nextSnap = next;
  for (const row of priorRowsNewestFirst) {
    const priorPrice = finitePositive(row.new_price);
    if (priorPrice == null) continue;
    const priorSnap = deriveSnapshotFromHistoryRow(row, null, nextSnap.name);
    priorSnap.operationalUnitPrice = priorPrice;
    const result = purchaseContractsChainCompatible(priorSnap, nextSnap);
    if (result.compatible) return priorPrice;
  }
  return null;
}

export function indexPriorHistoryRowById<T extends ChainGuardHistoryRow & { id: string }>(
  rows: readonly T[],
): Map<string, T | null> {
  const byIngredient = new Map<string, T[]>();
  for (const row of rows) {
    const ingredientId = row.ingredient_id?.trim();
    if (!ingredientId || !row.id) continue;
    const list = byIngredient.get(ingredientId) ?? [];
    list.push(row);
    byIngredient.set(ingredientId, list);
  }

  const priorById = new Map<string, T | null>();
  for (const list of byIngredient.values()) {
    const sorted = [...list].sort((a, b) =>
      String(a.created_at ?? "").localeCompare(String(b.created_at ?? "")),
    );
    for (let i = 0; i < sorted.length; i += 1) {
      priorById.set(sorted[i]!.id, i > 0 ? sorted[i - 1]! : null);
    }
  }
  return priorById;
}

export function isTrustedPriceMovementRow(
  row: ChainGuardHistoryRow,
  priorRow: ChainGuardHistoryRow | null | undefined,
): boolean {
  const current = finitePositive(row.new_price);
  const previous = finitePositive(row.previous_price);
  if (current == null) return false;
  if (previous == null || row.delta_percent == null) return false;
  if (!priorRow) return false;

  const linkedPrev = finitePositive(priorRow.new_price);
  if (
    linkedPrev != null &&
    previous != null &&
    Math.abs(linkedPrev - previous) > 1e-6
  ) {
    return false;
  }

  const priorSnap = deriveSnapshotFromHistoryRow(priorRow);
  priorSnap.operationalUnitPrice = finitePositive(priorRow.new_price) ?? previous;
  const nextSnap = deriveSnapshotFromHistoryRow(row);
  nextSnap.operationalUnitPrice = current;
  return purchaseContractsChainCompatible(priorSnap, nextSnap).compatible;
}

export function trustedPriceHistoryDeltaPercent(
  row: ChainGuardHistoryRow,
  priorRow: ChainGuardHistoryRow | null | undefined,
): number | null {
  if (!isTrustedPriceMovementRow(row, priorRow)) return null;
  const explicit = row.delta_percent == null ? null : Number(row.delta_percent);
  if (explicit != null && Number.isFinite(explicit)) return explicit;
  const current = finitePositive(row.new_price);
  const previous = finitePositive(row.previous_price);
  if (current == null || previous == null || previous <= 0) return null;
  return ((current - previous) / previous) * 100;
}

export function filterHistoryRowsByContractAnchor<T extends ChainGuardHistoryRow>(
  rows: readonly T[],
  anchor: ChainGuardHistoryRow | null | undefined,
): T[] {
  if (!anchor) return [...rows];
  const anchorSnap = deriveSnapshotFromHistoryRow(anchor);
  return rows.filter((row) => {
    const rowSnap = deriveSnapshotFromHistoryRow(row);
    return rowSnap.contractKey === anchorSnap.contractKey;
  });
}

export function filterTrustedPriceHistoryRows<T extends ChainGuardHistoryRow & { id?: string }>(
  rows: readonly T[],
): T[] {
  const withIds = rows.filter((row): row is T & { id: string } => Boolean(row.id));
  const priorById = indexPriorHistoryRowById(withIds);
  return rows.filter((row) => {
    if (!row.id) return row.delta_percent == null ? false : true;
    const prior = priorById.get(row.id) ?? null;
    return isTrustedPriceMovementRow(row, prior);
  });
}
