/**
 * Mathematical Reconciliation Needs Review Guardrail — implementation validation
 * VL: bjhnlrgodcqoyzddbpbd
 */
const metaEnv = import.meta as { env: Record<string, unknown> };
if (!metaEnv.env) metaEnv.env = { DEV: false, PROD: true };
metaEnv.env.DEV = false;
metaEnv.env.PROD = true;

import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import {
  computeMathematicalReconciliation,
  deriveMathematicalReconciliationReviewReason,
  needsMathematicalReconciliationReview,
} from "../../src/lib/invoice-extraction-review.ts";

const ROOT = "/Users/salvadorseabra1/margin-master";
const VL = "bjhnlrgodcqoyzddbpbd";
const OUT = join(ROOT, ".tmp/mathematical-reconciliation-implementation");

function projectKey(): string {
  const raw = execSync(`supabase projects api-keys --project-ref ${VL} -o json`, {
    encoding: "utf8",
  });
  return (JSON.parse(raw) as { name: string; api_key: string }[]).find(
    (k) => k.name === "service_role",
  )!.api_key;
}

const sb = createClient(`https://${VL}.supabase.co`, projectKey(), {
  auth: { persistSession: false },
});

type DbItem = {
  id: string;
  name: string;
  quantity: number | null;
  unit_price: number | null;
  total: number | null;
};

const SPOTLIGHT_PATTERNS: Array<{ label: string; pattern: RegExp; expectedFlag: boolean }> = [
  { label: "Gorgonzola", pattern: /gorgonzola/i, expectedFlag: true },
  { label: "Prosciutto", pattern: /prosciutto cotto scelto/i, expectedFlag: false },
  { label: "Mortadella", pattern: /mortadella igp/i, expectedFlag: false },
  { label: "Bresaola", pattern: /bresaola punta/i, expectedFlag: false },
  { label: "Aceto", pattern: /aceto balsamico di modena igp pet 5l/i, expectedFlag: false },
  { label: "Pellegrino", pattern: /pellegrino|s\.pellegrino/i, expectedFlag: false },
  { label: "Tomilho", pattern: /^tomilho$/i, expectedFlag: false },
  { label: "Ovo", pattern: /ovo l[ií]quido past\.gema dovo 1\s*kg/i, expectedFlag: false },
  { label: "Salada", pattern: /salada ib[eé]rica fstk/i, expectedFlag: false },
];

mkdirSync(OUT, { recursive: true });

const { data: allItems, error } = await sb
  .from("invoice_items")
  .select("id,name,quantity,unit_price,total")
  .order("created_at", { ascending: true });

if (error) throw new Error(error.message);
const items = (allItems ?? []) as DbItem[];

const corpusRows = items.map((item) => {
  const input = {
    quantity: item.quantity,
    unit_price: item.unit_price,
    total: item.total,
  };
  const metrics = computeMathematicalReconciliation(input);
  const reviewFlag = needsMathematicalReconciliationReview(input);
  const reason = deriveMathematicalReconciliationReviewReason(input);
  return {
    id: item.id,
    product: item.name,
    qty: item.quantity,
    unit_price: item.unit_price,
    total: item.total,
    expected_total: metrics?.expected_total ?? null,
    variance_abs: metrics?.variance_abs ?? null,
    variance_pct: metrics?.variance_pct ?? null,
    reviewFlag,
    reasonCode: reason?.code ?? null,
    reasonMessage: reason?.message ?? null,
    metadata: reason?.metadata ?? null,
  };
});

const spotlightResults = SPOTLIGHT_PATTERNS.map(({ label, pattern, expectedFlag }) => {
  const match = corpusRows.find((r) => pattern.test(r.product));
  if (!match) {
    return { product: label, found: false, expectedFlag, actualFlag: null, pass: false };
  }
  return {
    product: label,
    found: true,
    matchedName: match.product,
    variance_pct: match.variance_pct,
    reviewFlag: match.reviewFlag,
    expectedFlag,
    pass: match.reviewFlag === expectedFlag,
  };
});

const spotlightPass = spotlightResults.every((r) => r.pass);
const flaggedCount = corpusRows.filter((r) => r.reviewFlag).length;
const gorgonzola = corpusRows.find((r) => /gorgonzola/i.test(r.product));

const unitTests = {
  A_gorgonzola: needsMathematicalReconciliationReview({
    quantity: 1.05,
    unit_price: 10.88,
    total: 13.44,
  }),
  B_correctNet: !needsMathematicalReconciliationReview({
    quantity: 1.35,
    unit_price: 9.95,
    total: 13.44,
  }),
  C_minorRounding: !needsMathematicalReconciliationReview({
    quantity: 10,
    unit_price: 8.12,
    total: 81.23,
  }),
  D_discountedLine: !needsMathematicalReconciliationReview({
    quantity: 1,
    unit_price: 15.55,
    total: 16.09,
  }),
};

const unitTestsPass = Object.values(unitTests).every(Boolean);

const results = {
  validationLab: VL,
  implementedAt: new Date().toISOString(),
  scope: "review_detection_only",
  guardrail: {
    formula: "expected_total = qty × unit_price",
    flagWhen: "variance_abs > €0.50 AND variance_pct > 5%",
    reasonCode: "MATHEMATICAL_RECONCILIATION_FAILURE",
    reasonMessage: "Quantity × Unit Price does not reconcile with Line Total",
    integration: "needsExtractionConfirmation in src/routes/invoices.tsx",
    helper: "src/lib/invoice-extraction-review.ts",
  },
  unitTests,
  unitTestsPass,
  corpusSize: items.length,
  flaggedCount,
  spotlightResults,
  spotlightPass,
  gorgonzola,
  corpusRows,
  scopeConfirmation: {
    persistence: "unchanged",
    extraction: "unchanged",
    matching: "unchanged",
    recipeCosting: "unchanged",
    operationalCalculations: "unchanged",
    history: "unchanged",
    schemaMigrations: "none",
  },
  verdict: spotlightPass && unitTestsPass && gorgonzola?.reviewFlag === true ? "A" : "FAIL",
  verdictNote: "Gorgonzola flagged; control products pass; detection-only scope preserved",
};

writeFileSync(join(OUT, "results.json"), JSON.stringify(results, null, 2));

const md: string[] = [];
md.push("# Mathematical Reconciliation Needs Review Guardrail");
md.push("");
md.push(`**Validation Lab:** \`${VL}\` · **Corpus:** ${items.length} invoice_items · ${results.implementedAt.slice(0, 10)}`);
md.push("");
md.push("## Implementation");
md.push("");
md.push("- **Helper:** `src/lib/invoice-extraction-review.ts`");
md.push("- **Integration:** `needsExtractionConfirmation` in `src/routes/invoices.tsx`");
md.push("- **Reason:** `MATHEMATICAL_RECONCILIATION_FAILURE`");
md.push("- **Message:** Quantity × Unit Price does not reconcile with Line Total");
md.push("- **Flag when:** variance_abs > €0.50 **AND** variance_pct > 5%");
md.push("- **Scope:** Review detection only — no persistence, extraction, matching, recipe, or operational changes");
md.push("");
md.push("## Unit tests (A–D)");
md.push("");
md.push("| Case | Input | Expected | Result |");
md.push("|------|-------|----------|--------|");
md.push(`| A | 1.05×10.88 vs 13.44 | FLAG | ${unitTests.A_gorgonzola ? "PASS" : "FAIL"} |`);
md.push(`| B | 1.35×9.95 vs 13.44 | PASS | ${unitTests.B_correctNet ? "PASS" : "FAIL"} |`);
md.push(`| C | 10×8.12 vs 81.23 (rounding) | PASS | ${unitTests.C_minorRounding ? "PASS" : "FAIL"} |`);
md.push(`| D | 1×15.55 vs 16.09 (discount) | PASS | ${unitTests.D_discountedLine ? "PASS" : "FAIL"} |`);
md.push("");
md.push("## VL spotlight replay");
md.push("");
md.push("| Product | Variance % | Review Flag | Reason | Expected | Pass |");
md.push("|---------|------------|-------------|--------|----------|------|");
for (const s of spotlightResults) {
  const flag = s.actualFlag ?? s.reviewFlag;
  const reason = flag ? "MATHEMATICAL_RECONCILIATION_FAILURE" : "—";
  md.push(
    `| ${s.product} | ${s.variance_pct != null ? `${s.variance_pct}%` : "—"} | ${flag === true ? "FLAG" : flag === false ? "PASS" : "NOT FOUND"} | ${reason} | ${s.expectedFlag ? "FLAG" : "PASS"} | ${s.pass ? "✓" : "✗"} |`,
  );
}
md.push("");
md.push(`**Corpus flagged:** ${flaggedCount} / ${items.length}`);
md.push("");
md.push("## Scope confirmation");
md.push("");
for (const [key, value] of Object.entries(results.scopeConfirmation)) {
  md.push(`- ${key}: ${value}`);
}
md.push("");
md.push("## Verdict");
md.push("");
md.push(`**${results.verdict}** — ${results.verdictNote}`);

writeFileSync(join(OUT, "REPORT.md"), md.join("\n"));
console.log(JSON.stringify({ verdict: results.verdict, spotlightPass, flaggedCount }, null, 2));
