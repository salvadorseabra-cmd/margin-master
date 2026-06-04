import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { OperationalIntelligencePage } from "@/components/operational-intelligence/operational-intelligence-page";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Loader2 } from "lucide-react";
import { loadCanonicalIngredientCatalog } from "@/lib/ingredient-catalog-load";
import { getRecentPriceChanges } from "@/lib/ingredient-price-history";
import { PRICE_WINDOW_180_DAYS } from "@/lib/exposure-drill-down";
import { buildMarginAlertsFromSupabase } from "@/lib/margin-alerts";
import { formatVisitDeltaLine } from "@/lib/margin-alert-copy";
import {
  buildOperationalAlertItems,
  buildOperationalHealthPanel,
  buildVisitSnapshotFromAlerts,
  convertLibMarginAlerts,
  finalizeOperationalAlertItems,
  getRecipeMetrics,
  TARGET_MARGIN,
  type MarginAlertData,
  type RecipeIngredientRecord,
  type RecipeRecord,
} from "@/lib/margin-alert-data";
import {
  buildVisitDelta,
  loadLastVisitSnapshot,
  saveVisitSnapshot,
} from "@/lib/margin-alert-visit";

export const Route = createFileRoute("/alerts")({
  head: () => ({
    meta: [
      { title: "Operational Intelligence — Marginly" },
      {
        name: "description",
        content: "Daily margin briefing from invoices, recipe costs, and supplier activity.",
      },
    ],
  }),
  component: AlertsPage,
});

type RecipeIngredientRow = {
  id: string;
  recipe_id: string | null;
  ingredient_id: string | null;
  sub_recipe_id: string | null;
  quantity: number | null;
  unit: string | null;
  created_at: string | null;
};

function AlertsPage() {
  const { user } = useAuth();
  const [data, setData] = useState<MarginAlertData>({
    ingredients: [],
    recipes: [],
    priceHistory: [],
    invoices: [],
  });
  const [libAlertsRaw, setLibAlertsRaw] = useState<
    Awaited<ReturnType<typeof buildMarginAlertsFromSupabase>>
  >([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [visitDelta, setVisitDelta] = useState(() =>
    buildVisitDelta(
      null,
      {
        criticalCount: 0,
        totalAlertCount: 0,
        priceIncreaseCount: 0,
        recipesBelowTarget: 0,
        timestamp: new Date().toISOString(),
      },
      formatVisitDeltaLine,
    ),
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const [
        ingredientsResult,
        recipesResult,
        recipeIngredientsResult,
        historyResult,
        invoicesResult,
        libAlertsResult,
      ] = await Promise.all([
        loadCanonicalIngredientCatalog(
          supabase,
          "current_price, purchase_quantity, purchase_unit, base_unit, created_at, density_g_per_ml",
        ),
        supabase
          .from("recipes")
          .select("id, name, selling_price, type, output_quantity, output_unit")
          .order("name", { ascending: true }),
        supabase
          .from("recipe_ingredients")
          .select("id, recipe_id, ingredient_id, sub_recipe_id, quantity, unit, created_at"),
        getRecentPriceChanges(supabase, PRICE_WINDOW_180_DAYS),
        supabase
          .from("invoices")
          .select("id, supplier_name, total, created_at")
          .gte(
            "created_at",
            new Date(Date.now() - PRICE_WINDOW_180_DAYS * 86_400_000).toISOString(),
          )
          .order("created_at", { ascending: false })
          .limit(200),
        buildMarginAlertsFromSupabase(supabase).catch(() => []),
      ]);

      if (ingredientsResult.error) throw new Error(ingredientsResult.error);
      if (recipesResult.error) throw recipesResult.error;
      if (recipeIngredientsResult.error) throw recipeIngredientsResult.error;

      const ingredients = [...ingredientsResult.rows].sort((a, b) =>
        (a.name ?? "").localeCompare(b.name ?? "", undefined, { sensitivity: "base" }),
      );
      const ingredientById = new Map(ingredients.map((ingredient) => [ingredient.id, ingredient]));
      const recipeIngredients = (recipeIngredientsResult.data ?? []) as RecipeIngredientRow[];
      const recipeLinesByRecipeId = new Map<string, RecipeIngredientRecord[]>();

      for (const line of recipeIngredients) {
        if (!line.recipe_id) continue;
        const recipeLines = recipeLinesByRecipeId.get(line.recipe_id) ?? [];
        recipeLines.push({
          ...line,
          created_at: line.created_at ?? "",
          ingredients: line.ingredient_id ? (ingredientById.get(line.ingredient_id) ?? null) : null,
        });
        recipeLinesByRecipeId.set(line.recipe_id, recipeLines);
      }

      const recipes = (
        (recipesResult.data ?? []) as Omit<RecipeRecord, "recipe_ingredients">[]
      ).map((recipe) => ({
        ...recipe,
        recipe_ingredients: recipeLinesByRecipeId.get(recipe.id) ?? [],
      }));

      setData({
        ingredients,
        recipes,
        priceHistory: Array.isArray(historyResult) ? historyResult : [],
        invoices: invoicesResult.error ? [] : (invoicesResult.data ?? []),
      });
      setLibAlertsRaw(libAlertsResult);
    } catch (err) {
      setData({ ingredients: [], recipes: [], priceHistory: [], invoices: [] });
      setLibAlertsRaw([]);
      setError(err instanceof Error ? err.message : "Could not load alert data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user) {
      load();
      return;
    }
    setData({ ingredients: [], recipes: [], priceHistory: [], invoices: [] });
    setLibAlertsRaw([]);
    setLoading(false);
  }, [load, user]);

  const alertItems = useMemo(() => {
    const local = buildOperationalAlertItems(data);
    const lib = convertLibMarginAlerts(libAlertsRaw);
    return finalizeOperationalAlertItems(local, lib, data);
  }, [data, libAlertsRaw]);

  const recipeMetrics = useMemo(() => getRecipeMetrics(data.recipes), [data.recipes]);
  const recipesBelowTarget = recipeMetrics.filter(
    (metric) => metric.grossMargin !== null && metric.grossMargin < TARGET_MARGIN,
  ).length;

  const health = useMemo(
    () => buildOperationalHealthPanel(data, libAlertsRaw),
    [data, libAlertsRaw],
  );

  useEffect(() => {
    if (loading || error) return;

    const previous = loadLastVisitSnapshot();
    const counts = buildVisitSnapshotFromAlerts(alertItems, recipesBelowTarget);
    const snapshot = {
      timestamp: new Date().toISOString(),
      ...counts,
    };
    setVisitDelta(buildVisitDelta(previous, snapshot, formatVisitDeltaLine));
    saveVisitSnapshot(snapshot);
  }, [loading, error, alertItems, recipesBelowTarget]);

  return (
    <AppShell
      title="Operational Intelligence"
      subtitle="Daily margin signals from invoices, recipe costs, and supplier activity."
    >
      {loading && (
        <div className="rounded-xl border border-border bg-muted/20 p-8 text-center text-sm text-muted-foreground">
          <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
          Loading operational signals
        </div>
      )}

      {!loading && error && (
        <div className="rounded-xl border border-destructive/20 bg-destructive/[0.03] p-4 text-sm text-destructive">
          {error}
        </div>
      )}

      {!loading && !error && (
        <OperationalIntelligencePage
          data={data}
          alerts={alertItems}
          health={health}
          visitDelta={visitDelta}
        />
      )}
    </AppShell>
  );
}
