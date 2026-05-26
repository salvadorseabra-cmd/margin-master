import { OperationalIntelligenceActions } from "@/components/operational-intelligence/operational-intelligence-actions";
import { OperationalIntelligenceCategoryPressure } from "@/components/operational-intelligence/operational-intelligence-category-pressure";
import { OperationalIntelligenceCostExposure } from "@/components/operational-intelligence/operational-intelligence-cost-exposure";
import { OperationalIntelligenceExecutiveSummary } from "@/components/operational-intelligence/operational-intelligence-executive-summary";
import { OperationalIntelligenceExposureDrilldown } from "@/components/operational-intelligence/operational-intelligence-exposure-drilldown";
import { OperationalIntelligencePurchasingMovements } from "@/components/operational-intelligence/operational-intelligence-purchasing-movements";
import { OperationalIntelligenceRecovery } from "@/components/operational-intelligence/operational-intelligence-recovery";
import { OperationalIntelligenceTodaysRisks } from "@/components/operational-intelligence/operational-intelligence-todays-risks";
import {
  buildCategoryExposureDrillDown,
  buildIngredientExposureDrillDown,
  type ExposureDrillDownModel,
} from "@/lib/exposure-drill-down";
import type { MarginAlertData, MarginAlertItem } from "@/lib/margin-alert-data";
import type { OperationalHealthPanel } from "@/lib/margin-alert-data";
import {
  buildCategoryPressureRows,
  buildCostCategorySlices,
  buildExecutiveSummary,
  buildOperationalPulseLine,
  buildPortfolioCostExposure,
  buildPurchasingMovements,
  buildRecommendedActions,
  buildRecoveryOpportunities,
  buildStalePricingBadges,
  buildTodaysMarginRisks,
  buildTopOperationalExposures,
  type CostCategoryGroup,
} from "@/lib/operational-intelligence-view";
import type { MarginVisitDelta } from "@/lib/margin-alert-visit";
import { useCallback, useMemo, useState } from "react";

export type OperationalIntelligencePageProps = {
  data: MarginAlertData;
  alerts: MarginAlertItem[];
  health: OperationalHealthPanel;
  visitDelta: MarginVisitDelta;
};

export function OperationalIntelligencePage({
  data,
  alerts,
  visitDelta,
}: OperationalIntelligencePageProps) {
  const fullExposure = useMemo(() => buildPortfolioCostExposure(data, 50), [data]);
  const categorySlices = useMemo(
    () => buildCostCategorySlices(fullExposure, { homepageOnly: true }),
    [fullExposure],
  );

  const marginRisks = useMemo(
    () => buildTodaysMarginRisks(data, alerts, categorySlices, 5),
    [data, alerts, categorySlices],
  );
  const staleBadges = useMemo(() => buildStalePricingBadges(alerts, 3), [alerts]);
  const purchasingMovements = useMemo(
    () => buildPurchasingMovements(data, alerts, 5),
    [data, alerts],
  );
  const categoryPressure = useMemo(
    () => buildCategoryPressureRows(data, fullExposure),
    [data, fullExposure],
  );
  const topExposures = useMemo(() => buildTopOperationalExposures(data, 5), [data]);

  const recoveryTitles = useMemo(() => {
    const fromRisks = marginRisks.map((c) => c.event);
    return fromRisks;
  }, [marginRisks]);

  const recoveryOpportunities = useMemo(
    () => buildRecoveryOpportunities(data, alerts, recoveryTitles, 5),
    [data, alerts, recoveryTitles],
  );

  const recommendedActions = useMemo(
    () =>
      buildRecommendedActions(data, alerts, 6, categorySlices, {
        excludeRecoveryTitles: [
          ...recoveryOpportunities.map((o) => o.title),
          ...recoveryTitles,
        ],
      }),
    [data, alerts, categorySlices, recoveryOpportunities, recoveryTitles],
  );

  const purchasingCalm = useMemo(
    () => purchasingMovements.length === 1 && purchasingMovements[0]?.tone === "calm",
    [purchasingMovements],
  );

  const pulseLine = useMemo(
    () =>
      buildOperationalPulseLine({
        visitDelta,
        purchasingMovements,
        alerts,
        data,
      }),
    [visitDelta, purchasingMovements, alerts, data],
  );

  const executiveSummary = useMemo(
    () =>
      buildExecutiveSummary({
        pulseLine,
        categoryPressure,
        topRisk: marginRisks[0] ?? null,
        purchasingCalm,
      }),
    [pulseLine, categoryPressure, marginRisks, purchasingCalm],
  );

  const homepageAlertIds = useMemo(
    () => new Set(marginRisks.map((card) => card.id)),
    [marginRisks],
  );

  const [drillDownOpen, setDrillDownOpen] = useState(false);
  const [drillDownModel, setDrillDownModel] = useState<ExposureDrillDownModel | null>(null);

  const openCategoryDrillDown = useCallback(
    (group: CostCategoryGroup) => {
      const slice = categorySlices.find((s) => s.group === group);
      setDrillDownModel(
        buildCategoryExposureDrillDown({
          data,
          alerts,
          category: group,
          categorySharePct: slice?.sharePct ?? 0,
          exposureRows: fullExposure,
          homepageAlertIds,
        }),
      );
      setDrillDownOpen(true);
    },
    [alerts, categorySlices, data, fullExposure, homepageAlertIds],
  );

  const openIngredientDrillDown = useCallback(
    (ingredientId: string) => {
      const row = fullExposure.find((r) => r.ingredientId === ingredientId);
      const model = buildIngredientExposureDrillDown({
        data,
        alerts,
        ingredientId,
        exposureRow: row ?? null,
        homepageAlertIds,
      });
      if (!model) return;
      setDrillDownModel(model);
      setDrillDownOpen(true);
    },
    [alerts, data, fullExposure, homepageAlertIds],
  );

  return (
    <div className="space-y-10 sm:space-y-12">
      <OperationalIntelligenceTodaysRisks cards={marginRisks} staleBadges={staleBadges} />

      <OperationalIntelligencePurchasingMovements items={purchasingMovements} />

      <OperationalIntelligenceCategoryPressure
        rows={categoryPressure}
        onCategoryClick={openCategoryDrillDown}
      />

      <OperationalIntelligenceCostExposure
        rows={topExposures}
        onIngredientClick={openIngredientDrillDown}
      />

      <OperationalIntelligenceRecovery opportunities={recoveryOpportunities} />

      <OperationalIntelligenceActions actions={recommendedActions} />

      <OperationalIntelligenceExecutiveSummary summary={executiveSummary} />

      <OperationalIntelligenceExposureDrilldown
        model={drillDownModel}
        open={drillDownOpen}
        onOpenChange={setDrillDownOpen}
      />
    </div>
  );
}
