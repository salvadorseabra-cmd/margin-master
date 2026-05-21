/**
 * Opt-in tracing for manual invoice ingredient match persist / reload.
 * Enable in DevTools: `window.__MARGINLY_MANUAL_MATCH_TRACE__ = true`
 */

declare global {
  interface Window {
    __MARGINLY_MANUAL_MATCH_TRACE__?: boolean;
  }
}

export function isManualIngredientMatchTraceEnabled(): boolean {
  if (typeof window !== "undefined" && window.__MARGINLY_MANUAL_MATCH_TRACE__ === true) {
    return true;
  }
  return import.meta.env.DEV;
}

export function traceManualIngredientMatch(
  prefix: "[manual_match_attempt]" | "[manual_match_persist_result]" | "[manual_match_reload_result]" | "[alias_link_lookup]",
  details: Record<string, unknown>,
): void {
  if (!isManualIngredientMatchTraceEnabled()) return;
  console.info(prefix, details);
}
