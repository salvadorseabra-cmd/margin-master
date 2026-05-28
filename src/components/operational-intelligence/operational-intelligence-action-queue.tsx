import { Link } from "@tanstack/react-router";
import type { OperationalActionQueueCard } from "@/lib/operational-intelligence-synthesis";
import {
  firstOperationalSentence,
  operationalDecisionTierLabel,
  operationalDecisionTierTones,
  operationalPriorityLabel,
  operationalPriorityTones,
} from "@/components/operational-intelligence/operational-intelligence-tones";
import { ArrowRight } from "lucide-react";

type OperationalIntelligenceActionQueueProps = {
  cards: OperationalActionQueueCard[];
};

export function OperationalIntelligenceActionQueue({ cards }: OperationalIntelligenceActionQueueProps) {
  if (cards.length === 0) {
    return null;
  }

  const sorted = [...cards].sort((a, b) => {
    const tierOrder = { now: 0, monitor: 1, background: 2 };
    return tierOrder[a.decisionTier] - tierOrder[b.decisionTier];
  });

  return (
    <div className="space-y-2">
      {sorted.map((card) => {
        const tierStyle = operationalDecisionTierTones[card.decisionTier];
        const priorityStyle = operationalPriorityTones[card.priority];

        return (
          <article
            key={card.id}
            className={`rounded-xl border px-3 py-3 ${tierStyle.surface} ${tierStyle.border}`}
          >
            <header className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span
                className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-1.5 py-px text-[10px] font-medium uppercase tracking-wide ${tierStyle.badge}`}
              >
                <span className={`h-1 w-1 rounded-full ${tierStyle.dot}`} aria-hidden />
                {operationalDecisionTierLabel(card.decisionTier)}
              </span>
              <span
                className={`shrink-0 rounded-full border px-1.5 py-px text-[10px] font-medium ${priorityStyle.badge}`}
              >
                {operationalPriorityLabel(card.priority)}
              </span>
              <span className="text-[11px] text-muted-foreground">{card.categoryLabel}</span>
              {card.estimatedImpact ? (
                <span className="ml-auto shrink-0 text-[11px] font-medium tabular-nums text-foreground/80">
                  {card.estimatedImpact}
                </span>
              ) : null}
              <h3 className="min-w-0 basis-full text-sm font-semibold leading-snug text-foreground">
                {card.title}
                {card.affectedScope ? (
                  <span className="font-normal text-muted-foreground"> · {card.affectedScope}</span>
                ) : null}
              </h3>
            </header>

            <p className="mt-1.5 text-xs leading-snug text-muted-foreground">
              {firstOperationalSentence(card.whyItMatters, 160)}
            </p>

            <div className="mt-2 border-t border-border/40 pt-2">
              <p className="text-sm font-medium leading-snug text-foreground">
                {firstOperationalSentence(card.whatToDo, 180)}
              </p>
            </div>

            {card.ifIgnored ? (
              <p className="mt-1.5 truncate text-[11px] leading-snug text-muted-foreground/90">
                {firstOperationalSentence(card.ifIgnored, 140)}
              </p>
            ) : null}

            <Link
              to={card.target}
              className="mt-2 inline-flex items-center gap-1 text-[11px] font-medium text-foreground/75 hover:text-foreground hover:underline"
            >
              {card.actionLabel}
              <ArrowRight className="h-3 w-3" />
            </Link>
          </article>
        );
      })}
    </div>
  );
}
