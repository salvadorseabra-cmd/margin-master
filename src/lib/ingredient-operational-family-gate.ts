/**
 * Hard operational product-family gate — blocks cross-family semantic leakage
 * (e.g. SMASH PTY 90 vs CAIXA HAMBURGUER KRAFT packaging) before scoring.
 */

import { normalizeSupplierShorthand } from "@/lib/ingredient-operational-aliases";
import {
  detectOperationalFamily,
  operationalFamiliesIncompatibleFromRaw,
} from "@/lib/ingredient-operational-families";

const DIACRITIC_RE = /\p{M}/gu;

export type OperationalProductFamily =
  | "meat_protein"
  | "bread"
  | "frozen_potato"
  | "sauce"
  | "packaging"
  | "vegetable"
  | "cheese"
  | "processed_protein"
  | "beverage"
  | "cooking_oil"
  | "unknown";

const MEAT_TOKENS = new Set([
  "pty",
  "patty",
  "smash",
  "ang",
  "angus",
  "burg",
  "burger",
  "beef",
  "hmb",
  "hamburguer",
  "hamburger",
  "bovino",
  "acem",
  "vazia",
  "novilho",
]);

const PACKAGING_TOKENS = new Set([
  "box",
  "kraft",
  "emb",
  "pack",
  "caixa",
  "cx",
  "peq",
  "embalagem",
]);

const FROZEN_POTATO_CUT_TOKENS = new Set([
  "shoe",
  "shoestr",
  "shoestring",
  "wdg",
  "wedge",
  "wedges",
  "pal",
  "palha",
  "fries",
  "frita",
  "fritas",
  "9x9",
]);

const BREAD_TOKENS = new Set(["brch", "bun", "pao", "brioche", "ses", "sesamo", "sesame"]);

const PROCESSED_PROTEIN_TOKENS = new Set([
  "bac",
  "bacon",
  "chk",
  "chicken",
  "frango",
  "breaded",
  "strk",
  "streaky",
  "fumado",
  "smoked",
  "smk",
  "fum",
]);

const CHEESE_TOKENS = new Set(["ched", "cheddar", "mozzarella", "mozz", "queijo"]);

const SAUCE_TOKENS = new Set([
  "bbq",
  "maio",
  "maionese",
  "mayo",
  "ketchup",
  "ketch",
  "catchup",
  "molho",
  "mol",
  "sauce",
  "salsa",
]);

const BEVERAGE_TOKENS = new Set(["cola", "beer", "wine", "cerveja", "vinho"]);

const VEGETABLE_TOKENS = new Set([
  "tomate",
  "alface",
  "cebola",
  "onion",
  "oni",
  "pickles",
  "pickl",
  "pkl",
  "alho",
]);

const COOKING_OIL_TOKENS = new Set([
  "oleo",
  "girassol",
  "azeite",
  "oil",
  "sunflower",
  "fritura",
]);

const CHEESE_SAUCE_DISP_TOKENS = new Set([
  "top",
  "down",
  "disp",
  "dispenser",
  "mol",
  "molho",
  "sauce",
  "salsa",
]);

const GRID_CUT_PLACEHOLDER = "__grid9x9__";

function preserveGridCutToken(s: string): string {
  return s
    .replace(/\b9\s*x\s*9\b/gi, ` ${GRID_CUT_PLACEHOLDER} `)
    .replace(/\b9x9\b/gi, ` ${GRID_CUT_PLACEHOLDER} `);
}

function restoreGridCutToken(s: string): string {
  return s.replace(new RegExp(GRID_CUT_PLACEHOLDER, "g"), "9x9");
}

function stripForFamilyGate(raw: string): string {
  let s = raw.normalize("NFD").replace(DIACRITIC_RE, "").toLowerCase();
  s = s.replace(/[^a-z0-9\s]+/g, " ");
  s = s.replace(
    /\b\d+(?:[.,]\d+)?\s*(?:kg|kgs|g|gr|grs|mg|ml|cl|l|lt|lts|ltr|ltrs|un|uni|unid)\b/gi,
    " ",
  );
  s = s.replace(/\b\d+(?:kg|g|ml|cl|l|un)\b/gi, " ");
  s = preserveGridCutToken(s);
  s = s.replace(/\b\d+\b/g, " ");
  s = restoreGridCutToken(s);
  return s.replace(/\s+/g, " ").trim();
}

function tokenizeForFamilyGate(raw: string): { normalized: string; tokens: string[] } {
  const expanded = normalizeSupplierShorthand(raw);
  const normalized = stripForFamilyGate(expanded || raw);
  const tokens = normalized ? normalized.split(/\s+/).filter(Boolean) : [];
  return { normalized, tokens };
}

function hasPackQtyUnSignal(normalized: string, tokens: string[]): boolean {
  if (/\b250\s*un\b/.test(normalized) || tokens.includes("250un")) return true;
  if (!tokens.includes("un")) return false;
  return tokens.some((t) => PACKAGING_TOKENS.has(t));
}

/** Patty/smash lines stay meat even when a catalog name mentions hamburguer on packaging. */
const STRONG_MEAT_PATTY_TOKENS = new Set(["pty", "patty", "smash", "ang", "angus"]);

function hasStrongMeatPattySignal(tokens: string[]): boolean {
  return tokens.some((t) => STRONG_MEAT_PATTY_TOKENS.has(t));
}

function hasPackagingPriority(tokens: string[], normalized: string): boolean {
  if (hasStrongMeatPattySignal(tokens)) return false;
  if (tokens.some((t) => PACKAGING_TOKENS.has(t))) return true;
  if (hasPackQtyUnSignal(normalized, tokens)) return true;
  return false;
}

function hasFrozenPotatoSignal(tokens: string[]): boolean {
  const hasBat = tokens.includes("batata") || tokens.includes("bat");
  const hasCut = tokens.some((t) => FROZEN_POTATO_CUT_TOKENS.has(t));
  return hasBat && hasCut;
}

function hasBreadSignal(tokens: string[]): boolean {
  return tokens.some((t) => BREAD_TOKENS.has(t));
}

function hasMeatSignal(tokens: string[]): boolean {
  return tokens.some((t) => MEAT_TOKENS.has(t));
}

function hasCheeseSauceSignal(tokens: string[]): boolean {
  const hasCheese = tokens.some((t) => CHEESE_TOKENS.has(t));
  if (!hasCheese) return false;
  return tokens.some((t) => CHEESE_SAUCE_DISP_TOKENS.has(t) || SAUCE_TOKENS.has(t));
}

function hasOnionRingsSignal(tokens: string[]): boolean {
  const hasOnion = tokens.includes("onion") || tokens.includes("oni");
  const hasRings = tokens.includes("rings") || tokens.includes("rng") || tokens.includes("ring");
  return hasOnion && hasRings;
}

function hasPicklesSlicedSignal(tokens: string[]): boolean {
  const hasPickles = tokens.some((t) => ["pickles", "pickl", "pkl"].includes(t));
  const hasSliced = tokens.some((t) =>
    ["fatiados", "fatiado", "slc", "slcd", "sliced"].includes(t),
  );
  return hasPickles && hasSliced;
}

function hasCookingOilSignal(tokens: string[]): boolean {
  return tokens.some((t) => COOKING_OIL_TOKENS.has(t));
}

function hasProcessedProteinSignal(tokens: string[]): boolean {
  const hasBacon = tokens.includes("bac") || tokens.includes("bacon");
  const hasChicken =
    tokens.includes("chk") || tokens.includes("chicken") || tokens.includes("frango");
  if (
    hasBacon &&
    tokens.some((t) => t === "strk" || t === "streaky" || t === "fum" || t === "fumado")
  ) {
    return true;
  }
  if (hasChicken && tokens.includes("breaded")) return true;
  if (hasBacon || hasChicken) return true;
  return tokens.some((t) => PROCESSED_PROTEIN_TOKENS.has(t));
}

function mapRegistryFamilyToGate(
  registryId: ReturnType<typeof detectOperationalFamily>,
): OperationalProductFamily | null {
  if (registryId === "fried_potato_products") return "frozen_potato";
  if (registryId === "burger_bread") return "bread";
  if (registryId === "sliced_cheese") return "cheese";
  if (registryId === "cheese_sauce") return "sauce";
  if (registryId === "ketchup") return "sauce";
  return null;
}

function phraseHasOnionRings(normalized: string): boolean {
  return (
    normalized.includes("onion rings") ||
    (/\bonion\b/.test(normalized) && /\brings?\b/.test(normalized))
  );
}

/**
 * Deterministic coarse product family from supplier/catalog wording.
 * Packaging tokens (caixa, kraft, box) win over weak hamburguer in pack lines.
 */
export function inferOperationalProductFamily(rawName: string): OperationalProductFamily {
  if (!rawName?.trim()) return "unknown";

  const registryMapped = mapRegistryFamilyToGate(detectOperationalFamily(rawName));
  const { normalized, tokens } = tokenizeForFamilyGate(rawName);
  if (!normalized || tokens.length === 0) {
    return registryMapped ?? "unknown";
  }

  if (hasPackagingPriority(tokens, normalized)) return "packaging";

  if (registryMapped === "cheese_sauce" || hasCheeseSauceSignal(tokens)) {
    return "sauce";
  }

  if (registryMapped === "frozen_potato" || hasFrozenPotatoSignal(tokens)) {
    return "frozen_potato";
  }

  if (registryMapped === "bread" || (hasBreadSignal(tokens) && !hasFrozenPotatoSignal(tokens))) {
    return "bread";
  }

  if (phraseHasOnionRings(normalized) || hasOnionRingsSignal(tokens)) {
    return "processed_protein";
  }

  if (hasPicklesSlicedSignal(tokens)) return "vegetable";

  if (hasProcessedProteinSignal(tokens) && !hasMeatSignal(tokens)) {
    return "processed_protein";
  }

  if (hasMeatSignal(tokens)) return "meat_protein";

  if (tokens.some((t) => CHEESE_TOKENS.has(t)) && !tokens.some((t) => SAUCE_TOKENS.has(t))) {
    return "cheese";
  }

  if (tokens.some((t) => SAUCE_TOKENS.has(t))) return "sauce";

  if (tokens.some((t) => BEVERAGE_TOKENS.has(t))) return "beverage";

  if (hasCookingOilSignal(tokens)) return "cooking_oil";

  if (tokens.some((t) => VEGETABLE_TOKENS.has(t))) return "vegetable";

  if (registryMapped) return registryMapped;

  return "unknown";
}

/**
 * True when candidate must be skipped: different confident families, or legacy
 * fried-potato vs bread registry incompatibility.
 */
export function shouldSkipByOperationalProductFamilyGate(rawA: string, rawB: string): boolean {
  const familyA = inferOperationalProductFamily(rawA);
  const familyB = inferOperationalProductFamily(rawB);
  if (familyA !== "unknown" && familyB !== "unknown" && familyA !== familyB) {
    return true;
  }
  return operationalFamiliesIncompatibleFromRaw(rawA, rawB);
}
