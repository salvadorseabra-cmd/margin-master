import type { MarginAlertSeverity } from "@/lib/margin-alert-data";

export type SeverityScoreInput = {
  baseSeverity?: MarginAlertSeverity;
  contributionPct?: number | null;
  priceIncreasePct?: number | null;
  staleDays?: number | null;
  singleSupplier?: boolean;
  recipeCount?: number;
  isVolatile?: boolean;
};

const SEVERITY_LADDER: MarginAlertSeverity[] = ["positive", "info", "watch", "high", "critical"];

function severityIndex(severity: MarginAlertSeverity): number {
  const idx = SEVERITY_LADDER.indexOf(severity);
  return idx >= 0 ? idx : 1;
}

function severityAtIndex(index: number): MarginAlertSeverity {
  return SEVERITY_LADDER[Math.min(Math.max(index, 0), SEVERITY_LADDER.length - 1)]!;
}

/** Bump severity one step; opportunities stay positive. */
export function bumpMarginAlertSeverity(severity: MarginAlertSeverity): MarginAlertSeverity {
  if (severity === "positive") return severity;
  return severityAtIndex(severityIndex(severity) + 1);
}

/**
 * Lightweight operational severity from real factors — calm scoring, no workflow engine.
 * Thresholds: >60% contribution, >10% price up, stale >45d, single supplier,
 * many recipes (≥3), volatility each bump one level from base.
 */
export function scoreMarginAlertSeverity(input: SeverityScoreInput): MarginAlertSeverity {
  let severity = input.baseSeverity ?? "info";
  if (severity === "positive") return severity;

  let bumps = 0;
  if (input.contributionPct != null && input.contributionPct > 60) bumps += 1;
  if (input.priceIncreasePct != null && input.priceIncreasePct > 10) bumps += 1;
  if (input.staleDays != null && input.staleDays > 45) bumps += 1;
  if (input.singleSupplier) bumps += 1;
  if (input.recipeCount != null && input.recipeCount >= 3) bumps += 1;
  if (input.isVolatile) bumps += 1;

  for (let i = 0; i < bumps; i += 1) {
    severity = bumpMarginAlertSeverity(severity);
  }
  return severity;
}

export function marginAlertSeverityLabel(severity: MarginAlertSeverity): string {
  switch (severity) {
    case "critical":
      return "Critical";
    case "high":
      return "High risk";
    case "watch":
      return "Watch";
    case "positive":
      return "Opportunity";
    default:
      return "Info";
  }
}
