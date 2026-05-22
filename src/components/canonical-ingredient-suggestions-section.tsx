import { Loader2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import {
  generateCanonicalNamingSuggestion,
  type CanonicalNamingSuggestion,
} from "@/lib/canonical-ingredient-quality";
import {
  dismissCanonicalSuggestion,
  loadCanonicalSuggestionUserPrefs,
  markIntentionalCanonicalName,
  shouldHideCanonicalNameSuggestion,
} from "@/lib/canonical-ingredient-quality-storage";
import { loadIngredientOperationalProfile } from "@/lib/ingredient-operational-intelligence";
import type { Tables } from "@/integrations/supabase/types";

type IngredientRow = Pick<Tables<"ingredients">, "id" | "name" | "normalized_name">;

type Props = {
  ingredient: IngredientRow;
  userId: string | undefined;
  catalog: IngredientRow[];
  onRename: (ingredientId: string, suggestedName: string) => void;
};

function confidenceLabel(confidence: CanonicalNamingSuggestion["confidence"]): string {
  if (confidence === "high") return "High confidence";
  if (confidence === "medium") return "Medium confidence";
  return "Low confidence";
}

function kindLabel(kind: CanonicalNamingSuggestion["kind"]): string {
  return kind === "lexical_cleanup" ? "Lexical cleanup" : "Semantic equivalence";
}

export function CanonicalIngredientSuggestionsSection({
  ingredient,
  userId,
  catalog,
  onRename,
}: Props) {
  const [loading, setLoading] = useState(true);
  const [hidden, setHidden] = useState(false);
  const [aliasNames, setAliasNames] = useState<string[]>([]);
  const [invoiceAliasNames, setInvoiceAliasNames] = useState<string[]>([]);
  const [prefsVersion, setPrefsVersion] = useState(0);

  const ingredientId = ingredient.id;

  useEffect(() => {
    if (!userId?.trim()) {
      setHidden(false);
      return;
    }
    setHidden(shouldHideCanonicalNameSuggestion(userId, ingredientId));
  }, [userId, ingredientId, prefsVersion]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void (async () => {
      const profile = await loadIngredientOperationalProfile(supabase, ingredientId);
      if (cancelled) return;
      const aliases = (profile?.aliases ?? []).map((row) => row.aliasName.trim()).filter(Boolean);
      const invoiceLines = (profile?.aliases ?? [])
        .map((row) => row.sampleInvoiceLine?.name?.trim())
        .filter((name): name is string => Boolean(name));
      setAliasNames(aliases);
      setInvoiceAliasNames(invoiceLines);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [ingredientId]);

  const suggestion = useMemo(() => {
    if (hidden || loading) return null;
    return generateCanonicalNamingSuggestion({
      ingredient,
      aliasNames,
      invoiceAliasNames,
      catalog,
    });
  }, [hidden, loading, ingredient, aliasNames, invoiceAliasNames, catalog]);

  if (hidden || loading) {
    if (loading && !hidden) {
      return (
        <section className="mt-2 rounded-lg border border-dashed border-border/70 bg-muted/5 p-2.5">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Checking canonical name quality…
          </div>
        </section>
      );
    }
    return null;
  }

  if (!suggestion) return null;

  const handleDismiss = () => {
    if (!userId?.trim()) return;
    dismissCanonicalSuggestion(userId, ingredientId);
    loadCanonicalSuggestionUserPrefs(userId);
    setHidden(true);
    setPrefsVersion((v) => v + 1);
  };

  const handleIntentional = () => {
    if (!userId?.trim()) return;
    markIntentionalCanonicalName(userId, ingredientId);
    setHidden(true);
    setPrefsVersion((v) => v + 1);
  };

  return (
    <section
      id="canonical-ingredient-suggestions"
      className="mt-2 rounded-lg border border-warning/25 bg-warning/5 p-2.5"
    >
      <div className="text-sm font-semibold">Suggested canonical improvements</div>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
        Rename only — invoice aliases stay on this ingredient. No automatic merge.
      </p>

      <div className="mt-3 space-y-2 text-sm">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <span className="text-xs text-muted-foreground">Current</span>
          <span className="font-medium">{suggestion.currentName}</span>
        </div>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <span className="text-xs text-muted-foreground">Suggested</span>
          <span className="font-medium text-foreground">{suggestion.suggestedName}</span>
        </div>
        <div className="flex flex-wrap gap-2 pt-0.5">
          <span className="rounded-md border border-border/60 bg-background/50 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
            {confidenceLabel(suggestion.confidence)}
          </span>
          <span className="rounded-md border border-border/60 bg-background/50 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
            {kindLabel(suggestion.kind)}
          </span>
        </div>
      </div>

      {suggestion.reasons.length > 0 && (
        <ul className="mt-3 list-disc space-y-0.5 pl-4 text-xs text-muted-foreground marker:text-muted-foreground/60">
          {suggestion.reasons.map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          onClick={() => onRename(ingredientId, suggestion.suggestedName)}
        >
          Rename
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={handleDismiss}>
          Ignore
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={handleIntentional}>
          Mark intentional
        </Button>
      </div>
    </section>
  );
}
