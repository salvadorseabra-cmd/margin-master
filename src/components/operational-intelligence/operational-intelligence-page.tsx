import { OperationalIntelligenceAffectedRecipes } from "@/components/operational-intelligence/operational-intelligence-affected-recipes";
import { OperationalIntelligenceAttentionNeeded } from "@/components/operational-intelligence/operational-intelligence-attention-needed";
import { OperationalIntelligenceFinancialRisks } from "@/components/operational-intelligence/operational-intelligence-financial-risks";
import { OperationalIntelligenceOpportunities } from "@/components/operational-intelligence/operational-intelligence-opportunities";
import { OperationalIntelligenceSuppliersWatch } from "@/components/operational-intelligence/operational-intelligence-suppliers-watch";
import { OperationalIntelligenceWeeklySnapshot } from "@/components/operational-intelligence/operational-intelligence-weekly-snapshot";
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

  const { ownerReview } = synthesis;

  return (
    <div className={operationalSectionLayout.page}>
      <section className={operationalSectionLayout.section} aria-labelledby="oi-weekly-snapshot">
        <header className={operationalSectionLayout.sectionHeader}>
          <h2 id="oi-weekly-snapshot" className={operationalSectionLayout.sectionTitle}>
            Weekly snapshot
          </h2>
          <p className={operationalSectionLayout.sectionLead}>
            Headline counts — supplier movement, margin pressure, and stale pricing.
          </p>
        </header>
        <OperationalIntelligenceWeeklySnapshot snapshot={ownerReview.weeklySnapshot} />
      </section>

      <section className={operationalSectionLayout.section} aria-labelledby="oi-financial-risks">
        <header className={operationalSectionLayout.sectionHeader}>
          <h2 id="oi-financial-risks" className={operationalSectionLayout.sectionTitle}>
            Financial risks
          </h2>
          <p className={operationalSectionLayout.sectionLead}>
            Highest-impact negative changes — sorted by estimated monthly cost.
          </p>
        </header>
        <OperationalIntelligenceFinancialRisks rows={ownerReview.financialRisks} />
      </section>

      <section className={operationalSectionLayout.section} aria-labelledby="oi-opportunities">
        <header className={operationalSectionLayout.sectionHeader}>
          <h2 id="oi-opportunities" className={operationalSectionLayout.sectionTitle}>
            Opportunities
          </h2>
          <p className={operationalSectionLayout.sectionLead}>
            Price decreases, margin recovery, and measured savings already in your data.
          </p>
        </header>
        <OperationalIntelligenceOpportunities rows={ownerReview.opportunities} />
      </section>

      <section className={operationalSectionLayout.section} aria-labelledby="oi-suppliers-watch">
        <header className={operationalSectionLayout.sectionHeader}>
          <h2 id="oi-suppliers-watch" className={operationalSectionLayout.sectionTitle}>
            Suppliers to watch
          </h2>
          <p className={operationalSectionLayout.sectionLead}>
            Supplier direction and ingredient-level price movement from invoices.
          </p>
        </header>
        <OperationalIntelligenceSuppliersWatch rows={ownerReview.suppliersToWatch} />
      </section>

      <section className={operationalSectionLayout.section} aria-labelledby="oi-affected-recipes">
        <header className={operationalSectionLayout.sectionHeader}>
          <h2 id="oi-affected-recipes" className={operationalSectionLayout.sectionTitle}>
            Affected recipes
          </h2>
          <p className={operationalSectionLayout.sectionLead}>
            Menu items with margin deterioration or linked ingredient cost increases.
          </p>
        </header>
        <OperationalIntelligenceAffectedRecipes rows={ownerReview.affectedRecipes} />
      </section>

      <section className={operationalSectionLayout.section} aria-labelledby="oi-attention-needed">
        <header className={operationalSectionLayout.sectionHeader}>
          <h2 id="oi-attention-needed" className={operationalSectionLayout.sectionTitle}>
            Attention needed
          </h2>
          <p className={operationalSectionLayout.sectionLead}>
            Stale prices, missing invoice confirmations, and ingredients flagged for review.
          </p>
        </header>
        <OperationalIntelligenceAttentionNeeded rows={ownerReview.attentionNeeded} />
      </section>
    </div>
  );
}
