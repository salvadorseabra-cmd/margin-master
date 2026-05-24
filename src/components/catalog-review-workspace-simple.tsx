import type { CatalogReviewMatchRowDto } from "@/lib/catalog-review-match-rows";
import { CatalogReviewStatusBadge } from "@/components/catalog-review-status-badge";
import {
  CATALOG_REVIEW_RECIPE_NAMES_INLINE_MAX,
} from "@/lib/catalog-review-recipe-names";
import { formatCatalogReviewRecipeStatusBadge } from "@/lib/catalog-review-status-badges";
import {
  dedupeIngredientPickerOptionsById,
  ingredientPickerCommandValue,
  type IngredientPickerOption,
} from "@/lib/ingredient-picker-options";
import { cn } from "@/lib/utils";
import { Archive, ChevronDown, ChevronUp, ChevronsUpDown, Loader2 } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export type CatalogReviewWorkspaceItem = {
  ingredientId: string;
  displayName: string;
  matchCount: number;
};

export function CatalogReviewWorkspaceSimple({
  item,
  matchRows,
  pickerOptions,
  reassignTargetByLineKey,
  onReassignTargetChange,
  savingLineKey,
  onSaveInvoiceLineMatch,
  recipeCount,
  recipeNames = [],
  recipeNamesLoading,
  archiving,
  onArchiveIngredient,
}: {
  item: CatalogReviewWorkspaceItem;
  matchRows: CatalogReviewMatchRowDto[];
  pickerOptions: IngredientPickerOption[];
  reassignTargetByLineKey: Record<string, string>;
  onReassignTargetChange: (lineKey: string, targetId: string) => void;
  savingLineKey: string | null;
  onSaveInvoiceLineMatch: (lineKey: string, toIngredientId: string) => void;
  recipeCount?: number;
  recipeNames?: string[];
  recipeNamesLoading?: boolean;
  archiving?: boolean;
  onArchiveIngredient?: (ingredientId: string) => void;
}) {
  const busy = savingLineKey != null;
  const archiveEnabled = recipeCount === 0 && !busy;
  const options = useMemo(
    () =>
      [...dedupeIngredientPickerOptionsById(pickerOptions)].sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
      ),
    [pickerOptions],
  );
  const optionLabelById = useMemo(
    () => new Map(options.map((option) => [option.id, option.name])),
    [options],
  );

  const showEmptyState = matchRows.length === 0;

  return (
    <CatalogReviewWorkspaceShell
      displayName={item.displayName}
      recipeCount={recipeCount}
      recipeNames={recipeNames}
      recipeNamesLoading={recipeNamesLoading}
      recipeUsageKey={item.ingredientId}
      archiving={archiving}
      archiveEnabled={archiveEnabled}
      onArchiveIngredient={
        onArchiveIngredient ? () => onArchiveIngredient(item.ingredientId) : undefined
      }
    >
      {showEmptyState ? (
        <p className="text-sm text-muted-foreground">No invoice lines currently match.</p>
      ) : (
        <ul className="space-y-4">
          {matchRows.map((matchRow) => {
            const targetId =
              reassignTargetByLineKey[matchRow.key] ?? matchRow.matchedIngredientId;
            const saving = savingLineKey === matchRow.key;
            const selectionChanged = targetId !== matchRow.matchedIngredientId;
            const canSave = Boolean(targetId) && selectionChanged && !busy;

            return (
              <li
                key={matchRow.key}
                className="rounded-lg border border-border/40 bg-muted/15 px-3 py-3"
              >
                <CatalogReviewCurrentMatchCard
                  matchRow={matchRow}
                  reassignTo={
                    <>
                      <label className="mt-3 flex flex-col gap-1.5 text-sm text-foreground">
                        <span className="text-xs text-muted-foreground">
                          Reassign invoice line to
                        </span>
                        <CatalogReviewIngredientPicker
                          options={options}
                          optionLabelById={optionLabelById}
                          value={targetId}
                          disabled={busy}
                          onChange={(nextId) => onReassignTargetChange(matchRow.key, nextId)}
                        />
                      </label>

                      {selectionChanged ? (
                        <button
                          type="button"
                          disabled={!canSave}
                          className="mt-3 inline-flex items-center justify-center rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                          onClick={() => onSaveInvoiceLineMatch(matchRow.key, targetId)}
                        >
                          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
                        </button>
                      ) : null}
                    </>
                  }
                />
              </li>
            );
          })}
        </ul>
      )}
    </CatalogReviewWorkspaceShell>
  );
}

function CatalogReviewCurrentMatchCard({
  matchRow,
  reassignTo,
}: {
  matchRow: CatalogReviewMatchRowDto;
  reassignTo?: ReactNode;
}) {
  const contextParts = [matchRow.supplierName, matchRow.invoiceDate].filter(Boolean);
  const contextLine = contextParts.length > 0 ? contextParts.join(" · ") : null;

  return (
    <>
      <p className="text-sm font-medium text-foreground">{matchRow.invoiceWording}</p>
      {contextLine ? (
        <p className="mt-2 text-sm text-muted-foreground">{contextLine}</p>
      ) : null}
      <div className="mt-3 flex flex-col gap-0.5">
        <span className="text-xs text-muted-foreground">Currently matched to:</span>
        <p className="text-sm text-foreground">{matchRow.matchedIngredientName}</p>
      </div>
      {reassignTo}
    </>
  );
}

function CatalogReviewIngredientPicker({
  options,
  optionLabelById,
  value,
  disabled,
  onChange,
}: {
  options: IngredientPickerOption[];
  optionLabelById: Map<string, string>;
  value: string;
  disabled?: boolean;
  onChange: (ingredientId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const selectedLabel = optionLabelById.get(value) ?? value;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className="h-9 w-full justify-between px-2.5 font-normal"
        >
          <span className="truncate">{selectedLabel}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[min(100vw-2rem,20rem)] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search ingredients…" className="h-9" />
          <CommandList>
            <CommandEmpty>No ingredient found.</CommandEmpty>
            <CommandGroup>
              {options.map((option) => (
                <CommandItem
                  key={option.id}
                  value={ingredientPickerCommandValue(option)}
                  keywords={option.searchKeywords}
                  onSelect={() => {
                    onChange(option.id);
                    setOpen(false);
                  }}
                >
                  <span className={cn(option.id === value && "font-medium")}>{option.name}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function CatalogReviewRecipeUsageBlock({
  recipeNames,
  recipeCount,
  loading,
}: {
  recipeNames: string[];
  recipeCount?: number;
  loading?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const count = recipeNames.length > 0 ? recipeNames.length : (recipeCount ?? 0);

  if (loading) {
    return (
      <div
        className="mt-3 flex items-center gap-2 rounded-md border border-border/30 bg-muted/20 px-3 py-2 text-xs text-muted-foreground"
        aria-busy="true"
      >
        <Loader2 className="h-3.5 w-3.5 animate-spin opacity-60" />
        Loading recipe usage…
      </div>
    );
  }

  if (count === 0) return null;

  const showInline = count <= CATALOG_REVIEW_RECIPE_NAMES_INLINE_MAX && recipeNames.length > 0;
  const showList = showInline || expanded;
  const canExpand = recipeNames.length > 0;

  return (
    <div className="mt-3 rounded-md border border-border/30 bg-muted/20 px-3 py-2.5">
      {showList && canExpand ? (
        <>
          <p className="text-xs font-medium text-muted-foreground">Used in:</p>
          <ul className="mt-1.5 space-y-0.5">
            {recipeNames.map((name) => (
              <li
                key={name}
                className="flex items-start gap-1.5 text-sm text-foreground/85"
              >
                <span aria-hidden className="text-muted-foreground/60">
                  •
                </span>
                <span>{name}</span>
              </li>
            ))}
          </ul>
          {!showInline ? (
            <button
              type="button"
              onClick={() => setExpanded(false)}
              className="mt-2 inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              <ChevronUp className="h-3.5 w-3.5" />
              Show less
            </button>
          ) : null}
        </>
      ) : canExpand ? (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="inline-flex w-full items-center justify-between gap-2 text-left text-sm font-medium text-foreground/90 transition-colors hover:text-foreground"
        >
          <span>Used in {count} recipes</span>
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        </button>
      ) : (
        <p className="text-sm font-medium text-foreground/90">Used in {count} recipes</p>
      )}
    </div>
  );
}

function CatalogReviewWorkspaceShell({
  displayName,
  recipeCount,
  recipeNames = [],
  recipeNamesLoading,
  recipeUsageKey,
  archiving,
  archiveEnabled,
  onArchiveIngredient,
  children,
}: {
  displayName: string;
  recipeCount?: number;
  recipeNames?: string[];
  recipeNamesLoading?: boolean;
  recipeUsageKey?: string;
  archiving?: boolean;
  archiveEnabled?: boolean;
  onArchiveIngredient?: () => void;
  children: ReactNode;
}) {
  const showRecipeUsage =
    recipeNamesLoading || recipeNames.length > 0 || (recipeCount != null && recipeCount > 0);
  const headerRecipeBadge =
    !showRecipeUsage && recipeCount != null
      ? formatCatalogReviewRecipeStatusBadge(recipeCount)
      : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 border-b border-border/15 px-4 py-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-medium text-foreground">{displayName}</h2>
            {headerRecipeBadge ? (
              <div className="mt-1.5">
                <CatalogReviewStatusBadge spec={headerRecipeBadge} />
              </div>
            ) : null}
          </div>
          {onArchiveIngredient ? (
            <button
              type="button"
              disabled={archiving || !archiveEnabled}
              title={!archiveEnabled && recipeCount !== 0 ? "Used in recipes" : undefined}
              className={cn(
                "inline-flex shrink-0 items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors",
                "border-border/50 bg-background text-muted-foreground shadow-sm",
                "hover:border-amber-500/30 hover:bg-amber-500/8 hover:text-foreground",
                "disabled:cursor-not-allowed disabled:opacity-50",
              )}
              onClick={onArchiveIngredient}
            >
              {archiving ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Archive className="h-3.5 w-3.5" />
              )}
              {archiving ? "Archiving…" : "Archive ingredient"}
            </button>
          ) : null}
        </div>
        {showRecipeUsage ? (
          <CatalogReviewRecipeUsageBlock
            key={recipeUsageKey ?? displayName}
            recipeNames={recipeNames}
            recipeCount={recipeCount}
            loading={recipeNamesLoading}
          />
        ) : null}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5">{children}</div>
    </div>
  );
}
