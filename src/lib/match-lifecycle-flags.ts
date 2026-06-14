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

/**
 * Phase 3 dual-write: persist lifecycle transitions to invoice_item_matches after
 * existing alias/cost flows succeed. Default OFF — enable with
 * VITE_MATCH_LIFECYCLE_DUAL_WRITE=true|1|on
 */
export function isMatchLifecycleDualWriteEnabled(
  env: Record<string, string | undefined> = import.meta.env,
): boolean {
  const raw = env.VITE_MATCH_LIFECYCLE_DUAL_WRITE;
  return raw === "true" || raw === "1" || raw === "on";
}

/**
 * Phase 4A dual-read validation: log virtual vs persisted drift in dev without read cutover.
 * Default OFF — enable with VITE_MATCH_LIFECYCLE_DUAL_READ_LOG=true|1|on
 */
export function isMatchLifecycleDualReadLogEnabled(
  env: Record<string, string | undefined> = import.meta.env,
): boolean {
  const raw = env.VITE_MATCH_LIFECYCLE_DUAL_READ_LOG;
  return raw === "true" || raw === "1" || raw === "on";
}

function readLifecycleFlag(
  name: string,
  env: Record<string, string | undefined>,
): string | undefined {
  const fromEnv = env[name];
  if (fromEnv !== undefined) return fromEnv;
  if (typeof process !== "undefined") {
    return process.env[name];
  }
  return undefined;
}

/**
 * Phase 4B read cutover: prefer invoice_item_matches over virtual matcher on read paths.
 * Default OFF — enable with VITE_MATCH_LIFECYCLE_READ_CUTOVER=true|1|on
 */
export function isMatchLifecycleReadCutoverEnabled(
  env: Record<string, string | undefined> = import.meta.env,
): boolean {
  const raw = readLifecycleFlag("VITE_MATCH_LIFECYCLE_READ_CUTOVER", env);
  return raw === "true" || raw === "1" || raw === "on";
}

/**
 * Phase 5 subtractive pricing: delete history + reconcile on unmatch and reassign-away.
 * Default ON — disable with VITE_MATCH_LIFECYCLE_SUBTRACTIVE_PRICING=false|0|off
 */
export function isMatchLifecycleSubtractivePricingEnabled(
  env: Record<string, string | undefined> = import.meta.env,
): boolean {
  const raw = readLifecycleFlag("VITE_MATCH_LIFECYCLE_SUBTRACTIVE_PRICING", env);
  if (raw === "false" || raw === "0" || raw === "off") return false;
  return true;
}

/**
 * Phase 5B reassign subtractive: delete history + reconcile on A→B before forward writes to B.
 * Default ON — disable with VITE_MATCH_LIFECYCLE_REASSIGN_SUBTRACTIVE=false|0|off
 * Requires {@link isMatchLifecycleSubtractivePricingEnabled} for the underlying delete/reconcile APIs.
 */
export function isMatchLifecycleReassignSubtractiveEnabled(
  env: Record<string, string | undefined> = import.meta.env,
): boolean {
  const raw = readLifecycleFlag("VITE_MATCH_LIFECYCLE_REASSIGN_SUBTRACTIVE", env);
  if (raw === "false" || raw === "0" || raw === "off") return false;
  return true;
}
