import { describe, expect, it } from "vitest";
import type { IngredientCanonicalInput } from "./ingredient-canonical";
import {
  inspectCanonicalIngredientDependencies,
  orphanReportFromDiagnostics,
} from "./ingredient-orphan-diagnostics";

function row(id: string, name: string): IngredientCanonicalInput {
  return { id, name, normalized_name: name.toLowerCase() };
}

function createDiagnosticsMockClient(
  tables: Partial<{
    ingredients: {
      id: string;
      name: string;
      is_archived?: boolean;
      merged_into_ingredient_id?: string | null;
      user_id?: string;
    }[];
    ingredient_aliases: {
      id: string;
      ingredient_id: string;
      alias_name: string;
      normalized_alias: string;
      supplier_name?: string | null;
      confirmed_by_user?: boolean;
    }[];
    recipe_ingredients: {
      id: string;
      ingredient_id: string;
      recipes?: { type: string | null } | null;
    }[];
    ingredient_price_history: { id: string; ingredient_id: string; invoice_id?: string | null }[];
    recipe_margin_impacts: { id: string; ingredient_id: string }[];
    invoice_items: unknown[];
  }>,
) {
  const maybeSingleResult = (table: string, filters: Record<string, string>) => {
    const rows = (tables[table as keyof typeof tables] ?? []) as Record<string, string>[];
    const hit = rows.find((row) =>
      Object.entries(filters).every(([key, value]) => row[key] === value),
    );
    return Promise.resolve({ data: hit ?? null, error: null });
  };

  const listResult = (table: string, filters: Record<string, string>) => {
    const rows = (tables[table as keyof typeof tables] ?? []) as Record<string, string>[];
    const filtered = rows.filter((row) =>
      Object.entries(filters).every(([key, value]) => row[key] === value),
    );
    return Promise.resolve({ data: filtered, error: null });
  };

  const inResult = (table: string, col: string, ids: string[]) => {
    const rows = (tables[table as keyof typeof tables] ?? []) as Record<string, string>[];
    return Promise.resolve({
      data: rows.filter((row) => ids.includes(row[col] ?? "")),
      error: null,
    });
  };

  return {
    from: (table: string) => ({
      select: () => ({
        eq: (col: string, val: string) => ({
          eq: (col2: string, val2: string) => ({
            maybeSingle: () => maybeSingleResult(table, { [col]: val, [col2]: val2 }),
          }),
          order: () => listResult(table, { [col]: val }),
          maybeSingle: () => maybeSingleResult(table, { [col]: val }),
        }),
        in: (col: string, ids: string[]) => inResult(table, col, ids),
        order: () => ({
          limit: () => Promise.resolve({ data: tables.invoice_items ?? [], error: null }),
        }),
      }),
    }),
  };
}

describe("inspectCanonicalIngredientDependencies", () => {
  it("report shows alias deps when mock ingredient has one alias row", async () => {
    const client = createDiagnosticsMockClient({
      ingredients: [{ id: "ing-1", name: "PALHA", user_id: "user-1" }],
      ingredient_aliases: [
        {
          id: "alias-1",
          ingredient_id: "ing-1",
          alias_name: "PALHA SNACK",
          normalized_alias: "palha snack",
          supplier_name: "Metro",
          confirmed_by_user: true,
        },
      ],
      recipe_ingredients: [],
      ingredient_price_history: [],
      recipe_margin_impacts: [],
      invoice_items: [],
    });

    const { report, error } = await inspectCanonicalIngredientDependencies({
      client: client as never,
      ingredientId: "ing-1",
      userId: "user-1",
      catalog: [row("ing-1", "PALHA")],
      confirmedAliases: { "metro::palha snack": "ing-1" },
    });

    expect(error).toBeNull();
    expect(report).not.toBeNull();
    expect(report!.isOperationallyOrphaned).toBe(false);
    expect(report!.orphanBlockingReasons).toContain("invoice_aliases");

    const aliasDep = report!.dependencies.find((d) => d.dependencyType === "ingredient_aliases");
    expect(aliasDep?.totalCount).toBe(1);
    expect(aliasDep?.recordIds).toEqual(["alias-1"]);
    expect(aliasDep?.blocksOrphanStatus).toBe(true);

    const mapKeys = report!.dependencies.find(
      (d) => d.dependencyType === "confirmed_alias_map_keys",
    );
    expect(mapKeys?.totalCount).toBe(1);
  });

  it("orphanReportFromDiagnostics mirrors blocking counts", () => {
    const report = orphanReportFromDiagnostics(
      [
        {
          dependencyType: "ingredient_aliases",
          count: 1,
          totalCount: 2,
          recordIds: ["a", "b"],
          sourceTable: "ingredient_aliases",
          blocksOrphanStatus: true,
          orphanBlockingKey: "invoice_aliases",
        },
        {
          dependencyType: "supplier_wording_memory",
          count: 1,
          totalCount: 1,
          recordIds: ["x"],
          sourceTable: "ingredient_aliases",
          blocksOrphanStatus: true,
          orphanBlockingKey: "supplier_aliases",
        },
      ],
      "ing-1",
    );
    expect(report.invoiceAliasCount).toBe(2);
    expect(report.supplierAliasCount).toBe(1);
  });
});
