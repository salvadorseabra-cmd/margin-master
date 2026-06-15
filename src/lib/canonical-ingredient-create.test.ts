import { describe, expect, it, vi } from "vitest";
import { looksLikeInvoiceShorthandName } from "./ingredient-kind";
import {
  applyManualIngredientCorrection,
  persistManualIngredientCorrection,
} from "./ingredient-correction-memory";
import type { AppSupabaseClient } from "./ingredient-alias-memory";
import {
  buildCanonicalIngredientCreateDefaults,
  buildExplicitCanonicalInsertPayload,
  isCatalogReadyInvoiceName,
  isNonFoodInvoiceLine,
  traceCanonicalConfirmedName,
  traceCanonicalModalOpen,
  traceCanonicalSuggestion,
  validateCanonicalIngredientName,
} from "./canonical-ingredient-create";

const item = (
  name: string,
  overrides: Partial<{ quantity: number | null; unit: string | null; unit_price: number | null }> = {},
) => ({
  id: "item-1",
  name,
  quantity: overrides.quantity ?? 10,
  unit: overrides.unit ?? "un",
  unit_price: overrides.unit_price ?? 12.5,
});

describe("validateCanonicalIngredientName", () => {
  it("requires a non-empty name", () => {
    expect(validateCanonicalIngredientName("  ")).toEqual({
      ok: false,
      message: "Enter a catalog ingredient name.",
    });
  });

  it("blocks invoice shorthand", () => {
    expect(validateCanonicalIngredientName("ANGUS PTY").ok).toBe(false);
    expect(validateCanonicalIngredientName("BAC FUM FAT").ok).toBe(false);
  });

  it("allows catalog-ready invoice names that match alias after display casing", () => {
    expect(validateCanonicalIngredientName("Tomilho", { invoiceAlias: "Tomilho" })).toEqual({
      ok: true,
    });
    expect(validateCanonicalIngredientName("Alho francês", { invoiceAlias: "Alho Francês" })).toEqual({
      ok: true,
    });
  });

  it("blocks confirmed name that equals invoice alias when not catalog-ready", () => {
    expect(
      validateCanonicalIngredientName("Óleo girassol fula 1L", {
        invoiceAlias: "Óleo girassol fula 1L",
      }),
    ).toEqual({
      ok: false,
      message: "Enter a catalog name, not invoice shorthand",
    });
    expect(
      validateCanonicalIngredientName("oleo girassol 1l", {
        invoiceAlias: "Óleo girassol 1L",
      }),
    ).toEqual({
      ok: false,
      message: "Enter a catalog name, not invoice shorthand",
    });
  });

  it("allows human catalog names distinct from invoice alias", () => {
    expect(validateCanonicalIngredientName("Angus Burger Patty 180g")).toEqual({ ok: true });
    expect(validateCanonicalIngredientName("Hambúrguer Angus 180g")).toEqual({ ok: true });
    expect(
      validateCanonicalIngredientName("Óleo girassol", {
        invoiceAlias: "Óleo girassol fula 1L",
      }),
    ).toEqual({ ok: true });
  });

  it("allows Phase 2 cleaned suggestions on validate + insert", () => {
    expect(
      validateCanonicalIngredientName("Pêra abacate", {
        invoiceAlias: "Pêra Abacate Hasse",
      }),
    ).toEqual({ ok: true });
    expect(
      validateCanonicalIngredientName("Ovo classe M", {
        invoiceAlias: "Ovo MORENO Classe M Cx.15 dúzias (CARTÃO)",
      }),
    ).toEqual({ ok: true });
    expect(
      validateCanonicalIngredientName("Salada ibérica", {
        invoiceAlias: "Salada Ibérica FSTK EMB. 250g",
      }),
    ).toEqual({ ok: true });
  });
});

describe("isCatalogReadyInvoiceName", () => {
  it.each([
    "Tomilho",
    "Manjericão",
    "Hortelã",
    "Alho Francês",
    "Courgettes",
    "Abóbora Butternut",
  ])("detects catalog-ready produce/herb %s", (name) => {
    expect(isCatalogReadyInvoiceName(name)).toBe(true);
  });

  it("rejects shorthand, noisy, and multi-word brand lines", () => {
    expect(isCatalogReadyInvoiceName("ANGUS PTY")).toBe(false);
    expect(isCatalogReadyInvoiceName("Óleo girassol fula 1L")).toBe(false);
    expect(isCatalogReadyInvoiceName("Pêra Abacate Hasse")).toBe(false);
    expect(isCatalogReadyInvoiceName("Salada Ibérica FSTK EMB. 250g")).toBe(false);
  });
});

describe("buildCanonicalIngredientCreateDefaults", () => {
  it("leaves confirmed name empty and separates suggestion for invoice shorthand", () => {
    const defaults = buildCanonicalIngredientCreateDefaults(item("ANGUS PTY"), {
      supplierName: "Metro",
    });
    expect(defaults.invoiceAlias).toBe("ANGUS PTY");
    expect(defaults.suggestedCanonicalName).toBe("Angus patty");
    expect(defaults.supplierName).toBe("Metro");
    expect(defaults.current_price).toBe("12.5");
    expect(defaults.itemId).toBe("item-1");
  });

  it("suggests canonical preview without auto-filling confirmed name", () => {
    const defaults = buildCanonicalIngredientCreateDefaults(
      item("QUEIJO MOZARELLA FATIADO 1KG", { unit: "kg" }),
    );
    expect(defaults.suggestedCanonicalName).toBe("Queijo mozarella fatiado");
    expect(defaults.invoiceQuantityLabel).toContain("10");
  });

  it("does not suggest when cleanup preview equals invoice alias and line is not catalog-ready", () => {
    const defaults = buildCanonicalIngredientCreateDefaults(item("Óleo girassol fula 1L"));
    expect(defaults.invoiceAlias).toBe("Óleo girassol fula 1L");
    expect(defaults.suggestedCanonicalName).toBeNull();
    expect(defaults.catalogReady).toBe(false);
  });

  it.each([
    ["Tomilho", "Tomilho"],
    ["Manjericão", "Manjericão"],
    ["Hortelã", "Hortelã"],
    ["Alho Francês", "Alho francês"],
    ["Courgettes", "Courgettes"],
    ["Abóbora Butternut", "Abóbora butternut"],
  ])("suggests and marks catalog-ready for %s", (invoiceName, expectedSuggestion) => {
    const defaults = buildCanonicalIngredientCreateDefaults(item(invoiceName));
    expect(defaults.suggestedCanonicalName).toBe(expectedSuggestion);
    expect(defaults.catalogReady).toBe(true);
  });

  it("does not mark noisy three-token lines as catalog-ready before cleanup", () => {
    const defaults = buildCanonicalIngredientCreateDefaults(item("Pêra Abacate Hasse"));
    expect(defaults.catalogReady).toBe(false);
  });

  it("suggests cleaned name for Pêra Abacate Hasse after brand strip", () => {
    const defaults = buildCanonicalIngredientCreateDefaults(item("Pêra Abacate Hasse"));
    expect(defaults.suggestedCanonicalName).toBe("Pêra abacate");
  });

  it("strips phase 2 noise from weak canonical examples", () => {
    expect(
      buildCanonicalIngredientCreateDefaults(item("Manteiga Coimbra s/Sal EMB 1 Kg"))
        .suggestedCanonicalName,
    ).toBe("Manteiga s/sal");
    expect(
      buildCanonicalIngredientCreateDefaults(
        item("Ovo MORENO Classe M Cx.15 dúzias (CARTÃO)"),
      ).suggestedCanonicalName,
    ).toBe("Ovo classe M");
    expect(
      buildCanonicalIngredientCreateDefaults(item("Salada Ibérica FSTK EMB. 250g"))
        .suggestedCanonicalName,
    ).toBe("Salada ibérica");
    expect(
      buildCanonicalIngredientCreateDefaults(item("Arroz Agulha Metro Chef 12x1kg"))
        .suggestedCanonicalName,
    ).toBe("Arroz agulha");
  });

  it("suggests Batata shoestring for BAT shoestr invoice shorthand", () => {
    const defaults = buildCanonicalIngredientCreateDefaults(item("BAT shoestr"));
    expect(defaults.suggestedCanonicalName).toBe("Batata shoestring");
  });

  it("rejects BAT shoestr as confirmed catalog name", () => {
    expect(validateCanonicalIngredientName("BAT shoestr").ok).toBe(false);
    expect(validateCanonicalIngredientName("BAT shoestr").message).toContain("Batata shoestring");
  });

  it("emits modal open log and omits suggestion when cleanup matches invoice alias", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const oilDefaults = buildCanonicalIngredientCreateDefaults(item("Óleo girassol fula 1L"));
    expect(oilDefaults.suggestedCanonicalName).toBeNull();
    expect(info).toHaveBeenCalledWith(
      "[canonical_modal_open]",
      expect.objectContaining({
        rawInvoiceText: "Óleo girassol fula 1L",
        itemId: "item-1",
      }),
    );
    info.mockClear();
    buildCanonicalIngredientCreateDefaults(item("QUEIJO MOZARELLA FATIADO 1KG"));
    expect(info).toHaveBeenCalledWith(
      "[canonical_suggestion]",
      expect.objectContaining({ suggestedName: "Queijo mozarella fatiado" }),
    );
    info.mockRestore();
  });

  it("emits confirmed name log before insert payload build", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    buildExplicitCanonicalInsertPayload({
      canonicalName: "Óleo girassol",
      item: item("Óleo girassol fula 1L"),
      userId: "user-1",
    });
    expect(info).toHaveBeenCalledWith(
      "[canonical_confirmed_name]",
      expect.objectContaining({ confirmedName: "Óleo girassol" }),
    );
    info.mockRestore();
  });

  it("suggests final cleanup edge cases", () => {
    expect(
      buildCanonicalIngredientCreateDefaults(item("MOZZA Fior di Latte Expet Julienne 3kg Simonetta"))
        .suggestedCanonicalName,
    ).toBe("Mozzarella fior di latte julienne");
    expect(
      buildCanonicalIngredientCreateDefaults(item("De Cecco - Paccheri Lisci Nr. 125 - 500g"))
        .suggestedCanonicalName,
    ).toBe("Paccheri lisci");
    expect(
      buildCanonicalIngredientCreateDefaults(item("ACQUA S.PELLEGRINO (CX 75CL*15)"))
        .suggestedCanonicalName,
    ).toBe("Água san pellegrino 75cl");
  });

  it("excludes non-food recargo lines from canonical create", () => {
    expect(isNonFoodInvoiceLine("Recargo por combustibili")).toBe(true);
    const defaults = buildCanonicalIngredientCreateDefaults(item("Recargo por combustibili"));
    expect(defaults.suggestedCanonicalName).toBeNull();
    expect(validateCanonicalIngredientName("Recargo por combustibili").ok).toBe(false);
  });
});

describe("buildExplicitCanonicalInsertPayload", () => {
  it("uses user canonical name, not invoice alias", () => {
    const payload = buildExplicitCanonicalInsertPayload({
      canonicalName: "Angus Burger Patty 180g",
      item: item("ANGUS PTY"),
      userId: "user-1",
    });
    expect(payload).not.toBeNull();
    expect(payload?.name).toBe("Angus burger patty 180g");
    expect(payload?.normalized_name).toBe("angus burger patty 180g");
    expect(payload?.user_id).toBe("user-1");
  });

  it("normalizes shouty uppercase names on save", () => {
    const payload = buildExplicitCanonicalInsertPayload({
      canonicalName: "OLEO GIRASSOL 10L",
      item: item("OLEO GIRASSOL VAQUEIRO 10L"),
      userId: "user-1",
    });
    expect(payload?.name).toBe("Oleo girassol");
    expect(payload?.normalized_name).toBe("oleo girassol");
  });

  it("returns null when confirmed name equals invoice alias for non-catalog-ready lines", () => {
    const payload = buildExplicitCanonicalInsertPayload({
      canonicalName: "Óleo girassol fula 1L",
      item: item("Óleo girassol fula 1L"),
      userId: "user-1",
    });
    expect(payload).toBeNull();
  });

  it("creates payload for catalog-ready names that match invoice alias", () => {
    const payload = buildExplicitCanonicalInsertPayload({
      canonicalName: "Tomilho",
      item: item("Tomilho"),
      userId: "user-1",
    });
    expect(payload).not.toBeNull();
    expect(payload?.name).toBe("Tomilho");
    expect(payload?.normalized_name).toBe("tomilho");
  });

  it("returns null for shorthand canonical names", () => {
    const payload = buildExplicitCanonicalInsertPayload({
      canonicalName: "ANGUS PTY",
      item: item("ANGUS PTY"),
      userId: "user-1",
    });
    expect(payload).toBeNull();
  });

  it("creates payload for Phase 2 cleaned suggestions", () => {
    const peraPayload = buildExplicitCanonicalInsertPayload({
      canonicalName: "Pêra abacate",
      item: item("Pêra Abacate Hasse"),
      userId: "user-1",
    });
    expect(peraPayload).not.toBeNull();
    expect(peraPayload?.name).toBe("Pêra abacate");

    const ovoPayload = buildExplicitCanonicalInsertPayload({
      canonicalName: "Ovo classe M",
      item: item("Ovo MORENO Classe M Cx.15 dúzias (CARTÃO)"),
      userId: "user-1",
    });
    expect(ovoPayload).not.toBeNull();
    expect(ovoPayload?.name).toBe("Ovo classe M");

    const saladaPayload = buildExplicitCanonicalInsertPayload({
      canonicalName: "Salada ibérica",
      item: item("Salada Ibérica FSTK EMB. 250g"),
      userId: "user-1",
    });
    expect(saladaPayload).not.toBeNull();
    expect(saladaPayload?.name).toBe("Salada ibérica");
  });

  it('preserves batata+palha in normalized_name for "Batata palha"', () => {
    const payload = buildExplicitCanonicalInsertPayload({
      canonicalName: "Batata palha",
      item: item("Batata Palha Auchan 2kg"),
      userId: "user-1",
    });
    expect(payload).not.toBeNull();
    expect(payload?.name).toBe("Batata palha");
    expect(payload?.normalized_name).toBe("batata palha");
    expect(payload?.normalized_name).toContain("batata");
    expect(payload?.normalized_name).toContain("palha");
  });

  it("builds canonical payload for CHK BREADED invoice line", () => {
    const payload = buildExplicitCanonicalInsertPayload({
      canonicalName: "Chicken Breaded / Frango Panado",
      item: item("CHK BREADED"),
      userId: "user-1",
    });
    expect(payload).not.toBeNull();
    expect(payload?.name).toBe("Chicken breaded / frango panado");
    expect(looksLikeInvoiceShorthandName("CHK BREADED")).toBe(true);
  });
});

describe("canonical create trace helpers", () => {
  it("logs confirmed name with stable prefix", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    traceCanonicalConfirmedName({ confirmedName: "Óleo girassol" });
    traceCanonicalModalOpen({ rawInvoiceText: "line", itemId: "id-1" });
    traceCanonicalSuggestion({ suggestedName: "Oleo girassol" });
    expect(info).toHaveBeenCalledWith("[canonical_confirmed_name]", {
      confirmedName: "Óleo girassol",
    });
    expect(info).toHaveBeenCalledWith("[canonical_modal_open]", {
      rawInvoiceText: "line",
      itemId: "id-1",
    });
    expect(info).toHaveBeenCalledWith("[canonical_suggestion]", {
      suggestedName: "Oleo girassol",
    });
    info.mockRestore();
  });
});

describe("Batata Palha Auchan canonical create alias regression", () => {
  it("persists invoice alias and rematch keys after create from shorthand line", async () => {
    const insertCalls: Record<string, unknown>[] = [];
    const supabase = {
      from(table: string) {
        if (table !== "ingredient_aliases") throw new Error(`unexpected table ${table}`);
        return {
          select() {
            return {
              eq() {
                return {
                  eq() {
                    return {
                      is() {
                        return { maybeSingle: async () => ({ data: null, error: null }) };
                      },
                      eq() {
                        return { maybeSingle: async () => ({ data: null, error: null }) };
                      },
                    };
                  },
                };
              },
            };
          },
          insert(payload: Record<string, unknown>) {
            insertCalls.push(payload);
            return Promise.resolve({ error: null });
          },
          update() {
            return { eq: () => Promise.resolve({ error: null }) };
          },
        };
      },
    } as unknown as AppSupabaseClient;

    const payload = buildExplicitCanonicalInsertPayload({
      canonicalName: "Batata palha",
      item: item("Batata Palha Auchan 2kg"),
      userId: "user-1",
    });
    expect(payload?.normalized_name).toBe("batata palha");

    const inMemory = applyManualIngredientCorrection(
      {
        itemName: "Batata Palha Auchan 2kg",
        ingredientId: "bat-palha-uuid",
        ingredientName: payload!.name,
        supplierName: "Auchan",
      },
      {},
    );
    expect(inMemory).not.toBeNull();
    expect(inMemory!.nextConfirmedAliases[inMemory!.aliasLookupKey]).toBe("bat-palha-uuid");

    const persisted = await persistManualIngredientCorrection({
      itemName: "Batata Palha Auchan 2kg",
      ingredientId: "bat-palha-uuid",
      ingredientName: payload!.name,
      confirmedAliases: {},
      supabase,
      supplierName: "Auchan",
    });
    expect(persisted.error).toBeNull();
    expect(insertCalls[0]).toMatchObject({
      alias_name: "Batata Palha Auchan 2kg",
      ingredient_id: "bat-palha-uuid",
    });
  });
});

describe("CHK BREADED canonical create alias regression", () => {
  it("persists invoice alias and rematch keys after manual link", async () => {
    const insertCalls: Record<string, unknown>[] = [];
    const supabase = {
      from(table: string) {
        if (table !== "ingredient_aliases") throw new Error(`unexpected table ${table}`);
        return {
          select() {
            return {
              eq() {
                return {
                  eq() {
                    return {
                      is() {
                        return { maybeSingle: async () => ({ data: null, error: null }) };
                      },
                      eq() {
                        return { maybeSingle: async () => ({ data: null, error: null }) };
                      },
                    };
                  },
                };
              },
            };
          },
          insert(payload: Record<string, unknown>) {
            insertCalls.push(payload);
            return Promise.resolve({ error: null });
          },
          update() {
            return { eq: () => Promise.resolve({ error: null }) };
          },
        };
      },
    } as unknown as AppSupabaseClient;

    const inMemory = applyManualIngredientCorrection(
      {
        itemName: "CHK BREADED",
        ingredientId: "chk-uuid",
        ingredientName: "Chicken Breaded / Frango Panado",
        supplierName: null,
      },
      {},
    );
    expect(inMemory).not.toBeNull();
    expect(inMemory!.nextConfirmedAliases["chicken breaded"]).toBe("chk-uuid");

    const persisted = await persistManualIngredientCorrection({
      itemName: "CHK BREADED",
      ingredientId: "chk-uuid",
      ingredientName: "Chicken Breaded / Frango Panado",
      confirmedAliases: {},
      supabase,
    });
    expect(persisted.error).toBeNull();
    expect(insertCalls[0]).toMatchObject({
      alias_name: "CHK BREADED",
      normalized_alias: "chicken breaded",
      ingredient_id: "chk-uuid",
    });
  });
});
