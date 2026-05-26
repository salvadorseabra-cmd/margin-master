import { describe, expect, it } from "vitest";
import {
  buildCategoryPressureRows,
  buildCostCategorySlices,
  buildExecutiveSummary,
  buildMarginBriefingCards,
  buildMenuDependencies,
  buildOperationalPulseLine,
  buildPortfolioCostExposure,
  buildPurchasingMovements,
  buildRecommendedActions,
  buildRecoveryOpportunities,
  buildSupplierIntelligence,
  buildTodaysMarginRisks,
  buildTopOperationalExposures,
  buildWeeklyChangeFeed,
  collectOperationalRecommendations,
  dedupeOperationalSignals,
  finalizeOperationalRecommendations,
  formatBriefingHeadline,
  inferCostCategory,
} from "@/lib/operational-intelligence-view";
import type { MarginAlertItem } from "@/lib/margin-alert-data";

describe("operational-intelligence-view", () => {
  it("infers meat category from novilho", () => {
    expect(inferCostCategory("Novilho Vazia")).toBe("meat");
  });

  it("infers sauces and beverage categories", () => {
    expect(inferCostCategory("Hellmann Mayo")).toBe("sauces");
    expect(inferCostCategory("Coca Cola 33cl")).toBe("beverage");
  });

  it("dedupes alerts by ingredient id", () => {
    const alerts: MarginAlertItem[] = [
      {
        id: "price-increase-ing-1",
        kind: "price_increase",
        sectionId: "supplier_anomalies",
        severity: "watch",
        title: "Beef moved up",
        context: "ctx",
        suggestedAction: "act",
        actionLabel: "Go",
        target: "/ingredients",
        meta: [],
        signals: [],
        priority: 100,
      },
      {
        id: "stale-price-ing-1",
        kind: "stale_price",
        sectionId: "supplier_anomalies",
        severity: "info",
        title: "Beef stale",
        context: "ctx2",
        suggestedAction: "act2",
        actionLabel: "Go",
        target: "/ingredients",
        meta: [],
        signals: [],
        priority: 50,
      },
    ];
    const deduped = dedupeOperationalSignals(alerts);
    expect(deduped).toHaveLength(1);
    expect(deduped[0]?.id).toBe("price-increase-ing-1");
  });

  it("excludes stale pricing from margin briefing hero", () => {
    const alerts: MarginAlertItem[] = [
      {
        id: "stale-price-ing-1",
        kind: "stale_price",
        sectionId: "supplier_anomalies",
        severity: "info",
        title: "Flour pricing is stale",
        context: "ctx",
        suggestedAction: "Sync",
        actionLabel: "Go",
        target: "/ingredients",
        meta: [],
        signals: [],
        priority: 50,
      },
      {
        id: "price-increase-ing-2",
        kind: "price_increase",
        sectionId: "supplier_anomalies",
        severity: "high",
        title: "Novilho cost moved up",
        context: "ctx",
        suggestedAction: "Review",
        actionLabel: "Go",
        target: "/ingredients",
        meta: [
          { label: "Movement", value: "Up 8%" },
          { label: "Recipes affected", value: "3" },
        ],
        signals: [],
        priority: 200,
      },
    ];
    const cards = buildMarginBriefingCards(
      { ingredients: [], recipes: [], priceHistory: [], invoices: [] },
      alerts,
    );
    expect(cards).toHaveLength(1);
    expect(cards[0]?.headline).toContain("Novilho");
    expect(cards[0]?.headline).toContain("+8%");
  });

  it("builds today's margin risks with estimated monthly impact and pressure source", () => {
    const data = {
      ingredients: [
        { id: "ing-1", name: "Novilho", unit: "kg", current_price: 10, purchase_quantity: 1 },
      ],
      recipes: [
        {
          id: "r1",
          name: "Burger A",
          selling_price: 12,
          type: "menu",
          recipe_ingredients: [
            {
              id: "l1",
              recipe_id: "r1",
              ingredient_id: "ing-1",
              quantity: 0.2,
              unit: "kg",
              created_at: "",
              ingredients: {
                id: "ing-1",
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
        id: "price-increase-ing-1",
        kind: "price_increase",
        sectionId: "supplier_anomalies",
        severity: "high",
        title: "Novilho cost moved up",
        context: "Invoice spike",
        suggestedAction: "Review supplier",
        actionLabel: "Open",
        target: "/ingredients",
        meta: [
          { label: "Movement", value: "Up 10%" },
          { label: "Recipes affected", value: "1" },
          { label: "Supplier", value: "Metro" },
        ],
        signals: [],
        priority: 200,
      },
    ];
    const slices = buildCostCategorySlices(buildPortfolioCostExposure(data));
    const risks = buildTodaysMarginRisks(data, alerts, slices);
    expect(risks[0]?.estimatedMonthlyImpact).toMatch(/Est\./);
    expect(risks[0]?.estimatedMonthlyImpact).toMatch(/\/mo/);
    expect(risks[0]?.event).toContain("Novilho");
    expect(risks[0]?.pressureSource).toContain("Novilho");
    expect(risks[0]?.whyItMatters.length).toBeGreaterThan(10);
  });

  it("formats recipe below target briefing with margin pts", () => {
    const alert: MarginAlertItem = {
      id: "recipe-margin-r1",
      kind: "recipe_below_target",
      sectionId: "critical_margin_risks",
      severity: "watch",
      title: "Classic Burger below target margin",
      context: "ctx",
      suggestedAction: "Review",
      actionLabel: "Open",
      target: "/recipes",
      meta: [
        { label: "Gross margin", value: "58%" },
        { label: "Below target", value: "7 pts" },
      ],
      signals: [],
      priority: 100,
    };
    expect(formatBriefingHeadline(alert)).toContain("Classic Burger");
    expect(formatBriefingHeadline(alert)).toContain("58%");
  });

  it("builds portfolio exposure from recipe lines with recipe count", () => {
    const rows = buildPortfolioCostExposure({
      ingredients: [
        {
          id: "ing-1",
          name: "Novilho",
          unit: "kg",
          current_price: 10,
          purchase_quantity: 1,
        },
      ],
      recipes: [
        {
          id: "r1",
          name: "Burger",
          selling_price: 20,
          type: "menu",
          recipe_ingredients: [
            {
              id: "l1",
              recipe_id: "r1",
              ingredient_id: "ing-1",
              quantity: 2,
              unit: "kg",
              created_at: "",
              ingredients: {
                id: "ing-1",
                name: "Novilho",
                unit: "kg",
                current_price: 10,
                purchase_quantity: 1,
              },
            },
          ],
        },
        {
          id: "r2",
          name: "Steak",
          selling_price: 30,
          type: "menu",
          recipe_ingredients: [
            {
              id: "l2",
              recipe_id: "r2",
              ingredient_id: "ing-1",
              quantity: 1,
              unit: "kg",
              created_at: "",
              ingredients: {
                id: "ing-1",
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
    });
    expect(rows[0]?.ingredientName).toBe("Novilho");
    expect(rows[0]?.costSharePct).toBe(100);
    expect(rows[0]?.recipeCount).toBe(2);
    expect(rows[0]?.monthlyModeledExposureEur).toBeGreaterThan(0);
    expect(rows[0]?.sensitivityLine).toMatch(/10% increase/);
  });

  it("ranks top operational exposures by composite score not recipe count alone", () => {
    const data = {
      ingredients: [
        { id: "i1", name: "Novilho", unit: "kg", current_price: 10, purchase_quantity: 1 },
        { id: "i2", name: "Sal", unit: "kg", current_price: 0.5, purchase_quantity: 1 },
      ],
      recipes: [
        {
          id: "r1",
          name: "Burger",
          selling_price: 20,
          type: "menu",
          recipe_ingredients: [
            {
              id: "l1",
              recipe_id: "r1",
              ingredient_id: "i1",
              quantity: 1,
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
        {
          id: "r2",
          name: "A",
          selling_price: 5,
          type: "menu",
          recipe_ingredients: [
            {
              id: "l2",
              recipe_id: "r2",
              ingredient_id: "i2",
              quantity: 0.01,
              unit: "kg",
              created_at: "",
              ingredients: {
                id: "i2",
                name: "Sal",
                unit: "kg",
                current_price: 0.5,
                purchase_quantity: 1,
              },
            },
          ],
        },
        {
          id: "r3",
          name: "B",
          selling_price: 5,
          type: "menu",
          recipe_ingredients: [
            {
              id: "l3",
              recipe_id: "r3",
              ingredient_id: "i2",
              quantity: 0.01,
              unit: "kg",
              created_at: "",
              ingredients: {
                id: "i2",
                name: "Sal",
                unit: "kg",
                current_price: 0.5,
                purchase_quantity: 1,
              },
            },
          ],
        },
        {
          id: "r4",
          name: "C",
          selling_price: 5,
          type: "menu",
          recipe_ingredients: [
            {
              id: "l4",
              recipe_id: "r4",
              ingredient_id: "i2",
              quantity: 0.01,
              unit: "kg",
              created_at: "",
              ingredients: {
                id: "i2",
                name: "Sal",
                unit: "kg",
                current_price: 0.5,
                purchase_quantity: 1,
              },
            },
          ],
        },
      ],
      priceHistory: [],
      invoices: [],
    };
    const top = buildTopOperationalExposures(data, 2);
    expect(top[0]?.ingredientName).toBe("Novilho");
    expect(top[0]?.operationalScore).toBeGreaterThan(top[1]?.operationalScore ?? 0);
  });

  it("groups exposure into category slices", () => {
    const rows = buildPortfolioCostExposure({
      ingredients: [
        { id: "i1", name: "Novilho", unit: "kg", current_price: 10, purchase_quantity: 1 },
        { id: "i2", name: "Queijo", unit: "kg", current_price: 5, purchase_quantity: 1 },
      ],
      recipes: [
        {
          id: "r1",
          name: "Burger",
          selling_price: 20,
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
            {
              id: "l2",
              recipe_id: "r1",
              ingredient_id: "i2",
              quantity: 1,
              unit: "kg",
              created_at: "",
              ingredients: {
                id: "i2",
                name: "Queijo",
                unit: "kg",
                current_price: 5,
                purchase_quantity: 1,
              },
            },
          ],
        },
      ],
      priceHistory: [],
      invoices: [],
    });
    const slices = buildCostCategorySlices(rows);
    expect(slices.some((s) => s.group === "meat")).toBe(true);
    expect(slices.some((s) => s.group === "dairy")).toBe(true);
  });

  it("builds category pressure rows with operational lines", () => {
    const data = {
      ingredients: [
        { id: "i1", name: "Novilho", unit: "kg", current_price: 10, purchase_quantity: 1 },
      ],
      recipes: [
        {
          id: "r1",
          name: "Burger",
          selling_price: 20,
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
    const rows = buildCategoryPressureRows(data);
    expect(rows.some((r) => r.label === "Meat")).toBe(true);
    expect(rows[0]?.operationalLine.length).toBeGreaterThan(5);
  });

  it("builds menu dependencies for shared ingredients", () => {
    const data = {
      ingredients: [{ id: "i1", name: "Novilho", unit: "kg", current_price: 10, purchase_quantity: 1 }],
      recipes: [
        {
          id: "r1",
          name: "Burger A",
          selling_price: 12,
          type: "menu",
          recipe_ingredients: [
            {
              id: "l1",
              recipe_id: "r1",
              ingredient_id: "i1",
              quantity: 1,
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
        {
          id: "r2",
          name: "Burger B",
          selling_price: 12,
          type: "menu",
          recipe_ingredients: [
            {
              id: "l2",
              recipe_id: "r2",
              ingredient_id: "i1",
              quantity: 1,
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
    const deps = buildMenuDependencies(data, [], exposure, slices);
    expect(deps.some((d) => d.kind === "shared_ingredient" && d.title.includes("2 recipes"))).toBe(
      true,
    );
  });

  it("caps today's margin risks at five signals", () => {
    const alerts: MarginAlertItem[] = Array.from({ length: 8 }, (_, i) => ({
      id: `price-increase-ing-${i}`,
      kind: "price_increase" as const,
      sectionId: "supplier_anomalies",
      severity: "high" as const,
      title: `Ingredient ${i} cost moved up`,
      context: "ctx",
      suggestedAction: "Review",
      actionLabel: "Go",
      target: "/ingredients",
      meta: [{ label: "Movement", value: `Up ${5 + i}%` }],
      signals: [],
      priority: 200 - i,
    }));
    const risks = buildTodaysMarginRisks(
      { ingredients: [], recipes: [], priceHistory: [], invoices: [] },
      alerts,
      [],
      5,
    );
    expect(risks.length).toBeLessThanOrEqual(5);
  });

  it("varies recommended actions by category with distinct copy", () => {
    const data = {
      ingredients: [
        { id: "i1", name: "Beef", unit: "kg", current_price: 12, purchase_quantity: 1 },
      ],
      recipes: [
        {
          id: "r1",
          name: "Classic Burger",
          selling_price: 10,
          type: "menu",
          recipe_ingredients: [
            {
              id: "l1",
              recipe_id: "r1",
              ingredient_id: "i1",
              quantity: 1,
              unit: "kg",
              created_at: "",
              ingredients: {
                id: "i1",
                name: "Beef",
                unit: "kg",
                current_price: 12,
                purchase_quantity: 1,
              },
            },
          ],
        },
      ],
      priceHistory: [
        {
          id: "h1",
          ingredient_id: "i1",
          ingredient_name: "Beef",
          supplier_name: "Metro",
          ingredient_unit: "kg",
          previous_price: 8,
          new_price: 9,
          delta: 1,
          delta_percent: 12.5,
          created_at: new Date().toISOString(),
          invoice_id: null,
        },
      ],
      invoices: [],
    };
    const alerts: MarginAlertItem[] = [
      {
        id: "price-increase-i1",
        kind: "price_increase",
        sectionId: "supplier_anomalies",
        severity: "high",
        title: "Beef cost moved up",
        context: "Invoice up.",
        suggestedAction: "Validate yield and portion weight on the dominant cost line.",
        actionLabel: "Compare",
        target: "/ingredients",
        meta: [
          { label: "Movement", value: "Up 8%" },
          { label: "Supplier", value: "Metro" },
        ],
        signals: [],
        priority: 200,
      },
      {
        id: "recipe-margin-r1",
        kind: "recipe_below_target",
        sectionId: "critical_margin_risks",
        severity: "watch",
        title: "Classic Burger below target margin",
        context: "Food cost too high.",
        suggestedAction: "Validate yield and portion weight on the dominant cost line.",
        actionLabel: "Open recipe",
        target: "/recipes",
        meta: [{ label: "Largest driver", value: "Beef" }],
        signals: [],
        priority: 100,
      },
    ];
    const actions = buildRecommendedActions(data, alerts, 6);
    const categories = new Set(actions.map((a) => a.category));
    expect(categories.size).toBeGreaterThanOrEqual(2);
    expect(actions[0]?.action).not.toBe(actions[1]?.action);
    expect(actions.every((a) => !a.action.toLowerCase().includes("validate yield"))).toBe(true);
    expect(actions.some((a) => a.category === "supplier_actions")).toBe(true);
    expect(
      actions.some((a) => a.category === "margin_deterioration" || a.category === "price_actions"),
    ).toBe(true);
  });

  it("prioritizes recommended actions by monthly impact descending", () => {
    const data = {
      ingredients: [{ id: "i1", name: "Beef", unit: "kg", current_price: 20, purchase_quantity: 1 }],
      recipes: [
        {
          id: "r1",
          name: "Classic Burger",
          selling_price: 8,
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
                name: "Beef",
                unit: "kg",
                current_price: 20,
                purchase_quantity: 1,
              },
            },
          ],
        },
        {
          id: "r2",
          name: "Side Salad",
          selling_price: 6,
          type: "menu",
          recipe_ingredients: [
            {
              id: "l2",
              recipe_id: "r2",
              ingredient_id: "i2",
              quantity: 0.1,
              unit: "kg",
              created_at: "",
              ingredients: {
                id: "i2",
                name: "Lettuce",
                unit: "kg",
                current_price: 2,
                purchase_quantity: 1,
              },
            },
          ],
        },
      ],
      priceHistory: [
        {
          id: "h1",
          ingredient_id: "i1",
          ingredient_name: "Beef",
          supplier_name: "Metro",
          ingredient_unit: "kg",
          previous_price: 10,
          new_price: 15,
          delta: 5,
          delta_percent: 50,
          created_at: new Date().toISOString(),
          invoice_id: null,
        },
      ],
      invoices: [],
    };
    const alerts: MarginAlertItem[] = [
      {
        id: "price-increase-i1",
        kind: "price_increase",
        sectionId: "supplier_anomalies",
        severity: "high",
        title: "Beef cost moved up",
        context: "Big move.",
        suggestedAction: "Review",
        actionLabel: "Compare",
        target: "/ingredients",
        meta: [{ label: "Movement", value: "Up 50%" }],
        signals: [],
        priority: 300,
      },
      {
        id: "recipe-margin-r2",
        kind: "recipe_below_target",
        sectionId: "critical_margin_risks",
        severity: "watch",
        title: "Side Salad below target margin",
        context: "Small gap.",
        suggestedAction: "Review",
        actionLabel: "Open",
        target: "/recipes",
        meta: [],
        signals: [],
        priority: 50,
      },
    ];
    const actions = buildRecommendedActions(data, alerts, 6);
    for (let i = 1; i < actions.length; i++) {
      expect(actions[i - 1]!.monthlyImpactEur).toBeGreaterThanOrEqual(actions[i]!.monthlyImpactEur);
    }
  });

  it("dedupes duplicate recommendation titles and caps at limit", () => {
    const dupes = [
      {
        id: "a",
        category: "supplier_actions" as const,
        monthlyImpactEur: 100,
        priority: 1,
        dedupeKey: "supplier_actions:i1",
        title: "Same headline",
        why: "why",
        action: "act",
        perPortionImpact: null,
        monthlyImpact: "Est. €100/mo",
        affectedRecipes: 2,
        target: "/ingredients" as const,
        actionLabel: "Go",
        urgency: "now" as const,
      },
      {
        id: "b",
        category: "supplier_actions" as const,
        monthlyImpactEur: 50,
        priority: 1,
        dedupeKey: "supplier_actions:i2",
        title: "Same headline",
        why: "why2",
        action: "act2",
        perPortionImpact: null,
        monthlyImpact: "Est. €50/mo",
        affectedRecipes: 1,
        target: "/ingredients" as const,
        actionLabel: "Go",
        urgency: "monitor" as const,
      },
    ];
    const finalized = finalizeOperationalRecommendations(dupes, 6);
    expect(finalized).toHaveLength(1);
    expect(finalized[0]?.monthlyImpactEur).toBe(100);

    const many = Array.from({ length: 10 }, (_, i) => ({
      ...dupes[0]!,
      id: `x-${i}`,
      dedupeKey: `supplier_actions:ing-${i}`,
      title: `Unique ${i}`,
      monthlyImpactEur: 200 - i,
    }));
    expect(finalizeOperationalRecommendations(many, 6)).toHaveLength(6);
  });

  it("excludes stale_price from recommended action cards", () => {
    const data = {
      ingredients: [],
      recipes: [],
      priceHistory: [],
      invoices: [],
    };
    const alerts: MarginAlertItem[] = [
      {
        id: "stale-price-i1",
        kind: "stale_price",
        sectionId: "supplier_anomalies",
        severity: "info",
        title: "Flour pricing is stale",
        context: "Sync needed",
        suggestedAction: "Sync",
        actionLabel: "Go",
        target: "/ingredients",
        meta: [],
        signals: [],
        priority: 10,
      },
    ];
    const raw = collectOperationalRecommendations(data, alerts);
    const actions = buildRecommendedActions(data, alerts, 6);
    expect(raw.every((r) => r.category !== "supplier_actions" || !r.title.includes("stale"))).toBe(
      true,
    );
    expect(actions.some((a) => a.title.toLowerCase().includes("stale"))).toBe(false);
  });

  it("builds recommended actions with category labels and impact fields", () => {
    const data = {
      ingredients: [],
      recipes: [
        {
          id: "r1",
          name: "Classic Burger",
          selling_price: 10,
          type: "menu",
          recipe_ingredients: [
            {
              id: "l1",
              recipe_id: "r1",
              ingredient_id: "i1",
              quantity: 1,
              unit: "kg",
              created_at: "",
              ingredients: {
                id: "i1",
                name: "Beef",
                unit: "kg",
                current_price: 5,
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
        id: "recipe-margin-r1",
        kind: "recipe_below_target",
        sectionId: "critical_margin_risks",
        severity: "watch",
        title: "Classic Burger below target margin",
        context: "Food cost too high for price.",
        suggestedAction: "Trim dominant ingredient or raise price.",
        actionLabel: "Open recipe",
        target: "/recipes",
        meta: [
          { label: "Gross margin", value: "50%" },
          { label: "Below target", value: "15 pts" },
          { label: "Largest driver", value: "Beef" },
        ],
        signals: [],
        priority: 100,
      },
    ];
    const actions = buildRecommendedActions(data, alerts, 6);
    expect(actions[0]?.title).toBeTruthy();
    expect(actions[0]?.categoryLabel).toBeTruthy();
    expect(actions[0]?.why).toContain("margin");
    expect(actions[0]?.monthlyImpact ?? actions[0]?.perPortionImpact).toBeTruthy();
  });

  it("purchasing movements includes calm line when no inflation", () => {
    const movements = buildPurchasingMovements(
      { ingredients: [], recipes: [], priceHistory: [], invoices: [] },
      [],
    );
    expect(movements.some((f) => f.tone === "calm")).toBe(true);
    expect(movements[0]?.headline.toLowerCase()).toContain("no meaningful");
  });

  it("purchasing movements skips sub-2% noise", () => {
    const data = {
      ingredients: [{ id: "i1", name: "Flour", unit: "kg", current_price: 1, purchase_quantity: 1 }],
      recipes: [],
      priceHistory: [
        {
          id: "h1",
          ingredient_id: "i1",
          ingredient_name: "Flour",
          supplier_name: null,
          ingredient_unit: "kg",
          previous_price: 1,
          new_price: 1.01,
          delta: 0.01,
          delta_percent: 1,
          created_at: new Date().toISOString(),
          invoice_id: null,
        },
      ],
      invoices: [],
    };
    const movements = buildPurchasingMovements(data, [], 5);
    const hasFlourInflation = movements.some(
      (m) => m.tone === "up" && m.headline.toLowerCase().includes("flour"),
    );
    expect(hasFlourInflation).toBe(false);
  });

  it("builds supplier intelligence spike vs 3mo avg", () => {
    const data = {
      ingredients: [
        { id: "i1", name: "Beef", unit: "kg", current_price: 12, purchase_quantity: 1 },
      ],
      recipes: [
        {
          id: "r1",
          name: "Burger",
          selling_price: 15,
          type: "menu",
          recipe_ingredients: [
            {
              id: "l1",
              recipe_id: "r1",
              ingredient_id: "i1",
              quantity: 0.2,
              unit: "kg",
              created_at: "",
              ingredients: {
                id: "i1",
                name: "Beef",
                unit: "kg",
                current_price: 12,
                purchase_quantity: 1,
              },
            },
          ],
        },
      ],
      priceHistory: [
        {
          id: "h-old",
          ingredient_id: "i1",
          ingredient_name: "Beef",
          supplier_name: "Metro",
          ingredient_unit: "kg",
          previous_price: 8,
          new_price: 9,
          delta: 1,
          delta_percent: null,
          created_at: new Date(Date.now() - 40 * 86_400_000).toISOString(),
          invoice_id: null,
        },
        {
          id: "h-new",
          ingredient_id: "i1",
          ingredient_name: "Beef",
          supplier_name: "Metro",
          ingredient_unit: "kg",
          previous_price: 11,
          new_price: 12,
          delta: 1,
          delta_percent: 9,
          created_at: new Date().toISOString(),
          invoice_id: null,
        },
      ],
      invoices: [],
    };
    const intel = buildSupplierIntelligence(data, "i1");
    expect(intel.spikeVs3MoPct).toBeGreaterThanOrEqual(5);
    expect(intel.spikeMonthlyEur).toBeGreaterThan(0);
  });

  it("builds operational pulse from calm purchasing movements", () => {
    const movements = buildPurchasingMovements(
      { ingredients: [], recipes: [], priceHistory: [], invoices: [] },
      [],
    );
    const line = buildOperationalPulseLine({
      visitDelta: { isFirstVisit: false, lastVisitAt: "2026-01-01", lines: [] },
      purchasingMovements: movements,
      alerts: [],
      data: { ingredients: [], recipes: [], priceHistory: [], invoices: [] },
    });
    expect(line.toLowerCase()).toMatch(/quiet|stable|no meaningful/);
  });

  it("weekly feed wrapper maps purchasing movements", () => {
    const feed = buildWeeklyChangeFeed(
      { ingredients: [], recipes: [], priceHistory: [], invoices: [] },
      [],
      [],
    );
    expect(feed.some((f) => f.tone === "calm")).toBe(true);
  });

  it("builds recovery opportunities capped and excludes recovery from actions", () => {
    const data = {
      ingredients: [
        { id: "i1", name: "Beef", unit: "kg", current_price: 8, purchase_quantity: 1 },
      ],
      recipes: [],
      priceHistory: [
        {
          id: "h1",
          ingredient_id: "i1",
          ingredient_name: "Beef",
          supplier_name: "Metro",
          ingredient_unit: "kg",
          previous_price: 10,
          new_price: 8,
          delta: -2,
          delta_percent: -20,
          created_at: new Date().toISOString(),
          invoice_id: null,
        },
      ],
      invoices: [],
    };
    const alerts: MarginAlertItem[] = [
      {
        id: "price-decrease-i1",
        kind: "price_decrease",
        sectionId: "supplier_anomalies",
        severity: "positive",
        title: "Beef cost moved down",
        context: "Invoice eased.",
        suggestedAction: "Hold price",
        actionLabel: "Open",
        target: "/ingredients",
        meta: [{ label: "Movement", value: "Down 20%" }],
        signals: [],
        priority: 50,
      },
    ];
    const recovery = buildRecoveryOpportunities(data, alerts, [], 5);
    expect(recovery.length).toBeGreaterThan(0);
    expect(recovery.length).toBeLessThanOrEqual(5);
    const actions = buildRecommendedActions(data, alerts, 6);
    expect(actions.every((a) => a.category !== "recovery_opportunities")).toBe(true);
  });

  it("builds executive summary from category pressure and top risk", () => {
    const data = {
      ingredients: [
        { id: "i1", name: "Novilho", unit: "kg", current_price: 10, purchase_quantity: 1 },
      ],
      recipes: [
        {
          id: "r1",
          name: "Burger",
          selling_price: 20,
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
    const slices = buildCostCategorySlices(buildPortfolioCostExposure(data));
    const risks = buildTodaysMarginRisks(data, alerts, slices);
    const summary = buildExecutiveSummary({
      pulseLine: "test pulse",
      categoryPressure: buildCategoryPressureRows(data),
      topRisk: risks[0] ?? null,
      purchasingCalm: false,
    });
    expect(summary.length).toBeGreaterThan(10);
  });
});
