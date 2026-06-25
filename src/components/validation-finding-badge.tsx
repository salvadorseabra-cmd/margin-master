import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { ValidationFindingRenderer } from "@/lib/invoice-validation/render-finding";
import type { ValidationFinding } from "@/lib/invoice-validation/types";
import {
  validationFindingBadgeLabel,
  validationFindingBadgeTone,
  type ValidationFindingBadgeTone,
} from "@/lib/invoice-validation/presentation";

function badgeToneClass(tone: ValidationFindingBadgeTone): string {
  switch (tone) {
    case "review":
      return "border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-300";
    case "success":
      return "border-success/20 bg-success/10 text-success/80";
    case "increase":
      return "border-destructive/20 bg-destructive/10 text-destructive/80";
    case "muted":
    default:
      return "border-border bg-muted/40 text-muted-foreground";
  }
}

export function ValidationFindingBadge({ finding }: { finding: ValidationFinding }) {
  const tone = validationFindingBadgeTone(finding);
  const label = validationFindingBadgeLabel(finding);

  return (
    <HoverCard openDelay={200} closeDelay={100}>
      <HoverCardTrigger asChild>
        <span
          className={`cursor-default rounded-full border px-2 py-0.5 text-[11px] font-medium leading-none ${badgeToneClass(tone)}`}
        >
          {label}
        </span>
      </HoverCardTrigger>
      <HoverCardContent align="start" className="w-80 p-3.5">
        <ValidationFindingRenderer finding={finding} />
      </HoverCardContent>
    </HoverCard>
  );
}
