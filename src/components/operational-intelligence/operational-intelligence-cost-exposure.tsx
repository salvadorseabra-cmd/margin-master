import { formatCurrency, formatPercent } from "@/lib/display-format";
import type { OperationalExposureRow } from "@/lib/operational-intelligence-view";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";

type OperationalIntelligenceCostExposureProps = {
  rows: OperationalExposureRow[];
  onIngredientClick?: (ingredientId: string) => void;
};

export function OperationalIntelligenceCostExposure({
  rows,
  onIngredientClick,
}: OperationalIntelligenceCostExposureProps) {
  if (rows.length === 0) return null;

  const CATEGORY_LABELS = {
    meat: "Meat",
    dairy: "Dairy",
    produce: "Produce",
    sauces: "Sauces",
    bakery: "Bakery",
    beverage: "Beverage",
    other: "Other",
  } as const;

  return (
    <section aria-labelledby="top-exposures-heading">
      <div className="mb-4">
        <h2
          id="top-exposures-heading"
          className="text-sm font-semibold tracking-tight text-foreground"
        >
          Top operational exposures
        </h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Ranked by exposure, price moves, recipe spread, and supplier spikes — not recipe count alone.
        </p>
      </div>

      <ul className="divide-y divide-border/40 rounded-xl border border-border/50 bg-muted/10">
        {rows.map((row) => (
          <li key={row.ingredientId}>
            <button
              type="button"
              onClick={() => onIngredientClick?.(row.ingredientId)}
              disabled={!onIngredientClick}
              className="flex w-full items-center justify-between gap-3 rounded-lg px-3.5 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring enabled:cursor-pointer enabled:hover:bg-muted/30 disabled:cursor-default"
              aria-label={`${row.ingredientName} exposure details`}
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{row.ingredientName}</p>
                <p className="text-[11px] text-muted-foreground/80">
                  {CATEGORY_LABELS[row.category]}
                  {row.monthlyModeledExposureEur >= 1 ? (
                    <span> · ~{formatCurrency(row.monthlyModeledExposureEur)}/mo exposure</span>
                  ) : (
                    <span> · {formatPercent(row.costSharePct)} menu cost share</span>
                  )}
                  {row.recipeCount > 0 ? (
                    <span>
                      {" "}
                      · {row.recipeCount} recipe{row.recipeCount === 1 ? "" : "s"}
                    </span>
                  ) : null}
                  {row.supplierSpikeFlag ? " · supplier spike" : null}
                </p>
                {row.sensitivityLine ? (
                  <p className="mt-0.5 text-[11px] text-muted-foreground">{row.sensitivityLine}</p>
                ) : null}
                {row.supplierDeltaLine ? (
                  <p className="mt-0.5 text-[11px] text-muted-foreground">{row.supplierDeltaLine}</p>
                ) : null}
              </div>
              <TrendSpark trendPct={row.trendPct} />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function TrendSpark({ trendPct }: { trendPct: number | null }) {
  if (trendPct == null || Math.abs(trendPct) < 0.5) {
    return (
      <span className="flex w-11 items-center justify-end gap-0.5 text-[10px] text-muted-foreground">
        <Minus className="h-3 w-3" aria-hidden />
        flat
      </span>
    );
  }
  const up = trendPct > 0;
  return (
    <span
      className={`flex w-11 items-center justify-end gap-0.5 text-[10px] font-medium tabular-nums ${up ? "text-destructive" : "text-emerald-600"}`}
    >
      {up ? <ArrowUpRight className="h-3 w-3" aria-hidden /> : <ArrowDownRight className="h-3 w-3" aria-hidden />}
      {Math.abs(Math.round(trendPct))}%
    </span>
  );
}
