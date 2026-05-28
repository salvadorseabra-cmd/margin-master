import { describe, expect, it } from "vitest";
import {
  formatSnapshotExposureChip,
  partitionSnapshotSignals,
  SNAPSHOT_CENTER_SIGNAL_IDS,
} from "@/components/operational-intelligence/operational-intelligence-snapshot";
import {
  buildHeroNarrative,
  buildOperationalSnapshotViewModel,
  buildOperationalWindows,
} from "@/lib/operational-intelligence-synthesis";

describe("operational-intelligence-snapshot", () => {
  it("partitions signals into center exposure chips and supporting inline row", () => {
    const signals = [
      { id: "dominant-category", label: "Dominant category", line: "Meat (35%)", tone: "info" as const },
      { id: "plate-concentration", label: "Avg plate concentration", line: "72% avg", tone: "watch" as const },
      { id: "recipes-deteriorating", label: "Recipes deteriorating", line: "1 recipe", tone: "risk" as const },
      { id: "supplier-volatility", label: "Supplier volatility", line: "Watch", tone: "watch" as const },
      { id: "pricing-confidence", label: "Pricing confidence", line: "OK", tone: "info" as const },
    ];
    const { center, supporting } = partitionSnapshotSignals(signals);
    expect(center.map((s) => s.id).sort()).toEqual([...SNAPSHOT_CENTER_SIGNAL_IDS].sort());
    expect(supporting.map((s) => s.id)).toEqual(["supplier-volatility", "pricing-confidence"]);
    expect(formatSnapshotExposureChip(signals[0])).toBe("Meat");
  });

  it("builds snapshot view model with title, synthesis, signals, and key takeaway", () => {
    const summary = {
      estimatedMarginPressureEur: 120,
      estimatedMarginPressureLine: "Est. EUR 120/mo",
      biggestInflationDriver: "Beef (+8% on invoices)",
      mostAffectedCategory: "Meat (35% of menu cost)",
      supplierVolatilityLevel: "medium" as const,
      supplierVolatilityLabel: "Watch — selective lines moving",
      recipesBelowTarget: 1,
      calmSummaryLine: "calm",
    };

    const hero = buildHeroNarrative({
      monthlyMarginPressure: summary,
      prioritizedInsights: [
        {
          id: "insight-1",
          tier: "tier_1",
          decisionTier: "now",
          priority: "warning",
          storyKey: "meat:beef",
          category: "concentration",
          categoryLabel: "Plate concentration",
          title: "Beef margin compression",
          detail: "72% avg plate share · Burger A, Burger B",
          operatorInsightLine: "Beef dominates plate cost on flagged burgers.",
          consequence: "If ignored, margin stays under pressure.",
          impactLine: "~EUR 120/mo",
          monthlyImpactEur: 120,
          suggestedAction: "Re-weigh beef portions",
          operatorAction: "Re-weigh beef portions on flagged burgers this prep cycle.",
          actionLabel: "Open dishes",
          target: "/recipes",
        },
      ],
      groupedRecovery: [],
    });

    const snapshot = buildOperationalSnapshotViewModel({
      hero,
      monthlyMarginPressure: summary,
      prioritizedInsights: [],
      concentrationGroups: [
        {
          id: "c1",
          groupKey: "meat:beef",
          storyKey: "meat:beef",
          priority: "warning",
          decisionTier: "now",
          title: "Beef margin compression",
          detail: "72% avg · Burger A",
          operatorInsightLine: "Beef dominates",
          affectedRecipes: ["Burger A", "Burger B"],
          avgConcentrationPct: 72,
          estimatedMonthlyImpactEur: 120,
          estimatedImpactLine: null,
          suggestedAction: "Re-weigh",
          operatorAction: "Re-weigh beef",
          actionLabel: "Open",
          target: "/recipes",
        },
      ],
      operationalSynthesisGroups: {
        supplierMovements: { largestIncreases: [], stablePricing: [] },
        supplierSwitchImpacts: {
          badSwitches: [],
          goodSwitches: [],
          stableSwitches: [],
          volatilityReductions: [],
        },
        recipeMarginMovements: { worsening: [], improving: [] },
        recoverySignals: [],
        stableOperationalAreas: { categories: [], highOperationalExposureIngredients: [] },
      },
      alerts: [],
      curatedExposures: [],
    });

    expect(snapshot.operationalTitle).toContain("Beef");
    expect(snapshot.synthesisParagraph.length).toBeGreaterThan(20);
    expect(snapshot.signals.length).toBeGreaterThanOrEqual(6);
    expect(snapshot.signals.some((s) => s.label === "Key takeaway")).toBe(false);
    expect(snapshot.keyTakeaway).toMatch(/beef|portion|invoice/i);
    expect(snapshot.signals.find((s) => s.id === "dominant-category")?.line).toContain("Meat");
  });

  it("includes pricing confidence signal when stale alerts exist", () => {
    const snapshot = buildOperationalSnapshotViewModel({
      hero: {
        tier: "tier_1",
        title: "Procurement stabilization",
        narrative: "Catalog and invoices are aligning.",
        impactLine: "Minimal modeled pressure",
        actionCluster: ["Match catalog to latest invoice."],
      },
      monthlyMarginPressure: {
        estimatedMarginPressureEur: 0,
        estimatedMarginPressureLine: "Minimal",
        biggestInflationDriver: null,
        mostAffectedCategory: null,
        supplierVolatilityLevel: "stable",
        supplierVolatilityLabel: "Stable",
        recipesBelowTarget: 0,
        calmSummaryLine: "calm",
      },
      prioritizedInsights: [],
      concentrationGroups: [],
      operationalSynthesisGroups: {
        supplierMovements: { largestIncreases: [], stablePricing: [] },
        supplierSwitchImpacts: {
          badSwitches: [],
          goodSwitches: [],
          stableSwitches: [],
          volatilityReductions: [],
        },
        recipeMarginMovements: { worsening: [], improving: [] },
        recoverySignals: [],
        stableOperationalAreas: { categories: [], highOperationalExposureIngredients: [] },
      },
      alerts: [
        {
          id: "stale-1",
          kind: "stale_price",
          sectionId: "s",
          severity: "watch",
          title: "Beef pricing is stale",
          context: "ctx",
          suggestedAction: "Sync",
          actionLabel: "Open",
          target: "/ingredients",
          meta: [],
          signals: [],
          priority: 100,
        },
        {
          id: "stale-2",
          kind: "stale_price",
          sectionId: "s",
          severity: "watch",
          title: "Oil pricing is stale",
          context: "ctx",
          suggestedAction: "Sync",
          actionLabel: "Open",
          target: "/ingredients",
          meta: [],
          signals: [],
          priority: 90,
        },
      ],
      curatedExposures: [],
    });

    const pricing = snapshot.signals.find((s) => s.id === "pricing-confidence");
    expect(pricing?.line).toMatch(/awaiting invoice/i);
    expect(buildOperationalWindows(new Date("2026-05-27T00:00:00.000Z"))).toHaveLength(3);
  });
});
