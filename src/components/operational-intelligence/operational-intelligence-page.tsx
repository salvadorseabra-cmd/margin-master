import { OperationalIntelligenceActionQueue } from "@/components/operational-intelligence/operational-intelligence-action-queue";
import { OperationalIntelligenceSnapshot } from "@/components/operational-intelligence/operational-intelligence-snapshot";
import { OperationalIntelligenceTrends } from "@/components/operational-intelligence/operational-intelligence-trends";
import { operationalSectionLayout } from "@/components/operational-intelligence/operational-intelligence-tones";
import type { MarginAlertData, MarginAlertItem } from "@/lib/margin-alert-data";
import type { OperationalHealthPanel } from "@/lib/margin-alert-data";
import { buildSynthesisViewModel } from "@/lib/operational-intelligence-synthesis";
import type { MarginVisitDelta } from "@/lib/margin-alert-visit";
import { useMemo } from "react";

export type OperationalIntelligencePageProps = {
  data: MarginAlertData;
  alerts: MarginAlertItem[];
  health: OperationalHealthPanel;
  visitDelta: MarginVisitDelta;
};

export function OperationalIntelligencePage({
  data,
  alerts,
  health,
}: OperationalIntelligencePageProps) {
  const synthesis = useMemo(
    () => buildSynthesisViewModel({ data, alerts, health }),
    [data, alerts, health],
  );

  const { snapshot, actionQueue, trendsPanels, nowInsights, monthlyMarginPressure } = synthesis;

  return (
    <div className={operationalSectionLayout.page}>
      <section className={operationalSectionLayout.section} aria-labelledby="oi-snapshot-region">
        <header className={operationalSectionLayout.sectionHeader}>
          <h2 id="oi-snapshot-region" className={operationalSectionLayout.sectionTitle}>
            Operational snapshot
          </h2>
          <p className={operationalSectionLayout.sectionLead}>
            Current situation — margin pressure, supplier posture, and what needs attention.
          </p>
        </header>
        <OperationalIntelligenceSnapshot
          snapshot={snapshot}
          nowInsights={nowInsights}
          estimatedMarginPressureEur={monthlyMarginPressure.estimatedMarginPressureEur}
        />
      </section>

      {actionQueue.length > 0 ? (
        <section className={operationalSectionLayout.section} aria-labelledby="oi-action-region">
          <header className={operationalSectionLayout.sectionHeader}>
            <h2 id="oi-action-region" className={operationalSectionLayout.sectionTitle}>
              Act now & monitor
            </h2>
            <p className={operationalSectionLayout.sectionLead}>
              Prioritized queue — what to do next, ranked by operational impact.
            </p>
          </header>
          <OperationalIntelligenceActionQueue cards={actionQueue} />
        </section>
      ) : null}

      <section className={operationalSectionLayout.section} aria-labelledby="oi-trends-region">
        <header className={operationalSectionLayout.sectionHeader}>
          <h2 id="oi-trends-region" className={operationalSectionLayout.sectionTitle}>
            Operational trends
          </h2>
          <p className={operationalSectionLayout.sectionLead}>
            Historical context from invoices, supplier lanes, and recipe margin signals.
          </p>
        </header>
        <OperationalIntelligenceTrends panels={trendsPanels} />
      </section>
    </div>
  );
}
