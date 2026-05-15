/**
 * Padaria / bread counter receipts — deterministic parsing after relaxed staging.
 *
 * Acceptance pipeline (applied per line, in order):
 *
 * 1. **Reject** lines (skip, return nothing) if the accent-normalized line
 *    contains any blacklist token (case-insensitive):
 *    `Rua`, `Tel` (covers `Tel.`/`Tel:`), `Pagina` (← `Página`), `IBAN`,
 *    `Desconto`, `NIF`, `TOTAL`, `IVA`.
 *    These cover address / contact / totals / tax rows that must never be
 *    parsed as product rows, even if the upstream OCR filter let them
 *    through in `breadMode`.
 *
 * 2. **Continente fallback**: if the line cleanly matches the Continente
 *    `<name> <price>` shape via `parseContinenteLine`, accept it as-is.
 *    Continente-style rows do **not** require the padaria-specific keyword
 *    list (consistent with previous behaviour), but they ARE still subject
 *    to the blacklist in step 1.
 *
 * 3. **Structural check** (padaria-specific path): the line must contain
 *    **either**
 *      - a product code matching `\b[A-Z]{1,4}\d{3,6}\b` (e.g. `PA0001`), OR
 *      - a quantity + unit + euro group (e.g. `2 UN 3,45`, `1 KG 2.50`,
 *        PT locale decimals).
 *
 * 4. **Required signals**: the row must have ≥1 quantity, ≥1 price (€),
 *    AND ≥1 bread/product token from
 *    `Pão | Brioche | Hambúrguer/Hamburger | Sésamo/Sesamo | Rústico/Rustico | Batata`
 *    (accent-normalized like existing helpers).
 *
 * 5. **Validation score (0–100)** — only padaria-specific path:
 *      - has product code            → +25
 *      - has qty + unit + euro group → +30
 *      - has bread/product keyword   → +30
 *      - length in `[6, 160]`        → +15
 *    Threshold to accept: **score ≥ `PADARIA_ACCEPT_THRESHOLD` (60)**.
 *
 * Logging is intentionally minimal: at most `MAX_REJECT_LOGS` reject lines
 * per call are emitted under the existing `[invoice-extract]` prefix.
 */

import { parseContinenteLine, type ParsedItem } from "./parseContinente.ts";
import { normalizeAccents } from "./stages.ts";

/** Score at/above which a padaria-specific line is accepted as a product row. */
const PADARIA_ACCEPT_THRESHOLD = 60;

/** Maximum number of reject log lines emitted per `parsePadaria` invocation. */
const MAX_REJECT_LOGS = 3;

/** Phrases that disqualify a line outright (case-insensitive, accent-normalized). */
const REJECT_PATTERN = /\b(?:RUA|TEL|PAGINA|IBAN|DESCONTO|NIF|TOTAL|IVA)\b/i;

/** Padaria-style product code, e.g. `PA0001` (1–4 letters + 3–6 digits). */
const PRODUCT_CODE_PATTERN = /\b[A-Z]{1,4}\d{3,6}\b/i;

/**
 * Quantity + unit + euro amount on the same span (PT locale `,` or `.`),
 * e.g. `2 UN 3,45`, `1 KG 2.50`, `0,250 KG 1,80 €`. Allows up to ~12 chars
 * between the unit and the price to absorb OCR spacing artefacts.
 */
const QTY_UNIT_PRICE_PATTERN =
  /\b\d{1,4}(?:[.,]\d{1,3})?\s*(?:UN|UNID|UNIDADE|KG|L|ML|CX|DZ)\b[\s\S]{0,12}?\d{1,4}[.,]\d{1,2}\s*(?:€|EUR)?/i;

/** Bare quantity + unit token (independent of price). */
const QTY_UNIT_PATTERN =
  /\b\d{1,4}(?:[.,]\d{1,3})?\s*(?:UN|UNID|UNIDADE|KG|L|ML|CX|DZ)\b/i;

/** Standalone euro / decimal money token (PT locale). */
const PRICE_TOKEN_PATTERN = /\b\d{1,4}[.,]\d{1,2}\b\s*(?:€|EUR)?/i;

/** Bread / padaria product tokens (accent-normalized — see `normalizeAccents`). */
const BREAD_KEYWORD_PATTERN =
  /\b(?:PAO|BRIOCHE|HAMBURGUER|HAMBURGER|SESAMO|RUSTICO|BATATA)\b/i;

function parseEuropeanMoneyString(raw: string): number | null {
  let s = raw.replace(/\u20AC/g, " ").replace(/€/g, " ").replace(/EUR/gi, " ").replace(/\s+/g, " ").trim();
  if (!s) return null;
  const neg = /^\s*[-–—]/.test(s) || s.startsWith("-");
  s = s.replace(/^[-–—]\s*/, "").replace(/[^\d.,]/g, "");
  if (!s) return null;
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  let normalized: string;
  if (lastComma > lastDot) {
    normalized = s.replace(/\./g, "").replace(",", ".");
  } else if (lastDot > lastComma) {
    normalized = s.replace(/,/g, "");
  } else if (lastComma !== -1) {
    normalized = s.replace(",", ".");
  } else {
    normalized = s;
  }
  const n = Number(normalized);
  if (!Number.isFinite(n)) return null;
  return neg ? -n : n;
}

/** Looser trailing amount than Continente strict line (catches partial OCR). */
function trailingMoneyFromLine(t: string): { name: string; price: number | null } {
  const m = t.match(
    /^(?<name>.+?)\s+(?<amount>\d{1,3}(?:[.\s]\d{3})*(?:,\d{1,4})?|\d{1,3}(?:,\d{3})*(?:\.\d{1,4})?|\d+[.,]\d{1,4}|\d+)\s*(?:€|EUR)?\s*$/iu,
  );
  if (m?.groups?.name && m.groups.amount) {
    const name = m.groups.name.replace(/\s+/g, " ").trim();
    const price = parseEuropeanMoneyString(m.groups.amount);
    if (name.length >= 2 && price != null && price >= 0) {
      return { name: name.slice(0, 200), price };
    }
  }
  return { name: t.replace(/\s+/g, " ").trim().slice(0, 200), price: null };
}

type PadariaSignals = {
  hasCode: boolean;
  hasQtyUnitPrice: boolean;
  hasQty: boolean;
  hasPrice: boolean;
  hasKeyword: boolean;
  lengthOk: boolean;
};

function collectSignals(normalized: string): PadariaSignals {
  return {
    hasCode: PRODUCT_CODE_PATTERN.test(normalized),
    hasQtyUnitPrice: QTY_UNIT_PRICE_PATTERN.test(normalized),
    hasQty: QTY_UNIT_PATTERN.test(normalized),
    hasPrice: PRICE_TOKEN_PATTERN.test(normalized),
    hasKeyword: BREAD_KEYWORD_PATTERN.test(normalized),
    lengthOk: normalized.length >= 6 && normalized.length <= 160,
  };
}

/** Validation score 0–100. Threshold defined by `PADARIA_ACCEPT_THRESHOLD`. */
function scorePadariaLine(s: PadariaSignals): number {
  let score = 0;
  if (s.hasCode) score += 25;
  if (s.hasQtyUnitPrice) score += 30;
  if (s.hasKeyword) score += 30;
  if (s.lengthOk) score += 15;
  return score;
}

export function parsePadaria(lines: string[]): ParsedItem[] {
  const out: ParsedItem[] = [];
  let rejectLogs = 0;
  const logReject = (reason: string, line: string) => {
    if (rejectLogs >= MAX_REJECT_LOGS) return;
    rejectLogs++;
    console.log(
      `[invoice-extract] parsePadaria reject (${reason}): ${JSON.stringify(line.slice(0, 80))}`,
    );
  };

  for (const line of lines) {
    const t = line.trim();
    if (!t) continue;

    const normalized = normalizeAccents(t);

    if (REJECT_PATTERN.test(normalized)) {
      logReject("blacklist", t);
      continue;
    }

    const strict = parseContinenteLine(t);
    if (strict) {
      out.push(strict);
      continue;
    }

    const hasStructure =
      PRODUCT_CODE_PATTERN.test(normalized) || QTY_UNIT_PRICE_PATTERN.test(normalized);
    if (!hasStructure) {
      continue;
    }

    const signals = collectSignals(normalized);
    if (!(signals.hasQty && signals.hasPrice && signals.hasKeyword)) {
      continue;
    }

    const score = scorePadariaLine(signals);
    if (score < PADARIA_ACCEPT_THRESHOLD) {
      logReject(`score=${score}`, t);
      continue;
    }

    const { name, price } = trailingMoneyFromLine(t);
    if (name.length >= 2) {
      out.push({ name, price });
    }
  }
  return out;
}
