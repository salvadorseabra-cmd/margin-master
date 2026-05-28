import { formatCurrency, formatPercent } from "@/lib/display-format";
import type { CuratedOperationalExposure } from "@/lib/operational-intelligence-synthesis";
import {
  firstOperationalSentence,
  operationalDecisionTierLabel,
  operationalDecisionTierTones,
  operationalMovementTones,
} from "@/components/operational-intelligence/operational-intelligence-tones";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";

type OperationalIntelligenceCostExposureProps = {
  rows: CuratedOperationalExposure[];
  onIngredientClick?: (ingredientId: string) => void;
};

const CATEGORY_LABELS = {
  meat: "Meat",
  dairy: "Dairy",
  produce: "Produce",
  sauces: "Sauces",
  bakery: "Bakery",
  beverage: "Beverage",
  other: "Other",
} as const;

export function OperationalIntelligenceCostExposure({
  rows,
  onIngredientClick,
}: OperationalIntelligenceCostExposureProps) {
  if (rows.length === 0) return null;

  return (
    <section aria-labelledby="top-exposures-heading">
      <h2
        id="top-exposures-heading"
        className="text-xs font-semibold tracking-tight text-foreground/90"
      >
        Purchasing & menu sensitivity
      </h2>

      <ul className="mt-2 divide-y divide-border/30 rounded-lg border border-border/40 bg-muted/5">
        {rows
          .filter((row) => row.decisionTier !== "background")
          .map((row) => {
          const trendUp = row.trendPct != null && row.trendPct > 0.5;
          const rowTone = row.supplierSpikeFlag || trendUp
            ? operationalMovementTones.risk
            : operationalMovementTones.info;
          const tierTone = operationalDecisionTierTones[row.decisionTier];

          return (
            <li key={row.ingredientId}>
              <button
                type="button"
                onClick={() => onIngredientClick?.(row.ingredientId)}
                disabled={!onIngredientClick}
                className={`flex w-full items-start justify-between gap-3 px-3 py-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring enabled:cursor-pointer enabled:hover:bg-muted/20 disabled:cursor-default ${tierTone.border} ${rowTone.border}`}
                aria-label={`${row.ingredientName} exposure details`}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                    <p className="truncate text-sm font-semibold">{row.ingredientName}</p>
                    <span
                      className={`rounded border px-1 py-0 text-[9px] font-semibold uppercase tracking-wide ${tierTone.badge}`}
                    >
                      {operationalDecisionTierLabel(row.decisionTier)}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      {CATEGORY_LABELS[row.category]}
                      {row.recipeCount > 0 ? ` · ${row.recipeCount} dishes` : ""}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs leading-snug text-foreground/85">
                    {firstOperationalSentence(row.operatorInsightLine)}
                  </p>
                  {row.consequence ? (
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      <span className="font-medium text-foreground/75">If ignored:</span>{" "}
                      {firstOperationalSentence(row.consequence, 88)}
                    </p>
                  ) : null}
                  <p className="mt-0.5 text-[11px] font-medium text-primary/90">
                    <span className="text-foreground/75">Do:</span>{" "}
                    {firstOperationalSentence(row.operatorAction, 72)}
                  </p>
                  {row.sensitivityLine ? (
                    <p className="mt-0.5 text-[11px] font-medium tabular-nums text-blue-950/90 dark:text-blue-200/90">
                      {row.sensitivityLine}
                    </p>
                  ) : row.monthlyModeledExposureEur >= 1 ? (
                    <p className="mt-0.5 text-[11px] tabular-nums text-muted-foreground">
                      ~{formatCurrency(row.monthlyModeledExposureEur)}/mo modeled exposure ·{" "}
                      {formatPercent(row.costSharePct)} share
                    </p>
                  ) : null}
                </div>
                <TrendSpark trendPct={row.trendPct} />
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function TrendSpark({ trendPct }: { trendPct: number | null }) {
  if (trendPct == null || Math.abs(trendPct) < 0.5) {
    return (
      <span className="flex w-11 shrink-0 items-center justify-end gap-0.5 text-[10px] text-muted-foreground">
        <Minus className="h-3 w-3" aria-hidden />
        Low volatility
      </span>
    );
  }
  const up = trendPct > 0;
  return (
    <span
      className={`flex w-11 shrink-0 items-center justify-end gap-0.5 text-[10px] font-medium tabular-nums ${up ? "text-destructive" : "text-emerald-600"}`}
    >
      {up ? <ArrowUpRight className="h-3 w-3" aria-hidden /> : <ArrowDownRight className="h-3 w-3" aria-hidden />}
      {Math.abs(Math.round(trendPct))}%
    </span>
  );
}
