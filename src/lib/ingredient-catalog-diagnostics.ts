import {
  cleanCanonicalIngredientNameForCatalog,
} from "@/lib/canonical-ingredient-display-name";
import type { IngredientCanonicalInput } from "@/lib/ingredient-canonical";
import {
  isCanonicalIngredientEntry,
  isExplicitAliasIngredientEntry,
  looksLikeInvoiceShorthandName,
  normalizeIngredientKindValue,
  INGREDIENT_KIND_ALIAS,
  INGREDIENT_KIND_CANONICAL,
} from "@/lib/ingredient-kind";
import {
  catalogOperationalIdentityKeyForEntry,
  normalizeCatalogOperationalIdentityKey,
} from "@/lib/ingredient-operational-identity";
import { normalizeIngredientName } from "@/lib/normalizeIngredient";

export const CATALOG_LEAK_LOG_PREFIX = "[catalog_leak]";
/** Structured companion to {@link CATALOG_LEAK_LOG_PREFIX} for grep/filter in DevTools. */
export const CATALOG_LEAK_DETECTED_PREFIX = "[catalog_leak_detected]";
/** Per-row pollution detail emitted alongside {@link CATALOG_LEAK_DETECTED_PREFIX}. */
export const CATALOG_POLLUTION_ROW_PREFIX = "[catalog_pollution_row]";
export const ALIAS_ONLY_LOG_PREFIX = "[alias_only]";
export const UNMATCHED_PERSIST_LOG_PREFIX = "[unmatched_persist]";
export const CANONICAL_INSERT_LOG_PREFIX = "[canonical_insert]";
export const CANONICAL_CREATE_ATTEMPT_PREFIX = "[canonical_create_attempt]";
/** @deprecated Prefer {@link CANONICAL_NAME_SOURCE_PREFIX}; still emitted for grep continuity. */
export const CANONICAL_CREATE_SOURCE_PREFIX = "[canonical_create_source]";
export const CANONICAL_NAME_SOURCE_PREFIX = "[canonical_name_source]";
export const CANONICAL_DUPLICATE_DETECTED_PREFIX = "[canonical_duplicate_detected]";

/** Where a catalog row create was initiated (instrumentation only). */
export type CanonicalCreateFlowOrigin =
  | "explicit_user"
  | "auto_persist"
  | "rematch"
  | "manual_form"
  | "unknown";

export type CanonicalCreateTraceFields = {
  flowOrigin: CanonicalCreateFlowOrigin;
  flowFunction: string;
  stage: string;
  rawInvoiceText?: string | null;
  normalized?: string | null;
  finalCanonicalName?: string | null;
  nameSource?: "invoice_line" | "user_canonical" | "form_input" | "unknown";
  insertAttempted?: boolean;
  blocked?: boolean;
  blockReason?: string | null;
};

function emitCanonicalCreateAttempt(fields: CanonicalCreateTraceFields): void {
  const { stage, ...rest } = fields;
  console.info(`${CANONICAL_CREATE_ATTEMPT_PREFIX} ${stage}`, rest);
}

function emitCanonicalNameSource(fields: CanonicalCreateTraceFields): void {
  const { stage, ...rest } = fields;
  const payload = { stage, ...rest };
  console.info(`${CANONICAL_NAME_SOURCE_PREFIX} ${stage}`, payload);
  console.info(`${CANONICAL_CREATE_SOURCE_PREFIX} ${stage}`, payload);
}

/** Log when `ingredients.name` would be derived from invoice/OCR vs user-confirmed canonical. */
export function traceCanonicalCreateNameSource(
  fields: Omit<CanonicalCreateTraceFields, "stage"> & { stage?: string },
): void {
  emitCanonicalNameSource({
    stage: fields.stage ?? "name-source",
    ...fields,
  });
}

/** Alias for {@link traceCanonicalCreateNameSource} — grep `[canonical_name_source]`. */
export function traceCanonicalNameSource(
  fields: Omit<CanonicalCreateTraceFields, "stage"> & { stage?: string },
): void {
  traceCanonicalCreateNameSource(fields);
}

export type CanonicalDuplicateDetectedFields = CanonicalCreateTraceFields & {
  reason: "duplicate_display_name" | "operational_identity_key" | "catalog_cluster";
  existingIngredientId?: string | null;
  existingIngredientName?: string | null;
  operationalKey?: string | null;
  clusterMembers?: Array<{ id: string; name: string; normalized_name: string | null }>;
};

/** Log create-guard reuse or near-duplicate clusters on catalog load (no merge). */
export function traceCanonicalDuplicateDetected(
  fields: Omit<CanonicalDuplicateDetectedFields, "stage"> & { stage?: string },
): void {
  const { stage, ...rest } = fields;
  console.warn(`${CANONICAL_DUPLICATE_DETECTED_PREFIX} ${stage ?? "detected"}`, rest);
}

/** Log before any path that may call `ingredients.insert` or build an insert payload. */
export function traceCanonicalCreateAttempt(
  fields: Omit<CanonicalCreateTraceFields, "stage"> & { stage?: string },
): void {
  emitCanonicalCreateAttempt({
    stage: fields.stage ?? "attempt",
    ...fields,
  });
}

export type CatalogLeakReason =
  | "explicit_alias_kind"
  | "invoice_shorthand_name"
  | "legacy_canonical_shorthand";

export type CatalogLeakRow = {
  id: string;
  name: string;
  ingredientKind: string | null;
  reason: CatalogLeakReason;
};

export type CatalogPollutionRowDiagnostics = {
  ingredientId: string;
  ingredientName: string;
  /** Result of {@link isCanonicalIngredientEntry} (catalog filter gate). */
  isCanonical: boolean;
  /** Explicit `ingredient_kind` when present; otherwise inferred kind label. */
  ingredientKind: string | null;
  inferredKind: "canonical" | "alias" | "inferred_canonical" | "inferred_alias";
  leakReason: CatalogLeakReason;
  /** How the row likely entered `public.ingredients` (instrumentation only). */
  inferredCreationSource: string;
  createdFromInvoiceRow: string | "unknown/legacy";
  normalizedName: string | null;
  looksLikeInvoiceShorthand: boolean;
  /** Invoice/OCR alias text when inferable from row shape. */
  aliasSourceText: string | null;
};

function readCreatedFromInvoiceRow(entry: IngredientCanonicalInput): string | "unknown/legacy" {
  const raw = (entry as IngredientCanonicalInput & { created_from_invoice_row?: unknown })
    .created_from_invoice_row;
  if (raw === true) return "true";
  if (raw === false) return "false";
  if (typeof raw === "string" && raw.trim()) return raw.trim();
  return "unknown/legacy";
}

function inferPollutionCreationSource(
  entry: IngredientCanonicalInput,
  leak: CatalogLeakRow,
): string {
  const explicitKind = normalizeIngredientKindValue(entry.ingredient_kind);
  const shorthand = looksLikeInvoiceShorthandName(leak.name);

  if (leak.reason === "explicit_alias_kind") {
    return `db_column:ingredient_kind=${INGREDIENT_KIND_ALIAS}`;
  }
  if (leak.reason === "legacy_canonical_shorthand") {
    return explicitKind === INGREDIENT_KIND_CANONICAL
      ? "historical_insert:canonical_kind+invoice_shorthand_name (pre-guard auto-persist or manual)"
      : "historical_insert:shorthand_name_without_alias_kind";
  }
  if (leak.reason === "invoice_shorthand_name") {
    return explicitKind
      ? `db_column:ingredient_kind=${explicitKind}+shorthand_name`
      : shorthand
        ? "legacy_row:shorthand_name_heuristic_only"
        : "legacy_row:shorthand_name";
  }
  return "unknown";
}

function inferAliasSourceText(
  entry: IngredientCanonicalInput,
  leak: CatalogLeakRow,
): string | null {
  const name = entry.name?.trim() || leak.name;
  const storedNorm = entry.normalized_name?.trim().toLowerCase() ?? null;
  const nameNorm = normalizeIngredientName(name) || null;

  if (leak.reason === "explicit_alias_kind") return name;

  if (looksLikeInvoiceShorthandName(name)) return name;

  if (storedNorm && nameNorm && storedNorm !== nameNorm) {
    return name;
  }

  return null;
}

function resolveInferredKind(entry: IngredientCanonicalInput): CatalogPollutionRowDiagnostics["inferredKind"] {
  const explicit = normalizeIngredientKindValue(entry.ingredient_kind);
  if (explicit === INGREDIENT_KIND_ALIAS) return "alias";
  if (explicit === INGREDIENT_KIND_CANONICAL) return "canonical";
  return looksLikeInvoiceShorthandName(entry.name ?? entry.normalized_name ?? "")
    ? "inferred_alias"
    : "inferred_canonical";
}

/** Review UI row built from a catalog leak + full ingredient entry. */
export type CatalogReviewLeakRowDetail = CatalogPollutionRowDiagnostics & {
  canonicalDisplayName: string;
  rawName: string;
  createdAt: string | null;
};

/** Build per-row pollution fields for logging (no filter/matching changes). */
export function buildCatalogPollutionRowDiagnostics(
  entry: IngredientCanonicalInput,
  leak: CatalogLeakRow,
): CatalogPollutionRowDiagnostics {
  const ingredientName = entry.name?.trim() || leak.name;
  const normalizedName = entry.normalized_name?.trim() ?? null;

  return {
    ingredientId: leak.id,
    ingredientName,
    isCanonical: isCanonicalIngredientEntry(entry),
    ingredientKind: normalizeIngredientKindValue(entry.ingredient_kind),
    inferredKind: resolveInferredKind(entry),
    leakReason: leak.reason,
    inferredCreationSource: inferPollutionCreationSource(entry, leak),
    createdFromInvoiceRow: readCreatedFromInvoiceRow(entry),
    normalizedName,
    looksLikeInvoiceShorthand: looksLikeInvoiceShorthandName(ingredientName),
    aliasSourceText: inferAliasSourceText(entry, leak),
  };
}

/** Enriched leak row for catalog pollution review (read-only discovery). */
export function buildCatalogReviewLeakRowDetail(
  entry: IngredientCanonicalInput,
  leak: CatalogLeakRow,
): CatalogReviewLeakRowDetail {
  const rawName = entry.name?.trim() || leak.name;
  const diagnostics = buildCatalogPollutionRowDiagnostics(entry, leak);
  return {
    ...diagnostics,
    canonicalDisplayName: cleanCanonicalIngredientNameForCatalog(rawName) || rawName,
    rawName,
    createdAt:
      (entry as IngredientCanonicalInput & { created_at?: string | null }).created_at?.trim() ??
      null,
  };
}

function logCatalogPollutionRow(
  entry: IngredientCanonicalInput,
  leak: CatalogLeakRow,
  context: string,
): void {
  const row = buildCatalogPollutionRowDiagnostics(entry, leak);
  console.warn(CATALOG_POLLUTION_ROW_PREFIX, {
    context,
    flowFunction: "logCatalogLeakDiagnostics",
    flowOrigin: "unknown" as const,
    note: "DB row loaded before catalog filter; pairs with catalog_leak_detected",
    ...row,
  });
}

function traceCatalogLeak(stage: string, details?: Record<string, unknown>): void {
  const message = `${CATALOG_LEAK_LOG_PREFIX} ${stage}`;
  if (details) console.warn(message, details);
  else console.warn(message);
}

/** Rows that must not appear on the human-facing ingredients catalog. */
export function detectCatalogLeakRows(
  catalog: IngredientCanonicalInput[],
): CatalogLeakRow[] {
  const leaks: CatalogLeakRow[] = [];

  for (const entry of catalog) {
    const name = entry.name?.trim() || entry.normalized_name?.trim() || "";
    const id = entry.id?.trim();
    if (!id || !name) continue;

    const explicitKind = normalizeIngredientKindValue(entry.ingredient_kind);
    const shorthand = looksLikeInvoiceShorthandName(name);

    if (isExplicitAliasIngredientEntry(entry)) {
      leaks.push({
        id,
        name,
        ingredientKind: explicitKind,
        reason: "explicit_alias_kind",
      });
      continue;
    }

    if (!shorthand) continue;

    if (explicitKind === INGREDIENT_KIND_CANONICAL) {
      leaks.push({
        id,
        name,
        ingredientKind: explicitKind,
        reason: "legacy_canonical_shorthand",
      });
    } else {
      leaks.push({
        id,
        name,
        ingredientKind: explicitKind,
        reason: "invoice_shorthand_name",
      });
    }
  }

  return leaks;
}

export function logCatalogLeakDiagnostics(
  catalog: IngredientCanonicalInput[],
  context: string,
): CatalogLeakRow[] {
  const leaks = detectCatalogLeakRows(catalog);
  if (leaks.length === 0) return leaks;

  const entryById = new Map(
    catalog
      .map((entry) => [entry.id?.trim(), entry] as const)
      .filter(([id]) => Boolean(id)),
  );

  for (const leak of leaks) {
    const entry = entryById.get(leak.id);
    if (entry) logCatalogPollutionRow(entry, leak, context);
  }

  const pollutionSamples = leaks.slice(0, 12).map((leak) => {
    const entry = entryById.get(leak.id);
    return entry
      ? buildCatalogPollutionRowDiagnostics(entry, leak)
      : {
          ingredientId: leak.id,
          ingredientName: leak.name,
          isCanonical: false,
          ingredientKind: leak.ingredientKind,
          inferredKind: "inferred_alias" as const,
          leakReason: leak.reason,
          inferredCreationSource: "unknown",
          createdFromInvoiceRow: "unknown/legacy" as const,
          normalizedName: null,
          looksLikeInvoiceShorthand: looksLikeInvoiceShorthandName(leak.name),
          aliasSourceText: looksLikeInvoiceShorthandName(leak.name) ? leak.name : null,
        };
  });

  const samplePayload = {
    context,
    count: leaks.length,
    samples: leaks.slice(0, 12).map((row) => ({
      id: row.id,
      name: row.name,
      reason: row.reason,
      ingredientKind: row.ingredientKind,
    })),
    pollutionRows: pollutionSamples,
  };
  traceCatalogLeak("legacy-pollution-detected", samplePayload);
  console.warn(`${CATALOG_LEAK_DETECTED_PREFIX} legacy-pollution-detected`, {
    ...samplePayload,
    flowFunction: "logCatalogLeakDiagnostics",
    flowOrigin: "unknown" as const,
    note: "DB rows loaded before catalog filter; not a create attempt",
    pollutionRowLogPrefix: CATALOG_POLLUTION_ROW_PREFIX,
  });
  return leaks;
}

export function traceAliasOnly(stage: string, details?: Record<string, unknown>): void {
  const message = `${ALIAS_ONLY_LOG_PREFIX} ${stage}`;
  if (details) console.info(message, details);
  else console.info(message);
}

export function traceUnmatchedPersist(stage: string, details?: Record<string, unknown>): void {
  const message = `${UNMATCHED_PERSIST_LOG_PREFIX} ${stage}`;
  if (details) console.info(message, details);
  else console.info(message);
}

export function traceCanonicalInsert(stage: string, details?: Record<string, unknown>): void {
  const message = `${CANONICAL_INSERT_LOG_PREFIX} ${stage}`;
  if (details) console.info(message, details);
  else console.info(message);
}

export type NearDuplicateCanonicalCluster = {
  /** Catalog semantic key from {@link cleanCanonicalIngredientNameForCatalog} + normalize. */
  cleanedNormalizedKey: string;
  operationalKeys: string[];
  members: Array<{
    id: string;
    name: string;
    normalized_name: string | null;
    operationalKey: string;
  }>;
};

/**
 * Groups active canonical rows that share the same cleaned catalog identity but differ in
 * stored display name or operational key (e.g. óleo girassol vs óleo girassol fula 1L).
 * Instrumentation only — does not merge or block creates.
 */
export function detectNearDuplicateCanonicalClusters(
  catalog: IngredientCanonicalInput[],
): NearDuplicateCanonicalCluster[] {
  const byCleanedKey = new Map<string, NearDuplicateCanonicalCluster["members"]>();

  for (const entry of catalog) {
    const id = entry.id?.trim();
    const name = entry.name?.trim() || entry.normalized_name?.trim() || "";
    if (!id || !name) continue;

    const cleanedNormalizedKey =
      normalizeIngredientName(cleanCanonicalIngredientNameForCatalog(name)) ||
      normalizeIngredientName(name);
    if (!cleanedNormalizedKey) continue;

    const operationalKey = catalogOperationalIdentityKeyForEntry(entry);
    const members = byCleanedKey.get(cleanedNormalizedKey) ?? [];
    members.push({
      id,
      name: entry.name?.trim() || name,
      normalized_name: entry.normalized_name?.trim() ?? null,
      operationalKey,
    });
    byCleanedKey.set(cleanedNormalizedKey, members);
  }

  const clusters: NearDuplicateCanonicalCluster[] = [];
  for (const [cleanedNormalizedKey, members] of byCleanedKey) {
    if (members.length < 2) continue;
    const displayNames = new Set(members.map((m) => m.name.trim().toLowerCase()));
    const operationalKeys = [...new Set(members.map((m) => m.operationalKey).filter(Boolean))];
    const operationalCollision = operationalKeys.length === 1 && members.length > 1;
    if (displayNames.size < 2 && !operationalCollision) continue;
    clusters.push({ cleanedNormalizedKey, operationalKeys, members });
  }
  return clusters;
}

export function logNearDuplicateCanonicalClusters(
  catalog: IngredientCanonicalInput[],
  context: string,
): NearDuplicateCanonicalCluster[] {
  const clusters = detectNearDuplicateCanonicalClusters(catalog);
  if (clusters.length === 0) return clusters;

  for (const cluster of clusters.slice(0, 8)) {
    traceCanonicalDuplicateDetected({
      flowFunction: "logNearDuplicateCanonicalClusters",
      flowOrigin: "unknown",
      stage: "catalog-cluster",
      rawInvoiceText: null,
      normalized: cluster.cleanedNormalizedKey,
      finalCanonicalName: cluster.members.map((m) => m.name).join(" | "),
      nameSource: "unknown",
      insertAttempted: false,
      reason: "catalog_cluster",
      operationalKey: cluster.operationalKeys.join(" | ") || null,
      clusterMembers: cluster.members.map((m) => ({
        id: m.id,
        name: m.name,
        normalized_name: m.normalized_name,
      })),
    });
  }

  console.warn(`${CANONICAL_DUPLICATE_DETECTED_PREFIX} catalog-load-summary`, {
    context,
    clusterCount: clusters.length,
    samples: clusters.slice(0, 6).map((c) => ({
      cleanedNormalizedKey: c.cleanedNormalizedKey,
      operationalKeys: c.operationalKeys,
      names: c.members.map((m) => m.name),
      ids: c.members.map((m) => m.id),
    })),
  });
  return clusters;
}

/** Proposed-name operational key vs catalog — for duplicate trace payloads. */
export function proposedCatalogOperationalKey(proposedName: string): string {
  return normalizeCatalogOperationalIdentityKey(proposedName);
}
