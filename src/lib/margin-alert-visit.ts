const STORAGE_KEY = "marginly:alerts:last-visit";

export type MarginVisitSnapshot = {
  timestamp: string;
  criticalCount: number;
  totalAlertCount: number;
  priceIncreaseCount: number;
  recipesBelowTarget: number;
};

export type MarginVisitDelta = {
  isFirstVisit: boolean;
  lastVisitAt: string | null;
  lines: string[];
};

export function loadLastVisitSnapshot(): MarginVisitSnapshot | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as MarginVisitSnapshot;
    if (!parsed?.timestamp) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveVisitSnapshot(snapshot: MarginVisitSnapshot): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
  } catch {
    // ignore quota / private mode
  }
}

export function buildVisitDelta(
  previous: MarginVisitSnapshot | null,
  current: MarginVisitSnapshot,
  formatLine: (
    kind: "critical" | "price_increases" | "below_target" | "total",
    delta: number,
  ) => string | null,
): MarginVisitDelta {
  if (!previous) {
    return {
      isFirstVisit: true,
      lastVisitAt: null,
      lines: [],
    };
  }

  const lines = [
    formatLine("critical", current.criticalCount - previous.criticalCount),
    formatLine("price_increases", current.priceIncreaseCount - previous.priceIncreaseCount),
    formatLine("below_target", current.recipesBelowTarget - previous.recipesBelowTarget),
    formatLine("total", current.totalAlertCount - previous.totalAlertCount),
  ].filter((line): line is string => Boolean(line));

  return {
    isFirstVisit: false,
    lastVisitAt: previous.timestamp,
    lines,
  };
}

export function formatLastVisitLabel(iso: string | null): string {
  if (!iso) return "your last visit";
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "your last visit";
  const days = Math.floor((Date.now() - then) / 86_400_000);
  if (days <= 0) return "earlier today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  return new Date(iso).toLocaleDateString();
}
