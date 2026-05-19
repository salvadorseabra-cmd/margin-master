import type { CanonicalIngredientIdentity } from "@/lib/ingredient-identity";

/**
 * Families where a form-less line (plain parent) may suggest a form-specific catalog row.
 * Potato cuts and tomato variants stay cluster-blocked — not parent↔child equivalents.
 */
export const PARENT_FORM_HIERARCHY_FAMILIES = new Set(["cheddar"]);

/** Allowed child forms per parent family (canonical form ids). */
const PARENT_FORM_CHILD_FORMS: Record<string, ReadonlySet<string>> = {
  cheddar: new Set(["sliced", "block", "molho", "grated", "dip"]),
};

const FORM_SURFACE_LABEL: Record<string, string> = {
  sliced: "fatiado",
  block: "bloco",
  molho: "molho",
  grated: "ralado",
  dip: "dip",
  palha: "palha",
  frita: "frita",
  wedges: "wedges",
  hashbrown: "hashbrown",
  cherry: "cherry",
  triturado: "triturado",
  frozen: "congelado",
  corte_fino: "corte fino",
};

/** Partial form score for plain parent ↔ form-specific child (never exact-form match). */
export const PARENT_FORM_PARTIAL_COMPATIBILITY = 0.42;

/** Hard cap — below semantic auto-confirm and semantic suggestion bars. */
export const PARENT_FORM_MAX_PROMOTION_SCORE = 0.7;

export type ParentFormHierarchyMatch = {
  parentFamily: string;
  /** Canonical form id on the form-specific side. */
  childForm: string;
  reason: string;
};

export function detectParentConcept(identity: CanonicalIngredientIdentity): boolean {
  return (
    identity.family != null &&
    identity.form == null &&
    PARENT_FORM_HIERARCHY_FAMILIES.has(identity.family)
  );
}

export function detectFormSpecific(identity: CanonicalIngredientIdentity): boolean {
  return (
    identity.family != null &&
    identity.form != null &&
    PARENT_FORM_HIERARCHY_FAMILIES.has(identity.family)
  );
}

function formSurfaceLabel(form: string): string {
  return FORM_SURFACE_LABEL[form] ?? form.replace(/_/g, " ");
}

export function parentFormHierarchyReason(parentFamily: string, childForm: string): string {
  return `parent-form hierarchy: plain ${parentFamily} vs ${parentFamily} ${formSurfaceLabel(childForm)}`;
}

/**
 * Plain parent on one side, form-specific child on the other — same hierarchy family.
 * Both form-specific with different forms returns null (handled by incompatible-form blockers).
 */
export function resolveParentFormHierarchyMatch(
  identityA: CanonicalIngredientIdentity,
  identityB: CanonicalIngredientIdentity,
): ParentFormHierarchyMatch | null {
  if (!identityA.family || !identityB.family || identityA.family !== identityB.family) {
    return null;
  }
  if (!PARENT_FORM_HIERARCHY_FAMILIES.has(identityA.family)) return null;

  const aParent = detectParentConcept(identityA);
  const bParent = detectParentConcept(identityB);
  const aForm = detectFormSpecific(identityA);
  const bForm = detectFormSpecific(identityB);

  if (aParent && bParent) return null;
  if (aForm && bForm) return null;

  const allowedChildForms = PARENT_FORM_CHILD_FORMS[identityA.family];
  if (!allowedChildForms) return null;

  if (aParent && bForm && identityB.form && allowedChildForms.has(identityB.form)) {
    return {
      parentFamily: identityA.family,
      childForm: identityB.form,
      reason: parentFormHierarchyReason(identityA.family, identityB.form),
    };
  }

  if (bParent && aForm && identityA.form && allowedChildForms.has(identityA.form)) {
    return {
      parentFamily: identityB.family,
      childForm: identityA.form,
      reason: parentFormHierarchyReason(identityB.family, identityA.form),
    };
  }

  return null;
}

export function isParentFormHierarchyCandidate(
  identityA: CanonicalIngredientIdentity,
  identityB: CanonicalIngredientIdentity,
): boolean {
  return resolveParentFormHierarchyMatch(identityA, identityB) != null;
}
