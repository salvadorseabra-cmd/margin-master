import type {
  OperationalDecisionTier,
  OperationalInsightPriority,
  OperationalTrendExposureDetail,
} from "@/lib/operational-intelligence-synthesis";
import { OPERATIONAL_DECISION_TIER_LABELS } from "@/lib/operational-intelligence-synthesis";

export type OperationalPriorityTone = {
  badge: string;
  border: string;
  dot: string;
  surface: string;
  text: string;
};

/** Shared priority palette — calm surfaces, chip accents (not alarm containers). */
export const operationalPriorityTones: Record<OperationalInsightPriority, OperationalPriorityTone> = {
  critical: {
    badge: "bg-rose-500/8 text-rose-900/90 border-rose-500/15 dark:text-rose-200",
    border: "border-border/60",
    dot: "bg-rose-500/70",
    surface: "border-border/60 bg-muted/[0.04]",
    text: "text-rose-900/90 dark:text-rose-200",
  },
  warning: {
    badge: "bg-amber-500/8 text-amber-950/90 border-amber-500/15 dark:text-amber-200",
    border: "border-border/60",
    dot: "bg-amber-500/70",
    surface: "border-border/60 bg-muted/[0.04]",
    text: "text-amber-950/90 dark:text-amber-200",
  },
  monitor: {
    badge: "bg-blue-500/8 text-blue-950/90 border-blue-500/15 dark:text-blue-200",
    border: "border-border/60",
    dot: "bg-blue-500/60",
    surface: "border-border/60 bg-muted/[0.04]",
    text: "text-blue-950/90 dark:text-blue-200",
  },
  informational: {
    badge: "bg-muted/60 text-muted-foreground border-border/50",
    border: "border-border/60",
    dot: "bg-muted-foreground/40",
    surface: "border-border/60 bg-muted/[0.03]",
    text: "text-muted-foreground",
  },
};

export const operationalMovementTones = {
  risk: {
    border: "border-border/60",
    surface: "border-border/60 bg-muted/[0.04]",
    label: "text-rose-900/80 dark:text-rose-200/90",
    accent: "border-l-rose-500/35",
  },
  recovery: {
    border: "border-border/60",
    surface: "border-border/60 bg-muted/[0.04]",
    label: "text-emerald-800/90 dark:text-emerald-300/90",
    accent: "border-l-emerald-500/35",
  },
  watch: {
    border: "border-border/60",
    surface: "border-border/60 bg-muted/[0.04]",
    label: "text-amber-950/85 dark:text-amber-200/90",
    accent: "border-l-amber-500/30",
  },
  stable: {
    border: "border-border/60",
    surface: "border-border/60 bg-muted/[0.03]",
    label: "text-muted-foreground",
    accent: "border-l-border/80",
  },
  info: {
    border: "border-border/60",
    surface: "border-border/60 bg-muted/[0.04]",
    label: "text-blue-950/85 dark:text-blue-200/90",
    accent: "border-l-blue-500/25",
  },
} as const;

export const operationalDecisionTierTones: Record<
  OperationalDecisionTier,
  OperationalPriorityTone & { emphasis: string }
> = {
  now: {
    badge: "bg-rose-500/8 text-rose-900/90 border-rose-500/15 dark:text-rose-200",
    border: "border-border/60 border-l-2 border-l-rose-500/35",
    dot: "bg-rose-500/70",
    surface: "border-border/60 bg-card/40",
    text: "text-rose-900/90 dark:text-rose-200",
    emphasis: "",
  },
  monitor: {
    badge: "bg-amber-500/8 text-amber-950/90 border-amber-500/15 dark:text-amber-200",
    border: "border-border/60 border-l-2 border-l-amber-500/30",
    dot: "bg-amber-500/70",
    surface: "border-border/60 bg-card/40",
    text: "text-amber-950/90 dark:text-amber-200",
    emphasis: "",
  },
  background: {
    badge: "bg-muted/50 text-muted-foreground border-border/50",
    border: "border-border/60",
    dot: "bg-muted-foreground/35",
    surface: "border-border/60 bg-muted/[0.02]",
    text: "text-muted-foreground",
    emphasis: "",
  },
};

/** Compact operational fact badges on trend metric rows. */
export const operationalTrendBadgeTones: Record<string, string> = {
  "HIGH EXPOSURE": "bg-rose-500/8 text-rose-900/90 border-rose-500/15 dark:text-rose-200",
  "HIGH DEPENDENCY": "bg-amber-500/8 text-amber-950/90 border-amber-500/15 dark:text-amber-200",
  "STALE PRICE": "bg-violet-500/8 text-violet-950/90 border-violet-500/15 dark:text-violet-200",
  "SUPPLIER CONCENTRATION": "bg-orange-500/8 text-orange-950/90 border-orange-500/15 dark:text-orange-200",
  "PRICE CONFIDENCE LOW": "bg-slate-500/8 text-slate-800/90 border-slate-500/15 dark:text-slate-200",
};

export const operationalExposureRiskTones: Record<
  OperationalTrendExposureDetail["riskLevel"],
  string
> = {
  HIGH: "text-rose-900/90 dark:text-rose-200",
  MEDIUM: "text-amber-950/90 dark:text-amber-200",
  LOW: "text-muted-foreground",
};

export const operationalSectionLayout = {
  page: "space-y-5 sm:space-y-6",
  section: "space-y-3",
  sectionHeader: "space-y-0.5 border-b border-border/40 pb-3",
  sectionTitle: "text-sm font-medium tracking-tight text-foreground",
  sectionLead: "text-xs leading-relaxed text-muted-foreground",
  primary: "space-y-5 sm:space-y-6",
  primaryBlocks: "space-y-4",
  secondary: "space-y-3 border-t border-border/40 pt-8",
  calm: "space-y-1.5",
} as const;

export function operationalDecisionTierLabel(tier: OperationalDecisionTier): string {
  return OPERATIONAL_DECISION_TIER_LABELS[tier];
}

export function operationalPriorityLabel(priority: OperationalInsightPriority): string {
  if (priority === "critical") return "Focus";
  if (priority === "warning") return "Attention";
  if (priority === "monitor") return "Watch";
  return "Info";
}

export function truncateOperationalText(text: string, maxLength = 96): string {
  const trimmed = text.trim();
  if (trimmed.length <= maxLength) return trimmed;
  return `${trimmed.slice(0, maxLength - 3).trimEnd()}...`;
}

export function firstOperationalSentence(text: string, maxLength = 110): string {
  const first = text.split(/[.!?]/)[0]?.trim() ?? text.trim();
  return truncateOperationalText(first, maxLength);
}
