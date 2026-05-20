/**
 * Lightweight operational product families — finer than ingredient-identity `family`
 * (e.g. fried potatoes vs potato bread) to block false positives before semantic scoring.
 */

const DIACRITIC_RE = /\p{M}/gu;

const QUANTITY_RE =
  /\b\d+(?:[.,]\d+)?\s*(?:kg|kgs|g|gr|grs|mg|ml|cl|l|lt|lts|ltr|ltrs|un|uni|unid)\b/gi;
const ATTACHED_QTY_RE = /\b\d+(?:kg|kgs|g|gr|grs|mg|ml|cl|l|lt|lts|ltr|ltrs)\b/gi;

export type OperationalFamilyId =
  | "fried_potato_products"
  | "burger_bread"
  | "sliced_cheese"
  | "cheese_sauce"
  | "ketchup";

export type OperationalFamilyDefinition = {
  id: OperationalFamilyId;
  /** Multi-word / token phrases (accent-stripped lowercase); longest match wins. */
  phrases: readonly string[];
};

/** In-memory registry — no DB / migrations. */
export const OPERATIONAL_FAMILY_REGISTRY: Record<
  OperationalFamilyId,
  OperationalFamilyDefinition
> = {
  burger_bread: {
    id: "burger_bread",
    phrases: [
      "pao de batata",
      "pao batata",
      "batata bread",
      "potato bread",
      "pao hamburger",
      "pao hamburguer",
      "hamburger bun",
      "burger bun",
      "sesame bun",
      "brioche bun",
      "brioche",
      "brioche artesanal",
      "brioche gourmet",
    ],
  },
  fried_potato_products: {
    id: "fried_potato_products",
    phrases: [
      "batata shoestring",
      "shoestring fries",
      "shoestring",
      "batata palha",
      "palha snack",
      "batata snack",
      "potato sticks",
      "batata sticks",
      "steakhouse fries",
      "frozen fries",
      "french fries",
      "batata frita",
      "batatas fritas",
      "corte fino",
      "hash brown",
      "hashbrown",
      "hashbrowns",
      "wedges",
      "batata wedges",
      "batata palha premium",
      "palha premium",
      "palha",
      "batata frita corte fino",
    ],
  },
  sliced_cheese: {
    id: "sliced_cheese",
    phrases: [
      "queijo cheddar fatiado",
      "queijo cheddar fatiada",
      "cheddar fatiado",
      "cheddar fatiada",
      "cheddar slices",
      "cheddar sliced",
      "fatias burger",
      "fatiado burger",
      "cheddar fatias",
    ],
  },
  cheese_sauce: {
    id: "cheese_sauce",
    phrases: [
      "molho cheddar",
      "cheddar molho",
      "cheese sauce",
      "dispensador cheddar",
      "cheddar sauce",
      "nacho cheese sauce",
    ],
  },
  ketchup: {
    id: "ketchup",
    phrases: ["ketchup", "catchup", "catsup"],
  },
};

/** Pairs that must not match even when canonical family tokens overlap (e.g. batata). */
const INCOMPATIBLE_OPERATIONAL_FAMILY_PAIRS: [OperationalFamilyId, OperationalFamilyId][] =
  [
    ["fried_potato_products", "burger_bread"],
    ["sliced_cheese", "cheese_sauce"],
  ];

const PHRASE_TO_FAMILY: { phrase: string; familyId: OperationalFamilyId }[] = Object.values(
  OPERATIONAL_FAMILY_REGISTRY,
)
  .flatMap((def) => def.phrases.map((phrase) => ({ phrase, familyId: def.id })))
  .sort((a, b) => b.phrase.length - a.phrase.length);

function stripForOperationalFamily(raw: string): string {
  let s = raw.normalize("NFD").replace(DIACRITIC_RE, "").toLowerCase();
  s = s.replace(/[^a-z0-9\s]+/g, " ");
  s = s.replace(QUANTITY_RE, " ");
  s = s.replace(ATTACHED_QTY_RE, " ");
  s = s.replace(/\b\d+\b/g, " ");
  return s.replace(/\s+/g, " ").trim();
}

function phraseMatches(normalized: string, phrase: string): boolean {
  if (!phrase) return false;
  if (normalized === phrase) return true;
  const padded = ` ${normalized} `;
  return padded.includes(` ${phrase} `);
}

/**
 * Detect operational family from supplier wording. Returns null when no specific family applies
 * (e.g. plain cheddar block) so parent-form and generic identity logic stay unchanged.
 */
export function detectOperationalFamily(name: string): OperationalFamilyId | null {
  const normalized = stripForOperationalFamily(name);
  if (!normalized) return null;

  for (const { phrase, familyId } of PHRASE_TO_FAMILY) {
    if (phraseMatches(normalized, phrase)) return familyId;
  }

  return null;
}

export function areOperationalFamiliesCompatible(
  familyA: OperationalFamilyId | null,
  familyB: OperationalFamilyId | null,
): boolean {
  if (!familyA || !familyB) return true;
  if (familyA === familyB) return true;
  return !INCOMPATIBLE_OPERATIONAL_FAMILY_PAIRS.some(
    ([left, right]) =>
      (familyA === left && familyB === right) || (familyA === right && familyB === left),
  );
}

export function areOperationalFamiliesIncompatible(
  familyA: OperationalFamilyId | null,
  familyB: OperationalFamilyId | null,
): boolean {
  return !areOperationalFamiliesCompatible(familyA, familyB);
}

export function operationalFamiliesIncompatibleFromRaw(
  rawA: string,
  rawB: string,
): boolean {
  return areOperationalFamiliesIncompatible(
    detectOperationalFamily(rawA),
    detectOperationalFamily(rawB),
  );
}
