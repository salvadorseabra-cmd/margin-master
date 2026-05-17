import { createFileRoute } from "@tanstack/react-router";
import { AppShell, Card } from "@/components/AppShell";
import { Plus, Loader2, Trash2, TrendingDown, TrendingUp, X } from "lucide-react";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import type { Tables } from "@/integrations/supabase/types";
import { normalizeIngredientName } from "@/lib/normalizeIngredient";
import {
  effectiveIngredientUnitCostEur,
  ingredientDisplayBaseUnit,
} from "@/lib/ingredient-unit-cost";

export const Route = createFileRoute("/ingredients")({
  head: () => ({
    meta: [
      { title: "Ingredient Prices — Marginly" },
      { name: "description", content: "Track ingredient price changes across suppliers." },
    ],
  }),
  component: IngredientsPage,
});

type Row = Tables<"ingredients">;

type PriceActivity = Pick<
  Tables<"ingredient_price_history">,
  "created_at" | "delta" | "delta_percent" | "ingredient_id"
>;

type RecipeLinkActivity = {
  count: number;
  recentlyLinked: boolean;
};

function IngredientsPage() {
  const { user } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [priceActivity, setPriceActivity] = useState<Record<string, PriceActivity>>({});
  const [recipeLinkActivity, setRecipeLinkActivity] = useState<Record<string, RecipeLinkActivity>>(
    {},
  );
  const [selectedIngredientId, setSelectedIngredientId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    name: "",
    unit: "kg",
    current_price: "",
    purchase_quantity: "1",
    purchase_unit: "",
    base_unit: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("ingredients")
      .select(
        "id, name, unit, current_price, normalized_name, user_id, purchase_quantity, purchase_unit, base_unit",
      )
      .order("name", { ascending: true });
    if (error) setError(error.message);
    else {
      const ingredientRows = data ?? [];
      setRows(ingredientRows);

      const ingredientIds = ingredientRows.map((ingredient) => ingredient.id);

      if (ingredientIds.length === 0) {
        setPriceActivity({});
        setRecipeLinkActivity({});
      } else {
        const [{ data: historyData }, { data: linkData }] = await Promise.all([
          supabase
            .from("ingredient_price_history")
            .select("ingredient_id, created_at, delta, delta_percent")
            .in("ingredient_id", ingredientIds)
            .order("created_at", { ascending: false }),
          supabase
            .from("recipe_ingredients")
            .select("ingredient_id, created_at")
            .in("ingredient_id", ingredientIds),
        ]);

        const latestActivity: Record<string, PriceActivity> = {};
        (historyData ?? []).forEach((activity) => {
          if (!latestActivity[activity.ingredient_id]) {
            latestActivity[activity.ingredient_id] = activity;
          }
        });
        setPriceActivity(latestActivity);

        const linkActivity: Record<string, RecipeLinkActivity> = {};
        (linkData ?? []).forEach((link) => {
          if (!link.ingredient_id) return;

          const current = linkActivity[link.ingredient_id] ?? {
            count: 0,
            recentlyLinked: false,
          };

          linkActivity[link.ingredient_id] = {
            count: current.count + 1,
            recentlyLinked: current.recentlyLinked || isRecentDate(link.created_at),
          };
        });
        setRecipeLinkActivity(linkActivity);
      }

      setSelectedIngredientId((current) =>
        current && ingredientRows.some((ingredient) => ingredient.id === current) ? current : null,
      );
    }
    setLoading(false);
  };

  useEffect(() => {
    if (user) load();
  }, [user]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSaving(true);
    setError(null);
    const name = form.name.trim();
    const unit = form.unit.trim() || "kg";
    const pq = Number(form.purchase_quantity);
    const purchase_quantity = Number.isFinite(pq) && pq > 0 ? pq : 1;
    const purchase_unit = form.purchase_unit.trim() || null;
    const base_unit = form.base_unit.trim() || unit;
    const { error } = await supabase.from("ingredients").insert({
      user_id: user.id,
      name,
      normalized_name: normalizeIngredientName(name),
      unit,
      current_price: Number(form.current_price) || 0,
      purchase_quantity,
      purchase_unit,
      base_unit,
    });
    setSaving(false);
    if (error) {
      setError(error.message);
      return;
    }
    setForm({
      name: "",
      unit: "kg",
      current_price: "",
      purchase_quantity: "1",
      purchase_unit: "",
      base_unit: "",
    });
    setOpen(false);
    load();
  };

  const remove = async (id: string) => {
    await supabase.from("ingredients").delete().eq("id", id);
    if (selectedIngredientId === id) setSelectedIngredientId(null);
    load();
  };

  const selectedIngredient = selectedIngredientId
    ? (rows.find((ingredient) => ingredient.id === selectedIngredientId) ?? null)
    : null;

  return (
    <AppShell
      title="Ingredient prices"
      subtitle="Track ingredient unit costs for recipes and margin."
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
          <form onSubmit={save} className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 items-end">
            <Field label="Name">
              <input
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="input"
                placeholder="Beef tenderloin"
              />
            </Field>
            <Field label="Unit (catalog)">
              <input
                value={form.unit}
                onChange={(e) => setForm({ ...form, unit: e.target.value })}
                className="input"
                placeholder="kg"
              />
            </Field>
            <Field label="Base unit (recipes), optional">
              <input
                value={form.base_unit}
                onChange={(e) => setForm({ ...form, base_unit: e.target.value })}
                className="input"
                placeholder="Same as unit if empty"
              />
            </Field>
            <Field label="Pack price (€)">
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
            <Field label="Units per pack">
              <input
                type="number"
                min={0.001}
                step="0.001"
                value={form.purchase_quantity}
                onChange={(e) => setForm({ ...form, purchase_quantity: e.target.value })}
                className="input"
                placeholder="1"
              />
            </Field>
            <Field label="Pack label (optional)">
              <input
                value={form.purchase_unit}
                onChange={(e) => setForm({ ...form, purchase_unit: e.target.value })}
                className="input"
                placeholder="cx"
              />
            </Field>
            <button
              disabled={saving}
              type="submit"
              className="bg-foreground text-background rounded-lg px-3.5 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-60 inline-flex items-center justify-center gap-2 sm:col-span-2 lg:col-span-1"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />} Save
            </button>
          </form>
          {error && <div className="text-xs text-destructive mt-2">{error}</div>}
          <style>{`.input{margin-top:.25rem;width:100%;border-radius:.5rem;border:1px solid var(--color-input);background:var(--color-card);padding:.55rem .75rem;font-size:.875rem}`}</style>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <Card className="p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40">
                <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="py-3 px-5 font-medium">Ingredient</th>
                  <th className="py-3 px-5 font-medium text-right">Current price</th>
                  <th className="py-3 pl-2 pr-5 font-medium w-16"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {loading && (
                  <tr>
                    <td colSpan={3} className="py-10 text-center">
                      <Loader2 className="h-4 w-4 animate-spin inline text-muted-foreground" />
                    </td>
                  </tr>
                )}
                {!loading && rows.length === 0 && (
                  <tr>
                    <td colSpan={3} className="py-10 text-center text-sm text-muted-foreground">
                      No ingredients yet. Add your first one above.
                    </td>
                  </tr>
                )}
                {rows.map((ing) => {
                  const base = ingredientDisplayBaseUnit(ing);
                  const pq = Number(ing.purchase_quantity);
                  const denom = Number.isFinite(pq) && pq > 0 ? pq : 1;
                  const eff = effectiveIngredientUnitCostEur(ing);
                  const linkActivity = recipeLinkActivity[ing.id];
                  const latestPriceActivity = priceActivity[ing.id];
                  const selected = selectedIngredient?.id === ing.id;
                  return (
                    <tr
                      key={ing.id}
                      onClick={() => setSelectedIngredientId(ing.id)}
                      className={`cursor-pointer transition-colors hover:bg-muted/30 ${
                        selected ? "bg-muted/35" : ""
                      }`}
                    >
                      <td className="py-4 px-5">
                        <div className="font-medium">{ing.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {denom > 1
                            ? `€${eff.toFixed(3)} per ${base} · pack €${Number(ing.current_price).toFixed(2)} / ${denom}${ing.purchase_unit?.trim() ? ` ${ing.purchase_unit.trim()}` : ""}`
                            : `per ${base}`}
                        </div>
                        {linkActivity && (
                          <div className="mt-1 text-[11px] text-muted-foreground">
                            Used in {linkActivity.count}{" "}
                            {linkActivity.count === 1 ? "recipe" : "recipes"}
                            {linkActivity.recentlyLinked ? " · recently linked to recipes" : ""}
                          </div>
                        )}
                      </td>
                      <td className="py-4 px-5 text-right tabular-nums font-medium">
                        <div>€{Number(ing.current_price).toFixed(2)}</div>
                        <PriceActivityNote activity={latestPriceActivity} />
                      </td>
                      <td className="py-4 pl-2 pr-5 text-right align-middle whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={(event) => {
                              event.stopPropagation();
                              remove(ing.id);
                            }}
                            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:text-destructive hover:bg-muted"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>

        <IngredientDetailPanel
          ingredient={selectedIngredient}
          priceActivity={selectedIngredient ? priceActivity[selectedIngredient.id] : undefined}
          recipeLinkActivity={
            selectedIngredient ? recipeLinkActivity[selectedIngredient.id] : undefined
          }
          onClose={() => setSelectedIngredientId(null)}
          onDelete={(id) => remove(id)}
        />
      </div>
    </AppShell>
  );
}

function IngredientDetailPanel({
  ingredient,
  priceActivity,
  recipeLinkActivity,
  onClose,
  onDelete,
}: {
  ingredient: Row | null;
  priceActivity: PriceActivity | undefined;
  recipeLinkActivity: RecipeLinkActivity | undefined;
  onClose: () => void;
  onDelete: (id: string) => void;
}) {
  if (!ingredient) {
    return (
      <Card className="hidden h-fit lg:block">
        <div className="text-sm font-medium">Ingredient inspection</div>
        <div className="mt-2 text-sm text-muted-foreground">
          Select an ingredient to inspect price, pack, and recipe exposure.
        </div>
      </Card>
    );
  }

  const base = ingredientDisplayBaseUnit(ingredient);
  const pq = Number(ingredient.purchase_quantity);
  const denom = Number.isFinite(pq) && pq > 0 ? pq : 1;
  const eff = effectiveIngredientUnitCostEur(ingredient);
  const usageCount = recipeLinkActivity?.count ?? 0;
  const packLabel = ingredient.purchase_unit?.trim() || ingredient.unit;
  const recentlyUpdated = priceActivity && isRecentDate(priceActivity.created_at);

  return (
    <Card className="h-fit lg:sticky lg:top-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Ingredient inspection
          </div>
          <h2 className="mt-1 text-lg font-semibold leading-tight">{ingredient.name}</h2>
          <div className="mt-1 text-sm text-muted-foreground">
            {usageCount > 0 ? `Used in ${formatRecipeCount(usageCount)}` : "No active recipe links"}
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label="Close ingredient inspection"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3">
        <DetailMetric
          label="Pack price"
          value={`€${Number(ingredient.current_price).toFixed(2)}`}
          helper={denom > 1 ? `${denom} ${packLabel}` : `per ${base}`}
        />
        <DetailMetric label="Unit cost" value={`€${eff.toFixed(3)}`} helper={`per ${base}`} />
        <DetailMetric label="Catalog unit" value={ingredient.unit} helper="Ingredient library" />
        <DetailMetric label="Recipes" value={String(usageCount)} helper="Current exposure" />
      </div>

      <section className="mt-4 rounded-xl border border-border bg-background/35 p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="font-medium">Operational status</div>
          <span className="rounded-md border border-border/70 bg-muted/25 px-2 py-0.5 text-xs font-medium text-muted-foreground">
            {recentlyUpdated ? "Recently updated" : "Tracked"}
          </span>
        </div>
        <div className="mt-3 space-y-2 text-sm">
          <DetailRow
            label="Pack"
            value={
              denom > 1
                ? `€${Number(ingredient.current_price).toFixed(2)} / ${denom} ${packLabel}`
                : `€${Number(ingredient.current_price).toFixed(2)} per ${base}`
            }
          />
          <DetailRow label="Recipe base" value={base} />
          <DetailRow label="Usage" value={formatRecipeCount(usageCount)} />
        </div>
      </section>

      <section className="mt-4 rounded-xl border border-border bg-background/35 p-4">
        <div className="font-medium">Price activity</div>
        {priceActivity ? (
          <div className="mt-3 space-y-2 text-sm">
            <DetailRow
              label="Last change"
              value={formatActivityChange(priceActivity)}
              valueClassName={getActivityTone(priceActivity)}
            />
            <DetailRow
              label="Freshness"
              value={recentlyUpdated ? "Updated in the last 14 days" : "No recent price change"}
            />
          </div>
        ) : (
          <div className="mt-3 rounded-lg border border-dashed border-border bg-muted/15 px-3 py-2 text-sm text-muted-foreground">
            No price activity recorded yet.
          </div>
        )}
      </section>

      <section className="mt-4 rounded-xl border border-border bg-background/35 p-4">
        <div className="font-medium">Recipe exposure</div>
        <div className="mt-2 text-sm text-muted-foreground">
          {usageCount > 0
            ? `Changes to this ingredient can affect ${formatRecipeCount(usageCount)}.`
            : "This ingredient is not currently linked to recipes."}
          {recipeLinkActivity?.recentlyLinked ? " Recently linked to recipes." : ""}
        </div>
      </section>

      <div className="mt-4 flex justify-end">
        <button
          type="button"
          onClick={() => onDelete(ingredient.id)}
          className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-destructive"
        >
          <Trash2 className="h-4 w-4" />
          Delete
        </button>
      </div>
    </Card>
  );
}

function DetailMetric({ label, value, helper }: { label: string; value: string; helper: string }) {
  return (
    <div className="rounded-lg border border-border bg-background/35 p-3">
      <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="mt-1.5 font-semibold tabular-nums">{value}</div>
      <div className="mt-1 text-xs text-muted-foreground">{helper}</div>
    </div>
  );
}

function DetailRow({
  label,
  value,
  valueClassName = "text-foreground",
}: {
  label: string;
  value: string;
  valueClassName?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className={`text-right font-medium ${valueClassName}`}>{value}</span>
    </div>
  );
}

function formatRecipeCount(count: number) {
  return `${count} ${count === 1 ? "recipe" : "recipes"}`;
}

function formatActivityChange(activity: PriceActivity) {
  const deltaPercent = activity.delta_percent;
  if (typeof deltaPercent === "number" && deltaPercent !== 0) {
    return `${deltaPercent > 0 ? "+" : ""}${deltaPercent.toFixed(1)}%`;
  }

  const delta = activity.delta;
  if (typeof delta === "number" && delta !== 0) {
    return `${delta > 0 ? "+" : ""}€${delta.toFixed(2)}`;
  }

  return "Updated";
}

function getActivityTone(activity: PriceActivity) {
  const deltaPercent = activity.delta_percent;
  if (typeof deltaPercent === "number" && deltaPercent > 0) return "text-destructive";
  if (typeof deltaPercent === "number" && deltaPercent < 0) return "text-success";

  const delta = activity.delta;
  if (typeof delta === "number" && delta > 0) return "text-destructive";
  if (typeof delta === "number" && delta < 0) return "text-success";

  return "text-foreground";
}

function PriceActivityNote({ activity }: { activity: PriceActivity | undefined }) {
  if (!activity || !isRecentDate(activity.created_at)) return null;

  const deltaPercent = activity.delta_percent;
  const hasDirectionalChange = typeof deltaPercent === "number" && deltaPercent !== 0;
  const direction = hasDirectionalChange && deltaPercent > 0 ? "up" : "down";
  const Icon = direction === "up" ? TrendingUp : TrendingDown;

  return (
    <div
      className={`mt-1 inline-flex items-center justify-end gap-1 whitespace-nowrap text-[11px] font-normal ${
        hasDirectionalChange
          ? direction === "up"
            ? "text-destructive"
            : "text-success"
          : "text-muted-foreground"
      }`}
    >
      {hasDirectionalChange && <Icon className="h-3 w-3" />}
      <span>
        Price updated recently
        {hasDirectionalChange ? ` · ${deltaPercent > 0 ? "+" : ""}${deltaPercent.toFixed(1)}%` : ""}
      </span>
    </div>
  );
}

function isRecentDate(value: string | null | undefined, days = 14) {
  if (!value) return false;

  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return false;

  const ageMs = Date.now() - timestamp;
  return ageMs >= 0 && ageMs <= days * 24 * 60 * 60 * 1000;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-xs font-medium text-muted-foreground">
      {label}
      {children}
    </label>
  );
}
