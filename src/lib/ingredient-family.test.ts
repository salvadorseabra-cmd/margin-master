import { beforeEach, describe, expect, it, vi } from "vitest";
import type { IngredientCanonicalInput } from "./ingredient-canonical";
import {
  classifyIngredientFamily,
  findRelatedByFamily,
  ingredientFamilyIdForName,
} from "./ingredient-family";
import { setIngredientFamilyOverride } from "./ingredient-family-storage";

function ingredient(
  id: string,
  name: string,
  normalized_name?: string,
): IngredientCanonicalInput {
  return { id, name, normalized_name: normalized_name ?? name.toLowerCase() };
}

const storage = new Map<string, string>();

beforeEach(() => {
  storage.clear();
  const localStorage = {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => {
      storage.set(key, value);
    },
    removeItem: (key: string) => {
      storage.delete(key);
    },
    clear: () => storage.clear(),
  };
  vi.stubGlobal("localStorage", localStorage);
  vi.stubGlobal("window", { localStorage });
});

describe("classifyIngredientFamily — frozen potato variants", () => {
  const batataVariants = [
    ["palha", "Batata palha"],
    ["shoestring", "Batata shoestring"],
    ["frita", "Batata frita"],
    ["wedge", "Batata wedge"],
  ] as const;

  it.each(batataVariants)("classifies %s as frozen_potato", (_slug, name) => {
    const result = classifyIngredientFamily({
      ingredient: ingredient(`bat-${_slug}`, name),
    });
    expect(result?.familyId).toBe("frozen_potato");
  });

  it("keeps separate canonical ids across siblings in catalog", () => {
    const catalog = batataVariants.map(([slug, name]) => ingredient(`bat-${slug}`, name));
    const shoestring = classifyIngredientFamily({
      ingredient: catalog[1]!,
      catalog,
    });
    expect(shoestring?.familyId).toBe("frozen_potato");
    expect(shoestring?.relatedIngredientIds?.sort()).toEqual(["bat-frita", "bat-palha", "bat-wedge"]);
    const ids = catalog.map((row) => row.id);
    expect(new Set(ids).size).toBe(4);
  });

  it("explains Batata shoestring with token expansion reasons", () => {
    const result = classifyIngredientFamily({
      ingredient: ingredient("bat-shoe", "Batata shoestring"),
    });
    expect(result?.familyId).toBe("frozen_potato");
    expect(result?.label).toBe("Frozen potato products");
    expect(result?.reasons.join(" ")).toMatch(/shoestring|Batata/i);
  });

  it("classifies BAT SHOESTR shorthand via token expansion", () => {
    const result = classifyIngredientFamily({
      ingredient: ingredient("bat-shoestr", "BAT SHOESTR"),
      aliasRows: [{ aliasName: "BAT SHOESTR 2.5KG" }],
    });
    expect(result?.familyId).toBe("frozen_potato");
    expect(result?.reasons.some((r) => r.includes("Token expansion"))).toBe(true);
  });
});

describe("classifyIngredientFamily — distinct families", () => {
  it("separates bacon from frozen potato", () => {
    const potato = classifyIngredientFamily({
      ingredient: ingredient("bat-palha", "Batata palha"),
    });
    const bacon = classifyIngredientFamily({
      ingredient: ingredient("bac-1", "Bacon fatiado"),
    });
    expect(potato?.familyId).toBe("frozen_potato");
    expect(bacon?.familyId).toBe("bacon_products");
    expect(potato?.familyId).not.toBe(bacon?.familyId);
  });

  it("separates burger bread from frozen potato", () => {
    expect(
      classifyIngredientFamily({ ingredient: ingredient("bread", "Pão de Batata 80g") })?.familyId,
    ).toBe("burger_bread");
    expect(
      classifyIngredientFamily({ ingredient: ingredient("fries", "Batata shoestring") })
        ?.familyId,
    ).toBe("frozen_potato");
  });
});

describe("findRelatedByFamily", () => {
  it("returns siblings without merging ids", () => {
    const catalog = [
      ingredient("a", "Batata palha"),
      ingredient("b", "Batata shoestring"),
      ingredient("c", "Bacon fatiado"),
    ];
    const related = findRelatedByFamily(catalog, "frozen_potato", "a");
    expect(related.map((r) => r.id)).toEqual(["b"]);
    expect(related[0]?.displayName).toBe("Batata shoestring");
  });
});

describe("no merge side effects", () => {
  it("does not export or invoke merge helpers", async () => {
    const mod = await import("./ingredient-family");
    expect(Object.keys(mod)).not.toContain("mergeIngredients");
    expect(Object.keys(mod)).not.toContain("mergeCanonicalIngredients");
  });

  it("preserves ingredient id in classification output", () => {
    const id = "canonical-uuid-123";
    const result = classifyIngredientFamily({
      ingredient: ingredient(id, "Batata palha"),
    });
    expect(result).not.toHaveProperty("mergedIntoId");
    expect(result?.relatedIngredientIds ?? []).not.toContain(id);
  });
});

describe("ingredientFamilyIdForName", () => {
  it("probes names without catalog mutation", () => {
    expect(ingredientFamilyIdForName("Batata frita")).toBe("frozen_potato");
    expect(ingredientFamilyIdForName("Bacon streaky")).toBe("bacon_products");
  });
});

describe("user overrides", () => {
  it("applies localStorage family override", () => {
    setIngredientFamilyOverride("user-1", "custom-1", "leafy_greens");
    const result = classifyIngredientFamily({
      ingredient: ingredient("custom-1", "Batata palha"),
      userId: "user-1",
    });
    expect(result?.familyId).toBe("leafy_greens");
    expect(result?.reasons[0]).toMatch(/override/i);
  });
});
