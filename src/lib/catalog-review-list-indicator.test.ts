import { describe, expect, it } from "vitest";
import {
  formatAliasCountSubline,
  formatCurrentMatchCountSubline,
  sortCatalogReviewByAliasCount,
  sortCatalogReviewAlphabetical,
  sortCatalogReviewByMatchCount,
} from "./catalog-review-list-indicator";

describe("formatAliasCountSubline", () => {
  it("returns null for zero aliases", () => {
    expect(formatAliasCountSubline(0)).toBeNull();
    expect(formatAliasCountSubline(-1)).toBeNull();
  });

  it("formats singular and plural alias counts", () => {
    expect(formatAliasCountSubline(1)).toBe("1 alias");
    expect(formatAliasCountSubline(3)).toBe("3 aliases");
  });
});

describe("formatCurrentMatchCountSubline", () => {
  it("returns null for zero matches", () => {
    expect(formatCurrentMatchCountSubline(0)).toBeNull();
  });

  it("formats singular and plural match counts", () => {
    expect(formatCurrentMatchCountSubline(1)).toBe("1 matched invoice line");
    expect(formatCurrentMatchCountSubline(4)).toBe("4 matched invoice lines");
  });
});

describe("sortCatalogReviewAlphabetical", () => {
  it("orders by display name A to Z regardless of match count", () => {
    const sorted = sortCatalogReviewAlphabetical([
      { matchCount: 5, displayName: "Zebra" },
      { matchCount: 1, displayName: "Apple" },
      { matchCount: 3, displayName: "Mango" },
    ]);

    expect(sorted.map((item) => item.displayName)).toEqual(["Apple", "Mango", "Zebra"]);
  });
});

describe("sortCatalogReviewByMatchCount", () => {
  it("orders by match count descending, then alphabetically", () => {
    const sorted = sortCatalogReviewByMatchCount([
      { matchCount: 1, displayName: "Zebra" },
      { matchCount: 3, displayName: "Mango" },
      { matchCount: 3, displayName: "Apple" },
    ]);

    expect(sorted.map((item) => `${item.matchCount}:${item.displayName}`)).toEqual([
      "3:Apple",
      "3:Mango",
      "1:Zebra",
    ]);
  });
});

describe("sortCatalogReviewByAliasCount", () => {
  it("orders by alias count descending, then alphabetically", () => {
    const sorted = sortCatalogReviewByAliasCount([
      { aliasCount: 1, displayName: "Zebra" },
      { aliasCount: 3, displayName: "Mango" },
      { aliasCount: 3, displayName: "Apple" },
      { aliasCount: 2, displayName: "Banana" },
    ]);

    expect(sorted.map((item) => `${item.aliasCount}:${item.displayName}`)).toEqual([
      "3:Apple",
      "3:Mango",
      "2:Banana",
      "1:Zebra",
    ]);
  });
});
