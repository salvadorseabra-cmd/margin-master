import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell, Card } from "@/components/AppShell";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import {
  loadCanonicalIngredientCatalog,
  loadIngredientCatalogIncludingArchived,
} from "@/lib/ingredient-catalog-load";
import {
  buildRecipeCanonicalMigrationPreview,
  logRecipeCanonicalMigrationPreview,
  RECIPE_MIGRATION_SAFETY_ISSUE_LABELS,
  RECIPE_MIGRATION_STATUS_LABELS,
  type RecipeMigrationLinePreview,
} from "@/lib/recipe-canonical-migration-preview";
import { ArrowLeft, ClipboardList, Loader2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

export const Route = createFileRoute("/recipes/migration-preview")({
  head: () => ({
    meta: [
      { title: "Pré-visualização migração receitas — Marginly" },
      {
        name: "description",
        content: "Auditoria read-only de embeds legados e FKs canónicas em receitas.",
      },
    ],
  }),
  component: RecipeMigrationPreviewPage,
});

type StatusFilter = "all" | "issues" | "orphan" | "ambiguous" | "stale_price";

function formatStatuses(row: RecipeMigrationLinePreview): string {
  return row.statuses
    .map((s) => RECIPE_MIGRATION_STATUS_LABELS[s] ?? s)
    .join(", ");
}

function formatSafety(row: RecipeMigrationLinePreview): string {
  if (row.safety.safe) return "Seguro";
  return row.safety.issues
    .map((issue) => RECIPE_MIGRATION_SAFETY_ISSUE_LABELS[issue] ?? issue)
    .join("; ");
}

function RecipeMigrationPreviewPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<ReturnType<
    typeof buildRecipeCanonicalMigrationPreview
  > | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("issues");

  const load = useCallback(async () => {
    if (!user?.id) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);

    const [recipesResult, canonicalResult, fullResult] = await Promise.all([
      supabase
        .from("recipes")
        .select(
          `
          id,
          name,
          recipe_ingredients!recipe_ingredients_recipe_id_fkey (
            id,
            ingredient_id,
            ingredients (
              id,
              name,
              current_price,
              purchase_quantity
            )
          )
        `,
        )
        .order("name", { ascending: true }),
      loadCanonicalIngredientCatalog(supabase, "current_price, purchase_quantity"),
      loadIngredientCatalogIncludingArchived(
        supabase,
        "current_price, purchase_quantity",
      ),
    ]);

    if (recipesResult.error) {
      setError(recipesResult.error.message);
      setLoading(false);
      return;
    }
    if (canonicalResult.error) {
      setError(canonicalResult.error);
      setLoading(false);
      return;
    }
    if (fullResult.error) {
      setError(fullResult.error);
      setLoading(false);
      return;
    }

    const recipes = (recipesResult.data ?? []) as Array<{
      id: string;
      name: string;
      recipe_ingredients: Array<{
        id: string;
        ingredient_id: string | null;
        ingredients: {
          id: string;
          name: string | null;
          current_price: number | null;
          purchase_quantity: number | null;
        } | null;
      }> | null;
    }>;

    const lines = recipes.flatMap((recipe) =>
      (recipe.recipe_ingredients ?? [])
        .filter((line) => line.ingredient_id)
        .map((line) => ({
          recipeId: recipe.id,
          lineId: line.id,
          ingredientId: line.ingredient_id as string,
          ingredientName: line.ingredients?.name ?? null,
          embed: line.ingredients
            ? {
                name: line.ingredients.name,
                current_price: line.ingredients.current_price,
                purchase_quantity: line.ingredients.purchase_quantity,
              }
            : null,
        })),
    );

    const preview = buildRecipeCanonicalMigrationPreview({
      recipes: recipes.map((r) => ({ id: r.id, name: r.name })),
      lines,
      canonicalCatalog: canonicalResult.rows,
      fullCatalog: fullResult.rows,
    });

    logRecipeCanonicalMigrationPreview({
      surface: "recipes.migration-preview",
      report: preview,
    });

    setReport(preview);
    setLoading(false);
  }, [user?.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    if (!report) return [];
    const rows = report.lines;
    switch (statusFilter) {
      case "orphan":
        return report.orphanLines;
      case "ambiguous":
        return report.ambiguousLines;
      case "stale_price":
        return report.staleEmbedPriceLines;
      case "issues":
        return rows.filter((row) => !row.statuses.includes("ok") || !row.safety.safe);
      default:
        return rows;
    }
  }, [report, statusFilter]);

  return (
    <AppShell
      title="Pré-visualização migração"
      subtitle="Auditoria read-only: embeds legados → FK canónica. Sem alterações na base de dados."
      action={
        <div className="flex flex-wrap items-center gap-3">
          <span
            className="text-xs text-muted-foreground border border-dashed border-border rounded-md px-2 py-1"
            title="Preview only — migração automática desativada"
          >
            Apenas pré-visualização
          </span>
          <Link
            to="/recipes"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            Receitas
          </Link>
        </div>
      }
    >
      <div className="space-y-4">
        <Card className="p-4 flex flex-wrap gap-3 items-end">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-muted-foreground">Filtro</span>
            <select
              className="border border-border rounded-md px-2 py-1.5 bg-background min-w-[200px]"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            >
              <option value="issues">Com problemas</option>
              <option value="all">Todas as linhas</option>
              <option value="orphan">Órfãos</option>
              <option value="ambiguous">Ambíguos</option>
              <option value="stale_price">Preço embed desatualizado</option>
            </select>
          </label>
          {report && (
            <p className="text-sm text-muted-foreground ml-auto flex flex-wrap gap-3">
              <span>{report.recipeCount} receitas</span>
              <span>{report.lineCount} linhas</span>
              <span>{report.orphanLines.length} órfãos</span>
              <span>{report.ambiguousLines.length} ambíguos</span>
            </p>
          )}
        </Card>

        {loading && (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {error && (
          <Card className="p-4 text-destructive text-sm">{error}</Card>
        )}

        {!loading && !error && report && report.lineCount === 0 && (
          <Card className="p-6 text-center text-sm text-muted-foreground">
            Nenhuma linha de ingrediente nas receitas — nada a auditar.
          </Card>
        )}

        {!loading && !error && report && report.lineCount > 0 && (
          <Card className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="p-3 font-medium">Receita</th>
                  <th className="p-3 font-medium">Linha</th>
                  <th className="p-3 font-medium">FK atual</th>
                  <th className="p-3 font-medium">Estado</th>
                  <th className="p-3 font-medium">Candidato</th>
                  <th className="p-3 font-medium">Segurança</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-6 text-center text-muted-foreground">
                      Nenhuma linha neste filtro.
                    </td>
                  </tr>
                ) : (
                  filtered.map((row) => (
                    <tr key={`${row.recipeId}-${row.lineId}-${row.ingredientId}`} className="border-b border-border/60">
                      <td className="p-3">{row.recipeName}</td>
                      <td className="p-3 font-mono text-xs">{row.lineId ?? "—"}</td>
                      <td className="p-3">
                        <div className="font-mono text-xs">{row.ingredientId}</div>
                        {row.ingredientName && (
                          <div className="text-muted-foreground text-xs mt-0.5">{row.ingredientName}</div>
                        )}
                        {row.embeddedSource?.embedPrice != null && (
                          <div className="text-muted-foreground text-xs">
                            embed €{row.embeddedSource.embedPrice}
                          </div>
                        )}
                      </td>
                      <td className="p-3">{formatStatuses(row)}</td>
                      <td className="p-3 font-mono text-xs">
                        {row.suggestedCandidateId ?? "—"}
                        {row.ambiguousCandidateIds.length > 1 && (
                          <div className="text-amber-600 dark:text-amber-400 text-xs mt-1">
                            {row.ambiguousCandidateIds.join(", ")}
                          </div>
                        )}
                        {row.mergeArchiveDep && (
                          <div className="text-muted-foreground text-xs mt-1">
                            arquivado → {row.mergeArchiveDep.mergedIntoIngredientId ?? "—"}
                          </div>
                        )}
                      </td>
                      <td className="p-3">
                        <span
                          className={
                            row.safety.safe
                              ? "text-emerald-600 dark:text-emerald-400"
                              : "text-amber-600 dark:text-amber-400"
                          }
                        >
                          {formatSafety(row)}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </Card>
        )}

        {!loading && !error && (
          <p className="text-xs text-muted-foreground flex items-center gap-2">
            <ClipboardList className="h-3.5 w-3.5" />
            Migração automática desativada — use fusão manual no catálogo quando necessário.
          </p>
        )}
      </div>
    </AppShell>
  );
}
