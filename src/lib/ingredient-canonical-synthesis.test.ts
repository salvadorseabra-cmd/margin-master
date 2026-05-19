import { describe, expect, it } from "vitest";
import {
  findCanonicalIngredientMatch,
  OPERATIONAL_EQUIVALENT_MATCH_REASON,
} from "./ingredient-canonical";
import {
  buildInvoiceMatchCatalog,
  detectOperationalClusters,
  isSyntheticCatalogIngredientId,
  synthesizeCanonicalIngredients,
} from "./ingredient-canonical-synthesis";

const fritaOnlyCatalog = [{ id: "bat-frita", name: "BATATA FRITA 2KG" }];

describe("detectOperationalClusters", () => {
  it("clusters palha invoice lines into batata palha", () => {
    const clusters = detectOperationalClusters([
      { name: "BATATA PALHA AUCHAN 2KG" },
      { name: "BATATA PALHA CONTINENTE 2KG" },
      { name: "PALHA SNACK FOOD SERVICE 2KG" },
    ]);
    expect(clusters).toHaveLength(1);
    expect(clusters[0]).toMatchObject({
      clusterId: "batata-palha",
      canonicalName: "BATATA PALHA",
      family: "batata",
      form: "palha",
      supportingLineCount: 3,
    });
  });

  it("does not cluster a single plain cheddar line", () => {
    expect(detectOperationalClusters([{ name: "QUEIJO CHEDDAR AUCHAN 1KG" }])).toEqual([]);
  });

  it("does not synthesize one canonical for mixed cheddar forms", () => {
    const clusters = detectOperationalClusters([
      { name: "QUEIJO CHEDDAR FATIADO 1KG" },
      { name: "QUEIJO CHEDDAR BLOCO 1KG" },
    ]);
    expect(clusters).toEqual([]);
  });
});

describe("synthesizeCanonicalIngredients + matching", () => {
  it("creates synthetic BATATA PALHA when catalog only has BATATA FRITA", () => {
    const invoiceItems = [
      { name: "BATATA PALHA AUCHAN 2KG" },
      { name: "BATATA PALHA CONTINENTE 2KG" },
      { name: "PALHA SNACK FOOD SERVICE 2KG" },
    ];
    const matchCatalog = buildInvoiceMatchCatalog(fritaOnlyCatalog, invoiceItems);
    const synthetic = matchCatalog.find((row) => isSyntheticCatalogIngredientId(row.id));
    expect(synthetic).toMatchObject({
      id: "synthetic:batata-palha",
      name: "BATATA PALHA",
    });

    const snackMatch = findCanonicalIngredientMatch(
      "PALHA SNACK FOOD SERVICE 2KG",
      matchCatalog,
    );
    expect(snackMatch?.ingredient.id).toBe("synthetic:batata-palha");
    expect(["exact", "operational-equivalent"]).toContain(snackMatch?.kind);

    const palhaMatch = findCanonicalIngredientMatch("BATATA PALHA AUCHAN 2KG", matchCatalog);
    expect(palhaMatch?.ingredient.id).toBe("synthetic:batata-palha");
  });

  it("does not match BATATA FRITA when palha cluster is clear", () => {
    const matchCatalog = buildInvoiceMatchCatalog(fritaOnlyCatalog, [
      { name: "BATATA PALHA AUCHAN 2KG" },
      { name: "BATATA PALHA CONTINENTE 2KG" },
      { name: "PALHA SNACK FOOD SERVICE 2KG" },
    ]);
    const match = findCanonicalIngredientMatch("BATATA PALHA 2KG", matchCatalog);
    expect(match?.ingredient.id).toBe("synthetic:batata-palha");
    expect(match?.ingredient.id).not.toBe("bat-frita");
  });

  it("PALHA SNACK operational-equivalent targets synthetic palha", () => {
    const matchCatalog = buildInvoiceMatchCatalog(fritaOnlyCatalog, [
      { name: "BATATA PALHA AUCHAN 2KG" },
      { name: "PALHA SNACK FOOD SERVICE 2KG" },
    ]);
    const match = findCanonicalIngredientMatch("PALHA SNACK FOOD SERVICE 2KG", matchCatalog);
    expect(match?.ingredient.id).toBe("synthetic:batata-palha");
    expect(match?.kind).toBe("operational-equivalent");
    expect(match?.reason).toBe(OPERATIONAL_EQUIVALENT_MATCH_REASON);
    expect(match?.syntheticTarget).toBe(true);
  });

  it("skips synthesis when persisted catalog already covers the cluster", () => {
    const catalog = [{ id: "bat-palha", name: "BATATA PALHA" }];
    const synthetics = synthesizeCanonicalIngredients(
      detectOperationalClusters([
        { name: "BATATA PALHA AUCHAN" },
        { name: "PALHA SNACK" },
      ]),
      catalog,
    );
    expect(synthetics).toEqual([]);
  });
});
