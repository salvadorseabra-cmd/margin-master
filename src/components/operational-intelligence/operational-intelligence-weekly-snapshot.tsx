import { formatCurrency } from "@/lib/display-format";
import type { OwnerReviewWeeklySnapshot } from "@/lib/operational-intelligence-synthesis";

type OperationalIntelligenceWeeklySnapshotProps = {
  snapshot: OwnerReviewWeeklySnapshot;
};

function KpiCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border/60 bg-muted/[0.03] px-3 py-2.5">
      <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-0.5 text-lg font-medium tabular-nums tracking-tight text-foreground">
        {value}
      </p>
    </div>
  );
}

export function OperationalIntelligenceWeeklySnapshot({
  snapshot,
}: OperationalIntelligenceWeeklySnapshotProps) {
  return (
    <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
      <KpiCard label="Supplier increases" value={String(snapshot.supplierIncreases)} />
      <KpiCard
        label="Est. monthly impact"
        value={
          snapshot.monthlyImpactEur >= 1
            ? `+${formatCurrency(snapshot.monthlyImpactEur)}/mo`
            : formatCurrency(0)
        }
      />
      <KpiCard label="Supplier decreases" value={String(snapshot.supplierDecreases)} />
      <KpiCard label="Prices needing refresh" value={String(snapshot.pricesNeedingRefresh)} />
    </div>
  );
}
