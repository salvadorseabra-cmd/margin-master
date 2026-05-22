import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ActionableCanonicalNamingQueueEntry } from "@/lib/canonical-ingredient-naming-queue";
import type { CanonicalNamingSuggestion } from "@/lib/canonical-ingredient-quality";
import {
  dismissCanonicalSuggestion,
  loadCanonicalSuggestionUserPrefs,
  markIntentionalCanonicalName,
} from "@/lib/canonical-ingredient-quality-storage";

type Props = {
  queue: ActionableCanonicalNamingQueueEntry[];
  index: number;
  userId: string | undefined;
  onIndexChange: (index: number) => void;
  onExit: () => void;
  onRename: (ingredientId: string, suggestedName: string) => void;
  onQueueChanged: () => void;
};

function confidenceLabel(confidence: CanonicalNamingSuggestion["confidence"]): string {
  if (confidence === "high") return "High confidence";
  if (confidence === "medium") return "Medium confidence";
  return "Low confidence";
}

function kindLabel(kind: CanonicalNamingSuggestion["kind"]): string {
  return kind === "lexical_cleanup" ? "Lexical cleanup" : "Semantic equivalence";
}

export function CanonicalIngredientNamingReviewSection({
  queue,
  index,
  userId,
  onIndexChange,
  onExit,
  onRename,
  onQueueChanged,
}: Props) {
  const total = queue.length;
  const clampedIndex = total === 0 ? 0 : Math.min(Math.max(0, index), total - 1);
  const entry = queue[clampedIndex];
  const position = total === 0 ? 0 : clampedIndex + 1;

  if (!entry) {
    return (
      <section className="mt-2 rounded-lg border border-border/70 bg-muted/10 p-2.5">
        <div className="text-sm font-semibold">Naming review</div>
        <p className="mt-2 text-sm text-muted-foreground">No actionable naming improvements left.</p>
        <Button type="button" size="sm" variant="outline" className="mt-3" onClick={onExit}>
          Exit review
        </Button>
      </section>
    );
  }

  const { suggestion, ingredientId } = entry;

  const handleDismiss = () => {
    if (!userId?.trim()) return;
    dismissCanonicalSuggestion(userId, ingredientId);
    loadCanonicalSuggestionUserPrefs(userId);
    onQueueChanged();
  };

  const handleIntentional = () => {
    if (!userId?.trim()) return;
    markIntentionalCanonicalName(userId, ingredientId);
    onQueueChanged();
  };

  return (
    <section
      id="canonical-ingredient-naming-review"
      className="mt-2 rounded-lg border border-warning/25 bg-warning/5 p-2.5"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-sm font-semibold">Naming review</div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {position} of {total} — rename only, no automatic merge
          </p>
        </div>
        <Button type="button" size="sm" variant="ghost" onClick={onExit}>
          Exit review
        </Button>
      </div>

      <div className="mt-3 flex items-center justify-between gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={clampedIndex <= 0}
          onClick={() => onIndexChange(clampedIndex - 1)}
          aria-label="Previous ingredient"
        >
          <ChevronLeft className="h-4 w-4" />
          Prev
        </Button>
        <span className="text-xs font-medium tabular-nums text-muted-foreground">
          {position} / {total}
        </span>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={clampedIndex >= total - 1}
          onClick={() => onIndexChange(clampedIndex + 1)}
          aria-label="Next ingredient"
        >
          Next
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

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
