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
      { name: "description", content: "Track ingredient price changes across  s." },
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

function IngredientsPage() {
  const { user } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [usageCounts, setUsageCounts] = useState<Record<string, number>>({});
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

    const { data, error }: any = await supabase
      .from("ingredients")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      setError(error.message);
      setRows([]);
      setUsageCounts({});
      setLoading(false);
      return;
    }

    setRows((data ?? []) as Row[]);

    const { data: usageData, error: usageError }: any = await supabase
      .from("recipe_ingredients")
      .select("ingredient_id");

    if (!usageError) {
      const counts = (usageData ?? []).reduce(
        (acc: Record<string, number>, item: { ingredient_id?: string | null }) => {
          if (item.ingredient_id) acc[item.ingredient_id] = (acc[item.ingredient_id] ?? 0) + 1;
          return acc;
        },
        {}
      );

      setUsageCounts(counts);
    } else {
      setUsageCounts({});
    }

    setLoading(false);
  };

  useEffect(() => { if (user) load(); }, [user]);

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
        return getSignalPriority(bSignal) - getSignalPriority(aSignal) || getUpdatedTime(b) - getUpdatedTime(a);
      }
      if (sortBy === "price") return Number(b.current_price ?? 0) - Number(a.current_price ?? 0);
      if (sortBy === "usage") return (usageCounts[b.id] ?? 0) - (usageCounts[a.id] ?? 0);
      if (sortBy === "missingSupplier") {
        return Number(hasMissingSupplier(b)) - Number(hasMissingSupplier(a)) || getUpdatedTime(b) - getUpdatedTime(a);
      }
      return getUpdatedTime(b) - getUpdatedTime(a);
    });
  }, [averagePrice, filteredRows, sortBy, usageCounts]);

  const hasActiveSearch = searchQuery.trim().length > 0;

  const highRiskCount = rows.filter((row) => isHighRisk(row, averagePrice, usageCounts[row.id] ?? 0)).length;

  const recentlyUpdatedCount = rows.filter((row) => isRecentlyUpdated(row)).length;

  const selectedIngredient = useMemo(
    () => rows.find((row) => row.id === selectedIngredientId) ?? null,
    [rows, selectedIngredientId]
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
    if (error) { setError(error.message); return; }
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
      subtitle="Track ingredient prices across your suppliers."
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
          className="inline-flex items-center gap-2 bg-foreground text-background rounded-lg px-3.5 py-2 text-sm font-medium hover:opacity-90"
        >
          <Plus className="h-4 w-4" /> Add ingredient
        </button>
      }
    >
      {open && (
        <Card className="mb-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold">{editingIngredientId ? "Edit ingredient" : "Add ingredient"}</div>
              <div className="text-xs text-muted-foreground">
                {editingIngredientId ? "Update the ingredient details without changing recipe links." : "Add a supplier price to your ingredient library."}
              </div>
            </div>
            {editingIngredientId && (
              <button
                type="button"
                onClick={resetForm}
                className="rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                Cancel
              </button>
            )}
          </div>
          <form onSubmit={save} className="grid sm:grid-cols-5 gap-3 items-end">
            <Field label="Name">
              <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="input" placeholder="Beef tenderloin" />
            </Field>
            <Field label="Unit">
              <input value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} className="input" placeholder="kg" />
            </Field>
            <Field label="Price (€)">
              <input required type="number" step="0.01" value={form.current_price} onChange={(e) => setForm({ ...form, current_price: e.target.value })} className="input" placeholder="0.00" />
            </Field>
            <Field label="Supplier">
              <input value={form.supplier} onChange={(e) => setForm({ ...form, supplier: e.target.value })} className="input" placeholder="Boucherie Lafayette" />
            </Field>
            <button disabled={saving} type="submit" className="bg-foreground text-background rounded-lg px-3.5 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-60 inline-flex items-center justify-center gap-2">
              {saving && <Loader2 className="h-4 w-4 animate-spin" />} {editingIngredientId ? "Update" : "Save"}
            </button>
          </form>
          {error && <div className="text-xs text-destructive mt-2">{error}</div>}
          <style>{`.input{margin-top:.25rem;width:100%;border-radius:.5rem;border:1px solid var(--color-input);background:var(--color-card);padding:.55rem .75rem;font-size:.875rem}`}</style>
        </Card>
      )}

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <Kpi label="Total ingredients" value={rows.length.toString()} />
        <Kpi label="High risk ingredients" value={highRiskCount.toString()} />
        <Kpi label="Recently updated" value={recentlyUpdatedCount.toString()} />
        <Kpi label="Average ingredient price" value={`€${averagePrice.toFixed(2)}`} />
      </div>

      <Card className="p-0 overflow-hidden">
        <div className="px-5 py-4 border-b border-border">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="font-semibold">Ingredient intelligence</div>
              <div className="text-xs text-muted-foreground mt-0.5">
                Lightweight price, freshness, supplier and recipe dependency signals.
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
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
            <thead className="bg-muted/40">
              <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="py-3.5 pl-4 pr-3 font-medium sm:pl-6 sm:pr-5">Ingredient</th>
                <th className="py-3.5 px-2 font-medium sm:px-5">Usage</th>
                <th className="py-3.5 px-2 font-medium text-right sm:px-5">Current price</th>
                <th className="py-3.5 px-2 font-medium sm:px-5">Signal</th>
                <th className="py-3.5 pl-1 pr-3 font-medium sm:pl-3 sm:pr-6"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading && (
                <tr><td colSpan={5} className="py-10 text-center"><Loader2 className="h-4 w-4 animate-spin inline text-muted-foreground" /></td></tr>
              )}
              {!loading && rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-6 py-14 text-center">
                    <div className="mx-auto max-w-sm">
                      <div className="font-medium">No ingredients yet</div>
                      <div className="mt-1 text-sm text-muted-foreground">
                        Add a few core ingredients to start seeing supplier, usage and cost signals.
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
                    className={`group cursor-pointer align-top outline-none transition-colors duration-150 hover:bg-muted/35 focus-visible:bg-muted/35 focus-within:bg-muted/35 ${
                      isSelected ? "bg-muted/40" : ""
                    }`}
                  >
                    <td className="py-4 pl-4 pr-3 sm:py-[1.125rem] sm:pl-6 sm:pr-5">
                      <div className="font-medium leading-5 line-clamp-2 break-words transition-colors group-hover:text-foreground/90">{ing.name}</div>
                      <div className="mt-1 text-xs text-muted-foreground">per {ing.unit}</div>
                    </td>
                    <td className="py-4 px-2 sm:py-[1.125rem] sm:px-5">
                      <div className="font-medium tabular-nums leading-5">{formatUsageLabel(usageCount)}</div>
                    </td>
                    <td className="py-4 px-2 text-right tabular-nums sm:py-[1.125rem] sm:px-5">
                      <div className="font-semibold">€{Number(ing.current_price ?? 0).toFixed(2)}</div>
                    </td>
                    <td className="py-4 px-2 sm:py-[1.125rem] sm:px-5">
                      <SignalBadge signal={signal} />
                    </td>
                    <td className="py-4 pl-1 pr-3 text-right sm:py-[1.125rem] sm:pl-3 sm:pr-6">
                      <div className="flex items-center justify-end gap-1 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                        <button
                          onClick={(event) => {
                            event.stopPropagation();
                            beginEdit(ing);
                          }}
                          className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                          aria-label={`Edit ${ing.name}`}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={(event) => {
                            event.stopPropagation();
                            remove(ing.id);
                          }}
                          className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-destructive"
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
                  Add a few core ingredients to start seeing supplier, usage and cost signals.
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
                className={`block w-full px-4 py-4 text-left transition-colors hover:bg-muted/35 focus-visible:bg-muted/35 focus-visible:outline-none ${
                  isSelected ? "bg-muted/40" : ""
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-medium leading-5">{ing.name}</div>
                    <div className="mt-1 text-xs text-muted-foreground">per {ing.unit}</div>
                  </div>
                  <SignalBadge signal={signal} />
                </div>
                <div className="mt-4 flex items-end justify-between gap-4">
                  <div>
                    <div className="text-xs uppercase tracking-wide text-muted-foreground">Usage</div>
                    <div className="mt-1 font-medium tabular-nums">{formatUsageLabel(usageCount)}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs uppercase tracking-wide text-muted-foreground">Current price</div>
                    <div className="mt-1 font-semibold tabular-nums">€{Number(ing.current_price ?? 0).toFixed(2)}</div>
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
          signal={getIngredientSignal(selectedIngredient, averagePrice, usageCounts[selectedIngredient.id] ?? 0)}
          priceContext={getPriceContext(selectedIngredient, averagePrice, usageCounts[selectedIngredient.id] ?? 0)}
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
  signal,
  priceContext,
  averagePrice,
  onClose,
  onEdit,
  onDelete,
}: {
  ingredient: Row;
  usageCount: number;
  signal: IngredientSignal;
  priceContext: string;
  averagePrice: number;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const contextLabels = getOperationalLabels(ingredient, averagePrice, usageCount);
  const supplierStatus = hasMissingSupplier(ingredient) ? "Supplier missing" : "Supplier linked";

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-background/35 backdrop-blur-[1px]" onClick={onClose}>
      <aside
        className="h-full w-full max-w-md overflow-y-auto border-l border-border bg-card shadow-xl transition-transform duration-200"
        onClick={(event) => event.stopPropagation()}
        aria-label={`${ingredient.name} details`}
      >
        <div className="flex items-start justify-between gap-4 border-b border-border px-6 py-5">
          <div>
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Ingredient detail</div>
            <h2 className="mt-1 text-xl font-semibold leading-7">{ingredient.name}</h2>
            <div className="mt-1 text-sm text-muted-foreground">
              €{Number(ingredient.current_price ?? 0).toFixed(2)} per {ingredient.unit}
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={onEdit}
              className="rounded-full p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              aria-label={`Edit ${ingredient.name}`}
            >
              <Pencil className="h-4 w-4" />
            </button>
            <button
              onClick={onDelete}
              className="rounded-full p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-destructive"
              aria-label={`Delete ${ingredient.name}`}
            >
              <Trash2 className="h-4 w-4" />
            </button>
            <button
              onClick={onClose}
              className="rounded-full p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              aria-label="Close ingredient details"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="space-y-5 px-6 py-5">
          <div className="grid grid-cols-2 gap-3">
            <DetailMetric label="Current price" value={`€${Number(ingredient.current_price ?? 0).toFixed(2)}`} helper={priceContext} />
            <DetailMetric label="Unit" value={ingredient.unit} helper="Purchase unit" />
            <DetailMetric label="Usage" value={formatUsageLabel(usageCount)} helper={getRecipeDependencySummary(usageCount)} />
            <DetailMetric label="Freshness" value={formatUpdatedLabel(ingredient)} helper={getFreshnessContext(ingredient)} />
          </div>

          <div className="rounded-xl border border-border bg-background/40 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Supplier</div>
                <div className="mt-1 font-medium">{ingredient.supplier?.trim() || "No supplier"}</div>
                <div className="mt-1 text-xs text-muted-foreground">{supplierStatus}</div>
                <div className="mt-2 text-sm leading-6 text-muted-foreground">{getSupplierExplanation(ingredient, usageCount)}</div>
              </div>
              <SignalBadge signal={signal} />
            </div>
          </div>

          {contextLabels.length > 0 && (
            <section className="rounded-xl border border-border bg-background/40 p-4">
              <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Operational context</div>
              <div className="mt-3 flex flex-wrap gap-2">
                {contextLabels.map((label) => (
                  <ContextPill key={label}>{label}</ContextPill>
                ))}
              </div>
            </section>
          )}

          <section className="rounded-xl border border-border bg-background/40 p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="font-medium">Operational signal</div>
              <SignalBadge signal={signal} />
            </div>
            <div className="mt-2 text-sm leading-6 text-muted-foreground">
              {getRiskExplanation(ingredient, averagePrice, usageCount)}
            </div>
          </section>

          <section className="rounded-xl border border-border bg-background/40 p-4">
            <div className="font-medium">Recipe dependency</div>
            <div className="mt-1 text-sm text-muted-foreground">
              {usageCount > 0
                ? `${formatUsageLabel(usageCount)} currently reference this ingredient. ${getRecipeDependencySummary(usageCount)}.`
                : "No recipes are currently using this ingredient, so changes here should have limited menu impact."}
            </div>
          </section>

          <section className="rounded-xl border border-dashed border-border bg-muted/20 p-4">
            <div className="font-medium">Manager note</div>
            <div className="mt-1 text-sm leading-6 text-muted-foreground">{getManagerNote(ingredient, averagePrice, usageCount)}</div>
          </section>
        </div>
      </aside>
    </div>
  );
}

function DetailMetric({ label, value, helper }: { label: string; value: string; helper: string }) {
  return (
    <div className="rounded-xl border border-border bg-background/40 p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-2 text-lg font-semibold tabular-nums">{value}</div>
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

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <Card className="py-4">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-2xl font-semibold tabular-nums mt-1">{value}</div>
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
    <span className={`inline-flex whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-medium ${className}`}>
      {signal}
    </span>
  );
}

function ContextPill({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full border border-border/70 bg-muted/25 px-2 py-0.5 text-[11px] font-medium leading-5 text-muted-foreground">
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
  if ((missingSupplier && moderateUsage) || expensive || (stale && usageCount >= 2)) return "Attention";
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

function getOperationalLabels(row: Row, averagePrice: number, usageCount: number) {
  const labels: string[] = [];
  const price = Number(row.current_price ?? 0);
  const mainCostDriver = averagePrice > 0 && price >= averagePrice * 1.35 && usageCount > 0;

  if (mainCostDriver) labels.push("Main cost driver");
  if (usageCount >= 2) labels.push("Frequently used");
  if (usageCount <= 1) labels.push("Low recipe dependency");
  if (hasMissingSupplier(row) && usageCount > 0) labels.push("Supplier missing");
  if (isRecentlyUpdated(row)) labels.push("Recently updated");

  return labels;
}

function getRiskExplanation(row: Row, averagePrice: number, usageCount: number) {
  const signal = getIngredientSignal(row, averagePrice, usageCount);
  const missingSupplier = hasMissingSupplier(row);
  const price = Number(row.current_price ?? 0);
  const mainCostDriver = averagePrice > 0 && price >= averagePrice * 1.35 && usageCount > 0;

  if (signal === "High risk") {
    if (missingSupplier) return "This ingredient is used across several recipes and does not have a supplier attached, so price ownership is unclear.";
    if (mainCostDriver) return "This ingredient combines meaningful recipe usage with a price well above the current ingredient average.";
    return "This ingredient is operationally important enough to deserve a quick price and supplier review.";
  }

  if (signal === "Attention") {
    if (missingSupplier) return "Supplier details are missing on an ingredient currently used by recipes.";
    if (isStale(row)) return "This ingredient has not been refreshed recently and appears in multiple recipes.";
    return "The current price sits above the ingredient average, but recipe exposure is still moderate.";
  }

  return "No immediate operational concern based on supplier coverage, price position and recipe dependency.";
}

function getSupplierExplanation(row: Row, usageCount: number) {
  if (!hasMissingSupplier(row)) return "Supplier context is linked here, keeping the table focused on the active operating signals.";
  if (usageCount > 0) return "Recipes depend on this ingredient, but supplier ownership is not attached yet.";
  return "Supplier ownership is not attached yet, and no recipes currently depend on this ingredient.";
}

function getRecipeDependencySummary(usageCount: number) {
  if (usageCount >= 3) return "High menu exposure";
  if (usageCount >= 2) return "Moderate menu exposure";
  if (usageCount === 1) return "Single recipe dependency";
  return "Low recipe dependency";
}

function getFreshnessContext(row: Row) {
  const days = daysSinceUpdate(row);

  if (days === null || days <= 7) return "Recently updated";
  if (days < 30) return "Fresh this month";
  if (days < 90) return "Worth a price check";
  return "Needs refresh";
}

function getManagerNote(row: Row, averagePrice: number, usageCount: number) {
  if (isHighRisk(row, averagePrice, usageCount)) {
    return "Review supplier coverage and price before this ingredient quietly drifts into menu margins.";
  }
  if (hasMissingSupplier(row) && usageCount === 0) {
    return "Supplier is missing, but no recipes depend on this ingredient yet.";
  }
  if (usageCount <= 1) {
    return "Low recipe dependency means updates here should be simple to validate.";
  }
  if (isRecentlyUpdated(row)) {
    return "Recently updated and ready for day-to-day margin checks.";
  }

  return "Keep an eye on this ingredient during routine supplier and menu reviews.";
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
