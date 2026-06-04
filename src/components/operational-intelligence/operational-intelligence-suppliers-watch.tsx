import { useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  Collapsible,
  CollapsibleContent,
} from "@/components/ui/collapsible";
import { operationalMovementTones } from "@/components/operational-intelligence/operational-intelligence-tones";
import { formatPercent } from "@/lib/display-format";
import type { SupplierWatchRow } from "@/lib/operational-intelligence-synthesis";
import { ChevronDown } from "lucide-react";

type OperationalIntelligenceSuppliersWatchProps = {
  rows: SupplierWatchRow[];
  periodPhrase: string;
};

const changeTone = {
  up: operationalMovementTones.risk.label,
  down: operationalMovementTones.recovery.label,
  stable: operationalMovementTones.stable.label,
} as const;

function SupplierWatchRowItem({ row }: { row: SupplierWatchRow }) {
  const [open, setOpen] = useState(false);
  const hasChanges = row.ingredientChanges.length > 0;
  const tone = operationalMovementTones.watch;

  const header = (
    <>
      <div className="flex items-baseline justify-between gap-3 text-xs leading-snug">
        <Link
          to="/invoices"
          search={{ supplier: row.supplierName }}
          className="min-w-0 truncate font-medium text-foreground/90 underline-offset-2 hover:text-foreground hover:underline"
          onClick={(event) => event.stopPropagation()}
        >
          {row.title}
        </Link>
        <div className="flex shrink-0 flex-col items-end gap-0.5 text-right">
          {row.changeLine && row.changeLine !== row.title ? (
            <span className={`text-[11px] font-medium tabular-nums ${changeTone[row.direction]}`}>
              {row.changeLine}
            </span>
          ) : null}
          {row.impactLine ? (
            <span className="text-[11px] tabular-nums text-foreground/80">{row.impactLine}</span>
          ) : null}
        </div>
      </div>
      {row.secondary ? (
        <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">{row.secondary}</p>
      ) : null}
    </>
  );

  if (!hasChanges) {
    return <li className={`rounded-xl border px-3 py-2.5 ${tone.surface} ${tone.border}`}>{header}</li>;
  }

  return (
    <li className={`rounded-xl border px-3 py-2.5 ${tone.surface} ${tone.border}`}>
      <Collapsible open={open} onOpenChange={setOpen}>
        <button
          type="button"
          className="flex w-full items-start gap-2 text-left"
          aria-expanded={open}
        >
          <ChevronDown
            className={`mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
            aria-hidden
          />
          <div className="min-w-0 flex-1">{header}</div>
        </button>
        <CollapsibleContent>
          <ul className="mt-2 space-y-1 border-t border-border/40 pt-2 pl-5">
            {row.ingredientChanges.map((change) => (
              <li
                key={`${row.id}:${change.ingredientId}`}
                className="flex items-baseline justify-between gap-2 text-[11px]"
              >
                <Link
                  to="/ingredients"
                  search={{ ingredient: change.ingredientId }}
                  className="min-w-0 truncate text-foreground/85 underline-offset-2 hover:underline"
                >
                  {change.name}
                </Link>
                <span className="shrink-0 tabular-nums text-muted-foreground">
                  {change.changePct >= 0 ? "+" : ""}
                  {formatPercent(change.changePct)}
                  {change.priceLine ? ` · ${change.priceLine}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </CollapsibleContent>
      </Collapsible>
    </li>
  );
}

export function OperationalIntelligenceSuppliersWatch({
  rows,
  periodPhrase,
}: OperationalIntelligenceSuppliersWatchProps) {
  if (rows.length === 0) {
    return (
      <p className="rounded-xl border border-border/60 bg-muted/[0.03] px-3 py-2.5 text-xs text-muted-foreground">
        No supplier price movement to watch in {periodPhrase}.
      </p>
    );
  }

  return (
    <ul className="space-y-2">
      {rows.map((row) => (
        <SupplierWatchRowItem key={row.id} row={row} />
      ))}
    </ul>
  );
}
