export type InvoiceKpiRow = {
  invoiceDate: string | null;
  created_at: string;
  total: number;
  supplier_name: string;
};

export type InvoiceKpiSummaryTone = "muted" | "increase" | "decrease" | "steady";

export type InvoiceKpiSummaryCard = {
  label: string;
  value: string;
  detail: string;
  tone?: InvoiceKpiSummaryTone;
};

const monthFormatter = new Intl.DateTimeFormat("en-US", { month: "short", year: "numeric" });

export function invoiceMonthKey(year: number, monthIndex: number): string {
  return `${year}-${String(monthIndex + 1).padStart(2, "0")}`;
}

export function parseInvoiceMonthKey(key: string): { year: number; monthIndex: number } | null {
  const match = /^(\d{4})-(\d{2})$/.exec(key);
  if (!match) return null;
  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  if (!Number.isInteger(year) || monthIndex < 0 || monthIndex > 11) return null;
  return { year, monthIndex };
}

export function formatInvoiceMonthLabel(key: string): string {
  const parsed = parseInvoiceMonthKey(key);
  if (!parsed) return key;
  return monthFormatter.format(new Date(parsed.year, parsed.monthIndex, 1));
}

export function previousInvoiceMonthKey(key: string): string | null {
  const parsed = parseInvoiceMonthKey(key);
  if (!parsed) return null;
  const date = new Date(parsed.year, parsed.monthIndex - 1, 1);
  return invoiceMonthKey(date.getFullYear(), date.getMonth());
}

const getMonthlyBucketDate = (row: InvoiceKpiRow) => {
  const value = row.invoiceDate ?? row.created_at;
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

export function invoiceRowMonthKey(row: InvoiceKpiRow): string | null {
  const date = getMonthlyBucketDate(row);
  if (!date) return null;
  return invoiceMonthKey(date.getFullYear(), date.getMonth());
}

const isInMonthKey = (row: InvoiceKpiRow, monthKey: string) => invoiceRowMonthKey(row) === monthKey;

export function collectAvailableInvoiceMonths(rows: InvoiceKpiRow[]): string[] {
  const months = new Set<string>();
  for (const row of rows) {
    const key = invoiceRowMonthKey(row);
    if (key) months.add(key);
  }
  return [...months].sort((a, b) => b.localeCompare(a));
}

export function resolveDefaultInvoiceKpiMonth(
  availableMonths: string[],
  now = new Date(),
): string | null {
  if (availableMonths.length === 0) return null;
  const currentMonth = invoiceMonthKey(now.getFullYear(), now.getMonth());
  if (availableMonths.includes(currentMonth)) return currentMonth;
  return availableMonths[0] ?? null;
}

const formatMoney = (value: number) => `€${value.toFixed(2)}`;

const formatPercentDelta = (current: number, previous: number, previousMonthLabel: string) => {
  if (previous <= 0) return null;
  const percent = ((current - previous) / previous) * 100;
  const rounded = Math.round(percent * 10) / 10;
  if (rounded === 0) return `0% vs ${previousMonthLabel}`;
  const sign = rounded > 0 ? "+" : "";
  return `${sign}${rounded}% vs ${previousMonthLabel}`;
};

const deltaTone = (current: number, previous: number): InvoiceKpiSummaryTone => {
  if (previous <= 0 || current === previous) return "steady";
  return current > previous ? "increase" : "decrease";
};

const summarizeSupplierSpend = (rows: InvoiceKpiRow[]) => {
  const totals = rows.reduce<Record<string, number>>((acc, row) => {
    const supplier = row.supplier_name || "Unknown supplier";
    acc[supplier] = (acc[supplier] ?? 0) + Number(row.total ?? 0);
    return acc;
  }, {});

  return Object.entries(totals).sort(([, a], [, b]) => b - a)[0] ?? null;
};

export function buildInvoiceKpiSummaryCards(
  rows: InvoiceKpiRow[],
  selectedMonthKey: string,
): InvoiceKpiSummaryCard[] {
  const selectedRows = rows.filter((row) => isInMonthKey(row, selectedMonthKey));
  const previousMonthKey = previousInvoiceMonthKey(selectedMonthKey);
  const previousRows = previousMonthKey
    ? rows.filter((row) => isInMonthKey(row, previousMonthKey))
    : [];
  const selectedSpend = selectedRows.reduce((sum, row) => sum + Number(row.total ?? 0), 0);
  const previousSpend = previousRows.reduce((sum, row) => sum + Number(row.total ?? 0), 0);
  const topSupplier = summarizeSupplierSpend(selectedRows);
  const previousMonthLabel = previousMonthKey ? formatInvoiceMonthLabel(previousMonthKey) : null;
  const spendDelta =
    previousMonthLabel != null ? formatPercentDelta(selectedSpend, previousSpend, previousMonthLabel) : null;

  const invoiceCount = selectedRows.length;
  const invoiceLabel = `${invoiceCount} ${invoiceCount === 1 ? "invoice" : "invoices"}`;

  return [
    {
      label: "Monthly purchasing",
      value: formatMoney(selectedSpend),
      detail: spendDelta ?? (previousMonthKey ? "No spend in prior month" : "No previous month baseline"),
      tone: spendDelta ? deltaTone(selectedSpend, previousSpend) : "muted",
    },
    {
      label: "Invoices processed",
      value: invoiceLabel,
      detail: selectedRows.length > 0 ? formatInvoiceMonthLabel(selectedMonthKey) : "No invoices this month",
      tone: "muted",
    },
    {
      label: "Top supplier",
      value: topSupplier ? topSupplier[0] : "No supplier yet",
      detail: topSupplier ? formatMoney(topSupplier[1]) : "Upload invoices to begin",
      tone: "muted",
    },
  ];
}
