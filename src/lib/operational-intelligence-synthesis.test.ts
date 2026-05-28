import { describe, expect, it } from "vitest";
import {
  buildConsequenceLine,
  buildCuratedOperationalExposures,
  buildHeroNarrative,
  buildGroupedConcentrationInsights,
  buildGroupedRecoveryOpportunities,
  buildMonthlyMarginPressureSummary,
  buildOperatorActionLine,
  buildOperatorInsightLine,
  buildOperationalWindows,
  buildPrioritizedOperationalInsights,
  buildCalmOperationalSignal,
  buildOperationalActionQueue,
  buildOperationalSnapshotViewModel,
  buildOperationalTrendsPanels,
  parseRecipeMarginRangeFromAlert,
  buildRecipeMarginHeadline,
  buildSupplierMovementNarrative,
  buildSupplierSwitchNarrative,
  buildSynthesisViewModel,
  classifyRecipeMarginTrend,
  classifySupplierMovementSignal,
  classifySupplierSwitchType,
  compressFinancialImpact,
  enrichCategoryPressureRows,
  formatCommercialExposureLine,
  mapToInsightPriority,
  mapToOperationalDecisionTier,
  MIN_MEANINGFUL_SUPPLIER_CHANGE_PCT,
  resolveCommercialExposureKind,
  resolveOperationalStoryKey,
  synthesizeCategoryPressureNarrative,
  synthesizeInsightTitle,
} from "@/lib/operational-intelligence-synthesis";
import {
  buildCategoryPressureRows,
  buildCostCategorySlices,
  buildPortfolioCostExposure,
  buildTodaysMarginRisks,
} from "@/lib/operational-intelligence-view";
import type { MarginAlertItem } from "@/lib/margin-alert-data";

const beefRecipe = (id: string, name: string, contributionQty: number) => ({
  id,
  name,
  selling_price: 18,
  type: "menu",
  recipe_ingredients: [
    {
      id: `l-${id}`,
      recipe_id: id,
      ingredient_id: "beef-1",
      quantity: contributionQty,
      unit: "kg",
      created_at: "",
      ingredients: {
        id: "beef-1",
        name: "Novilho Vazia",
        unit: "kg",
        current_price: 10,
        purchase_quantity: 1,
      },
    },
    {
      id: `l2-${id}`,
      recipe_id: id,
      ingredient_id: "side-1",
      quantity: 0.05,
      unit: "kg",
      created_at: "",
      ingredients: {
        id: "side-1",
        name: "Salad mix",
        unit: "kg",
        current_price: 4,
        purchase_quantity: 1,
      },
    },
  ],
});

describe("operational-intelligence-synthesis", () => {
  it("maps severity and impact to priority tiers", () => {
    expect(mapToInsightPriority({ severity: "critical" })).toBe("critical");
    expect(mapToInsightPriority({ monthlyImpactEur: 100 })).toBe("warning");
    expect(mapToInsightPriority({ contributionPct: 58 })).toBe("monitor");
    expect(mapToInsightPriority({ severity: "info", monthlyImpactEur: 0 })).toBe("informational");
  });

  it("maps priority and impact to operator decision tiers", () => {
    expect(
      mapToOperationalDecisionTier({ priority: "critical", monthlyImpactEur: 10 }),
    ).toBe("now");
    expect(
      mapToOperationalDecisionTier({ priority: "warning", monthlyImpactEur: 60 }),
    ).toBe("now");
    expect(
      mapToOperationalDecisionTier({ priority: "warning", monthlyImpactEur: 20 }),
    ).toBe("monitor");
    expect(
      mapToOperationalDecisionTier({
        priority: "informational",
        monthlyImpactEur: 0,
        category: "stale_pricing",
      }),
    ).toBe("monitor");
    expect(
      mapToOperationalDecisionTier({
        priority: "informational",
        monthlyImpactEur: 0,
        signal: "stable_pricing",
      }),
    ).toBe("background");
  });

  it("builds restaurant-native operator copy helpers", () => {
    expect(
      buildOperatorInsightLine({
        category: "stale_pricing",
        title: "Pricing confidence degraded",
      }),
    ).toMatch(/catalog prices are ahead of confirmed invoices/i);

    expect(
      buildConsequenceLine({
        priority: "warning",
        monthlyImpactEur: 40,
        movement: "worsening",
        trendStatus: "worsening",
      }),
    ).toMatch(/if ignored/i);

    expect(
      buildOperatorActionLine({
        category: "stale_pricing",
        suggestedAction: "Audit basket",
      }),
    ).toMatch(/catalog to the latest paid invoice/i);

    expect(
      synthesizeInsightTitle({ kind: "insight", insightCategory: "stale_pricing", staleCount: 3 }),
    ).toBe("Pricing confidence degraded on key lines");
  });

  it("resolves beef ingredients to a shared operational story key", () => {
    expect(
      resolveOperationalStoryKey({
        ingredientName: "Novilho Vazia",
        category: "meat",
        ingredientId: "beef-1",
      }),
    ).toBe("meat:beef");
    expect(
      synthesizeInsightTitle({
        kind: "concentration",
        storyKey: "meat:beef",
        category: "meat",
      }),
    ).toBe("Beef margin compression");
  });

  it("compresses financial impact into narrative recovery lines", () => {
    expect(
      compressFinancialImpact(34, {
        mode: "recovery",
        storyKey: "meat:beef",
        category: "meat",
        cause: "portion_optimization",
      }),
    ).toMatch(/34.*recoverable through beef standardization/i);
  });

  it("groups multiple recipes with the same dominant ingredient into one concentration insight", () => {
    const data = {
      ingredients: [
        { id: "beef-1", name: "Novilho Vazia", unit: "kg", current_price: 10, purchase_quantity: 1 },
        { id: "side-1", name: "Salad mix", unit: "kg", current_price: 4, purchase_quantity: 1 },
      ],
      recipes: [
        beefRecipe("r1", "Burger A", 0.25),
        beefRecipe("r2", "Burger B", 0.22),
      ],
      priceHistory: [],
      invoices: [],
    };

    const alerts: MarginAlertItem[] = [
      {
        id: "high-contribution|r1|beef-1",
        kind: "cost_concentration",
        sectionId: "cost_concentration",
        severity: "watch",
        title: "Novilho Vazia is 78% of Burger A cost",
        context: "ctx",
        suggestedAction: "Review portion",
        actionLabel: "Open",
        target: "/recipes",
        meta: [
          { label: "Cost share", value: "78%" },
          { label: "Recipe", value: "Burger A" },
        ],
        signals: [],
        priority: 5000,
      },
      {
        id: "high-contribution|r2|beef-1",
        kind: "cost_concentration",
        sectionId: "cost_concentration",
        severity: "watch",
        title: "Novilho Vazia is 76% of Burger B cost",
        context: "ctx",
        suggestedAction: "Review portion",
        actionLabel: "Open",
        target: "/recipes",
        meta: [
          { label: "Cost share", value: "76%" },
          { label: "Recipe", value: "Burger B" },
        ],
        signals: [],
        priority: 4900,
      },
    ];

    const groups = buildGroupedConcentrationInsights(data, alerts, 4);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.title).toBe("Beef margin compression");
    expect(groups[0]?.storyKey).toBe("meat:beef");
    expect(groups[0]?.affectedRecipes).toEqual(["Burger A", "Burger B"]);
    expect(groups[0]?.avgConcentrationPct).toBeGreaterThanOrEqual(55);
    if ((groups[0]?.estimatedMonthlyImpactEur ?? 0) >= 1) {
      expect(String(groups[0]?.estimatedImpactLine)).toMatch(/exposure/i);
    }
    expect(groups[0]?.priority).not.toBe("informational");
  });

  it("does not emit per-recipe concentration cards in prioritized insights", () => {
    const data = {
      ingredients: [
        { id: "beef-1", name: "Novilho Vazia", unit: "kg", current_price: 10, purchase_quantity: 1 },
        { id: "side-1", name: "Salad mix", unit: "kg", current_price: 4, purchase_quantity: 1 },
      ],
      recipes: [beefRecipe("r1", "Burger A", 0.25), beefRecipe("r2", "Burger B", 0.22)],
      priceHistory: [],
      invoices: [],
    };

    const alerts: MarginAlertItem[] = [
      {
        id: "high-contribution|r1|beef-1",
        kind: "cost_concentration",
        sectionId: "cost_concentration",
        severity: "watch",
        title: "Novilho Vazia is 78% of Burger A cost",
        context: "ctx",
        suggestedAction: "Review portion",
        actionLabel: "Open",
        target: "/recipes",
        meta: [
          { label: "Cost share", value: "78%" },
          { label: "Recipe", value: "Burger A" },
        ],
        signals: [],
        priority: 5000,
      },
      {
        id: "high-contribution|r2|beef-1",
        kind: "cost_concentration",
        sectionId: "cost_concentration",
        severity: "watch",
        title: "Novilho Vazia is 76% of Burger B cost",
        context: "ctx",
        suggestedAction: "Review portion",
        actionLabel: "Open",
        target: "/recipes",
        meta: [
          { label: "Cost share", value: "76%" },
          { label: "Recipe", value: "Burger B" },
        ],
        signals: [],
        priority: 4900,
      },
    ];

    const slices = buildCostCategorySlices(buildPortfolioCostExposure(data));
    const insights = buildPrioritizedOperationalInsights({
      data,
      alerts,
      categorySlices: slices,
      limit: 10,
    });

    const concentrationInsights = insights.filter((i) => i.category === "concentration");
    expect(concentrationInsights).toHaveLength(1);
    expect(concentrationInsights[0]?.title).toBe("Beef margin compression");
    expect(concentrationInsights[0]?.title).not.toContain("Burger A");
    expect(concentrationInsights.some((i) => i.title.includes("78%"))).toBe(false);
  });

  it("enriches category pressure with interpretive narratives when stable", () => {
    const data = {
      ingredients: [
        { id: "i1", name: "Novilho", unit: "kg", current_price: 10, purchase_quantity: 1 },
      ],
      recipes: [
        {
          id: "r1",
          name: "Burger",
          selling_price: 12,
          type: "menu",
          recipe_ingredients: [
            {
              id: "l1",
              recipe_id: "r1",
              ingredient_id: "i1",
              quantity: 2,
              unit: "kg",
              created_at: "",
              ingredients: {
                id: "i1",
                name: "Novilho",
                unit: "kg",
                current_price: 10,
                purchase_quantity: 1,
              },
            },
          ],
        },
      ],
      priceHistory: [],
      invoices: [],
    };

    const exposure = buildPortfolioCostExposure(data);
    const slices = buildCostCategorySlices(exposure);
    const rows = enrichCategoryPressureRows(buildCategoryPressureRows(data, exposure), slices);
    const meatRow = rows.find((r) => r.group === "meat");
    expect(meatRow?.interpretiveLine.length).toBeGreaterThan(10);
    expect(meatRow?.interpretiveLine).not.toBe("→ No material category inflation — monitor on next invoice.");
  });

  it("curates operational exposures with narrative fields", () => {
    const data = {
      ingredients: [
        { id: "beef-1", name: "Novilho Vazia", unit: "kg", current_price: 10, purchase_quantity: 1 },
        { id: "side-1", name: "Salad mix", unit: "kg", current_price: 4, purchase_quantity: 1 },
      ],
      recipes: [beefRecipe("r1", "Burger A", 0.25)],
      priceHistory: [],
      invoices: [],
    };

    const curated = buildCuratedOperationalExposures(data, 3);
    expect(curated.length).toBeGreaterThan(0);
    expect(curated[0]?.whyItMatters.length).toBeGreaterThan(10);
    expect(curated[0]?.likelyAction.length).toBeGreaterThan(5);
    expect(curated[0]?.exposureKind).toBeTruthy();
    expect(curated[0]?.decisionTier).toBeTruthy();
    expect(curated[0]?.operatorAction.length).toBeGreaterThan(5);
    expect(curated[0]?.sensitivityLine).toMatch(/dish|invoice|portions|procurement sensitive/i);
  });

  it("builds procurement narratives for supplier movement and switches", () => {
    expect(
      buildSupplierMovementNarrative({
        supplierName: "Continente",
        averageChangePct: 14,
        changeEvents: 4,
        signal: "sustained_increase",
        dominantWindowLabel: "Last 3 months",
        categoryHint: "beef",
        temporalTrend: "accelerating",
      }),
    ).toMatch(/Continente beef pricing increased.*14%.*3 months/i);

    expect(
      classifySupplierMovementSignal({
        averageChangePct: 0.2,
        changeEvents: 6,
        changes: [3, -3, 2.5, -2.5, 1, -1],
        temporalTrend: "flat",
      }),
    ).toBe("stable_pricing");

    expect(classifySupplierSwitchType(12)).toBe("more_expensive");
    expect(classifySupplierSwitchType(-8)).toBe("cheaper");
    expect(classifySupplierSwitchType(0.5)).toBe("stable_transition");

    const switchCopy = buildSupplierSwitchNarrative({
      ingredientName: "Ketchup",
      fromSupplier: "Alpha",
      toSupplier: "Beta",
      changePct: 18,
      switchType: "more_expensive",
    });
    expect(switchCopy.narrative).toMatch(/Ketchup/i);
    expect(switchCopy.consequence).toMatch(/margin/i);
  });

  it("classifies recipe margin trends and headlines", () => {
    expect(
      classifyRecipeMarginTrend({
        movement: "worsening",
        reason: "Beef inflation on invoices",
        estimatedMonthlyImpactEur: 40,
      }),
    ).toBe("worsening");

    expect(
      buildRecipeMarginHeadline({
        recipeName: "Steakhouse Burger",
        trendStatus: "worsening",
        reason: "beef inflation on invoices",
      }),
    ).toMatch(/Steakhouse Burger margin compressed after beef inflation/i);

    expect(
      classifyRecipeMarginTrend({
        movement: "improving",
        reason: "Recovered after brioche sourcing improvement",
        estimatedMonthlyImpactEur: 0,
      }),
    ).toBe("recovering");
  });

  it("formats commercial exposure lines by kind", () => {
    expect(
      resolveCommercialExposureKind({
        ingredientId: "i1",
        ingredientName: "Beef",
        category: "meat",
        costSharePct: 12,
        recipeCount: 4,
        monthlyModeledExposureEur: 80,
        supplierSpikeFlag: false,
        trendPct: 2,
      }),
    ).toBe("menu_sensitivity");

    expect(
      formatCommercialExposureLine({
        ingredientId: "i1",
        ingredientName: "Beef",
        category: "meat",
        costSharePct: 12,
        recipeCount: 1,
        monthlyModeledExposureEur: 80,
        supplierSpikeFlag: true,
        trendPct: 8,
      }),
    ).toMatch(/paid price|invoice/i);
  });

  it("builds monthly margin pressure summary from existing risk and category data", () => {
    const data = {
      ingredients: [
        { id: "i1", name: "Novilho", unit: "kg", current_price: 10, purchase_quantity: 1 },
      ],
      recipes: [
        {
          id: "r1",
          name: "Burger",
          selling_price: 12,
          type: "menu",
          recipe_ingredients: [
            {
              id: "l1",
              recipe_id: "r1",
              ingredient_id: "i1",
              quantity: 2,
              unit: "kg",
              created_at: "",
              ingredients: {
                id: "i1",
                name: "Novilho",
                unit: "kg",
                current_price: 10,
                purchase_quantity: 1,
              },
            },
          ],
        },
      ],
      priceHistory: [],
      invoices: [],
    };

    const alerts: MarginAlertItem[] = [
      {
        id: "price-increase-i1",
        kind: "price_increase",
        sectionId: "supplier_anomalies",
        severity: "high",
        title: "Novilho cost moved up",
        context: "ctx",
        suggestedAction: "Review",
        actionLabel: "Go",
        target: "/ingredients",
        meta: [{ label: "Movement", value: "Up 10%" }],
        signals: [],
        priority: 200,
      },
    ];

    const exposure = buildPortfolioCostExposure(data);
    const slices = buildCostCategorySlices(exposure);
    const categoryPressure = buildCategoryPressureRows(data, exposure);
    const marginRisks = buildTodaysMarginRisks(data, alerts, slices);

    const summary = buildMonthlyMarginPressureSummary({
      data,
      alerts,
      categorySlices: slices,
      categoryPressure,
      marginRisks,
    });

    expect(summary.estimatedMarginPressureLine).toMatch(/Est\.|Minimal/);
    expect(summary.biggestInflationDriver).toContain("Novilho");
    expect(summary.mostAffectedCategory).toBeTruthy();
    expect(summary.supplierVolatilityLabel.length).toBeGreaterThan(5);
    expect(summary.calmSummaryLine.length).toBeGreaterThan(20);
  });

  it("groups recovery opportunities by cause instead of per-recipe trim cards", () => {
    const data = {
      ingredients: [
        { id: "i1", name: "Novilho Vazia", unit: "kg", current_price: 12, purchase_quantity: 1 },
      ],
      recipes: [
        beefRecipe("r1", "Burger A", 0.3),
        beefRecipe("r2", "Burger B", 0.28),
      ],
      priceHistory: [],
      invoices: [],
    };

    const alerts: MarginAlertItem[] = [];
    const grouped = buildGroupedRecoveryOpportunities(data, alerts, [], 5);
    const portionGroups = grouped.filter((g) => g.cause === "portion_optimization");

    if (portionGroups.length > 0) {
      expect(portionGroups[0]?.affectedRecipes.length).toBeGreaterThanOrEqual(1);
      expect(portionGroups[0]?.suggestedActions.length).toBeGreaterThan(0);
      expect(portionGroups[0]?.title).not.toMatch(/portion optimization opportunity$/i);
    }
  });

  it("dedupes recovery opportunities already covered by insight story keys", () => {
    const data = {
      ingredients: [
        { id: "beef-1", name: "Novilho Vazia", unit: "kg", current_price: 12, purchase_quantity: 1 },
      ],
      recipes: [beefRecipe("r1", "Burger A", 0.3)],
      priceHistory: [],
      invoices: [],
    };

    const grouped = buildGroupedRecoveryOpportunities(data, [], [], 5, ["meat:beef"]);
    const beefRecovery = grouped.filter((g) => g.storyKey === "meat:beef");
    expect(beefRecovery).toHaveLength(0);
  });

  it("synthesizeCategoryPressureNarrative prefers operational reads over generic stable copy", () => {
    expect(
      synthesizeCategoryPressureNarrative(
        {
          group: "meat",
          label: "Meat",
          trend: "flat",
          inflationVs3MoPct: 1,
          pressureLine: "Stable",
          operationalLine: "→ No material category inflation",
        },
        32,
        true,
      ),
    ).toBe("Largest menu exposure bucket but stable this period");
  });

  it("buildSynthesisViewModel returns executive summary and prioritized insights", () => {
    const data = {
      ingredients: [
        { id: "beef-1", name: "Novilho Vazia", unit: "kg", current_price: 10, purchase_quantity: 1 },
        { id: "side-1", name: "Salad mix", unit: "kg", current_price: 4, purchase_quantity: 1 },
      ],
      recipes: [beefRecipe("r1", "Burger A", 0.25)],
      priceHistory: [],
      invoices: [],
    };

    const alerts: MarginAlertItem[] = [
      {
        id: "high-contribution|r1|beef-1",
        kind: "cost_concentration",
        sectionId: "cost_concentration",
        severity: "watch",
        title: "Novilho Vazia is 80% of Burger A cost",
        context: "ctx",
        suggestedAction: "Review portion",
        actionLabel: "Open",
        target: "/recipes",
        meta: [
          { label: "Cost share", value: "80%" },
          { label: "Recipe", value: "Burger A" },
        ],
        signals: [],
        priority: 5000,
      },
    ];

    const view = buildSynthesisViewModel({ data, alerts });
    expect(view.monthlyMarginPressure.recipesBelowTarget).toBeGreaterThanOrEqual(0);
    expect(view.prioritizedInsights.length).toBeGreaterThan(0);
    expect(view.tierOneInsights.length + view.tierTwoInsights.length + view.tierThreeInsights.length).toBe(
      view.prioritizedInsights.length,
    );
    expect(view.hero.title.length).toBeGreaterThan(3);
    expect(view.calmSignals.bullets.length).toBeGreaterThan(0);
    expect(view.prioritizedInsights.every((i) => i.priority)).toBe(true);
    expect(view.prioritizedInsights.every((i) => i.decisionTier)).toBe(true);
    expect(view.nowInsights.length + view.monitorInsights.length + view.backgroundInsights.length).toBe(
      view.prioritizedInsights.length,
    );
    expect(view.curatedExposures.length).toBeGreaterThan(0);
    expect(view.categoryPressure[0]?.interpretiveLine).toBeTruthy();
    expect(view.snapshot.operationalTitle.length).toBeGreaterThan(3);
    expect(view.snapshot.synthesisParagraph.length).toBeGreaterThan(10);
    expect(view.snapshot.signals.length).toBeGreaterThanOrEqual(6);
    expect(view.snapshot.keyTakeaway.length).toBeGreaterThan(10);
    expect(view.trendsPanels.last90Days.label).toBe("Last 90 days");
    expect(view.trendsPanels.last6Months.label).toBe("Last 6 months");
    expect(view.trendsPanels.last90Days.supplierMovement.bullets.length).toBeGreaterThan(0);
    expect(view.actionQueue.every((c) => c.whatToDo.length > 0)).toBe(true);
  });

  it("builds deterministic hero and calm narrative layers", () => {
    const summary = {
      estimatedMarginPressureEur: 240,
      estimatedMarginPressureLine: "Est. EUR 240/mo",
      biggestInflationDriver: "Beef (+10% on invoices)",
      mostAffectedCategory: "Meat (35% of menu cost)",
      supplierVolatilityLevel: "medium" as const,
      supplierVolatilityLabel: "Watch",
      recipesBelowTarget: 2,
      calmSummaryLine: "summary",
    };
    const hero = buildHeroNarrative({
      monthlyMarginPressure: summary,
      prioritizedInsights: [
        {
          id: "insight-1",
          tier: "tier_1",
          decisionTier: "now",
          priority: "critical",
          storyKey: "meat:beef",
          category: "concentration",
          categoryLabel: "Concentration",
          title: "Beef margin compression",
          detail: "Beef concentration is driving spread",
          operatorInsightLine: "Beef dominates plate cost on flagged burgers.",
          consequence: "If ignored, margin stays under pressure this week.",
          impactLine: "~EUR 240/mo",
          monthlyImpactEur: 240,
          suggestedAction: "Standardize beef portions",
          operatorAction: "Re-weigh beef portions on flagged burgers and steaks this prep cycle.",
          actionLabel: "Open recipes",
          target: "/recipes",
        },
      ],
      groupedRecovery: [],
    });
    expect(hero.title).toContain("Beef");
    expect(hero.impactLine).toContain("240");

    const calm = buildCalmOperationalSignal({
      monthlyMarginPressure: summary,
      prioritizedInsights: [],
      categoryPressure: [
        {
          group: "produce",
          label: "Produce",
          trend: "flat",
          pressureLine: "Stable",
          operationalLine: "Stable line",
          interpretiveLine: "Stable line",
          inflationVs3MoPct: 1,
        },
      ],
    });
    expect(calm.title).toBe("Operationally calm this week");
    expect(calm.bullets.length).toBeGreaterThan(0);
  });

  it("builds deterministic operational windows for 30/90/180 days", () => {
    const windows = buildOperationalWindows(new Date("2026-05-27T00:00:00.000Z"));
    expect(windows.map((w) => w.key)).toEqual([
      "last_30_days",
      "last_3_months",
      "last_6_months",
    ]);
    expect(windows[0]?.startsAtIso.startsWith("2026-04-27")).toBe(true);
    expect(windows[1]?.startsAtIso.startsWith("2026-02-26")).toBe(true);
    expect(windows[2]?.startsAtIso.startsWith("2025-11-28")).toBe(true);
  });

  it("builds grouped operational synthesis with deduped supplier switches", () => {
    const data = {
      ingredients: [
        { id: "beef-1", name: "Novilho Vazia", unit: "kg", current_price: 12, purchase_quantity: 1 },
        { id: "sauce-1", name: "BBQ Sauce", unit: "kg", current_price: 4, purchase_quantity: 1 },
      ],
      recipes: [
        beefRecipe("r1", "Burger A", 0.2),
        beefRecipe("r2", "Burger B", 0.18),
      ],
      invoices: [
        { id: "inv-1", supplier_name: "A Supplier", total: 120, created_at: "2026-05-01T00:00:00.000Z" },
      ],
      priceHistory: [
        {
          id: "h1",
          ingredient_id: "beef-1",
          invoice_id: "inv-1",
          ingredient_name: "Novilho Vazia",
          supplier_name: "Alpha",
          ingredient_unit: "kg",
          previous_price: 10,
          new_price: 10,
          delta: 0,
          delta_percent: 0,
          created_at: "2026-03-01T00:00:00.000Z",
        },
        {
          id: "h2",
          ingredient_id: "beef-1",
          invoice_id: "inv-1",
          ingredient_name: "Novilho Vazia",
          supplier_name: "Beta",
          ingredient_unit: "kg",
          previous_price: 10,
          new_price: 11,
          delta: 1,
          delta_percent: 10,
          created_at: "2026-04-01T00:00:00.000Z",
        },
        {
          id: "h3",
          ingredient_id: "beef-1",
          invoice_id: "inv-1",
          ingredient_name: "Novilho Vazia",
          supplier_name: "Beta",
          ingredient_unit: "kg",
          previous_price: 11,
          new_price: 11,
          delta: 0,
          delta_percent: 0,
          created_at: "2026-04-05T00:00:00.000Z",
        },
        {
          id: "h4",
          ingredient_id: "beef-1",
          invoice_id: "inv-1",
          ingredient_name: "Novilho Vazia",
          supplier_name: "Alpha",
          ingredient_unit: "kg",
          previous_price: 11,
          new_price: 9.5,
          delta: -1.5,
          delta_percent: -13.6,
          created_at: "2026-05-01T00:00:00.000Z",
        },
      ],
    };

    const alerts: MarginAlertItem[] = [
      {
        id: "recipe-margin-r1",
        kind: "recipe_margin_deterioration",
        sectionId: "critical_margin_risks",
        severity: "high",
        title: "Modeled margin slip — Burger A",
        context: "Cost increase reduced gross margin materially.",
        suggestedAction: "Review",
        actionLabel: "Open",
        target: "/recipes",
        meta: [],
        signals: [],
        priority: 6200,
      },
      {
        id: "recipe-margin-r1-duplicate",
        kind: "recipe_margin_deterioration",
        sectionId: "critical_margin_risks",
        severity: "watch",
        title: "Modeled margin slip — Burger A",
        context: "Duplicate lower priority line",
        suggestedAction: "Review",
        actionLabel: "Open",
        target: "/recipes",
        meta: [],
        signals: [],
        priority: 1000,
      },
    ];

    const view = buildSynthesisViewModel({ data, alerts });
    const groups = view.operationalSynthesisGroups;
    expect(view.operationalWindows).toHaveLength(3);
    expect(groups.supplierMovements.largestIncreases.length).toBeGreaterThan(0);
    expect(groups.supplierMovements.largestIncreases[0]?.narrative.length).toBeGreaterThan(10);
    expect(groups.supplierSwitchImpacts.badSwitches.length).toBe(1);
    expect(groups.supplierSwitchImpacts.goodSwitches.length).toBe(1);
    expect(groups.supplierSwitchImpacts.badSwitches[0]?.narrative).toMatch(/Novilho|beef/i);
    expect(groups.supplierSwitchImpacts.badSwitches[0]?.consequence.length).toBeGreaterThan(10);
    expect(groups.recipeMarginMovements.worsening[0]?.normalizedPriority).toBe("warning");
    expect(groups.recipeMarginMovements.worsening[0]?.headline).toMatch(/Burger A/i);
    expect(groups.recipeMarginMovements.worsening[0]?.trendStatus).toBe("worsening");
    expect(groups.recipeMarginMovements.worsening).toHaveLength(1);
    expect(MIN_MEANINGFUL_SUPPLIER_CHANGE_PCT).toBe(2);
    expect(groups.stableOperationalAreas.highOperationalExposureIngredients.length).toBeGreaterThan(0);
    expect(groups.stableOperationalAreas.categories.length).toBeGreaterThan(0);
    expect(groups.recoverySignals.length).toBeGreaterThanOrEqual(0);
  });

  it("builds operational trends panels with four subsections each", () => {
    const data = {
      ingredients: [
        { id: "beef-1", name: "Novilho Vazia", unit: "kg", current_price: 12, purchase_quantity: 1 },
      ],
      recipes: [beefRecipe("r1", "Burger A", 0.2)],
      invoices: [],
      priceHistory: [
        {
          id: "h1",
          ingredient_id: "beef-1",
          invoice_id: "inv-1",
          ingredient_name: "Novilho Vazia",
          supplier_name: "Alpha",
          ingredient_unit: "kg",
          previous_price: 10,
          new_price: 11,
          delta: 1,
          delta_percent: 10,
          created_at: "2026-04-01T00:00:00.000Z",
        },
      ],
    };
    const view = buildSynthesisViewModel({ data, alerts: [] });
    const panels = buildOperationalTrendsPanels({
      operationalSynthesisGroups: view.operationalSynthesisGroups,
      monthlyMarginPressure: view.monthlyMarginPressure,
      prioritizedInsights: view.prioritizedInsights,
      alerts: [],
      categoryPressure: view.categoryPressure,
      data,
      operationalWindows: view.operationalWindows,
    });

    for (const panel of [panels.last90Days, panels.last6Months]) {
      expect(panel.supplierMovement.bullets.length).toBeGreaterThan(0);
      expect(panel.marginMovement.bullets.length).toBeGreaterThan(0);
      expect(panel.procurementSignals.bullets.length).toBeGreaterThan(0);
      expect(panel.operationalRecommendation.bullets.length).toBeGreaterThan(0);
      expect(panel.supplierMovement.items.length).toBe(panel.supplierMovement.bullets.length);
    }
  });

  it("emits real supplier names and margin ranges in trend panel items", () => {
    const data = {
      ingredients: [
        { id: "beef-1", name: "Novilho Vazia", unit: "kg", current_price: 12, purchase_quantity: 1 },
      ],
      recipes: [beefRecipe("r1", "Steakhouse Burger", 0.2)],
      invoices: [
        { id: "inv-1", supplier_name: "Alpha Foods", total: 120, created_at: "2026-04-01T00:00:00.000Z" },
      ],
      priceHistory: [
        {
          id: "h1",
          ingredient_id: "beef-1",
          invoice_id: "inv-1",
          ingredient_name: "Novilho Vazia",
          supplier_name: "Alpha Foods",
          ingredient_unit: "kg",
          previous_price: 10,
          new_price: 11.5,
          delta: 1.5,
          delta_percent: 15,
          created_at: "2026-04-01T00:00:00.000Z",
        },
        {
          id: "h2",
          ingredient_id: "beef-1",
          invoice_id: "inv-1",
          ingredient_name: "Novilho Vazia",
          supplier_name: "Beta Lane",
          ingredient_unit: "kg",
          previous_price: 11.5,
          new_price: 12.5,
          delta: 1,
          delta_percent: 8.7,
          created_at: "2026-04-15T00:00:00.000Z",
        },
      ],
    };

    const alerts: MarginAlertItem[] = [
      {
        id: "recipe-margin-r1",
        kind: "recipe_margin_deterioration",
        sectionId: "critical_margin_risks",
        severity: "high",
        title: "Modeled margin slip — Steakhouse Burger",
        context:
          "After the latest invoice-driven unit costs, modeled gross margin fell from about 71% to 66% (food cost €4.20 → €4.80 per portion).",
        suggestedAction: "Review",
        actionLabel: "Open",
        target: "/recipes",
        meta: [{ label: "Detected", value: "2026-04-01T00:00:00.000Z" }],
        signals: [],
        priority: 6200,
      },
    ];

    expect(parseRecipeMarginRangeFromAlert(alerts[0]!)).toEqual({
      marginFromPct: 71,
      marginToPct: 66,
    });

    const view = buildSynthesisViewModel({ data, alerts });
    expect(view.operationalSynthesisGroups.recipeMarginMovements.worsening).toHaveLength(1);
    expect(view.operationalSynthesisGroups.recipeMarginMovements.worsening[0]?.marginFromPct).toBe(71);

    const panels = buildOperationalTrendsPanels({
      operationalSynthesisGroups: view.operationalSynthesisGroups,
      monthlyMarginPressure: view.monthlyMarginPressure,
      prioritizedInsights: view.prioritizedInsights,
      alerts,
      categoryPressure: view.categoryPressure,
      data,
      operationalWindows: view.operationalWindows,
    });

    const supplierLabels = panels.last90Days.supplierMovement.items.map((item) => item.label).join(" ");
    expect(supplierLabels).toMatch(/Alpha Foods|Beta Lane/i);

    const marginItem = panels.last90Days.marginMovement.items.find((item) =>
      /Steakhouse Burger/i.test(item.label),
    );
    expect(marginItem?.label).toMatch(/71%.*66%.*90 days/i);
    expect(marginItem?.expandable?.bullets.length).toBeGreaterThan(0);

    const switchItem = panels.last90Days.procurementSignals.items.find((item) =>
      /Switch memory/i.test(item.label),
    );
    expect(switchItem?.label).toMatch(/Alpha Foods.*Beta Lane|Beta Lane.*Alpha Foods/i);
  });

  it("groups duplicate concentration insights in the action queue", () => {
    const data = {
      ingredients: [
        { id: "beef-1", name: "Novilho Vazia", unit: "kg", current_price: 10, purchase_quantity: 1 },
        { id: "side-1", name: "Salad mix", unit: "kg", current_price: 4, purchase_quantity: 1 },
      ],
      recipes: [beefRecipe("r1", "Burger A", 0.25), beefRecipe("r2", "Burger B", 0.22)],
      priceHistory: [],
      invoices: [],
    };
    const alerts: MarginAlertItem[] = [
      {
        id: "high-contribution|r1|beef-1",
        kind: "cost_concentration",
        sectionId: "cost_concentration",
        severity: "watch",
        title: "Novilho Vazia is 78% of Burger A cost",
        context: "ctx",
        suggestedAction: "Review portion",
        actionLabel: "Open",
        target: "/recipes",
        meta: [
          { label: "Cost share", value: "78%" },
          { label: "Recipe", value: "Burger A" },
        ],
        signals: [],
        priority: 5000,
      },
      {
        id: "high-contribution|r2|beef-1",
        kind: "cost_concentration",
        sectionId: "cost_concentration",
        severity: "watch",
        title: "Novilho Vazia is 76% of Burger B cost",
        context: "ctx",
        suggestedAction: "Review portion",
        actionLabel: "Open",
        target: "/recipes",
        meta: [
          { label: "Cost share", value: "76%" },
          { label: "Recipe", value: "Burger B" },
        ],
        signals: [],
        priority: 4800,
      },
    ];

    const view = buildSynthesisViewModel({ data, alerts });
    expect(view.nowInsights.length + view.monitorInsights.length).toBeLessThanOrEqual(2);
    expect(view.actionQueue.length).toBeLessThanOrEqual(2);
    const beefCard = view.actionQueue.find((c) => /beef/i.test(c.title));
    expect(beefCard?.affectedScope).toMatch(/Burger/);
  });
});
