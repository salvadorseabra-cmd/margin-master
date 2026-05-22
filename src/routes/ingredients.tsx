import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { AppShell, Card } from "@/components/AppShell";
import { Plus, Loader2, Pencil, Trash2, TrendingDown, TrendingUp, X, ClipboardList } from "lucide-react";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import type { Tables } from "@/integrations/supabase/types";
import {
  buildCatalogIngredientIdentity,
  formatCanonicalIngredientDisplayName,
} from "@/lib/canonical-ingredient-display-name";
import { shouldBlockCanonicalNameOnCreate } from "@/lib/canonical-ingredient-operational-name";
import { normalizeIngredientName } from "@/lib/normalizeIngredient";
import { guardIngredientCreation } from "@/lib/ingredient-operational-identity";
import { INGREDIENT_KIND_CANONICAL } from "@/lib/ingredient-kind";
import { INGREDIENT_CREATE_LOG_PREFIX } from "@/lib/ingredient-auto-persist";
import {
  effectiveIngredientUnitCostEur,
  ingredientDisplayBaseUnit,
} from "@/lib/ingredient-unit-cost";
import {
  formatCurrency,
  formatPercent,
  formatQuantityWithUnit,
  formatUnitCostCurrency,
} from "@/lib/display-format";
import { inferPurchaseUnitsFromLineItemName } from "@/lib/ingredient-unit-inference";
import { ConfirmDeleteDialog } from "@/components/confirm-delete-dialog";
import { CanonicalIngredientRenameDialog } from "@/components/canonical-ingredient-rename-dialog";
import {
  buildCanonicalIngredientRenamePayload,
  traceCanonicalRename,
} from "@/lib/canonical-ingredient-rename";
import { traceFoodCostRecalculationSource } from "@/lib/recipe-canonical-graph-trace";
import { loadCanonicalIngredientCatalog } from "@/lib/ingredient-catalog-load";
import {
  traceCanonicalCreateAttempt,
  traceCanonicalCreateNameSource,
} from "@/lib/ingredient-catalog-diagnostics";

export const Route = createFileRoute("/ingredients")({
  head: () => ({
    meta: [
      { title: "Ingredient Costs — Marginly" },
      { name: "description", content: "Manage ingredient pack prices and recipe unit costs." },
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
  const isChildRoute = useRouterState({
    select: (s) => s.location.pathname !== "/ingredients",
  });
  if (isChildRoute) return <Outlet />;
  return <IngredientsIndexPage />;
}

function IngredientsIndexPage() {
  const { user } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [priceActivity, setPriceActivity] = useState<Record<string, PriceActivity>>({});
  const [recipeLinkActivity, setRecipeLinkActivity] = useState<Record<string, RecipeLinkActivity>>(
    {},
  );
  const [selectedIngredientId, setSelectedIngredientId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
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
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameTargetId, setRenameTargetId] = useState<string | null>(null);
  const [renameSaving, setRenameSaving] = useState(false);
  const [renameError, setRenameError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const { rows: catalogRows, error: catalogError } = await loadCanonicalIngredientCatalog(
      supabase,
      "current_price, user_id, purchase_quantity, purchase_unit, base_unit",
    );
    if (catalogError) setError(catalogError);
    else {
      const ingredientRows = [...catalogRows].sort((a, b) =>
        (a.name ?? "").localeCompare(b.name ?? "", undefined, { sensitivity: "base" }),
      ) as Row[];
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
    const rawName = form.name.trim();
    if (shouldBlockCanonicalNameOnCreate(rawName)) {
      setSaving(false);
      setError(
        "Use a full product name for the catalog. Invoice shorthand belongs in alias memory.",
      );
      return;
    }
    const { name, normalized_name: normalizedName } = buildCatalogIngredientIdentity(rawName);
    const unit = form.unit.trim() || "kg";
    const pq = Number(form.purchase_quantity);
    const purchase_quantity = Number.isFinite(pq) && pq > 0 ? pq : 1;
    const purchase_unit = form.purchase_unit.trim() || null;
    const base_unit = form.base_unit.trim() || unit;

    const catalog = rows.map((row) => ({
      id: row.id,
      name: row.name,
      normalized_name: row.normalized_name,
    }));

    const guard = guardIngredientCreation(name, catalog, {
      flowFunction: "IngredientsPage.saveNewIngredient",
      flowOrigin: "manual_form",
      rawInvoiceText: null,
    });
    if (guard.action === "reuse") {
      setSaving(false);
      setError(
        `Ingredient already exists: ${guard.existing.name ?? guard.existing.normalized_name ?? guard.existing.id}`,
      );
      return;
    }

    traceCanonicalCreateNameSource({
      flowFunction: "IngredientsPage.saveNewIngredient",
      flowOrigin: "manual_form",
      stage: "form-resolved",
      rawInvoiceText: null,
      normalized: normalizedName,
      finalCanonicalName: name,
      nameSource: "form_input",
      insertAttempted: false,
    });
    traceCanonicalCreateAttempt({
      flowFunction: "IngredientsPage.saveNewIngredient",
      flowOrigin: "manual_form",
      stage: "insert-attempt",
      rawInvoiceText: null,
      normalized: normalizedName,
      finalCanonicalName: name,
      nameSource: "form_input",
      insertAttempted: true,
      blocked: false,
    });
    console.info(`${INGREDIENT_CREATE_LOG_PREFIX} insert-attempt`, {
      name,
      normalizedName,
      source: "explicit_user_ingredients_page",
    });
    const { error } = await supabase.from("ingredients").insert({
      user_id: user.id,
      name,
      normalized_name: normalizedName,
      unit,
      current_price: Number(form.current_price) || 0,
      purchase_quantity,
      purchase_unit,
      base_unit,
      ingredient_kind: INGREDIENT_KIND_CANONICAL,
    });
    if (!error) {
      console.info(`${INGREDIENT_CREATE_LOG_PREFIX} insert-ok`, {
        name,
        normalizedName: normalizeIngredientName(name),
        source: "explicit_user_ingredients_page",
      });
    }
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

  const requestDelete = (id: string) => setPendingDeleteId(id);

  const confirmDelete = async () => {
    if (!pendingDeleteId) return;
    const id = pendingDeleteId;
    setPendingDeleteId(null);
    await remove(id);
  };

  const openRename = (ingredientId: string) => {
    setSelectedIngredientId(ingredientId);
    setRenameTargetId(ingredientId);
    setRenameError(null);
    setRenameOpen(true);
  };

  const saveRename = async (rawName: string) => {
    const renameTarget = renameTargetId
      ? (rows.find((ingredient) => ingredient.id === renameTargetId) ?? null)
      : null;
    if (!renameTarget) return;
    setRenameSaving(true);
    setRenameError(null);

    const catalog = rows.map((row) => ({
      id: row.id,
      name: row.name,
      normalized_name: row.normalized_name,
    }));
    const payload = buildCanonicalIngredientRenamePayload(
      renameTarget.id,
      rawName,
      catalog,
    );
    if (!payload.ok) {
      setRenameSaving(false);
      setRenameError(payload.message);
      return;
    }

    traceCanonicalRename("update-attempt", {
      ingredientId: payload.update.ingredientId,
      name: payload.update.name,
      normalizedName: payload.update.normalized_name,
    });
    const { error: updateError } = await supabase
      .from("ingredients")
      .update({
        name: payload.update.name,
        normalized_name: payload.update.normalized_name,
      })
      .eq("id", payload.update.ingredientId);

    setRenameSaving(false);
    if (updateError) {
      setRenameError(updateError.message);
      return;
    }

    traceCanonicalRename("update-ok", {
      ingredientId: payload.update.ingredientId,
      name: payload.update.name,
    });
    traceFoodCostRecalculationSource("canonical_rename", {
      ingredientId: payload.update.ingredientId,
      surface: "ingredients",
      note: "Recipes page recalculates on next catalog_reload when visited",
    });
    setRenameOpen(false);
    setRenameTargetId(null);
    await load();
  };

  const renameTarget = renameTargetId
    ? (rows.find((ingredient) => ingredient.id === renameTargetId) ?? null)
    : null;

  const selectedIngredient = selectedIngredientId
    ? (rows.find((ingredient) => ingredient.id === selectedIngredientId) ?? null)
    : null;

  return (
    <AppShell
      title="Ingredient costs"
      subtitle="Manage pack prices and recipe unit costs for margin control."
      action={
        <div className="flex flex-wrap items-center gap-2">
          <Link
            to="/ingredients/review"
            className="inline-flex items-center gap-2 rounded-lg border border-border px-3.5 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50"
          >
            <ClipboardList className="h-4 w-4" />
            Revisão catálogo
          </Link>
          <button
            onClick={() => setOpen((v) => !v)}
            className="inline-flex cursor-pointer items-center gap-2 bg-foreground text-background rounded-lg px-3.5 py-2 text-sm font-medium hover:opacity-90"
          >
            <Plus className="h-4 w-4" /> Add ingredient
          </button>
        </div>
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
            <Field label="Stock unit">
              <input
                value={form.unit}
                onChange={(e) => setForm({ ...form, unit: e.target.value })}
                className="input"
                placeholder="kg"
              />
            </Field>
            <Field label="Recipe unit (optional)">
              <input
                value={form.base_unit}
                onChange={(e) => setForm({ ...form, base_unit: e.target.value })}
                className="input"
                placeholder="Defaults to stock unit"
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
            <Field label="Pack unit (optional)">
              <input
                value={form.purchase_unit}
                onChange={(e) => setForm({ ...form, purchase_unit: e.target.value })}
                className="input"
                placeholder="case"
              />
            </Field>
            <button
              disabled={saving}
              type="submit"
              className="inline-flex cursor-pointer items-center justify-center gap-2 bg-foreground text-background rounded-lg px-3.5 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-60 sm:col-span-2 lg:col-span-1"
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
                  <th className="py-3 px-5 font-medium text-right">Pack price</th>
                  <th className="py-3 pl-2 pr-5 font-medium text-right w-28">Actions</th>
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
                      Add ingredients to start tracking pack prices.
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
                      aria-selected={selected}
                      onClick={() => setSelectedIngredientId(ing.id)}
                      className={`group cursor-pointer transition-[background-color,box-shadow] duration-150 ease-out hover:bg-muted/25 hover:shadow-[inset_2px_0_0_var(--color-border)] focus-within:bg-muted/25 ${
                        selected ? "bg-muted/35 shadow-[inset_2px_0_0_var(--color-foreground)]" : ""
                      }`}
                    >
                      <td className="py-4 px-5">
                        <div className="font-medium transition-colors group-hover:text-foreground">
                          {formatCanonicalIngredientDisplayName(ing.name)}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {denom > 1
                            ? `${formatUnitCostCurrency(eff)} per ${base} · pack ${formatCurrency(Number(ing.current_price))} / ${formatQuantityWithUnit(denom, ing.purchase_unit)}`
                            : `per ${base}`}
                        </div>
                        {linkActivity && (
                          <div className="mt-1 text-[11px] text-muted-foreground">
                            Used in {linkActivity.count}{" "}
                            {linkActivity.count === 1 ? "recipe" : "recipes"}
                            {linkActivity.recentlyLinked ? " · added to recipes recently" : ""}
                          </div>
                        )}
                      </td>
                      <td className="py-4 px-5 text-right tabular-nums font-medium">
                        <div>{formatCurrency(Number(ing.current_price))}</div>
                        <PriceActivityNote activity={latestPriceActivity} />
                      </td>
                      <td className="py-4 pl-2 pr-5 text-right align-middle whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              openRename(ing.id);
                            }}
                            className="inline-flex h-8 shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-md px-2 text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/15 md:min-w-8 md:px-2"
                            aria-label={`Rename ${formatCanonicalIngredientDisplayName(ing.name)}`}
                          >
                            <Pencil className="h-4 w-4" />
                            <span className="sr-only md:not-sr-only md:inline text-xs font-medium">
                              Edit
                            </span>
                          </button>
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              requestDelete(ing.id);
                            }}
                            className="inline-flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/70 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/15"
                            aria-label={`Delete ${formatCanonicalIngredientDisplayName(ing.name)}`}
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
          onRename={(id) => openRename(id)}
          onDelete={(id) => requestDelete(id)}
        />
      </div>
      <CanonicalIngredientRenameDialog
        open={renameOpen && renameTarget !== null}
        onOpenChange={(open) => {
          setRenameOpen(open);
          if (!open) {
            setRenameError(null);
            setRenameTargetId(null);
          }
        }}
        currentName={renameTarget?.name ?? ""}
        saving={renameSaving}
        error={renameError}
        onSubmit={(canonicalName) => void saveRename(canonicalName)}
      />
      <ConfirmDeleteDialog
        open={pendingDeleteId !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDeleteId(null);
        }}
        onConfirm={() => void confirmDelete()}
      />
    </AppShell>
  );
}

function IngredientDetailPanel({
  ingredient,
  priceActivity,
  recipeLinkActivity,
  onClose,
  onRename,
  onDelete,
}: {
  ingredient: Row | null;
  priceActivity: PriceActivity | undefined;
  recipeLinkActivity: RecipeLinkActivity | undefined;
  onClose: () => void;
  onRename: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  if (!ingredient) {
    return (
      <Card className="h-fit border-dashed bg-card/70">
        <div className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Ingredient cost details
        </div>
        <div className="mt-2 text-sm leading-6 text-muted-foreground">
          Select a row for pack cost and recipe exposure, or use Edit on any row to rename the
          catalog name.
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
  const inferred = inferPurchaseUnitsFromLineItemName(ingredient.name);
  const conversionHint = denom > 1 ? null : inferred.conversion_hint;
  const stockQuantityLabel =
    denom > 1
      ? formatQuantityWithUnit(denom, ingredient.purchase_unit || base)
      : formatQuantityWithUnit(1, ingredient.unit);
  const purchasePackLabel =
    denom > 1
      ? `1 pack -> ${stockQuantityLabel}`
      : conversionHint
        ? `1 ${conversionHint.purchase_unit} purchase`
        : `1 ${ingredient.unit || base}`;
  const recipeUsageUnit = conversionHint ? `${conversionHint.recipe_usage_unit} (hint)` : base;
  const recentlyUpdated = priceActivity && isRecentDate(priceActivity.created_at);

  return (
    <Card className="h-fit p-4 lg:sticky lg:top-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Ingredient cost details
          </div>
          <h2 className="mt-1.5 text-xl font-semibold leading-tight tracking-tight">
            {formatCanonicalIngredientDisplayName(ingredient.name)}
          </h2>
          <div className="mt-1 text-xs text-muted-foreground">
            {usageCount > 0 ? `Used in ${formatRecipeCount(usageCount)}` : "Not linked to recipes"}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={() => onRename(ingredient.id)}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
            aria-label="Rename catalog ingredient"
          >
            <Pencil className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
            aria-label="Close ingredient cost details"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-2.5">
        <DetailMetric
          label="Pack price"
          value={formatCurrency(Number(ingredient.current_price))}
          helper={denom > 1 ? formatQuantityWithUnit(denom, packLabel) : `per ${base}`}
        />
        <DetailMetric
          label="Unit cost"
          value={formatUnitCostCurrency(eff)}
          helper={`per ${base}`}
        />
        <DetailMetric
          label="Stock qty"
          value={stockQuantityLabel}
          helper={denom > 1 ? "Normalized per pack" : "Stored purchase unit"}
        />
        <DetailMetric label="Recipes" value={String(usageCount)} helper="Recipe impact" />
      </div>

      <section className="mt-3 rounded-lg border border-border/70 bg-muted/10 p-3.5">
        <div className="flex items-center justify-between gap-3">
          <div className="text-sm font-semibold">Operational status</div>
          <span className="rounded-md border border-border/60 bg-background/45 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
            {recentlyUpdated ? "Recently updated" : "In cost library"}
          </span>
        </div>
        <div className="mt-3 space-y-1 text-sm">
          <DetailRow
            label="Purchase pack"
            value={
              denom > 1
                ? `${formatCurrency(Number(ingredient.current_price))} / ${formatQuantityWithUnit(denom, packLabel)}`
                : `${formatCurrency(Number(ingredient.current_price))} per ${base}`
            }
          />
          <DetailRow label="Stock quantity" value={stockQuantityLabel} />
          <DetailRow label="Recipe usage unit" value={recipeUsageUnit} />
          <DetailRow label="Purchase unit" value={purchasePackLabel} />
          {conversionHint && (
            <DetailRow
              label="Conversion hint"
              value={`${formatQuantityWithUnit(
                conversionHint.estimated_quantity,
                conversionHint.stock_unit,
              )} usable / ${conversionHint.purchase_unit}`}
              valueClassName="text-muted-foreground"
            />
          )}
          <DetailRow label="Linked recipes" value={formatRecipeCount(usageCount)} />
        </div>
      </section>

      <section className="mt-3 rounded-lg border border-border/70 bg-muted/10 p-3.5">
        <div className="text-sm font-semibold">Price movement</div>
        {priceActivity ? (
          <div className="mt-3 space-y-1 text-sm">
            <DetailRow
              label="Latest movement"
              value={formatActivityChange(priceActivity)}
              valueClassName={getActivityTone(priceActivity)}
            />
            <DetailRow
              label="Price recency"
              value={
                recentlyUpdated ? "Updated in the last 14 days" : "No change in the last 14 days"
              }
            />
          </div>
        ) : (
          <div className="mt-3 rounded-md border border-dashed border-border/70 bg-background/35 px-3 py-2 text-sm text-muted-foreground">
            No price changes logged yet.
          </div>
        )}
      </section>

      <section className="mt-3 rounded-lg border border-border/70 bg-muted/10 p-3.5">
        <div className="text-sm font-semibold">Recipe impact</div>
        <div className="mt-2 text-sm leading-6 text-muted-foreground">
          {usageCount > 0
            ? `Price changes may affect ${formatRecipeCount(usageCount)}.`
            : "Not currently linked to recipes."}
          {recipeLinkActivity?.recentlyLinked ? " Added to recipes recently." : ""}
        </div>
      </section>

      <div className="mt-3 flex flex-wrap justify-end gap-2">
        <button
          type="button"
          onClick={() => onRename(ingredient.id)}
          className="inline-flex items-center gap-2 rounded-lg border border-foreground/20 bg-foreground/5 px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-foreground/10"
        >
          <Pencil className="h-4 w-4" />
          Rename catalog name
        </button>
        <button
          type="button"
          onClick={() => onDelete(ingredient.id)}
          className="inline-flex items-center gap-2 rounded-lg border border-border/70 px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted/60 hover:text-destructive"
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
    <div className="rounded-lg border border-border/70 bg-background/35 p-3">
      <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        {label}
      </div>
      <div className="mt-1.5 text-lg font-semibold leading-none tabular-nums">{value}</div>
      <div className="mt-1.5 text-xs text-muted-foreground">{helper}</div>
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
    <div className="flex items-center justify-between gap-3 py-0.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={`text-right text-sm font-medium ${valueClassName}`}>{value}</span>
    </div>
  );
}

function formatRecipeCount(count: number) {
  return `${count} ${count === 1 ? "recipe" : "recipes"}`;
}

function formatActivityChange(activity: PriceActivity) {
  const deltaPercent = activity.delta_percent;
  if (typeof deltaPercent === "number" && deltaPercent !== 0) {
    return formatPercent(deltaPercent, { signDisplay: "always" });
  }

  const delta = activity.delta;
  if (typeof delta === "number" && delta !== 0) {
    return `${delta > 0 ? "+" : ""}${formatCurrency(delta)}`;
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
        Price updated in last 14 days
        {hasDirectionalChange ? ` · ${formatPercent(deltaPercent, { signDisplay: "always" })}` : ""}
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
