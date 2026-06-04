import { OwnerRowLink } from "@/components/operational-intelligence/operational-intelligence-owner-row-link";
import type { AffectedRecipeRow } from "@/lib/operational-intelligence-synthesis";

type OperationalIntelligenceAffectedRecipesProps = {
  rows: AffectedRecipeRow[];
};

export function OperationalIntelligenceAffectedRecipes({
  rows,
}: OperationalIntelligenceAffectedRecipesProps) {
  if (rows.length === 0) {
    return (
      <p className="rounded-xl border border-border/60 bg-muted/[0.03] px-3 py-2.5 text-xs text-muted-foreground">
        No recipes with margin deterioration linked to ingredient increases.
      </p>
    );
  }

  return (
    <ul className="space-y-2">
      {rows.map((row) => (
        <li
          key={row.id}
          className="rounded-xl border border-border/60 bg-muted/[0.03] px-3 py-2.5"
        >
          <div className="flex items-baseline justify-between gap-3 text-xs leading-snug">
            <OwnerRowLink
              title={row.recipeName}
              target={row.target}
              recipeId={row.recipeId}
            />
            {row.impactLine ? (
              <span className="shrink-0 tabular-nums text-foreground/80">{row.impactLine}</span>
            ) : null}
          </div>
          <p className="mt-0.5 text-[11px] text-muted-foreground">{row.whatChanged}</p>
        </li>
      ))}
    </ul>
  );
}
