import {
  isArchivedIngredientEntry,
  type IngredientAliasMap,
  type IngredientCanonicalInput,
} from "@/lib/ingredient-canonical";
import { isCanonicalIngredientEntry } from "@/lib/ingredient-kind";
import { isSyntheticCatalogIngredientId } from "@/lib/ingredient-canonical-synthesis";
import { normalizeInvoiceIngredientName } from "@/lib/ingredient-canonical";
import { formatCanonicalIngredientDisplayName } from "@/lib/canonical-ingredient-display-name";
import {
  traceIngredientPickerCatalogStage,
  traceIngredientPickerOptionsStage,
  traceIngredientPickerStage,
  traceIngredientPickerStageNote,
  traceRowsFromPickerOptions,
} from "@/lib/ingredient-picker-trace";
import { logPickerAliasLeaksIfAny } from "@/lib/recipe-canonical-integrity";

const LOG_PREFIX = "[ingredient_picker]";

export type IngredientPickerCandidateSource = "catalog";

export type IngredientPickerOption = {
  id: string;
  name: string;
  normalizedName: string;
  source: IngredientPickerCandidateSource;
  /** Extra strings for cmdk search (aliases, etc.) — never shown as separate rows. */
  searchKeywords: string[];
};

function debugPickerCandidate(
  message: string,
  details: {
    source: IngredientPickerCandidateSource;
    ingredientId: string;
    normalizedName: string;
    displayName?: string;
    duplicateOfId?: string;
  },
): void {
  console.debug(`${LOG_PREFIX} ${message}`, details);
}

function isCanonicalCatalogRow(row: IngredientCanonicalInput): boolean {
  const id = row.id?.trim();
  if (!id) return false;
  if (isArchivedIngredientEntry(row)) return false;
  if (!isCanonicalIngredientEntry(row)) return false;
  if (isSyntheticCatalogIngredientId(id)) return false;
  if (id.startsWith("invoice:") || id.startsWith("temp:") || id.startsWith("temporary:")) {
    return false;
  }
  return true;
}

function rawNameForRow(row: IngredientCanonicalInput): string {
  return row.name?.trim() || row.normalized_name?.trim() || row.id;
}

function displayNameForRow(row: IngredientCanonicalInput): string {
  const raw = rawNameForRow(row);
  return formatCanonicalIngredientDisplayName(raw) || raw;
}

/**
 * Canonical ingredient entities only — deduped by ingredient id.
 * Aliases and match-catalog synthetics are excluded from dropdown rows.
 */
export function buildCanonicalIngredientPickerOptions(
  catalog: IngredientCanonicalInput[],
): IngredientPickerOption[] {
  traceIngredientPickerCatalogStage("02_canonical_input_catalog_rows", catalog, {
    note: "Each catalog row before canonical filter and id-map dedupe",
  });

  const byId = new Map<string, IngredientPickerOption>();
  const rowsBeforeIdDedupe: ReturnType<typeof traceRowsFromPickerOptions> = [];

  for (const row of catalog) {
    if (!isCanonicalCatalogRow(row)) continue;

    const normalizedName =
      row.normalized_name?.trim() || normalizeInvoiceIngredientName(displayNameForRow(row));
    const name = displayNameForRow(row);
    const source: IngredientPickerCandidateSource = "catalog";

    const existing = byId.get(row.id);
    if (existing) {
      debugPickerCandidate("duplicate candidate skipped", {
        source,
        ingredientId: row.id,
        normalizedName,
        displayName: name,
        duplicateOfId: existing.id,
      });
      continue;
    }

    const option: IngredientPickerOption = {
      id: row.id,
      name,
      normalizedName,
      source,
      searchKeywords: [...new Set([rawNameForRow(row), name, normalizedName].filter(Boolean))],
    };
    rowsBeforeIdDedupe.push({
      ingredientId: row.id,
      displayName: name,
      source,
      normalizedName,
      searchKeywordCount: option.searchKeywords.length,
    });
    byId.set(row.id, option);
    debugPickerCandidate("picker candidate hydrated", {
      source,
      ingredientId: row.id,
      normalizedName,
      displayName: name,
    });
  }

  traceIngredientPickerStage("02b_canonical_rows_accepted_before_id_map", rowsBeforeIdDedupe, {
    note: "Canonical-eligible rows accepted into the id map (duplicates within loop are skipped, not listed here)",
  });

  const canonicalOptions = [...byId.values()];
  traceIngredientPickerOptionsStage("03_canonical_after_id_dedupe", canonicalOptions);
  logPickerAliasLeaksIfAny(canonicalOptions, catalog, "buildCanonicalIngredientPickerOptions");
  return canonicalOptions;
}

/** Final id-based dedupe for picker rows (safe after alias keyword merge or bad upstream arrays). */
export function dedupeIngredientPickerOptionsById(
  options: IngredientPickerOption[],
): IngredientPickerOption[] {
  const byId = new Map<string, IngredientPickerOption>();

  for (const option of options) {
    const id = option.id?.trim();
    if (!id) continue;

    const existing = byId.get(id);
    if (!existing) {
      byId.set(id, option);
      continue;
    }

    byId.set(id, {
      ...existing,
      searchKeywords: [...new Set([...existing.searchKeywords, ...option.searchKeywords])],
    });
  }

  const deduped = [...byId.values()];
  traceIngredientPickerOptionsStage("05a_dedupeIngredientPickerOptionsById", deduped);
  return deduped;
}

/** Attach confirmed alias strings as search keywords on canonical rows (not separate options). */
export function attachAliasSearchKeywordsToPickerOptions(
  options: IngredientPickerOption[],
  confirmedAliases: IngredientAliasMap,
): IngredientPickerOption[] {
  const aliasesByIngredientId = new Map<string, Set<string>>();

  for (const [mapKey, ingredientId] of Object.entries(confirmedAliases)) {
    if (!ingredientId?.trim()) continue;
    const aliasSegment = mapKey.includes("::") ? mapKey.split("::").pop()! : mapKey;
    const normalized = aliasSegment.trim();
    if (!normalized) continue;
    const bucket = aliasesByIngredientId.get(ingredientId) ?? new Set<string>();
    bucket.add(normalized);
    bucket.add(aliasSegment.trim());
    aliasesByIngredientId.set(ingredientId, bucket);
  }

  const withAliasKeywords = options.map((option) => {
    const aliasKeywords = aliasesByIngredientId.get(option.id);
    if (!aliasKeywords?.size) return option;
    const searchKeywords = [...new Set([...option.searchKeywords, ...aliasKeywords])];
    return { ...option, searchKeywords };
  });

  traceIngredientPickerStage(
    "04_after_alias_keywords",
    traceRowsFromPickerOptions(withAliasKeywords).map((row) => {
      const aliasKeywords = aliasesByIngredientId.get(row.ingredientId);
      return aliasKeywords?.size
        ? { ...row, aliasSource: "confirmed_alias_map", searchKeywordCount: aliasKeywords.size }
        : row;
    }),
    {
      confirmedAliasMapEntryCount: Object.keys(confirmedAliases).length,
      note: "Alias map attaches search keywords only; no extra picker rows are created",
    },
  );

  return withAliasKeywords;
}

export function buildIngredientPickerOptionsForInvoice(
  catalog: IngredientCanonicalInput[],
  confirmedAliases: IngredientAliasMap = {},
): IngredientPickerOption[] {
  traceIngredientPickerStageNote(
    "03b_operational_memory_hydration",
    "No operational-memory picker hydration stage exists; operational alias memory affects matching only.",
  );

  const canonical = buildCanonicalIngredientPickerOptions(catalog);
  const withAliasKeywords = attachAliasSearchKeywordsToPickerOptions(canonical, confirmedAliases);
  const deduped = dedupeIngredientPickerOptionsById(withAliasKeywords);
  traceIngredientPickerOptionsStage("05_after_final_id_dedupe", deduped, {
    pipeline: "buildIngredientPickerOptionsForInvoice",
  });
  return deduped;
}

/** cmdk item value must be unique per row; selection compares this string, not display name. */
export function ingredientPickerCommandValue(option: IngredientPickerOption): string {
  return option.id;
}
