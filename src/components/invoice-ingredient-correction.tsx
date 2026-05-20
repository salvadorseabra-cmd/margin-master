import { useEffect, useMemo, useState } from "react";
import { Check, Search } from "lucide-react";
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
import {
  dedupeIngredientPickerOptionsById,
  ingredientPickerCommandValue,
  type IngredientPickerOption,
} from "@/lib/ingredient-picker-options";
import { traceIngredientPickerOptionsStage } from "@/lib/ingredient-picker-trace";
import { cn } from "@/lib/utils";

export type { IngredientPickerOption };

const correctionButtonClass = "h-6 rounded-md px-2 text-[11px] font-medium shadow-none";

type IngredientCorrectionActionsProps = {
  showConfirm: boolean;
  showWrongMatch: boolean;
  showPicker: boolean;
  pickerLabel?: string;
  ingredients: IngredientPickerOption[];
  onConfirm?: () => void;
  onWrongMatch: () => void;
  onSelectIngredient: (ingredientId: string) => void;
};

export function IngredientCorrectionActions({
  showConfirm,
  showWrongMatch,
  showPicker,
  pickerLabel = "Find ingredient",
  ingredients,
  onConfirm,
  onWrongMatch,
  onSelectIngredient,
}: IngredientCorrectionActionsProps) {
  if (!showConfirm && !showWrongMatch && !showPicker) return null;

  return (
    <div className="flex flex-wrap items-center gap-1">
      {showConfirm && onConfirm && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={correctionButtonClass}
          onClick={onConfirm}
        >
          <Check className="h-3 w-3" />
          Confirm match
        </Button>
      )}
      {showWrongMatch && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={cn(correctionButtonClass, "text-muted-foreground hover:text-destructive")}
          onClick={onWrongMatch}
        >
          Wrong match
        </Button>
      )}
      {showPicker && (
        <IngredientSearchPicker
          label={pickerLabel}
          ingredients={ingredients}
          onSelect={onSelectIngredient}
        />
      )}
    </div>
  );
}

function IngredientSearchPicker({
  label,
  ingredients,
  onSelect,
}: {
  label: string;
  ingredients: IngredientPickerOption[];
  onSelect: (ingredientId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    traceIngredientPickerOptionsStage("06_component_props_received", ingredients, {
      component: "IngredientSearchPicker",
    });
  }, [ingredients]);

  const canonicalOptions = useMemo(
    () => dedupeIngredientPickerOptionsById(ingredients),
    [ingredients],
  );

  useEffect(() => {
    traceIngredientPickerOptionsStage("07_component_pre_render_dedupe", canonicalOptions, {
      component: "IngredientSearchPicker",
    });
  }, [canonicalOptions]);

  const sorted = useMemo(
    () => [...canonicalOptions].sort((a, b) => a.name.localeCompare(b.name)),
    [canonicalOptions],
  );

  useEffect(() => {
    traceIngredientPickerOptionsStage("08_cmdk_render_rows", sorted, {
      component: "IngredientSearchPicker",
      commandValues: sorted.map((row) => ingredientPickerCommandValue(row)),
      note: "Sorted rows passed to CommandItem; value prop is ingredient id",
    });
  }, [sorted]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={correctionButtonClass}
          aria-expanded={open}
        >
          <Search className="h-3 w-3" />
          {label}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-0" align="start">
        <Command>
          <CommandInput placeholder="Search ingredients…" className="h-9" />
          <CommandList>
            <CommandEmpty>No ingredient found.</CommandEmpty>
            <CommandGroup>
              {sorted.map((row) => (
                <CommandItem
                  key={row.id}
                  value={ingredientPickerCommandValue(row)}
                  keywords={row.searchKeywords}
                  onSelect={() => {
                    onSelect(row.id);
                    setOpen(false);
                  }}
                >
                  {row.name}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
