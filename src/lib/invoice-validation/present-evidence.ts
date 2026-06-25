import {
  formatEvidenceDifferenceAbsolute,
  formatEvidenceDifferencePercent,
  formatEvidenceScalar,
  formatEvidenceValue,
} from "@/lib/invoice-validation/format-evidence-value";
import { humanizeEvidenceKey } from "@/lib/invoice-validation/humanize-evidence-key";
import type { ValidationEvidence, ValidationEvidenceValue } from "@/lib/invoice-validation/types";

export type EvidenceSection = "problem" | "why" | "detail";

export type EvidenceEmphasis = "strong" | "medium" | "normal" | "muted";

/** Semantic tone for problem-section comparison rows (presentation only). */
export type ComparisonTone = "invoice" | "calculated" | "difference";

export type PresentedEvidenceRow = {
  label: string;
  value: string;
  section: EvidenceSection;
  emphasis: EvidenceEmphasis;
  comparisonTone?: ComparisonTone;
  sortOrder?: number;
};

const HIDDEN_EXTRA_KEYS = new Set(["check", "usable_quantity", "usable_quantity_unit", "field"]);

const WHY_EXTRA_KEYS = new Set([
  "structure_usable_kg",
  "purchased_weight_kg",
  "pack_structure",
  "quantity",
  "unit_price",
  "line_total",
  "ocr_quantity",
  "pass_c_quantity",
  "invoice_implied_cost",
  "item_name",
]);

const WHY_KEY_SORT_ORDER: Record<string, number> = {
  quantity: 1,
  purchased_weight_kg: 1,
  ocr_quantity: 1,
  pass_c_quantity: 1,
  pack_structure: 2,
  structure_usable_kg: 3,
  line_total: 4,
  total: 4,
  unit_price: 5,
  invoice_implied_cost: 5,
  item_name: 6,
};

const VALIDATOR_LABEL_OVERRIDES: Record<string, string> = {
  "Invoice operational cost": "Expected operational cost",
};

function shouldSkipExtraKey(key: string, extra: Record<string, unknown>): boolean {
  if (HIDDEN_EXTRA_KEYS.has(key)) return true;
  if (key === "quantity" && extra.purchased_weight_kg != null) return true;
  return false;
}

function normalizeExpectedActualLabel(
  role: "expected" | "actual",
  value: ValidationEvidenceValue,
): string {
  if (value.label) {
    const override = VALIDATOR_LABEL_OVERRIDES[value.label];
    if (override) return override;
    return value.label;
  }

  const unit = value.unit?.toUpperCase();
  if (unit === "EUR") {
    return role === "expected" ? "Calculated total" : "Invoice total";
  }
  if (unit === "EUR/KG" || unit === "EUR/L") {
    return role === "expected" ? "Expected operational cost" : "Calculated operational cost";
  }

  return role === "expected" ? "Expected" : "Actual";
}

function shouldSkipExpectedActual(value: ValidationEvidenceValue): boolean {
  return value.value === "present";
}

function formatPackStructure(value: unknown): string {
  if (!value || typeof value !== "object") return formatEvidenceScalar(value);

  const structure = value as {
    container_count?: number | null;
    container_unit?: string | null;
    package_quantity?: number | null;
    package_measurement_unit?: string | null;
  };

  const count = structure.container_count;
  const containerUnit = structure.container_unit?.trim();
  const packageQty = structure.package_quantity;
  const packageUnit = structure.package_measurement_unit?.trim();

  if (count != null && packageQty != null && packageUnit) {
    const unitLabel = containerUnit ?? "units";
    return `${count} ${unitLabel} × ${packageQty} ${packageUnit}`;
  }

  return formatEvidenceScalar(value);
}

function formatExtraValue(key: string, value: unknown, extra: Record<string, unknown>): string {
  if (key === "pack_structure") return formatPackStructure(value);

  if (key === "usable_quantity") {
    const unit = extra.usable_quantity_unit;
    if (typeof value === "number" && unit === "g") {
      const kg = Math.round((value / 1000) * 100) / 100;
      return `${kg} kg`;
    }
  }

  if (key === "purchased_weight_kg" && typeof value === "number") {
    return `${formatEvidenceScalar(value)} kg`;
  }

  if (key === "structure_usable_kg" && typeof value === "number") {
    return `${formatEvidenceScalar(value)} kg`;
  }

  if (key === "line_total" && typeof value === "number") {
    return `€${formatEvidenceScalar(value)}`;
  }

  if (key === "unit_price" && typeof value === "number") {
    return `€${formatEvidenceScalar(value)}`;
  }

  if (key === "total" && typeof value === "number") {
    return `€${formatEvidenceScalar(value)}`;
  }

  return formatEvidenceScalar(value);
}

function formatCombinedDifference(evidence: ValidationEvidence): string | null {
  const abs = evidence.difference?.absolute;
  const pct = evidence.difference?.percent;

  if (abs != null && pct != null) {
    return `${formatEvidenceDifferenceAbsolute(abs, evidence)} (${formatEvidenceDifferencePercent(pct)})`;
  }
  if (abs != null) return formatEvidenceDifferenceAbsolute(abs, evidence);
  if (pct != null) return formatEvidenceDifferencePercent(pct);
  return null;
}

function inferExtraSection(key: string): EvidenceSection {
  return WHY_EXTRA_KEYS.has(key) ? "why" : "detail";
}

function inferComparisonTone(
  role: "expected" | "actual",
  value: ValidationEvidenceValue,
): ComparisonTone {
  const label = value.label?.toLowerCase() ?? "";
  if (label.includes("calculated")) return "calculated";
  if (label.includes("invoice") || label.includes("expected")) return "invoice";

  const unit = value.unit?.toUpperCase();
  if (unit === "EUR") {
    return role === "expected" ? "calculated" : "invoice";
  }
  if (unit === "EUR/KG" || unit === "EUR/L") {
    return role === "expected" ? "invoice" : "calculated";
  }

  return role === "expected" ? "invoice" : "calculated";
}

function problemEmphasis(tone: ComparisonTone): EvidenceEmphasis {
  return tone === "difference" ? "strong" : tone === "calculated" ? "strong" : "medium";
}

function pushRow(
  rows: PresentedEvidenceRow[],
  row: Omit<PresentedEvidenceRow, "section" | "emphasis"> & {
    section?: EvidenceSection;
    emphasis?: EvidenceEmphasis;
  },
): void {
  rows.push({
    section: row.section ?? "detail",
    emphasis: row.emphasis ?? "normal",
    label: row.label,
    value: row.value,
    comparisonTone: row.comparisonTone,
    sortOrder: row.sortOrder,
  });
}

export function presentEvidence(evidence: ValidationEvidence): PresentedEvidenceRow[] {
  const rows: PresentedEvidenceRow[] = [];

  if (evidence.expected && !shouldSkipExpectedActual(evidence.expected)) {
    const tone = inferComparisonTone("expected", evidence.expected);
    pushRow(rows, {
      label: normalizeExpectedActualLabel("expected", evidence.expected),
      value: formatEvidenceValue(evidence.expected),
      section: "problem",
      emphasis: problemEmphasis(tone),
      comparisonTone: tone,
    });
  }
  if (evidence.actual && !shouldSkipExpectedActual(evidence.actual)) {
    const tone = inferComparisonTone("actual", evidence.actual);
    pushRow(rows, {
      label: normalizeExpectedActualLabel("actual", evidence.actual),
      value: formatEvidenceValue(evidence.actual),
      section: "problem",
      emphasis: problemEmphasis(tone),
      comparisonTone: tone,
    });
  }

  const differenceValue = formatCombinedDifference(evidence);
  if (differenceValue != null) {
    pushRow(rows, {
      label: "Difference",
      value: differenceValue,
      section: "problem",
      emphasis: problemEmphasis("difference"),
      comparisonTone: "difference",
    });
  }

  if (evidence.extra) {
    for (const [key, value] of Object.entries(evidence.extra)) {
      if (shouldSkipExtraKey(key, evidence.extra)) continue;
      const section = inferExtraSection(key);
      pushRow(rows, {
        label: humanizeEvidenceKey(key),
        value: formatExtraValue(key, value, evidence.extra),
        section,
        emphasis: section === "why" ? "normal" : "muted",
        sortOrder: WHY_KEY_SORT_ORDER[key],
      });
    }
  }

  return rows;
}

export function groupPresentedEvidence(rows: readonly PresentedEvidenceRow[]): {
  problem: PresentedEvidenceRow[];
  why: PresentedEvidenceRow[];
  detail: PresentedEvidenceRow[];
} {
  return {
    problem: rows.filter((row) => row.section === "problem"),
    why: rows
      .filter((row) => row.section === "why")
      .sort((a, b) => (a.sortOrder ?? 100) - (b.sortOrder ?? 100)),
    detail: rows.filter((row) => row.section === "detail"),
  };
}
