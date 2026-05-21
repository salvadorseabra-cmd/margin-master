/** Invoice line field normalization shared by invoices route and match integration tests. */

export type InvoiceItemRow = {
  id: string;
  name: string;
  quantity: number | null;
  unit: string | null;
  unit_price: number | null;
  total: number | null;
};

type InvoiceRowTailFields = {
  quantity: number | null;
  unit: string | null;
};

const INVOICE_NUMBER_TOKEN = String.raw`\d{1,3}(?:[.\s]\d{3})*(?:,\d+)?|\d{1,3}(?:,\d{3})*(?:\.\d+)?|\d+[.,]\d+|\d+`;
const INVOICE_UNIT_TOKEN = String.raw`un|uni|und|unds|unid|unids|unidade|unidades|kg|g|gr|l|lt|ml|cl|cx|caixa|caixas|dz|pack|packs|pc|pcs`;
const INVOICE_ROW_TAIL_RE = new RegExp(
  String.raw`\s+(?<quantity>${INVOICE_NUMBER_TOKEN})\s*(?<unit>${INVOICE_UNIT_TOKEN})\b\s+(?:€|EUR)?\s*${INVOICE_NUMBER_TOKEN}\s*(?:€|EUR)?\s*(?:\d{1,2}(?:[,.]\d+)?\s*%)?\s*$`,
  "iu",
);
const INVOICE_PRODUCT_CODE_RE = /^(?:[A-Z]{1,4}\d{3,8}|\d{2,8})\s+/iu;

const parseInvoiceNumberToken = (raw: string): number | null => {
  let value = raw
    .replace(/\u20AC/g, " ")
    .replace(/€/g, " ")
    .replace(/EUR/gi, " ")
    .replace(/\s+/g, "")
    .trim();
  if (!value) return null;
  value = value.replace(/[^\d.,-]/g, "");
  const lastComma = value.lastIndexOf(",");
  const lastDot = value.lastIndexOf(".");
  const normalized =
    lastComma > lastDot
      ? value.replace(/\./g, "").replace(",", ".")
      : lastDot > lastComma
        ? value.replace(/,/g, "")
        : value.replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
};

export const normalizeInvoiceUnitToken = (raw: string | null | undefined) => {
  const unit = raw?.trim().toLowerCase();
  if (!unit) return null;
  if (["uni", "und", "unds", "unid", "unids", "unidade", "unidades", "pc", "pcs"].includes(unit)) {
    return "un";
  }
  if (unit === "lt") return "L";
  if (unit === "gr") return "g";
  return unit === "l" ? "L" : unit;
};

const invoiceAmountsNearlyEqual = (a: number, b: number) => Math.abs(a - b) < 0.005;

const extractInvoiceRowTailFields = (name: string): InvoiceRowTailFields => {
  const rowTail = name.match(INVOICE_ROW_TAIL_RE);
  if (!rowTail?.groups?.quantity || !rowTail.groups.unit) return { quantity: null, unit: null };

  return {
    quantity: parseInvoiceNumberToken(rowTail.groups.quantity),
    unit: normalizeInvoiceUnitToken(rowTail.groups.unit),
  };
};

const normalizeInvoiceNumberField = (value: unknown): number | null => {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") return parseInvoiceNumberToken(value);
  return null;
};

export const cleanInvoiceItemDisplayName = (
  item: Pick<InvoiceItemRow, "name" | "quantity" | "unit">,
) => {
  let name = String(item.name ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(INVOICE_PRODUCT_CODE_RE, "")
    .trim();

  const rowTail = name.match(INVOICE_ROW_TAIL_RE);
  if (rowTail?.groups?.quantity && rowTail.groups.unit) {
    const quantity = parseInvoiceNumberToken(rowTail.groups.quantity);
    const rowUnit = normalizeInvoiceUnitToken(rowTail.groups.unit);
    const itemUnit = normalizeInvoiceUnitToken(item.unit);
    const quantityMatches =
      item.quantity == null ||
      quantity == null ||
      invoiceAmountsNearlyEqual(item.quantity, quantity);
    const unitMatches = !itemUnit || !rowUnit || itemUnit === rowUnit;
    if (quantityMatches && unitMatches) name = name.slice(0, rowTail.index).trim();
  }

  return name
    .replace(/\s+\d{1,2}(?:[,.]\d+)?\s*%\s*$/u, "")
    .replace(/\s+(?:€|EUR)\s*\d+(?:[,.]\d{1,4})?\s*$/iu, "")
    .replace(/\s+\d+[,.]\d{1,4}\s*(?:€|EUR)\s*$/iu, "")
    .replace(/\s+/g, " ")
    .trim();
};

const INVOICE_ADDRESS_RE =
  /(^|\s)(?:travessa|trav\.?|rua|r\.|avenida|av\.?|estrada|largo|praceta|praca|rotunda|urbanizacao|zona\s+industrial|parque\s+industrial|edificio|lote|loja|andar|sala|apartado|cod\.?\s+postal|cp)(?=\s|,|\.|:|$)/iu;
const INVOICE_BUSINESS_METADATA_RE =
  /(^|\s)(?:lda|l\.?da|unipessoal|sa|s\.?a\.?|sociedade|comercial|distribuicao|armazem|sede|delegacao|gerencia|gerente|eng\.?|engenheiro|dr\.?|dra\.?)(?=\s|,|\.|:|$)/iu;
const INVOICE_PAYMENT_METADATA_RE =
  /\b(?:iban|swift|bic|sepa|referencia\s+mb|ref\.?\s+mb|entidade|pagamento|transferencia|multibanco|mb\s*way|cartao|visa|mastercard)\b/iu;
const INVOICE_TAX_SUMMARY_RE =
  /\b(?:base\s+incidencia|incidencia|valor\s+iva|taxa\s+iva|iva\s+dedutivel|total\s+liquido|total\s+mercadoria|total\s+documento|valor\s+a\s+pagar)\b/iu;

const normalizeInvoiceRowNameForFilter = (name: string) =>
  name
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();

/** Non-ingredient OCR rows (addresses, tax lines, payment metadata) excluded from normalization counts. */
export function shouldRejectInvoiceIngredientRow(
  item: Pick<InvoiceItemRow, "name" | "quantity" | "unit" | "unit_price" | "total">,
): boolean {
  const name = cleanInvoiceItemDisplayName(item);
  if (!name || !/[A-Za-zÀ-ÿ]/u.test(name)) return true;

  const normalized = normalizeInvoiceRowNameForFilter(name);
  const hasParsedRowFields =
    item.quantity != null || item.unit != null || item.unit_price != null || item.total != null;
  if (INVOICE_PAYMENT_METADATA_RE.test(normalized) || INVOICE_TAX_SUMMARY_RE.test(normalized)) {
    return true;
  }
  if (INVOICE_ADDRESS_RE.test(normalized)) return true;
  if (INVOICE_BUSINESS_METADATA_RE.test(normalized) && !hasParsedRowFields) {
    return true;
  }
  return false;
}

export const normalizeInvoiceItemFields = <T extends Partial<InvoiceItemRow>>(
  item: T,
): T & InvoiceItemRow => {
  const rowTailFields = extractInvoiceRowTailFields(String(item.name ?? ""));
  const quantity = normalizeInvoiceNumberField(item.quantity) ?? rowTailFields.quantity;
  const unit = normalizeInvoiceUnitToken(item.unit) ?? rowTailFields.unit;
  const unit_price = normalizeInvoiceNumberField(item.unit_price);
  const total = normalizeInvoiceNumberField(item.total);
  const normalized = {
    ...item,
    name: cleanInvoiceItemDisplayName({ name: item.name ?? "", quantity, unit }),
    quantity,
    unit,
    unit_price,
    total,
  };
  return normalized as T & InvoiceItemRow;
};
