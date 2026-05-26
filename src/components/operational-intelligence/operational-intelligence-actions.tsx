import { Badge } from "@/components/ui/badge";
import { Link } from "@tanstack/react-router";
import type {
  OperationalRecommendationCategory,
  RecommendedActionCard,
} from "@/lib/operational-intelligence-view";
import { ArrowRight } from "lucide-react";

type OperationalIntelligenceActionsProps = {
  actions: RecommendedActionCard[];
};

const urgencyStyles: Record<
  RecommendedActionCard["urgency"],
  { badge: string; accent: string }
> = {
  now: {
    badge: "bg-destructive/10 text-destructive border-destructive/20",
    accent: "border-l-destructive/50",
  },
  this_week: {
    badge: "bg-amber-500/10 text-amber-900 border-amber-500/25",
    accent: "border-l-amber-500/50",
  },
  monitor: {
    badge: "bg-muted text-muted-foreground border-border",
    accent: "border-l-border",
  },
};

const categoryAccent: Record<OperationalRecommendationCategory, string> = {
  supplier_actions: "border-l-rose-500/60",
  margin_deterioration: "border-l-orange-500/60",
  concentration_risk: "border-l-violet-500/60",
  portion_actions: "border-l-emerald-500/60",
  price_actions: "border-l-sky-500/60",
  stability_signals: "border-l-emerald-500/40",
  recovery_opportunities: "border-l-teal-500/50",
};

const categoryBadge: Record<OperationalRecommendationCategory, string> = {
  supplier_actions: "bg-rose-500/10 text-rose-900 border-rose-500/20",
  margin_deterioration: "bg-orange-500/10 text-orange-950 border-orange-500/25",
  concentration_risk: "bg-violet-500/10 text-violet-950 border-violet-500/25",
  portion_actions: "bg-emerald-500/10 text-emerald-950 border-emerald-500/25",
  price_actions: "bg-sky-500/10 text-sky-950 border-sky-500/25",
  stability_signals: "bg-emerald-500/8 text-emerald-800 border-emerald-500/20",
  recovery_opportunities: "bg-teal-500/10 text-teal-950 border-teal-500/25",
};

export function OperationalIntelligenceActions({ actions }: OperationalIntelligenceActionsProps) {
  if (actions.length === 0) return null;

  return (
    <section aria-labelledby="recommended-actions-heading">
      <h2
        id="recommended-actions-heading"
        className="text-sm font-semibold tracking-tight text-foreground"
      >
        Recommended actions
      </h2>
      <p className="mt-0.5 text-xs text-muted-foreground">
        Margin-protection steps ranked by estimated monthly impact.
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {actions.map((action) => {
          const urgency = urgencyStyles[action.urgency];
          const accent = categoryAccent[action.category] ?? urgency.accent;
          return (
            <article
              key={action.id}
              className={`rounded-xl border border-border/60 border-l-[3px] bg-card/80 px-3.5 py-3 shadow-sm ${accent}`}
            >
              <div className="flex flex-wrap items-center gap-1.5">
                <Badge
                  variant="outline"
                  className={`text-[10px] font-semibold uppercase tracking-wide ${categoryBadge[action.category]}`}
                >
                  {action.categoryLabel}
                </Badge>
                <Badge variant="outline" className={`text-[10px] font-medium ${urgency.badge}`}>
                  {action.urgencyLabel}
                </Badge>
                {action.affectedRecipes != null && action.affectedRecipes > 0 ? (
                  <span className="ml-auto text-[10px] tabular-nums text-muted-foreground">
                    {action.affectedRecipes} recipe{action.affectedRecipes === 1 ? "" : "s"}
                  </span>
                ) : null}
              </div>
              {action.estimatedImpact ? (
                <p className="mt-2 text-sm font-semibold tabular-nums text-foreground">
                  {action.estimatedImpact.split(" · ")[0]}
                </p>
              ) : null}
              <h3
                className={`font-semibold leading-snug text-foreground ${action.estimatedImpact ? "mt-1 text-xs" : "mt-2 text-sm"}`}
              >
                {action.title}
              </h3>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{action.why}</p>
              <p className="mt-1.5 text-sm leading-snug text-foreground">{action.action}</p>
              {action.estimatedImpact?.includes(" · ") ? (
                <p className="mt-1 text-[11px] tabular-nums text-muted-foreground">
                  {action.estimatedImpact.split(" · ").slice(1).join(" · ")}
                </p>
              ) : null}
              <Link
                to={action.target}
                className="mt-2.5 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
              >
                {action.actionLabel}
                <ArrowRight className="h-3 w-3" />
              </Link>
            </article>
          );
        })}
      </div>
    </section>
  );
}
