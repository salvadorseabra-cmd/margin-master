/**
 * Invoice Review operational cost label cleanup — validation replay.
 * Removes redundant "usable" suffix from cost label only (quantity label unchanged).
 */
import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolveInvoiceLinePricingPresentation } from "../../src/lib/invoice-purchase-price-semantics.ts";

const VL = "bjhnlrgodcqoyzddbpbd";
const OUT = ".tmp/invoice-review-usable-label-cleanup";

type MatrixRow = {
  id: string;
  product: string;
  designCase?: string;
  meta: {
    name: string;
    quantity: number;
    unit: string;
    unit_price: number;
    line_total?: number;
    matchedIngredientName?: string;
  };
  expectQuantityLabel: RegExp | null;
  expectCostLabel: string | null;
  expectCostHasUsableSuffix: boolean;
  expectCollapsed: boolean;
};

const MATRIX: MatrixRow[] = [
  {
    id: "A-pera",
    product: "Pêra Abacate Hasse",
    designCase: "A",
    meta: {
      name: "Pêra Abacate Hasse",
      quantity: 3.28,
      unit: "kg",
      unit_price: 4.26,
      line_total: 13.96,
    },
    expectQuantityLabel: null,
    expectCostLabel: null,
    expectCostHasUsableSuffix: false,
    expectCollapsed: true,
  },
  {
    id: "B-salada",
    product: "Salada Ibérica",
    designCase: "B",
    meta: {
      name: "Salada Ibérica FSTK EMB. 250g",
      quantity: 4,
      unit: "em",
      unit_price: 2.19,
      line_total: 8.76,
    },
    expectQuantityLabel: /250\s*g\s+usable/i,
    expectCostLabel: "€8.76 / kg",
    expectCostHasUsableSuffix: false,
    expectCollapsed: false,
  },
  {
    id: "C-ovo",
    product: "Ovo classe M",
    designCase: "C",
    meta: {
      name: "Ovo MORENO Classe M Cx.15 dúzias (CARTÃO)",
      quantity: 1,
      unit: "cx",
      unit_price: 38.44,
    },
    expectQuantityLabel: /180\s+un\s+usable/i,
    expectCostLabel: "€0.2136 / egg",
    expectCostHasUsableSuffix: false,
    expectCollapsed: false,
  },
  {
    id: "D-tomilho",
    product: "Tomilho",
    designCase: "D",
    meta: { name: "Tomilho", quantity: 1, unit: "mo", unit_price: 2.06 },
    expectQuantityLabel: /100\s*g\s+usable/i,
    expectCostLabel: "€20.60 / kg",
    expectCostHasUsableSuffix: false,
    expectCollapsed: false,
  },
  {
    id: "E-manjericao",
    product: "Manjericão",
    designCase: "E",
    meta: {
      name: "Manjericão",
      quantity: 5,
      unit: "mo",
      unit_price: 2.06,
      line_total: 10.28,
    },
    expectQuantityLabel: /500\s*g\s+usable/i,
    expectCostLabel: "€20.60 / kg",
    expectCostHasUsableSuffix: false,
    expectCollapsed: false,
  },
  {
    id: "angus-case",
    product: "Angus burger case",
    meta: {
      name: "Burger Angus 180gr (Caixa 40 un)",
      quantity: 2,
      unit: "cx",
      unit_price: 46,
      line_total: 92,
    },
    expectQuantityLabel: /7\.2\s*kg\s+usable/i,
    expectCostLabel: "€6.39 / kg",
    expectCostHasUsableSuffix: false,
    expectCollapsed: false,
  },
  {
    id: "batata-name-2kg",
    product: "BATATA PALHA 2KG",
    meta: { name: "BATATA PALHA 2KG", quantity: 1, unit: "kg", unit_price: 14.5 },
    expectQuantityLabel: /2\s*kg\s+usable/i,
    expectCostLabel: "€14.50 / kg",
    expectCostHasUsableSuffix: false,
    expectCollapsed: false,
  },
];

function replayRow(row: MatrixRow) {
  const presentation = resolveInvoiceLinePricingPresentation(row.meta);
  const collapsed = !presentation.card.normalizedLine && !presentation.card.usableCostLine;

  const quantityPass = row.expectQuantityLabel
    ? row.expectQuantityLabel.test(presentation.card.normalizedLine ?? "")
    : presentation.card.normalizedLine == null;

  const costPass = row.expectCostLabel
    ? presentation.card.usableCostLine === row.expectCostLabel
    : presentation.card.usableCostLine == null;

  const costSuffixPass = row.expectCostHasUsableSuffix
    ? /\busable\b/i.test(presentation.card.usableCostLine ?? "")
    : !/\busable\b/i.test(presentation.card.usableCostLine ?? "");

  const collapsePass = collapsed === row.expectCollapsed;

  const beforeCostLine =
    presentation.effectiveUsableCostLabel && presentation.card.usableCostLine
      ? `${presentation.effectiveUsableCostLabel.replace(/\s*\/\s*\S+$/, "").trim()} / ${presentation.effectiveUsableCostLabel.split(" / ")[1]} usable`
      : presentation.effectiveUsableCostLabel;

  return {
    id: row.id,
    product: row.product,
    designCase: row.designCase ?? null,
    before: {
      normalizedLine: presentation.usableStockLabel,
      usableCostLine: beforeCostLine,
    },
    after: {
      normalizedLine: presentation.card.normalizedLine,
      usableCostLine: presentation.card.usableCostLine,
      effectiveUsableCostLabel: presentation.effectiveUsableCostLabel,
      collapsed,
    },
    pass: quantityPass && costPass && costSuffixPass && collapsePass,
    checks: { quantityPass, costPass, costSuffixPass, collapsePass },
  };
}

const matrix = MATRIX.map(replayRow);
const allPass = matrix.every((r) => r.pass);

let testOutput = "";
try {
  testOutput = execSync("npm test -- src/lib/invoice-purchase-price-semantics.test.ts 2>&1", {
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
  });
} catch (e: unknown) {
  testOutput = e instanceof Error && "stdout" in e ? String((e as { stdout: string }).stdout) : String(e);
}

const testPass = /Tests\s+\d+\s+passed/.test(testOutput) && !/failed/.test(testOutput);

const results = {
  validationLab: VL,
  generatedAt: new Date().toISOString(),
  verdict: allPass && testPass ? "A) Safe to merge" : allPass ? "B) Needs adjustment" : "C) Rejected",
  goal:
    'Remove redundant "usable" suffix from operational cost label only; keep "usable" on quantity label.',
  filesChanged: [
    "src/lib/invoice-purchase-price-semantics.ts",
    "src/lib/invoice-purchase-price-semantics.test.ts",
  ],
  blastRadius: {
    scope: "Invoice Review presentation only (buildNormalizationCard → InvoiceNormalizationCardCell)",
    unchanged: [
      "computeEffectiveUsableCost",
      "effectiveUsableCostLabel computation",
      "recipeOperationalCostFieldsFromInvoiceLine",
      "persistence",
      "recipe costing",
      "ingredient detail modal",
      "ingredient-purchase-memory operationalCostLabel (uses effectiveUsableCostLabel directly)",
    ],
  },
  validationMatrix: matrix,
  matrixSummary: {
    total: matrix.length,
    passed: matrix.filter((r) => r.pass).length,
    failed: matrix.filter((r) => !r.pass).length,
  },
  tests: {
    pass: testPass,
    outputTail: testOutput.split("\n").slice(-8).join("\n"),
  },
};

mkdirSync(OUT, { recursive: true });
writeFileSync(`${OUT}/results.json`, JSON.stringify(results, null, 2));

const report = `# Invoice Review Operational Cost Label Cleanup

**Validation Lab:** \`${VL}\`  
**Generated:** ${results.generatedAt}

---

## Verdict: ${results.verdict}

---

## Goal

Remove redundant "usable" suffix from operational **cost** label only (not quantity label).

| Line | Before | After |
|------|--------|-------|
| Quantity | \`250 g usable\` | \`250 g usable\` *(unchanged)* |
| Cost | \`€8.76 / kg usable\` | \`€8.76 / kg\` |

---

## Root Cause

\`buildNormalizationCard\` in \`invoice-purchase-price-semantics.ts\` rebuilt \`usableCostLine\` from \`effectiveUsableCostLabel\` and appended \` usable\`:

\`\`\`ts
usableCostLine = \`\${costOnly} / \${args.effectiveUnit} usable\`;
\`\`\`

\`effectiveUsableCostLabel\` already carries the correct unit (e.g. \`€8.76 / kg\`) — the suffix was presentation-only redundancy.

---

## Files Changed

| File | Change |
|------|--------|
| \`src/lib/invoice-purchase-price-semantics.ts\` | \`usableCostLine\` now uses \`effectiveUsableCostLabel\` directly (no \` usable\` suffix) |
| \`src/lib/invoice-purchase-price-semantics.test.ts\` | Updated expectations + dedicated cleanup test |

**Not changed:** \`src/routes/invoices.tsx\`, calculations, persistence, recipe costing, ingredient detail modal.

---

## Validation Matrix

| Case | Product | Pass | Quantity label | Cost label |
|------|---------|:----:|----------------|------------|
${matrix
  .map(
    (r) =>
      `| ${r.designCase ?? "—"} | ${r.product} | ${r.pass ? "✓" : "✗"} | ${r.after.normalizedLine ?? "*(collapsed)*"} | ${r.after.usableCostLine ?? "*(collapsed)*"} |`,
  )
  .join("\n")}

**${results.matrixSummary.passed}/${results.matrixSummary.total} matrix rows passed**

---

## Before / After Highlights

| Product | Before (operational) | After |
|---------|---------------------|-------|
| Salada Ibérica | 250 g usable + €8.76/kg **usable** | 250 g usable + €8.76/kg |
| Ovo classe M | 180 un usable + €0.2136/egg **usable** | 180 un usable + €0.2136/egg |
| Tomilho | 100 g usable + €20.60/kg **usable** | 100 g usable + €20.60/kg |
| Manjericão | 500 g usable + €20.60/kg **usable** | 500 g usable + €20.60/kg |
| Pêra Abacate | *(collapsed)* | *(collapsed — unchanged)* |

---

## Blast Radius

- **Scope:** Invoice Review row right column only (\`InvoiceNormalizationCardCell\` via \`card.usableCostLine\`)
- **Unchanged:** \`effectiveUsableCostLabel\` still computed identically; other consumers (API, ingredient memory) unaffected
- **Risk:** Low — one-line presentation formatter change

---

## Tests

\`\`\`
${results.tests.outputTail}
\`\`\`
`;

writeFileSync(`${OUT}/REPORT.md`, report);
console.log(JSON.stringify({ verdict: results.verdict, matrix: results.matrixSummary, testPass }, null, 2));
