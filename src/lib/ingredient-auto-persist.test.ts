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
  persistIngredientFromInvoiceItem,
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
