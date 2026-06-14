import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { syncOperationalIngredientCostsFromInvoiceLines } from "@/lib/ingredient-operational-intelligence";
import * as ingredientAutoPersist from "@/lib/ingredient-auto-persist";
import { buildIngredientAliasLookupKey } from "@/lib/ingredient-alias-lookup";

const pepinoCatalog = [
  { id: "ing-pepino-conserva", name: "PEPINO CONSERVA" },
  { id: "ing-mozzarella", name: "MOZZARELLA" },
];

describe("syncOperationalIngredientCostsFromInvoiceLines extract gate", () => {
  const persistSpy = vi.spyOn(ingredientAutoPersist, "persistOperationalIngredientCostFromInvoiceLine");

  beforeEach(() => {
    vi.stubEnv("VITE_MATCH_LIFECYCLE_EXTRACT_GATE", "true");
    persistSpy.mockReset();
    persistSpy.mockResolvedValue({ updated: true, error: null });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("skips bare exact and suggested matches when extract gate is enabled", async () => {
    const result = await syncOperationalIngredientCostsFromInvoiceLines(
      {} as never,
      pepinoCatalog,
      {},
      [
        {
          name: "PEPINO",
          quantity: 3.36,
          unit: "kg",
          unit_price: 1.77,
          supplierName: "Bidfood",
        },
        {
          name: "MOZZARELLA FIORDILATTE",
          quantity: 1,
          unit: "kg",
          unit_price: 12,
          supplierName: "Bidfood",
        },
      ],
    );

    expect(result.updatedIngredientIds).toEqual([]);
    expect(persistSpy).not.toHaveBeenCalled();
  });

  it("persists cost for confirmed-alias lines when extract gate is enabled", async () => {
    const aliasKey = buildIngredientAliasLookupKey("pepino conserva", "Aviludo");
    const result = await syncOperationalIngredientCostsFromInvoiceLines(
      {} as never,
      pepinoCatalog,
      { [aliasKey]: "ing-pepino-conserva" },
      [
        {
          name: "PEPINO CONSERVA 720G",
          quantity: 2,
          unit: "un",
          unit_price: 3.5,
          supplierName: "Aviludo",
        },
      ],
      {
        priceHistory: {
          invoiceId: "inv-1",
          supplierName: "Aviludo",
          invoiceDate: "2026-05-01",
          invoiceCreatedAt: null,
        },
      },
    );

    expect(result.updatedIngredientIds).toEqual(["ing-pepino-conserva"]);
    expect(persistSpy).toHaveBeenCalledTimes(1);
    expect(persistSpy).toHaveBeenCalledWith(
      expect.anything(),
      "ing-pepino-conserva",
      expect.objectContaining({ name: "PEPINO CONSERVA 720G" }),
      expect.anything(),
    );
  });

  it("uses legacy unmatched-only skip when extract gate is disabled", async () => {
    vi.stubEnv("VITE_MATCH_LIFECYCLE_EXTRACT_GATE", "false");

    const result = await syncOperationalIngredientCostsFromInvoiceLines(
      {} as never,
      pepinoCatalog,
      {},
      [
        {
          name: "PEPINO",
          quantity: 3.36,
          unit: "kg",
          unit_price: 1.77,
          supplierName: "Bidfood",
        },
      ],
    );

    expect(result.updatedIngredientIds).toEqual(["ing-pepino-conserva"]);
    expect(persistSpy).toHaveBeenCalledTimes(1);
  });
});
