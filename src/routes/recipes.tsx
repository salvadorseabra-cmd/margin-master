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
      { name: "description", content: "Track recipe food cost and margin per dish." },
    ],
  }),
  component: RecipesPage,
});
type RecipeIngredient = {
  quantity: number | null;
  ingredients: {
    price: number | null;
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

  useEffect(() => {
  if (!user) return;

  const load = async () => {
  const { data: recipesData } = await supabase
    .from("recipes")
    .select("*")
    .order("name", { ascending: true });

  setRecipes(recipesData as any);

  const { data: links } = await supabase
    .from("recipe_ingredients")
    .select(`
      recipe_id,
      quantity,
      ingredients (
        price
      )
    `);

  const costs: Record<string, number> = {};

  (links ?? []).forEach((row: any) => {
    const recipeId = row.recipe_id;

    const qty = Number(row.quantity ?? 0);

    const ingredientPrice =
      Number(row.ingredients?.price ?? 0);

    const total = qty * ingredientPrice;

    costs[recipeId] =
      (costs[recipeId] ?? 0) + total;
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
          <Plus className="h-4 w-4" /> New recipe
        </button>
      }
    >
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {(recipes ?? []).map((r) => {
          const price = r.selling_price ?? 0;

  const cost = recipeCosts[r.id] ?? 0;

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
            <Card key={r.id} className="flex flex-col">
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-xs text-muted-foreground">{r.type}</div>
                  <div className="text-base font-semibold mt-0.5">{r.name}</div>
                </div>
                <div className={`inline-flex items-center gap-1 text-xs font-medium ${healthy ? "text-success" : "text-destructive"}`}>
                  {healthy ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
                  {margin.toFixed(0)}%
                </div>
              </div>

              <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                <Mini label="Price" value={`€${r.selling_price ?? 0}`} />
                <Mini label="Cost" value={`€${cost.toFixed(2)}`} />
                <Mini label="Sold" value="-" />
              </div>

              <div className="mt-4">
                <div className="flex justify-between text-xs text-muted-foreground mb-1.5">
                  <span>Food cost</span>
                  <span className="tabular-nums">{fc.toFixed(1)}%</span>
                </div>
                <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                  <div
                    className={`h-full rounded-full ${fc > 35 ? "bg-destructive" : fc > 30 ? "bg-warning" : "bg-success"}`}
                    style={{ width: `${Math.min(fc * 2, 100)}%` }}
                  />
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </AppShell>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-muted/50 border border-border py-2">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-sm font-semibold tabular-nums">{value}</div>
    </div>
  );
}
