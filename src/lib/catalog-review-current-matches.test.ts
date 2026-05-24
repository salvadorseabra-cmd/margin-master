import { describe, expect, it } from "vitest";
import {
  buildCatalogReviewCurrentMatchCountsFromScan,
  loadCatalogReviewCurrentMatchesForIngredient,
} from "@/lib/catalog-review-current-matches";
import { buildCatalogReviewMatchRows } from "@/lib/catalog-review-match-rows";

const girassolCatalog = [
  { id: "ing-girassol", name: "Óleo girassol" },
  { id: "ing-palha", name: "Batata palha" },
];

const scanRows = [
  {
    id: "line-oil",
    invoice_id: "inv-1",
    name: "ÓLEO GIRASSOL 5L",
    quantity: 1,
    unit: "un",
    unit_price: 12,
    total: 12,
    created_at: "2026-03-01T00:00:00.000Z",
    invoices: { invoice_date: "2026-03-05", supplier_name: "Metro" },
  },
  {
    id: "line-palha",
    invoice_id: "inv-2",
    name: "BATATA PALHA 2KG",
    quantity: 2,
    unit: "un",
    unit_price: 8,
    total: 16,
    created_at: "2026-02-01T00:00:00.000Z",
    invoices: { invoice_date: "2026-02-10", supplier_name: "Auchan" },
  },
];

describe("catalog-review-current-matches", () => {
  it("counts live matcher hits per canonical and keeps left/right consistent", () => {
    const confirmedAliases = {
      "oleo girassol|metro": "ing-palha",
    };

    const counts = buildCatalogReviewCurrentMatchCountsFromScan(
      girassolCatalog,
      confirmedAliases,
      scanRows,
    );

    expect(counts["ing-girassol"]).toBe(1);
    expect(counts["ing-palha"]).toBe(1);

    const girassolMatches = loadCatalogReviewCurrentMatchesForIngredient(
      "ing-girassol",
      girassolCatalog,
      confirmedAliases,
      scanRows,
    );
    const palhaMatches = loadCatalogReviewCurrentMatchesForIngredient(
      "ing-palha",
      girassolCatalog,
      confirmedAliases,
      scanRows,
    );

    expect(girassolMatches.rows).toHaveLength(counts["ing-girassol"] ?? 0);
    expect(palhaMatches.rows).toHaveLength(counts["ing-palha"] ?? 0);

    const girassolDtos = buildCatalogReviewMatchRows(
      girassolMatches.rows,
      "ing-girassol",
      "Óleo girassol",
    );
    expect(girassolDtos.map((row) => row.invoiceLineId)).toEqual(["line-oil"]);
    expect(girassolDtos[0]?.invoiceWording).toBe("ÓLEO GIRASSOL 5L");
    expect(girassolDtos[0]?.supplierName).toBe("Metro");
  });

  it("assigns óleo girassol line to girassol canonical even when stale alias pointed at palha", () => {
    const confirmedAliases = {
      "oleo girassol|metro": "ing-palha",
    };

    const { rows } = loadCatalogReviewCurrentMatchesForIngredient(
      "ing-girassol",
      girassolCatalog,
      confirmedAliases,
      scanRows,
    );

    expect(rows.some((row) => row.itemId === "line-oil")).toBe(true);
    expect(
      loadCatalogReviewCurrentMatchesForIngredient(
        "ing-palha",
        girassolCatalog,
        confirmedAliases,
        scanRows,
      ).rows.some((row) => row.itemId === "line-oil"),
    ).toBe(false);
  });
});
