import { createFileRoute } from "@tanstack/react-router";
import { AppShell, Card } from "@/components/AppShell";
import { Plus, TrendingUp, TrendingDown } from "lucide-react";

import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/recipes")({
  head: () => ({
    meta: [
      { title: "Recipes — Marginly" },
      {
        name: "description",
        content: "Track recipe food cost and margin per dish.",
      },
    ],
  }),
  component: RecipesPage,
});

type RecipeIngredient = {
  quantity: number | null;
  ingredients: {
  name: string | null;
  current_price: number | null;
  purchase_quantity: number | null;
} | null;
};

type RecipeRow = {
  id: string;
  name: string;
  selling_price: number | null;
  type: string | null;
  recipe_ingredients: RecipeIngredient[] | null;
};

function RecipesPage() {
  const { user } = useAuth();

  const [recipes, setRecipes] = useState<RecipeRow[]>([]);
  const [recipeCosts, setRecipeCosts] = useState<Record<string, number>>({});
  const [selectedRecipe, setSelectedRecipe] =
    useState<RecipeRow | null>(null);

  const [detailOpen, setDetailOpen] = useState(false);

  useEffect(() => {
    if (!user) return;

    const load = async () => {
      const { data: recipesData, error } = await supabase
        .from("recipes")
        .select(`
          id,
          name,
          selling_price,
          type,
          recipe_ingredients!recipe_ingredients_recipe_id_fkey (
            quantity,
            ingredients (
            name,
            current_price,
            purchase_quantity
           )
            )
          )
        `)
        .order("name", { ascending: true });

      console.log(error);

      setRecipes(recipesData as any);

      const costs: Record<string, number> = {};

      (recipesData ?? []).forEach((recipe: any) => {
        const total =
          recipe.recipe_ingredients?.reduce(
            (sum: number, ri: any) => {
              const ingredientPrice =
                Number(ri.ingredients?.current_price ?? 0);

              const purchaseQty =
                Number(ri.ingredients?.purchase_quantity ?? 1);

              const qty =
                Number(ri.quantity ?? 0);

              const unitCost =
                ingredientPrice / purchaseQty;

              return sum + unitCost * qty;
            },
            0
          ) ?? 0;

        costs[recipe.id] = total;
      });

      setRecipeCosts(costs);
    };

    load();
  }, [user]);

  return (
    <AppShell
      title="Recipes"
      subtitle="Per-dish food cost, margin and contribution."
      action={
        <button className="inline-flex items-center gap-2 bg-foreground text-background rounded-lg px-3.5 py-2 text-sm font-medium hover:opacity-90">
          <Plus className="h-4 w-4" />
          New recipe
        </button>
      }
    >
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {(recipes ?? []).map((r) => {
          const price = r.selling_price ?? 0;

          const cost =
            Number(recipeCosts?.[r.id] ?? 0);

          const margin =
            price > 0
              ? ((price - cost) / price) * 100
              : 0;

          const fc =
            price > 0
              ? (cost / price) * 100
              : 0;

          const healthy = margin >= 65;

          return (
            <Card
              key={r.id}
              className="hover:border-foreground/20 transition-colors"
            >
              <button
                type="button"
                onClick={() => {
                  setSelectedRecipe(r);
                  setDetailOpen(true);
                }}
                className="w-full h-full text-left flex flex-col cursor-pointer"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <div className="text-xs text-muted-foreground">
                      {r.type}
                    </div>

                    <div className="text-base font-semibold mt-0.5">
                      {r.name}
                    </div>
                  </div>

                  <div
                    className={`inline-flex items-center gap-1 text-xs font-medium ${
                      healthy
                        ? "text-success"
                        : "text-destructive"
                    }`}
                  >
                    {healthy ? (
                      <TrendingUp className="h-3.5 w-3.5" />
                    ) : (
                      <TrendingDown className="h-3.5 w-3.5" />
                    )}

                    Gross Margin {margin.toFixed(0)}%
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                  <Mini
                    label="Price"
                    value={`€${r.selling_price ?? 0}`}
                  />

                  <Mini
                    label="Food Cost"
                    value={`€${cost.toFixed(2)}`}
                  />

                  <Mini
                    label="Sold"
                    value="-"
                  />
                </div>

                <div className="mt-4">
                  <div className="flex justify-between text-xs text-muted-foreground mb-1.5">
                    <span>Food Cost %</span>

                    <span className="tabular-nums">
                      {fc.toFixed(1)}%
                    </span>
                  </div>

                  <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                    <div
                      className={`h-full rounded-full ${
                        fc > 35
                          ? "bg-destructive"
                          : fc > 30
                          ? "bg-warning"
                          : "bg-success"
                      }`}
                      style={{
                        width: `${Math.min(fc * 2, 100)}%`,
                      }}
                    />
                  </div>
                </div>
              </button>
            </Card>
          );
        })}
      </div>

      {detailOpen && selectedRecipe && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-6">
          <div className="bg-background border border-border rounded-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto p-6">

            <div className="flex items-start justify-between mb-6">
              <div>
                <div className="text-3xl font-bold">
                  {selectedRecipe.name}
                </div>

                <div className="mt-2 text-muted-foreground">
                  {selectedRecipe.type}
                </div>
              </div>

              <button
                onClick={() => setDetailOpen(false)}
                className="text-sm border border-border rounded-lg px-3 py-2"
              >
                Close
              </button>
            </div>

            <div className="grid grid-cols-3 gap-4 mb-8">
              <div className="rounded-xl border border-border p-4">
                <div className="text-sm text-muted-foreground">
                  Selling price
                </div>

                <div className="text-3xl font-bold mt-1">
                  €{selectedRecipe.selling_price ?? 0}
                </div>
              </div>

              <div className="rounded-xl border border-border p-4">
                <div className="text-sm text-muted-foreground">
                  Total cost
                </div>

                <div className="text-3xl font-bold mt-1">
                  €
                  {Number(
                    recipeCosts[selectedRecipe.id] ?? 0
                  ).toFixed(2)}
                </div>
              </div>

              <div className="rounded-xl border border-border p-4">
                <div className="text-sm text-muted-foreground">
                  Gross Margin %
                </div>

                <div className="text-3xl font-bold mt-1 text-success">
                  {(
                    (
                      ((selectedRecipe.selling_price ?? 0) -
                        Number(
                          recipeCosts[selectedRecipe.id] ?? 0
                        )) /
                      (selectedRecipe.selling_price ?? 1)
                    ) * 100
                  ).toFixed(1)}
                  %
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-border overflow-hidden">
              <div className="px-5 py-4 border-b border-border font-semibold">
                Recipe lines
              </div>

              <table className="w-full text-sm">
                <thead className="bg-muted/40">
                  <tr>
                    <th className="text-left px-5 py-3">
                      Ingredient
                    </th>

                    <th className="text-right px-5 py-3">
                      Qty
                    </th>

                    <th className="text-right px-5 py-3">
                      Unit cost
                    </th>

                    <th className="text-right px-5 py-3">
                      Line cost
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {selectedRecipe.recipe_ingredients?.map(
                    (ri, idx) => {
                      const ingredientPrice =
                        Number(
                          ri.ingredients?.current_price ?? 0
                        );

                      const purchaseQty =
                        Number(
                          ri.ingredients?.purchase_quantity ?? 1
                        );

                      const qty =
                        Number(ri.quantity ?? 0);

                      const unitCost =
                        ingredientPrice / purchaseQty;

                      const lineCost =
                        unitCost * qty;

                      return (
                        <tr
                          key={idx}
                          className="border-t border-border"
                        >
                          <td className="px-5 py-3">
                            {ri.ingredients?.name ?? "-"}
                          </td>

                          <td className="px-5 py-3 text-right">
                            {qty}
                          </td>

                          <td className="px-5 py-3 text-right">
                            €{unitCost.toFixed(4)}
                          </td>

                          <td className="px-5 py-3 text-right font-medium">
                            €{lineCost.toFixed(2)}
                          </td>
                        </tr>
                      );
                    }
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </AppShell>
    );
}
 
function Mini({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-lg bg-muted/50 border border-border py-2">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </div>

      <div className="text-sm font-semibold tabular-nums">
        {value}
      </div>
    </div>
  );
}

