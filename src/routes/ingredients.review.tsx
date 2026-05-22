import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { AppShell, Card } from "@/components/AppShell";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { formatCanonicalIngredientDisplayName } from "@/lib/canonical-ingredient-display-name";
import { loadActiveIngredientCatalog } from "@/lib/ingredient-catalog-load";
import { filterCanonicalCatalogIngredients } from "@/lib/ingredient-kind";
import {
  archiveOrphanIngredient,
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
  CATALOG_LEAK_REASON_LABELS,
  CATALOG_REVIEW_CLASSIFICATION_LABELS,
  CATALOG_REVIEW_RECIPE_LINKS_SELECT,
  loadCatalogReviewClassifications,
  logCatalogManualMergeCandidate,
  setCatalogReviewClassification,
  type CatalogReviewClassification,
  type CatalogReviewRow,
} from "@/lib/catalog-pollution-review";
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

export const Route = createFileRoute("/ingredients/review")({
  head: () => ({
    meta: [
      { title: "Revisão catálogo — Marginly" },
      {
        name: "description",
        content: "Revisão manual de poluição no catálogo de ingredientes (somente leitura).",
      },
    ],
  }),
  component: CatalogReviewPage,
});

type ClassificationFilter = CatalogReviewClassification | "all" | "unclassified";

const CLASSIFICATION_OPTIONS: CatalogReviewClassification[] = [
  "review_needed",
  "valid_canonical",
  "alias_pollution",
  "packaging_pollution",
];

function CatalogReviewPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [rows, setRows] = useState<CatalogReviewRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [classFilter, setClassFilter] = useState<ClassificationFilter>("all");
  const [leakFilter, setLeakFilter] = useState<string>("all");
  const [classifications, setClassifications] = useState<
    Record<string, CatalogReviewClassification>
  >({});
  const [catalogRows, setCatalogRows] = useState<
    Awaited<ReturnType<typeof loadActiveIngredientCatalog>>["rows"]
  >([]);
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
  const [archivingOrphanId, setArchivingOrphanId] = useState<string | null>(null);
  const [reassigningSourceId, setReassigningSourceId] = useState<string | null>(null);
  const [renamingBatShoestr, setRenamingBatShoestr] = useState(false);
  const [reassignTargetBySource, setReassignTargetBySource] = useState<Record<string, string>>(
    {},
  );

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

    const [aliasResult, recipeResult] = await Promise.all([
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
    setClassifications(stored);
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

  const handleBatShoestrRename = async () => {
    if (!user?.id || !batShoestrRenameCard) return;
    const { source, targetName } = batShoestrRenameCard;
    const fromName = source.name ?? source.id;
    const confirmMsg = `Renomear "${fromName}" para "${targetName}"?\n\nMantém o mesmo ingrediente, aliases, matches e histórico.`;
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
      ? `Mover todos os aliases de "${fromName}" para "${toName}" e arquivar PALHA se ficar sem uso?\n\n${preview.aliasCount} alias(es): ${preview.aliasNames.slice(0, 5).join(", ")}${preview.aliasNames.length > 5 ? "…" : ""}`
      : `Mover ${preview.aliasCount} alias(es) de "${fromName}" para "${toName}"?\nNão funde ingredientes nem receitas. PALHA/arquivo automático só se o origem ficar órfão.\n\n${preview.aliasNames.slice(0, 8).join("\n")}${preview.aliasNames.length > 8 ? "\n…" : ""}`;
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

  const handleArchiveOrphan = async (ingredientId: string) => {
    if (!user?.id) return;
    setArchivingOrphanId(ingredientId);
    setError(null);
    const { error: archiveError } = await archiveOrphanIngredient({
      client: supabase,
      ingredientId,
      userId: user.id,
    });
    if (archiveError) {
      setError(archiveError.message);
      setArchivingOrphanId(null);
      return;
    }
    setArchivingOrphanId(null);
    await load();
  };

  useEffect(() => {
    void load();
  }, [load]);

  const leakReasons = useMemo(() => {
    const reasons = new Set(rows.map((r) => r.leakReason).filter(Boolean) as string[]);
    return [...reasons].sort();
  }, [rows]);

  const filtered = useMemo(() => {
    return rows.filter((row) => {
      if (classFilter === "unclassified" && row.classification) return false;
      if (classFilter !== "all" && classFilter !== "unclassified" && row.classification !== classFilter) {
        return false;
      }
      if (leakFilter !== "all" && row.leakReason !== leakFilter) return false;
      return true;
    });
  }, [rows, classFilter, leakFilter]);

  const handleClassification = (ingredientId: string, classification: CatalogReviewClassification) => {
    if (!user?.id) return;
    const next = setCatalogReviewClassification(user.id, ingredientId, classification);
    setClassifications(next);
    setRows((prev) =>
      prev.map((row) =>
        row.ingredientId === ingredientId ? { ...row, classification } : row,
      ),
    );
  };

  return (
    <AppShell
      title="Revisão do catálogo"
      subtitle="Poluição legada, órfãos sem uso operacional e duplicados — revisão manual, sem fusão automática."
      action={
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            className="inline-flex items-center gap-2 text-sm px-3 py-1.5 rounded-md border border-border hover:bg-muted"
            onClick={() => {
              setMergePrefill({});
              setMergeDialogOpen(true);
            }}
          >
            <GitMerge className="h-4 w-4" />
            Fusão manual
          </button>
          <Link
            to="/ingredients"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            Ingredientes
          </Link>
        </div>
      }
    >
      <div className="space-y-4">
        {!loading && !error && batShoestrRenameCard && (
          <Card className="p-4 space-y-3 border-violet-500/30">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h2 className="font-medium text-foreground">BAT shoestr — renomear catálogo</h2>
                <p className="text-sm text-muted-foreground">
                  Nome de fatura abreviado no canónico. Renomeia para o produto operacional sem
                  fundir com Batata palha — aliases e histórico mantêm-se no mesmo ingrediente.
                </p>
                <p className="text-xs text-muted-foreground font-mono mt-1">
                  {batShoestrRenameCard.source.id}
                </p>
              </div>
              <button
                type="button"
                disabled={renamingBatShoestr || reassigningSourceId != null}
                className="inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-md border border-violet-500/40 hover:bg-violet-500/10 disabled:opacity-50"
                onClick={() => void handleBatShoestrRename()}
              >
                {renamingBatShoestr ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Pencil className="h-4 w-4" />
                )}
                Rename to {batShoestrRenameCard.targetName}
              </button>
            </div>
          </Card>
        )}

        {!loading && !error && aliasOnlyEntries.length > 0 && (
          <Card className="p-4 space-y-3 border-sky-500/30">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h2 className="font-medium text-foreground">Legado só com aliases</h2>
                <p className="text-sm text-muted-foreground">
                  Canónicos com memória de fatura mas sem receitas, prep, preço nem margem. Reatribua
                  aliases ao canónico correto (sem fusão) para libertar órfãos como PALHA.
                </p>
              </div>
              <span className="text-xs px-2 py-0.5 rounded-full bg-sky-500/15 text-sky-900 dark:text-sky-100">
                {aliasOnlyEntries.length}
              </span>
            </div>
            <ul className="space-y-2">
              {aliasOnlyEntries.map(({ entry, report }) => {
                const targetId = reassignTargetBySource[entry.id] ?? "";
                const isPalha =
                  normalizeCanonicalIngredientName(entry.name ?? "") === "palha";
                const batataId = findActiveCanonicalIdsByNormalizedName(
                  filterCanonicalCatalogIngredients(catalogRows),
                  ["Batata palha"],
                ).get("batata palha");
                return (
                  <li
                    key={entry.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border p-3"
                  >
                    <div>
                      <p className="font-medium">
                        {formatCanonicalIngredientDisplayName(entry.name) || entry.name}
                      </p>
                      <p className="text-xs text-muted-foreground font-mono">{entry.id}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Aliases {report.invoiceAliasCount} (fornecedor {report.supplierAliasCount})
                      </p>
                    </div>
                    <div className="flex flex-wrap items-end gap-2">
                      <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                        Reatribuir aliases para
                        <select
                          className="border border-border rounded-md px-2 py-1.5 bg-background text-sm text-foreground min-w-[200px]"
                          value={targetId}
                          onChange={(e) =>
                            setReassignTargetBySource((prev) => ({
                              ...prev,
                              [entry.id]: e.target.value,
                            }))
                          }
                        >
                          <option value="">— escolher —</option>
                          {canonicalPickerOptions
                            .filter((opt) => opt.id !== entry.id)
                            .map((opt) => (
                              <option key={opt.id} value={opt.id}>
                                {opt.label}
                              </option>
                            ))}
                        </select>
                      </label>
                      {isPalha && batataId && (
                        <button
                          type="button"
                          disabled={reassigningSourceId != null}
                          className="inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-md border border-primary/40 hover:bg-primary/10 disabled:opacity-50"
                          onClick={() =>
                            void handleReassignAliases(entry.id, batataId, { palhaPreset: true })
                          }
                        >
                          {reassigningSourceId === entry.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <ArrowRightLeft className="h-4 w-4" />
                          )}
                          Mover aliases para Batata palha
                        </button>
                      )}
                      <button
                        type="button"
                        disabled={
                          !targetId || targetId === entry.id || reassigningSourceId != null
                        }
                        className="inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-md border border-border hover:bg-muted disabled:opacity-50"
                        onClick={() => void handleReassignAliases(entry.id, targetId)}
                      >
                        {reassigningSourceId === entry.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <ArrowRightLeft className="h-4 w-4" />
                        )}
                        Confirmar reatribuição
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </Card>
        )}

        {!loading && !error && orphanEntries.length > 0 && (
          <Card className="p-4 space-y-3 border-amber-500/30">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h2 className="font-medium text-foreground">Ingredientes órfãos</h2>
                <p className="text-sm text-muted-foreground">
                  Canónicos ativos sem aliases, receitas, prep, histórico de preço nem impactos de
                  margem. Não aparecem na lista principal até arquivar.
                </p>
              </div>
              <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-900 dark:text-amber-100">
                {orphanEntries.length}
              </span>
            </div>
            <ul className="space-y-2">
              {orphanEntries.map(({ entry, report }) => (
                <li
                  key={entry.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border p-3"
                >
                  <div>
                    <p className="font-medium">
                      {formatCanonicalIngredientDisplayName(entry.name) || entry.name}
                    </p>
                    <p className="text-xs text-muted-foreground font-mono">{entry.id}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Refs: aliases {report.invoiceAliasCount}, receitas{" "}
                      {report.recipeIngredientCount}, prep {report.prepRecipeIngredientCount},
                      preço {report.priceHistoryCount}, margem {report.marginImpactCount}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={archivingOrphanId === entry.id}
                    className="inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-md border border-border hover:bg-muted disabled:opacity-50"
                    onClick={() => void handleArchiveOrphan(entry.id)}
                  >
                    {archivingOrphanId === entry.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Archive className="h-4 w-4" />
                    )}
                    Arquivar
                  </button>
                </li>
              ))}
            </ul>
          </Card>
        )}

        <Card className="p-4 flex flex-wrap gap-3 items-end">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-muted-foreground">Classificação</span>
            <select
              className="border border-border rounded-md px-2 py-1.5 bg-background min-w-[180px]"
              value={classFilter}
              onChange={(e) => setClassFilter(e.target.value as ClassificationFilter)}
            >
              <option value="all">Todas</option>
              <option value="unclassified">Sem classificar</option>
              {CLASSIFICATION_OPTIONS.map((c) => (
                <option key={c} value={c}>
                  {CATALOG_REVIEW_CLASSIFICATION_LABELS[c]}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-muted-foreground">Motivo leak</span>
            <select
              className="border border-border rounded-md px-2 py-1.5 bg-background min-w-[200px]"
              value={leakFilter}
              onChange={(e) => setLeakFilter(e.target.value)}
            >
              <option value="all">Todos</option>
              {leakReasons.map((reason) => (
                <option key={reason} value={reason}>
                  {CATALOG_LEAK_REASON_LABELS[reason as keyof typeof CATALOG_LEAK_REASON_LABELS] ??
                    reason}
                </option>
              ))}
            </select>
          </label>
          <p className="text-sm text-muted-foreground ml-auto">
            {filtered.length} de {rows.length} linhas
          </p>
        </Card>

        {loading && (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {error && (
          <Card className="p-4 border-destructive/40 text-destructive text-sm">{error}</Card>
        )}

        {!loading && !error && filtered.length === 0 && (
          <Card className="p-8 text-center text-muted-foreground text-sm">
            <ClipboardList className="h-8 w-8 mx-auto mb-2 opacity-50" />
            Nenhuma linha para rever com estes filtros.
          </Card>
        )}

        {!loading &&
          !error &&
          filtered.map((row) => (
            <ReviewRowCard
              key={row.ingredientId}
              row={row}
              onClassify={handleClassification}
              onOpenMerge={(sourceId, targetId) => {
                setMergePrefill({ sourceId, targetId });
                setMergeDialogOpen(true);
              }}
            />
          ))}

        <ManualCanonicalMergeDialog
          open={mergeDialogOpen}
          onOpenChange={setMergeDialogOpen}
          catalog={catalogRows}
          initialSourceId={mergePrefill.sourceId}
          initialTargetId={mergePrefill.targetId}
          onSuccess={() => void load()}
        />
      </div>
    </AppShell>
  );
}

function ReviewRowCard({
  row,
  onClassify,
  onOpenMerge,
}: {
  row: CatalogReviewRow;
  onClassify: (id: string, c: CatalogReviewClassification) => void;
  onOpenMerge: (sourceId: string, targetId?: string) => void;
}) {
  const aliasLabel =
    row.sourceInvoiceAliases.length > 0
      ? row.sourceInvoiceAliases.join(" · ")
      : "desconhecido/legado";

  return (
    <Card className="p-4 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="font-medium text-foreground">{row.canonicalDisplayName}</h3>
          <p className="text-xs text-muted-foreground font-mono">{row.ingredientId}</p>
          {row.rawName !== row.canonicalDisplayName && (
            <p className="text-sm text-muted-foreground">Nome DB: {row.rawName}</p>
          )}
        </div>
        <div className="flex flex-wrap gap-1">
          {row.discoveryKinds.map((kind) => (
            <span
              key={kind}
              className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground"
            >
              {kind === "catalog_leak" ? "leak catálogo" : "dup. operacional"}
            </span>
          ))}
          {row.leakReason && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-800 dark:text-amber-200">
              {CATALOG_LEAK_REASON_LABELS[row.leakReason]}
            </span>
          )}
        </div>
      </div>

      <dl className="grid sm:grid-cols-2 gap-x-4 gap-y-2 text-sm">
        <div>
          <dt className="text-muted-foreground">Alias fatura</dt>
          <dd>{aliasLabel}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Criado em</dt>
          <dd>{row.createdAt ? new Date(row.createdAt).toLocaleString("pt-PT") : "—"}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Receitas</dt>
          <dd>
            {row.recipeUsage.count === 0
              ? "0"
              : `${row.recipeUsage.count} — ${row.recipeUsage.names.join(", ")}`}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Refs. fatura (aliases DB)</dt>
          <dd>{row.invoiceReferenceCount}</dd>
        </div>
      </dl>

      {row.similarityCandidates.length > 0 && (
        <div className="space-y-1 border-t border-border pt-3">
          <p className="text-sm font-medium text-foreground">Candidatos por similaridade (só leitura)</p>
          <ul className="text-sm text-muted-foreground space-y-1">
            {row.similarityCandidates.map((candidate) => (
              <li key={candidate.ingredientId}>
                {candidate.displayName}{" "}
                <span className="font-mono text-xs">({candidate.ingredientId})</span>
                {" — "}
                score {(candidate.score * 100).toFixed(0)}%
              </li>
            ))}
          </ul>
        </div>
      )}

      {row.mergeHints.length > 0 && (
        <div className="space-y-2 border-t border-border pt-3">
          <p className="text-sm font-medium text-foreground">Duplicados operacionais (só leitura)</p>
          {row.mergeHints.map((hint) => (
            <div
              key={hint.operationalKey}
              className="text-sm bg-muted/40 rounded-md p-2 space-y-1"
            >
              <p className="text-muted-foreground">
                Chave: <span className="font-mono">{hint.operationalKey}</span>
              </p>
              <p>IDs: {hint.ingredientIds.join(", ")}</p>
              <p>Nomes: {hint.displayNames.join(" · ")}</p>
              {hint.suggestedCanonicalIngredientId && (
                <p className="text-xs text-muted-foreground">
                  Sugestão canónica (informativa): {hint.suggestedCanonicalIngredientId}
                </p>
              )}
              <div className="flex flex-wrap gap-2 pt-1">
                <button
                  type="button"
                  className="text-xs px-2 py-1 rounded border border-border hover:bg-muted"
                  onClick={() => logCatalogManualMergeCandidate(hint)}
                >
                  Candidato a fusão (registar log)
                </button>
                {hint.suggestedCanonicalIngredientId && (
                  <button
                    type="button"
                    className="text-xs px-2 py-1 rounded border border-primary/40 text-foreground hover:bg-primary/10"
                    onClick={() => {
                      const sourceId = hint.ingredientIds.find(
                        (id) => id !== hint.suggestedCanonicalIngredientId,
                      );
                      if (sourceId) {
                        onOpenMerge(sourceId, hint.suggestedCanonicalIngredientId ?? undefined);
                      }
                    }}
                  >
                    Abrir fusão manual
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap gap-2 border-t border-border pt-3">
        <span className="text-sm text-muted-foreground w-full sm:w-auto">Classificar:</span>
        {CLASSIFICATION_OPTIONS.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => onClassify(row.ingredientId, c)}
            className={`text-xs px-2 py-1 rounded border ${
              row.classification === c
                ? "border-primary bg-primary/10 text-foreground"
                : "border-border hover:bg-muted"
            }`}
          >
            {CATALOG_REVIEW_CLASSIFICATION_LABELS[c]}
          </button>
        ))}
      </div>
    </Card>
  );
}
