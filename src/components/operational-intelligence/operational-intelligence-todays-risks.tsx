import { Link } from "@tanstack/react-router";
import type { StalePricingBadge, TodaysMarginRiskCard } from "@/lib/operational-intelligence-view";
import { ArrowRight } from "lucide-react";

type OperationalIntelligenceTodaysRisksProps = {
  cards: TodaysMarginRiskCard[];
  staleBadges: StalePricingBadge[];
};

const toneStyles = {
  red: {
    border: "border-destructive/30",
    bg: "bg-destructive/[0.03]",
    dot: "bg-destructive",
  },
  amber: {
    border: "border-amber-500/35",
    bg: "bg-amber-500/[0.04]",
    dot: "bg-amber-500",
  },
  green: {
    border: "border-emerald-500/30",
    bg: "bg-emerald-500/[0.04]",
    dot: "bg-emerald-600",
  },
  blue: {
    border: "border-blue-500/25",
    bg: "bg-blue-500/[0.03]",
    dot: "bg-blue-500",
  },
} as const;

export function OperationalIntelligenceTodaysRisks({
  cards,
  staleBadges,
}: OperationalIntelligenceTodaysRisksProps) {
  return (
    <section aria-labelledby="todays-margin-risks-heading">
      <div className="mb-4">
        <h2
          id="todays-margin-risks-heading"
          className="text-sm font-semibold tracking-tight text-foreground"
        >
          Today&apos;s margin risks
        </h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Ranked by estimated monthly impact — what to fix on the floor today.
        </p>
      </div>

      {cards.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No urgent margin risks from recent invoices — portfolio looks stable.
        </p>
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-1 snap-x snap-mandatory sm:grid sm:grid-cols-2 sm:overflow-visible xl:grid-cols-3">
          {cards.map((card) => {
            const style = toneStyles[card.tone];
            return (
              <article
                key={card.id}
                className={`min-w-[260px] snap-start flex-1 rounded-xl border p-4 sm:min-w-0 ${style.border} ${style.bg}`}
              >
                <div className="flex items-start gap-2.5">
                  <span
                    className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${style.dot}`}
                    aria-hidden
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                      {card.pressureSource}
                    </p>
                    {card.estimatedMonthlyImpact ? (
                      <p className="mt-1 text-sm font-semibold tabular-nums leading-snug text-foreground">
                        {card.estimatedMonthlyImpact}
                      </p>
                    ) : null}
                    <h3
                      className={`font-semibold leading-snug ${card.estimatedMonthlyImpact ? "mt-1 text-xs text-foreground/90" : "mt-1 text-sm"}`}
                    >
                      {card.event}
                    </h3>
                    <p className="mt-1 text-[11px] text-muted-foreground/90">
                      {card.recipesSummary}
                    </p>
                    <p className="mt-1.5 text-xs leading-snug text-muted-foreground line-clamp-3">
                      {card.whyItMatters}
                    </p>
                    <Link
                      to={card.target}
                      className="mt-2.5 inline-flex items-center gap-1 text-xs font-medium text-foreground/75 hover:text-foreground"
                    >
                      {card.actionLabel}
                      <ArrowRight className="h-3 w-3" />
                    </Link>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {staleBadges.length > 0 ? (
        <p className="mt-3 text-[11px] text-muted-foreground/80">
          Stale pricing (sync on next invoice):{" "}
          {staleBadges.map((b) => b.label).join(" · ")}
        </p>
      ) : null}
    </section>
  );
}
