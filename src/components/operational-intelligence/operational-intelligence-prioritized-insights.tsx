import { Link } from "@tanstack/react-router";
import type { PrioritizedOperationalInsight } from "@/lib/operational-intelligence-synthesis";
import {
  firstOperationalSentence,
  operationalDecisionTierLabel,
  operationalDecisionTierTones,
  operationalPriorityLabel,
  operationalPriorityTones,
} from "@/components/operational-intelligence/operational-intelligence-tones";
import { ArrowRight } from "lucide-react";

type OperationalIntelligencePrioritizedInsightsProps = {
  insights: PrioritizedOperationalInsight[];
  title?: string;
  description?: string;
  compact?: boolean;
};

export function OperationalIntelligencePrioritizedInsights({
  insights,
  title = "Operator guidance",
  description,
  compact = false,
}: OperationalIntelligencePrioritizedInsightsProps) {
  if (insights.length === 0) {
    return null;
  }

  const sorted = [...insights].sort((a, b) => {
    const tierOrder = { now: 0, monitor: 1, background: 2 };
    return tierOrder[a.decisionTier] - tierOrder[b.decisionTier];
  });

  return (
    <section aria-labelledby="prioritized-insights-heading">
      <h2
        id="prioritized-insights-heading"
        className="text-sm font-medium tracking-tight text-foreground"
      >
        {title}
      </h2>
      {!compact && description ? (
        <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
      ) : null}

      <div className={`${compact ? "mt-2" : "mt-3"} space-y-2`}>
        {sorted.map((insight) => {
          const tierStyle = operationalDecisionTierTones[insight.decisionTier];
          const priorityStyle = operationalPriorityTones[insight.priority];

          return (
            <article
              key={insight.id}
              className={`rounded-xl border px-3 py-3 ${tierStyle.surface} ${tierStyle.border}`}
            >
              <header className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span
                  className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-1.5 py-px text-[10px] font-medium uppercase tracking-wide ${tierStyle.badge}`}
                >
                  <span className={`h-1 w-1 rounded-full ${tierStyle.dot}`} aria-hidden />
                  {operationalDecisionTierLabel(insight.decisionTier)}
                </span>
                {insight.decisionTier !== "background" ? (
                  <span
                    className={`shrink-0 rounded-full border px-1.5 py-px text-[10px] font-medium ${priorityStyle.badge}`}
                  >
                    {operationalPriorityLabel(insight.priority)}
                  </span>
                ) : null}
                <span className="text-[11px] text-muted-foreground">{insight.categoryLabel}</span>
                {insight.impactLine ? (
                  <span className="ml-auto shrink-0 text-[11px] font-medium tabular-nums text-foreground/80">
                    {insight.impactLine}
                  </span>
                ) : null}
                <h3 className="min-w-0 basis-full text-sm font-semibold leading-snug text-foreground">
                  {insight.title}
                </h3>
              </header>

              <p className="mt-1.5 text-xs leading-snug text-muted-foreground">
                {firstOperationalSentence(insight.operatorInsightLine, 160)}
              </p>

              <div className="mt-2 border-t border-border/40 pt-2">
                <p className="text-sm font-medium leading-snug text-foreground">
                  {firstOperationalSentence(insight.operatorAction, 180)}
                </p>
              </div>

              {insight.consequence ? (
                <p className="mt-1.5 truncate text-[11px] leading-snug text-muted-foreground/90">
                  {firstOperationalSentence(insight.consequence, 140)}
                </p>
              ) : null}

              <Link
                to={insight.target}
                className="mt-2 inline-flex items-center gap-1 text-[11px] font-medium text-foreground/75 hover:text-foreground hover:underline"
              >
                {insight.actionLabel}
                <ArrowRight className="h-3 w-3" />
              </Link>
            </article>
          );
        })}
      </div>
    </section>
  );
}
