import { describe, expect, it, vi } from "vitest";
import {
  catalogReviewSurvivalRowId,
  logCatalogReviewSurvival,
} from "./catalog-review-survival-log";

describe("catalog-review-survival-log", () => {
  it("extracts id from aliasId or id", () => {
    expect(catalogReviewSurvivalRowId({ id: " a " })).toBe("a");
    expect(catalogReviewSurvivalRowId({ aliasId: "b" })).toBe("b");
  });

  it("logs survival summary with dropped ids", () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    logCatalogReviewSurvival(
      "test_stage",
      [{ id: "1" }, { id: "2" }],
      [{ id: "1" }],
      [{ row: { id: "2", aliasName: "gone" }, reason: "filtered out" }],
    );

    expect(logSpy).toHaveBeenCalledWith(
      "[CatalogReview SURVIVAL]",
      expect.objectContaining({
        STAGE: "test_stage",
        beforeCount: 2,
        afterCount: 1,
        droppedIds: ["2"],
        survivingIds: ["1"],
      }),
    );
    expect(errorSpy).toHaveBeenCalledWith(
      "ROW DROPPED",
      expect.objectContaining({
        stage: "test_stage",
        aliasId: "2",
        reason: "filtered out",
      }),
    );

    logSpy.mockRestore();
    errorSpy.mockRestore();
  });
});
