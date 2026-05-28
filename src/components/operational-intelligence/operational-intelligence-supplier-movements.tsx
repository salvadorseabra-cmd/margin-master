import type { ReactNode } from "react";
import { formatPercent } from "@/lib/display-format";
import type {
  OperationalSynthesisGroups,
  SupplierSwitchImpactInsight,
} from "@/lib/operational-intelligence-synthesis";
import {
  operationalDecisionTierLabel,
  operationalDecisionTierTones,
  operationalMovementTones,
  operationalPriorityTones,
} from "@/components/operational-intelligence/operational-intelligence-tones";

type OperationalIntelligenceSupplierMovementsProps = {
  supplierMovements: OperationalSynthesisGroups["supplierMovements"];
  supplierSwitchImpacts: OperationalSynthesisGroups["supplierSwitchImpacts"];
};

function Subsection({
  title,
  tone,
  children,
}: {
  title: string;
  tone: keyof typeof operationalMovementTones;
  children: ReactNode;
}) {
  const styles = operationalMovementTones[tone];
  return (
    <div>
      <h3 className={`text-xs font-semibold uppercase tracking-wide ${styles.label}`}>
        {title}
      </h3>
      <div className="mt-1.5 space-y-1.5">{children}</div>
    </div>
  );
}

function SwitchCard({
  impact,
  tone,
}: {
  impact: SupplierSwitchImpactInsight;
  tone: keyof typeof operationalMovementTones;
}) {
  const styles = operationalMovementTones[tone];
  return (
    <article
      key={`${impact.ingredientId}-${impact.fromSupplier}-${impact.toSupplier}-${impact.switchedAt}`}
      className={`rounded-lg border border-l-[3px] px-3 py-2 ${styles.surface}`}
    >
      <p className="text-sm font-medium text-foreground">{impact.narrative}</p>
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={`rounded-md border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${operationalDecisionTierTones[impact.decisionTier].badge}`}
        >
          {operationalDecisionTierLabel(impact.decisionTier)}
        </span>
      </div>
      <p className="mt-0.5 text-xs text-muted-foreground">{impact.impactLine}</p>
      <p className="mt-0.5 text-[11px] text-foreground/80">
        <span className="font-medium">If ignored:</span> {impact.consequence}
      </p>
      <p className="mt-0.5 text-[11px] font-medium text-primary/90">
        <span className="text-foreground/75">Do:</span> {impact.operatorAction}
      </p>
    </article>
  );
}

export function OperationalIntelligenceSupplierMovements({
  supplierMovements,
  supplierSwitchImpacts,
}: OperationalIntelligenceSupplierMovementsProps) {
  const increases = supplierMovements.largestIncreases.filter(
    (entry) => entry.decisionTier !== "background",
  );
  const badSwitches = supplierSwitchImpacts.badSwitches;
  const goodSwitches = supplierSwitchImpacts.goodSwitches;
  const stableSwitches = supplierSwitchImpacts.stableSwitches;
  const volatilityReductions = supplierSwitchImpacts.volatilityReductions;

  const hasContent =
    increases.length > 0 ||
    badSwitches.length > 0 ||
    goodSwitches.length > 0 ||
    stableSwitches.length > 0 ||
    volatilityReductions.length > 0;

  if (!hasContent) return null;

  return (
    <section aria-labelledby="supplier-movements-heading">
      <h2
        id="supplier-movements-heading"
        className="text-sm font-semibold tracking-tight text-foreground"
      >
        Supplier procurement
      </h2>

      <div className="mt-3 space-y-4">
        {increases.length > 0 ? (
          <Subsection title="Sustained increases" tone="risk">
            {increases.map((entry) => {
              const tone = operationalPriorityTones[entry.normalizedPriority];
              const tierTone = operationalDecisionTierTones[entry.decisionTier];
              return (
                <article
                  key={entry.supplierName}
                  className={`rounded-lg border px-3 py-2 ${tierTone.surface} ${tierTone.border} ${tierTone.emphasis}`}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded-md border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${tierTone.badge}`}
                    >
                      {operationalDecisionTierLabel(entry.decisionTier)}
                    </span>
                    <p className="text-sm font-semibold text-foreground">{entry.supplierName}</p>
                    {entry.averageChangePct >= 2 ? (
                      <span
                        className={`rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${tone.badge}`}
                      >
                        +{formatPercent(Math.round(entry.averageChangePct))}
                      </span>
                    ) : null}
                    <span className="text-[11px] text-muted-foreground">
                      {entry.dominantWindowLabel}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs leading-snug text-foreground/90">
                    {entry.operatorInsightLine}
                  </p>
                  {entry.consequence ? (
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      <span className="font-medium text-foreground/75">If ignored:</span>{" "}
                      {entry.consequence}
                    </p>
                  ) : null}
                  <p className="mt-0.5 text-[11px] font-medium text-primary/90">
                    <span className="text-foreground/75">Do:</span> {entry.operatorAction}
                  </p>
                  {entry.topIngredientLabels.length > 0 ? (
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      {entry.topIngredientLabels.join(" · ")}
                    </p>
                  ) : null}
                </article>
              );
            })}
          </Subsection>
        ) : null}

        {badSwitches.length > 0 ? (
          <Subsection title="Switches — costs up" tone="risk">
            {badSwitches.map((impact) => (
              <SwitchCard key={`bad-${impact.switchedAt}-${impact.ingredientId}`} impact={impact} tone="risk" />
            ))}
          </Subsection>
        ) : null}

        {goodSwitches.length > 0 ? (
          <Subsection title="Switches — margin improved" tone="recovery">
            {goodSwitches.map((impact) => (
              <SwitchCard
                key={`good-${impact.switchedAt}-${impact.ingredientId}`}
                impact={impact}
                tone="recovery"
              />
            ))}
          </Subsection>
        ) : null}

        {stableSwitches.filter((i) => i.decisionTier !== "background").length > 0 ? (
          <Subsection title="Stable transitions" tone="info">
            {stableSwitches
              .filter((i) => i.decisionTier !== "background")
              .map((impact) => (
              <SwitchCard
                key={`stable-switch-${impact.switchedAt}-${impact.ingredientId}`}
                impact={impact}
                tone="info"
              />
            ))}
          </Subsection>
        ) : null}

        {volatilityReductions.length > 0 ? (
          <Subsection title="Volatility eased after switch" tone="stable">
            {volatilityReductions.map((impact) => (
              <SwitchCard
                key={`vol-${impact.switchedAt}-${impact.ingredientId}`}
                impact={impact}
                tone="stable"
              />
            ))}
          </Subsection>
        ) : null}
      </div>
    </section>
  );
}
