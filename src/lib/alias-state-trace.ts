/**
 * Opt-in tracing for confirmed alias map persistence / reload desync.
 * Enable in DevTools: `window.__MARGINLY_ALIAS_STATE_TRACE__ = true`
 */

import type { IngredientAliasMap } from "@/lib/ingredient-canonical";
import { isManualIngredientMatchTraceEnabled } from "@/lib/manual-ingredient-match-trace";

declare global {
  interface Window {
    __MARGINLY_ALIAS_STATE_TRACE__?: boolean;
  }
}

export function isAliasStateTraceEnabled(): boolean {
  if (typeof window !== "undefined" && window.__MARGINLY_ALIAS_STATE_TRACE__ === true) {
    return true;
  }
  return isManualIngredientMatchTraceEnabled();
}

function sampleMapKeys(map: IngredientAliasMap, limit = 12): string[] {
  return Object.keys(map).slice(0, limit);
}

export type AliasReloadSource = "localStorage" | "supabase" | "merge" | "persist" | "memory";

export function traceAliasStateDesync(details: {
  memoryKeyCount: number;
  dbKeyCount?: number;
  localStorageKeyCount?: number;
  memoryOnlyKeys?: string[];
  dbOnlyKeys?: string[];
  valueMismatches?: Array<{ key: string; memory: string; other: string; otherSource: string }>;
  trigger: string;
}): void {
  if (!isAliasStateTraceEnabled()) return;
  const hasMismatch =
    (details.memoryOnlyKeys?.length ?? 0) > 0 ||
    (details.dbOnlyKeys?.length ?? 0) > 0 ||
    (details.valueMismatches?.length ?? 0) > 0;
  if (!hasMismatch) return;
  console.warn("[alias_state_desync]", details);
}

export function traceAliasReloadCollision(details: {
  lookupKey: string;
  previousIngredientId: string;
  nextIngredientId: string;
  aliasName: string;
  rowCount?: number;
}): void {
  if (!isAliasStateTraceEnabled()) return;
  console.warn("[alias_reload_collision]", details);
}

export function traceManualMatchCacheState(details: Record<string, unknown>): void {
  if (!isAliasStateTraceEnabled()) return;
  console.info("[manual_match_cache_state]", details);
}

export function traceAliasPersistCycle(details: {
  phase: "before_persist" | "after_persist" | "after_db_reload";
  itemName?: string;
  aliasLookupKey?: string;
  aliasKeyBefore?: string | null;
  aliasKeyAfter?: string | null;
  mapKeyCount: number;
  sampleKeys: string[];
  reloadSource?: AliasReloadSource;
  queueGeneration?: number;
  dbRow?: Record<string, unknown> | null;
}): void {
  if (!isAliasStateTraceEnabled()) return;
  console.info("[alias_persist_cycle]", details);
}

export function compareAliasMapsForDesync(
  memory: IngredientAliasMap,
  db: IngredientAliasMap,
  trigger: string,
  localStorageMap?: IngredientAliasMap,
): void {
  const memoryKeys = new Set(Object.keys(memory));
  const dbKeys = new Set(Object.keys(db));
  const memoryOnlyKeys = [...memoryKeys].filter((k) => !dbKeys.has(k)).slice(0, 20);
  const dbOnlyKeys = [...dbKeys].filter((k) => !memoryKeys.has(k)).slice(0, 20);
  const valueMismatches: Array<{
    key: string;
    memory: string;
    other: string;
    otherSource: string;
  }> = [];

  for (const key of memoryKeys) {
    if (!dbKeys.has(key)) continue;
    if (memory[key] !== db[key]) {
      valueMismatches.push({
        key,
        memory: memory[key]!,
        other: db[key]!,
        otherSource: "db",
      });
    }
  }

  traceAliasStateDesync({
    memoryKeyCount: memoryKeys.size,
    dbKeyCount: dbKeys.size,
    localStorageKeyCount: localStorageMap ? Object.keys(localStorageMap).length : undefined,
    memoryOnlyKeys: memoryOnlyKeys.length ? memoryOnlyKeys : undefined,
    dbOnlyKeys: dbOnlyKeys.length ? dbOnlyKeys : undefined,
    valueMismatches: valueMismatches.length ? valueMismatches.slice(0, 20) : undefined,
    trigger,
  });

  if (localStorageMap) {
    const lsKeys = new Set(Object.keys(localStorageMap));
    const lsOnly = [...lsKeys].filter((k) => !memoryKeys.has(k)).slice(0, 12);
    if (lsOnly.length) {
      traceAliasStateDesync({
        memoryKeyCount: memoryKeys.size,
        localStorageKeyCount: lsKeys.size,
        memoryOnlyKeys: lsOnly,
        trigger: `${trigger}:localStorage_extra`,
      });
    }
  }
}

export function traceAliasMapSnapshot(
  label: string,
  map: IngredientAliasMap,
  extra?: Record<string, unknown>,
): void {
  if (!isAliasStateTraceEnabled()) return;
  console.info("[alias_map_snapshot]", {
    label,
    mapKeyCount: Object.keys(map).length,
    sampleKeys: sampleMapKeys(map),
    ...extra,
  });
}

export function traceUnmatchPersistState(details: Record<string, unknown>): void {
  if (!isAliasStateTraceEnabled()) return;
  console.info("[unmatch_persist_state]", details);
}

export function traceAliasUnmatchOrphan(details: Record<string, unknown>): void {
  if (!isAliasStateTraceEnabled()) return;
  console.warn("[alias_unmatch_orphan]", details);
}

export function traceRematchBlockedExistingRow(details: Record<string, unknown>): void {
  if (!isAliasStateTraceEnabled()) return;
  console.warn("[rematch_blocked_existing_row]", details);
}

export function traceAliasHiddenConstraint(details: Record<string, unknown>): void {
  if (!isAliasStateTraceEnabled()) return;
  console.warn("[alias_hidden_constraint]", details);
}
