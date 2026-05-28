import { formatCurrency } from "@/lib/display-format";
import type {
  OperationalSynthesisGroups,
  OperationalWindow,
  OperationalWindowKey,
  RecipeMarginMovementInsight,
  RecipeMarginTrendStatus,
} from "@/lib/operational-intelligence-synthesis";
import { MIN_RECIPE_MARGIN_MOVEMENT_EUR } from "@/lib/operational-intelligence-synthesis";
import {
  operationalDecisionTierLabel,
  operationalDecisionTierTones,
  operationalMovementTones,
} from "@/components/operational-intelligence/operational-intelligence-tones";

type OperationalIntelligenceRecipeMarginMovementsProps = {
  recipeMarginMovements: OperationalSynthesisGroups["recipeMarginMovements"];
  operationalWindows: OperationalWindow[];
};

const WINDOW_GROUPS: OperationalWindowKey[] = ["last_30_days", "last_3_months", "last_6_months"];

const TREND_LABELS: Record<RecipeMarginTrendStatus, string> = {
  worsening: "Worsening",
  stabilizing: "Stabilizing",
  recovering: "Recovering",
  improving: "Improving",
};

function trendTone(status: RecipeMarginTrendStatus): keyof typeof operationalMovementTones {
  if (status === "worsening") return "risk";
  if (status === "stabilizing") return "watch";
  return "recovery";
}

function isMeaningfulMovement(entry: RecipeMarginMovementInsight): boolean {
  if (entry.trendStatus === "improving" && entry.estimatedMonthlyImpactEur < MIN_RECIPE_MARGIN_MOVEMENT_EUR) {
    return entry.normalizedPriority === "critical" || entry.normalizedPriority === "warning";
  }
  if (entry.movement === "worsening") {
    return (
      entry.estimatedMonthlyImpactEur >= MIN_RECIPE_MARGIN_MOVEMENT_EUR ||
      entry.normalizedPriority === "critical" ||
      entry.normalizedPriority === "warning"
    );
  }
  return entry.trendStatus === "recovering" || entry.trendStatus === "improving";
}

function groupByWindow(
  entries: RecipeMarginMovementInsight[],
  windowKey: OperationalWindowKey,
): RecipeMarginMovementInsight[] {
  return entries.filter((entry) => entry.window === windowKey && isMeaningfulMovement(entry));
}

function MovementList({
  title,
  entries,
}: {
  title: string;
  entries: RecipeMarginMovementInsight[];
}) {
  if (entries.length === 0) return null;

  return (
    <div>
      <h4 className="text-xs font-semibold text-muted-foreground">{title}</h4>
      <ul className="mt-1 space-y-1.5">
        {entries
          .filter((entry) => entry.decisionTier !== "background")
          .map((entry) => {
          const tone = operationalMovementTones[trendTone(entry.trendStatus)];
          const tierTone = operationalDecisionTierTones[entry.decisionTier];
          const showImpact =
            entry.estimatedMonthlyImpactEur >= MIN_RECIPE_MARGIN_MOVEMENT_EUR &&
            entry.trendStatus !== "improving";

          return (
            <li
              key={`${entry.trendStatus}-${entry.recipeName}-${entry.window}`}
              className={`rounded-lg border px-3 py-2 ${tone.surface} ${tierTone.border}`}
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-sm font-medium text-foreground">{entry.recipeName}</p>
                <div className="flex items-center gap-1.5">
                  <span
                    className={`rounded-md border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${tierTone.badge}`}
                  >
                    {operationalDecisionTierLabel(entry.decisionTier)}
                  </span>
                  <span className={`text-[10px] font-semibold uppercase tracking-wide ${tone.label}`}>
                    {TREND_LABELS[entry.trendStatus]}
                  </span>
                </div>
              </div>
              <p className="mt-0.5 text-xs leading-snug text-foreground/90">{entry.headline}</p>
              {entry.consequence ? (
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  <span className="font-medium text-foreground/75">If ignored:</span>{" "}
                  {entry.consequence}
                </p>
              ) : null}
              <p className="mt-0.5 text-[11px] font-medium text-primary/90">
                <span className="text-foreground/75">Do:</span> {entry.operatorAction}
              </p>
              {showImpact ? (
                <p className="mt-0.5 text-xs font-semibold tabular-nums text-destructive">
                  ~{formatCurrency(entry.estimatedMonthlyImpactEur)}/mo modeled margin pressure
                </p>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function WindowBlock({
  window,
  worsening,
  improving,
}: {
  window: OperationalWindow;
  worsening: RecipeMarginMovementInsight[];
  improving: RecipeMarginMovementInsight[];
}) {
  if (worsening.length === 0 && improving.length === 0) return null;

  return (
    <div className="rounded-lg border border-border/40 bg-card/40 px-3 py-2.5">
      <h3 className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {window.label}
      </h3>
      <div className="mt-2 grid gap-3 sm:grid-cols-2">
        <MovementList title="Under pressure" entries={worsening} />
        <MovementList title="Holding or improving" entries={improving} />
      </div>
    </div>
  );
}

export function OperationalIntelligenceRecipeMarginMovements({
  recipeMarginMovements,
  operationalWindows,
}: OperationalIntelligenceRecipeMarginMovementsProps) {
  const blocks = WINDOW_GROUPS.map((key) => {
    const window = operationalWindows.find((w) => w.key === key);
    if (!window) return null;
    return {
      window,
      worsening: groupByWindow(recipeMarginMovements.worsening, key),
      improving: groupByWindow(recipeMarginMovements.improving, key),
    };
  }).filter(
    (block): block is NonNullable<typeof block> =>
      block != null && (block.worsening.length > 0 || block.improving.length > 0),
  );

  if (blocks.length === 0) {
    const fallbackWorsening = recipeMarginMovements.worsening.filter(isMeaningfulMovement);
    const fallbackImproving = recipeMarginMovements.improving.filter(isMeaningfulMovement);
    if (fallbackWorsening.length === 0 && fallbackImproving.length === 0) return null;

    const window =
      operationalWindows.find((w) => w.key === "last_3_months") ?? operationalWindows[0];
    if (!window) return null;

    blocks.push({
      window,
      worsening: fallbackWorsening,
      improving: fallbackImproving,
    });
  }

  return (
    <section aria-labelledby="recipe-margin-movements-heading">
      <h2
        id="recipe-margin-movements-heading"
        className="text-sm font-semibold tracking-tight text-foreground"
      >
        Recipe margin trajectory
      </h2>
      <div className="mt-3 space-y-2">
        {blocks.map((block) => (
          <WindowBlock
            key={block.window.key}
            window={block.window}
            worsening={block.worsening}
            improving={block.improving}
          />
        ))}
      </div>
    </section>
  );
}
