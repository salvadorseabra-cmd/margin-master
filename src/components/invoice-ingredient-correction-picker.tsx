import { useEffect, useMemo } from "react";
import { ChevronsUpDown, Plus } from "lucide-react";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import {
  dedupeIngredientPickerOptionsById,
  ingredientPickerCommandValue,
  type IngredientPickerOption,
} from "@/lib/ingredient-picker-options";
import { traceIngredientPickerOptionsStage } from "@/lib/ingredient-picker-trace";

type InvoiceIngredientCorrectionPickerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCancel?: () => void;
  ingredients: IngredientPickerOption[];
  selectedIngredientId?: string | null;
  onSelect: (ingredientId: string) => void;
  onSelectNoMatch?: () => void;
  onCreateIngredient?: () => void;
  createIngredientDisabled?: boolean;
  disabled?: boolean;
  /** Readonly chip label, e.g. "Matched to: Novilho acém sem osso". */
  matchLabel?: string | null;
  ingredientId?: string | null;
  placeholder?: string;
};

const triggerClass =
  "inline-flex h-7 max-w-[min(100%,20rem)] items-center gap-1 rounded-md border border-border/60 bg-muted/25 px-2 text-xs font-medium text-foreground/90 underline-offset-2 transition-colors hover:border-border hover:bg-muted/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50";

export function InvoiceIngredientCorrectionPicker({
  open,
  onOpenChange,
  onCancel,
  ingredients,
  selectedIngredientId,
  onSelect,
  onSelectNoMatch,
  onCreateIngredient,
  createIngredientDisabled,
  disabled,
  matchLabel,
  ingredientId,
  placeholder = "Select ingredient…",
}: InvoiceIngredientCorrectionPickerProps) {
  useEffect(() => {
    traceIngredientPickerOptionsStage("06_invoice_correction_picker_props", ingredients, {
      component: "InvoiceIngredientCorrectionPicker",
      open,
    });
  }, [ingredients, open]);

  const sorted = useMemo(() => {
    const canonical = dedupeIngredientPickerOptionsById(ingredients);
    return [...canonical].sort((a, b) => a.name.localeCompare(b.name));
  }, [ingredients]);

  const handleOpenChange = (nextOpen: boolean) => {
    if (disabled) return;
    onOpenChange(nextOpen);
    if (!nextOpen) onCancel?.();
  };

  const triggerText = matchLabel?.trim() || placeholder;

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          data-ingredient-id={ingredientId ?? undefined}
          className={cn(triggerClass, !matchLabel && "text-muted-foreground")}
        >
          <span className="truncate">{triggerText}</span>
          <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[min(100vw-2rem,22rem)] p-0"
        align="start"
        onEscapeKeyDown={(event) => event.stopPropagation()}
      >
        <Command>
          <CommandInput placeholder="Search ingredients…" className="h-9" />
          <CommandList>
            <CommandEmpty>No ingredient found.</CommandEmpty>
            {(onSelectNoMatch || onCreateIngredient) && (
              <>
                <CommandGroup heading="Actions">
                  {onSelectNoMatch && (
                    <CommandItem
                      value="no match remove"
                      keywords={["no", "match", "none", "unmatch", "remove"]}
                      onSelect={() => {
                        onSelectNoMatch();
                        onOpenChange(false);
                      }}
                    >
                      <span className="text-muted-foreground">No match</span>
                    </CommandItem>
                  )}
                  {onCreateIngredient && (
                    <CommandItem
                      value="create ingredient new"
                      keywords={["create", "new", "ingredient"]}
                      disabled={createIngredientDisabled}
                      onSelect={() => {
                        if (createIngredientDisabled) return;
                        onCreateIngredient();
                        onOpenChange(false);
                      }}
                    >
                      <Plus className="mr-1.5 h-3.5 w-3.5 shrink-0 opacity-70" />
                      <span>Create ingredient</span>
                    </CommandItem>
                  )}
                </CommandGroup>
                <CommandSeparator />
              </>
            )}
            <CommandGroup heading="Existing ingredients">
              {sorted.map((row) => (
                <CommandItem
                  key={row.id}
                  value={ingredientPickerCommandValue(row)}
                  keywords={row.searchKeywords}
                  onSelect={() => {
                    onSelect(row.id);
                    onOpenChange(false);
                  }}
                >
                  <span className={row.id === selectedIngredientId ? "font-medium" : undefined}>
                    {row.name}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
