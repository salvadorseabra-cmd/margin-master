import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
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
import { formatCanonicalIngredientDisplayName } from "@/lib/canonical-ingredient-display-name";
import { generateOperationalIngredientName } from "@/lib/canonical-ingredient-operational-name";
import { looksLikeInvoiceShorthandName } from "@/lib/ingredient-kind";

type CanonicalIngredientRenameDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentName: string;
  /** Pre-fill when opened from a deterministic suggestion (e.g. Ingredients quality panel). */
  initialCanonicalName?: string | null;
  saving: boolean;
  error: string | null;
  onSubmit: (canonicalName: string) => void;
};

const inputClass =
  "mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function CanonicalIngredientRenameDialog({
  open,
  onOpenChange,
  currentName,
  initialCanonicalName,
  saving,
  error,
  onSubmit,
}: CanonicalIngredientRenameDialogProps) {
  const [canonicalName, setCanonicalName] = useState("");

  useEffect(() => {
    if (!open) return;
    const seed = initialCanonicalName?.trim();
    setCanonicalName(seed || currentName);
  }, [open, currentName, initialCanonicalName]);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    onSubmit(canonicalName.trim());
  };

  const preview = canonicalName.trim()
    ? formatCanonicalIngredientDisplayName(canonicalName)
    : "";

  const operationalSuggestion = currentName.trim()
    ? generateOperationalIngredientName(currentName)
    : "";
  const cleanedSuggestion = currentName.trim()
    ? formatCanonicalIngredientDisplayName(currentName)
    : "";
  const applyOperationalName =
    looksLikeInvoiceShorthandName(currentName) && Boolean(operationalSuggestion);
  const showCleanedSuggestion =
    Boolean(cleanedSuggestion) &&
    cleanedSuggestion !== formatCanonicalIngredientDisplayName(currentName) &&
    !applyOperationalName;
  const showOperationalSuggestion =
    applyOperationalName &&
    operationalSuggestion !== formatCanonicalIngredientDisplayName(currentName);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Rename catalog ingredient</DialogTitle>
          <DialogDescription>
            Update the human-readable catalog name only. Invoice aliases and recipe links stay on
            the same ingredient.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="grid gap-3">
          <div>
            <Label htmlFor="canonical-ingredient-rename">Catalog ingredient name</Label>
            <input
              id="canonical-ingredient-rename"
              required
              autoFocus
              value={canonicalName}
              onChange={(e) => setCanonicalName(e.target.value)}
              className={inputClass}
              placeholder="Palha para snacks 2 kg"
            />
            {preview && (
              <p className="mt-1 text-xs text-muted-foreground">
                Catalog display:{" "}
                <span className="font-medium text-foreground">{preview}</span>
              </p>
            )}
            {showOperationalSuggestion && (
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span>
                  Operational name:{" "}
                  <span className="font-medium text-foreground">{operationalSuggestion}</span>
                </span>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={saving}
                  onClick={() => setCanonicalName(operationalSuggestion)}
                >
                  Apply operational name
                </Button>
              </div>
            )}
            {showCleanedSuggestion && (
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span>
                  Suggested:{" "}
                  <span className="font-medium text-foreground">{cleanedSuggestion}</span>
                </span>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={saving}
                  onClick={() => setCanonicalName(cleanedSuggestion)}
                >
                  Apply suggestion
                </Button>
              </div>
            )}
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              disabled={saving}
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              Save name
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
