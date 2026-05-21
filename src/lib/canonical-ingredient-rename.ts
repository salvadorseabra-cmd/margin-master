import {
  buildCatalogIngredientIdentity,
  type CatalogIngredientIdentity,
} from "@/lib/canonical-ingredient-display-name";
import { validateCanonicalIngredientName } from "@/lib/canonical-ingredient-create";
import type { IngredientCanonicalInput } from "@/lib/ingredient-canonical";
import { guardIngredientCreation } from "@/lib/ingredient-operational-identity";

/** Catalog matcher key for an existing row (display cleanup, not invoice palha→frita). */
function catalogNormalizedNameForEntry(entry: IngredientCanonicalInput): string {
  const label = entry.name?.trim() || entry.normalized_name?.trim() || "";
  if (!label) return "";
  const identity: CatalogIngredientIdentity = buildCatalogIngredientIdentity(label);
  return identity.normalized_name;
}

function findPeerCatalogNormalizedNameConflict(
  normalized_name: string,
  peers: IngredientCanonicalInput[],
): IngredientCanonicalInput | null {
  if (!normalized_name) return null;
  for (const entry of peers) {
    if (catalogNormalizedNameForEntry(entry) === normalized_name) return entry;
  }
  return null;
}

/** Grep-friendly prefix for canonical catalog rename on Ingredients page. */
export const CANONICAL_RENAME_LOG_PREFIX = "[canonical-rename]";

export function traceCanonicalRename(
  stage: string,
  details?: Record<string, unknown>,
): void {
  const message = `${CANONICAL_RENAME_LOG_PREFIX} ${stage}`;
  if (details) console.info(message, details);
  else console.info(message);
}

export type CanonicalIngredientRenameValidation =
  | { ok: true }
  | { ok: false; message: string };

export function validateCanonicalIngredientRenameName(
  rawName: string | null | undefined,
): CanonicalIngredientRenameValidation {
  return validateCanonicalIngredientName(rawName);
}

export type CanonicalIngredientRenameUpdate = {
  ingredientId: string;
  name: string;
  normalized_name: string;
};

export type CanonicalIngredientRenamePayloadResult =
  | { ok: true; update: CanonicalIngredientRenameUpdate }
  | { ok: false; message: string };

/**
 * Build Supabase update fields for canonical `ingredients.name` only.
 * Does not touch ingredient_aliases or operational pack fields.
 */
export function buildCanonicalIngredientRenamePayload(
  ingredientId: string,
  rawName: string,
  catalog: IngredientCanonicalInput[],
): CanonicalIngredientRenamePayloadResult {
  const validation = validateCanonicalIngredientRenameName(rawName);
  if (!validation.ok) {
    return { ok: false, message: validation.message };
  }

  const { name, normalized_name } = buildCatalogIngredientIdentity(rawName);
  if (!normalized_name) {
    return { ok: false, message: "Enter a valid catalog ingredient name." };
  }

  const peers = catalog.filter((entry) => entry.id !== ingredientId);
  const normalizedConflict = findPeerCatalogNormalizedNameConflict(normalized_name, peers);
  if (normalizedConflict) {
    const existingLabel =
      normalizedConflict.name ??
      normalizedConflict.normalized_name ??
      normalizedConflict.id;
    traceCanonicalRename("duplicate-normalized_name", {
      ingredientId,
      proposedName: name,
      normalized_name,
      existingId: normalizedConflict.id,
      existingLabel,
    });
    return {
      ok: false,
      message: `Another ingredient already uses this name: ${existingLabel}`,
    };
  }

  const guard = guardIngredientCreation(name, peers);
  if (guard.action === "reuse") {
    const existingLabel =
      guard.existing.name ?? guard.existing.normalized_name ?? guard.existing.id;
    return {
      ok: false,
      message: `Another ingredient already uses this name: ${existingLabel}`,
    };
  }

  return {
    ok: true,
    update: { ingredientId, name, normalized_name },
  };
}
