import type { CalmOperationalSignal } from "@/lib/operational-intelligence-synthesis";

type OperationalIntelligenceCalmSignalsProps = {
  signal: CalmOperationalSignal;
};

export function OperationalIntelligenceCalmSignals({
  signal,
}: OperationalIntelligenceCalmSignalsProps) {
  if (signal.bullets.length === 0) return null;

  return (
    <section
      aria-labelledby="operational-calm-heading"
      className="rounded-lg border border-border/50 bg-muted/15 px-3 py-2.5"
    >
      <h2
        id="operational-calm-heading"
        className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground"
      >
        {signal.title}
      </h2>
      <ul className="mt-1.5 space-y-0.5">
        {signal.bullets.map((bullet) => (
          <li key={bullet} className="text-xs leading-relaxed text-muted-foreground">
            {bullet}
          </li>
        ))}
      </ul>
    </section>
  );
}
