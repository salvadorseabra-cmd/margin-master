const LEGAL_SUFFIX_RE =
  /\b(?:lda\.?|l\.?d\.?a\.?|sa|s\.?a\.?|unipessoal|sociedade\s+unipessoal|limitada)\b\.?/gi;

/** Proven VL typo corrections — identity key only, not display name. */
const SUPPLIER_KEY_TYPO_MAP: Readonly<Record<string, string>> = {
  avijudo: "aviludo",
};

const UPLOAD_FILENAME_HINT_RE =
  /\b(?:screenshot|screen shot|captura|whatsapp|img|image|scan|document|invoice|fatura)\b/i;

function collapseSpaces(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function stripFileExtension(value: string) {
  return value.replace(/\.[a-z0-9]{2,5}$/i, "");
}

function trimCompanyDescriptor(value: string) {
  const parts = value
    .split(/\s[-–—]\s/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length >= 2 && parts[0].length >= 3 && /[A-Za-zÀ-ÿ]/.test(parts[0])) {
    return parts[0];
  }
  return value;
}

function stripLegalSuffixes(value: string) {
  return collapseSpaces(
    value
      .replace(LEGAL_SUFFIX_RE, " ")
      .replace(/\s*,\s*$/g, "")
      .replace(/\s+,\s+/g, ", "),
  );
}

function titleCaseWord(word: string) {
  if (!word) return word;
  if (/[A-Z][a-z]+[A-Z]/.test(word)) return word;
  if (/[a-z]/.test(word) && /[A-Z]/.test(word.slice(1))) return word;
  return word.charAt(0).toLocaleUpperCase() + word.slice(1).toLocaleLowerCase();
}

function prepareSupplierNameValue(raw: string) {
  let value = stripFileExtension(raw);
  value = collapseSpaces(value.replace(/[_]+/g, " "));
  value = trimCompanyDescriptor(value);
  value = stripLegalSuffixes(value);
  value = value.replace(/\s+([,.;:])/g, "$1").replace(/[.,;:\s]+$/g, "");
  return collapseSpaces(value);
}

function applySupplierKeyTypoMap(key: string): string {
  return SUPPLIER_KEY_TYPO_MAP[key] ?? key;
}

function tidyCapitalization(value: string) {
  if (/[a-z]/.test(value) && /[A-Z]/.test(value)) return value;
  return value
    .split(" ")
    .map((word) => titleCaseWord(word))
    .join(" ");
}

export function fileNameFromInvoicePath(path: string | null | undefined): string | null {
  if (!path) return null;
  const last = path.split("/").filter(Boolean).at(-1);
  if (!last) return null;
  return stripFileExtension(last.replace(/^\d+-/, "").replace(/_/g, " ")).trim() || null;
}

/** Deterministic supplier identity key for lookups and aggregation (lowercase, no legal suffixes). */
export function normalizeSupplierKey(raw: string | null | undefined): string {
  if (!raw) return "";
  const key = prepareSupplierNameValue(raw).toLocaleLowerCase();
  return applySupplierKeyTypoMap(key);
}

export function normalizeSupplierDisplayName(raw: string | null | undefined): string {
  if (!raw) return "";
  return tidyCapitalization(prepareSupplierNameValue(raw));
}

export function looksLikeUploadedFileName(
  value: string | null | undefined,
  sourceFileName?: string | null,
) {
  const normalized = normalizeSupplierDisplayName(value).toLocaleLowerCase();
  if (!normalized) return false;

  const source = normalizeSupplierDisplayName(sourceFileName).toLocaleLowerCase();
  if (source && normalized === source) return true;
  if (UPLOAD_FILENAME_HINT_RE.test(normalized)) return true;
  if (/^\d{4}[-\s]\d{2}[-\s]\d{2}/.test(normalized)) return true;
  return false;
}

export function normalizeInvoiceNumber(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const value = collapseSpaces(String(raw).replace(/\s+/g, " ")).replace(/[.,;:\s]+$/g, "");
  if (!value || value.length > 48) return null;
  return value;
}

export function normalizeInvoiceDate(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const value = String(raw).trim();
  const isoMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const ptMatch = value.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  const normalized = isoMatch
    ? value
    : ptMatch
      ? `${ptMatch[3]}-${ptMatch[2].padStart(2, "0")}-${ptMatch[1].padStart(2, "0")}`
      : null;
  if (!normalized) return null;
  const date = new Date(`${normalized}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : normalized;
}
