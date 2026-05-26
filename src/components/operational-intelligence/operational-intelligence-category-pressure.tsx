import type { CategoryPressureRow, CostCategoryGroup } from "@/lib/operational-intelligence-view";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";

type OperationalIntelligenceCategoryPressureProps = {
  rows: CategoryPressureRow[];
  onCategoryClick?: (group: CostCategoryGroup) => void;
};

export function OperationalIntelligenceCategoryPressure({
  rows,
  onCategoryClick,
}: OperationalIntelligenceCategoryPressureProps) {
  if (rows.length === 0) return null;

  return (
    <section aria-labelledby="category-pressure-heading">
      <h2
        id="category-pressure-heading"
        className="text-sm font-semibold tracking-tight text-foreground"
      >
        Category pressure
      </h2>
      <p className="mt-0.5 text-xs text-muted-foreground">
        Where invoice inflation concentrates — operational read, not cost share alone.
      </p>

      <ul className="mt-4 grid gap-2 sm:grid-cols-2">
        {rows.map((row) => (
          <li key={row.group}>
            <button
              type="button"
              onClick={() => onCategoryClick?.(row.group)}
              disabled={!onCategoryClick}
              className="w-full rounded-xl border border-border/50 bg-muted/15 px-3.5 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring enabled:cursor-pointer enabled:hover:bg-muted/25 disabled:cursor-default"
            >
              <div className="flex items-start justify-between gap-2">
                <span className="text-sm font-semibold">{row.label}</span>
                <CategoryTrendIcon trend={row.trend} />
              </div>
              <p className="mt-1 text-xs font-medium tabular-nums text-foreground">
                {row.pressureLine}
                {row.inflationVs3MoPct != null && Math.abs(row.inflationVs3MoPct) >= 3
                  ? ` · ${row.inflationVs3MoPct > 0 ? "+" : ""}${Math.round(row.inflationVs3MoPct)}% vs 3mo`
                  : null}
              </p>
              <p className="mt-1 text-xs leading-snug text-muted-foreground">
                {row.operationalLine}
              </p>
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
      Flat
    </span>
  );
}
