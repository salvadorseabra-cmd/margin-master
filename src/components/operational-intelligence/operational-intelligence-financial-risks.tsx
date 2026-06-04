import { OwnerRowLink } from "@/components/operational-intelligence/operational-intelligence-owner-row-link";
import { operationalMovementTones } from "@/components/operational-intelligence/operational-intelligence-tones";
import type { OwnerReviewRow } from "@/lib/operational-intelligence-synthesis";

type OperationalIntelligenceFinancialRisksProps = {
  rows: OwnerReviewRow[];
};

export function OperationalIntelligenceFinancialRisks({
  rows,
}: OperationalIntelligenceFinancialRisksProps) {
  if (rows.length === 0) {
    return (
      <p className="rounded-xl border border-border/60 bg-muted/[0.03] px-3 py-2.5 text-xs text-muted-foreground">
        No material negative cost changes detected this period.
      </p>
    );
  }

  const tone = operationalMovementTones.risk;

  return (
    <ul className="space-y-2">
      {rows.map((row) => (
        <li
          key={row.id}
          className={`rounded-xl border px-3 py-2.5 ${tone.surface} ${tone.border} border-l-2 ${tone.accent}`}
        >
          <div className="flex items-baseline justify-between gap-3">
            <OwnerRowLink
              title={row.title}
              target={row.target}
              ingredientId={row.ingredientId}
              recipeId={row.recipeId}
              supplierName={row.supplierName}
            />
            {row.impactLine ? (
              <span className={`shrink-0 text-xs font-medium tabular-nums ${tone.label}`}>
                {row.impactLine}
              </span>
            ) : null}
          </div>
          <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">{row.whatChanged}</p>
        </li>
      ))}
    </ul>
  );
}
