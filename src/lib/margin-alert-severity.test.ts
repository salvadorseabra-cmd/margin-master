import { describe, expect, it } from "vitest";
import {
  bumpMarginAlertSeverity,
  marginAlertSeverityLabel,
  scoreMarginAlertSeverity,
} from "@/lib/margin-alert-severity";

describe("scoreMarginAlertSeverity", () => {
  it("bumps from info when multiple risk factors present", () => {
    const severity = scoreMarginAlertSeverity({
      baseSeverity: "info",
      contributionPct: 65,
      priceIncreasePct: 12,
      staleDays: 50,
      singleSupplier: true,
      recipeCount: 4,
      isVolatile: true,
    });
    expect(severity).toBe("critical");
  });

  it("does not bump positive opportunities", () => {
    expect(
      scoreMarginAlertSeverity({
        baseSeverity: "positive",
        priceIncreasePct: 20,
        recipeCount: 10,
      }),
    ).toBe("positive");
  });

  it("bumps one level per threshold crossed moderately", () => {
    expect(
      scoreMarginAlertSeverity({
        baseSeverity: "watch",
        priceIncreasePct: 11,
      }),
    ).toBe("high");
  });
});

describe("bumpMarginAlertSeverity", () => {
  it("steps through ladder", () => {
    expect(bumpMarginAlertSeverity("info")).toBe("watch");
    expect(bumpMarginAlertSeverity("watch")).toBe("high");
    expect(bumpMarginAlertSeverity("high")).toBe("critical");
  });
});

describe("marginAlertSeverityLabel", () => {
  it("maps high to High risk", () => {
    expect(marginAlertSeverityLabel("high")).toBe("High risk");
    expect(marginAlertSeverityLabel("critical")).toBe("Critical");
  });
});
