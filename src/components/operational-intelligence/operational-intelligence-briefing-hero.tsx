import { Badge } from "@/components/ui/badge";
import { Link } from "@tanstack/react-router";
import type { MarginBriefingCard, StalePricingBadge } from "@/lib/operational-intelligence-view";
import { ArrowRight } from "lucide-react";

type OperationalIntelligenceBriefingHeroProps = {
  cards: MarginBriefingCard[];
  staleBadges: StalePricingBadge[];
};

const toneStyles = {
  red: {
    border: "border-destructive/35",
    bg: "bg-destructive/[0.04]",
    dot: "bg-destructive",
  },
  amber: {
    border: "border-amber-500/40",
    bg: "bg-amber-500/[0.06]",
    dot: "bg-amber-500",
  },
  green: {
    border: "border-emerald-500/35",
    bg: "bg-emerald-500/[0.05]",
    dot: "bg-emerald-600",
  },
  blue: {
    border: "border-blue-500/30",
    bg: "bg-blue-500/[0.04]",
    dot: "bg-blue-500",
  },
} as const;

export function OperationalIntelligenceBriefingHero({
  cards,
  staleBadges,
}: OperationalIntelligenceBriefingHeroProps) {
  return (
    <section aria-labelledby="margin-briefing-heading">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2
            id="margin-briefing-heading"
            className="text-sm font-semibold tracking-tight text-foreground"
          >
            Today&apos;s Margin Briefing
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Top signals ranked by margin impact — deduplicated, no alert noise.
          </p>
        </div>
        {staleBadges.length > 0 ? (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Stale pricing
            </span>
            {staleBadges.map((badge) => (
              <Badge
                key={badge.ingredientId}
                variant="outline"
                className="h-5 px-1.5 text-[10px] font-normal text-muted-foreground"
              >
                {badge.label}
              </Badge>
            ))}
          </div>
        ) : null}
      </div>

      {cards.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No material margin signals today — costs look stable from recent invoices.
        </p>
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-1 snap-x snap-mandatory sm:grid sm:grid-cols-2 sm:overflow-visible lg:grid-cols-4">
          {cards.map((card) => {
            const style = toneStyles[card.tone];
            return (
              <article
                key={card.id}
                className={`min-w-[240px] snap-start flex-1 rounded-lg border p-3.5 sm:min-w-0 ${style.border} ${style.bg}`}
              >
                <div className="flex items-start gap-2">
                  <span
                    className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${style.dot}`}
                    aria-hidden
                  />
                  <div className="min-w-0 flex-1">
                    {card.impactLine ? (
                      <p className="text-sm font-semibold tabular-nums leading-snug">
                        {card.impactLine}
                      </p>
                    ) : null}
                    <h3
                      className={`font-semibold leading-snug ${card.impactLine ? "mt-1 text-xs" : "text-sm"}`}
                    >
                      {card.headline}
                    </h3>
                    <p className="mt-1 text-xs leading-snug text-muted-foreground line-clamp-2">
                      {card.detail}
                    </p>
                    <Link
                      to={card.target}
                      className="mt-2.5 inline-flex items-center gap-1 text-xs font-medium text-foreground/80 hover:text-foreground"
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
    </section>
  );
}
