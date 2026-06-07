import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type { BulkCanonicalCreateCandidate } from "@/lib/bulk-canonical-ingredient-create";
import { validateCanonicalIngredientName } from "@/lib/canonical-ingredient-create";

export type BulkCanonicalIngredientCreateRowState = {
  itemId: string;
  selected: boolean;
  canonicalName: string;
  error: string | null;
};

export type BulkCanonicalIngredientCreateSubmitRow = {
  itemId: string;
  canonicalName: string;
};

type BulkCanonicalIngredientCreateSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  candidates: BulkCanonicalCreateCandidate[];
  saving: boolean;
  error: string | null;
  onSubmit: (rows: BulkCanonicalIngredientCreateSubmitRow[]) => void;
};

const inputClass =
  "w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

function initialRowState(
  candidate: BulkCanonicalCreateCandidate,
): BulkCanonicalIngredientCreateRowState {
  const suggestion = candidate.defaults.suggestedCanonicalName?.trim() ?? "";
  return {
    itemId: candidate.item.id,
    selected: true,
    canonicalName: suggestion,
    error: null,
  };
}

export function BulkCanonicalIngredientCreateSheet({
  open,
  onOpenChange,
  candidates,
  saving,
  error,
  onSubmit,
}: BulkCanonicalIngredientCreateSheetProps) {
  const [rows, setRows] = useState<BulkCanonicalIngredientCreateRowState[]>([]);

  useEffect(() => {
    if (!open) return;
    setRows(candidates.map(initialRowState));
  }, [open, candidates]);

  const selectedCount = useMemo(() => rows.filter((row) => row.selected).length, [rows]);

  const handleSubmit = () => {
    const nextRows = rows.map((row) => ({ ...row, error: null as string | null }));
    let hasError = false;
    const validated = nextRows.map((row) => {
      if (!row.selected) return row;
      const candidate = candidates.find((c) => c.item.id === row.itemId);
      const validation = validateCanonicalIngredientName(row.canonicalName, {
        invoiceAlias: candidate?.defaults.invoiceAlias,
      });
      if (!validation.ok) {
        hasError = true;
        return { ...row, error: validation.message };
      }
      return row;
    });
    setRows(validated);
    if (hasError) return;

    onSubmit(
      validated
        .filter((row) => row.selected)
        .map((row) => ({
          itemId: row.itemId,
          canonicalName: row.canonicalName.trim(),
        })),
    );
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>Review new ingredients</SheetTitle>
          <SheetDescription>
            Confirm catalog names for unmatched invoice lines. Each row creates an ingredient and
            links the invoice alias.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto py-4">
          <div className="space-y-3">
            {candidates.map((candidate) => {
              const row = rows.find((entry) => entry.itemId === candidate.item.id);
              if (!row) return null;
              const checkboxId = `bulk-create-${candidate.item.id}`;
              return (
                <div
                  key={candidate.item.id}
                  className={`rounded-lg border p-3 ${
                    row.selected
                      ? "border-border bg-card"
                      : "border-dashed border-border/70 bg-muted/20"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <Checkbox
                      id={checkboxId}
                      checked={row.selected}
                      disabled={saving}
                      className="mt-1"
                      onCheckedChange={(checked) => {
                        setRows((current) =>
                          current.map((entry) =>
                            entry.itemId === candidate.item.id
                              ? { ...entry, selected: checked === true }
                              : entry,
                          ),
                        );
                      }}
                    />
                    <div className="min-w-0 flex-1 space-y-2">
                      <div>
                        <Label htmlFor={checkboxId} className="text-xs text-muted-foreground">
                          Invoice item
                        </Label>
                        <p className="text-sm font-medium leading-tight">
                          {candidate.defaults.invoiceAlias}
                        </p>
                      </div>
                      <div>
                        <Label htmlFor={`${checkboxId}-name`}>Suggested canonical name</Label>
                        <input
                          id={`${checkboxId}-name`}
                          value={row.canonicalName}
                          disabled={!row.selected || saving}
                          onChange={(e) => {
                            const value = e.target.value;
                            setRows((current) =>
                              current.map((entry) =>
                                entry.itemId === candidate.item.id
                                  ? { ...entry, canonicalName: value, error: null }
                                  : entry,
                              ),
                            );
                          }}
                          className={inputClass}
                          placeholder="Enter catalog ingredient name"
                        />
                        {row.error && <p className="mt-1 text-xs text-destructive">{row.error}</p>}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <SheetFooter className="gap-2 sm:gap-0">
          <Button
            type="button"
            variant="outline"
            disabled={saving}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button type="button" disabled={saving || selectedCount === 0} onClick={handleSubmit}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Create {selectedCount} ingredient{selectedCount === 1 ? "" : "s"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
