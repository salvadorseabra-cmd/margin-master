import { Link } from "@tanstack/react-router";
import type { GroupedRecoveryOpportunity } from "@/lib/operational-intelligence-synthesis";
import {
  operationalDecisionTierLabel,
  operationalDecisionTierTones,
  operationalMovementTones,
} from "@/components/operational-intelligence/operational-intelligence-tones";
import { ArrowRight } from "lucide-react";

type OperationalIntelligenceRecoveryProps = {
  opportunities: GroupedRecoveryOpportunity[];
};

function dedupeRecoveryByLever(
  opportunities: GroupedRecoveryOpportunity[],
): GroupedRecoveryOpportunity[] {
  const byLever = new Map<string, GroupedRecoveryOpportunity>();
  for (const card of opportunities) {
    const existing = byLever.get(card.lever);
    if (
      !existing ||
      card.estimatedMonthlyRecoveryEur > existing.estimatedMonthlyRecoveryEur
    ) {
      byLever.set(card.lever, card);
    }
  }
  return [...byLever.values()].sort(
    (a, b) => b.estimatedMonthlyRecoveryEur - a.estimatedMonthlyRecoveryEur,
  );
}

export function OperationalIntelligenceRecovery({
  opportunities,
}: OperationalIntelligenceRecoveryProps) {
  const grouped = dedupeRecoveryByLever(
    opportunities.filter(
      (card) => !/^Trim\s+/i.test(card.title) && card.decisionTier !== "background",
    ),
  );
  if (grouped.length === 0) return null;

  return (
    <section aria-labelledby="recovery-opportunities-heading">
      <h2
        id="recovery-opportunities-heading"
        className="text-sm font-semibold tracking-tight text-foreground"
      >
        Recovery signals
      </h2>

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {grouped.map((card) => {
          const tierAccent = operationalDecisionTierTones[card.decisionTier];
          return (
            <article
              key={card.id}
              className={`rounded-lg border px-3 py-2.5 ${operationalMovementTones.recovery.surface} ${tierAccent.border} ${tierAccent.emphasis}`}
            >
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`rounded-md border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${tierAccent.badge}`}
                >
                  {operationalDecisionTierLabel(card.decisionTier)}
                </span>
                <p className={`text-[10px] font-semibold uppercase tracking-wide ${operationalMovementTones.recovery.label}`}>
                  {card.leverLabel}
                </p>
              </div>
              {card.savingsLine ? (
                <p className="mt-0.5 text-sm font-semibold tabular-nums text-emerald-800 dark:text-emerald-200">
                  {card.savingsLine}
                </p>
              ) : null}
              <h3 className="mt-0.5 text-sm font-semibold leading-snug text-foreground">
                {card.title}
              </h3>
              {card.affectedRecipes.length > 0 ? (
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  {card.affectedRecipes.slice(0, 3).join(" · ")}
                  {card.affectedRecipes.length > 3
                    ? ` +${card.affectedRecipes.length - 3}`
                    : ""}
                </p>
              ) : null}
              {card.consequence ? (
                <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
                  <span className="font-medium text-foreground/75">If ignored:</span> {card.consequence}
                </p>
              ) : null}
              <ul className="mt-1.5 space-y-0.5 text-xs text-foreground/90">
                {card.operatorActions.slice(0, 2).map((action) => (
                  <li key={action} className="flex gap-1.5 leading-snug">
                    <span className="text-emerald-600" aria-hidden>
                      →
                    </span>
                    <span>{action}</span>
                  </li>
                ))}
              </ul>
              <Link
                to={card.target}
                className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
              >
                {card.actionLabel}
                <ArrowRight className="h-3 w-3" />
              </Link>
            </article>
          );
        })}
      </div>
    </section>
  );
}
