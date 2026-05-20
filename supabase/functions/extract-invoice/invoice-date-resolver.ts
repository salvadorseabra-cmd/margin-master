type DateCandidate = {
  value: string;
  label: string;
  normalizedLabel: string;
  order: number;
  proximity: number;
};

const ISSUE_LABEL_PRIORITY = new Map<string, number>([
  ["data", 0],
  ["data emissao", 1],
  ["data documento", 2],
  ["invoice date", 3],
]);

const DUE_LABELS = new Set<string>([
  "data de vencimento",
  "vencimento",
  "due date",
  "payment due",
  "pagamento",
]);

const DATE_PATTERN = /\b(\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{4}-\d{2}-\d{2})\b/;

function normalizeLabel(input: string): string {
  return input
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[_:.-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function looksLikeDate(input: string): boolean {
  return DATE_PATTERN.test(input.trim());
}

function readDateValue(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const match = trimmed.match(DATE_PATTERN);
  return match ? match[1] : null;
}

function computeProximity(label: string, source: string, date: string): number {
  const normalizedSource = normalizeLabel(source);
  const li = normalizedSource.indexOf(label);
  const di = normalizedSource.indexOf(normalizeLabel(date));
  if (li < 0 || di < 0) return Number.MAX_SAFE_INTEGER;
  return Math.abs(di - li);
}

function pushCandidate(
  out: DateCandidate[],
  label: string,
  rawValue: unknown,
  order: number,
  sourceForProximity?: string,
) {
  const value = readDateValue(rawValue);
  if (!value) return;
  const normalizedLabel = normalizeLabel(label);
  if (!normalizedLabel) return;
  out.push({
    value,
    label,
    normalizedLabel,
    order,
    proximity: sourceForProximity
      ? computeProximity(normalizedLabel, sourceForProximity, value)
      : Number.MAX_SAFE_INTEGER,
  });
}

function collectDateCandidates(payload: Record<string, unknown>): DateCandidate[] {
  const out: DateCandidate[] = [];
  let order = 0;
  const RESERVED_FALLBACK_KEYS = new Set(["invoice_date", "invoiceDate"]);

  for (const [key, value] of Object.entries(payload)) {
    if (RESERVED_FALLBACK_KEYS.has(key)) continue;

    if (Array.isArray(value)) {
      for (const entry of value) {
        if (!entry || typeof entry !== "object") continue;
        const record = entry as Record<string, unknown>;
        const label =
          (typeof record.label === "string" && record.label) ||
          (typeof record.name === "string" && record.name) ||
          (typeof record.key === "string" && record.key);
        const dateValue = record.value ?? record.date ?? record.text;
        if (label && dateValue != null) {
          pushCandidate(out, label, dateValue, order++, typeof dateValue === "string" ? dateValue : undefined);
        }
      }
      continue;
    }

    if (value && typeof value === "object") {
      for (const [nestedKey, nestedValue] of Object.entries(value as Record<string, unknown>)) {
        if (typeof nestedValue === "string" && looksLikeDate(nestedValue)) {
          pushCandidate(out, nestedKey, nestedValue, order++, nestedValue);
        }
      }
      continue;
    }

    if (typeof value === "string" && looksLikeDate(value)) {
      pushCandidate(out, key, value, order++, value);
    }
  }

  return out;
}

export function resolveIssueDateFromExtraction(
  payload: Record<string, unknown>,
  fallback: string | null,
): string | null {
  const candidates = collectDateCandidates(payload);

  const issueCandidates = candidates
    .filter((candidate) => ISSUE_LABEL_PRIORITY.has(candidate.normalizedLabel))
    .sort((a, b) => {
      const pa = ISSUE_LABEL_PRIORITY.get(a.normalizedLabel) ?? Number.MAX_SAFE_INTEGER;
      const pb = ISSUE_LABEL_PRIORITY.get(b.normalizedLabel) ?? Number.MAX_SAFE_INTEGER;
      if (pa !== pb) return pa - pb;
      if (a.proximity !== b.proximity) return a.proximity - b.proximity;
      return a.order - b.order;
    });

  if (issueCandidates.length > 0) {
    return issueCandidates[0].value;
  }

  const blockedFallback = candidates.some(
    (candidate) =>
      DUE_LABELS.has(candidate.normalizedLabel) &&
      fallback != null &&
      readDateValue(fallback) === candidate.value,
  );
  if (blockedFallback) return null;

  return readDateValue(fallback) ?? null;
}
