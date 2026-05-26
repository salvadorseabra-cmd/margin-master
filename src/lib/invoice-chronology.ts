import { normalizeInvoiceDate } from "@/lib/supplier-identity";

export const CHRONOLOGY_AUDIT_LOG_PREFIX = "[CHRONOLOGY_AUDIT]";

export type ChronologySourceType =
  | "invoice_issue_date"
  | "invoice_uploaded_at"
  | "missing";

export type ResolvedInvoiceChronology = {
  /** ISO `YYYY-MM-DD` for display and sort. */
  displayDateIso: string | null;
  chronologySourceType: ChronologySourceType;
  rawIssueDate: string | null;
  rawInvoiceCreatedAt: string | null;
};

declare global {
  interface Window {
    __MARGINLY_CHRONOLOGY_AUDIT__?: boolean;
  }
}

export function shouldLogChronologyAudit(): boolean {
  if (import.meta.env.DEV) return true;
  return typeof window !== "undefined" && window.__MARGINLY_CHRONOLOGY_AUDIT__ === true;
}

export function resolveInvoiceChronology(
  invoice:
    | {
        invoice_date?: string | null;
        created_at?: string | null;
      }
    | null
    | undefined,
): ResolvedInvoiceChronology {
  const rawIssueDate = invoice?.invoice_date?.trim() || null;
  const rawInvoiceCreatedAt = invoice?.created_at?.trim() || null;
  const normalizedIssue = normalizeInvoiceDate(rawIssueDate);

  if (normalizedIssue) {
    return {
      displayDateIso: normalizedIssue,
      chronologySourceType: "invoice_issue_date",
      rawIssueDate,
      rawInvoiceCreatedAt,
    };
  }

  if (rawInvoiceCreatedAt) {
    const normalizedUpload = normalizeInvoiceDate(rawInvoiceCreatedAt);
    const displayDateIso =
      normalizedUpload ??
      (rawInvoiceCreatedAt.includes("T") ? rawInvoiceCreatedAt.slice(0, 10) : null);
    if (displayDateIso) {
      return {
        displayDateIso,
        chronologySourceType: "invoice_uploaded_at",
        rawIssueDate,
        rawInvoiceCreatedAt,
      };
    }
  }

  return {
    displayDateIso: null,
    chronologySourceType: "missing",
    rawIssueDate,
    rawInvoiceCreatedAt,
  };
}

export type ChronologyAuditLogInput = {
  surface: string;
  ingredientId?: string | null;
  itemId?: string | null;
  invoiceId?: string | null;
  supplierName?: string | null;
  sourceInvoiceIssueDate: string | null;
  displayedDate: string | null;
  persistenceTimestamp: string | null;
  chronologySourceType: ChronologySourceType;
  /** Diagnostic only — must not drive display when issue date exists. */
  invoiceItemCreatedAt?: string | null;
};

export function logChronologyAudit(input: ChronologyAuditLogInput): void {
  if (!shouldLogChronologyAudit()) return;
  console.info(CHRONOLOGY_AUDIT_LOG_PREFIX, input);
}

/** Descending sort for ISO purchase dates (`YYYY-MM-DD`). */
export function compareInvoiceChronologyDesc(
  a: string | null | undefined,
  b: string | null | undefined,
): number {
  const left = a?.trim() || "";
  const right = b?.trim() || "";
  if (!left && !right) return 0;
  if (!left) return 1;
  if (!right) return -1;
  return right.localeCompare(left);
}
