import type {
  MonthlyMarginPressureSummary,
  OperationalHeroNarrative,
} from "@/lib/operational-intelligence-synthesis";

type OperationalIntelligenceMarginPressureProps = {
  summary: MonthlyMarginPressureSummary;
  hero: OperationalHeroNarrative;
};

export function OperationalIntelligenceMarginPressure({
  summary,
  hero,
}: OperationalIntelligenceMarginPressureProps) {
  const rows = [
    { label: "Estimated margin pressure", value: summary.estimatedMarginPressureLine },
    { label: "Biggest inflation driver", value: summary.biggestInflationDriver ?? "None flagged" },
    { label: "Most affected category", value: summary.mostAffectedCategory ?? "Balanced mix" },
    { label: "Supplier volatility", value: summary.supplierVolatilityLabel },
    {
      label: "Recipes below target margin",
      value:
        summary.recipesBelowTarget > 0
          ? `${summary.recipesBelowTarget} recipe${summary.recipesBelowTarget === 1 ? "" : "s"}`
          : "None",
    },
  ] as const;

  return (
    <section
      aria-labelledby="margin-pressure-heading"
      className="rounded-xl border border-border/60 bg-card/60 px-4 py-4 shadow-sm"
    >
      <h2 id="margin-pressure-heading" className="text-sm font-semibold tracking-tight text-foreground">
        What matters operationally right now
      </h2>
      <h3 className="mt-1 text-base font-semibold leading-tight text-foreground">{hero.title}</h3>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{hero.narrative}</p>
      <p className="mt-1 text-xs font-medium text-foreground/85">{hero.impactLine}</p>
      {hero.actionCluster.length > 0 ? (
        <ul className="mt-2 space-y-1">
          {hero.actionCluster.map((action) => (
            <li key={action} className="text-xs leading-relaxed text-foreground/90">
              {action}
            </li>
          ))}
        </ul>
      ) : null}

      <dl className="mt-4 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
        {rows.map((row) => (
          <div key={row.label} className="min-w-0 rounded-lg border border-border/50 bg-muted/15 px-3 py-2">
            <dt className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              {row.label}
            </dt>
            <dd className="mt-0.5 text-sm font-medium leading-snug text-foreground">{row.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
