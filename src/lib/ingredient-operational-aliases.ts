/**
 * Conservative supplier shorthand → operational tokens (deterministic, whole-token only).
 * Applied before {@link normalizeInvoiceIngredientName} in invoice ingredient matching.
 */

export const OPERATIONAL_ALIASES: Record<string, string> = {
  bac: "bacon",
  bat: "batata",
  brch: "brioche",
  bun: "bun",
  chk: "chicken",
  ched: "cheddar",
  fat: "fatiado",
  fum: "fumado",
  hmb: "hamburguer",
  ketch: "ketchup",
  maio: "maionese",
  pickl: "pickles",
  pty: "patty",
  ses: "sesamo",
  /** PT catalog lines use fatiados; aligns with {@link normalizeInvoiceIngredientName} keys. */
  slc: "fatiados",
  slcd: "fatiados",
  smk: "smoke",
  shoestr: "shoestring",
  strk: "streaky",
};

const SUPPLIER_TOKEN_RE =
  /\d+(?:[.,]\d+)?(?:kg|kgs|g|gr|grs|mg|ml|cl|l|lt|lts|ltr|ltrs|un|uni|unid)?|\d+|[a-zA-Z]+(?:'[a-zA-Z]+)?/gi;

const PRESERVED_NUMERIC_TOKEN_RE =
  /^\d+(?:[.,]\d+)?(?:kg|kgs|g|gr|grs|mg|ml|cl|l|lt|lts|ltr|ltrs|un|uni|unid)?$/i;

function isPreservedNumericToken(token: string): boolean {
  return PRESERVED_NUMERIC_TOKEN_RE.test(token);
}

function tokenizeSupplierLine(text: string): string[] {
  return text.match(SUPPLIER_TOKEN_RE) ?? [];
}

function replaceOperationalToken(token: string): string {
  if (isPreservedNumericToken(token)) return token;
  const key = token.toLowerCase();
  return OPERATIONAL_ALIASES[key] ?? token;
}

/**
 * Expands supplier shorthand tokens while preserving pack sizes and standalone numbers.
 *
 * @example normalizeSupplierShorthand("PICKL SLC 1KG") → "pickles fatiados 1KG"
 */
export function normalizeSupplierShorthand(text: string | null | undefined): string {
  if (!text) return "";
  const trimmed = text.trim();
  if (!trimmed) return "";
  return tokenizeSupplierLine(trimmed).map(replaceOperationalToken).join(" ");
}

export function operationalAliasCount(): number {
  return Object.keys(OPERATIONAL_ALIASES).length;
}
