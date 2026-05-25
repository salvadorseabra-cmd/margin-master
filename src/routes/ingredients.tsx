import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { AppShell, Card } from "@/components/AppShell";
import { Plus, Loader2, Pencil, Trash2, ClipboardList } from "lucide-react";
import { toast } from "sonner";
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
import { formatCurrency } from "@/lib/display-format";
import { ConfirmDeleteDialog } from "@/components/confirm-delete-dialog";
import { CanonicalIngredientRenameDialog } from "@/components/canonical-ingredient-rename-dialog";
import { IngredientDetailOperationalLayout } from "@/components/ingredient-detail-operational-layout";
import {
  buildActionableCanonicalNamingQueue,
  type ActionableCanonicalNamingQueueEntry,
} from "@/lib/canonical-ingredient-naming-queue";
import {
  detectOrphanCanonicalIngredients,
  emptyOrphanReport,
  isAliasOnlyOperationalDependency,
  type IngredientOrphanReport,
} from "@/lib/ingredient-orphan-detection";
import {
  buildDuplicateReviewListGroups,
  duplicateClusterIngredientIds,
  findOperationalDuplicateClusterForIngredient,
  operationalListFilterReviewBarTitle,
  operationalListBrowseRowBaseClass,
  operationalListBrowseRowHoverClass,
  operationalListBrowseRowSelectedClass,
  operationalListReviewBannerClass,
  operationalListReviewRowSelectedClass,
  readLocalInvoiceIngredientAliases,
  unusedReviewIngredientIds,
  type OperationalListFilter,
} from "@/lib/operational-review-queue";
import {
  buildCanonicalIngredientRenamePayload,
  traceCanonicalRename,
} from "@/lib/canonical-ingredient-rename";
import { traceFoodCostRecalculationSource } from "@/lib/recipe-canonical-graph-trace";
import { loadCanonicalIngredientCatalog } from "@/lib/ingredient-catalog-load";
import {
  archiveIngredient,
  clearIngredientArchiveReason,
  formatArchivedRecency,
  formatLastPurchaseRecencyPhrase,
  loadArchivedIngredientCatalog,
  restoreIngredient,
  sortOperationallyArchivedIngredients,
} from "@/lib/ingredient-archive";
import { getVolatileIngredients } from "@/lib/ingredient-price-history";
import {
  formatIngredientListLastPurchaseColumn,
  formatIngredientListRowSubline,
  formatOperationalListRowDominantReason,
  pricingSnapshotForListRow,
} from "@/lib/ingredient-list-glance-signals";
import { loadMatchingIngredientCatalog } from "@/lib/ingredient-catalog-load";
import { loadConfirmedIngredientAliasMap } from "@/lib/ingredient-alias-memory";
import { loadLatestPurchaseGlanceByIngredientId } from "@/lib/ingredient-pricing-freshness";
import type { IngredientLatestPurchaseGlance } from "@/lib/ingredient-operational-intelligence";
import {
  traceCanonicalCreateAttempt,
  traceCanonicalCreateNameSource,
} from "@/lib/ingredient-catalog-diagnostics";

export const Route = createFileRoute("/ingredients")({
  head: () => ({
    meta: [
      { title: "Ingredient Costs — Marginly" },
      {
        name: "description",
        content: "Catalog ingredients and purchase history.",
      },
    ],
  }),
  component: IngredientsPage,
});

type Row = Tables<"ingredients"> & { archived_at?: string | null };

type CatalogListMode = "active" | "archived";

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
  const [catalogListMode, setCatalogListMode] = useState<CatalogListMode>("active");
  const [rows, setRows] = useState<Row[]>([]);
  const [archivedRows, setArchivedRows] = useState<Row[]>([]);
  const [priceActivity, setPriceActivity] = useState<Record<string, PriceActivity>>({});
  const [lastPurchaseGlanceByIngredientId, setLastPurchaseGlanceByIngredientId] = useState<
    Record<string, IngredientLatestPurchaseGlance>
  >({});
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
  const [listQueueFilter, setListQueueFilter] = useState<OperationalListFilter | null>(null);
  const [unusedReviewIds, setUnusedReviewIds] = useState<Set<string>>(new Set());
  const [orphanReportsByIngredientId, setOrphanReportsByIngredientId] = useState<
    Map<string, IngredientOrphanReport>
  >(new Map());
  const exitToBrowse = useCallback(() => {
    setListQueueFilter(null);
    setNamingReviewActive(false);
    setNamingReviewIndex(0);
    setSelectedIngredientId(null);
  }, []);

  const clearListReview = exitToBrowse;

  const applyListReview = useCallback(
    (filter: OperationalListFilter | null) => {
      if (!filter) {
        exitToBrowse();
        return;
      }
      setListQueueFilter(filter);
      setNamingReviewActive(false);
      setNamingReviewIndex(0);
    },
    [exitToBrowse],
  );

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
  }, [namingReviewActive, namingReviewQueue, namingReviewIndex, handleNamingReviewIndexChange]);

  const loadArchived = async () => {
    setLoading(true);
    const { rows: catalogRows, error: catalogError } = await loadArchivedIngredientCatalog(supabase);
    if (catalogError) setError(catalogError);
    else {
      const ingredientRows = sortOperationallyArchivedIngredients(catalogRows) as Row[];
      setArchivedRows(ingredientRows);

      const ingredientIds = ingredientRows.map((ingredient) => ingredient.id);
      if (ingredientIds.length === 0) {
        setLastPurchaseGlanceByIngredientId({});
      } else {
        const catalogForPurchaseScan = ingredientRows.map((row) => ({
          id: row.id,
          name: row.name,
          normalized_name: row.normalized_name,
        }));
        const [dbAliases, matchCatalogResult] = await Promise.all([
          loadConfirmedIngredientAliasMap(supabase),
          loadMatchingIngredientCatalog(supabase),
        ]);
        const purchaseRecencyAliases = {
          ...readLocalInvoiceIngredientAliases(user?.id),
          ...dbAliases,
        };
        const lastPurchasesResolved = await loadLatestPurchaseGlanceByIngredientId(
          supabase,
          matchCatalogResult.rows.length > 0 ? matchCatalogResult.rows : catalogForPurchaseScan,
          purchaseRecencyAliases,
        );
        setLastPurchaseGlanceByIngredientId(lastPurchasesResolved);
      }
    }
    setLoading(false);
  };

  const load = async () => {
    if (catalogListMode === "archived") {
      await loadArchived();
      return;
    }
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
        setLastPurchaseGlanceByIngredientId({});
        setRecipeLinkActivity({});
        setVolatileIngredientIds(new Set());
      } else {
        const catalogForPurchaseScan = ingredientRows.map((row) => ({
          id: row.id,
          name: row.name,
          normalized_name: row.normalized_name,
        }));
        const [
          { data: historyData },
          { data: linkData },
          volatileRows,
          dbAliases,
          matchCatalogResult,
        ] = await Promise.all([
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
          loadConfirmedIngredientAliasMap(supabase),
          loadMatchingIngredientCatalog(supabase),
        ]);
        const purchaseRecencyAliases = {
          ...readLocalInvoiceIngredientAliases(user?.id),
          ...dbAliases,
        };
        const lastPurchasesResolved = await loadLatestPurchaseGlanceByIngredientId(
          supabase,
          matchCatalogResult.rows.length > 0 ? matchCatalogResult.rows : catalogForPurchaseScan,
          purchaseRecencyAliases,
        );

        setVolatileIngredientIds(new Set(volatileRows.map((row) => row.ingredient_id)));

        const latestActivity: Record<string, PriceActivity> = {};
        (historyData ?? []).forEach((activity) => {
          if (!latestActivity[activity.ingredient_id]) {
            latestActivity[activity.ingredient_id] = activity;
          }
        });
        setPriceActivity(latestActivity);
        setLastPurchaseGlanceByIngredientId(lastPurchasesResolved);

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
    if (user) void load();
  }, [user, catalogListMode]);

  const switchCatalogListMode = useCallback(
    (mode: CatalogListMode) => {
      setCatalogListMode(mode);
      exitToBrowse();
      setSelectedIngredientId(null);
      setOpen(false);
    },
    [exitToBrowse],
  );

  const showArchiveUndoToast = useCallback(
    (ingredientId: string) => {
      toast("Ingredient archived", {
        action: {
          label: "Undo",
          onClick: () => {
            void (async () => {
              if (!user?.id) return;
              const { error: restoreError } = await restoreIngredient({
                client: supabase,
                ingredientId,
                userId: user.id,
              });
              if (restoreError) {
                toast.error(restoreError.message);
                await load();
                return;
              }
              await load();
            })();
          },
        },
      });
    },
    [user?.id],
  );

  const handleArchive = useCallback(
    async (ingredientId: string) => {
      if (!user?.id) return;
      setRows((prev) => prev.filter((row) => row.id !== ingredientId));
      if (selectedIngredientId === ingredientId) setSelectedIngredientId(null);
      const { error: archiveError } = await archiveIngredient({
        client: supabase,
        ingredientId,
        userId: user.id,
      });
      if (archiveError) {
        toast.error(archiveError.message);
        await load();
        return;
      }
      showArchiveUndoToast(ingredientId);
      if (catalogListMode === "archived") {
        await loadArchived();
      }
    },
    [user?.id, selectedIngredientId, showArchiveUndoToast, catalogListMode],
  );

  const handleRestore = useCallback(
    async (ingredientId: string) => {
      if (!user?.id) return;
      const { error: restoreError } = await restoreIngredient({
        client: supabase,
        ingredientId,
        userId: user.id,
      });
      if (restoreError) {
        toast.error(restoreError.message);
        return;
      }
      clearIngredientArchiveReason(user.id, ingredientId);
      setArchivedRows((prev) => prev.filter((row) => row.id !== ingredientId));
      toast("Ingredient restored");
      setCatalogListMode("active");
      await load();
    },
    [user?.id],
  );

  useEffect(() => {
    if (!user || rows.length === 0) {
      setUnusedReviewIds(new Set());
      setOrphanReportsByIngredientId(new Map());
      return;
    }
    let cancelled = false;
    const catalog = rows.map((row) => ({
      id: row.id,
      name: row.name,
      normalized_name: row.normalized_name,
    }));
    void detectOrphanCanonicalIngredients(supabase, catalog).then(({ reports }) => {
      if (cancelled) return;
      setOrphanReportsByIngredientId(reports);
      setUnusedReviewIds(unusedReviewIngredientIds(catalog, reports));
    });
    return () => {
      cancelled = true;
    };
  }, [user, rows]);

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
    const payload = buildCanonicalIngredientRenamePayload(renameTarget.id, rawName, catalog);
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

  const duplicateIngredientIds = useMemo(
    () =>
      duplicateClusterIngredientIds(
        rows.map((row) => ({
          id: row.id,
          name: row.name,
          normalized_name: row.normalized_name,
        })),
      ),
    [rows],
  );

  const catalogCanonicalInput = useMemo(
    () =>
      rows.map((row) => ({
        id: row.id,
        name: row.name,
        normalized_name: row.normalized_name,
        created_at: row.created_at,
      })),
    [rows],
  );

  const visibleRows = useMemo(() => {
    if (!listQueueFilter) return rows;
    if (listQueueFilter === "duplicates") {
      return rows.filter((row) => duplicateIngredientIds.has(row.id));
    }
    if (listQueueFilter === "unused") {
      return rows.filter((row) => unusedReviewIds.has(row.id));
    }
    return rows;
  }, [rows, listQueueFilter, duplicateIngredientIds, unusedReviewIds]);

  const recipeCountById = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const [id, activity] of Object.entries(recipeLinkActivity)) {
      counts[id] = activity?.count ?? 0;
    }
    return counts;
  }, [recipeLinkActivity]);

  const selectedDuplicateCluster = useMemo(() => {
    if (!selectedIngredient || listQueueFilter !== "duplicates") return null;
    return findOperationalDuplicateClusterForIngredient(
      catalogCanonicalInput,
      selectedIngredient.id,
    );
  }, [selectedIngredient, listQueueFilter, catalogCanonicalInput]);

  const duplicateListGroups = useMemo(() => {
    if (listQueueFilter !== "duplicates") return null;
    return buildDuplicateReviewListGroups(catalogCanonicalInput, visibleRows);
  }, [listQueueFilter, catalogCanonicalInput, visibleRows]);

  const rowsById = useMemo(() => new Map(rows.map((row) => [row.id, row])), [rows]);

  const renderIngredientRow = (ing: Row) => {
    const latestPriceActivity = priceActivity[ing.id];
    const purchaseGlance = lastPurchaseGlanceByIngredientId[ing.id];
    const pricingRecency = {
      priceRefreshAt: latestPriceActivity?.created_at ?? null,
      lastPurchaseAt: purchaseGlance?.lastPurchaseAt ?? null,
    };
    const aliasOnly = isAliasOnlyOperationalDependency(
      orphanReportsByIngredientId.get(ing.id) ?? emptyOrphanReport(ing.id),
    );
    const pricingSnapshot = pricingSnapshotForListRow({
      ingredient: ing,
      priceActivity: latestPriceActivity,
      pricingRecency,
    });
    const dominantReason = formatOperationalListRowDominantReason({
      listReviewMode: listQueueFilter,
      pricingSnapshot,
      aliasOnly,
      purchaseGlance,
    });
    const rowSubline = formatIngredientListRowSubline({
      listReviewMode: listQueueFilter,
      dominantReason,
      purchaseGlance,
    });
    const lastPurchaseColumn = formatIngredientListLastPurchaseColumn(purchaseGlance);
    const selected = selectedIngredientId === ing.id;
    const selectedRowClass = selected
      ? listQueueFilter
        ? operationalListReviewRowSelectedClass(listQueueFilter)
        : operationalListBrowseRowSelectedClass()
      : "";
    return (
      <tr
        key={ing.id}
        aria-selected={selected}
        onClick={() => setSelectedIngredientId(ing.id)}
        className={`group relative cursor-pointer transition-colors duration-150 ease-out ${operationalListBrowseRowBaseClass()} ${
          selected ? selectedRowClass : operationalListBrowseRowHoverClass()
        }`}
      >
        <td className="min-w-0 px-3 py-2">
          <div className="min-w-0">
            <p
              className={`min-w-0 truncate text-sm leading-snug ${
                selected
                  ? "font-semibold text-foreground"
                  : "font-medium text-foreground/85"
              }`}
            >
              {formatCanonicalIngredientDisplayName(ing.name)}
            </p>
            {rowSubline ? (
              <p className="mt-0.5 truncate text-xs font-normal leading-snug text-muted-foreground/70">
                {rowSubline}
              </p>
            ) : null}
          </div>
        </td>
        <td className="px-3 py-2 align-middle tabular-nums whitespace-nowrap">
          <span className="text-xs text-muted-foreground">{lastPurchaseColumn}</span>
        </td>
        <td className="px-3 py-2 text-right align-middle tabular-nums whitespace-nowrap">
          <span className="text-xs font-medium text-foreground/90">
            {formatCurrency(Number(ing.current_price))}
          </span>
        </td>
        <td className="py-2 pl-1 pr-3 text-right align-middle whitespace-nowrap">
          <div className="flex items-center justify-end gap-0.5 opacity-0 transition-opacity duration-150 group-hover:opacity-100 focus-within:opacity-100">
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                openRename(ing.id);
              }}
              className="inline-flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground/70 transition-colors duration-150 ease-out hover:bg-muted/40 hover:text-foreground focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/10"
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
              className="inline-flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground/70 transition-colors duration-150 ease-out hover:bg-muted/40 hover:text-destructive focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/10"
              aria-label={`Delete ${formatCanonicalIngredientDisplayName(ing.name)}`}
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </td>
      </tr>
    );
  };

  return (
    <AppShell
      title="Ingredient costs"
      subtitle="Review what matters. Act with confidence."
      action={
        <div className="flex flex-wrap items-center gap-2">
          <Link
            to="/ingredients/review"
            className="inline-flex items-center gap-2 rounded-lg border border-border px-3.5 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50"
          >
            <ClipboardList className="h-4 w-4" />
            Catalog review
          </Link>
          {catalogListMode === "active" ? (
            <button
              onClick={() => setOpen((v) => !v)}
              className="inline-flex cursor-pointer items-center gap-2 bg-foreground text-background rounded-lg px-3.5 py-2 text-sm font-medium hover:opacity-90"
            >
              <Plus className="h-4 w-4" /> Add ingredient
            </button>
          ) : null}
        </div>
      }
    >
      {open && catalogListMode === "active" && (
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

      <div
        className={
          catalogListMode === "archived"
            ? "grid gap-3"
            : "grid gap-3 lg:grid-cols-[minmax(0,40fr)_minmax(0,60fr)] lg:items-stretch lg:min-h-[min(72vh,680px)]"
        }
      >
        <Card
          className={`flex min-h-0 min-w-0 flex-col overflow-hidden border-border/50 bg-card p-0 shadow-sm ${
            catalogListMode === "archived" ? "" : "lg:max-h-[min(72vh,680px)]"
          }`}
        >
          <div className="flex shrink-0 items-center border-b border-border/15 px-2.5 py-2">
            <div
              className="inline-flex rounded-lg border border-border/50 p-0.5"
              role="tablist"
              aria-label="Ingredient catalog view"
            >
              <button
                type="button"
                role="tab"
                aria-selected={catalogListMode === "active"}
                onClick={() => switchCatalogListMode("active")}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                  catalogListMode === "active"
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Active
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={catalogListMode === "archived"}
                onClick={() => switchCatalogListMode("archived")}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                  catalogListMode === "archived"
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Archived
              </button>
            </div>
          </div>
          {catalogListMode === "active" && listQueueFilter && (
            <div
              className={`flex shrink-0 items-center justify-between gap-2 border-b border-border/10 px-2.5 py-1 ${operationalListReviewBannerClass(listQueueFilter)}`}
            >
              <p className="min-w-0 truncate text-[10px] font-medium text-foreground/90">
                {operationalListFilterReviewBarTitle(listQueueFilter, visibleRows.length)}
              </p>
              <button
                type="button"
                onClick={clearListReview}
                className="shrink-0 text-[10px] text-muted-foreground/55 hover:text-foreground"
              >
                All
              </button>
            </div>
          )}
          <div className="min-h-0 flex-1 overflow-x-auto overflow-y-auto">
            {catalogListMode === "archived" ? (
              <div className="mx-auto max-w-xl divide-y divide-border/15">
                {loading && (
                  <div className="flex justify-center py-8">
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground/70" />
                  </div>
                )}
                {!loading && archivedRows.length === 0 && (
                  <div className="px-4 py-8">
                    <p className="text-sm text-muted-foreground">No archived ingredients</p>
                    <p className="mt-1 text-xs text-muted-foreground/70">
                      Archived items stay in history and can be restored anytime.
                    </p>
                  </div>
                )}
                {!loading &&
                  archivedRows.map((ing) => {
                    const purchaseGlance = lastPurchaseGlanceByIngredientId[ing.id];
                    const lastPurchasePhrase = formatLastPurchaseRecencyPhrase(
                      purchaseGlance?.lastPurchaseAt,
                    );
                    const archivedPhrase = formatArchivedRecency(ing.archived_at);
                    return (
                      <div
                        key={ing.id}
                        className="flex items-start justify-between gap-4 px-4 py-3"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-normal text-foreground/70">
                            {formatCanonicalIngredientDisplayName(ing.name)}
                          </p>
                          <p className="mt-0.5 text-xs font-normal text-muted-foreground">
                            {archivedPhrase}
                          </p>
                          {lastPurchasePhrase ? (
                            <p className="mt-0.5 text-xs font-normal text-muted-foreground/65">
                              {lastPurchasePhrase}
                            </p>
                          ) : null}
                        </div>
                        <button
                          type="button"
                          onClick={() => void handleRestore(ing.id)}
                          className="shrink-0 rounded-md px-2.5 py-1 text-xs font-normal text-muted-foreground transition-colors hover:bg-muted/20 hover:text-foreground/90"
                        >
                          Restore
                        </button>
                      </div>
                    );
                  })}
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-[1] border-b border-border/15 bg-card">
                  <tr className="text-left text-xs font-medium text-muted-foreground/70">
                    <th className="px-3 py-2 font-medium">Ingredient</th>
                    <th className="px-3 py-2 font-medium whitespace-nowrap">Last purchase</th>
                    <th className="px-3 py-2 font-medium text-right whitespace-nowrap">
                      Pack price
                    </th>
                    <th className="w-14 py-2 pr-3 font-medium text-right" aria-label="Actions" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/20">
                  {loading && (
                    <tr>
                      <td colSpan={4} className="py-6 text-center">
                        <Loader2 className="h-4 w-4 animate-spin inline text-muted-foreground" />
                      </td>
                    </tr>
                  )}
                  {!loading && rows.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-2.5 py-6">
                        <p className="text-[12px] font-medium text-foreground/85">
                          No ingredients yet
                        </p>
                      </td>
                    </tr>
                  )}
                  {!loading && rows.length > 0 && visibleRows.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-2.5 py-6">
                        <p className="text-[12px] text-muted-foreground/60">Queue clear</p>
                      </td>
                    </tr>
                  )}
                  {duplicateListGroups
                    ? duplicateListGroups.flatMap((group) =>
                        group.rowIds.map((rowId) => {
                          const ing = rowsById.get(rowId);
                          return ing ? renderIngredientRow(ing) : null;
                        }),
                      )
                    : visibleRows.map((ing) => renderIngredientRow(ing))}
                </tbody>
              </table>
            )}
          </div>
          {!loading && catalogListMode === "active" && rows.length > 0 ? (
            <div className="shrink-0 border-t border-border/40 px-3 py-2 text-xs text-muted-foreground">
              {rows.length} {rows.length === 1 ? "ingredient" : "ingredients"}
            </div>
          ) : null}
          {!loading && catalogListMode === "archived" && archivedRows.length > 0 ? (
            <div className="shrink-0 border-t border-border/15 px-4 py-2 text-xs text-muted-foreground/70">
              {archivedRows.length} archived
            </div>
          ) : null}
        </Card>

        {catalogListMode === "active" ? (
          <IngredientDetailOperationalLayout
            ingredient={selectedIngredient}
            userId={user?.id}
            catalog={rows}
            listReviewMode={listQueueFilter}
            duplicateCluster={selectedDuplicateCluster}
            recipeCountById={recipeCountById}
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
            onExitListReview={clearListReview}
            onApplyListFilter={applyListReview}
            onSelectIngredient={(id) => setSelectedIngredientId(id)}
            onRename={(id, suggestedName) => openRename(id, suggestedName)}
            onArchive={(id) => void handleArchive(id)}
            onDelete={(id) => requestDelete(id)}
          />
        ) : null}
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
