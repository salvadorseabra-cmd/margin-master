/**
 * Re-run VL Review & Create scorecard (33 rows) after final cleanup.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildCanonicalIngredientCreateDefaults } from "../../src/lib/canonical-ingredient-create.ts";
import { normalizeIngredientName } from "../../src/lib/normalizeIngredient.ts";

const __dir = dirname(fileURLToPath(import.meta.url));
const phase2 = JSON.parse(
  readFileSync(join(__dir, "../phase2-noise-cleanup/scorecard-phase2.json"), "utf8"),
);
const baseline = JSON.parse(
  readFileSync(join(__dir, "../canonical-ingredient-identity-audit/scorecard-data.json"), "utf8"),
);
const phase1 = JSON.parse(
  readFileSync(join(__dir, "../phase1-empty-fix/scorecard-after-phase1.json"), "utf8"),
);

const NOISE_TOKENS = new Set([
  "coimbra", "moreno", "hasse", "emb", "fstk", "cartao", "cartão", "cx", "caixa", "pack",
  "simonetta", "caputo", "toschi", "pet", "expet", "nr", "metro", "chef", "continente",
  "auchan", "guloso", "heinz", "baladin", "de", "cecco", "amoruso", "sorrentino", "nastro",
  "azzurro", "pna", "alconfirsta", "l1", "rovagnati", "rigamonti", "arrigoni", "formaggi",
  "mancini", "peroni", "sanpellegrino",
]);

function fold(value: string): string {
  return normalizeIngredientName(value);
}

function invoiceTokens(invoice: string): string[] {
  return fold(invoice).split(/\s+/).filter(Boolean);
}

function suggestionTokens(suggested: string | null): string[] {
  if (!suggested) return [];
  return fold(suggested).split(/\s+/).filter(Boolean);
}

function retainedNoiseCount(invoice: string, suggested: string | null): number {
  if (!suggested) return 0;
  const suggSet = new Set(suggestionTokens(suggested));
  return invoiceTokens(invoice).filter((t) => NOISE_TOKENS.has(t) && suggSet.has(t)).length;
}

function classifyRow(invoice: string, suggested: string | null, catalogReady: boolean): string {
  if (!suggested) return "EMPTY";
  if (fold(suggested) === fold(invoice) && !catalogReady) return "EMPTY";
  const inv = invoiceTokens(invoice);
  const sug = suggestionTokens(suggested);
  const noise = retainedNoiseCount(invoice, suggested);
  const strippedRatio = inv.length > 0 ? (inv.length - sug.length) / inv.length : 0;

  if (catalogReady && sug.length <= 2) return "EXCELLENT";
  if (noise === 0 && strippedRatio >= 0.25 && sug.length <= 5) return "EXCELLENT";
  if (noise <= 1 && sug.length <= 8) return "ACCEPTABLE";
  if (noise >= 2 || sug.length > 8) return "WEAK";
  return "ACCEPTABLE";
}

const baselineByInvoice = new Map(
  baseline.unmatched.rows.map((r: { invoice: string; class: string }) => [r.invoice, r.class]),
);
const phase1ByInvoice = new Map(
  phase1.rows.map((r: { invoice: string; phase1Class: string }) => [r.invoice, r.phase1Class]),
);

const rows = phase2.rows.map((row: { invoice: string; phase2Class: string }) => {
  const defaults = buildCanonicalIngredientCreateDefaults({
    id: "scorecard",
    name: row.invoice,
    quantity: 1,
    unit: "un",
    unit_price: 1,
  });
  const finalClass = classifyRow(
    row.invoice,
    defaults.suggestedCanonicalName,
    defaults.catalogReady,
  );
  return {
    invoice: row.invoice,
    baseline: baselineByInvoice.get(row.invoice) ?? row.baseline,
    phase1Class: phase1ByInvoice.get(row.invoice) ?? row.phase1Class,
    phase2Class: row.phase2Class,
    finalClass,
    suggested: defaults.suggestedCanonicalName,
    catalogReady: defaults.catalogReady,
    transition:
      row.phase2Class !== finalClass ? `${row.phase2Class} → ${finalClass}` : null,
  };
});

const counts = { EXCELLENT: 0, ACCEPTABLE: 0, WEAK: 0, EMPTY: 0 };
for (const row of rows) {
  counts[row.finalClass as keyof typeof counts] += 1;
}
const usable = counts.EXCELLENT + counts.ACCEPTABLE;

const output = {
  generated_at: new Date().toISOString(),
  total: rows.length,
  counts,
  usable,
  usablePct: `${((usable / rows.length) * 100).toFixed(1)}%`,
  rows,
};

mkdirSync(__dir, { recursive: true });
writeFileSync(join(__dir, "scorecard-final.json"), JSON.stringify(output, null, 2));
console.log(JSON.stringify({ counts, usable, usablePct: output.usablePct }, null, 2));
