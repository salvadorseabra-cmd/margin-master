/**
 * Phase 1 rollout flags for Match Lifecycle V1.
 * Roll back extract gating: VITE_MATCH_LIFECYCLE_EXTRACT_GATE=false
 */
export function isMatchLifecycleExtractGateEnabled(): boolean {
  const raw = import.meta.env.VITE_MATCH_LIFECYCLE_EXTRACT_GATE;
  if (raw === "false" || raw === "0" || raw === "off") return false;
  return true;
}

/**
 * When disabled, extract sync allows only confirmed-alias / confirmed-override
 * (strict alias-only auto-confirm). Default includes operational-memory paths.
 */
export function isMatchLifecycleAliasAutoConfirmEnabled(): boolean {
  const raw = import.meta.env.VITE_MATCH_LIFECYCLE_ALIAS_AUTO_CONFIRM;
  if (raw === "false" || raw === "0" || raw === "off") return false;
  return true;
}
