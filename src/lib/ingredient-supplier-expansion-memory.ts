/**
 * Lightweight supplier+token → expansion memory (in-memory + optional localStorage).
 * Learned from confirmed invoice aliases; no DB schema.
 */

const STORAGE_KEY = "marginly:supplier-token-expansions";

const supplierExpansionMemory = new Map<string, string>();

function normalizeSupplierKey(supplier: string | null | undefined): string {
  return (supplier ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function memoryKey(supplier: string, token: string): string {
  return `${normalizeSupplierKey(supplier)}::${token.trim().toLowerCase()}`;
}

export function supplierTokenExpansionMemoryKey(
  supplier: string | null | undefined,
  token: string,
): string {
  const supplierKey = normalizeSupplierKey(supplier);
  if (!supplierKey || !token?.trim()) return "";
  return memoryKey(supplierKey, token);
}

export function rememberSupplierTokenExpansion(
  supplier: string | null | undefined,
  token: string,
  expansion: string,
): void {
  const supplierKey = normalizeSupplierKey(supplier);
  const rawToken = token?.trim();
  const expanded = expansion?.trim();
  if (!supplierKey || !rawToken || !expanded) return;

  const key = memoryKey(supplierKey, rawToken);
  supplierExpansionMemory.set(key, expanded);
  persistSupplierExpansionMemory();
}

export function lookupSupplierTokenExpansion(
  supplier: string | null | undefined,
  token: string,
): string | null {
  const key = supplierTokenExpansionMemoryKey(supplier, token);
  if (!key) return null;
  return supplierExpansionMemory.get(key) ?? null;
}

function persistSupplierExpansionMemory(): void {
  if (typeof window === "undefined") return;
  const payload: Record<string, string> = {};
  for (const [key, value] of supplierExpansionMemory.entries()) {
    payload[key] = value;
  }
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    /* quota / private mode */
  }
}

export function hydrateSupplierExpansionMemoryFromStorage(): void {
  if (typeof window === "undefined") return;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw?.trim()) return;
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return;
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === "string" && key.includes("::")) {
        supplierExpansionMemory.set(key, value);
      }
    }
  } catch {
    /* corrupt payload */
  }
}

/** Test isolation — clears in-memory map (does not touch localStorage). */
export function clearSupplierExpansionMemoryForTests(): void {
  supplierExpansionMemory.clear();
}

/** Seed memory in tests without localStorage. */
export function seedSupplierExpansionMemory(entries: Record<string, string>): void {
  for (const [compoundKey, expansion] of Object.entries(entries)) {
    supplierExpansionMemory.set(compoundKey, expansion);
  }
}
