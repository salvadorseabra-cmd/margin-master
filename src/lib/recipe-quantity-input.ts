const DISPLAY_INTEGER_SNAP = 0.01;
const DISPLAY_FLOAT_EPSILON = 1e-6;
const MAX_FRACTION_DIGITS = 6;

function finiteNumber(value: number) {
  return Number.isFinite(value) ? value : 0;
}

function normalizeDecimalToken(raw: string): string {
  let value = raw
    .replace(/\u20AC/g, " ")
    .replace(/€/g, " ")
    .replace(/EUR/gi, " ")
    .replace(/\s+/g, "")
    .trim();
  if (!value) return "";

  value = value.replace(/[^\d.,-]/g, "");
  if (!value || value === "-" || value === "," || value === ".") return "";

  const lastComma = value.lastIndexOf(",");
  const lastDot = value.lastIndexOf(".");

  if (lastComma > lastDot) {
    return value.replace(/\./g, "").replace(",", ".");
  }
  if (lastDot > lastComma) {
    return value.replace(/,/g, "");
  }
  return value.replace(",", ".");
}

/** Display string for recipe line quantity inputs (dot decimal, trimmed zeros). */
export function formatRecipeQuantityDisplay(value: number): string {
  const safe = finiteNumber(value);
  let n =
    Math.round((safe + Number.EPSILON) * 10 ** MAX_FRACTION_DIGITS) /
    10 ** MAX_FRACTION_DIGITS;

  const nearestInt = Math.round(n);
  if (Math.abs(n - nearestInt) < DISPLAY_FLOAT_EPSILON) {
    return String(nearestInt);
  }
  if (Math.abs(n - nearestInt) < DISPLAY_INTEGER_SNAP) {
    return String(nearestInt);
  }

  return n
    .toFixed(MAX_FRACTION_DIGITS)
    .replace(/\.?0+$/, "");
}

/** Parse user-typed quantity; PT-friendly comma decimals, no thousands corruption. */
export function parseRecipeQuantityInput(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const withoutTrailingSeparator = trimmed.replace(/[.,]$/, "");
  const normalized = normalizeDecimalToken(withoutTrailingSeparator);
  if (!normalized || normalized === "-") return null;

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}
