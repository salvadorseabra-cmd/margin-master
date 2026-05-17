import { createFileRoute } from "@tanstack/react-router";
import { AppShell, Card } from "@/components/AppShell";
import { Plus, Loader2, Pencil, Search, Trash2, X } from "lucide-react";
import { useDeferredValue, useEffect, useMemo, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/ingredients")({
  head: () => ({
    meta: [
      { title: "Ingredient Prices — Marginly" },
      { name: "description", content: "Track ingredient prices and supplier coverage." },
    ],
  }),
  component: IngredientsPage,
});

type Row = {
  id: string;
  name: string;
  unit: string;
  current_price: number | null;
  supplier: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type SortKey = "recent" | "risk" | "usage" | "price" | "missingSupplier";
type IngredientSignal = "High risk" | "Attention" | "Stable";
type RecipeDependency = {
  recipeId: string;
  recipeName: string;
  lineCount: number;
};

function IngredientsPage() {
  const { user } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [usageCounts, setUsageCounts] = useState<Record<string, number>>({});
  const [recipeDependencies, setRecipeDependencies] = useState<Record<string, RecipeDependency[]>>(
    {},
  );
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", unit: "kg", current_price: "", supplier: "" });
  const [editingIngredientId, setEditingIngredientId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<SortKey>("recent");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedIngredientId, setSelectedIngredientId] = useState<string | null>(null);
  const deferredSearchQuery = useDeferredValue(searchQuery);

  const load = async () => {
    setLoading(true);
    setError(null);

    const { data, error } = await supabase
      .from("ingredients")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      setError(error.message);
      setRows([]);
      setUsageCounts({});
      setRecipeDependencies({});
      setLoading(false);
      return;
    }

    setRows((data ?? []) as Row[]);

    const { data: usageData, error: usageError } = await supabase
      .from("recipe_ingredients")
      .select("ingredient_id, recipe_id");

    if (!usageError) {
      const usageRows = (usageData ?? []) as {
        ingredient_id?: string | null;
        recipe_id?: string | null;
      }[];
      const recipeIds = Array.from(
        new Set(usageRows.map((item) => item.recipe_id).filter((id): id is string => Boolean(id))),
      );
      let recipeNameById = new Map<string, string>();

      if (recipeIds.length > 0) {
        const { data: recipeData } = await supabase
          .from("recipes")
          .select("id, name")
          .in("id", recipeIds);
        recipeNameById = new Map(
          ((recipeData ?? []) as { id: string; name?: string | null }[]).map((recipe) => [
            recipe.id,
            recipe.name?.trim() || "Recipe",
          ]),
        );
      }

      const counts = usageRows.reduce((acc: Record<string, number>, item) => {
        if (item.ingredient_id) acc[item.ingredient_id] = (acc[item.ingredient_id] ?? 0) + 1;
        return acc;
      }, {});
      const dependencies = usageRows.reduce((acc: Record<string, RecipeDependency[]>, item) => {
        if (!item.ingredient_id || !item.recipe_id) return acc;
        const existing = acc[item.ingredient_id]?.find(
          (recipe) => recipe.recipeId === item.recipe_id,
        );

        if (existing) {
          existing.lineCount += 1;
          return acc;
        }

        acc[item.ingredient_id] = [
          ...(acc[item.ingredient_id] ?? []),
          {
            recipeId: item.recipe_id,
            recipeName: recipeNameById.get(item.recipe_id) ?? "Recipe",
            lineCount: 1,
          },
        ];
        return acc;
      }, {});

      Object.values(dependencies).forEach((recipes) =>
        recipes.sort((a, b) => a.recipeName.localeCompare(b.recipeName)),
      );

      setUsageCounts(counts);
      setRecipeDependencies(dependencies);
    } else {
      setUsageCounts({});
      setRecipeDependencies({});
    }

    setLoading(false);
  };

  useEffect(() => {
    if (user) load();
  }, [user]);

  const averagePrice = useMemo(() => {
    if (rows.length === 0) return 0;
    const total = rows.reduce((sum, row) => sum + Number(row.current_price ?? 0), 0);
    return total / rows.length;
  }, [rows]);

  const filteredRows = useMemo(() => {
    const query = deferredSearchQuery.trim().toLowerCase();
    if (!query) return rows;

    return rows.filter((row) => {
      const name = row.name.toLowerCase();
      const supplier = row.supplier?.toLowerCase() ?? "";
      return name.includes(query) || supplier.includes(query);
    });
  }, [deferredSearchQuery, rows]);

  const sortedRows = useMemo(() => {
    return [...filteredRows].sort((a, b) => {
      if (sortBy === "risk") {
        const aSignal = getIngredientSignal(a, averagePrice, usageCounts[a.id] ?? 0);
        const bSignal = getIngredientSignal(b, averagePrice, usageCounts[b.id] ?? 0);
        return (
          getSignalPriority(bSignal) - getSignalPriority(aSignal) ||
          getUpdatedTime(b) - getUpdatedTime(a)
        );
      }
      if (sortBy === "price") return Number(b.current_price ?? 0) - Number(a.current_price ?? 0);
      if (sortBy === "usage") return (usageCounts[b.id] ?? 0) - (usageCounts[a.id] ?? 0);
      if (sortBy === "missingSupplier") {
        return (
          Number(hasMissingSupplier(b)) - Number(hasMissingSupplier(a)) ||
          getUpdatedTime(b) - getUpdatedTime(a)
        );
      }
      return getUpdatedTime(b) - getUpdatedTime(a);
    });
  }, [averagePrice, filteredRows, sortBy, usageCounts]);

  const hasActiveSearch = searchQuery.trim().length > 0;

  const attentionCount = rows.filter(
    (row) => getIngredientSignal(row, averagePrice, usageCounts[row.id] ?? 0) !== "Stable",
  ).length;

  const usedIngredientCount = rows.filter((row) => (usageCounts[row.id] ?? 0) > 0).length;

  const supplierCoverageCount = rows.filter((row) => !hasMissingSupplier(row)).length;
  const supplierCoverageValue =
    rows.length > 0 ? `${Math.round((supplierCoverageCount / rows.length) * 100)}%` : "0";

  const selectedIngredient = useMemo(
    () => rows.find((row) => row.id === selectedIngredientId) ?? null,
    [rows, selectedIngredientId],
  );

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSaving(true);
    setError(null);
    const payload = {
      name: form.name,
      unit: form.unit,
      current_price: Number(form.current_price) || 0,
      supplier: form.supplier || null,
    };
    const { error } = editingIngredientId
      ? await supabase.from("ingredients").update(payload).eq("id", editingIngredientId)
      : await supabase.from("ingredients").insert({
          user_id: user.id,
          ...payload,
        });
    setSaving(false);
    if (error) {
      setError(error.message);
      return;
    }
    resetForm();
    load();
  };

  const remove = async (id: string) => {
    await supabase.from("ingredients").delete().eq("id", id);
    if (selectedIngredientId === id) setSelectedIngredientId(null);
    load();
  };

  const resetForm = () => {
    setForm({ name: "", unit: "kg", current_price: "", supplier: "" });
    setEditingIngredientId(null);
    setOpen(false);
  };

  const beginEdit = (ingredient: Row) => {
    setSelectedIngredientId(null);
    setForm({
      name: ingredient.name,
      unit: ingredient.unit,
      current_price: String(Number(ingredient.current_price ?? 0)),
      supplier: ingredient.supplier ?? "",
    });
    setEditingIngredientId(ingredient.id);
    setOpen(true);
  };

  return (
    <AppShell
      title="Ingredient prices"
      subtitle="Supplier prices and recipe dependency visibility."
      action={
        <button
          onClick={() => {
            if (open && !editingIngredientId) {
              setOpen(false);
              return;
            }
            setForm({ name: "", unit: "kg", current_price: "", supplier: "" });
            setEditingIngredientId(null);
            setOpen(true);
          }}
          className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-foreground px-3.5 py-2 text-sm font-medium text-background shadow-sm transition hover:-translate-y-px hover:opacity-90 active:translate-y-0"
        >
          <Plus className="h-4 w-4" /> Add ingredient
        </button>
      }
    >
      {open && (
        <Card className="mb-3">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold">
                {editingIngredientId ? "Edit ingredient" : "Add ingredient"}
              </div>
              <div className="text-xs text-muted-foreground">
                {editingIngredientId
                  ? "Update price, unit or supplier."
                  : "Add a supplier price to the ingredient library."}
              </div>
            </div>
            {editingIngredientId && (
              <button
                type="button"
                onClick={resetForm}
                className="cursor-pointer rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                Cancel
              </button>
            )}
          </div>
          <form onSubmit={save} className="grid items-end gap-3 sm:grid-cols-5">
            <Field label="Name">
              <input
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="input"
                placeholder="Beef tenderloin"
              />
            </Field>
            <Field label="Unit">
              <input
                value={form.unit}
                onChange={(e) => setForm({ ...form, unit: e.target.value })}
                className="input"
                placeholder="kg"
              />
            </Field>
            <Field label="Price (€)">
              <input
                required
                type="number"
                step="0.01"
                value={form.current_price}
                onChange={(e) => setForm({ ...form, current_price: e.target.value })}
                className="input"
                placeholder="0.00"
              />
            </Field>
            <Field label="Supplier">
              <input
                value={form.supplier}
                onChange={(e) => setForm({ ...form, supplier: e.target.value })}
                className="input"
                placeholder="Boucherie Lafayette"
              />
            </Field>
            <button
              disabled={saving}
              type="submit"
              className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg bg-foreground px-3.5 py-2 text-sm font-medium text-background transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}{" "}
              {editingIngredientId ? "Update" : "Save"}
            </button>
          </form>
          {error && <div className="text-xs text-destructive mt-2">{error}</div>}
          <style>{`.input{margin-top:.25rem;width:100%;border-radius:.5rem;border:1px solid var(--color-input);background:var(--color-card);padding:.55rem .75rem;font-size:.875rem}`}</style>
        </Card>
      )}

      <div className="mb-3 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Ingredients" value={rows.length.toString()} helper="Price library" />
        <Kpi label="Attention" value={attentionCount.toString()} helper="Needs review" />
        <Kpi
          label="Used in recipes"
          value={usedIngredientCount.toString()}
          helper="Linked ingredients"
        />
        <Kpi
          label="Supplier ownership"
          value={supplierCoverageValue}
          helper={`${supplierCoverageCount} assigned`}
        />
      </div>

      <Card className="p-0 overflow-hidden">
        <div className="border-b border-border px-4 py-3.5 sm:px-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="font-semibold">Ingredient register</div>
              <div className="mt-0.5 text-xs text-muted-foreground">
                Price, supplier and recipe links.
              </div>
              <div className="mt-1 text-xs text-muted-foreground tabular-nums">
                Showing {sortedRows.length} of {rows.length} ingredients
              </div>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
              <label className="min-w-0 text-xs font-medium text-muted-foreground sm:w-[300px]">
                Search ingredients
                <div className="relative mt-1">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <input
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full rounded-lg border border-input bg-card py-2 pl-9 pr-9 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground/70 focus:border-foreground/30"
                    placeholder="Search by name or supplier"
                  />
                  {hasActiveSearch && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery("")}
                      className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                      aria-label="Clear ingredient search"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </label>

              <label className="text-xs font-medium text-muted-foreground sm:w-[190px]">
                Sort by
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as SortKey)}
                  className="mt-1 w-full rounded-lg border border-input bg-card px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-foreground/30"
                >
                  <option value="recent">Recently updated</option>
                  <option value="risk">High risk first</option>
                  <option value="usage">Most used</option>
                  <option value="price">Highest price</option>
                  <option value="missingSupplier">Missing supplier</option>
                </select>
              </label>
            </div>
          </div>
        </div>

        <div className="hidden overflow-hidden sm:block">
          <table className="w-full table-fixed text-sm">
            <colgroup>
              <col className="w-[36%] sm:w-[42%]" />
              <col className="w-[18%] sm:w-[17%]" />
              <col className="w-[22%] sm:w-[19%]" />
              <col className="w-[16%] sm:w-[14%]" />
              <col className="w-[8%]" />
            </colgroup>
            <thead className="bg-muted/35">
              <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="py-2.5 pl-4 pr-3 font-medium sm:pl-5 sm:pr-4">Ingredient</th>
                <th className="px-2 py-2.5 font-medium sm:px-4">Usage</th>
                <th className="px-2 py-2.5 text-right font-medium sm:px-4">Current price</th>
                <th className="px-2 py-2.5 font-medium sm:px-4">Signal</th>
                <th className="py-2.5 pl-1 pr-3 font-medium sm:pl-2 sm:pr-5"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading && (
                <tr>
                  <td colSpan={5} className="py-10 text-center">
                    <Loader2 className="h-4 w-4 animate-spin inline text-muted-foreground" />
                  </td>
                </tr>
              )}
              {!loading && rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-6 py-14 text-center">
                    <div className="mx-auto max-w-sm">
                      <div className="font-medium">No ingredients yet</div>
                      <div className="mt-1 text-sm text-muted-foreground">
                        Add core ingredients to track supplier ownership and recipe exposure.
                      </div>
                    </div>
                  </td>
                </tr>
              )}
              {!loading && rows.length > 0 && sortedRows.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-6 py-14 text-center">
                    <div className="mx-auto max-w-sm">
                      <div className="font-medium">No matching ingredients</div>
                      <div className="mt-1 text-sm text-muted-foreground">
                        Try a different ingredient or supplier search.
                      </div>
                    </div>
                  </td>
                </tr>
              )}
              {sortedRows.map((ing) => {
                const usageCount = usageCounts[ing.id] ?? 0;
                const signal = getIngredientSignal(ing, averagePrice, usageCount);
                const isSelected = selectedIngredientId === ing.id;

                return (
                  <tr
                    key={ing.id}
                    onClick={() => setSelectedIngredientId(ing.id)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        setSelectedIngredientId(ing.id);
                      }
                    }}
                    tabIndex={0}
                    aria-selected={isSelected}
                    className={`group cursor-pointer align-top outline-none transition-colors duration-150 hover:bg-muted/40 focus-visible:bg-muted/45 focus-within:bg-muted/45 ${
                      isSelected ? "bg-muted/55 shadow-[inset_3px_0_0_var(--color-foreground)]" : ""
                    }`}
                  >
                    <td className="py-3 pl-4 pr-3 sm:pl-5 sm:pr-4">
                      <div className="font-medium leading-5 line-clamp-2 break-words transition-colors group-hover:text-foreground/90">
                        {ing.name}
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">per {ing.unit}</div>
                    </td>
                    <td className="px-2 py-3 sm:px-4">
                      <div className="font-medium tabular-nums leading-5">
                        {formatUsageLabel(usageCount)}
                      </div>
                    </td>
                    <td className="px-2 py-3 text-right tabular-nums sm:px-4">
                      <div className="font-semibold">
                        €{Number(ing.current_price ?? 0).toFixed(2)}
                      </div>
                    </td>
                    <td className="px-2 py-3 sm:px-4">
                      <SignalBadge signal={signal} />
                    </td>
                    <td className="py-3 pl-1 pr-3 text-right sm:pl-2 sm:pr-5">
                      <div className="flex items-center justify-end gap-1 opacity-65 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                        <button
                          onClick={(event) => {
                            event.stopPropagation();
                            beginEdit(ing);
                          }}
                          className="cursor-pointer rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                          aria-label={`Edit ${ing.name}`}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={(event) => {
                            event.stopPropagation();
                            remove(ing.id);
                          }}
                          className="cursor-pointer rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-destructive"
                          aria-label={`Delete ${ing.name}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="divide-y divide-border sm:hidden">
          {loading && (
            <div className="py-10 text-center">
              <Loader2 className="h-4 w-4 animate-spin inline text-muted-foreground" />
            </div>
          )}
          {!loading && rows.length === 0 && (
            <div className="px-6 py-14 text-center">
              <div className="mx-auto max-w-sm">
                <div className="font-medium">No ingredients yet</div>
                <div className="mt-1 text-sm text-muted-foreground">
                  Add core ingredients to track supplier ownership and recipe exposure.
                </div>
              </div>
            </div>
          )}
          {!loading && rows.length > 0 && sortedRows.length === 0 && (
            <div className="px-6 py-14 text-center">
              <div className="mx-auto max-w-sm">
                <div className="font-medium">No matching ingredients</div>
                <div className="mt-1 text-sm text-muted-foreground">
                  Try a different ingredient or supplier search.
                </div>
              </div>
            </div>
          )}
          {sortedRows.map((ing) => {
            const usageCount = usageCounts[ing.id] ?? 0;
            const signal = getIngredientSignal(ing, averagePrice, usageCount);
            const isSelected = selectedIngredientId === ing.id;

            return (
              <div
                key={ing.id}
                role="button"
                tabIndex={0}
                aria-selected={isSelected}
                onClick={() => setSelectedIngredientId(ing.id)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    setSelectedIngredientId(ing.id);
                  }
                }}
                className={`block w-full cursor-pointer px-4 py-3.5 text-left transition-colors hover:bg-muted/40 focus-visible:bg-muted/45 focus-visible:outline-none ${
                  isSelected ? "bg-muted/55 shadow-[inset_3px_0_0_var(--color-foreground)]" : ""
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-medium leading-5">{ing.name}</div>
                    <div className="mt-1 text-xs text-muted-foreground">per {ing.unit}</div>
                  </div>
                  <SignalBadge signal={signal} />
                </div>
                <div className="mt-3 flex items-end justify-between gap-4">
                  <div>
                    <div className="text-xs uppercase tracking-wide text-muted-foreground">
                      Usage
                    </div>
                    <div className="mt-1 font-medium tabular-nums">
                      {formatUsageLabel(usageCount)}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs uppercase tracking-wide text-muted-foreground">
                      Current price
                    </div>
                    <div className="mt-1 font-semibold tabular-nums">
                      €{Number(ing.current_price ?? 0).toFixed(2)}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      {selectedIngredient && (
        <IngredientDetailPanel
          ingredient={selectedIngredient}
          usageCount={usageCounts[selectedIngredient.id] ?? 0}
          recipeDependencies={recipeDependencies[selectedIngredient.id] ?? []}
          signal={getIngredientSignal(
            selectedIngredient,
            averagePrice,
            usageCounts[selectedIngredient.id] ?? 0,
          )}
          priceContext={getPriceContext(
            selectedIngredient,
            averagePrice,
            usageCounts[selectedIngredient.id] ?? 0,
          )}
          averagePrice={averagePrice}
          onClose={() => setSelectedIngredientId(null)}
          onEdit={() => beginEdit(selectedIngredient)}
          onDelete={() => remove(selectedIngredient.id)}
        />
      )}
    </AppShell>
  );
}

function IngredientDetailPanel({
  ingredient,
  usageCount,
  recipeDependencies,
  signal,
  priceContext,
  averagePrice,
  onClose,
  onEdit,
  onDelete,
}: {
  ingredient: Row;
  usageCount: number;
  recipeDependencies: RecipeDependency[];
  signal: IngredientSignal;
  priceContext: string;
  averagePrice: number;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const primaryContextLabel = getPrimaryContextLabel(ingredient, averagePrice, usageCount);
  const supplierName = ingredient.supplier?.trim() || "No supplier assigned";
  const visibleRecipeDependencies = recipeDependencies.slice(0, 4);
  const hiddenRecipeCount = Math.max(
    recipeDependencies.length - visibleRecipeDependencies.length,
    0,
  );

  return (
    <div
      className="fixed inset-0 z-40 flex justify-end bg-background/45 backdrop-blur-[1px]"
      onClick={onClose}
    >
      <aside
        className="h-full w-full max-w-lg overflow-y-auto border-l border-border bg-card shadow-2xl transition-transform duration-200"
        onClick={(event) => event.stopPropagation()}
        aria-label={`${ingredient.name} details`}
      >
        <div className="border-b border-border px-5 py-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">
                Ingredient detail
              </div>
              <h2 className="mt-1 text-xl font-semibold leading-7 tracking-tight">
                {ingredient.name}
              </h2>
              <div className="mt-1 text-sm text-muted-foreground tabular-nums">
                €{Number(ingredient.current_price ?? 0).toFixed(2)} per {ingredient.unit}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1 rounded-lg border border-border/70 bg-background/45 p-1">
              <button
                onClick={onEdit}
                className="cursor-pointer rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                aria-label={`Edit ${ingredient.name}`}
              >
                <Pencil className="h-4 w-4" />
              </button>
              <button
                onClick={onDelete}
                className="cursor-pointer rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-destructive"
                aria-label={`Delete ${ingredient.name}`}
              >
                <Trash2 className="h-4 w-4" />
              </button>
              <button
                onClick={onClose}
                className="cursor-pointer rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                aria-label="Close ingredient details"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            <SignalBadge signal={signal} />
            {primaryContextLabel && <ContextPill>{primaryContextLabel}</ContextPill>}
          </div>
        </div>

        <div className="space-y-3.5 px-5 py-4">
          <div className="grid grid-cols-2 gap-2.5">
            <DetailMetric
              label="Current price"
              value={`€${Number(ingredient.current_price ?? 0).toFixed(2)}`}
              helper={priceContext}
            />
            <DetailMetric label="Unit" value={ingredient.unit} helper="Purchase unit" />
            <DetailMetric
              label="Usage"
              value={formatUsageLabel(usageCount)}
              helper="Recipe links"
            />
            <DetailMetric
              label="Freshness"
              value={formatUpdatedLabel(ingredient)}
              helper={getFreshnessContext(ingredient)}
            />
          </div>

          <section className="rounded-xl border border-border bg-background/35 p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="font-medium">Status</div>
              <SignalBadge signal={signal} />
            </div>
            <div className="mt-3 divide-y divide-border/70 text-sm">
              <div className="flex items-center justify-between gap-3 py-2 first:pt-0">
                <span className="text-muted-foreground">Supplier</span>
                <span className="min-w-0 truncate text-right font-medium">{supplierName}</span>
              </div>
              <div className="flex items-start justify-between gap-3 pt-2">
                <span className="text-muted-foreground">Signal</span>
                <span className="max-w-[60%] text-right text-muted-foreground">
                  {getRiskExplanation(ingredient, averagePrice, usageCount)}
                </span>
              </div>
            </div>
          </section>

          <section className="rounded-xl border border-border bg-background/35 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="font-medium">Recipe exposure</div>
                <div className="mt-1 text-sm text-muted-foreground">
                  {getRecipeDependencyExplanation(usageCount)}
                </div>
              </div>
              <div className="text-right text-sm font-semibold tabular-nums">
                {formatUsageLabel(usageCount)}
              </div>
            </div>
            {visibleRecipeDependencies.length > 0 ? (
              <div className="mt-3 divide-y divide-border/70 rounded-lg border border-border/70 bg-card">
                {visibleRecipeDependencies.map((recipe) => (
                  <div
                    key={recipe.recipeId}
                    className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
                  >
                    <span className="min-w-0 truncate font-medium">{recipe.recipeName}</span>
                    {recipe.lineCount > 1 && (
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {recipe.lineCount} lines
                      </span>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-3 rounded-lg border border-dashed border-border bg-muted/15 px-3 py-2 text-sm text-muted-foreground">
                No active recipe dependency.
              </div>
            )}
            {hiddenRecipeCount > 0 && (
              <div className="mt-2 text-xs text-muted-foreground">
                +{hiddenRecipeCount} more affected recipes
              </div>
            )}
          </section>
        </div>
      </aside>
    </div>
  );
}

function DetailMetric({ label, value, helper }: { label: string; value: string; helper: string }) {
  return (
    <div className="rounded-lg border border-border bg-background/35 p-3">
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="mt-1.5 text-base font-semibold tabular-nums">{value}</div>
      <div className="mt-1 text-xs text-muted-foreground">{helper}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block text-xs font-medium text-muted-foreground">
      {label}
      {children}
    </label>
  );
}

function Kpi({ label, value, helper }: { label: string; value: string; helper: string }) {
  return (
    <Card className="py-3">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 text-xl font-semibold tabular-nums">{value}</div>
      <div className="mt-1 text-xs text-muted-foreground">{helper}</div>
    </Card>
  );
}

function SignalBadge({ signal }: { signal: IngredientSignal }) {
  const className =
    signal === "High risk"
      ? "text-destructive bg-destructive/10 border-destructive/20"
      : signal === "Attention"
        ? "text-warning bg-warning/10 border-warning/20"
        : "text-muted-foreground bg-muted/30 border-border/60";

  return (
    <span
      className={`inline-flex whitespace-nowrap rounded-md border px-2 py-0.5 text-xs font-medium ${className}`}
    >
      {signal}
    </span>
  );
}

function ContextPill({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-md border border-border/70 bg-muted/25 px-2 py-0.5 text-[11px] font-medium leading-5 text-muted-foreground">
      {children}
    </span>
  );
}

function getIngredientSignal(row: Row, averagePrice: number, usageCount: number): IngredientSignal {
  const price = Number(row.current_price ?? 0);
  const missingSupplier = !row.supplier?.trim();
  const expensive = averagePrice > 0 && price >= averagePrice * 1.2;
  const moderateUsage = usageCount >= 1;
  const stale = isStale(row);

  if (isHighRisk(row, averagePrice, usageCount)) return "High risk";
  if ((missingSupplier && moderateUsage) || expensive || (stale && usageCount >= 2))
    return "Attention";
  return "Stable";
}

function getSignalPriority(signal: IngredientSignal) {
  if (signal === "High risk") return 3;
  if (signal === "Attention") return 2;
  return 1;
}

function getUpdatedTime(row: Row) {
  const value = row.updated_at ?? row.created_at;
  const time = value ? new Date(value).getTime() : 0;
  return Number.isFinite(time) ? time : 0;
}

function daysSinceUpdate(row: Row) {
  const time = getUpdatedTime(row);
  if (!time) return null;
  return Math.floor((Date.now() - time) / (1000 * 60 * 60 * 24));
}

function isRecentlyUpdated(row: Row) {
  const days = daysSinceUpdate(row);
  return days !== null && days <= 7;
}

function isHighRisk(row: Row, averagePrice: number, usageCount: number) {
  const price = Number(row.current_price ?? 0);
  const missingSupplier = !row.supplier?.trim();
  const mainCostDriver = averagePrice > 0 && price >= averagePrice * 1.35;
  const heavyUsage = usageCount >= 3;
  const operationallyImportant = usageCount >= 2 && mainCostDriver;

  return (heavyUsage && (mainCostDriver || missingSupplier)) || operationallyImportant;
}

function hasMissingSupplier(row: Row) {
  return !row.supplier?.trim();
}

function getPriceContext(row: Row, averagePrice: number, usageCount: number) {
  const price = Number(row.current_price ?? 0);

  if (averagePrice > 0 && price >= averagePrice * 1.35 && usageCount > 0) return "Main cost driver";
  if (averagePrice > 0 && price >= averagePrice * 1.35) return "High cost item";
  if (usageCount >= 2) return "Frequently used";
  if (averagePrice > 0 && price >= averagePrice * 1.15) return "Above average";
  if (averagePrice > 0 && price <= averagePrice * 0.75) return "Low cost item";

  return `per ${row.unit}`;
}

function getPrimaryContextLabel(row: Row, averagePrice: number, usageCount: number) {
  const price = Number(row.current_price ?? 0);
  const mainCostDriver = averagePrice > 0 && price >= averagePrice * 1.35 && usageCount > 0;

  if (mainCostDriver) return "Main cost driver";
  if (usageCount >= 3) return "High recipe exposure";
  if (isRecentlyUpdated(row)) return "Recently updated";

  return null;
}

function getRiskExplanation(row: Row, averagePrice: number, usageCount: number) {
  const signal = getIngredientSignal(row, averagePrice, usageCount);
  const missingSupplier = hasMissingSupplier(row);
  const mainCostDriver =
    averagePrice > 0 && Number(row.current_price ?? 0) >= averagePrice * 1.35 && usageCount > 0;

  if (signal === "High risk") {
    if (missingSupplier) return "High recipe exposure with no supplier assigned.";
    if (mainCostDriver) return "High recipe exposure and above-average price.";
    return "Review price and supplier coverage.";
  }

  if (signal === "Attention") {
    if (missingSupplier) return "No supplier assigned for a recipe-linked ingredient.";
    if (isStale(row)) return "Price has not been refreshed recently.";
    return "Above-average price with moderate recipe exposure.";
  }

  return "No supplier risk detected.";
}

function getRecipeDependencyExplanation(usageCount: number) {
  if (usageCount >= 3) return "Used in active recipes.";
  if (usageCount >= 2) return "Used in a small recipe group.";
  if (usageCount === 1) return "Used in one active recipe.";
  return "No active recipe dependency.";
}

function getFreshnessContext(row: Row) {
  const days = daysSinceUpdate(row);

  if (days === null || days <= 7) return "Recently updated";
  if (days < 30) return "Fresh this month";
  if (days < 90) return "Worth a price check";
  return "Needs refresh";
}

function isStale(row: Row) {
  const days = daysSinceUpdate(row);
  return days !== null && days >= 90;
}

function formatUpdatedLabel(row: Row) {
  const days = daysSinceUpdate(row);

  if (days === null) return "Recently added";
  if (days <= 0) return "Updated today";
  if (days === 1) return "Updated 1d ago";
  if (days < 30) return `Updated ${days}d ago`;
  if (days < 365) return `Updated ${Math.floor(days / 30)}mo ago`;

  return `Updated ${Math.floor(days / 365)}y ago`;
}

function formatUsageLabel(count: number) {
  return `${count} ${count === 1 ? "recipe" : "recipes"}`;
}
