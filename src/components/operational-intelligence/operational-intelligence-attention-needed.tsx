import { OwnerRowLink } from "@/components/operational-intelligence/operational-intelligence-owner-row-link";
import { operationalMovementTones } from "@/components/operational-intelligence/operational-intelligence-tones";
import type { AttentionRow } from "@/lib/operational-intelligence-synthesis";

type OperationalIntelligenceAttentionNeededProps = {
  rows: AttentionRow[];
};

export function OperationalIntelligenceAttentionNeeded({
  rows,
}: OperationalIntelligenceAttentionNeededProps) {
  if (rows.length === 0) {
    return (
      <p className="rounded-xl border border-border/60 bg-muted/[0.03] px-3 py-2.5 text-xs text-muted-foreground">
        No pricing confirmations or catalog reviews pending.
      </p>
    );
  }

  const tone = operationalMovementTones.info;

  return (
    <ul className="space-y-1.5">
      {rows.map((row) => (
        <li
          key={row.id}
          className={`rounded-lg border px-2.5 py-2 ${tone.surface} ${tone.border}`}
        >
          <OwnerRowLink
            title={row.title}
            target={row.target}
            ingredientId={row.ingredientId}
            className="text-xs"
          />
          <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">{row.detail}</p>
        </li>
      ))}
    </ul>
  );
}
