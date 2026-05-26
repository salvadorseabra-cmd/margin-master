type OperationalIntelligenceExecutiveSummaryProps = {
  summary: string;
};

export function OperationalIntelligenceExecutiveSummary({
  summary,
}: OperationalIntelligenceExecutiveSummaryProps) {
  return (
    <section
      aria-labelledby="executive-summary-heading"
      className="rounded-xl border border-border/60 bg-muted/20 px-4 py-3"
    >
      <h2
        id="executive-summary-heading"
        className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"
      >
        Executive summary
      </h2>
      <p className="mt-1.5 text-sm font-medium leading-relaxed text-foreground">{summary}</p>
    </section>
  );
}
