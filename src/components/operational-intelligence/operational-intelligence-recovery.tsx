import { Link } from "@tanstack/react-router";
import type { RecoveryOpportunityCard } from "@/lib/operational-intelligence-view";
import { ArrowRight } from "lucide-react";

type OperationalIntelligenceRecoveryProps = {
  opportunities: RecoveryOpportunityCard[];
};

export function OperationalIntelligenceRecovery({
  opportunities,
}: OperationalIntelligenceRecoveryProps) {
  if (opportunities.length === 0) return null;

  return (
    <section aria-labelledby="recovery-opportunities-heading">
      <h2
        id="recovery-opportunities-heading"
        className="text-sm font-semibold tracking-tight text-foreground"
      >
        Recovery opportunities
      </h2>
      <p className="mt-0.5 text-xs text-muted-foreground">
        Savings from easing costs, supplier switches, portion trims, or selective menu repricing.
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {opportunities.map((card) => (
          <article
            key={card.id}
            className="rounded-xl border border-teal-500/20 border-l-[3px] border-l-teal-500/50 bg-teal-500/[0.03] px-3.5 py-3"
          >
            {card.savingsLine ? (
              <p className="text-sm font-semibold tabular-nums text-foreground">
                {card.savingsLine}
              </p>
            ) : null}
            <h3
              className={`font-semibold leading-snug text-foreground ${card.savingsLine ? "mt-1 text-xs" : "text-sm"}`}
            >
              {card.title}
            </h3>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{card.why}</p>
            <p className="mt-1.5 text-sm text-foreground">{card.action}</p>
            <Link
              to={card.target}
              className="mt-2.5 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
            >
              {card.actionLabel}
              <ArrowRight className="h-3 w-3" />
            </Link>
          </article>
        ))}
      </div>
    </section>
  );
}
