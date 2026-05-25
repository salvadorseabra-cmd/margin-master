import type { MarginAlertItem, MarginAlertSectionId } from "@/lib/margin-alert-data";

export type MarginAlertSection = {
  id: MarginAlertSectionId;
  title: string;
  description: string;
  items: MarginAlertItem[];
};

const SECTION_META: Record<
  MarginAlertSectionId,
  { title: string; description: string; order: number }
> = {
  critical_margin_risks: {
    title: "Critical margin risks",
    description: "Recipes below target margin and modeled deterioration from invoice-driven costs.",
    order: 0,
  },
  cost_concentration: {
    title: "Cost concentration",
    description: "Dishes where one ingredient carries most of the food cost exposure.",
    order: 1,
  },
  supplier_anomalies: {
    title: "Supplier anomalies",
    description: "Price increases, supplier trends, and stale pricing from invoice history.",
    order: 2,
  },
  prep_exposure: {
    title: "Prep & sub-recipe exposure",
    description: "Shared preps embedded across menu recipes — changes cascade upstream.",
    order: 3,
  },
  opportunities: {
    title: "Opportunities",
    description: "Favorable price moves and recent updates that may improve margins.",
    order: 4,
  },
};

export function groupAlertsIntoSections(items: MarginAlertItem[]): MarginAlertSection[] {
  const buckets = new Map<MarginAlertSectionId, MarginAlertItem[]>();

  for (const item of items) {
    const list = buckets.get(item.sectionId) ?? [];
    list.push(item);
    buckets.set(item.sectionId, list);
  }

  return [...buckets.entries()]
    .map(([id, sectionItems]) => ({
      id,
      title: SECTION_META[id].title,
      description: SECTION_META[id].description,
      items: sectionItems.sort(
        (a, b) => severityOrder(a.severity) - severityOrder(b.severity) || b.priority - a.priority,
      ),
    }))
    .sort((a, b) => SECTION_META[a.id].order - SECTION_META[b.id].order);
}

function severityOrder(severity: MarginAlertItem["severity"]): number {
  if (severity === "critical") return 0;
  if (severity === "high") return 1;
  if (severity === "watch") return 2;
  if (severity === "info") return 3;
  return 4;
}

export function countAlertsBySection(
  sections: MarginAlertSection[],
): Record<MarginAlertSectionId, number> {
  const counts = {} as Record<MarginAlertSectionId, number>;
  for (const section of sections) {
    counts[section.id] = section.items.length;
  }
  return counts;
}
