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
import { Badge } from "@/components/ui/badge";
import { formatCanonicalIngredientDisplayName } from "@/lib/canonical-ingredient-display-name";
import type { CanonicalIngredientCreateFormDefaults } from "@/lib/canonical-ingredient-create";
import {
  traceCanonicalConfirmedName,
  traceCanonicalModalOpen,
  traceCanonicalSuggestion,
  validateCanonicalIngredientName,
} from "@/lib/canonical-ingredient-create";
import {
  getAliasTraceCompareBucket,
  traceIngredientAliases,
} from "@/lib/ingredient-aliases-trace";

export type CanonicalIngredientCreateSubmitValues = {
  canonicalName: string;
  unit: string;
  purchase_quantity: number;
  purchase_unit: string | null;
  base_unit: string;
  current_price: number;
};

type CanonicalIngredientCreateDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaults: CanonicalIngredientCreateFormDefaults | null;
  saving: boolean;
  error: string | null;
  onSubmit: (values: CanonicalIngredientCreateSubmitValues) => void;
};

const inputClass =
  "mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

const readonlyClass =
  "mt-1 w-full rounded-md border border-dashed border-border bg-muted/40 px-3 py-2 text-sm text-foreground";

export function CanonicalIngredientCreateDialog({
  open,
  onOpenChange,
  defaults,
  saving,
  error,
  onSubmit,
}: CanonicalIngredientCreateDialogProps) {
  const [form, setForm] = useState({
    confirmedCanonicalName: "",
    unit: "kg",
    purchase_quantity: "1",
    purchase_unit: "",
    base_unit: "",
    current_price: "",
  });
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !defaults) return;
    traceCanonicalModalOpen({
      rawInvoiceText: defaults.invoiceAlias,
      itemId: defaults.itemId,
    });
    if (defaults.suggestedCanonicalName) {
      traceCanonicalSuggestion({ suggestedName: defaults.suggestedCanonicalName });
    }
    setLocalError(null);
    setForm({
      confirmedCanonicalName:
        defaults.catalogReady && defaults.suggestedCanonicalName
          ? defaults.suggestedCanonicalName
          : "",
      unit: defaults.unit,
      purchase_quantity: defaults.purchase_quantity,
      purchase_unit: defaults.purchase_unit,
      base_unit: defaults.base_unit,
      current_price: defaults.current_price,
    });
  }, [open, defaults]);

  const handleApplySuggestion = () => {
    const suggestion = defaults?.suggestedCanonicalName?.trim();
    if (!suggestion) return;
    setForm((current) => ({ ...current, confirmedCanonicalName: suggestion }));
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const confirmedCanonicalName = form.confirmedCanonicalName.trim();
    const invoiceAlias = defaults?.invoiceAlias ?? "";
    const nameValidation = validateCanonicalIngredientName(confirmedCanonicalName, {
      invoiceAlias,
    });
    if (!nameValidation.ok) {
      setLocalError(nameValidation.message);
      return;
    }
    setLocalError(null);
    traceCanonicalConfirmedName({ confirmedName: confirmedCanonicalName });

    const pq = Number(form.purchase_quantity);
    const purchase_quantity = Number.isFinite(pq) && pq > 0 ? pq : 1;
    const current_price = Number(form.current_price);
    traceIngredientAliases("CanonicalIngredientCreateDialog:submit", {
      function: "CanonicalIngredientCreateDialog.handleSubmit",
      invoiceAlias,
      compareBucket: getAliasTraceCompareBucket(invoiceAlias),
      canonicalName: confirmedCanonicalName,
      unit: form.unit.trim() || "kg",
      purchase_quantity,
      purchase_unit: form.purchase_unit.trim() || null,
    });
    onSubmit({
      canonicalName: confirmedCanonicalName,
      unit: form.unit.trim() || "kg",
      purchase_quantity,
      purchase_unit: form.purchase_unit.trim() || null,
      base_unit: form.base_unit.trim() || form.unit.trim() || "kg",
      current_price: Number.isFinite(current_price) && current_price >= 0 ? current_price : 0,
    });
  };

  const displayError = localError ?? error;
  const suggestion = defaults?.suggestedCanonicalName?.trim() || null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Create catalog ingredient</DialogTitle>
          <DialogDescription>
            Add a human-readable product to your catalog and link this invoice line as an alias.
          </DialogDescription>
        </DialogHeader>
        {defaults && (
          <form onSubmit={handleSubmit} className="grid gap-3">
            <div>
              <Label htmlFor="canonical-invoice-alias">Invoice alias</Label>
              <input
                id="canonical-invoice-alias"
                readOnly
                tabIndex={-1}
                value={defaults.invoiceAlias}
                className={readonlyClass}
                aria-readonly="true"
              />
              {(defaults.supplierName || defaults.invoiceQuantityLabel) && (
                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                  {defaults.supplierName && <span>Supplier: {defaults.supplierName}</span>}
                  {defaults.invoiceQuantityLabel && (
                    <span>Invoice qty: {defaults.invoiceQuantityLabel}</span>
                  )}
                </div>
              )}
            </div>

            {suggestion && (
              <div className="rounded-md border border-dashed border-border bg-muted/20 px-3 py-2 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Suggested canonical name
                  </div>
                  {defaults.catalogReady && (
                    <Badge variant="secondary" className="text-xs">
                      Catalog Ready
                    </Badge>
                  )}
                </div>
                <p className="mt-0.5 font-medium">{suggestion}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {defaults.catalogReady
                    ? "Invoice name is already a good catalog name — confirm below or edit."
                    : "Preview from cleanup — not saved until you apply and confirm below."}
                </p>
                {!defaults.catalogReady && (
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="mt-2"
                    disabled={saving}
                    onClick={handleApplySuggestion}
                  >
                    Apply suggestion
                  </Button>
                )}
              </div>
            )}

            <div>
              <Label htmlFor="canonical-ingredient-name">Final confirmed canonical name</Label>
              <input
                id="canonical-ingredient-name"
                required
                autoFocus
                value={form.confirmedCanonicalName}
                onChange={(e) => {
                  setLocalError(null);
                  setForm((current) => ({
                    ...current,
                    confirmedCanonicalName: e.target.value,
                  }));
                }}
                className={inputClass}
                placeholder="Angus burger patty 180g"
              />
              {form.confirmedCanonicalName.trim() && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Catalog display:{" "}
                  <span className="font-medium text-foreground">
                    {formatCanonicalIngredientDisplayName(form.confirmedCanonicalName)}
                  </span>
                </p>
              )}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="canonical-stock-unit">Stock unit</Label>
                <input
                  id="canonical-stock-unit"
                  value={form.unit}
                  onChange={(e) => setForm((current) => ({ ...current, unit: e.target.value }))}
                  className={inputClass}
                  placeholder="kg"
                />
              </div>
              <div>
                <Label htmlFor="canonical-pack-price">Pack price (€)</Label>
                <input
                  id="canonical-pack-price"
                  type="number"
                  step="0.01"
                  min={0}
                  value={form.current_price}
                  onChange={(e) =>
                    setForm((current) => ({ ...current, current_price: e.target.value }))
                  }
                  className={inputClass}
                  placeholder="0.00"
                />
              </div>
              <div>
                <Label htmlFor="canonical-purchase-qty">Units per pack</Label>
                <input
                  id="canonical-purchase-qty"
                  type="number"
                  min={0.001}
                  step="0.001"
                  value={form.purchase_quantity}
                  onChange={(e) =>
                    setForm((current) => ({ ...current, purchase_quantity: e.target.value }))
                  }
                  className={inputClass}
                />
              </div>
              <div>
                <Label htmlFor="canonical-purchase-unit">Pack unit (optional)</Label>
                <input
                  id="canonical-purchase-unit"
                  value={form.purchase_unit}
                  onChange={(e) =>
                    setForm((current) => ({ ...current, purchase_unit: e.target.value }))
                  }
                  className={inputClass}
                  placeholder="case"
                />
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="canonical-base-unit">Recipe unit (optional)</Label>
                <input
                  id="canonical-base-unit"
                  value={form.base_unit}
                  onChange={(e) =>
                    setForm((current) => ({ ...current, base_unit: e.target.value }))
                  }
                  className={inputClass}
                  placeholder="Defaults to stock unit"
                />
              </div>
            </div>

            {displayError && <p className="text-sm text-destructive">{displayError}</p>}

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
                Save ingredient
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
