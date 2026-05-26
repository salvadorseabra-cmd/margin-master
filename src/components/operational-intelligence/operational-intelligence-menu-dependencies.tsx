import { Card } from "@/components/AppShell";
import { formatPercent } from "@/lib/display-format";
import type {
  CostCategorySlice,
  MenuDependencyRow,
} from "@/lib/operational-intelligence-view";
import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";

type OperationalIntelligenceMenuDependenciesProps = {
  rows: MenuDependencyRow[];
  slices: CostCategorySlice[];
};

export function OperationalIntelligenceMenuDependencies({
  rows,
  slices,
}: OperationalIntelligenceMenuDependenciesProps) {
  if (rows.length === 0 && slices.length === 0) return null;

  return (
    <section aria-labelledby="menu-dependencies-heading">
      <div className="mb-3">
        <h2
          id="menu-dependencies-heading"
          className="text-sm font-semibold tracking-tight text-foreground"
        >
          Menu dependencies
        </h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Where margin is coupled — shared ingredients, category weight, and single-line levers.
        </p>
      </div>

      <Card className="overflow-hidden p-0">
        {slices.length > 0 ? (
          <div className="border-b border-border/60 p-4">
            <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground mb-3">
              Cost by category (modeled menu)
            </div>
            <ul className="space-y-2.5">
              {slices.map((slice) => (
                <li key={slice.group}>
                  <div className="mb-1 flex items-center justify-between gap-2 text-xs">
                    <span className="flex items-center gap-1.5 font-medium">
                      <span
                        className="h-2.5 w-2.5 rounded-sm shrink-0"
                        style={{ background: slice.color }}
                      />
                      {slice.label}
                    </span>
                    <span className="tabular-nums font-semibold">
                      {formatPercent(slice.sharePct)}
                    </span>
                  </div>
                  <div className="h-3 w-full overflow-hidden rounded-full bg-muted/50">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${Math.min(100, Math.max(4, slice.sharePct))}%`,
                        background: slice.color,
                      }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {rows.length > 0 ? (
          <ul className="divide-y divide-border/50">
            {rows.map((row) => (
              <li key={row.id} className="px-4 py-3 hover:bg-muted/10">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <KindBadge kind={row.kind} />
                      {row.exposurePct != null ? (
                        <span className="text-[10px] tabular-nums text-muted-foreground">
                          {formatPercent(row.exposurePct)}
                        </span>
                      ) : null}
                    </div>
                    <h3 className="mt-1 text-sm font-medium leading-snug">{row.title}</h3>
                    <p className="mt-0.5 text-xs text-muted-foreground">{row.detail}</p>
                    {row.recipeNames.length > 0 ? (
                      <p className="mt-1.5 text-xs text-foreground/80">
                        {row.recipeNames.join(" · ")}
                      </p>
                    ) : null}
                  </div>
                  <Link
                    to={row.target}
                    className="inline-flex shrink-0 items-center gap-1 text-xs font-medium hover:text-foreground"
                  >
                    {row.actionLabel}
                    <ArrowRight className="h-3 w-3" />
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        ) : null}
      </Card>
    </section>
  );
}

function KindBadge({ kind }: { kind: MenuDependencyRow["kind"] }) {
  const label =
    kind === "shared_ingredient"
      ? "Shared line"
      : kind === "category_concentration"
        ? "Category"
        : "Margin lever";
  return (
    <span className="rounded bg-muted/60 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
      {label}
    </span>
  );
}
