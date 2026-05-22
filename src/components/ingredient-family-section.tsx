import { ChevronDown, Loader2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { supabase } from "@/integrations/supabase/client";
import {
  classifyIngredientFamily,
  findRelatedByFamily,
  type IngredientFamilyClassification,
} from "@/lib/ingredient-family";
import { loadIngredientOperationalProfile } from "@/lib/ingredient-operational-intelligence";
import type { Tables } from "@/integrations/supabase/types";

type IngredientRow = Pick<Tables<"ingredients">, "id" | "name" | "normalized_name">;

type Props = {
  ingredient: IngredientRow;
  userId: string | undefined;
  catalog: IngredientRow[];
  onSelectRelated: (ingredientId: string) => void;
};

function confidenceLabel(confidence: IngredientFamilyClassification["confidence"]): string {
  if (confidence === "high") return "High";
  if (confidence === "medium") return "Medium";
  return "Low";
}

export function IngredientFamilySection({
  ingredient,
  userId,
  catalog,
  onSelectRelated,
}: Props) {
  const [loading, setLoading] = useState(true);
  const [aliasNames, setAliasNames] = useState<string[]>([]);
  const [open, setOpen] = useState(false);

  const ingredientId = ingredient.id;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void (async () => {
      const profile = await loadIngredientOperationalProfile(supabase, ingredientId);
      if (cancelled) return;
      const aliases = (profile?.aliases ?? []).map((row) => row.aliasName.trim()).filter(Boolean);
      setAliasNames(aliases);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [ingredientId]);

  const classification = useMemo(() => {
    if (loading) return null;
    return classifyIngredientFamily({
      ingredient,
      catalog,
      aliasRows: aliasNames.map((aliasName) => ({ aliasName })),
      userId,
    });
  }, [loading, ingredient, catalog, aliasNames, userId]);

  const related = useMemo(() => {
    if (!classification) return [];
    return findRelatedByFamily(catalog, classification.familyId, ingredientId);
  }, [classification, catalog, ingredientId]);

  if (loading) {
    return (
      <section className="mt-2 rounded-lg border border-dashed border-border/70 bg-muted/5 px-3 py-2">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Detecting ingredient family…
        </div>
      </section>
    );
  }

  if (!classification) return null;

  const summaryParts = [
    classification.label,
    confidenceLabel(classification.confidence),
    related.length > 0 ? `${related.length} related` : null,
  ].filter(Boolean);

  return (
    <section id="ingredient-family-section" className="mt-2 rounded-lg border border-border/70 bg-muted/10">
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger className="flex w-full items-center gap-2 px-3 py-2 text-left">
          <ChevronDown
            className={`h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
          />
          <div className="min-w-0 flex-1">
            <div className="text-xs font-semibold">Operational family</div>
            <div className="mt-0.5 truncate text-[11px] text-muted-foreground">
              {summaryParts.join(" · ")}
            </div>
          </div>
        </CollapsibleTrigger>
        <CollapsibleContent className="border-t border-border/60 px-3 pb-3 pt-2">
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            Grouping for cost review only — each variant keeps its own catalog id.
          </p>

          {classification.reasons.length > 0 && (
            <ul className="mt-2 list-disc space-y-0.5 pl-4 text-[11px] text-muted-foreground marker:text-muted-foreground/60">
              {classification.reasons.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          )}

          {related.length > 0 && (
            <div className="mt-2">
              <div className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                Related in catalog
              </div>
              <ul className="mt-1 space-y-0.5">
                {related.map((entry) => (
                  <li key={entry.id}>
                    <button
                      type="button"
                      onClick={() => onSelectRelated(entry.id)}
                      className="text-xs font-medium text-foreground underline-offset-2 transition-colors hover:text-primary hover:underline"
                    >
                      {entry.displayName}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </CollapsibleContent>
      </Collapsible>
    </section>
  );
}
