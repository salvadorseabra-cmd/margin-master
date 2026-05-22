import { describe, expect, it } from "vitest";
import {
  filterActiveCatalogIngredients,
  type IngredientCanonicalInput,
} from "./ingredient-canonical";
import {
  loadActiveIngredientCatalog,
  loadCanonicalIngredientCatalog,
  loadMatchingIngredientCatalog,
} from "./ingredient-catalog-load";
import { buildCanonicalIngredientPickerOptions } from "./ingredient-picker-options";
import { INGREDIENT_KIND_ALIAS } from "./ingredient-kind";

function ingredient(
  id: string,
  name: string,
  extra?: Partial<IngredientCanonicalInput>,
): IngredientCanonicalInput {
  return { id, name, normalized_name: name.toLowerCase(), ...extra };
}

type MockResult = { data: IngredientCanonicalInput[] | null; error: { message: string } | null };

function selectChain(result: MockResult) {
  return {
    eq: () => ({
      is: () => Promise.resolve(result),
    }),
    then: (
      onfulfilled?: (value: MockResult) => unknown,
      onrejected?: (reason: unknown) => unknown,
    ) => Promise.resolve(result).then(onfulfilled, onrejected),
  };
}

const ORPHAN_DEPENDENCY_TABLES = new Set([
  "ingredient_aliases",
  "recipe_ingredients",
  "ingredient_price_history",
  "recipe_margin_impacts",
]);

function mockOrphanDependencySelect() {
  return {
    in: () => Promise.resolve({ data: [], error: null }),
  };
}

function mockCatalogClient(
  rows: IngredientCanonicalInput[],
  options?: {
    failuresBeforeSuccess?: number;
    firstError?: { message: string };
    archiveColumnsExist?: boolean;
    trackServerActiveFilter?: boolean;
  },
) {
  let catalogSelectCall = 0;
  const serverActiveFilterCalls: string[] = [];
  const archiveExists = options?.archiveColumnsExist ?? true;

  const client = {
    from: (table: string) => ({
      select: (select: string) => {
        if (ORPHAN_DEPENDENCY_TABLES.has(table)) {
          return mockOrphanDependencySelect();
        }
        if (select === "is_archived") {
          const probeResult = {
            data: [],
            error: archiveExists ? null : { message: 'column "is_archived" does not exist' },
          };
          return {
            limit: () => Promise.resolve(probeResult),
            then: (
              onfulfilled?: (value: typeof probeResult) => unknown,
              onrejected?: (reason: unknown) => unknown,
            ) => Promise.resolve(probeResult).then(onfulfilled, onrejected),
          };
        }

        catalogSelectCall += 1;
        if (options?.failuresBeforeSuccess && catalogSelectCall <= options.failuresBeforeSuccess) {
          const err = options.firstError ?? { message: "select failed" };
          return select.includes("is_archived")
            ? selectChain({ data: null, error: err })
            : Promise.resolve({ data: null, error: err });
        }

        const result: MockResult = { data: rows, error: null };
        if (select.includes("is_archived")) {
          if (options?.trackServerActiveFilter) {
            return {
              eq: (column: string, value: unknown) => {
                serverActiveFilterCalls.push(`${column}=${String(value)}`);
                return {
                  is: (column2: string, value2: unknown) => {
                    serverActiveFilterCalls.push(`${column2}=${String(value2)}`);
                    return Promise.resolve(result);
                  },
                };
              },
            };
          }
          return selectChain(result);
        }
        return Promise.resolve(result);
      },
    }),
  } as never;

  return { client, serverActiveFilterCalls };
}

describe("filterActiveCatalogIngredients", () => {
  it("keeps one active ANGUS PTY when archived merged duplicates exist", () => {
    const catalog = [
      ingredient("canonical", "ANGUS PTY"),
      ingredient("dup-1", "ANGUS PTY", {
        is_archived: true,
        merged_into_ingredient_id: "canonical",
      }),
      ingredient("dup-2", "Angus Patty", {
        is_archived: true,
        merged_into_ingredient_id: "canonical",
      }),
    ];
    const active = filterActiveCatalogIngredients(catalog);
    expect(active.map((row) => row.id)).toEqual(["canonical"]);
  });

  it("treats merged_into without is_archived flag as archived", () => {
    const catalog = [
      ingredient("canonical", "ANGUS PTY"),
      ingredient("dup", "ANGUS PTY", { merged_into_ingredient_id: "canonical" }),
    ];
    expect(filterActiveCatalogIngredients(catalog).map((row) => row.id)).toEqual(["canonical"]);
  });

  it("excludes archived rows when archiveFieldsLoaded is set", () => {
    const catalog = [
      ingredient("canonical", "Óleo girassol 1L", { is_archived: false }),
      ingredient("merged", "Óleo girassol Fula 1L", {
        is_archived: true,
        merged_into_ingredient_id: "canonical",
      }),
    ];
    expect(
      filterActiveCatalogIngredients(catalog, { archiveFieldsLoaded: true }).map((row) => row.id),
    ).toEqual(["canonical"]);
  });
});

describe("loadActiveIngredientCatalog", () => {
  it("filters archived rows from the DB response", async () => {
    const rows = [
      ingredient("canonical", "ANGUS PTY", { is_archived: false }),
      ingredient("dup", "ANGUS PTY", {
        is_archived: true,
        merged_into_ingredient_id: "canonical",
      }),
    ];
    const { client } = mockCatalogClient(rows);

    const { rows: active, error } = await loadActiveIngredientCatalog(client);
    expect(error).toBeNull();
    expect(active.map((row) => row.id)).toEqual(["canonical"]);
  });

  it("applies server-side active filter when archive columns are selected", async () => {
    const rows = [ingredient("canonical", "Óleo girassol 1L", { is_archived: false })];
    const { client, serverActiveFilterCalls } = mockCatalogClient(rows, {
      trackServerActiveFilter: true,
    });

    await loadActiveIngredientCatalog(client);
    expect(serverActiveFilterCalls).toEqual([
      "is_archived=false",
      "merged_into_ingredient_id=null",
    ]);
  });

  it("falls back to archive-only select when ingredient_kind is missing", async () => {
    const rows = [
      ingredient("canonical", "Óleo girassol 1L", { is_archived: false }),
      ingredient("merged", "Óleo girassol Fula 1L", {
        is_archived: true,
        merged_into_ingredient_id: "canonical",
      }),
    ];
    const { client } = mockCatalogClient(rows, {
      failuresBeforeSuccess: 1,
      firstError: { message: 'column "ingredient_kind" does not exist' },
    });

    const { rows: active, error } = await loadActiveIngredientCatalog(client);

    expect(error).toBeNull();
    expect(active.map((row) => row.id)).toEqual(["canonical"]);
  });

  it("skips kind-only tier when archive columns exist on DB", async () => {
    let catalogSelectCall = 0;
    const client = {
      from: () => ({
        select: (select: string) => {
          if (select === "is_archived") {
            const probeResult = { data: [], error: null };
            return {
              limit: () => Promise.resolve(probeResult),
            };
          }
          catalogSelectCall += 1;
          if (catalogSelectCall <= 2) {
            const err = { message: 'column "ingredient_kind" does not exist' };
            return select.includes("is_archived")
              ? selectChain({ data: null, error: err })
              : Promise.resolve({ data: null, error: err });
          }
          return Promise.resolve({
            data: [
              ingredient("canonical", "Óleo girassol 1L"),
              ingredient("merged", "Óleo girassol Fula 1L", {
                is_archived: true,
                merged_into_ingredient_id: "canonical",
              }),
            ],
            error: null,
          });
        },
      }),
    } as never;

    const { rows: active, error } = await loadActiveIngredientCatalog(client);
    expect(error).not.toBeNull();
    expect(active).toHaveLength(0);
  });

  it("falls back to base select when archive columns are missing on DB", async () => {
    const rows = [ingredient("only", "BACON")];
    const { client } = mockCatalogClient(rows, {
      failuresBeforeSuccess: 2,
      firstError: { message: 'column "is_archived" does not exist' },
      archiveColumnsExist: false,
    });

    const { rows: active, error } = await loadActiveIngredientCatalog(client);

    expect(error).toBeNull();
    expect(active).toHaveLength(1);
    expect(active[0]?.id).toBe("only");
  });
});

describe("loadMatchingIngredientCatalog", () => {
  it("excludes alias-kind and shorthand rows from invoice match targets", async () => {
    const rows = [
      ingredient("canonical", "Chicken Breaded 2KG", { ingredient_kind: "canonical" }),
      ingredient("alias-kind", "BAC FUM FAT", { ingredient_kind: INGREDIENT_KIND_ALIAS }),
      ingredient("shorthand-leak", "CHK BREADED", { ingredient_kind: "canonical" }),
    ];
    const { client } = mockCatalogClient(rows);

    const { rows: matching, error } = await loadMatchingIngredientCatalog(client);
    expect(error).toBeNull();
    expect(matching.map((row) => row.id)).toEqual(["canonical"]);
  });
});

describe("loadCanonicalIngredientCatalog", () => {
  it("excludes merged archived sources from human-facing catalog load", async () => {
    const rows = [
      ingredient("survivor", "Óleo girassol 1L", { ingredient_kind: "canonical" }),
      ingredient("merged", "Óleo girassol Fula 1L", {
        ingredient_kind: "canonical",
        is_archived: true,
        merged_into_ingredient_id: "survivor",
      }),
    ];
    const { client } = mockCatalogClient(rows);

    const { rows: canonical, error } = await loadCanonicalIngredientCatalog(client);
    expect(error).toBeNull();
    expect(canonical.map((row) => row.id)).toEqual(["survivor"]);
  });

  it("excludes alias-kind rows from human-facing catalog load", async () => {
    const rows = [
      ingredient("canonical", "BACON FATIADO FUMADO 1KG", { ingredient_kind: "canonical" }),
      ingredient("alias", "BAC FUM FAT", { ingredient_kind: INGREDIENT_KIND_ALIAS }),
    ];
    const { client } = mockCatalogClient(rows);

    const { rows: canonical, error } = await loadCanonicalIngredientCatalog(client);
    expect(error).toBeNull();
    expect(canonical.map((row) => row.id)).toEqual(["canonical"]);
  });

  it("filters shorthand leakage when ingredient_kind column is absent", async () => {
    const rows = [
      ingredient("canonical", "ONION RINGS 1KG"),
      ingredient("leak", "ON RNG"),
    ];
    const { client } = mockCatalogClient(rows, {
      failuresBeforeSuccess: 1,
      firstError: { message: 'column "ingredient_kind" does not exist' },
    });

    const { rows: canonical } = await loadCanonicalIngredientCatalog(client);
    expect(canonical.map((row) => row.id)).toEqual(["canonical"]);
  });

  it("excludes CHK BREADED legacy canonical pollution from catalog load", async () => {
    const rows = [
      ingredient("chk-canonical", "Chicken Breaded / Frango Panado", { ingredient_kind: "canonical" }),
      ingredient("chk-leak", "CHK BREADED", { ingredient_kind: "canonical" }),
    ];
    const { client } = mockCatalogClient(rows);

    const { rows: canonical, error } = await loadCanonicalIngredientCatalog(client);
    expect(error).toBeNull();
    expect(canonical.map((row) => row.id)).toEqual(["chk-canonical"]);
  });

  it("hides operationally orphaned canonicals from human-facing catalog load", async () => {
    const rows = [
      ingredient("palha", "PALHA", { ingredient_kind: "canonical" }),
      ingredient("batata", "Batata palha", { ingredient_kind: "canonical" }),
    ];
    const base = mockCatalogClient(rows);
    const client = {
      from: (table: string) => {
        if (table === "ingredients") return base.client.from(table);
        if (!ORPHAN_DEPENDENCY_TABLES.has(table)) {
          throw new Error(`unexpected table ${table}`);
        }
        return {
          select: () => ({
            in: () =>
              Promise.resolve({
                data:
                  table === "ingredient_aliases"
                    ? [{ ingredient_id: "batata", supplier_name: "Metro" }]
                    : [],
                error: null,
              }),
          }),
        };
      },
    } as never;

    const { rows: canonical, error } = await loadCanonicalIngredientCatalog(client);
    expect(error).toBeNull();
    expect(canonical.map((row) => row.id)).toEqual(["batata"]);
  });

  it("feeds recipe/invoice picker with canonical rows only (no CHK BREADED)", async () => {
    const rows = [
      ingredient("chk-canonical", "Chicken Breaded / Frango Panado", { ingredient_kind: "canonical" }),
      ingredient("chk-leak", "CHK BREADED", { ingredient_kind: "canonical" }),
    ];
    const { client } = mockCatalogClient(rows);

    const { rows: canonical } = await loadCanonicalIngredientCatalog(client);
    const pickerIds = buildCanonicalIngredientPickerOptions(canonical).map((row) => row.id);
    expect(pickerIds).toEqual(["chk-canonical"]);
  });
});
