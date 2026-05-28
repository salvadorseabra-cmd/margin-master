import type { OperationalSynthesisGroups } from "@/lib/operational-intelligence-synthesis";

type OperationalIntelligenceStableAreasProps = {
  stableOperationalAreas: OperationalSynthesisGroups["stableOperationalAreas"];
};

export function OperationalIntelligenceStableAreas({
  stableOperationalAreas,
}: OperationalIntelligenceStableAreasProps) {
  const categoryLines = stableOperationalAreas.categories
    .slice(0, 4)
    .map((row) => {
      const trendWord = row.trend === "down" ? "easing" : "stable";
      return `${row.label} ${trendWord}`;
    });

  if (categoryLines.length === 0) return null;

  return (
    <section
      aria-labelledby="stable-operational-areas-heading"
      className="border-t border-border/30 pt-3"
    >
      <p
        id="stable-operational-areas-heading"
        className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground/70"
      >
        Operationally calm this period
      </p>
      <p className="mt-0.5 text-xs text-muted-foreground/80">{categoryLines.join(" · ")}</p>
    </section>
  );
}
