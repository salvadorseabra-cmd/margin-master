import { describe, expect, it } from "vitest";
import {
  buildInvoiceKpiSummaryCards,
  collectAvailableInvoiceMonths,
  formatInvoiceMonthLabel,
  previousInvoiceMonthKey,
  resolveDefaultInvoiceKpiMonth,
  type InvoiceKpiRow,
} from "@/lib/invoice-kpi-summary";

const row = (overrides: Partial<InvoiceKpiRow> & Pick<InvoiceKpiRow, "invoiceDate">): InvoiceKpiRow => ({
  created_at: "2026-05-18T10:00:00.000Z",
  total: 100,
  supplier_name: "Acme Foods",
  ...overrides,
});

describe("invoice-kpi-summary", () => {
  it("collects available months from invoice dates", () => {
    const rows = [
      row({ invoiceDate: "2026-05-13", total: 200 }),
      row({ invoiceDate: "2026-04-17", total: 150, supplier_name: "Beta" }),
      row({ invoiceDate: "2026-05-19", total: 130.42, supplier_name: "Gamma" }),
    ];

    expect(collectAvailableInvoiceMonths(rows)).toEqual(["2026-05", "2026-04"]);
  });

  it("defaults to current month when invoices exist there", () => {
    const available = ["2026-06", "2026-05", "2026-04"];
    expect(resolveDefaultInvoiceKpiMonth(available, new Date("2026-06-09"))).toBe("2026-06");
  });

  it("defaults to most recent month when current month is empty", () => {
    const available = ["2026-05", "2026-04"];
    expect(resolveDefaultInvoiceKpiMonth(available, new Date("2026-06-09"))).toBe("2026-05");
  });

  it("builds three KPI cards with MoM delta for selected month", () => {
    const rows = [
      row({ invoiceDate: "2026-05-13", total: 200, supplier_name: "Acme Foods" }),
      row({ invoiceDate: "2026-05-19", total: 130.42, supplier_name: "Beta Supply" }),
      row({ invoiceDate: "2026-04-17", total: 370, supplier_name: "Acme Foods" }),
    ];

    const cards = buildInvoiceKpiSummaryCards(rows, "2026-05");

    expect(cards).toHaveLength(3);
    expect(cards[0]).toMatchObject({
      label: "Monthly purchasing",
      value: "€330.42",
      detail: "-10.7% vs Apr 2026",
      tone: "decrease",
    });
    expect(cards[1]).toMatchObject({
      label: "Invoices processed",
      value: "2 invoices",
    });
    expect(cards[2]).toMatchObject({
      label: "Top supplier",
      value: "Acme Foods",
      detail: "€200.00",
    });
  });

  it("formats month labels for selector display", () => {
    expect(formatInvoiceMonthLabel("2026-05")).toBe("May 2026");
    expect(previousInvoiceMonthKey("2026-05")).toBe("2026-04");
  });
});
