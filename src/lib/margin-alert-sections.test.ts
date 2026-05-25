import { describe, expect, it } from "vitest";
import type { MarginAlertItem } from "@/lib/margin-alert-data";
import { groupAlertsIntoSections } from "@/lib/margin-alert-sections";

function item(
  partial: Pick<MarginAlertItem, "id" | "sectionId" | "severity" | "priority"> &
    Partial<MarginAlertItem>,
): MarginAlertItem {
  return {
    kind: "price_increase",
    title: partial.title ?? partial.id,
    context: "context",
    suggestedAction: "act",
    actionLabel: "Go",
    target: "/ingredients",
    meta: [],
    signals: [],
    ...partial,
  };
}

describe("groupAlertsIntoSections", () => {
  it("groups items by section and sorts sections by priority order", () => {
    const sections = groupAlertsIntoSections([
      item({
        id: "opp",
        sectionId: "opportunities",
        severity: "positive",
        priority: 1,
      }),
      item({
        id: "risk",
        sectionId: "critical_margin_risks",
        severity: "critical",
        priority: 100,
      }),
      item({
        id: "conc",
        sectionId: "cost_concentration",
        severity: "watch",
        priority: 50,
      }),
    ]);

    expect(sections.map((s) => s.id)).toEqual([
      "critical_margin_risks",
      "cost_concentration",
      "opportunities",
    ]);
    expect(sections[0]?.items[0]?.id).toBe("risk");
  });

  it("omits empty sections", () => {
    const sections = groupAlertsIntoSections([
      item({
        id: "only",
        sectionId: "supplier_anomalies",
        severity: "watch",
        priority: 10,
      }),
    ]);
    expect(sections).toHaveLength(1);
    expect(sections[0]?.id).toBe("supplier_anomalies");
  });
});
