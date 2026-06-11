/**
 * Deterministic OCR line staging for invoice extraction (Continente, etc.).
 * Pure helpers — callers log with `[invoice-extract]`.
 */

/** NFD + strip combining marks so PÃO / Pão match PAO-style patterns. */
export function normalizeAccents(s: string): string {
  return s.normalize("NFD").replace(/\p{M}/gu, "");
}

/**
 * Lines matching bread product tokens must never be dropped as non-items
 * (accent-normalized; see task spec).
 */
export function lineMatchesBreadForceKeep(line: string): boolean {
  const n = normalizeAccents(line);
  return /\b(BRIOCHE|PAO|HAMBURGUER|PADARIA|FLORES)\b/i.test(n);
}

export function splitOcrIntoLines(text: string): string[] {
  return text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);
}

export type IgnoredLine = { line: string; reason: string };

export type LineFilterResult = {
  parsedLines: string[];
  ignoredLines: IgnoredLine[];
};

export type FilterNonItemLinesOptions = {
  /**
   * Bread / padaria receipts: keep obvious totals/IVA rules but skip the broad
   * "contains TOTAL" heuristic that can over-prune atypical layouts.
   */
  breadMode?: boolean;
};

/**
 * Drop obvious non-item lines (Continente-style receipts).
 * Case-insensitive; mix of line-start and contains rules.
 */
export function filterNonItemLines(
  lines: string[],
  options?: FilterNonItemLinesOptions,
): LineFilterResult {
  const parsedLines: string[] = [];
  const ignoredLines: IgnoredLine[] = [];

  for (const line of lines) {
    const reason = classifyIgnoredLine(line, options);
    if (reason) {
      ignoredLines.push({ line, reason });
    } else {
      parsedLines.push(line);
    }
  }

  return { parsedLines, ignoredLines };
}

function classifyIgnoredLine(line: string, options?: FilterNonItemLinesOptions): string | null {
  const t = line.trim();
  if (!t) return "empty";

  // Lines that look like barcodes / pure codes (no letters)
  if (!/[A-Za-zÀ-ÿ]/.test(t)) return "no letters";

  const u = t.toUpperCase();

  if (/\bMBWAY\b/.test(u)) return "MBWAY";
  if (/\bSUBTOTAL\b/.test(u)) return "SUBTOTAL";
  if (/\bIVA\b/.test(u)) return "IVA";
  if (/\bNIF\b/.test(u)) return "NIF";

  // Date / time header lines on PT receipts
  if (/\bDATA\b/.test(u) && t.length < 72) return "DATA";
  if (/\bHORA\b/.test(u) && t.length < 72) return "HORA";

  // TOTAL variants (footer / summary) — line-start first
  if (/^\s*TOTAL\b/i.test(t)) return "TOTAL line-start";
  if (/\bTOTAL\s+A\s+PAGAR\b/i.test(t)) return "TOTAL a pagar";
  if (/\bVALOR\s+TOTAL\b/i.test(t)) return "VALOR TOTAL";
  if (/\bTOTAL\s+EUR\b/i.test(t)) return "TOTAL EUR";

  // Never drop bread-like product lines (after unambiguous header/total rules)
  if (lineMatchesBreadForceKeep(t)) return null;

  if (!options?.breadMode) {
    if (/\bTOTAL\b/.test(u) && t.length < 90) return "TOTAL";
  }

  return null;
}
