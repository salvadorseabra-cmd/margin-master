import { describe, expect, it } from "vitest";
import {
  compareInvoiceChronologyAsc,
  compareInvoiceChronologyDesc,
  resolveInvoiceChronology,
} from "@/lib/invoice-chronology";

describe("resolveInvoiceChronology", () => {
  it("prefers normalized invoice issue date over invoice and item timestamps", () => {
    const resolved = resolveInvoiceChronology({
      invoice_date: "13/05/2026",
      created_at: "2026-05-18T10:00:00.000Z",
    });

    expect(resolved).toEqual({
      displayDateIso: "2026-05-13",
      chronologySourceType: "invoice_issue_date",
      rawIssueDate: "13/05/2026",
      rawInvoiceCreatedAt: "2026-05-18T10:00:00.000Z",
    });
  });

  it("falls back to invoice created_at when issue date is missing", () => {
    const resolved = resolveInvoiceChronology({
      invoice_date: null,
      created_at: "2026-05-18T10:00:00.000Z",
    });

    expect(resolved.displayDateIso).toBe("2026-05-18");
    expect(resolved.chronologySourceType).toBe("invoice_uploaded_at");
  });

  it("does not use invoice item created_at (caller must not pass it)", () => {
    const resolved = resolveInvoiceChronology(null);
    expect(resolved.chronologySourceType).toBe("missing");
    expect(resolved.displayDateIso).toBeNull();
  });
});

describe("compareInvoiceChronologyDesc", () => {
  it("orders ISO dates descending", () => {
    expect(compareInvoiceChronologyDesc("2026-05-13", "2026-05-18")).toBeGreaterThan(0);
    expect(compareInvoiceChronologyDesc("2026-05-18", "2026-05-13")).toBeLessThan(0);
  });
});

describe("compareInvoiceChronologyAsc", () => {
  it("orders ISO dates ascending", () => {
    expect(compareInvoiceChronologyAsc("2026-04-17", "2026-05-19")).toBeLessThan(0);
    expect(compareInvoiceChronologyAsc("2026-05-19", "2026-04-17")).toBeGreaterThan(0);
  });
});
