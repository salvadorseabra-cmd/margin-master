import type { ValidationEvidence, ValidationEvidenceValue } from "@/lib/invoice-validation/types";

export function formatEvidenceScalar(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return String(value);
    if (Number.isInteger(value)) return String(value);
    const rounded = Math.round(value * 100) / 100;
    return String(rounded);
  }
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function formatWithUnit(formatted: string, unit: string): string {
  const normalized = unit.toUpperCase();
  if (normalized === "EUR") return `€${formatted}`;
  if (normalized === "EUR/KG") return `€${formatted}/kg`;
  if (normalized === "EUR/L") return `€${formatted}/L`;
  if (normalized === "KG") return `${formatted} kg`;
  if (normalized === "L") return `${formatted} L`;
  return `${formatted} ${unit}`;
}

export function formatEvidenceValue(value: ValidationEvidenceValue): string {
  const formatted = formatEvidenceScalar(value.value);
  return value.unit ? formatWithUnit(formatted, value.unit) : formatted;
}

export function formatEvidenceDifferenceAbsolute(
  value: number,
  evidence?: ValidationEvidence,
): string {
  const formatted = formatEvidenceScalar(value);
  const unit = evidence?.expected?.unit ?? evidence?.actual?.unit;
  if (unit === "EUR" || unit === "EUR/kg" || unit === "EUR/L") {
    return `€${formatted}`;
  }
  return formatted;
}

export function formatEvidenceDifferencePercent(value: number): string {
  return `${formatEvidenceScalar(value)}%`;
}
