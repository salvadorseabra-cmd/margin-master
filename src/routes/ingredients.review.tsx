import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { AppShell, Card } from "@/components/AppShell";
import {
  CatalogReviewWorkspaceSimple,
  type CatalogReviewWorkspaceItem,
} from "@/components/catalog-review-workspace-simple";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { formatCanonicalIngredientDisplayName } from "@/lib/canonical-ingredient-display-name";
import { loadRecipeNamesForIngredient } from "@/lib/catalog-review-recipe-names";
import {
  buildCatalogReviewCurrentMatchCountsFromScan,
  loadCatalogReviewCurrentMatchesForIngredient,
  loadCatalogReviewInvoiceItemScan,
  reassignCatalogReviewInvoiceLineMatch,
  type CatalogReviewCurrentMatchRow,
  type CatalogReviewInvoiceItemScanRow,
} from "@/lib/catalog-review-current-matches";
import type { PersistedMatchForCutover } from "@/lib/invoice-item-match-read-cutover";
import {
  formatCurrentMatchCountSubline,
  sortCatalogReviewAlphabetical,
} from "@/lib/catalog-review-list-indicator";
import {
  formatCatalogReviewArchivedStatusBadge,
  formatCatalogReviewRecipeStatusBadge,
} from "@/lib/catalog-review-status-badges";
import { CatalogReviewStatusBadge } from "@/components/catalog-review-status-badge";
import { buildCatalogReviewMatchRows } from "@/lib/catalog-review-match-rows";
import { loadConfirmedIngredientAliasMap } from "@/lib/ingredient-alias-memory";
import type { IngredientAliasMap } from "@/lib/ingredient-canonical";
import {
  archiveIngredient,
  clearIngredientArchiveReason,
  formatArchivedDateLabel,
  formatIngredientArchiveReasonLine,
  getIngredientArchiveReason,
  loadArchivedIngredientCatalog,
  restoreIngredient,
  sortOperationallyArchivedIngredients,
  type OperationallyArchivedIngredient,
} from "@/lib/ingredient-archive";
import { loadActiveIngredientCatalog } from "@/lib/ingredient-catalog-load";
import {
  buildExplicitRecipeCountMap,
  loadRecipeCountByIngredientId,
} from "@/lib/invoice-operational-metadata";
import {
  operationalListBrowseRowBaseClass,
  operationalListBrowseRowHoverClass,
  operationalListBrowseRowSelectedClass,
} from "@/lib/operational-review-queue";
import { filterCanonicalCatalogIngredients } from "@/lib/ingredient-kind";
import { buildCanonicalIngredientPickerOptions } from "@/lib/ingredient-picker-options";
import { clearIngredientMatchedInvoiceProductsCache } from "@/lib/ingredient-operational-intelligence";
import { ArrowLeft, ClipboardList, Loader2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/ingredients/review")({
  head: () => ({
    meta: [
      { title: "Catalog review — Marginly" },
      {
        name: "description",
        content: "Review current invoice line matches per canonical ingredient.",
      },
    ],
  }),
  component: CatalogReviewPage,
});

type CatalogReviewListMode = "active" | "archived";

type CatalogReviewListItem = CatalogReviewWorkspaceItem & {
  subline: string | null;
};

function CatalogReviewPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [catalogRows, setCatalogRows] = useState<
    Awaited<ReturnType<typeof loadActiveIngredientCatalog>>["rows"]
  >([]);
  const [confirmedAliases, setConfirmedAliases] = useState<IngredientAliasMap>({});
  const [invoiceScanRows, setInvoiceScanRows] = useState<CatalogReviewInvoiceItemScanRow[]>([]);
  const [scanPersistedMatchByItemId, setScanPersistedMatchByItemId] = useState<
    Map<string, PersistedMatchForCutover>
  >(() => new Map());
  const [scanTruncated, setScanTruncated] = useState(false);
  const [currentMatchCountById, setCurrentMatchCountById] = useState<Record<string, number>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [reassignTargetByLineKey, setReassignTargetByLineKey] = useState<Record<string, string>>(
    {},
  );
  const [savingLineKey, setSavingLineKey] = useState<string | null>(null);
  const [currentMatchesLoading, setCurrentMatchesLoading] = useState(false);
  const [currentMatches, setCurrentMatches] = useState<CatalogReviewCurrentMatchRow[]>([]);
  const [catalogListMode, setCatalogListMode] = useState<CatalogReviewListMode>("active");
  const [archivedRows, setArchivedRows] = useState<OperationallyArchivedIngredient[]>([]);
  const [restoringIngredientId, setRestoringIngredientId] = useState<string | null>(null);
  const [archivingIngredientId, setArchivingIngredientId] = useState<string | null>(null);
  const [recipeCountById, setRecipeCountById] = useState<Record<string, number>>({});
  const [recipeNamesForSelected, setRecipeNamesForSelected] = useState<string[]>([]);
  const [recipeNamesLoading, setRecipeNamesLoading] = useState(false);

  const confirmedAliasesRef = useRef(confirmedAliases);
  confirmedAliasesRef.current = confirmedAliases;

  const load = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    setError(null);
    setRecipeCountById({});

    const [{ rows: catalog, error: catalogError }, aliasMap, scan] = await Promise.all([
      loadActiveIngredientCatalog(supabase, "created_at, ingredient_kind"),
      loadConfirmedIngredientAliasMap(supabase),
      loadCatalogReviewInvoiceItemScan(supabase),
    ]);

    if (catalogError) {
      setError(catalogError);
      setRecipeCountById({});
      setLoading(false);
      return;
    }

    setCatalogRows(catalog);
    setConfirmedAliases(aliasMap);
    setInvoiceScanRows(scan.rows);
    setScanPersistedMatchByItemId(scan.persistedMatchByItemId);
    setScanTruncated(scan.truncated);

    const canonical = filterCanonicalCatalogIngredients(catalog);
    setCurrentMatchCountById(
      buildCatalogReviewCurrentMatchCountsFromScan(
        canonical,
        aliasMap,
        scan.rows,
        scan.persistedMatchByItemId,
      ),
    );

    const ingredientIds = canonical
      .map((entry) => entry.id?.trim())
      .filter((id): id is string => Boolean(id));
    const { counts, error: recipeCountError } = await loadRecipeCountByIngredientId(
      supabase,
      ingredientIds,
    );
    if (recipeCountError) {
      setRecipeCountById({});
    } else {
      setRecipeCountById(buildExplicitRecipeCountMap(ingredientIds, counts));
    }
    if (import.meta.env.DEV) {
      console.debug("[catalog-review] recipe counts", {
        ingredients: ingredientIds.length,
        withRecipes: Object.values(counts).filter((count) => count > 0).length,
        error: recipeCountError,
      });
    }

    setLoading(false);
  }, [user?.id]);

  const loadArchived = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    setError(null);
    const { rows, error: archiveError } = await loadArchivedIngredientCatalog(supabase);
    if (archiveError) {
      setError(archiveError);
      setArchivedRows([]);
    } else {
      setArchivedRows(sortOperationallyArchivedIngredients(rows));
    }
    setLoading(false);
  }, [user?.id]);

  useEffect(() => {
    if (catalogListMode === "archived") {
      void loadArchived();
    } else {
      void load();
    }
  }, [catalogListMode, load, loadArchived]);

  const switchCatalogListMode = useCallback((mode: CatalogReviewListMode) => {
    setCatalogListMode(mode);
    setSelectedId(null);
  }, []);

  const pickerOptions = useMemo(
    () => buildCanonicalIngredientPickerOptions(filterCanonicalCatalogIngredients(catalogRows)),
    [catalogRows],
  );

  const listItems = useMemo((): CatalogReviewListItem[] => {
    const canonical = filterCanonicalCatalogIngredients(catalogRows);

    return sortCatalogReviewAlphabetical(
      canonical
        .map((entry) => {
          const ingredientId = entry.id?.trim();
          if (!ingredientId) return null;

          const matchCount = currentMatchCountById[ingredientId] ?? 0;
          if (matchCount < 1) return null;

          const displayName =
            formatCanonicalIngredientDisplayName(entry.name) ||
            entry.name?.trim() ||
            ingredientId;

          return {
            ingredientId,
            displayName,
            matchCount,
            subline: formatCurrentMatchCountSubline(matchCount),
          };
        })
        .filter((item): item is CatalogReviewListItem => item != null),
    );
  }, [catalogRows, currentMatchCountById]);

  useEffect(() => {
    if (catalogListMode !== "active") return;
    if (listItems.length === 0) {
      setSelectedId(null);
      return;
    }
    if (!selectedId || !listItems.some((item) => item.ingredientId === selectedId)) {
      setSelectedId(listItems[0]!.ingredientId);
    }
  }, [catalogListMode, listItems, selectedId]);

  const selectedItem = useMemo(
    () => listItems.find((item) => item.ingredientId === selectedId) ?? null,
    [listItems, selectedId],
  );

  const prevSelectedIngredientIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!selectedItem?.ingredientId || catalogListMode !== "active") {
      setCurrentMatches([]);
      setCurrentMatchesLoading(false);
      return;
    }

    const ingredientId = selectedItem.ingredientId;
    setCurrentMatchesLoading(true);
    setCurrentMatches([]);

    const canonical = filterCanonicalCatalogIngredients(catalogRows);
    const { rows, truncated } = loadCatalogReviewCurrentMatchesForIngredient(
      ingredientId,
      canonical,
      confirmedAliasesRef.current,
      invoiceScanRows,
      {
        truncated: scanTruncated,
        persistedMatchByItemId: scanPersistedMatchByItemId,
      },
    );

    setCurrentMatches(rows);
    setCurrentMatchesLoading(false);

    if (truncated && rows.length === 0) {
      // scan limit hit with no rows for this ingredient — still valid empty state
    }
  }, [
    selectedItem?.ingredientId,
    catalogListMode,
    catalogRows,
    invoiceScanRows,
    scanTruncated,
    scanPersistedMatchByItemId,
    confirmedAliases,
  ]);

  useEffect(() => {
    if (!selectedItem?.ingredientId || catalogListMode !== "active") {
      setRecipeNamesForSelected([]);
      setRecipeNamesLoading(false);
      return;
    }

    const ingredientId = selectedItem.ingredientId;
    let cancelled = false;
    setRecipeNamesLoading(true);
    setRecipeNamesForSelected([]);

    void loadRecipeNamesForIngredient(supabase, ingredientId).then(({ names, error }) => {
      if (cancelled) return;
      setRecipeNamesForSelected(names);
      setRecipeNamesLoading(false);
      if (error && import.meta.env.DEV) {
        console.debug("[catalog-review] recipe names", { ingredientId, error });
      }
    });

    return () => {
      cancelled = true;
    };
  }, [selectedItem?.ingredientId, catalogListMode]);

  const matchRows = useMemo(() => {
    if (!selectedItem) return [];
    return buildCatalogReviewMatchRows(
      currentMatches,
      selectedItem.ingredientId,
      selectedItem.displayName,
    );
  }, [selectedItem, currentMatches]);

  useEffect(() => {
    if (!selectedItem) {
      setReassignTargetByLineKey({});
      prevSelectedIngredientIdRef.current = null;
      return;
    }

    const ingredientChanged =
      prevSelectedIngredientIdRef.current !== selectedItem.ingredientId;
    prevSelectedIngredientIdRef.current = selectedItem.ingredientId;

    setReassignTargetByLineKey((prev) => {
      const next: Record<string, string> = ingredientChanged ? {} : { ...prev };
      for (const row of matchRows) {
        if (!(row.key in next)) {
          next[row.key] = row.matchedIngredientId;
        }
      }
      return next;
    });
  }, [selectedItem, matchRows]);

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
              await router.invalidate();
            })();
          },
        },
      });
    },
    [user?.id, load, router],
  );

  const handleArchiveIngredient = useCallback(
    async (ingredientId: string) => {
      if (!user?.id) return;
      if (recipeCountById[ingredientId] !== 0) {
        toast.error("Cannot archive an ingredient used in recipes.");
        return;
      }
      setArchivingIngredientId(ingredientId);
      setError(null);

      if (selectedId === ingredientId) {
        setSelectedId(null);
      }
      setCatalogRows((prev) => prev.filter((row) => row.id !== ingredientId));
      setCurrentMatchCountById((prev) => {
        const next = { ...prev };
        delete next[ingredientId];
        return next;
      });

      const { error: archiveError } = await archiveIngredient({
        client: supabase,
        ingredientId,
        userId: user.id,
      });

      setArchivingIngredientId(null);

      if (archiveError) {
        toast.error(archiveError.message);
        await load();
        return;
      }

      showArchiveUndoToast(ingredientId);
      await router.invalidate();
    },
    [user?.id, selectedId, recipeCountById, showArchiveUndoToast, load, router],
  );

  const handleRestoreArchived = useCallback(
    async (ingredientId: string) => {
      if (!user?.id) return;
      setRestoringIngredientId(ingredientId);
      setError(null);
      const { error: restoreError } = await restoreIngredient({
        client: supabase,
        ingredientId,
        userId: user.id,
      });
      setRestoringIngredientId(null);
      if (restoreError) {
        toast.error(restoreError.message);
        return;
      }
      clearIngredientArchiveReason(user.id, ingredientId);
      setArchivedRows((prev) => prev.filter((row) => row.id !== ingredientId));
      toast("Ingredient restored");
      setCatalogListMode("active");
      await load();
      await router.invalidate();
    },
    [user?.id, load, router],
  );

  const handleSaveInvoiceLineMatch = useCallback(
    async (lineKey: string, toIngredientId: string) => {
      if (!user?.id || !selectedItem) return;
      const matchRow = matchRows.find((row) => row.key === lineKey);
      if (!matchRow) return;

      const targetOption = pickerOptions.find((option) => option.id === toIngredientId);
      const toIngredientName = targetOption?.name?.trim();
      if (!toIngredientName) {
        toast.error("Pick a valid ingredient.");
        return;
      }

      setSavingLineKey(lineKey);
      setError(null);

      const result = await reassignCatalogReviewInvoiceLineMatch({
        client: supabase,
        confirmedAliases: confirmedAliasesRef.current,
        itemName: matchRow.invoiceWording,
        toIngredientId,
        toIngredientName,
        supplierName: matchRow.supplierName,
      });

      setSavingLineKey(null);

      if (result.error) {
        setReassignTargetByLineKey((prev) => ({
          ...prev,
          [lineKey]: matchRow.matchedIngredientId,
        }));
        toast.error(result.error.message);
        setError(result.error.message);
        return;
      }

      setConfirmedAliases(result.nextConfirmedAliases);
      confirmedAliasesRef.current = result.nextConfirmedAliases;
      clearIngredientMatchedInvoiceProductsCache();

      setReassignTargetByLineKey((prev) => {
        const next = { ...prev };
        delete next[lineKey];
        return next;
      });

      await load();
    },
    [user?.id, selectedItem, matchRows, pickerOptions, load],
  );

  return (
    <AppShell
      title="Catalog review"
      subtitle="Review invoice lines that currently match each canonical ingredient."
      action={
        <Link
          to="/ingredients"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Ingredients
        </Link>
      }
    >
      {error && (
        <Card className="mb-3 border-destructive/40 p-3 text-sm text-destructive">{error}</Card>
      )}
      {scanTruncated && catalogListMode === "active" ? (
        <Card className="mb-3 border-amber-500/30 bg-amber-500/5 p-3 text-sm text-muted-foreground">
          Showing matches from the most recent invoice lines only. Older lines may be omitted.
        </Card>
      ) : null}

      <div className="grid gap-3 lg:grid-cols-[minmax(0,38fr)_minmax(0,62fr)] lg:items-stretch lg:min-h-[min(72vh,680px)]">
        <Card className="flex min-h-0 min-w-0 flex-col overflow-hidden border-border/50 bg-card p-0 shadow-sm lg:max-h-[min(72vh,680px)]">
          <div className="flex shrink-0 items-center border-b border-border/15 px-2.5 py-2">
            <div
              className="inline-flex rounded-lg border border-border/50 p-0.5"
              role="tablist"
              aria-label="Catalog review view"
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
          <div className="min-h-0 flex-1 overflow-y-auto">
            {loading && (
              <div className="flex justify-center py-10">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            )}
            {!loading && catalogListMode === "active" && listItems.length === 0 && (
              <div className="px-3 py-10 text-center text-sm text-muted-foreground">
                <ClipboardList className="mx-auto mb-2 h-7 w-7 opacity-40" />
                No ingredients with current invoice matches.
              </div>
            )}
            {!loading && catalogListMode === "active" && listItems.length > 0 && (
              <ul className="divide-y divide-border/20">
                {listItems.map((item) => {
                  const selected = item.ingredientId === selectedId;
                  return (
                    <li key={item.ingredientId}>
                      <button
                        type="button"
                        onClick={() => setSelectedId(item.ingredientId)}
                        className={`flex w-full gap-2 px-3 py-2.5 text-left transition-colors duration-150 ease-out ${operationalListBrowseRowBaseClass()} ${
                          selected
                            ? operationalListBrowseRowSelectedClass()
                            : operationalListBrowseRowHoverClass()
                        }`}
                      >
                        <span className="min-w-0 flex-1">
                          <p
                            className={`truncate text-sm ${
                              selected
                                ? "font-semibold text-foreground"
                                : "font-medium text-foreground/85"
                            }`}
                          >
                            {item.displayName}
                          </p>
                          <div className="mt-1">
                            <CatalogReviewStatusBadge
                              spec={formatCatalogReviewRecipeStatusBadge(
                                recipeCountById[item.ingredientId],
                              )}
                            />
                          </div>
                          {item.subline ? (
                            <p className="mt-1 text-xs text-muted-foreground/70">
                              {item.subline}
                            </p>
                          ) : null}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            {!loading && catalogListMode === "archived" && archivedRows.length === 0 && (
              <div className="px-3 py-10 text-center text-sm text-muted-foreground">
                No archived ingredients.
              </div>
            )}
            {!loading && catalogListMode === "archived" && archivedRows.length > 0 && (
              <ul className="divide-y divide-border/20">
                {archivedRows.map((ing) => {
                  const id = ing.id?.trim();
                  if (!id) return null;
                  const displayName =
                    formatCanonicalIngredientDisplayName(ing.name) || ing.name || id;
                  const reasonLine = formatIngredientArchiveReasonLine(
                    getIngredientArchiveReason(user?.id ?? "", id),
                  );
                  const restoring = restoringIngredientId === id;
                  return (
                    <li
                      key={id}
                      className="flex items-start justify-between gap-3 px-3 py-2.5 text-foreground/70"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-foreground/70">
                          {displayName}
                        </p>
                        <div className="mt-1">
                          <CatalogReviewStatusBadge spec={formatCatalogReviewArchivedStatusBadge()} />
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground/65">
                          {formatArchivedDateLabel(ing.archived_at)}
                        </p>
                        <p className="mt-0.5 text-xs text-muted-foreground/55">{reasonLine}</p>
                      </div>
                      <button
                        type="button"
                        disabled={restoring}
                        onClick={() => void handleRestoreArchived(id)}
                        className="shrink-0 rounded-md px-2.5 py-1 text-xs font-medium text-muted-foreground/75 transition-colors hover:bg-muted/30 hover:text-foreground/80 disabled:opacity-50"
                      >
                        {restoring ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          "Restore"
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          {!loading && catalogListMode === "active" && listItems.length > 0 ? (
            <div className="shrink-0 border-t border-border/40 px-3 py-2 text-xs text-muted-foreground">
              {listItems.length} ingredients with current matches
            </div>
          ) : null}
          {!loading && catalogListMode === "archived" && archivedRows.length > 0 ? (
            <div className="shrink-0 border-t border-border/15 px-3 py-2 text-xs text-muted-foreground/70">
              {archivedRows.length} archived
            </div>
          ) : null}
        </Card>

        <Card className="flex min-h-0 min-w-0 flex-col overflow-hidden border-border/50 bg-card p-0 shadow-sm">
          {catalogListMode === "archived" ? (
            <p className="flex flex-1 items-center justify-center p-6 text-sm text-muted-foreground">
              Restore archived ingredients from the list.
            </p>
          ) : null}
          {catalogListMode === "active" && (loading || currentMatchesLoading) && (
            <div className="flex flex-1 items-center justify-center py-12">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          )}
          {catalogListMode === "active" &&
            !loading &&
            !currentMatchesLoading &&
            !selectedItem && (
              <div className="flex flex-1 items-center justify-center p-6 text-sm text-muted-foreground">
                Select an ingredient.
              </div>
            )}
          {catalogListMode === "active" &&
            !loading &&
            !currentMatchesLoading &&
            selectedItem && (
              <CatalogReviewWorkspaceSimple
                item={selectedItem}
                matchRows={matchRows}
                pickerOptions={pickerOptions}
                reassignTargetByLineKey={reassignTargetByLineKey}
                onReassignTargetChange={(lineKey, targetId) =>
                  setReassignTargetByLineKey((prev) => ({
                    ...prev,
                    [lineKey]: targetId,
                  }))
                }
                savingLineKey={savingLineKey}
                onSaveInvoiceLineMatch={(lineKey, toId) =>
                  void handleSaveInvoiceLineMatch(lineKey, toId)
                }
                recipeCount={recipeCountById[selectedItem.ingredientId]}
                recipeNames={recipeNamesForSelected}
                recipeNamesLoading={recipeNamesLoading}
                archiving={archivingIngredientId === selectedItem.ingredientId}
                onArchiveIngredient={(id) => void handleArchiveIngredient(id)}
              />
            )}
        </Card>
      </div>
    </AppShell>
  );
}
