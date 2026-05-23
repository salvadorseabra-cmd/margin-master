import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { AppShell, Card } from "@/components/AppShell";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { formatCanonicalIngredientDisplayName } from "@/lib/canonical-ingredient-display-name";
import { loadConfirmedIngredientAliasMap } from "@/lib/ingredient-alias-memory";
import { loadActiveIngredientCatalog } from "@/lib/ingredient-catalog-load";
import { filterCanonicalCatalogIngredients } from "@/lib/ingredient-kind";
import {
  archiveIngredient,
  clearIngredientArchiveReason,
  formatArchivedDateLabel,
  formatIngredientArchiveReasonLine,
  getIngredientArchiveReason,
  loadArchivedIngredientCatalog,
  restoreIngredient,
  sortOperationallyArchivedIngredients,
  setIngredientArchiveReason,
  type IngredientArchiveReason,
  type OperationallyArchivedIngredient,
} from "@/lib/ingredient-archive";
import {
  detectOrphanCanonicalIngredients,
  isIngredientOperationallyOrphaned,
  type IngredientOrphanReport,
} from "@/lib/ingredient-orphan-detection";
import {
  findActiveCanonicalIdsByNormalizedName,
  isAliasOnlyOperationalDependency,
  isLegacyBatShoestrCatalogEntry,
  previewIngredientAliasReassignment,
  reassignAliasesAndArchiveIfOrphan,
  runPalhaToBatataPalhaAliasReassignment,
} from "@/lib/ingredient-alias-reassignment";
import {
  buildCanonicalIngredientRenamePayload,
  traceCanonicalRename,
} from "@/lib/canonical-ingredient-rename";
import { generateOperationalIngredientName } from "@/lib/canonical-ingredient-operational-name";
import { buildManualMergePickerOptions } from "@/lib/ingredient-merge";
import { normalizeCanonicalIngredientName } from "@/lib/ingredient-canonical";
import {
  buildCatalogReviewRows,
  CATALOG_REVIEW_CLASSIFICATION_LABELS,
  CATALOG_REVIEW_RECIPE_LINKS_SELECT,
  loadCatalogReviewClassifications,
  logCatalogManualMergeCandidate,
  setCatalogReviewClassification,
  type CatalogReviewClassification,
  type CatalogReviewRow,
} from "@/lib/catalog-pollution-review";
import {
  catalogReviewArchiveIsProminent,
  catalogReviewOffersArchive,
  formatCatalogReviewQueueIssue,
} from "@/lib/catalog-review-queue-issue";
import {
  isStaleForPriceReview,
  loadLatestConfirmedPurchaseAtByIngredientId,
} from "@/lib/ingredient-pricing-freshness";
import { ManualCanonicalMergeDialog } from "@/components/manual-canonical-merge-dialog";
import {
  Archive,
  ArrowLeft,
  ArrowRightLeft,
  ClipboardList,
  GitMerge,
  Loader2,
  Pencil,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/ingredients/review")({
  head: () => ({
    meta: [
      { title: "Catalog review — Marginly" },
      {
        name: "description",
        content: "Operational catalog review inbox — merge, archive, map, and rename.",
      },
    ],
  }),
  component: CatalogReviewPage,
});

const CLASSIFICATION_OPTIONS: CatalogReviewClassification[] = [
  "review_needed",
  "valid_canonical",
  "alias_pollution",
  "packaging_pollution",
];

type CatalogReviewListMode = "active" | "archived";

type CatalogReviewQueueItem = {
  ingredientId: string;
  displayName: string;
  issueLine: string;
  row: CatalogReviewRow | null;
  isOrphan: boolean;
  isAliasOnly: boolean;
  isStale: boolean;
  needsRename: boolean;
  orphanReport?: IngredientOrphanReport;
};

function CatalogReviewPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [rows, setRows] = useState<CatalogReviewRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [catalogRows, setCatalogRows] = useState<
    Awaited<ReturnType<typeof loadActiveIngredientCatalog>>["rows"]
  >([]);
  const [lastPurchaseAtById, setLastPurchaseAtById] = useState<Record<string, string | null>>(
    {},
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mergeDialogOpen, setMergeDialogOpen] = useState(false);
  const [mergePrefill, setMergePrefill] = useState<{
    sourceId?: string;
    targetId?: string;
  }>({});
  const [orphanEntries, setOrphanEntries] = useState<
    { entry: (typeof catalogRows)[number]; report: IngredientOrphanReport }[]
  >([]);
  const [aliasOnlyEntries, setAliasOnlyEntries] = useState<
    { entry: (typeof catalogRows)[number]; report: IngredientOrphanReport }[]
  >([]);
  const [archivingIngredientId, setArchivingIngredientId] = useState<string | null>(null);
  const [optimisticallyArchivedIds, setOptimisticallyArchivedIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [reassigningSourceId, setReassigningSourceId] = useState<string | null>(null);
  const [renamingBatShoestr, setRenamingBatShoestr] = useState(false);
  const [reassignTargetBySource, setReassignTargetBySource] = useState<Record<string, string>>(
    {},
  );
  const [catalogListMode, setCatalogListMode] = useState<CatalogReviewListMode>("active");
  const [archivedRows, setArchivedRows] = useState<OperationallyArchivedIngredient[]>([]);
  const [restoringIngredientId, setRestoringIngredientId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    setError(null);

    const { rows: catalog, error: catalogError } = await loadActiveIngredientCatalog(
      supabase,
      "created_at, ingredient_kind",
    );
    if (catalogError) {
      setError(catalogError);
      setLoading(false);
      return;
    }

    const ingredientIds = catalog.map((r) => r.id).filter(Boolean) as string[];

    const confirmedAliases = await loadConfirmedIngredientAliasMap(supabase);

    const [aliasResult, recipeResult, purchaseAtById] = await Promise.all([
      ingredientIds.length > 0
        ? supabase
            .from("ingredient_aliases")
            .select("ingredient_id, alias_name, normalized_alias")
            .in("ingredient_id", ingredientIds)
        : Promise.resolve({ data: [], error: null }),
      ingredientIds.length > 0
        ? supabase
            .from("recipe_ingredients")
            .select(CATALOG_REVIEW_RECIPE_LINKS_SELECT)
            .in("ingredient_id", ingredientIds)
        : Promise.resolve({ data: [], error: null }),
      loadLatestConfirmedPurchaseAtByIngredientId(supabase, catalog, confirmedAliases),
    ]);

    if (aliasResult.error) {
      setError(aliasResult.error.message);
      setLoading(false);
      return;
    }
    if (recipeResult.error) {
      setError(recipeResult.error.message);
      setLoading(false);
      return;
    }

    setCatalogRows(catalog);
    setLastPurchaseAtById(purchaseAtById);

    const canonicalCatalog = filterCanonicalCatalogIngredients(catalog);
    const { reports: orphanReports, error: orphanError } =
      await detectOrphanCanonicalIngredients(supabase, canonicalCatalog);
    if (orphanError) {
      setError(orphanError);
      setLoading(false);
      return;
    }

    const orphans = canonicalCatalog
      .filter((entry) => {
        const id = entry.id?.trim();
        if (!id) return false;
        const report = orphanReports.get(id);
        return report ? isIngredientOperationallyOrphaned(report) : false;
      })
      .map((entry) => ({
        entry,
        report: orphanReports.get(entry.id)!,
      }))
      .sort((a, b) =>
        (a.entry.name ?? "").localeCompare(b.entry.name ?? "", undefined, {
          sensitivity: "base",
        }),
      );
    setOrphanEntries(orphans);

    const aliasOnly = canonicalCatalog
      .filter((entry) => {
        const id = entry.id?.trim();
        if (!id) return false;
        const report = orphanReports.get(id);
        return report ? isAliasOnlyOperationalDependency(report) : false;
      })
      .map((entry) => ({
        entry,
        report: orphanReports.get(entry.id)!,
      }))
      .sort((a, b) =>
        (a.entry.name ?? "").localeCompare(b.entry.name ?? "", undefined, {
          sensitivity: "base",
        }),
      );
    setAliasOnlyEntries(aliasOnly);

    const batataId = findActiveCanonicalIdsByNormalizedName(canonicalCatalog, [
      "Batata palha",
    ]).get("batata palha");
    if (batataId) {
      const defaults: Record<string, string> = {};
      for (const { entry } of aliasOnly) {
        const norm = normalizeCanonicalIngredientName(entry.name ?? "");
        if (norm === "palha") defaults[entry.id] = batataId;
      }
      setReassignTargetBySource((prev) => ({ ...defaults, ...prev }));
    }

    const stored = loadCatalogReviewClassifications(user.id);
    setRows(
      buildCatalogReviewRows({
        catalog,
        aliasRows: aliasResult.data ?? [],
        recipeLinks: (recipeResult.data ?? []) as Parameters<
          typeof buildCatalogReviewRows
        >[0]["recipeLinks"],
        classifications: stored,
      }),
    );
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

  const canonicalPickerOptions = useMemo(
    () => buildManualMergePickerOptions(filterCanonicalCatalogIngredients(catalogRows)),
    [catalogRows],
  );

  const batShoestrRenameCard = useMemo(() => {
    const canonical = filterCanonicalCatalogIngredients(catalogRows);
    const source = canonical.find((entry) => isLegacyBatShoestrCatalogEntry(entry));
    if (!source?.id) return null;
    const targetName = generateOperationalIngredientName(source.name ?? "");
    if (!targetName) return null;
    return { source, targetName };
  }, [catalogRows]);

  const orphanById = useMemo(
    () => new Map(orphanEntries.map((item) => [item.entry.id, item])),
    [orphanEntries],
  );
  const aliasOnlyById = useMemo(
    () => new Map(aliasOnlyEntries.map((item) => [item.entry.id, item])),
    [aliasOnlyEntries],
  );
  const rowById = useMemo(() => new Map(rows.map((row) => [row.ingredientId, row])), [rows]);

  const queueItems = useMemo((): CatalogReviewQueueItem[] => {
    const byId = new Map<string, CatalogReviewQueueItem>();

    const upsert = (ingredientId: string, patch: Partial<CatalogReviewQueueItem> & { displayName: string }) => {
      const existing = byId.get(ingredientId);
      const row = patch.row ?? existing?.row ?? rowById.get(ingredientId) ?? null;
      const displayName =
        patch.displayName ||
        existing?.displayName ||
        row?.canonicalDisplayName ||
        ingredientId;
      const isOrphan = patch.isOrphan ?? existing?.isOrphan ?? false;
      const isAliasOnly = patch.isAliasOnly ?? existing?.isAliasOnly ?? false;
      const isStale =
        patch.isStale ??
        existing?.isStale ??
        isStaleForPriceReview({
          lastPurchaseAt: lastPurchaseAtById[ingredientId] ?? null,
          currentPrice: catalogRows.find((r) => r.id === ingredientId)?.current_price ?? null,
        });
      const needsRename =
        patch.needsRename ??
        existing?.needsRename ??
        (batShoestrRenameCard?.source.id === ingredientId);
      const orphanReport = patch.orphanReport ?? existing?.orphanReport;

      const issueLine = formatCatalogReviewQueueIssue({
        displayName,
        row,
        isOrphan,
        isAliasOnly,
        needsRename,
        isStale,
      });

      byId.set(ingredientId, {
        ingredientId,
        displayName,
        issueLine,
        row,
        isOrphan,
        isAliasOnly,
        isStale,
        needsRename,
        orphanReport,
      });
    };

    for (const row of rows) {
      upsert(row.ingredientId, {
        displayName: row.canonicalDisplayName,
        row,
        isOrphan: orphanById.has(row.ingredientId),
        isAliasOnly: aliasOnlyById.has(row.ingredientId),
        orphanReport: orphanById.get(row.ingredientId)?.report,
      });
    }

    for (const { entry, report } of orphanEntries) {
      if (!entry.id) continue;
      upsert(entry.id, {
        displayName: formatCanonicalIngredientDisplayName(entry.name) || entry.name || entry.id,
        isOrphan: true,
        orphanReport: report,
      });
    }

    for (const { entry, report } of aliasOnlyEntries) {
      if (!entry.id) continue;
      upsert(entry.id, {
        displayName: formatCanonicalIngredientDisplayName(entry.name) || entry.name || entry.id,
        isAliasOnly: true,
        orphanReport: report,
      });
    }

    if (batShoestrRenameCard?.source.id) {
      const id = batShoestrRenameCard.source.id;
      upsert(id, {
        displayName:
          formatCanonicalIngredientDisplayName(batShoestrRenameCard.source.name) ||
          batShoestrRenameCard.source.name ||
          id,
        needsRename: true,
      });
    }

    return [...byId.values()].sort((a, b) =>
      a.displayName.localeCompare(b.displayName, undefined, { sensitivity: "base" }),
    );
  }, [
    rows,
    orphanEntries,
    aliasOnlyEntries,
    orphanById,
    aliasOnlyById,
    rowById,
    batShoestrRenameCard,
    lastPurchaseAtById,
    catalogRows,
  ]);

  const visibleQueueItems = useMemo(
    () => queueItems.filter((item) => !optimisticallyArchivedIds.has(item.ingredientId)),
    [queueItems, optimisticallyArchivedIds],
  );

  useEffect(() => {
    if (catalogListMode !== "active") return;
    if (visibleQueueItems.length === 0) {
      setSelectedId(null);
      return;
    }
    if (
      !selectedId ||
      !visibleQueueItems.some((item) => item.ingredientId === selectedId)
    ) {
      setSelectedId(visibleQueueItems[0]!.ingredientId);
    }
  }, [catalogListMode, visibleQueueItems, selectedId]);

  const selectedItem = useMemo(
    () => visibleQueueItems.find((item) => item.ingredientId === selectedId) ?? null,
    [visibleQueueItems, selectedId],
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
              clearIngredientArchiveReason(user.id, ingredientId);
              setOptimisticallyArchivedIds((prev) => {
                const next = new Set(prev);
                next.delete(ingredientId);
                return next;
              });
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

      const visible = visibleQueueItems;
      const archivedIndex = visible.findIndex((item) => item.ingredientId === ingredientId);
      const nextSelectedId =
        archivedIndex >= 0 && archivedIndex < visible.length - 1
          ? visible[archivedIndex + 1]!.ingredientId
          : archivedIndex > 0
            ? visible[archivedIndex - 1]!.ingredientId
            : null;

      setOptimisticallyArchivedIds((prev) => new Set(prev).add(ingredientId));
      if (selectedId === ingredientId) {
        setSelectedId(nextSelectedId);
      }

      const archivedItem = queueItems.find((item) => item.ingredientId === ingredientId);
      const archiveReason: IngredientArchiveReason = archivedItem?.isOrphan
        ? "unused"
        : "catalog_review";
      setIngredientArchiveReason(user.id, ingredientId, archiveReason);

      setArchivingIngredientId(ingredientId);
      setError(null);
      const { error: archiveError } = await archiveIngredient({
        client: supabase,
        ingredientId,
        userId: user.id,
      });
      setArchivingIngredientId(null);

      if (archiveError) {
        setOptimisticallyArchivedIds((prev) => {
          const next = new Set(prev);
          next.delete(ingredientId);
          return next;
        });
        if (selectedId === ingredientId) {
          setSelectedId(ingredientId);
        }
        setError(archiveError.message);
        return;
      }

      showArchiveUndoToast(ingredientId);
      await load();
      await router.invalidate();
      setOptimisticallyArchivedIds((prev) => {
        const next = new Set(prev);
        next.delete(ingredientId);
        return next;
      });
    },
    [user?.id, visibleQueueItems, selectedId, queueItems, showArchiveUndoToast, load, router],
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

  const handleBatShoestrRename = async () => {
    if (!user?.id || !batShoestrRenameCard) return;
    const { source, targetName } = batShoestrRenameCard;
    const fromName = source.name ?? source.id;
    const confirmMsg = `Rename "${fromName}" to "${targetName}"?\n\nKeeps aliases, matches, and history on the same ingredient.`;
    if (!window.confirm(confirmMsg)) return;

    setRenamingBatShoestr(true);
    setError(null);
    const catalog = filterCanonicalCatalogIngredients(catalogRows).map((row) => ({
      id: row.id,
      name: row.name,
      normalized_name: row.normalized_name,
    }));
    const payload = buildCanonicalIngredientRenamePayload(source.id, targetName, catalog);
    if (!payload.ok) {
      setError(payload.message);
      setRenamingBatShoestr(false);
      return;
    }

    traceCanonicalRename("review-rename-attempt", {
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

    if (updateError) {
      setError(updateError.message);
      setRenamingBatShoestr(false);
      return;
    }

    traceCanonicalRename("review-rename-ok", {
      ingredientId: payload.update.ingredientId,
      name: payload.update.name,
    });
    setRenamingBatShoestr(false);
    await load();
    await router.invalidate();
  };

  const handleReassignAliases = async (
    fromIngredientId: string,
    toIngredientId: string,
    options?: { palhaPreset?: boolean },
  ) => {
    if (!user?.id) return;
    const fromName =
      catalogRows.find((r) => r.id === fromIngredientId)?.name ?? fromIngredientId;
    const toName = catalogRows.find((r) => r.id === toIngredientId)?.name ?? toIngredientId;
    const preview = await previewIngredientAliasReassignment({
      client: supabase,
      fromIngredientId,
      toIngredientId,
    });
    const confirmMsg = options?.palhaPreset
      ? `Move all aliases from "${fromName}" to "${toName}" and archive PALHA if unused?\n\n${preview.aliasCount} alias(es): ${preview.aliasNames.slice(0, 5).join(", ")}${preview.aliasNames.length > 5 ? "…" : ""}`
      : `Move ${preview.aliasCount} alias(es) from "${fromName}" to "${toName}"?\nDoes not merge recipes. Auto-archive only if the source becomes orphaned.\n\n${preview.aliasNames.slice(0, 8).join("\n")}${preview.aliasNames.length > 8 ? "\n…" : ""}`;
    if (!window.confirm(confirmMsg)) return;

    setReassigningSourceId(fromIngredientId);
    setError(null);
    const canonicalCatalog = filterCanonicalCatalogIngredients(catalogRows);
    const confirmedAliases = await loadConfirmedIngredientAliasMap(supabase);
    const result = options?.palhaPreset
      ? await runPalhaToBatataPalhaAliasReassignment({
          client: supabase,
          userId: user.id,
          catalog: canonicalCatalog,
          confirmedAliases,
          fromIngredientId,
          toIngredientId,
        })
      : await reassignAliasesAndArchiveIfOrphan({
          client: supabase,
          fromIngredientId,
          toIngredientId,
          userId: user.id,
          catalog: canonicalCatalog,
          confirmedAliases,
        });

    if (result.error) {
      setError(result.error.message);
      setReassigningSourceId(null);
      return;
    }
    setReassigningSourceId(null);
    await load();
    await router.invalidate();
  };

  const handleClassification = (ingredientId: string, classification: CatalogReviewClassification) => {
    if (!user?.id) return;
    setCatalogReviewClassification(user.id, ingredientId, classification);
    setRows((prev) =>
      prev.map((row) =>
        row.ingredientId === ingredientId ? { ...row, classification } : row,
      ),
    );
  };

  const openMerge = (sourceId: string, targetId?: string) => {
    setMergePrefill({ sourceId, targetId });
    setMergeDialogOpen(true);
  };

  return (
    <AppShell
      title="Catalog review"
      subtitle="Resolve catalog issues one at a time."
      action={
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-lg border border-border px-3.5 py-2 text-sm font-medium text-muted-foreground hover:bg-muted/50 hover:text-foreground"
            onClick={() => {
              setMergePrefill({});
              setMergeDialogOpen(true);
            }}
          >
            <GitMerge className="h-4 w-4" />
            Manual merge
          </button>
          <Link
            to="/ingredients"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            Ingredients
          </Link>
        </div>
      }
    >
      {error && (
        <Card className="mb-3 border-destructive/40 p-3 text-sm text-destructive">{error}</Card>
      )}

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
            {!loading && catalogListMode === "active" && visibleQueueItems.length === 0 && (
              <div className="px-3 py-10 text-center text-sm text-muted-foreground">
                <ClipboardList className="mx-auto mb-2 h-7 w-7 opacity-40" />
                Nothing to review right now.
              </div>
            )}
            {!loading && catalogListMode === "active" && visibleQueueItems.length > 0 && (
              <ul className="divide-y divide-border/20">
                {visibleQueueItems.map((item) => {
                  const selected = item.ingredientId === selectedId;
                  return (
                    <li key={item.ingredientId}>
                      <button
                        type="button"
                        onClick={() => setSelectedId(item.ingredientId)}
                        className={`w-full px-3 py-2.5 text-left transition-colors ${
                          selected
                            ? "bg-primary/8 border-l-2 border-l-primary"
                            : "hover:bg-muted/40 border-l-2 border-l-transparent"
                        }`}
                      >
                        <p className="truncate text-sm font-medium text-foreground">
                          {item.displayName}
                        </p>
                        <p className="mt-0.5 truncate text-xs text-muted-foreground/75">
                          {item.issueLine}
                        </p>
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
                      className="flex items-start justify-between gap-3 px-3 py-2.5"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-foreground">
                          {displayName}
                        </p>
                        <p className="mt-0.5 text-xs text-muted-foreground/75">
                          {formatArchivedDateLabel(ing.archived_at)}
                        </p>
                        <p className="mt-0.5 text-xs text-muted-foreground/60">{reasonLine}</p>
                      </div>
                      <button
                        type="button"
                        disabled={restoring}
                        onClick={() => void handleRestoreArchived(id)}
                        className="shrink-0 rounded-md px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground disabled:opacity-50"
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
          {!loading && catalogListMode === "active" && visibleQueueItems.length > 0 ? (
            <div className="shrink-0 border-t border-border/40 px-3 py-2 text-xs text-muted-foreground">
              {visibleQueueItems.length}{" "}
              {visibleQueueItems.length === 1 ? "item" : "items"}
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
            <div className="flex flex-1 items-center justify-center p-6 text-sm text-muted-foreground">
              Select an ingredient
            </div>
          ) : null}
          {catalogListMode === "active" && loading && (
            <div className="flex flex-1 items-center justify-center py-12">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          )}
          {catalogListMode === "active" && !loading && !selectedItem && (
            <div className="flex flex-1 items-center justify-center p-6 text-sm text-muted-foreground">
              Select an item from the queue.
            </div>
          )}
          {catalogListMode === "active" && !loading && selectedItem && (
            <CatalogReviewWorkspace
              item={selectedItem}
              batShoestrTargetName={batShoestrRenameCard?.targetName ?? null}
              canonicalPickerOptions={canonicalPickerOptions}
              reassignTargetId={reassignTargetBySource[selectedItem.ingredientId] ?? ""}
              onReassignTargetChange={(targetId) =>
                setReassignTargetBySource((prev) => ({
                  ...prev,
                  [selectedItem.ingredientId]: targetId,
                }))
              }
              archivingIngredientId={archivingIngredientId}
              reassigningSourceId={reassigningSourceId}
              renamingBatShoestr={renamingBatShoestr}
              onClassify={handleClassification}
              onArchiveIngredient={handleArchiveIngredient}
              onReassignAliases={handleReassignAliases}
              onBatShoestrRename={handleBatShoestrRename}
              onOpenMerge={openMerge}
              catalogRows={catalogRows}
            />
          )}
        </Card>
      </div>

      <ManualCanonicalMergeDialog
        open={mergeDialogOpen}
        onOpenChange={setMergeDialogOpen}
        catalog={catalogRows}
        initialSourceId={mergePrefill.sourceId}
        initialTargetId={mergePrefill.targetId}
        onSuccess={() => void load()}
      />
    </AppShell>
  );
}

function CatalogReviewArchiveButton({
  ingredientId,
  archiving,
  prominent,
  disabled,
  onArchive,
}: {
  ingredientId: string;
  archiving: boolean;
  prominent: boolean;
  disabled?: boolean;
  onArchive: (id: string) => void;
}) {
  return (
    <button
      type="button"
      disabled={archiving || disabled}
      className={
        prominent
          ? "inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-sm font-medium text-foreground shadow-sm hover:bg-muted disabled:opacity-50"
          : "inline-flex items-center gap-1.5 rounded-md border border-border/80 px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted/60 hover:text-foreground disabled:opacity-50"
      }
      onClick={() => void onArchive(ingredientId)}
    >
      {archiving ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Archive className="h-4 w-4" />
      )}
      Archive ingredient
    </button>
  );
}

function CatalogReviewWorkspace({
  item,
  batShoestrTargetName,
  canonicalPickerOptions,
  reassignTargetId,
  onReassignTargetChange,
  archivingIngredientId,
  reassigningSourceId,
  renamingBatShoestr,
  onClassify,
  onArchiveIngredient,
  onReassignAliases,
  onBatShoestrRename,
  onOpenMerge,
  catalogRows,
}: {
  item: CatalogReviewQueueItem;
  batShoestrTargetName: string | null;
  canonicalPickerOptions: ReturnType<typeof buildManualMergePickerOptions>;
  reassignTargetId: string;
  onReassignTargetChange: (targetId: string) => void;
  archivingIngredientId: string | null;
  reassigningSourceId: string | null;
  renamingBatShoestr: boolean;
  onClassify: (id: string, c: CatalogReviewClassification) => void;
  onArchiveIngredient: (id: string) => void;
  onReassignAliases: (from: string, to: string, options?: { palhaPreset?: boolean }) => void;
  onBatShoestrRename: () => void;
  onOpenMerge: (sourceId: string, targetId?: string) => void;
  catalogRows: Awaited<ReturnType<typeof loadActiveIngredientCatalog>>["rows"];
}) {
  const row = item.row;
  const mergeHint = row?.mergeHints[0];
  const similar = row?.similarityCandidates[0];
  const offersArchive = catalogReviewOffersArchive(item);
  const prominentArchive = catalogReviewArchiveIsProminent(item);
  const archiving = archivingIngredientId === item.ingredientId;
  const archiveDisabled = archiving || reassigningSourceId != null || renamingBatShoestr;
  const isPalha =
    normalizeCanonicalIngredientName(
      catalogRows.find((r) => r.id === item.ingredientId)?.name ?? "",
    ) === "palha";
  const batataId = findActiveCanonicalIdsByNormalizedName(
    filterCanonicalCatalogIngredients(catalogRows),
    ["Batata palha"],
  ).get("batata palha");

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 border-b border-border/15 px-4 py-3">
        <h2 className="text-base font-medium text-foreground">{item.displayName}</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">{item.issueLine}</p>
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
        {offersArchive && prominentArchive && (
          <section className="space-y-2">
            <p className="text-sm text-muted-foreground">
              {item.isOrphan
                ? "No recipes, aliases, or price history — hide from the active catalog without losing history."
                : item.isStale
                  ? "Still in recipes but quiet on invoices — archive to clear the inbox; restore anytime."
                  : item.isAliasOnly
                    ? "Only invoice aliases point here — archive if reassignment is not needed."
                    : "Not used in recipes — archive to tidy the catalog; invoices and history stay linked."}
            </p>
            <CatalogReviewArchiveButton
              ingredientId={item.ingredientId}
              archiving={archiving}
              prominent
              disabled={archiveDisabled}
              onArchive={onArchiveIngredient}
            />
          </section>
        )}

        {item.needsRename && batShoestrTargetName && (
          <section className="space-y-2">
            <p className="text-sm text-muted-foreground">
              Expand shorthand invoice name to a clear catalog label.
            </p>
            <button
              type="button"
              disabled={renamingBatShoestr || reassigningSourceId != null}
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-50"
              onClick={() => void onBatShoestrRename()}
            >
              {renamingBatShoestr ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Pencil className="h-4 w-4" />
              )}
              Rename to {batShoestrTargetName}
            </button>
          </section>
        )}

        {item.isAliasOnly && (
          <section className="space-y-2">
            <p className="text-sm text-muted-foreground">
              Move invoice aliases to the right ingredient without merging recipes.
            </p>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Move aliases to
              <select
                className="min-w-[200px] rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground"
                value={reassignTargetId}
                onChange={(e) => onReassignTargetChange(e.target.value)}
              >
                <option value="">Choose ingredient</option>
                {canonicalPickerOptions
                  .filter((opt) => opt.id !== item.ingredientId)
                  .map((opt) => (
                    <option key={opt.id} value={opt.id}>
                      {opt.label}
                    </option>
                  ))}
              </select>
            </label>
            <div className="flex flex-wrap gap-2">
              {isPalha && batataId && (
                <button
                  type="button"
                  disabled={reassigningSourceId != null}
                  className="inline-flex items-center gap-1.5 rounded-md border border-primary/40 px-3 py-1.5 text-sm hover:bg-primary/10 disabled:opacity-50"
                  onClick={() =>
                    void onReassignAliases(item.ingredientId, batataId, { palhaPreset: true })
                  }
                >
                  {reassigningSourceId === item.ingredientId ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <ArrowRightLeft className="h-4 w-4" />
                  )}
                  Move to Batata palha
                </button>
              )}
              <button
                type="button"
                disabled={
                  !reassignTargetId ||
                  reassignTargetId === item.ingredientId ||
                  reassigningSourceId != null
                }
                className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-50"
                onClick={() => void onReassignAliases(item.ingredientId, reassignTargetId)}
              >
                {reassigningSourceId === item.ingredientId ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ArrowRightLeft className="h-4 w-4" />
                )}
                Confirm reassignment
              </button>
              {offersArchive && !prominentArchive && (
                <CatalogReviewArchiveButton
                  ingredientId={item.ingredientId}
                  archiving={archiving}
                  prominent={false}
                  disabled={archiveDisabled}
                  onArchive={onArchiveIngredient}
                />
              )}
            </div>
          </section>
        )}

        {similar && (
          <section className="space-y-2">
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={archiveDisabled}
                className="inline-flex items-center gap-1.5 rounded-md border border-primary/40 px-3 py-1.5 text-sm hover:bg-primary/10 disabled:opacity-50"
                onClick={() => onOpenMerge(item.ingredientId, similar.ingredientId)}
              >
                <GitMerge className="h-4 w-4" />
                Merge with {similar.displayName}
              </button>
              {offersArchive && !prominentArchive && (
                <CatalogReviewArchiveButton
                  ingredientId={item.ingredientId}
                  archiving={archiving}
                  prominent={false}
                  disabled={archiveDisabled}
                  onArchive={onArchiveIngredient}
                />
              )}
            </div>
          </section>
        )}

        {mergeHint && (
          <section className="space-y-2">
            {mergeHint.displayNames.length > 1 && (
              <p className="text-sm text-muted-foreground">
                Same product under {mergeHint.displayNames.join(" · ")}
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={archiveDisabled}
                className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-50"
                onClick={() => logCatalogManualMergeCandidate(mergeHint)}
              >
                Log merge candidate
              </button>
              {mergeHint.suggestedCanonicalIngredientId && (
                <button
                  type="button"
                  disabled={archiveDisabled}
                  className="inline-flex items-center gap-1.5 rounded-md border border-primary/40 px-3 py-1.5 text-sm hover:bg-primary/10 disabled:opacity-50"
                  onClick={() => {
                    const sourceId = mergeHint.ingredientIds.find(
                      (id) => id !== mergeHint.suggestedCanonicalIngredientId,
                    );
                    if (sourceId) {
                      onOpenMerge(sourceId, mergeHint.suggestedCanonicalIngredientId ?? undefined);
                    }
                  }}
                >
                  <GitMerge className="h-4 w-4" />
                  Open manual merge
                </button>
              )}
              {offersArchive && !prominentArchive && (
                <CatalogReviewArchiveButton
                  ingredientId={item.ingredientId}
                  archiving={archiving}
                  prominent={false}
                  disabled={archiveDisabled}
                  onArchive={onArchiveIngredient}
                />
              )}
            </div>
          </section>
        )}

        {row && row.recipeUsage.count > 0 && (
          <p className="text-sm text-muted-foreground">
            Used in {row.recipeUsage.count}{" "}
            {row.recipeUsage.count === 1 ? "recipe" : "recipes"}
            {row.recipeUsage.names.length > 0 ? `: ${row.recipeUsage.names.slice(0, 4).join(", ")}` : ""}
            {row.recipeUsage.names.length > 4 ? "…" : ""}
          </p>
        )}

        {row && (
          <section className="space-y-2 border-t border-border/20 pt-3">
            <p className="text-xs font-medium text-muted-foreground/80">Mark reviewed as</p>
            <div className="flex flex-wrap gap-1.5">
              {CLASSIFICATION_OPTIONS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => onClassify(row.ingredientId, c)}
                  className={`rounded border px-2 py-1 text-xs ${
                    row.classification === c
                      ? "border-primary bg-primary/10 text-foreground"
                      : "border-border hover:bg-muted"
                  }`}
                >
                  {CATALOG_REVIEW_CLASSIFICATION_LABELS[c]}
                </button>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
