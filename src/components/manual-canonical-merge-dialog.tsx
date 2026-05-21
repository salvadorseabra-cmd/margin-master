import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { AlertTriangle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import type { IngredientMergeCatalogRow, ManualCanonicalMergeImpactPreview } from "@/lib/ingredient-merge";
import {
  buildManualMergePickerOptions,
  executeManualCanonicalMerge,
  previewManualCanonicalMergeImpact,
} from "@/lib/ingredient-merge";

const selectClass =
  "mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

type ManualCanonicalMergeDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  catalog: IngredientMergeCatalogRow[];
  initialSourceId?: string | null;
  initialTargetId?: string | null;
  onSuccess: () => void;
};

function validationMessage(preview: ManualCanonicalMergeImpactPreview | null): string | null {
  if (!preview || preview.validation.ok) return null;
  const labels: Record<string, string> = {
    empty_cluster: "Seleção inválida.",
    canonical_not_in_cluster: "Alvo não encontrado no catálogo.",
    canonical_is_archived: "O alvo está arquivado.",
    source_equals_canonical: "Origem e alvo devem ser diferentes.",
    source_is_archived: "A origem está arquivada.",
    source_already_merged: "A origem já foi fundida noutro ingrediente.",
  };
  return preview.validation.issues.map((issue) => labels[issue] ?? issue).join(" ");
}

export function ManualCanonicalMergeDialog({
  open,
  onOpenChange,
  catalog,
  initialSourceId,
  initialTargetId,
  onSuccess,
}: ManualCanonicalMergeDialogProps) {
  const { user } = useAuth();
  const [sourceId, setSourceId] = useState("");
  const [targetId, setTargetId] = useState("");
  const [preview, setPreview] = useState<ManualCanonicalMergeImpactPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [merging, setMerging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pickerOptions = useMemo(
    () => buildManualMergePickerOptions(catalog, { allowNonCanonicalKind: true }),
    [catalog],
  );

  useEffect(() => {
    if (!open) return;
    setSourceId(initialSourceId ?? "");
    setTargetId(initialTargetId ?? "");
    setPreview(null);
    setError(null);
  }, [open, initialSourceId, initialTargetId]);

  const loadPreview = useCallback(async () => {
    if (!sourceId || !targetId || sourceId === targetId) {
      setPreview(null);
      return;
    }
    setPreviewLoading(true);
    setError(null);
    const result = await previewManualCanonicalMergeImpact(
      supabase,
      sourceId,
      targetId,
      catalog,
    );
    setPreview(result);
    if (result.queryError) setError(result.queryError);
    setPreviewLoading(false);
  }, [sourceId, targetId, catalog]);

  useEffect(() => {
    if (!open) return;
    void loadPreview();
  }, [open, loadPreview]);

  const handleMerge = async () => {
    if (!sourceId || !targetId) return;
    if (!user?.id) {
      setError("Sessão inválida — inicie sessão novamente.");
      return;
    }
    setMerging(true);
    setError(null);

    const result = await executeManualCanonicalMerge({
      client: supabase,
      userId: user.id,
      sourceId,
      targetId,
      catalog,
    });

    if ("error" in result && typeof result.error === "string") {
      setError(result.error);
      setMerging(false);
      return;
    }
    if (result.error) {
      setError(result.error.message);
      setMerging(false);
      return;
    }

    setMerging(false);
    onOpenChange(false);
    onSuccess();
  };

  const canMerge =
    Boolean(sourceId && targetId && sourceId !== targetId) &&
    preview?.validation.ok &&
    !preview?.queryError &&
    !previewLoading &&
    !merging;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Fusão manual de ingredientes</DialogTitle>
          <DialogDescription>
            Arquiva o duplicado (origem) e reatribui receitas, aliases e histórico de preços para o
            canónico (alvo). Não há eliminação permanente.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <label className="text-sm">
              <Label>Origem (duplicado a arquivar)</Label>
              <select
                className={selectClass}
                value={sourceId}
                onChange={(e) => setSourceId(e.target.value)}
              >
                <option value="">— selecionar —</option>
                {pickerOptions.map((opt) => (
                  <option key={opt.id} value={opt.id} disabled={opt.id === targetId}>
                    {opt.label}
                  </option>
                ))}
              </select>
              {sourceId && (
                <p className="mt-1 text-xs text-muted-foreground font-mono">{sourceId}</p>
              )}
            </label>
            <label className="text-sm">
              <Label>Alvo (canónico a manter)</Label>
              <select
                className={selectClass}
                value={targetId}
                onChange={(e) => setTargetId(e.target.value)}
              >
                <option value="">— selecionar —</option>
                {pickerOptions.map((opt) => (
                  <option key={opt.id} value={opt.id} disabled={opt.id === sourceId}>
                    {opt.label}
                  </option>
                ))}
              </select>
              {targetId && (
                <p className="mt-1 text-xs text-muted-foreground font-mono">{targetId}</p>
              )}
            </label>
          </div>

          {previewLoading && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              A calcular impacto…
            </div>
          )}

          {preview && !previewLoading && (
            <div className="rounded-md border border-border bg-muted/30 p-3 space-y-2 text-sm">
              <p className="font-medium text-foreground">Impacto previsto (origem)</p>
              <ul className="space-y-1 text-muted-foreground">
                <li>
                  Receitas: {preview.recipeIngredients.count}
                  {preview.recipeIngredients.recipeNames.length > 0 &&
                    ` — ${preview.recipeIngredients.recipeNames.join(", ")}`}
                </li>
                <li>
                  Aliases fatura: {preview.ingredientAliases.count}
                  {preview.ingredientAliases.aliasNames.length > 0 &&
                    ` — ${preview.ingredientAliases.aliasNames.join(", ")}`}
                </li>
                <li>Histórico de preços: {preview.ingredientPriceHistory.count}</li>
                <li>Impactos de margem: {preview.recipeMarginImpacts.count}</li>
              </ul>
              {validationMessage(preview) && (
                <p className="text-destructive text-sm">{validationMessage(preview)}</p>
              )}
            </div>
          )}

          {canMerge && (
            <div className="flex gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-950 dark:text-amber-100">
              <AlertTriangle className="h-5 w-5 shrink-0" />
              <p>
                A origem será arquivada (<span className="font-mono text-xs">is_archived</span>,{" "}
                <span className="font-mono text-xs">merged_into_ingredient_id</span>). Esta ação não
                pode ser desfeita automaticamente.
              </p>
            </div>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={merging}>
            Cancelar
          </Button>
          <Button type="button" variant="destructive" disabled={!canMerge} onClick={() => void handleMerge()}>
            {merging ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                A fundir…
              </>
            ) : (
              "Confirmar fusão"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
