import { describe, expect, it } from "vitest";
import {
  formatCostExposureContext,
  formatCostExposureTitle,
  formatTemporalPriceChange,
  formatVisitDeltaLine,
  getSuggestedAction,
} from "@/lib/margin-alert-copy";

describe("margin-alert-copy", () => {
  it("formats cost exposure title with contribution percent", () => {
    expect(formatCostExposureTitle("Beef mince", "Burger", 62)).toContain("62%");
    expect(formatCostExposureTitle("Beef mince", "Burger", 62)).not.toContain("dominates");
  });

  it("formats cost exposure context with line cost", () => {
    const text = formatCostExposureContext(62, "Burger", 4.5);
    expect(text).toContain("62%");
    expect(text).toContain("€4.50");
  });

  it("returns temporal line only when history supports comparison", () => {
    const now = new Date().toISOString();
    const earlier = new Date(Date.now() - 10 * 86_400_000).toISOString();
    const line = formatTemporalPriceChange(
      "ing-1",
      [
        {
          ingredient_id: "ing-1",
          previous_price: 10,
          new_price: 10.5,
          delta_percent: 5,
          created_at: earlier,
        },
        {
          ingredient_id: "ing-1",
          previous_price: 10.5,
          new_price: 10.8,
          delta_percent: 2.9,
          created_at: now,
        },
      ],
      30,
    );
    expect(line).toMatch(/\+8% this month/);
  });

  it("omits temporal line with insufficient history", () => {
    expect(
      formatTemporalPriceChange(
        "ing-1",
        [
          {
            ingredient_id: "ing-1",
            previous_price: 10,
            new_price: 11,
            delta_percent: 10,
            created_at: new Date().toISOString(),
          },
        ],
      ),
    ).toBeUndefined();
  });

  it("maps alert kinds to suggested actions", () => {
    expect(getSuggestedAction("price_increase").actionLabel).toBe("Compare suppliers");
    expect(getSuggestedAction("cost_concentration").actionLabel).toBe("Review portion");
  });

  it("formats visit delta lines", () => {
    expect(formatVisitDeltaLine("critical", 2)).toBe("2 new critical risks");
    expect(formatVisitDeltaLine("critical", 0)).toBeNull();
    expect(formatVisitDeltaLine("total", -1)).toBe("1 fewer active signal");
  });
});
