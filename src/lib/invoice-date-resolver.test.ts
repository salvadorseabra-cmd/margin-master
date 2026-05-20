import { describe, expect, it } from "vitest";
import { resolveIssueDateFromExtraction } from "../../supabase/functions/extract-invoice/invoice-date-resolver";

describe("resolveIssueDateFromExtraction", () => {
  it("prefers issue date when issue and due labels are both present", () => {
    const parsed = {
      "Data": "22/04/2026",
      "Data de Vencimento": "22/05/2026",
      invoice_date: "22/05/2026",
    };

    expect(resolveIssueDateFromExtraction(parsed, parsed.invoice_date)).toBe("22/04/2026");
  });

  it("handles Portuguese invoice labels deterministically", () => {
    const parsed = {
      datas: [
        { label: "Vencimento", value: "30/06/2026" },
        { label: "Data Emissão", value: "02/06/2026" },
      ],
      invoiceDate: "30/06/2026",
    };

    expect(resolveIssueDateFromExtraction(parsed, parsed.invoiceDate)).toBe("02/06/2026");
  });

  it("chooses highest-priority issue label among multiple issue dates", () => {
    const parsed = {
      "Invoice Date": "2026-04-25",
      "Data Documento": "2026-04-24",
      "Data": "2026-04-23",
      "Due Date": "2026-05-25",
      invoice_date: "2026-05-25",
    };

    expect(resolveIssueDateFromExtraction(parsed, parsed.invoice_date)).toBe("2026-04-23");
  });

  it("blocks due-date fallback when only due labels are present", () => {
    const parsed = {
      "Payment Due": "2026-05-25",
      invoice_date: "2026-05-25",
    };

    expect(resolveIssueDateFromExtraction(parsed, parsed.invoice_date)).toBeNull();
  });
});
