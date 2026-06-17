import { describe, expect, it, vi } from "vitest";
import type { IngredientCanonicalInput } from "./ingredient-canonical";
import { findInvoiceItemIngredientMatch } from "./invoice-ingredient-match-propagation";
import {
  autoPersistSessionKey,
  autoPersistUnmatchedInvoiceItems,
  buildIngredientInsertPayload,
  catalogHasNormalizedNameDuplicate,
  catalogHasOperationalFamilyConflict,
  catalogHasSameOperationalFamilyDuplicate,
  evaluateAutoPersistEligibility,
  operationalCostFieldsFromInvoiceLine,
  persistIngredientFromInvoiceItem,
  persistOperationalIngredientCostFromInvoiceLine,
} from "./ingredient-auto-persist";
import { recordInvoiceLineAliasMemory } from "./ingredient-match-alias-memory";

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

  it("allows unmatched lines with sufficient purchase parsing (non-shorthand names)", () => {
    const line = item("QUEIJO MOZARELLA FATIADO 1KG", { unit: null });
    const result = evaluateAutoPersistEligibility(line, null, emptyCatalog);
    expect(result).toEqual({ eligible: true, reason: "eligible" });
  });

  it("blocks confirmed exact matches", () => {
    const catalog = [ingredient("k1", "KETCHUP HEINZ 570G")];
    const match = findInvoiceItemIngredientMatch("KETCHUP HEINZ SQUEEZE 570G", catalog);
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
    const match = findInvoiceItemIngredientMatch("PALHA SNACK FOOD SERVICE 2KG", catalog);
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
    const match = findInvoiceItemIngredientMatch("OLEO GIRASSOL OLIVEIRA DA SERRA 1L", catalog);
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

  it("records alias memory instead of creating when canonical match exists", () => {
    const catalog = [ingredient("bacon", "BACON FATIADO FUMADO 1KG")];
    const match = findInvoiceItemIngredientMatch("BAC FUM FAT", catalog);
    expect(match).not.toBeNull();
    expect(match?.ingredient.id).toBe("bacon");
    const eligibility = evaluateAutoPersistEligibility(item("BAC FUM FAT"), match, catalog);
    expect(eligibility.reason).toBe("has_match");
    const aliasApplied = recordInvoiceLineAliasMemory({
      itemName: "BAC FUM FAT",
      match: match!,
      confirmedAliases: {},
    });
    expect(aliasApplied.recorded).toBe(true);
  });

  it("blocks auto-create for invoice shorthand without a canonical match", () => {
    const result = evaluateAutoPersistEligibility(item("BAC FUM FAT"), null, []);
    expect(result.eligible).toBe(false);
    expect(result.reason).toBe("invoice_shorthand");
  });

  it("blocks ANGUS PTY and HMB 180 from auto-create eligibility", () => {
    for (const name of ["ANGUS PTY", "HMB 180", "BAC STRK", "ON RNG", "JALP SLC", "CHK BREADED"]) {
      const result = evaluateAutoPersistEligibility(item(name), null, []);
      expect(result).toEqual({ eligible: false, reason: "invoice_shorthand" });
    }
  });

  it("blocks weak purchase format rows", () => {
    const result = evaluateAutoPersistEligibility(
      item("produto sem medida", { quantity: 1, unit: "un" }),
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

  it("keeps unit and base_unit consistent for countable OCR un rows", () => {
    const payload = buildIngredientInsertPayload(
      item("QUEIJO CHEDDAR 1KG", { quantity: 2, unit: "un" }),
      "user-1",
    );
    expect(payload).not.toBeNull();
    expect(payload?.unit).toBe("un");
    expect(payload?.base_unit).toBe("un");
    expect(payload?.purchase_unit).toBe("un");
    expect(payload?.unit).not.toBe("g");
    expect(payload?.base_unit).not.toBe("g");
  });
});

describe("autoPersistUnmatchedInvoiceItems", () => {
  it("never inserts CHK BREADED unmatched lines", async () => {
    const insert = vi.fn();
    const client = {
      from: () => ({
        insert: () => ({
          select: () => ({ single: insert }),
        }),
      }),
    } as never;

    const result = await autoPersistUnmatchedInvoiceItems({
      client,
      userId: "user-1",
      invoiceId: "inv-chk",
      items: [item("CHK BREADED")],
      catalog: [],
      attemptedKeys: new Set(),
    });

    expect(result.created).toBe(0);
    expect(result.skipped).toBe(1);
    expect(insert).not.toHaveBeenCalled();
  });

  it("never inserts ingredients — only alias memory and skips", async () => {
    const insert = vi.fn();
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

    expect(first.created).toBe(0);
    expect(first.skipped).toBe(2);
    expect(insert).not.toHaveBeenCalled();
    expect(attemptedKeys.has(autoPersistSessionKey(invoiceId, "molho bbq 1kg"))).toBe(true);
  });
});

describe("persistIngredientFromInvoiceItem", () => {
  it("blocks insert without explicit_user source", async () => {
    const insert = vi.fn();
    const client = {
      from: () => ({
        insert: () => ({
          select: () => ({ single: insert }),
        }),
        select: () => ({ data: [], error: null }),
      }),
    } as never;

    const payload = buildIngredientInsertPayload(item("MOLHO BBQ 1KG"), "user-1");
    const result = await persistIngredientFromInvoiceItem(client, payload!, { catalog: [] });
    expect(result.blocked).toBe(true);
    expect(result.blockReason).toBe("canonical_ingredients_require_explicit_user_create");
    expect(insert).not.toHaveBeenCalled();
  });

  it("blocks ANGUS PTY even with explicit_user source", async () => {
    const insert = vi.fn();
    const client = {
      from: () => ({
        insert: () => ({
          select: () => ({ single: insert }),
        }),
        select: () => ({ data: [], error: null }),
      }),
    } as never;

    const payload = buildIngredientInsertPayload(item("ANGUS PTY"), "user-1");
    const result = await persistIngredientFromInvoiceItem(client, payload!, {
      catalog: [],
      source: "explicit_user",
    });
    expect(result.blocked).toBe(true);
    expect(result.blockReason).toBe("invoice_shorthand_not_canonical");
    expect(insert).not.toHaveBeenCalled();
  });
});

function createPersistUpdateMockClient(ingredient: {
  name: string;
  unit: string | null;
  current_price: number | null;
  purchase_quantity: number | null;
  purchase_unit?: string | null;
  base_unit?: string | null;
}) {
  const updates: Record<string, unknown>[] = [];
  const client = {
    from: (table: string) => {
      if (table === "ingredients") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: ingredient, error: null }),
            }),
          }),
          update: (payload: Record<string, unknown>) => ({
            eq: async () => {
              updates.push(payload);
              Object.assign(ingredient, payload);
              return { error: null };
            },
          }),
        };
      }
      return {};
    },
  };
  return { client, updates, ingredient };
}

describe("persistOperationalIngredientCostFromInvoiceLine — catalog pack fields", () => {
  it.each([
    {
      product: "San Pellegrino",
      line: {
        name: "SanPellegrino - Acqua in vitro 75cl x 15ud",
        quantity: 1,
        unit: "un" as const,
        unit_price: 19.32,
      },
      expected: { purchase_quantity: 15, purchase_unit: "un", base_unit: "un", unit: "un" },
    },
    {
      product: "Peroni",
      line: {
        name: "Peroni 24x33cl",
        quantity: 1,
        unit: null,
        unit_price: 24.5,
      },
      expected: { purchase_quantity: 24, purchase_unit: "un", base_unit: "un", unit: "un" },
    },
    {
      product: "Nata",
      line: {
        name: "Nata 6x1L",
        quantity: 1,
        unit: "un" as const,
        unit_price: 3.05,
      },
      expected: { purchase_quantity: 6, purchase_unit: "un", base_unit: "un", unit: "un" },
    },
  ])("persists catalog pack count for $product multipacks", async ({ line, expected }) => {
    const operational = operationalCostFieldsFromInvoiceLine(line);
    expect(operational?.cost_base_unit).not.toBe("un");
    expect(operational?.purchase_quantity).not.toBe(expected.purchase_quantity);

    const { client, updates, ingredient } = createPersistUpdateMockClient({
      name: line.name,
      unit: "ml",
      current_price: 10,
      purchase_quantity: expected.purchase_quantity,
      purchase_unit: "un",
      base_unit: "un",
    });

    const result = await persistOperationalIngredientCostFromInvoiceLine(
      client as never,
      "ing-multipack",
      line,
    );

    expect(result.updated).toBe(true);
    expect(updates[0]).toMatchObject({
      current_price: line.unit_price,
      ...expected,
    });
    expect(ingredient.purchase_quantity).toBe(expected.purchase_quantity);
    expect(ingredient.purchase_unit).toBe("un");
  });

  it.each([
    {
      product: "Anchoas",
      line: {
        name: "Filete de Anchovas Alconfrisa Lt 495 g",
        quantity: 2,
        unit: "un" as const,
        unit_price: 6.29,
        total: 12.58,
      },
      expected: { purchase_quantity: 1, cost_base_unit: "un" as const },
    },
    {
      product: "Gema",
      line: {
        name: "Ovo Líquido Past.Gema Dovo 1kg",
        quantity: 6,
        unit: "un" as const,
        unit_price: 10.19,
        total: 61.14,
      },
      expected: { purchase_quantity: 1, cost_base_unit: "un" as const },
    },
  ])("operational cost for countable $product", ({ line, expected }) => {
    const fields = operationalCostFieldsFromInvoiceLine(line);
    expect(fields).toMatchObject({
      current_price: line.unit_price,
      ...expected,
    });
  });

  it.each([
    {
      product: "Prosciutto",
      line: {
        name: "Rovagnati - Assaporami Prosciutto Cotto Scelto HC 4+ 4,25Kg",
        quantity: 4.3,
        unit: null,
        unit_price: 8.5,
      },
    },
    {
      product: "Bresaola",
      line: {
        name: "Rigamonti - Bresaola Punta d'Anca Oro 1/2 ~1,5Kg",
        quantity: 1.83,
        unit: null,
        unit_price: 22.5,
      },
    },
    {
      product: "Mortadella",
      line: {
        name: "Rovagnati - Mortadella IGP 'Massima' con Pistacchio 1/2 ~3,5Kg",
        quantity: 3.11,
        unit: null,
        unit_price: 12.0,
      },
    },
  ])("weight-priced $product uses kg costing contract", ({ line }) => {
    const fields = operationalCostFieldsFromInvoiceLine(line);
    expect(fields).toMatchObject({
      current_price: line.unit_price,
      purchase_quantity: 1000,
      cost_base_unit: "g",
    });
  });

  it.each([
    {
      product: "Pepino",
      line: { name: "Pepino", quantity: 3.36, unit: "kg" as const, unit_price: 1.77 },
    },
    {
      product: "Courgettes",
      line: { name: "Courgettes", quantity: 3.3, unit: "kg" as const, unit_price: 2.5 },
    },
  ])("$product explicit kg OCR keeps kg costing contract", ({ line }) => {
    const fields = operationalCostFieldsFromInvoiceLine(line);
    expect(fields).toMatchObject({
      current_price: line.unit_price,
      purchase_quantity: 1000,
      cost_base_unit: "g",
    });
  });

  it.each([
    {
      product: "Atum",
      line: {
        name: "Atum Oleo Bolsa Nau Catrineta 1 Kg",
        quantity: 1,
        unit: "un" as const,
        unit_price: 13.1,
        total: 13.1,
      },
    },
    {
      product: "Gema",
      line: {
        name: "Ovo Líquido Past.Gema Dovo 1 Kg",
        quantity: 6,
        unit: "un" as const,
        unit_price: 10.49,
        total: 62.94,
      },
    },
    {
      product: "Anchoas",
      line: {
        name: "Filete de Anchoas Alconfirosa LI 495 g",
        quantity: 2,
        unit: "un" as const,
        unit_price: 9.99,
        total: 19.98,
      },
    },
  ])(
    "persists unit fields for countable Class B $product (cost_base_unit=un)",
    async ({ line }) => {
      const operational = operationalCostFieldsFromInvoiceLine(line);
      expect(operational).toMatchObject({
        current_price: line.unit_price,
        purchase_quantity: 1,
        cost_base_unit: "un",
      });

      const { client, updates, ingredient } = createPersistUpdateMockClient({
        name: line.name,
        unit: null,
        current_price: 5,
        purchase_quantity: 1,
      });

      const result = await persistOperationalIngredientCostFromInvoiceLine(
        client as never,
        "ing-class-b",
        line,
      );

      expect(result.updated).toBe(true);
      expect(updates[0]).toMatchObject({
        current_price: line.unit_price,
        purchase_quantity: 1,
        purchase_unit: "un",
        base_unit: "un",
        unit: "un",
      });
      expect(ingredient.unit).toBe("un");
      expect(ingredient.purchase_unit).toBe("un");
      expect(ingredient.base_unit).toBe("un");
    },
  );

  it("does not overwrite unit fields for non-multipack weight rows", async () => {
    const line = {
      name: "QUEIJO MOZARELLA FATIADO 1KG",
      quantity: 1,
      unit: "kg" as const,
      unit_price: 9.5,
    };
    const { client, updates, ingredient } = createPersistUpdateMockClient({
      name: "Mozzarella 1kg",
      unit: "kg",
      current_price: 8,
      purchase_quantity: 1000,
      purchase_unit: "g",
      base_unit: "g",
    });

    await persistOperationalIngredientCostFromInvoiceLine(client as never, "ing-moz", line);

    expect(updates[0]).toEqual({
      current_price: 9.5,
      purchase_quantity: 1000,
    });
    expect(updates[0]).not.toHaveProperty("purchase_unit");
    expect(ingredient.unit).toBe("kg");
  });
});
