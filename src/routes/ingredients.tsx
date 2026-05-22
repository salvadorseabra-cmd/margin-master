import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { AppShell, Card } from "@/components/AppShell";
import { Plus, Loader2, Pencil, Trash2, TrendingDown, TrendingUp, ClipboardList } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
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
import { ConfirmDeleteDialog } from "@/components/confirm-delete-dialog";
import { CanonicalIngredientRenameDialog } from "@/components/canonical-ingredient-rename-dialog";
import { IngredientDetailOperationalLayout } from "@/components/ingredient-detail-operational-layout";
import {
  buildActionableCanonicalNamingQueue,
  type ActionableCanonicalNamingQueueEntry,
} from "@/lib/canonical-ingredient-naming-queue";
import { readLocalInvoiceIngredientAliases } from "@/lib/operational-review-queue";
import { OperationalReviewQueueSection } from "@/components/operational-review-queue-section";
import {
  buildCanonicalIngredientRenamePayload,
  traceCanonicalRename,
} from "@/lib/canonical-ingredient-rename";
import { traceFoodCostRecalculationSource } from "@/lib/recipe-canonical-graph-trace";
import { loadCanonicalIngredientCatalog } from "@/lib/ingredient-catalog-load";
import { getVolatileIngredients } from "@/lib/ingredient-price-history";
import {
  deriveIngredientListGlanceSignals,
  ingredientListGlanceDotClassName,
  ingredientListGlanceTitle,
} from "@/lib/ingredient-list-glance-signals";
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
  const [volatileIngredientIds, setVolatileIngredientIds] = useState<Set<string>>(new Set());
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
  const [renameInitialName, setRenameInitialName] = useState<string | null>(null);
  const [renameSaving, setRenameSaving] = useState(false);
  const [renameError, setRenameError] = useState<string | null>(null);
  const [namingReviewActive, setNamingReviewActive] = useState(false);
  const [namingReviewIndex, setNamingReviewIndex] = useState(0);
  const [namingReviewEpoch, setNamingReviewEpoch] = useState(0);

  const catalogForNaming = useMemo(
    () =>
      rows.map((row) => ({
        id: row.id,
        name: row.name,
        normalized_name: row.normalized_name,
      })),
    [rows],
  );

  const confirmedAliases = useMemo(
    () => readLocalInvoiceIngredientAliases(user?.id),
    [user?.id, namingReviewEpoch],
  );

  const namingReviewQueue = useMemo((): ActionableCanonicalNamingQueueEntry[] => {
    void namingReviewEpoch;
    return buildActionableCanonicalNamingQueue({
      catalog: catalogForNaming,
      userId: user?.id,
      confirmedAliases,
    });
  }, [catalogForNaming, user?.id, confirmedAliases, namingReviewEpoch]);

  const enterNamingReview = useCallback(() => {
    const queue = buildActionableCanonicalNamingQueue({
      catalog: catalogForNaming,
      userId: user?.id,
      confirmedAliases,
    });
    if (queue.length === 0) return;
    setNamingReviewActive(true);
    setNamingReviewIndex(0);
    setSelectedIngredientId(queue[0]!.ingredientId);
  }, [catalogForNaming, user?.id, confirmedAliases]);

  const exitNamingReview = useCallback(() => {
    setNamingReviewActive(false);
    setNamingReviewIndex(0);
  }, []);

  const refreshNamingReviewQueue = useCallback(() => {
    setNamingReviewEpoch((epoch) => epoch + 1);
  }, []);

  const handleNamingReviewIndexChange = useCallback(
    (index: number) => {
      if (namingReviewQueue.length === 0) return;
      const clampedIndex = Math.min(Math.max(0, index), namingReviewQueue.length - 1);
      setNamingReviewIndex(clampedIndex);
      const entry = namingReviewQueue[clampedIndex];
      if (entry) setSelectedIngredientId(entry.ingredientId);
    },
    [namingReviewQueue],
  );

  useEffect(() => {
    if (!namingReviewActive) return;
    if (namingReviewQueue.length === 0) {
      setNamingReviewActive(false);
      setNamingReviewIndex(0);
      return;
    }
    if (namingReviewIndex >= namingReviewQueue.length) {
      handleNamingReviewIndexChange(namingReviewQueue.length - 1);
    }
  }, [
    namingReviewActive,
    namingReviewQueue,
    namingReviewIndex,
    handleNamingReviewIndexChange,
  ]);

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
        setVolatileIngredientIds(new Set());
      } else {
        const [{ data: historyData }, { data: linkData }, volatileRows] = await Promise.all([
          supabase
            .from("ingredient_price_history")
            .select("ingredient_id, created_at, delta, delta_percent")
            .in("ingredient_id", ingredientIds)
            .order("created_at", { ascending: false }),
          supabase
            .from("recipe_ingredients")
            .select("ingredient_id, created_at")
            .in("ingredient_id", ingredientIds),
          getVolatileIngredients(supabase),
        ]);

        setVolatileIngredientIds(
          new Set(volatileRows.map((row) => row.ingredient_id)),
        );

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

  const openRename = (ingredientId: string, suggestedName?: string | null) => {
    setSelectedIngredientId(ingredientId);
    setRenameTargetId(ingredientId);
    setRenameInitialName(suggestedName?.trim() || null);
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
    setRenameInitialName(null);
    if (namingReviewActive) {
      refreshNamingReviewQueue();
    }
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
      <OperationalReviewQueueSection
        userId={user?.id}
        catalog={rows}
        onSelectIngredient={(id) => setSelectedIngredientId(id)}
        onEnterNamingReview={enterNamingReview}
      />
      {open && (
        <Card className="mb-3">
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

      <div className="grid gap-2 lg:grid-cols-[minmax(0,47fr)_minmax(0,53fr)] lg:items-stretch lg:min-h-[min(70vh,640px)]">
        <Card className="flex min-h-0 min-w-0 flex-col p-0 lg:max-h-[min(70vh,640px)]">
          <div className="min-h-0 flex-1 overflow-x-auto overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-[1] bg-muted/50 backdrop-blur-sm">
                <tr className="text-left text-[10px] uppercase tracking-wide text-muted-foreground">
                  <th className="py-1 px-2.5 font-medium">Ingredient</th>
                  <th className="py-1 px-2.5 font-medium text-right whitespace-nowrap">Pack</th>
                  <th className="py-1 pl-1 pr-2.5 font-medium text-right w-[4.5rem]">Actions</th>
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
                      <td className="py-1 px-2.5 min-w-0">
                        <div className="flex min-w-0 items-center gap-1.5">
                          <span className="min-w-0 truncate text-[13px] font-medium leading-snug transition-colors group-hover:text-foreground">
                            {formatCanonicalIngredientDisplayName(ing.name)}
                          </span>
                          <IngredientListGlanceDots
                            ingredient={ing}
                            priceActivity={latestPriceActivity}
                            recipeLinkActivity={linkActivity}
                            volatileIngredientIds={volatileIngredientIds}
                          />
                        </div>
                        <div className="text-[10px] leading-snug text-muted-foreground">
                          {denom > 1
                            ? `${formatUnitCostCurrency(eff)}/${base} · ${formatQuantityWithUnit(denom, ing.purchase_unit)}`
                            : `per ${base}`}
                          {linkActivity
                            ? ` · ${linkActivity.count} ${linkActivity.count === 1 ? "recipe" : "recipes"}`
                            : ""}
                        </div>
                      </td>
                      <td className="py-1 px-2.5 text-right tabular-nums text-[13px] font-medium whitespace-nowrap">
                        <div>{formatCurrency(Number(ing.current_price))}</div>
                        <PriceActivityNote activity={latestPriceActivity} />
                      </td>
                      <td className="py-1 pl-1 pr-2.5 text-right align-middle whitespace-nowrap">
                        <div className="flex items-center justify-end gap-0.5">
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              openRename(ing.id);
                            }}
                            className="inline-flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/15"
                            aria-label={`Rename ${formatCanonicalIngredientDisplayName(ing.name)}`}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              requestDelete(ing.id);
                            }}
                            className="inline-flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/70 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/15"
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

        <IngredientDetailOperationalLayout
          ingredient={selectedIngredient}
          userId={user?.id}
          catalog={rows}
          priceActivity={selectedIngredient ? priceActivity[selectedIngredient.id] : undefined}
          recipeLinkActivity={
            selectedIngredient ? recipeLinkActivity[selectedIngredient.id] : undefined
          }
          namingReviewActive={namingReviewActive}
          namingReviewQueue={namingReviewQueue}
          namingReviewIndex={namingReviewIndex}
          onNamingReviewIndexChange={handleNamingReviewIndexChange}
          onExitNamingReview={exitNamingReview}
          onNamingReviewQueueChanged={refreshNamingReviewQueue}
          onClose={() => {
            exitNamingReview();
            setSelectedIngredientId(null);
          }}
          onSelectRelated={(id) => setSelectedIngredientId(id)}
          onRename={(id, suggestedName) => openRename(id, suggestedName)}
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
            setRenameInitialName(null);
          }
        }}
        currentName={renameTarget?.name ?? ""}
        initialCanonicalName={renameInitialName}
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

function IngredientListGlanceDots({
  ingredient,
  priceActivity,
  recipeLinkActivity,
  volatileIngredientIds,
}: {
  ingredient: Row;
  priceActivity: PriceActivity | undefined;
  recipeLinkActivity: RecipeLinkActivity | undefined;
  volatileIngredientIds: ReadonlySet<string>;
}) {
  const signals = deriveIngredientListGlanceSignals({
    ingredient,
    priceActivity,
    recipeLinkActivity,
    volatileIngredientIds,
  });
  if (signals.length === 0) return null;

  return (
    <span
      className="inline-flex shrink-0 items-center gap-[3px]"
      aria-label={signals.map(ingredientListGlanceTitle).join(", ")}
    >
      {signals.map((signal) => (
        <span
          key={signal}
          className={`size-[5px] rounded-full ${ingredientListGlanceDotClassName(signal)}`}
          title={ingredientListGlanceTitle(signal)}
          aria-hidden
        />
      ))}
    </span>
  );
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
