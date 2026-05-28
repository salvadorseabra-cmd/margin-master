import type {
  OperationalSnapshotSignal,
  OperationalSnapshotViewModel,
} from "@/lib/operational-intelligence-synthesis";
import type { PrioritizedOperationalInsight } from "@/lib/operational-intelligence-synthesis";
import {
  operationalPriorityTones,
  truncateOperationalText,
} from "@/components/operational-intelligence/operational-intelligence-tones";

type OperationalIntelligenceSnapshotProps = {
  snapshot: OperationalSnapshotViewModel;
  nowInsights?: PrioritizedOperationalInsight[];
  estimatedMarginPressureEur?: number;
};

const signalDotClass = {
  risk: operationalPriorityTones.critical.dot,
  watch: operationalPriorityTones.warning.dot,
  recovery: "bg-emerald-500/60",
  info: operationalPriorityTones.monitor.dot,
} as const;

const exposureChipClass = {
  risk: operationalPriorityTones.critical.badge,
  watch: operationalPriorityTones.warning.badge,
  recovery: "border border-emerald-500/15 bg-emerald-500/8 text-emerald-900/90 dark:text-emerald-200",
  info: operationalPriorityTones.informational.badge,
} as const;

/** Signals shown as center exposure chips (categories / plates / recipes). */
export const SNAPSHOT_CENTER_SIGNAL_IDS = new Set([
  "dominant-category",
  "plate-concentration",
  "recipes-deteriorating",
]);

export function partitionSnapshotSignals(signals: OperationalSnapshotSignal[]) {
  const center: OperationalSnapshotSignal[] = [];
  const supporting: OperationalSnapshotSignal[] = [];
  for (const signal of signals) {
    if (SNAPSHOT_CENTER_SIGNAL_IDS.has(signal.id)) {
      center.push(signal);
    } else {
      supporting.push(signal);
    }
  }
  return { center, supporting };
}

export function formatSnapshotExposureChip(signal: OperationalSnapshotSignal): string {
  if (signal.id === "dominant-category") {
    const category = signal.line.split("(")[0]?.trim();
    return truncateOperationalText(category || signal.line, 48);
  }
  return truncateOperationalText(signal.line, 64);
}

function InlineSignal({ signal }: { signal: OperationalSnapshotSignal }) {
  return (
    <span
      className="inline-flex min-w-0 max-w-full items-center gap-1.5 text-[11px] leading-snug"
      title={`${signal.label}: ${signal.line}`}
    >
      <span
        className={`h-1 w-1 shrink-0 rounded-full ${signalDotClass[signal.tone]}`}
        aria-hidden
      />
      <span className="shrink-0 text-muted-foreground">{signal.label}</span>
      <span className="min-w-0 text-foreground/80">{truncateOperationalText(signal.line, 88)}</span>
    </span>
  );
}

export function OperationalIntelligenceSnapshot({
  snapshot,
}: OperationalIntelligenceSnapshotProps) {
  const { center, supporting } = partitionSnapshotSignals(snapshot.signals);

  return (
    <section
      aria-labelledby="operational-snapshot-heading"
      className="rounded-xl border border-border/60 bg-muted/[0.03] p-3"
    >
      <div className="grid gap-3 md:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)_minmax(0,1fr)] md:gap-0">
        {/* Left — operational situation */}
        <div className="min-w-0 md:border-r md:border-border/50 md:pr-3">
          <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            Situation
          </p>
          <h2
            id="operational-snapshot-heading"
            className="mt-0.5 text-sm font-medium leading-snug tracking-tight text-foreground"
          >
            {snapshot.operationalTitle}
          </h2>
          <p
            className="mt-1 line-clamp-2 text-xs leading-snug text-foreground/85"
            title={snapshot.synthesisParagraph}
          >
            {snapshot.synthesisParagraph}
          </p>
        </div>

        {/* Center — affected categories / plates / recipes */}
        <div className="min-w-0 border-t border-border/50 pt-3 md:border-t-0 md:border-r md:px-3 md:pt-0">
          <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            Exposure
          </p>
          <ul className="mt-1.5 flex flex-wrap gap-1.5" aria-label="Affected categories and recipes">
            {center.map((signal) => (
              <li key={signal.id}>
                <span
                  className={`inline-block max-w-full rounded-md border px-2 py-0.5 text-[11px] leading-snug ${exposureChipClass[signal.tone]}`}
                  title={`${signal.label}: ${signal.line}`}
                  aria-label={`${signal.label}: ${signal.line}`}
                >
                  {formatSnapshotExposureChip(signal)}
                </span>
              </li>
            ))}
          </ul>
        </div>

        {/* Right — financial impact + recommendation */}
        <div className="min-w-0 border-t border-border/50 pt-3 md:border-t-0 md:pl-3 md:pt-0">
          <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            Impact & action
          </p>
          <p className="mt-0.5 text-sm font-medium tabular-nums tracking-tight text-foreground">
            {snapshot.pressureLine}
          </p>
          <p className="mt-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            Do next
          </p>
          <p className="mt-0.5 text-xs font-medium leading-snug text-foreground">
            {snapshot.keyTakeaway}
          </p>
        </div>
      </div>

      {/* Supporting signals — full lines, compact inline row */}
      {supporting.length > 0 ? (
        <div
          className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 border-t border-border/50 pt-2"
          role="list"
          aria-label="Operational signals"
        >
          {supporting.map((signal) => (
            <span key={signal.id} role="listitem" className="min-w-0">
              <InlineSignal signal={signal} />
            </span>
          ))}
        </div>
      ) : null}
    </section>
  );
}
