/**
 * Conservative supplier shorthand → operational tokens (deterministic, whole-token only).
 * Applied before {@link normalizeInvoiceIngredientName} in invoice ingredient matching.
 */

export const OPERATIONAL_ALIASES: Record<string, string> = {
  angus: "angus",
  bac: "bacon",
  bat: "batata",
  brch: "brioche",
  breaded: "breaded",
  bun: "bun",
  chk: "chicken",
  ched: "cheddar",
  disp: "dispenser",
  dn: "top down",
  fat: "fatiado",
  fin: "fino",
  fum: "fumado",
  hmb: "hamburguer",
  ketch: "ketchup",
  maio: "maionese",
  mol: "molho",
  oni: "onion",
  pal: "palha",
  palha: "palha",
  pickl: "pickles",
  pty: "patty",
  ring: "rings",
  ses: "sesamo",
  /** PT catalog lines use fatiados; aligns with {@link normalizeInvoiceIngredientName} keys. */
  slc: "fatiados",
  slcd: "fatiados",
  smk: "smoked",
  smash: "smash",
  shoe: "shoestring",
  shoestr: "shoestring",
  strk: "streaky",
  wdg: "wedges",
};

const SUPPLIER_TOKEN_RE =
  /\d+(?:[.,]\d+)?(?:kg|kgs|g|gr|grs|mg|ml|cl|l|lt|lts|ltr|ltrs|un|uni|unid)?|\d+|[a-zA-Z]+(?:'[a-zA-Z]+)?/gi;

const PRESERVED_NUMERIC_TOKEN_RE =
  /^\d+(?:[.,]\d+)?(?:kg|kgs|g|gr|grs|mg|ml|cl|l|lt|lts|ltr|ltrs|un|uni|unid)?$/i;

function isPreservedNumericToken(token: string): boolean {
  return PRESERVED_NUMERIC_TOKEN_RE.test(token);
}

/** Merge `9 x 9` / `9X9` OCR splits into a single grid-cut token. */
function mergeGridCutTokens(tokens: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const current = tokens[i]!;
    const separator = tokens[i + 1];
    const trailing = tokens[i + 2];
    if (
      /^\d+$/i.test(current) &&
      separator?.toLowerCase() === "x" &&
      trailing &&
      /^\d+$/i.test(trailing)
    ) {
      out.push(`${current}x${trailing}`);
      i += 2;
      continue;
    }
    out.push(current);
  }
  return out;
}

function tokenizeSupplierLine(text: string): string[] {
  return mergeGridCutTokens(text.match(SUPPLIER_TOKEN_RE) ?? []);
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
  return tokenizeSupplierLine(trimmed)
    .flatMap((token) => replaceOperationalToken(token).split(/\s+/).filter(Boolean))
    .join(" ");
}

export function operationalAliasCount(): number {
  return Object.keys(OPERATIONAL_ALIASES).length;
}
