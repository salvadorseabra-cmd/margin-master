import type { IngredientPickerOption } from "@/lib/ingredient-picker-options";

export const INGREDIENT_PICKER_TRACE_PREFIX = "[ingredient_picker_trace]";

declare global {
  interface Window {
    __MARGINLY_PICKER_TRACE__?: boolean;
  }
}

export function isIngredientPickerTraceEnabled(): boolean {
  if (import.meta.env.DEV) return true;
  return typeof window !== "undefined" && window.__MARGINLY_PICKER_TRACE__ === true;
}

export type IngredientPickerTraceRow = {
  ingredientId: string;
  displayName: string;
  source: string;
  aliasSource?: string;
  normalizedName?: string;
  searchKeywordCount?: number;
};

export type IngredientPickerTraceDiagnostics = {
  totalCount: number;
  duplicateIdCount: number;
  duplicateDisplayNameCount: number;
  repeatedIds: string[];
  repeatedDisplayNames: Array<{ displayName: string; ingredientIds: string[] }>;
};

function collectDiagnostics(rows: IngredientPickerTraceRow[]): IngredientPickerTraceDiagnostics {
  const idsByCount = new Map<string, number>();
  const idsByDisplayName = new Map<string, Set<string>>();

  for (const row of rows) {
    idsByCount.set(row.ingredientId, (idsByCount.get(row.ingredientId) ?? 0) + 1);
    const nameKey = row.displayName.trim() || row.ingredientId;
    const bucket = idsByDisplayName.get(nameKey) ?? new Set<string>();
    bucket.add(row.ingredientId);
    idsByDisplayName.set(nameKey, bucket);
  }

  const repeatedIds = [...idsByCount.entries()]
    .filter(([, count]) => count > 1)
    .map(([id]) => id);

  const repeatedDisplayNames = [...idsByDisplayName.entries()]
    .filter(([, idSet]) => idSet.size > 1)
    .map(([displayName, idSet]) => ({
      displayName,
      ingredientIds: [...idSet],
    }));

  return {
    totalCount: rows.length,
    duplicateIdCount: repeatedIds.length,
    duplicateDisplayNameCount: repeatedDisplayNames.length,
    repeatedIds,
    repeatedDisplayNames,
  };
}

function traceRowFromPickerOption(option: IngredientPickerOption): IngredientPickerTraceRow {
  return {
    ingredientId: option.id,
    displayName: option.name,
    source: option.source,
    normalizedName: option.normalizedName,
    searchKeywordCount: option.searchKeywords.length,
  };
}

export function traceRowsFromPickerOptions(options: IngredientPickerOption[]): IngredientPickerTraceRow[] {
  return options.map(traceRowFromPickerOption);
}

export function traceIngredientPickerStage(
  stage: string,
  rows: IngredientPickerTraceRow[],
  extra?: Record<string, unknown>,
): void {
  if (!isIngredientPickerTraceEnabled()) return;

  const diagnostics = collectDiagnostics(rows);
  console.groupCollapsed(
    `${INGREDIENT_PICKER_TRACE_PREFIX} stage=${stage} summary`,
    diagnostics,
  );
  console.log(`${INGREDIENT_PICKER_TRACE_PREFIX} stage=${stage} diagnostics`, diagnostics);
  if (extra && Object.keys(extra).length > 0) {
    console.log(`${INGREDIENT_PICKER_TRACE_PREFIX} stage=${stage} context`, extra);
  }
  for (const row of rows) {
    console.log(`${INGREDIENT_PICKER_TRACE_PREFIX} stage=${stage} option`, row);
  }
  console.groupEnd();
}

export function traceIngredientPickerOptionsStage(
  stage: string,
  options: IngredientPickerOption[],
  extra?: Record<string, unknown>,
): void {
  traceIngredientPickerStage(stage, traceRowsFromPickerOptions(options), extra);
}

export function traceIngredientPickerCatalogStage(
  stage: string,
  catalog: Array<{ id: string; name?: string | null; normalized_name?: string | null }>,
  extra?: Record<string, unknown>,
): void {
  if (!isIngredientPickerTraceEnabled()) return;

  const rows: IngredientPickerTraceRow[] = catalog.map((row) => ({
    ingredientId: row.id,
    displayName: row.name?.trim() || row.normalized_name?.trim() || row.id,
    source: "catalog_raw",
  }));
  traceIngredientPickerStage(stage, rows, extra);
}

export function traceIngredientPickerStageNote(stage: string, message: string): void {
  if (!isIngredientPickerTraceEnabled()) return;
  console.log(`${INGREDIENT_PICKER_TRACE_PREFIX} stage=${stage} note`, message);
}
