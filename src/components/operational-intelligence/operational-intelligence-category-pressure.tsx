import type { CategoryPressureRow, CostCategoryGroup } from "@/lib/operational-intelligence-view";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";

type OperationalIntelligenceCategoryPressureProps = {
  rows: CategoryPressureRow[];
  onCategoryClick?: (group: CostCategoryGroup) => void;
  compact?: boolean;
};

export function OperationalIntelligenceCategoryPressure({
  rows,
  onCategoryClick,
  compact = false,
}: OperationalIntelligenceCategoryPressureProps) {
  const displayRows = compact
    ? rows.filter((row) => row.trend === "up" || (row.inflationVs3MoPct ?? 0) >= 3).slice(0, 4)
    : rows;

  if (displayRows.length === 0) return null;

  return (
    <section aria-labelledby="category-pressure-heading">
      <h2
        id="category-pressure-heading"
        className={
          compact
            ? "text-xs font-semibold tracking-tight text-foreground/90"
            : "text-sm font-semibold tracking-tight text-foreground"
        }
      >
        Category pressure
      </h2>
      {!compact ? (
        <p className="mt-0.5 text-xs text-muted-foreground">
          Where invoice inflation concentrates — operational read, not cost share alone.
        </p>
      ) : null}

      <ul className={`${compact ? "mt-2" : "mt-4"} grid gap-1.5 sm:grid-cols-2`}>
        {displayRows.map((row) => (
          <li key={row.group}>
            <button
              type="button"
              onClick={() => onCategoryClick?.(row.group)}
              disabled={!onCategoryClick}
              className={`w-full rounded-lg border border-border/40 bg-muted/10 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring enabled:cursor-pointer enabled:hover:bg-muted/20 disabled:cursor-default ${compact ? "px-3 py-2" : "px-3.5 py-3"}`}
            >
              <div className="flex items-start justify-between gap-2">
                <span className={compact ? "text-xs font-semibold" : "text-sm font-semibold"}>
                  {row.label}
                </span>
                <CategoryTrendIcon trend={row.trend} />
              </div>
              <p className="mt-0.5 text-xs font-medium tabular-nums text-foreground">
                {row.pressureLine}
                {row.inflationVs3MoPct != null && Math.abs(row.inflationVs3MoPct) >= 3
                  ? ` · ${row.inflationVs3MoPct > 0 ? "+" : ""}${Math.round(row.inflationVs3MoPct)}% vs 3mo`
                  : null}
              </p>
              {!compact ? (
                <p className="mt-0.5 text-xs leading-snug text-muted-foreground">
                  {row.operationalLine}
                </p>
              ) : null}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function CategoryTrendIcon({ trend }: { trend: CategoryPressureRow["trend"] }) {
  if (trend === "up") {
    return (
      <span className="flex items-center gap-0.5 text-[11px] font-medium text-destructive">
        <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
        Up
      </span>
    );
  }
  if (trend === "down") {
    return (
      <span className="flex items-center gap-0.5 text-[11px] font-medium text-emerald-600">
        <ArrowDownRight className="h-3.5 w-3.5" aria-hidden />
        Down
      </span>
    );
  }
  return (
    <span className="flex items-center gap-0.5 text-[11px] text-muted-foreground">
      <Minus className="h-3.5 w-3.5" aria-hidden />
      Stable
    </span>
  );
}
