import { useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
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
import { cn } from "@/lib/utils";
import {
  recipeLinePickerCommandValue,
  recipeLinePickerSearchKeywords,
  type RecipeLinePickerOption,
} from "@/lib/recipe-line-picker-options";
import { formatPrepUnitCostLabel } from "@/lib/recipe-prep-cost";
import { formatIngredientPriceMetadataHierarchy } from "@/lib/pricing-source-presentation";

type RecipeLinePickerProps = {
  options: RecipeLinePickerOption[];
  value: string;
  prepUnitCostById?: Map<string, number | null>;
  prepYieldSubtitleById?: Map<string, string>;
  packagedLiquidSubtitleById?: Map<string, string>;
  operationalPriceSubtitleById?: Map<string, string>;
  onChange: (pickerValue: string) => void;
  onOpenChange?: (open: boolean) => void;
  disabled?: boolean;
  placeholder?: string;
};

export function RecipeLinePicker({
  options,
  value,
  prepUnitCostById,
  prepYieldSubtitleById,
  packagedLiquidSubtitleById,
  operationalPriceSubtitleById,
  onChange,
  onOpenChange,
  disabled,
  placeholder = "Choose ingredient or prep",
}: RecipeLinePickerProps) {
  const [open, setOpen] = useState(false);
  const selected = options.find((option) => option.pickerValue === value);

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    onOpenChange?.(nextOpen);
  };

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            "h-9 min-w-0 flex-1 justify-between px-3 font-normal",
            selected?.kind === "prep" && "border-border/80 bg-muted/30 text-muted-foreground",
          )}
        >
          <span className="flex min-w-0 items-center gap-2 truncate">
            {selected ? (
              <>
                <span className={cn("truncate", selected.kind === "prep" && "text-foreground/80")}>
                  {selected.name}
                </span>
                {selected.kind === "prep" ? (
                  <span className="shrink-0 rounded-full border border-border bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                    Prep
                  </span>
                ) : null}
              </>
            ) : (
              <span className="text-muted-foreground">{placeholder}</span>
            )}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[min(100vw-2rem,22rem)] p-0"
        align="start"
        onEscapeKeyDown={(event) => event.stopPropagation()}
      >
        <Command>
          <CommandInput placeholder="Search ingredients or prep…" className="h-9" />
          <CommandList>
            <CommandEmpty>No ingredient or prep found.</CommandEmpty>
            <CommandGroup>
              {options.map((option) => {
                const prepUnitCost =
                  option.kind === "prep" ? prepUnitCostById?.get(option.id) : undefined;
                const prepCostLabel =
                  prepUnitCost != null && prepUnitCost > 0
                    ? formatPrepUnitCostLabel(prepUnitCost, option.unit)
                    : null;
                const prepYieldSubtitle =
                  option.kind === "prep"
                    ? prepYieldSubtitleById?.get(option.id)
                    : undefined;
                const packagedLiquidSubtitle =
                  option.kind === "ingredient"
                    ? packagedLiquidSubtitleById?.get(option.id)
                    : undefined;
                const operationalPriceSubtitle =
                  option.kind === "ingredient"
                    ? operationalPriceSubtitleById?.get(option.id)
                    : undefined;

                return (
                  <CommandItem
                    key={option.pickerValue}
                    value={recipeLinePickerCommandValue(option)}
                    keywords={recipeLinePickerSearchKeywords(option)}
                    onSelect={() => {
                      onChange(option.pickerValue);
                      setOpen(false);
                    }}
                    className={cn(
                      option.kind === "prep" && "text-muted-foreground data-[selected=true]:text-foreground",
                    )}
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4 shrink-0",
                        value === option.pickerValue ? "opacity-100" : "opacity-0",
                      )}
                    />
                    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <div className="flex min-w-0 items-center gap-2">
                        <span
                          className={cn(
                            "truncate",
                            option.kind === "prep" ? "text-foreground/80" : "text-foreground",
                          )}
                        >
                          {option.name}
                        </span>
                        {option.kind === "prep" ? (
                          <span className="shrink-0 rounded-full border border-border bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                            Prep
                          </span>
                        ) : null}
                      </div>
                      {(() => {
                        if (option.kind === "ingredient") {
                          const metadata = formatIngredientPriceMetadataHierarchy({
                            provenanceLine: operationalPriceSubtitle ?? null,
                            packagedPackLine: packagedLiquidSubtitle ?? null,
                          });
                          if (!metadata.secondaryLine && !metadata.tertiaryLine) return null;
                          return (
                            <>
                              {metadata.secondaryLine ? (
                                <span className="max-w-full truncate text-xs tabular-nums text-muted-foreground">
                                  {metadata.secondaryLine}
                                </span>
                              ) : null}
                              {metadata.tertiaryLine ? (
                                <span className="max-w-full truncate text-[11px] tabular-nums text-muted-foreground/70">
                                  {metadata.tertiaryLine}
                                </span>
                              ) : null}
                            </>
                          );
                        }
                        const compactSubtitle =
                          prepYieldSubtitle ??
                          prepCostLabel ??
                          (option.kind === "prep" ? "Set batch output for unit cost" : null);
                        return compactSubtitle ? (
                          <span className="max-w-full truncate text-xs tabular-nums text-muted-foreground">
                            {compactSubtitle}
                          </span>
                        ) : null;
                      })()}
                    </div>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
