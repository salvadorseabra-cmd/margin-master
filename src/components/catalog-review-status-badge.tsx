import type { CatalogReviewStatusBadgeSpec } from "@/lib/catalog-review-status-badges";

export function CatalogReviewStatusBadge({
  spec,
}: {
  spec: CatalogReviewStatusBadgeSpec | null | undefined;
}) {
  if (!spec) return null;

  return (
    <span className={spec.className}>
      <span aria-hidden className="opacity-60">
        ●
      </span>
      {spec.label}
    </span>
  );
}
