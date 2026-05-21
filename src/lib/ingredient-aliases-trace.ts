/**
 * Runtime tracing for ingredient_aliases insert / upsert paths.
 * Enable in prod: window.__MARGINLY_ALIAS_TRACE__ = true
 * On by default in Vite DEV.
 */

declare global {
  interface Window {
    __MARGINLY_ALIAS_TRACE__?: boolean;
    /** Log every alias trace line (not only compare rows). */
    __MARGINLY_ALIAS_TRACE_ALL__?: boolean;
  }
}

export const INGREDIENT_ALIASES_TRACE_PREFIX = "[ingredient_aliases_trace]";

/** Invoice lines used to diff ANGUS PTY (works) vs CHK BREADED (broken). */
const TRACE_COMPARE_ALIASES = [
  "CHK BREADED",
  "ANGUS",
  "ANG PTY",
  "HMB 180",
] as const;

export type AliasTraceCompareBucket = "CHK_BREADED" | "ANGUS_PTY" | "HMB_180" | "OTHER";

export function isIngredientAliasesTraceEnabled(): boolean {
  if (typeof window !== "undefined" && window.__MARGINLY_ALIAS_TRACE__ === true) {
    return true;
  }
  return import.meta.env.DEV;
}

function traceAllRows(): boolean {
  return typeof window !== "undefined" && window.__MARGINLY_ALIAS_TRACE_ALL__ === true;
}

export function getAliasTraceCompareBucket(
  name: string | null | undefined,
): AliasTraceCompareBucket | null {
  if (!name?.trim()) return null;
  const upper = name.trim().toUpperCase();
  if (upper.includes("CHK BREADED") || upper.includes("BRD CHK")) return "CHK_BREADED";
  if (upper.includes("ANGUS") || upper.includes("ANG PTY")) return "ANGUS_PTY";
  if (upper.includes("HMB 180") || upper === "HMB 180") return "HMB_180";
  return "OTHER";
}

function shouldTraceName(name: string | null | undefined): boolean {
  if (traceAllRows()) return true;
  if (!name?.trim()) return false;
  const upper = name.trim().toUpperCase();
  for (const sample of TRACE_COMPARE_ALIASES) {
    if (upper.includes(sample)) return true;
  }
  return false;
}

function shouldEmit(details?: Record<string, unknown>): boolean {
  if (!isIngredientAliasesTraceEnabled()) return false;
  if (traceAllRows()) return true;
  const names = [
    details?.itemName,
    details?.aliasName,
    details?.invoiceAlias,
    details?.rawName,
    details?.canonicalName,
  ];
  for (const n of names) {
    if (typeof n === "string" && shouldTraceName(n)) return true;
  }
  return false;
}

export function traceIngredientAliases(
  stage: string,
  details?: Record<string, unknown>,
): void {
  if (!shouldEmit(details)) return;

  const itemName =
    (details?.itemName as string | undefined) ??
    (details?.aliasName as string | undefined) ??
    (details?.invoiceAlias as string | undefined);
  const compareBucket = getAliasTraceCompareBucket(
    typeof itemName === "string" ? itemName : null,
  );

  console.info(INGREDIENT_ALIASES_TRACE_PREFIX, {
    stage,
    compareBucket,
    ...details,
  });
}

export function traceIngredientAliasesValidationRejection(
  functionName: string,
  branch: string,
  details?: Record<string, unknown>,
): void {
  traceIngredientAliases("validation-rejected", {
    function: functionName,
    branch,
    ...details,
  });
}

export function traceIngredientAliasesNormalizationRejection(
  functionName: string,
  branch: string,
  details?: Record<string, unknown>,
): void {
  traceIngredientAliases("normalization-rejected", {
    function: functionName,
    branch,
    ...details,
  });
}

export function traceIngredientAliasesShorthandRejection(
  functionName: string,
  branch: string,
  details?: Record<string, unknown>,
): void {
  traceIngredientAliases("shorthand-rejected", {
    function: functionName,
    branch,
    ...details,
  });
}

export function traceIngredientAliasesCatch(
  functionName: string,
  err: unknown,
  details?: Record<string, unknown>,
): void {
  traceIngredientAliases("catch", {
    function: functionName,
    error: err instanceof Error ? err.message : String(err),
    stack: err instanceof Error ? err.stack : undefined,
    ...details,
  });
}

export function traceIngredientAliasesInsertBefore(
  details: Record<string, unknown>,
): void {
  traceIngredientAliases("insert-before", details);
}

export function traceIngredientAliasesInsertAfter(
  details: Record<string, unknown>,
): void {
  traceIngredientAliases("insert-after", details);
}

export function traceIngredientAliasesInsertError(
  details: Record<string, unknown>,
): void {
  traceIngredientAliases("insert-error", details);
}
