import { describe, expect, it } from "vitest";
import {
  derivePurchaseContractSnapshot,
  guardOperationalPreviousPrice,
  purchaseContractsChainCompatible,
  selectChainCompatiblePriorOperationalPrice,
  shouldBlockHistoryInsert,
} from "@/lib/ingredient-price-chain-guard";

describe("ingredient-price-chain-guard VL cases", () => {
  it("blocks Mozzarella piece vs 2kg block chain", () => {
    const prior = derivePurchaseContractSnapshot({
      name: "MOZZARELLA FIOR DI LATTE 'IL BOCCONCINO' 125GR*8",
      operationalUnitPrice: 0.95,
      purchaseQuantity: 10,
      ingredientUnit: "un",
    });
    const next = derivePurchaseContractSnapshot({
      name: "Mozzarella Flor di Latte 2Kg",
      operationalUnitPrice: 13.69,
      purchaseQuantity: 1,
      ingredientUnit: "kg",
    });

    const result = purchaseContractsChainCompatible(prior, next);
    expect(result.compatible).toBe(false);
    expect(result.action).toBe("break_chain");
    expect(guardOperationalPreviousPrice(prior, next)).toBeNull();
  });

  it("blocks Pepino conserva jar vs fresh kg chain", () => {
    const prior = derivePurchaseContractSnapshot({
      name: "Pepinos Extra Uli Frasco 6x720 g",
      operationalUnitPrice: 3.748333333333333,
      purchaseQuantity: 4320,
      ingredientUnit: "g",
    });
    const next = derivePurchaseContractSnapshot({
      name: "Pepino",
      operationalUnitPrice: 0.00177,
      purchaseQuantity: 1000,
      ingredientUnit: "g",
    });

    const result = purchaseContractsChainCompatible(prior, next);
    expect(result.compatible).toBe(false);
    expect(guardOperationalPreviousPrice(prior, next)).toBeNull();
  });

  it("blocks Ginger Beer 0.20cl implausible volume insert", () => {
    const snapshot = derivePurchaseContractSnapshot({
      name: "Ginger Beer 0.20cl",
      operationalUnitPrice: 0.575,
      purchaseQuantity: 2,
      ingredientUnit: "ml",
    });
    expect(shouldBlockHistoryInsert(snapshot)).toBe(true);
  });

  it("allows Atum em óleo trusted same-format chain", () => {
    const prior = derivePurchaseContractSnapshot({
      name: "Atum em óleo",
      operationalUnitPrice: 3.145,
      purchaseQuantity: 1,
      ingredientUnit: "kg",
    });
    const next = derivePurchaseContractSnapshot({
      name: "Atum em óleo",
      operationalUnitPrice: 3.275,
      purchaseQuantity: 1,
      ingredientUnit: "kg",
    });

    expect(purchaseContractsChainCompatible(prior, next).compatible).toBe(true);
    expect(guardOperationalPreviousPrice(prior, next)).toBe(3.145);
  });

  it("selectChainCompatiblePriorOperationalPrice skips incompatible latest row", () => {
    const priorRows = [
      {
        id: "aviludo",
        ingredient_name: "Mozzarella Flor di Latte 2Kg",
        ingredient_unit: "kg",
        new_price: 13.69,
        created_at: "2026-04-20T12:00:00.000Z",
      },
      {
        id: "bocco",
        ingredient_name: "MOZZARELLA FIOR DI LATTE 'IL BOCCONCINO' 125GR*8",
        ingredient_unit: "un",
        new_price: 0.95,
        created_at: "2026-04-10T12:00:00.000Z",
      },
    ];
    const next = derivePurchaseContractSnapshot({
      name: "MOZZARELLA FIOR DI LATTE 'IL BOCCONCINO' 125GR*8",
      operationalUnitPrice: 0.95,
      purchaseQuantity: 10,
      ingredientUnit: "un",
    });

    expect(selectChainCompatiblePriorOperationalPrice(priorRows, next)).toBe(0.95);
  });
});
