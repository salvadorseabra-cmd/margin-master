/**
 * Strict operational ingredient identity — deterministic keys for create-time dedupe.
 * Reuses Horeca shorthand + invoice normalization; does not change matcher scoring.
 */

import {
  isArchivedIngredientEntry,
  type IngredientCanonicalInput,
} from "@/lib/ingredient-canonical";
import {
  type CanonicalCreateFlowOrigin,
  traceCanonicalDuplicateDetected,
  traceCanonicalNameSource,
} from "@/lib/ingredient-catalog-diagnostics";
import { normalizeOperationalAliasKey } from "@/lib/ingredient-operational-alias-memory";
import { normalizeIngredientName } from "@/lib/normalizeIngredient";

const LOG_PREFIX = "[ingredient-operational-identity]";

/** Collapse spelling variants into one identity token (sorted key output). */
const OPERATIONAL_IDENTITY_TOKEN_CANONICAL: Record<string, string> = {
  ang: "angus",
  pty: "patty",
  patties: "patty",
  patt: "patty",
  hmb: "hamburguer",
  hamburger: "hamburguer",
  burgers: "hamburguer",
  burg: "burger",
};

function traceIdentity(stage: string, details?: Record<string, unknown>): void {
  if (!import.meta.env.DEV) return;
  if (details) console.debug(`${LOG_PREFIX} ${stage}`, details);
  else console.debug(`${LOG_PREFIX} ${stage}`);
}

function canonicalizeIdentityTokens(aliasKey: string): string {
  const tokens = aliasKey.split(/\s+/).filter(Boolean);
  const canonical = tokens.map((token) => OPERATIONAL_IDENTITY_TOKEN_CANONICAL[token] ?? token);
  return [...new Set(canonical)].sort().join(" ");
}

/**
 * Normalized operational identity key for catalog dedupe and create guards.
 *
 * @example
 * normalizeOperationalIdentityKey("ANGUS PTY") === normalizeOperationalIdentityKey("Angus Patty")
 */
export function normalizeOperationalIdentityKey(raw: string | null | undefined): string {
  const aliasKey = normalizeOperationalAliasKey(raw ?? "");
  if (!aliasKey) return "";
  return canonicalizeIdentityTokens(aliasKey);
}

/**
 * Catalog create/rename dedupe key — preserves product identity (e.g. batata palha).
 * Does not apply invoice-matcher palha→frita synonym expansion.
 */
export function normalizeCatalogOperationalIdentityKey(raw: string | null | undefined): string {
  const simple = normalizeIngredientName(raw ?? "");
  if (!simple) return "";
  return canonicalizeIdentityTokens(simple);
}

export function operationalIdentityKeyForCatalogEntry(entry: IngredientCanonicalInput): string {
  const display = entry.name?.trim() || entry.normalized_name?.trim() || "";
  if (!display) return "";
  const fromName = normalizeOperationalIdentityKey(display);
  if (fromName) return fromName;
  const normalized = entry.normalized_name?.trim();
  return normalized ? normalizeOperationalIdentityKey(normalized) : "";
}

export function catalogOperationalIdentityKeyForEntry(entry: IngredientCanonicalInput): string {
  const normalized = entry.normalized_name?.trim();
  if (normalized) {
    const fromStored = normalizeCatalogOperationalIdentityKey(normalized);
    if (fromStored) return fromStored;
  }
  const display = entry.name?.trim() || "";
  return normalizeCatalogOperationalIdentityKey(display);
}

export function findCatalogIngredientByOperationalKey(
  catalog: IngredientCanonicalInput[],
  proposedName: string,
): IngredientCanonicalInput | null {
  const key = normalizeCatalogOperationalIdentityKey(proposedName);
  if (!key) return null;

  for (const entry of catalog) {
    if (isArchivedIngredientEntry(entry)) continue;
    if (catalogOperationalIdentityKeyForEntry(entry) === key) return entry;
  }
  return null;
}

export function catalogHasDuplicateDisplayName(
  proposedName: string,
  catalog: IngredientCanonicalInput[],
): IngredientCanonicalInput | null {
  const target = proposedName.trim().toLowerCase();
  if (!target) return null;
  for (const entry of catalog) {
    if (isArchivedIngredientEntry(entry)) continue;
    const display = (entry.name ?? entry.normalized_name ?? "").trim().toLowerCase();
    if (display && display === target) return entry;
  }
  return null;
}

export type IngredientDuplicatePreventionReason =
  | "operational_identity_key"
  | "duplicate_display_name";

export type IngredientDuplicatePreventionEvent = {
  reason: IngredientDuplicatePreventionReason;
  proposedName: string;
  operationalKey: string;
  existingIngredientId: string;
  existingIngredientName: string | null;
};

export function logIngredientDuplicatePrevention(event: IngredientDuplicatePreventionEvent): void {
  traceIdentity("duplicate-prevention", event);
}

export type IngredientCreationGuardResult =
  | {
      action: "create";
      operationalKey: string;
    }
  | {
      action: "reuse";
      operationalKey: string;
      existing: IngredientCanonicalInput;
      reason: IngredientDuplicatePreventionReason;
    };

export type IngredientCreationGuardTraceContext = {
  flowOrigin: CanonicalCreateFlowOrigin;
  flowFunction: string;
  rawInvoiceText?: string | null;
};

/**
 * Resolve whether a proposed ingredient name should create a new row or reuse catalog.
 */
export function guardIngredientCreation(
  proposedName: string,
  catalog: IngredientCanonicalInput[],
  traceContext?: IngredientCreationGuardTraceContext,
): IngredientCreationGuardResult {
  const operationalKey = normalizeCatalogOperationalIdentityKey(proposedName);
  const trimmed = proposedName.trim();
  const normalized = normalizeIngredientName(trimmed);

  if (traceContext) {
    traceCanonicalNameSource({
      flowFunction: traceContext.flowFunction,
      flowOrigin: traceContext.flowOrigin,
      stage: "guard-enter",
      rawInvoiceText: traceContext.rawInvoiceText ?? null,
      normalized,
      finalCanonicalName: trimmed,
      nameSource:
        traceContext.flowOrigin === "manual_form"
          ? "form_input"
          : traceContext.flowOrigin === "explicit_user"
            ? "user_canonical"
            : "unknown",
      insertAttempted: false,
    });
  }

  const byDisplay = catalogHasDuplicateDisplayName(trimmed, catalog);
  if (byDisplay) {
    const key = catalogOperationalIdentityKeyForEntry(byDisplay) || operationalKey;
    logIngredientDuplicatePrevention({
      reason: "duplicate_display_name",
      proposedName: trimmed,
      operationalKey: key,
      existingIngredientId: byDisplay.id,
      existingIngredientName: byDisplay.name,
    });
    if (traceContext) {
      traceCanonicalDuplicateDetected({
        ...traceContext,
        stage: "guard-reuse",
        normalized,
        finalCanonicalName: trimmed,
        reason: "duplicate_display_name",
        operationalKey: key,
        existingIngredientId: byDisplay.id,
        existingIngredientName: byDisplay.name,
        insertAttempted: false,
      });
    }
    return { action: "reuse", operationalKey: key, existing: byDisplay, reason: "duplicate_display_name" };
  }

  const byOperational = findCatalogIngredientByOperationalKey(catalog, trimmed);
  if (byOperational) {
    const key = catalogOperationalIdentityKeyForEntry(byOperational) || operationalKey;
    logIngredientDuplicatePrevention({
      reason: "operational_identity_key",
      proposedName: trimmed,
      operationalKey: key,
      existingIngredientId: byOperational.id,
      existingIngredientName: byOperational.name,
    });
    if (traceContext) {
      traceCanonicalDuplicateDetected({
        ...traceContext,
        stage: "guard-reuse",
        normalized,
        finalCanonicalName: trimmed,
        reason: "operational_identity_key",
        operationalKey: key,
        existingIngredientId: byOperational.id,
        existingIngredientName: byOperational.name,
        insertAttempted: false,
      });
    }
    return {
      action: "reuse",
      operationalKey: key,
      existing: byOperational,
      reason: "operational_identity_key",
    };
  }

  return { action: "create", operationalKey };
}

/** Blocks new rows when normalized_name already exists (legacy guard). */
export function catalogHasNormalizedNameDuplicate(
  normalizedName: string,
  catalog: IngredientCanonicalInput[],
): boolean {
  const target = normalizedName.trim().toLowerCase();
  if (!target) return true;
  return catalog.some((entry) => {
    if (isArchivedIngredientEntry(entry)) return false;
    const stored = entry.normalized_name?.trim().toLowerCase();
    if (stored && stored === target) return true;
    return normalizeIngredientName(entry.name ?? "") === target;
  });
}

export function catalogHasOperationalIdentityDuplicate(
  proposedName: string,
  catalog: IngredientCanonicalInput[],
): boolean {
  return findCatalogIngredientByOperationalKey(catalog, proposedName) != null;
}
