import { createFileRoute } from "@tanstack/react-router";
import { AppShell, Card } from "@/components/AppShell";
import { Plus, Loader2, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
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

type SortKey = "recent" | "price" | "usage" | "name";
type IngredientSignal = "High risk" | "Attention" | "Stable";

function IngredientsPage() {
  const { user } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [usageCounts, setUsageCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", unit: "kg", current_price: "", supplier: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<SortKey>("recent");

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

  const sortedRows = useMemo(() => {
    return [...rows].sort((a, b) => {
      if (sortBy === "price") return Number(b.current_price ?? 0) - Number(a.current_price ?? 0);
      if (sortBy === "usage") return (usageCounts[b.id] ?? 0) - (usageCounts[a.id] ?? 0);
      if (sortBy === "name") return a.name.localeCompare(b.name);
      return getUpdatedTime(b) - getUpdatedTime(a);
    });
  }, [rows, sortBy, usageCounts]);

  const highRiskCount = rows.filter((row) => isHighRisk(row, averagePrice, usageCounts[row.id] ?? 0)).length;

  const recentlyUpdatedCount = rows.filter((row) => isRecentlyUpdated(row)).length;

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSaving(true);
    setError(null);
    const { error } = await supabase.from("ingredients").insert({
      user_id: user.id,
      name: form.name,
      unit: form.unit,
      current_price: Number(form.current_price) || 0,
      supplier: form.supplier || null,
    });
    setSaving(false);
    if (error) { setError(error.message); return; }
    setForm({ name: "", unit: "kg", current_price: "", supplier: "" });
    setOpen(false);
    load();
  };

  const remove = async (id: string) => {
    await supabase.from("ingredients").delete().eq("id", id);
    load();
  };

  return (
    <AppShell
      title="Ingredient prices"
      subtitle="Track ingredient prices across your suppliers."
      action={
        <button
          onClick={() => setOpen((v) => !v)}
          className="inline-flex items-center gap-2 bg-foreground text-background rounded-lg px-3.5 py-2 text-sm font-medium hover:opacity-90"
        >
          <Plus className="h-4 w-4" /> Add ingredient
        </button>
      }
    >
      {open && (
        <Card className="mb-4">
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
              {saving && <Loader2 className="h-4 w-4 animate-spin" />} Save
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
        <div className="px-5 py-4 border-b border-border flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="font-semibold">Ingredient intelligence</div>
            <div className="text-xs text-muted-foreground mt-0.5">
              Lightweight price, freshness and recipe usage signals.
            </div>
          </div>

          <label className="text-xs font-medium text-muted-foreground">
            Sort by
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortKey)}
              className="ml-2 rounded-lg border border-input bg-card px-3 py-2 text-sm text-foreground"
            >
              <option value="recent">Recently updated</option>
              <option value="price">Highest price</option>
              <option value="usage">Most used</option>
              <option value="name">Name A-Z</option>
            </select>
          </label>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[920px] text-sm">
            <thead className="bg-muted/40">
              <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="py-3.5 pl-6 pr-5 font-medium min-w-[240px] w-[32%]">Ingredient</th>
                <th className="py-3.5 px-5 font-medium min-w-[160px]">Supplier</th>
                <th className="py-3.5 px-5 font-medium w-[125px] whitespace-nowrap">Usage</th>
                <th className="py-3.5 px-5 font-medium min-w-[150px] whitespace-nowrap">Last updated</th>
                <th className="py-3.5 px-5 font-medium text-right min-w-[135px] whitespace-nowrap">Current price</th>
                <th className="py-3.5 px-5 font-medium w-[150px] whitespace-nowrap">Signal</th>
                <th className="py-3.5 pl-3 pr-6 font-medium w-12"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading && (
                <tr><td colSpan={7} className="py-10 text-center"><Loader2 className="h-4 w-4 animate-spin inline text-muted-foreground" /></td></tr>
              )}
              {!loading && rows.length === 0 && (
                <tr><td colSpan={7} className="py-10 text-center text-sm text-muted-foreground">No ingredients yet. Add your first one above.</td></tr>
              )}
              {sortedRows.map((ing) => {
                const usageCount = usageCounts[ing.id] ?? 0;
                const signal = getIngredientSignal(ing, averagePrice, usageCount);
                const priceContext = getPriceContext(ing, averagePrice, usageCount);

                return (
                  <tr key={ing.id} className="hover:bg-muted/30 align-top">
                    <td className="py-[1.125rem] pl-6 pr-5 min-w-[240px] max-w-[320px]">
                      <div className="font-medium leading-5 line-clamp-2 break-words">{ing.name}</div>
                      <div className="text-xs text-muted-foreground mt-0.5 whitespace-nowrap">per {ing.unit}</div>
                    </td>
                    <td className="py-[1.125rem] px-5 text-muted-foreground whitespace-nowrap">{ing.supplier?.trim() || "No supplier"}</td>
                    <td className="py-[1.125rem] px-5 whitespace-nowrap">
                      <div className="font-medium tabular-nums">{formatUsageLabel(usageCount)}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">{usageCount > 0 ? "In active recipes" : "Not in recipes"}</div>
                    </td>
                    <td className="py-[1.125rem] px-5">
                      <div className="text-sm whitespace-nowrap">{formatUpdatedLabel(ing)}</div>
                    </td>
                    <td className="py-[1.125rem] px-5 text-right tabular-nums whitespace-nowrap">
                      <div className="font-semibold">€{Number(ing.current_price ?? 0).toFixed(2)}</div>
                      <div className="text-xs text-muted-foreground">{priceContext}</div>
                    </td>
                    <td className="py-[1.125rem] px-5 whitespace-nowrap">
                      <SignalBadge signal={signal} />
                    </td>
                    <td className="py-[1.125rem] pl-3 pr-6 text-right">
                      <button onClick={() => remove(ing.id)} className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-muted">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </AppShell>
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

function getIngredientSignal(row: Row, averagePrice: number, usageCount: number): IngredientSignal {
  const price = Number(row.current_price ?? 0);
  const missingSupplier = !row.supplier?.trim();
  const expensive = averagePrice > 0 && price >= averagePrice * 1.15;

  if (isHighRisk(row, averagePrice, usageCount)) return "High risk";
  if (missingSupplier || expensive) return "Attention";
  return "Stable";
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
  const highPrice = averagePrice > 0 && price >= averagePrice * 1.5;
  const heavyUsage = usageCount >= 2;

  return heavyUsage && (highPrice || missingSupplier);
}

function getPriceContext(row: Row, averagePrice: number, usageCount: number) {
  const price = Number(row.current_price ?? 0);

  if (averagePrice > 0 && price >= averagePrice * 1.5) return "High cost item";
  if (usageCount >= 2) return "Frequently used";
  if (averagePrice > 0 && price >= averagePrice * 1.15) return "Above average";
  if (averagePrice > 0 && price <= averagePrice * 0.75) return "Low cost item";

  return `per ${row.unit}`;
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
