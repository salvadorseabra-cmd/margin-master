import { describe, expect, it } from "vitest";
import { catalogReviewIngredientIdsEqual } from "./catalog-review-id-filter-log";

describe("catalogReviewIngredientIdsEqual", () => {
  it("matches trimmed string forms", () => {
    expect(catalogReviewIngredientIdsEqual("  uuid-1  ", "uuid-1")).toBe(true);
    expect(catalogReviewIngredientIdsEqual("uuid-1", "uuid-1")).toBe(true);
  });

  it("rejects different ids", () => {
    expect(catalogReviewIngredientIdsEqual("uuid-1", "uuid-2")).toBe(false);
  });
});
