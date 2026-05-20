import { describe, expect, it, vi } from "vitest";
import {
  findCanonicalIngredientMatch,
  type IngredientCanonicalInput,
} from "./ingredient-canonical";
import {
  autoPersistSessionKey,
  autoPersistUnmatchedInvoiceItems,
  buildIngredientInsertPayload,
  catalogHasNormalizedNameDuplicate,
  catalogHasOperationalFamilyConflict,
  catalogHasSameOperationalFamilyDuplicate,
  evaluateAutoPersistEligibility,
} from "./ingredient-auto-persist";

function ingredient(id: string, name: string, normalized_name?: string): IngredientCanonicalInput {
  return { id, name, normalized_name: normalized_name ?? name.toLowerCase() };
}

const item = (
  name: string,
  overrides: Partial<{ quantity: number | null; unit: string | null; unit_price: number | null }> = {},
) => ({
  id: `item-${name}`,
  name,
  quantity: overrides.quantity ?? 1,
  unit: overrides.unit ?? "un",
  unit_price: overrides.unit_price ?? 4.5,
});

describe("evaluateAutoPersistEligibility", () => {
  const emptyCatalog: IngredientCanonicalInput[] = [];

  it("allows unmatched lines with sufficient purchase parsing", () => {
    const line = item("MOLHO BBQ 1KG", { unit: null });
    const result = evaluateAutoPersistEligibility(line, null, emptyCatalog);
    expect(result).toEqual({ eligible: true, reason: "eligible" });
  });

  it("blocks confirmed exact matches", () => {
    const catalog = [ingredient("k1", "KETCHUP HEINZ 570G")];
    const match = findCanonicalIngredientMatch("KETCHUP HEINZ SQUEEZE 570G", catalog);
    expect(match?.kind).toBe("exact");
    const result = evaluateAutoPersistEligibility(
      item("KETCHUP HEINZ SQUEEZE 570G"),
      match,
      catalog,
    );
    expect(result.reason).toBe("has_match");
  });

  it("blocks operational-equivalent suggestions", () => {
    const catalog = [ingredient("palha", "BATATA PALHA 2KG")];
    const match = findCanonicalIngredientMatch("PALHA SNACK FOOD SERVICE 2KG", catalog);
    expect(match?.kind).toBe("operational-equivalent");
    const result = evaluateAutoPersistEligibility(
      item("PALHA SNACK FOOD SERVICE 2KG"),
      match,
      catalog,
    );
    expect(result.reason).toBe("suggested_match");
  });

  it("blocks strong semantic-style matches promoted to exact", () => {
    const catalog = [ingredient("oil-a", "OLEO GIRASSOL VAQUEIRO 1L")];
    const match = findCanonicalIngredientMatch("OLEO GIRASSOL OLIVEIRA DA SERRA 1L", catalog);
    expect(match?.kind).toBe("exact");
    const result = evaluateAutoPersistEligibility(
      item("OLEO GIRASSOL OLIVEIRA DA SERRA 1L"),
      match,
      catalog,
    );
    expect(result.reason).toBe("has_match");
  });

  it("blocks duplicate normalized_name in catalog", () => {
    const catalog = [ingredient("b1", "BACON FATIAS", "bacon fatias")];
    const result = evaluateAutoPersistEligibility(item("BACON FATIAS"), null, catalog);
    expect(result.reason).toBe("duplicate_normalized_name");
  });

  it("blocks duplicate operational identity (ANGUS PTY variants)", () => {
    const catalog = [ingredient("angus-1", "ANGUS PTY", "angus pty")];
    const result = evaluateAutoPersistEligibility(item("Angus Patty"), null, catalog);
    expect(result.reason).toBe("duplicate_operational_identity");
  });

  it("blocks operational-family conflict with overlapping tokens", () => {
    const catalog = [ingredient("bread", "Pão de Batata 80g")];
    expect(catalogHasOperationalFamilyConflict("BATATA SHOESTRING PREMIUM 2KG", catalog)).toBe(
      true,
    );
    const result = evaluateAutoPersistEligibility(
      item("BATATA SHOESTRING PREMIUM 2KG"),
      null,
      catalog,
    );
    expect(result.reason).toBe("operational_family_conflict");
  });

  it("blocks weak purchase format rows", () => {
    const result = evaluateAutoPersistEligibility(
      item("PRODUTO SEM MEDIDA", { quantity: 1, unit: "un" }),
      null,
      emptyCatalog,
    );
    expect(result.reason).toBe("weak_purchase_format");
  });
});

describe("catalog dedupe helpers", () => {
  it("detects normalized_name duplicates", () => {
    const catalog = [ingredient("p1", "PICKLES FATIADOS", "pickles fatiados")];
    expect(catalogHasNormalizedNameDuplicate("pickles fatiados", catalog)).toBe(true);
    expect(catalogHasNormalizedNameDuplicate("molho bbq", catalog)).toBe(false);
  });

  it("detects same operational family canonical duplicates", () => {
    const catalog = [ingredient("k1", "KETCHUP HEINZ 570G")];
    expect(
      catalogHasSameOperationalFamilyDuplicate("KETCHUP GULOSO TOP DOWN 570G", catalog),
    ).toBe(false);
    expect(catalogHasOperationalFamilyConflict("BATATA SHOESTRING 2KG", catalog)).toBe(false);
  });
});

describe("buildIngredientInsertPayload", () => {
  it("maps structured purchase fields for auto-create", () => {
    const payload = buildIngredientInsertPayload(item("MOLHO BBQ 1KG"), "user-1");
    expect(payload).not.toBeNull();
    expect(payload?.normalized_name).toBe("molho bbq 1kg");
    expect(payload?.purchase_quantity).toBeGreaterThan(0);
    expect(payload?.base_unit).toBeTruthy();
  });
});

describe("autoPersistUnmatchedInvoiceItems", () => {
  it("persists once per session key and skips duplicates", async () => {
    const insert = vi.fn().mockResolvedValue({
      data: { id: "new-1", name: "MOLHO BBQ 1KG", normalized_name: "molho bbq 1kg", unit: "g" },
      error: null,
    });
    const client = {
      from: () => ({
        insert: () => ({
          select: () => ({
            single: insert,
          }),
        }),
      }),
    } as never;

    const attemptedKeys = new Set<string>();
    const invoiceId = "inv-1";
    const line = item("MOLHO BBQ 1KG", { unit: null });

    const first = await autoPersistUnmatchedInvoiceItems({
      client,
      userId: "user-1",
      invoiceId,
      items: [line, line],
      catalog: [],
      attemptedKeys,
    });

    expect(first.created).toBe(1);
    expect(first.skipped).toBe(1);
    expect(insert).toHaveBeenCalledTimes(1);
    expect(attemptedKeys.has(autoPersistSessionKey(invoiceId, "molho bbq 1kg"))).toBe(true);
  });
});
