import { Link } from "@tanstack/react-router";
import type { MarginAlertTarget } from "@/lib/margin-alert-data";

type OwnerRowLinkTarget = {
  to: MarginAlertTarget;
  search: Record<string, string>;
};

export function resolveOwnerRowLink(input: {
  target?: MarginAlertTarget;
  ingredientId?: string;
  recipeId?: string;
  supplierName?: string;
}): OwnerRowLinkTarget | null {
  if (input.ingredientId) {
    return { to: "/ingredients", search: { ingredient: input.ingredientId } };
  }
  if (input.recipeId) {
    return { to: "/recipes", search: { recipe: input.recipeId } };
  }
  if (input.supplierName) {
    return { to: "/invoices", search: { supplier: input.supplierName } };
  }
  if (input.target) {
    return { to: input.target, search: {} };
  }
  return null;
}

type OwnerRowLinkProps = {
  title: string;
  target?: MarginAlertTarget;
  ingredientId?: string;
  recipeId?: string;
  supplierName?: string;
  className?: string;
};

export function OwnerRowLink({
  title,
  target,
  ingredientId,
  recipeId,
  supplierName,
  className = "min-w-0 truncate font-medium text-foreground/90 underline-offset-2 hover:text-foreground hover:underline",
}: OwnerRowLinkProps) {
  const link = resolveOwnerRowLink({ target, ingredientId, recipeId, supplierName });
  if (!link) {
    return <span className={className.replace("hover:underline", "")}>{title}</span>;
  }
  return (
    <Link
      to={link.to}
      search={link.search}
      className={className}
      onClick={(event) => event.stopPropagation()}
    >
      {title}
    </Link>
  );
}
