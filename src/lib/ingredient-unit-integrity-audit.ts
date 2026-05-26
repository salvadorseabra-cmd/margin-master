/**
 * Read-only audit for persisted ingredient unit contamination (legacy g/ml on countable SKUs).
 * Does not mutate data. Pair with SQL samples below for live DB counts.
 */

import {
  inferIngredientCostBaseUnit,
  isOperationalPricingResolved,
  type IngredientCostFields,
} from "@/lib/ingredient-unit-cost";
import type { BaseUnit } from "@/lib/recipe-unit-normalization";
import { inferUnitFamily, unitFamilyForBaseUnit } from "@/lib/recipe-unit-normalization";

/** Operational price fields (invoice overlay / catalog / embed). */
export type CountableOperationalCostFields = IngredientCostFields & {
  cost_base_unit?: BaseUnit | null;
  usable_weight_grams?: number | null;
  usable_volume_ml?: number | null;
};

export const INGREDIENT_UNIT_AUDIT_LOG_PREFIX = "[INGREDIENT_UNIT_AUDIT]";

/** Run against Supabase SQL editor (replace auth.uid() scope as needed). */
export const INGREDIENT_UNIT_INTEGRITY_SAMPLE_QUERIES = {
  embeddedWeightMassBase: `
-- Countable-named rows with mass purchase/base units
select count(*) as cnt
from public.ingredients i
where i.archived_at is null
  and (
    coalesce(i.base_unit, i.purchase_unit, i.unit) in ('g', 'ml')
    or coalesce(i.base_unit, i.purchase_unit, i.unit) ilike '%gr%'
  )
  and i.name ~* '(brioche|bun|pão|pao|lata|garrafa|pack|cx|caixa|\\d+\\s*(g|gr|ml|cl)\\b)';
`,
  gramDenominatorMatchesNameWeight: `
-- purchase_quantity equals embedded gram/cl digits (classic bun contamination)
select id, name, current_price, purchase_quantity, purchase_unit, base_unit, unit
from public.ingredients i
where i.archived_at is null
  and purchase_quantity between 10 and 500
  and coalesce(i.purchase_unit, i.base_unit, i.unit) in ('g', 'ml', 'un', 'unit')
  and (regexp_match(lower(i.name), '(\\d+)\\s*(g|gr|ml|cl)\\b'))[1]::numeric = purchase_quantity
order by name
limit 200;
`,
  massBaseBriocheBread: `
select id, name, purchase_quantity, purchase_unit, base_unit, unit, current_price
from public.ingredients
where archived_at is null
  and name ~* 'brioche|bun|pão|pao'
  and coalesce(base_unit, purchase_unit, unit) in ('g', 'ml');
`,
} as const;

export type IngredientUnitIntegrityCatalogRow = {
  id: string;
  name: string;
  current_price?: number | null;
  purchase_quantity?: number | null;
  purchase_unit?: string | null;
  base_unit?: string | null;
  unit?: string | null;
};

export type IngredientUnitContaminationPattern =
  | "embedded_weight_with_mass_base"
  | "gram_denominator_matches_embedded_weight"
  | "mass_base_on_countable_name"
  | "inferred_mass_base_from_pq_heuristic"
  | "countable_name_weight_family_mismatch";

export type IngredientUnitIntegrityFinding = {
  ingredientId: string;
  name: string;
  patterns: IngredientUnitContaminationPattern[];
  embeddedWeightG: number | null;
  embeddedVolumeMl: number | null;
  purchase_quantity: number | null;
  purchase_unit: string | null;
  base_unit: string | null;
  inferredCostBaseUnit: BaseUnit;
  recommendedFix: string;
};

const COUNTABLE_NAME_RE =
  /\b(bun|buns|brioche|pão|pao|bread|baguette|croissant|wrap|lata|latas|garrafa|garrafas|pack|packs|caixa|cx|un\b|uni\b|unid)\b/i;

const BULK_WEIGHT_NAME_RE =
  /\b(kg|kilo|novilho|vitelão|vitela|frango|porco|carne|beef|meat|farinha|flour|azeite|oil|manteiga|butter)\b/i;

const EMBEDDED_MEASURE_RE = /(\d+(?:[.,]\d+)?)\s*(g|gr|grs|gram|grams|ml|cl)\b/i;

/** Piece size embedded in catalog display name (e.g. "80g", "33cl"). */
export function extractEmbeddedMeasureFromIngredientName(name: string): {
  referenceWeightG: number | null;
  referenceVolumeMl: number | null;
} {
  const parsed = parseEmbeddedMeasure(name);
  return { referenceWeightG: parsed.grams, referenceVolumeMl: parsed.ml };
}

function parseEmbeddedMeasure(name: string): { grams: number | null; ml: number | null } {
  const match = name.match(EMBEDDED_MEASURE_RE);
  if (!match) return { grams: null, ml: null };
  const raw = Number(match[1].replace(",", "."));
  if (!Number.isFinite(raw) || raw <= 0) return { grams: null, ml: null };
  const unit = match[2].toLowerCase();
  if (unit === "ml") return { grams: null, ml: raw };
  if (unit === "cl") return { grams: null, ml: raw * 10 };
  return { grams: raw, ml: null };
}

function normalizedMassUnit(unit: string | null | undefined): boolean {
  const u = unit?.trim().toLowerCase() ?? "";
  return u === "g" || u === "gr" || u === "gram" || u === "grams" || u === "ml" || u === "cl";
}

export function isCountableProductName(name: string): boolean {
  if (BULK_WEIGHT_NAME_RE.test(name) && !COUNTABLE_NAME_RE.test(name)) return false;
  return COUNTABLE_NAME_RE.test(name) || Boolean(parseEmbeddedMeasure(name).grams || parseEmbeddedMeasure(name).ml);
}

/**
 * Legacy catalog rows stored pack €/un as `current_price / embedded grams` (e.g. €0.21 / 80g → €0.002625).
 * Repair at resolve time: €/un with pq=1 and piece weight in usable metadata.
 */
export function repairCountableEmbeddedWeightDenominator(
  fields: CountableOperationalCostFields,
  context?: { ingredientName?: string | null },
): CountableOperationalCostFields {
  const name = context?.ingredientName?.trim();
  if (!name || !isOperationalPricingResolved(fields) || !isCountableProductName(name)) {
    return fields;
  }

  const embedded = parseEmbeddedMeasure(name);
  const pq = Number(fields.purchase_quantity);
  const price = Number(fields.current_price);
  if (!Number.isFinite(pq) || pq <= 0 || !Number.isFinite(price) || price <= 0) {
    return fields;
  }

  const matchesEmbed =
    (embedded.grams != null && Math.abs(pq - embedded.grams) < 0.01) ||
    (embedded.ml != null && Math.abs(pq - embedded.ml) < 0.01);
  if (!matchesEmbed) return fields;

  const massMisbase = fields.cost_base_unit === "g" || fields.cost_base_unit === "ml";
  const singleUnitRetailPrice = price < 5;

  if (!massMisbase && !singleUnitRetailPrice) return fields;

  const next: CountableOperationalCostFields = {
    ...fields,
    cost_base_unit: "un",
    purchase_quantity: singleUnitRetailPrice ? 1 : fields.purchase_quantity,
  };
  if (embedded.grams != null) {
    next.usable_weight_grams = embedded.grams;
  }
  if (embedded.ml != null) {
    next.usable_volume_ml = embedded.ml;
  }
  return next;
}

function toCostFields(row: IngredientUnitIntegrityCatalogRow): IngredientCostFields {
  return {
    current_price: row.current_price ?? null,
    purchase_quantity: row.purchase_quantity ?? null,
  };
}

function persistedMassUnit(row: IngredientUnitIntegrityCatalogRow): string | null {
  return row.base_unit?.trim() || row.purchase_unit?.trim() || row.unit?.trim() || null;
}

/**
 * Classify catalog rows that likely inherited pre-fix gram denominators or mass base units.
 */
export function auditIngredientUnitIntegrity(
  catalog: readonly IngredientUnitIntegrityCatalogRow[],
): IngredientUnitIntegrityFinding[] {
  const findings: IngredientUnitIntegrityFinding[] = [];

  for (const row of catalog) {
    const id = row.id?.trim();
    const name = row.name?.trim();
    if (!id || !name) continue;

    const embedded = parseEmbeddedMeasure(name);
    const hasEmbedded = embedded.grams != null || embedded.ml != null;
    const massUnit = persistedMassUnit(row);
    const pq = Number(row.purchase_quantity);
    const patterns: IngredientUnitContaminationPattern[] = [];
    const inferredCostBaseUnit = inferIngredientCostBaseUnit(toCostFields(row));
    const countableName = isCountableProductName(name);

    if (hasEmbedded && normalizedMassUnit(massUnit)) {
      patterns.push("embedded_weight_with_mass_base");
    }

    if (
      countableName &&
      hasEmbedded &&
      Number.isFinite(pq) &&
      ((embedded.grams != null && Math.abs(pq - embedded.grams) < 0.01) ||
        (embedded.ml != null && Math.abs(pq - embedded.ml) < 0.01))
    ) {
      patterns.push("gram_denominator_matches_embedded_weight");
    }

    if (countableName && normalizedMassUnit(massUnit)) {
      patterns.push("mass_base_on_countable_name");
    }

    if (countableName && inferredCostBaseUnit === "g" && pq === 1000) {
      patterns.push("inferred_mass_base_from_pq_heuristic");
    }

    if (
      countableName &&
      hasEmbedded &&
      unitFamilyForBaseUnit(inferredCostBaseUnit) === "weight" &&
      inferUnitFamily("un") === "countable"
    ) {
      patterns.push("countable_name_weight_family_mismatch");
    }

    if (patterns.length === 0) continue;

    const fixParts: string[] = [
      "Set purchase_unit and base_unit to un; set purchase_quantity to units-per-pack (or 1 for single-unit price).",
    ];
    if (embedded.grams != null) {
      fixParts.push(
        `Store piece weight ${embedded.grams}g in reference metadata when a column exists; until then keep in display name only.`,
      );
    }

    findings.push({
      ingredientId: id,
      name,
      patterns,
      embeddedWeightG: embedded.grams,
      embeddedVolumeMl: embedded.ml,
      purchase_quantity: Number.isFinite(pq) ? pq : null,
      purchase_unit: row.purchase_unit ?? null,
      base_unit: row.base_unit ?? null,
      inferredCostBaseUnit,
      recommendedFix: fixParts.join(" "),
    });
  }

  return findings;
}

export function summarizeIngredientUnitIntegrity(
  findings: readonly IngredientUnitIntegrityFinding[],
): Record<IngredientUnitContaminationPattern, number> {
  const counts: Record<IngredientUnitContaminationPattern, number> = {
    embedded_weight_with_mass_base: 0,
    gram_denominator_matches_embedded_weight: 0,
    mass_base_on_countable_name: 0,
    inferred_mass_base_from_pq_heuristic: 0,
    countable_name_weight_family_mismatch: 0,
  };
  for (const row of findings) {
    for (const pattern of row.patterns) {
      counts[pattern] += 1;
    }
  }
  return counts;
}
