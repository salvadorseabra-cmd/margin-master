import type { ValidationEvidence, ValidationFinding } from "@/lib/invoice-validation/types";
import {
  groupPresentedEvidence,
  presentEvidence,
  type ComparisonTone,
  type EvidenceEmphasis,
  type PresentedEvidenceRow,
} from "@/lib/invoice-validation/present-evidence";
import { presentFindingCopy } from "@/lib/invoice-validation/finding-copy";

function emphasisValueClass(emphasis: EvidenceEmphasis): string {
  switch (emphasis) {
    case "strong":
      return "font-semibold text-foreground";
    case "medium":
      return "font-medium text-foreground";
    case "muted":
      return "text-muted-foreground/80";
    case "normal":
    default:
      return "text-foreground";
  }
}

function emphasisLabelClass(emphasis: EvidenceEmphasis): string {
  if (emphasis === "muted") return "text-muted-foreground/70";
  return "text-muted-foreground";
}

function comparisonValueClass(tone: ComparisonTone): string {
  switch (tone) {
    case "invoice":
      return "font-medium text-green-600 dark:text-green-500";
    case "calculated":
      return "font-semibold text-red-600 dark:text-red-500";
    case "difference":
      return "font-bold text-orange-600 dark:text-orange-500";
  }
}

function ProblemComparisonBlock({ rows }: { rows: readonly PresentedEvidenceRow[] }) {
  if (rows.length === 0) return null;

  return (
    <div className="space-y-1">
      {rows.map((row, index) => (
        <div key={`${row.label}-${index}`}>
          {index > 0 ? (
            <p className="py-0.5 text-center text-[10px] leading-none text-muted-foreground/60">
              ↓
            </p>
          ) : null}
          <div className="space-y-0.5">
            <p className="text-[11px] leading-snug text-muted-foreground">{row.label}</p>
            <p
              className={`break-words text-[11px] leading-snug ${
                row.comparisonTone
                  ? comparisonValueClass(row.comparisonTone)
                  : emphasisValueClass(row.emphasis)
              }`}
            >
              {row.value}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}

function EvidenceSectionBlock({
  title,
  rows,
}: {
  title: string;
  rows: readonly PresentedEvidenceRow[];
}) {
  if (rows.length === 0) return null;

  return (
    <div className="space-y-1.5">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </p>
      <dl className="space-y-1">
        {rows.map((row, index) => (
          <div
            key={`${row.label}-${index}`}
            className="grid grid-cols-[minmax(5.5rem,auto)_1fr] gap-x-2.5 gap-y-0.5"
          >
            <dt className={`text-[11px] leading-snug ${emphasisLabelClass(row.emphasis)}`}>
              {row.label}
            </dt>
            <dd className={`break-words text-[11px] leading-snug ${emphasisValueClass(row.emphasis)}`}>
              {row.value}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export function ValidationEvidenceRenderer({ evidence }: { evidence: ValidationEvidence }) {
  const grouped = groupPresentedEvidence(presentEvidence(evidence));
  const hasRows =
    grouped.problem.length > 0 || grouped.why.length > 0 || grouped.detail.length > 0;
  if (!hasRows) return null;

  return (
    <div className="space-y-3 border-t border-border/60 pt-2.5">
      {grouped.problem.length > 0 ? (
        <div className="space-y-1.5">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Problem
          </p>
          <ProblemComparisonBlock rows={grouped.problem} />
        </div>
      ) : null}
      <EvidenceSectionBlock title="Why" rows={grouped.why} />
      <EvidenceSectionBlock title="Details" rows={grouped.detail} />
    </div>
  );
}

export function ValidationFindingRenderer({ finding }: { finding: ValidationFinding }) {
  const copy = presentFindingCopy(finding);

  return (
    <div className="space-y-2.5 text-xs leading-relaxed">
      <div className="space-y-1">
        <p className="font-semibold text-foreground">{copy.title}</p>
        {copy.description ? <p className="text-muted-foreground">{copy.description}</p> : null}
      </div>
      {finding.evidence ? <ValidationEvidenceRenderer evidence={finding.evidence} /> : null}
      {copy.suggestedAction ? (
        <div className="space-y-1 border-t border-border/60 pt-2.5">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Suggested review
          </p>
          <p className="text-[11px] text-foreground">{copy.suggestedAction}</p>
        </div>
      ) : null}
    </div>
  );
}
