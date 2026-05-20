/**
 * Conservative supplier shorthand → operational tokens (deterministic, whole-token only).
 * Applied before {@link normalizeInvoiceIngredientName} in invoice ingredient matching.
 */

export const OPERATIONAL_ALIASES: Record<string, string> = {
  /** PT beef-cut signals (acem vazia novilho). */
  acem: "acem",
  ang: "angus",
  angus: "angus",
  bac: "bacon",
  bat: "batata",
  bbq: "bbq",
  box: "box",
  brch: "brioche",
  brd: "breaded",
  breaded: "breaded",
  bun: "bun",
  burg: "burger",
  caixa: "caixa",
  chk: "chicken",
  ched: "cheddar",
  cx: "cx",
  disp: "dispenser",
  dn: "top down",
  emb: "emb",
  fat: "fatiado",
  fin: "fino",
  flt: "fatiado",
  fum: "fumado",
  hmb: "hamburguer",
  ketch: "ketchup",
  kraft: "kraft",
  maio: "maionese",
  mol: "molho",
  novilho: "novilho",
  on: "onion",
  oni: "onion",
  pack: "pack",
  pal: "palha",
  palha: "palha",
  pickl: "pickles",
  pkl: "pickles",
  pty: "patty",
  ring: "rings",
  rng: "rings",
  ses: "sesamo",
  slc: "fatiados",
  slcd: "fatiados",
  smk: "smoked",
  smash: "smash",
  shoe: "shoestring",
  shoestr: "shoestring",
  strk: "streaky",
  top: "top",
  vazia: "vazia",
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
