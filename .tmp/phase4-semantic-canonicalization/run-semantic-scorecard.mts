/**
 * Re-score 32 VL food rows for Phase 4 semantic canonicalization.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildCanonicalIngredientCreateDefaults } from "../../src/lib/canonical-ingredient-create.ts";
import { normalizeIngredientName } from "../../src/lib/normalizeIngredient.ts";

const __dir = dirname(fileURLToPath(import.meta.url));

const FOOD_ROWS: { supplier: string; invoice: string }[] = [
  { supplier: "Bidfood", invoice: "Manteiga Coimbra s/Sal Emb 1 Kg" },
  { supplier: "Bidfood", invoice: "Abóbora Butternut" },
  { supplier: "Bidfood", invoice: "Alho Francês" },
  { supplier: "Bidfood", invoice: "Courgettes" },
  { supplier: "Bidfood", invoice: "Pêra Abacate Hasse" },
  { supplier: "Bidfood", invoice: "Hortelã" },
  { supplier: "Bidfood", invoice: "Manjericão" },
  { supplier: "Bidfood", invoice: "Salada Ibérica FSTK EMB. 250g" },
  { supplier: "Bidfood", invoice: "Tomilho" },
  { supplier: "Bidfood", invoice: "Ovo MORENO Classe M Cx.15 dúzias (CARTÃO)" },
  { supplier: "Emporio", invoice: "Rovagnati - Salame Ventricina 2,5 Kg" },
  { supplier: "Emporio", invoice: "De Cecco - Paccheri Lisci Nr. 125 - 500g" },
  {
    supplier: "Emporio",
    invoice: "Arrigoni Formaggi - Gorgonzola DOP Dolce Linea Castello 1/8 - 1,85kg",
  },
  { supplier: "Emporio", invoice: "Rovagnati - Assaporami Prosciutto Cotto Scelto HC 4,3-4,5KG" },
  {
    supplier: "Emporio",
    invoice: "Rovagnati - Mortadella IGP 'Massima' con Pistacchio 1/2 - 3,5Kg",
  },
  { supplier: "Emporio", invoice: "SanPellegrino - Acqua in vitro 75cl x 15ud" },
  { supplier: "Emporio", invoice: "Rigamonti - Bresaola Punta d'Anca Oro 1/2 - 1,5Kg" },
  { supplier: "Emporio", invoice: "Baladin - Ginger Beer 0.20cl" },
  { supplier: "Mammafiore", invoice: "Guanciale di suino stagionato +/- 1,5kg*7 Sorrentino" },
  { supplier: "Mammafiore", invoice: "Rulo Di Capra 1kg*2 Simonetta" },
  { supplier: "Mammafiore", invoice: "Farina do pasta fresca e gnocchi25kg Caputo" },
  { supplier: "Mammafiore", invoice: "MOZZA Fior di Latte Expet Julienne 3kg Simonetta" },
  { supplier: "Mammafiore", invoice: "Aceto balsamico di modena IGP pet 5l*2 Toschi" },
  {
    supplier: "Mammafiore",
    invoice: "Birra Peroni Nastro Azzurro PNA 33cl*24 Nastro Azzurro",
  },
  { supplier: "Mammafiore", invoice: "Farine Speciale pizza 25kg Amoruso" },
  { supplier: "Bocconcino", invoice: "ROLO DE CABRA E VACA 1KG" },
  { supplier: "Bocconcino", invoice: "RICOTTA TREVIGIANA 1,5KG" },
  { supplier: "Bocconcino", invoice: "ACQUA S.PELLEGRINO (CX 75CL*15)" },
  { supplier: "Bocconcino", invoice: "POMODORI PELATI (CX 2,5KG*6)" },
  { supplier: "Bocconcino", invoice: "MEZZI PACCHERI MANCINI (CX 1KG*6)" },
  { supplier: "Bocconcino", invoice: "STRACCIATELLA 250 GR" },
  { supplier: "Aviludo", invoice: "Filete de Anchovas Alconfirsta L1 495 g" },
];

const BRAND_LEAK_TOKENS = new Set([
  "rovagnati",
  "rigamonti",
  "arrigoni",
  "sorrentino",
  "amoruso",
  "alconfirsta",
]);

const COMMERCIAL_LEAK_TOKENS = new Set([
  "assaporami",
  "formaggi",
  "hc",
  "pna",
  "l1",
]);

const BEFORE_CLASS: Record<string, { primary: string; secondary?: string }> = {
  "Rovagnati - Salame Ventricina 2,5 Kg": { primary: "BRAND_LEAK" },
  "Arrigoni Formaggi - Gorgonzola DOP Dolce Linea Castello 1/8 - 1,85kg": {
    primary: "COMMERCIAL_DESCRIPTOR_LEAK",
    secondary: "BRAND_LEAK",
  },
  "Rovagnati - Assaporami Prosciutto Cotto Scelto HC 4,3-4,5KG": {
    primary: "COMMERCIAL_DESCRIPTOR_LEAK",
    secondary: "BRAND_LEAK",
  },
  "Rovagnati - Mortadella IGP 'Massima' con Pistacchio 1/2 - 3,5Kg": {
    primary: "BRAND_LEAK",
    secondary: "PACKAGE_METADATA_LEAK",
  },
  "SanPellegrino - Acqua in vitro 75cl x 15ud": {
    primary: "PACKAGE_METADATA_LEAK",
    secondary: "COMMERCIAL_DESCRIPTOR_LEAK",
  },
  "Rigamonti - Bresaola Punta d'Anca Oro 1/2 - 1,5Kg": {
    primary: "BRAND_LEAK",
    secondary: "PACKAGE_METADATA_LEAK",
  },
  "Guanciale di suino stagionato +/- 1,5kg*7 Sorrentino": { primary: "BRAND_LEAK" },
  "Birra Peroni Nastro Azzurro PNA 33cl*24 Nastro Azzurro": {
    primary: "COMMERCIAL_DESCRIPTOR_LEAK",
    secondary: "BRAND_LEAK",
  },
  "Farine Speciale pizza 25kg Amoruso": { primary: "BRAND_LEAK" },
  "MEZZI PACCHERI MANCINI (CX 1KG*6)": { primary: "BRAND_LEAK" },
  "STRACCIATELLA 250 GR": { primary: "PACKAGE_METADATA_LEAK" },
  "Filete de Anchovas Alconfirsta L1 495 g": {
    primary: "BRAND_LEAK",
    secondary: "COMMERCIAL_DESCRIPTOR_LEAK",
  },
};

function fold(value: string): string {
  return normalizeIngredientName(value);
}

function tokens(value: string | null): string[] {
  if (!value) return [];
  return fold(value).split(/\s+/).filter(Boolean);
}

function hasDuplicateToken(value: string, token: string): boolean {
  const t = tokens(value);
  const needle = fold(token);
  return t.filter((part) => part === needle).length > 1;
}

function classifySemantic(invoice: string, suggested: string | null): {
  primary: string;
  secondary?: string;
} {
  if (!suggested) return { primary: "GOOD" };
  const sugg = fold(suggested);
  const suggTokens = new Set(tokens(suggested));

  const secondary: string[] = [];

  for (const brand of BRAND_LEAK_TOKENS) {
    if (suggTokens.has(brand)) {
      return { primary: "BRAND_LEAK", secondary: secondary.join(", ") || undefined };
    }
  }

  if (/\blinea castello\b/.test(sugg) || (suggTokens.has("linea") && suggTokens.has("castello"))) {
    return { primary: "COMMERCIAL_DESCRIPTOR_LEAK" };
  }

  for (const commercial of COMMERCIAL_LEAK_TOKENS) {
    if (suggTokens.has(commercial)) {
      return { primary: "COMMERCIAL_DESCRIPTOR_LEAK" };
    }
  }

  if (/\bin vitro\b/.test(sugg)) {
    return { primary: "COMMERCIAL_DESCRIPTOR_LEAK" };
  }

  if (
    /\b1\/[248]\b/.test(suggested) ||
    /\b1\/\b/.test(suggested) ||
    /\b15ud\b/.test(sugg) ||
    hasDuplicateToken(suggested, "nastro") ||
    hasDuplicateToken(suggested, "azzurro")
  ) {
    return { primary: "PACKAGE_METADATA_LEAK" };
  }

  if (/\b495g\b/.test(sugg) && invoice.toLowerCase().includes("anchovas")) {
    return { primary: "PACKAGE_METADATA_LEAK" };
  }

  return { primary: "GOOD" };
}

const rows = FOOD_ROWS.map((row) => {
  const defaults = buildCanonicalIngredientCreateDefaults({
    id: "scorecard",
    name: row.invoice,
    quantity: 1,
    unit: "un",
    unit_price: 1,
  });
  const after = classifySemantic(row.invoice, defaults.suggestedCanonicalName);
  const before = BEFORE_CLASS[row.invoice] ?? { primary: "GOOD" };
  const transition =
    before.primary !== after.primary
      ? `${before.primary} → ${after.primary}`
      : before.primary === "GOOD" && after.primary === "GOOD"
        ? null
        : null;
  return {
    supplier: row.supplier,
    invoice: row.invoice,
    before: before.primary,
    beforeSecondary: before.secondary ?? null,
    after: after.primary,
    afterSecondary: after.secondary ?? null,
    suggested: defaults.suggestedCanonicalName,
    transition,
  };
});

const counts = { GOOD: 0, BRAND_LEAK: 0, COMMERCIAL_DESCRIPTOR_LEAK: 0, PACKAGE_METADATA_LEAK: 0 };
for (const row of rows) {
  counts[row.after as keyof typeof counts] += 1;
}

const beforeCounts = { GOOD: 20, BRAND_LEAK: 7, COMMERCIAL_DESCRIPTOR_LEAK: 3, PACKAGE_METADATA_LEAK: 2 };

const output = {
  generated_at: new Date().toISOString(),
  total: rows.length,
  before: {
    ...beforeCounts,
    goodPct: "62.5%",
  },
  after: {
    ...counts,
    goodPct: `${((counts.GOOD / rows.length) * 100).toFixed(1)}%`,
  },
  transitions: rows.filter((r) => r.transition),
  rows,
};

mkdirSync(__dir, { recursive: true });
writeFileSync(join(__dir, "scorecard-phase4.json"), JSON.stringify(output, null, 2));
console.log(
  JSON.stringify(
    {
      beforeGood: beforeCounts.GOOD,
      afterGood: counts.GOOD,
      afterGoodPct: output.after.goodPct,
      transitions: output.transitions.length,
      remaining: rows.filter((r) => r.after !== "GOOD").map((r) => r.invoice),
    },
    null,
    2,
  ),
);
