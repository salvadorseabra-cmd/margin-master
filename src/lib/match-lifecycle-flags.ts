/**
 * Phase 1 rollout flags for Match Lifecycle V1.
 * Roll back extract gating: VITE_MATCH_LIFECYCLE_EXTRACT_GATE=false
 */
export function isMatchLifecycleExtractGateEnabled(
  env: Record<string, string | undefined> = import.meta.env,
): boolean {
  const raw = env.VITE_MATCH_LIFECYCLE_EXTRACT_GATE;
  if (raw === "false" || raw === "0" || raw === "off") return false;
  return true;
}

/**
 * When disabled, extract sync allows only confirmed-alias / confirmed-override
 * (strict alias-only auto-confirm). Default includes operational-memory paths.
 */
export function isMatchLifecycleAliasAutoConfirmEnabled(
  env: Record<string, string | undefined> = import.meta.env,
): boolean {
  const raw = env.VITE_MATCH_LIFECYCLE_ALIAS_AUTO_CONFIRM;
  if (raw === "false" || raw === "0" || raw === "off") return false;
  return true;
}

/**
 * Phase 2 shadow seed: upsert invoice_item_matches without affecting read paths.
 * Default OFF — enable with VITE_MATCH_LIFECYCLE_SHADOW_SEED=true|1|on
 */
export function isMatchLifecycleShadowSeedEnabled(
  env: Record<string, string | undefined> = import.meta.env,
): boolean {
  const raw = env.VITE_MATCH_LIFECYCLE_SHADOW_SEED;
  return raw === "true" || raw === "1" || raw === "on";
}
