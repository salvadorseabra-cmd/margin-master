/**
 * Deterministic virtual catalog entries inferred from invoice line clusters.
 * Used only for matching — never persisted to Supabase.
 */

import type { IngredientCanonicalInput } from "@/lib/ingredient-canonical";
import { normalizeCanonicalIngredientName } from "@/lib/ingredient-canonical";
import {
  canonicalizeIngredientIdentity,
  hasCompatibleCanonicalForms,
  OPERATIONAL_ALIAS_CLUSTERS,
  resolveOperationalAliasClusterIdFromRaw,
} from "@/lib/ingredient-identity";
import { normalizeInvoiceItemFields } from "@/lib/invoice-item-fields";

export const MIN_SUPPORTING_LINES = 2;

export type InvoiceLineForClustering = {
  name: string;
};

export type OperationalCluster = {
  clusterId: string;
  canonicalName: string;
  family: string;
  form: string | null;
  supportingLineCount: number;
  operationalAliasClusterId: string | null;
};

export type SyntheticCatalogIngredient = IngredientCanonicalInput & {
  synthetic: true;
  clusterId: string;
};

const CHEDDAR_FORM_SURFACE_TOKENS = new Set([
  "fatiado",
  "fatiada",
  "fatias",
  "sliced",
  "slice",
  "slices",
  "bloco",
  "block",
  "molho",
  "molhos",
  "ralado",
  "ralada",
  "grated",
  "dip",
  "dips",
]);

function slugifyClusterId(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function canonicalDisplayName(family: string, form: string | null): string {
  if (family && form) {
    return `${family} ${form.replace(/_/g, " ")}`.replace(/\s+/g, " ").toUpperCase();
  }
  return family.toUpperCase();
}

function clusterGroupKey(family: string, form: string | null): string {
  return `${family}|${form ?? ""}`;
}

function hasStrongOperationalCluster(rawName: string): boolean {
  const clusterId = resolveOperationalAliasClusterIdFromRaw(rawName);
  if (!clusterId) return false;
  const cluster = OPERATIONAL_ALIAS_CLUSTERS.find((c) => c.id === clusterId);
  return cluster != null && cluster.form != null;
}

function strippedHasExplicitCheddarForm(rawName: string): boolean {
  const tokens = rawName
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .split(/\s+/)
    .filter((t) => t.length > 1);
  return tokens.some((token) => CHEDDAR_FORM_SURFACE_TOKENS.has(token));
}

function invoiceHasConflictingCheddarForms(items: InvoiceLineForClustering[]): boolean {
  const forms = new Set<string>();
  let hasPlainCheddar = false;

  for (const item of items) {
    const identity = canonicalizeIngredientIdentity(item.name);
    if (identity.family !== "cheddar") continue;
    if (identity.form) {
      forms.add(identity.form);
    } else if (
      strippedHasExplicitCheddarForm(item.name) ||
      resolveOperationalAliasClusterIdFromRaw(item.name) === "cheddar-plain"
    ) {
      hasPlainCheddar = true;
    }
  }

  if (forms.size > 1) return true;
  if (forms.size === 1 && hasPlainCheddar) return true;
  return false;
}

function catalogCoversCluster(
  catalog: IngredientCanonicalInput[],
  family: string,
  form: string | null,
): boolean {
  return catalog.some((ingredient) => {
    const raw = ingredient.name ?? ingredient.normalized_name ?? "";
    const identity = canonicalizeIngredientIdentity(raw);
    if (identity.family !== family) return false;
    if (!hasCompatibleCanonicalForms(identity.form, form)) return false;
    if (form && identity.form !== form) return false;
    if (!form && identity.form) return false;
    return true;
  });
}

function resolveClusterId(
  family: string,
  form: string | null,
  operationalAliasClusterId: string | null,
): string {
  if (operationalAliasClusterId) return operationalAliasClusterId;
  return form ? `${family}-${form}` : family;
}

type LineClusterAssignment = {
  name: string;
  family: string;
  form: string | null;
  operationalAliasClusterId: string | null;
};

function assignLineCluster(line: InvoiceLineForClustering): LineClusterAssignment | null {
  const name = line.name.trim();
  if (!name) return null;

  const identity = canonicalizeIngredientIdentity(name);
  if (!identity.family) return null;
  if (identity.form?.includes("+")) return null;

  const operationalAliasClusterId = resolveOperationalAliasClusterIdFromRaw(name);
  const clusterDef = operationalAliasClusterId
    ? OPERATIONAL_ALIAS_CLUSTERS.find((c) => c.id === operationalAliasClusterId)
    : null;

  const family = clusterDef?.family ?? identity.family;
  let form = identity.form;
  if (clusterDef?.form != null) form = clusterDef.form;

  if (!form && family === "cheddar" && operationalAliasClusterId === "cheddar-plain") {
    return { name, family, form: null, operationalAliasClusterId };
  }

  if (!form) return null;

  return { name, family, form, operationalAliasClusterId };
}

function meetsSynthesisSupport(
  assignments: LineClusterAssignment[],
  operationalAliasClusterId: string | null,
): boolean {
  if (assignments.length >= MIN_SUPPORTING_LINES) return true;
  if (assignments.length !== 1) return false;
  const line = assignments[0]!;
  return (
    line.form != null &&
    hasStrongOperationalCluster(line.name) &&
    operationalAliasClusterId != null &&
    operationalAliasClusterId !== "cheddar-plain"
  );
}

function rejectClusterSynthesis(
  assignments: LineClusterAssignment[],
  allItems: InvoiceLineForClustering[],
): boolean {
  const { family, form, operationalAliasClusterId } = assignments[0]!;

  if (family === "cheddar") {
    if (invoiceHasConflictingCheddarForms(allItems)) return true;
    if (!form && operationalAliasClusterId === "cheddar-plain") return true;
    if (!form) return true;
  }

  const clusterIds = new Set(
    assignments
      .map((a) => resolveOperationalAliasClusterIdFromRaw(a.name))
      .filter((id): id is string => id != null),
  );
  if (clusterIds.size > 1) return true;

  const forms = new Set(assignments.map((a) => a.form).filter((f): f is string => f != null));
  if (forms.size > 1) return true;

  return false;
}

/**
 * Group invoice lines into operational clusters with shared family + form.
 */
export function detectOperationalClusters(
  invoiceItems: InvoiceLineForClustering[],
): OperationalCluster[] {
  const groups = new Map<string, LineClusterAssignment[]>();

  for (const item of invoiceItems) {
    const assignment = assignLineCluster(item);
    if (!assignment) continue;
    const key = clusterGroupKey(assignment.family, assignment.form);
    const bucket = groups.get(key) ?? [];
    bucket.push(assignment);
    groups.set(key, bucket);
  }

  const clusters: OperationalCluster[] = [];

  for (const assignments of groups.values()) {
    if (assignments.length === 0) continue;
    const { family, form } = assignments[0]!;
    const operationalAliasClusterId =
      assignments
        .map((a) => a.operationalAliasClusterId)
        .find((id) => id != null) ?? null;

    if (
      !meetsSynthesisSupport(assignments, operationalAliasClusterId) ||
      rejectClusterSynthesis(assignments, invoiceItems)
    ) {
      continue;
    }

    const clusterId = resolveClusterId(family, form, operationalAliasClusterId);
    clusters.push({
      clusterId,
      canonicalName: canonicalDisplayName(family, form),
      family,
      form,
      supportingLineCount: assignments.length,
      operationalAliasClusterId,
    });
  }

  return clusters;
}

/**
 * Build virtual catalog rows for clusters not already covered by the persisted catalog.
 */
export function synthesizeCanonicalIngredients(
  clusters: OperationalCluster[],
  existingCatalog: IngredientCanonicalInput[] = [],
): SyntheticCatalogIngredient[] {
  const synthetics: SyntheticCatalogIngredient[] = [];

  for (const cluster of clusters) {
    if (catalogCoversCluster(existingCatalog, cluster.family, cluster.form)) continue;

    const id = `synthetic:${slugifyClusterId(cluster.clusterId)}`;
    if (synthetics.some((row) => row.id === id)) continue;

    const normalized_name = normalizeCanonicalIngredientName(cluster.canonicalName);
    synthetics.push({
      id,
      name: cluster.canonicalName,
      normalized_name,
      synthetic: true,
      clusterId: cluster.clusterId,
    });
  }

  return synthetics;
}

export function isSyntheticCatalogIngredientId(id: string): boolean {
  return id.startsWith("synthetic:");
}

/**
 * Persisted catalog + invoice-inferred synthetics for matching only.
 */
export function buildInvoiceMatchCatalog(
  ingredientCatalog: IngredientCanonicalInput[],
  invoiceItems: InvoiceLineForClustering[],
): IngredientCanonicalInput[] {
  const normalizedItems = invoiceItems
    .map((item) => {
      const name = item.name?.trim() ?? "";
      if (!name) return null;
      return { name: normalizeInvoiceItemFields({ id: "synthesis", name }).name };
    })
    .filter((item): item is InvoiceLineForClustering => item != null && item.name.length > 0);

  const clusters = detectOperationalClusters(normalizedItems);
  const synthetics = synthesizeCanonicalIngredients(clusters, ingredientCatalog);
  return [...ingredientCatalog, ...synthetics];
}
