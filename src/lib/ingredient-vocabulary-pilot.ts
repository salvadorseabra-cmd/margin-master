/**
 * Vocabulary Pilot — 15 tokens (Validation Lab, lhackrnlnrsiamorzmkb).
 *
 * Remove this module and merge sites in ingredient-identity.ts / ingredient-canonical.ts
 * to roll back the pilot.
 */

/** Family/concept + product tokens → ingredient-identity family id. */
export const VOCABULARY_PILOT_FAMILY_TOKEN_TO_ID: Record<string, string> = {
  // Family / concept (10)
  pao: "bread",
  novilho: "meat",
  queijo: "cheese",
  frango: "chicken",
  pepino: "pickles",
  molho: "sauce",
  mostarda: "sauce",
  vinho: "beverage",
  cerveja: "beverage",
  agua: "beverage",
  // Product (5)
  bbq: "sauce",
  vazia: "meat",
  acem: "meat",
  sesamo: "bread",
  rustico: "bread",
};

/** All 15 pilot tokens for semantic core overlap (ingredient-canonical). */
export const VOCABULARY_PILOT_CORE_TOKENS: readonly string[] = [
  "pao",
  "novilho",
  "queijo",
  "frango",
  "pepino",
  "molho",
  "mostarda",
  "vinho",
  "cerveja",
  "agua",
  "bbq",
  "vazia",
  "acem",
  "sesamo",
  "rustico",
];

/** Semantic family ids for classifyIngredientMatchTokens (ingredient-canonical). */
export const VOCABULARY_PILOT_TOKEN_TO_INGREDIENT_FAMILY: Record<string, string> = {
  pao: "bread",
  novilho: "meat",
  queijo: "cheese",
  frango: "meat",
  pepino: "condiment",
  molho: "sauce",
  mostarda: "sauce",
  vinho: "beverage",
  cerveja: "beverage",
  agua: "beverage",
  bbq: "sauce",
  vazia: "meat",
  acem: "meat",
  sesamo: "bread",
  rustico: "bread",
};
