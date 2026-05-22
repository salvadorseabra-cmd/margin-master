import { beforeEach, describe, expect, it } from "vitest";
import { traceSupplierTokenExpansions } from "./ingredient-operational-aliases";
import {
  clearSupplierExpansionMemoryForTests,
  rememberSupplierTokenExpansion,
  seedSupplierExpansionMemory,
  supplierTokenExpansionMemoryKey,
} from "./ingredient-supplier-expansion-memory";

describe("supplier token expansion memory", () => {
  beforeEach(() => {
    clearSupplierExpansionMemoryForTests();
  });

  it("builds stable supplier+token keys", () => {
    expect(supplierTokenExpansionMemoryKey("Metro Cash", "SHOES")).toBe("metro cash::shoes");
  });

  it("overrides dictionary expansion for a supplier-specific token", () => {
    rememberSupplierTokenExpansion("acme", "SHOES", "shoestring");
    const trace = traceSupplierTokenExpansions("BAT SHOES", { supplierKey: "acme" });
    const shoes = trace.tokens.find((t) => t.raw === "SHOES");
    expect(shoes?.expanded).toBe("shoestring");
    expect(shoes?.source).toBe("supplier_memory");
    expect(shoes?.confidence).toBe("high");
    expect(trace.expanded).toBe("batata shoestring");
  });

  it("falls back to dictionary when supplier memory misses", () => {
    seedSupplierExpansionMemory({ "metro::custom": "override" });
    const trace = traceSupplierTokenExpansions("BAT SHOESTR", { supplierKey: "other" });
    expect(trace.expanded).toBe("batata shoestring");
    expect(trace.tokens.map((t) => t.source)).toEqual(["dictionary", "dictionary"]);
  });
});
