/**
 * Validation Findings Acceptance Test — read-only replay against VL Supabase.
 */
import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { buildMatchExplanation } from "../../src/lib/ingredient-match-explanation.ts";
import { resolveInvoiceTableRowIngredientMatch } from "../../src/lib/invoice-ingredient-row-display.ts";
import { validateInvoiceLine } from "../../src/lib/invoice-validation/engine.ts";
import type { InvoiceLineValidationInput, ValidationFinding } from "../../src/lib/invoice-validation/types.ts";

const VL_REF = "bjhnlrgodcqoyzddbpbd";
const OUT = ".tmp/validation-findings-acceptance-test";

const KNOWN_PROBLEM_ROWS: Array<{
  key: string;
  invoiceItemId: string;
  expectedCodes: string[];
  notes: string;
}> = [
  {
    key: "guanciale",
    invoiceItemId: "6efebedf-c78e-46c1-9ae1-58792229834b",
    expectedCodes: ["OPERATIONAL_NORMALIZATION_INCONSISTENCY"],
    notes: "Pack weight vs billed qty — €6.18/kg vs €10.83/kg",
  },
  {
    key: "gorgonzola",
    invoiceItemId: "fd785aba-bac4-4a1a-804d-fe32ed06ddbe",
    expectedCodes: ["MATHEMATICAL_INCONSISTENCY"],
    notes: "1.30×9.88≠13.44 (4.46% gap) — PDF truth 1.35×9.95",
  },
  {
    key: "gorgonzola_canonical",
    invoiceItemId: "bece238e-fd6d-493c-8555-6921b164f97c",
    expectedCodes: ["MATHEMATICAL_INCONSISTENCY", "MATHEMATICAL_RECONCILIATION_FAILURE"],
    notes: "Stale VL row if still present: 1.05×10.88≠13.44",
  },
  {
    key: "peroni",
    invoiceItemId: "979a9928-dbdb-4fe5-a231-2caaae327ed9",
    expectedCodes: [],
    notes: "Multipack control — should NOT flag operational",
  },
  {
    key: "mozzarella",
    invoiceItemId: "095b2bb9-bd36-44c2-a1f9-7c50fa9c0cc6",
    expectedCodes: [],
    notes: "Multipack control — should NOT flag operational",
  },
];

function projectKey(name: "service_role" | "anon" = "service_role"): string {
  const raw = execSync(`supabase projects api-keys --project-ref ${VL_REF} -o json`, {
    encoding: "utf8",
    timeout: 60_000,
  });
  return (JSON.parse(raw) as { name: string; api_key: string }[]).find((k) => k.name === name)!
    .api_key;
}

type DbItem = {
  id: string;
  invoice_id: string;
  name: string;
  quantity: number | null;
  unit: string | null;
  unit_price: number | null;
  total: number | null;
};

type DbInvoice = {
  id: string;
  supplier_name: string | null;
  invoice_date: string | null;
  total: number | null;
};

type PersistedMatch = {
  invoice_item_id: string;
  ingredient_id: string;
  match_state: string;
  confidence: number | null;
};

function buildConfirmedAliasMap(
  rows: Array<{
    ingredient_id: string;
    alias_name: string;
    normalized_alias: string;
    supplier_name: string | null;
    confirmed_by_user: boolean;
  }>,
) {
  const map: Record<string, { ingredientId: string; aliasName: string }> = {};
  for (const row of rows) {
    if (!row.confirmed_by_user) continue;
    const key = `${row.normalized_alias}::${(row.supplier_name ?? "").toLowerCase().trim()}`;
    map[key] = { ingredientId: row.ingredient_id, aliasName: row.alias_name };
  }
  return map;
}

function findingSummary(f: ValidationFinding) {
  return {
    id: f.id,
    code: f.code,
    severity: f.severity,
    category: f.category,
    title: f.title,
    description: f.description,
    suggestedAction: f.suggestedAction,
    evidence: f.evidence,
  };
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const sb = createClient(`https://${VL_REF}.supabase.co`, projectKey(), {
    auth: { persistSession: false },
  });

  const { data: invoices, error: invErr } = await sb
    .from("invoices")
    .select("id, supplier_name, invoice_date, total")
    .order("created_at", { ascending: true });
  if (invErr) throw invErr;

  const invoiceIds = (invoices ?? []).map((i) => i.id);
  const { data: items, error: itemsErr } = await sb
    .from("invoice_items")
    .select("id, invoice_id, name, quantity, unit, unit_price, total")
    .in("invoice_id", invoiceIds);
  if (itemsErr) throw itemsErr;

  const { data: ingredients } = await sb
    .from("ingredients")
    .select("id, name, current_price, purchase_quantity, purchase_unit, base_unit");
  const { data: aliasRows } = await sb
    .from("ingredient_aliases")
    .select("ingredient_id, alias_name, normalized_alias, supplier_name, confirmed_by_user");
  const { data: persistedMatches } = await sb
    .from("invoice_item_matches")
    .select("invoice_item_id, ingredient_id, match_state, confidence");

  const confirmedAliases = buildConfirmedAliasMap(aliasRows ?? []);
  const matchByItemId = new Map(
    (persistedMatches ?? []).map((m) => [m.invoice_item_id, m as PersistedMatch]),
  );
  const invoiceById = new Map((invoices ?? []).map((i) => [i.id, i as DbInvoice]));
  const ingredientById = new Map((ingredients ?? []).map((i) => [i.id, i]));

  const allFindings: Array<{
    invoiceId: string;
    supplier: string;
    item: DbItem;
    matchDisplayState: string;
    findings: ReturnType<typeof findingSummary>[];
  }> = [];

  for (const item of items ?? []) {
    const inv = invoiceById.get(item.invoice_id);
    const supplier = inv?.supplier_name ?? "Unknown";
    const persisted = matchByItemId.get(item.id);
    const persistedIngredient = persisted
      ? ingredientById.get(persisted.ingredient_id)
      : null;

    const { match, state } = resolveInvoiceTableRowIngredientMatch(
      item.name,
      ingredients ?? [],
      confirmedAliases,
      supplier,
      undefined,
      persisted
        ? {
            persistedMatch: {
              ingredientId: persisted.ingredient_id,
              matchState: persisted.match_state,
              confidence: persisted.confidence,
            },
          }
        : undefined,
    );

    const matchedIngredientForStock =
      match && state.confirmedMatch
        ? (ingredientById.get(match.ingredient.id)?.name ?? match.ingredient.name ?? null)
        : persistedIngredient?.name ?? null;

    const input: InvoiceLineValidationInput = {
      id: item.id,
      name: item.name,
      quantity: item.quantity,
      unit: item.unit,
      unit_price: item.unit_price,
      total: item.total,
      matchedIngredientName: matchedIngredientForStock,
      suggestedIngredientName: state.possibleMatch?.ingredient.name ?? null,
      matchConfidence: state.possibleMatch
        ? buildMatchExplanation(state.possibleMatch, {
            confirmedAliases,
            supplierName: supplier,
          }).confidenceLabel
        : null,
      matchDisplayState: state.displayState,
      ocrMeta: null,
    };

    const findings = validateInvoiceLine(input).map(findingSummary);
    allFindings.push({
      invoiceId: item.invoice_id,
      supplier,
      item: item as DbItem,
      matchDisplayState: state.displayState,
      findings,
    });
  }

  const bySupplier = new Map<string, { items: number; findings: number; codes: Map<string, number> }>();
  for (const row of allFindings) {
    const bucket = bySupplier.get(row.supplier) ?? { items: 0, findings: 0, codes: new Map() };
    bucket.items++;
    bucket.findings += row.findings.length;
    for (const f of row.findings) {
      bucket.codes.set(f.code, (bucket.codes.get(f.code) ?? 0) + 1);
    }
    bySupplier.set(row.supplier, bucket);
  }

  const flatFindings = allFindings.flatMap((r) =>
    r.findings.map((f) => ({
      ...f,
      invoiceId: r.invoiceId,
      supplier: r.supplier,
      itemId: r.item.id,
      itemName: r.item.name,
      matchDisplayState: r.matchDisplayState,
      quantity: r.item.quantity,
      unit: r.item.unit,
      unit_price: r.item.unit_price,
      total: r.item.total,
    })),
  );

  const knownRowResults = KNOWN_PROBLEM_ROWS.map((spec) => {
    const row = allFindings.find((r) => r.item.id === spec.invoiceItemId);
    const codes = row?.findings.map((f) => f.code) ?? [];
    const missing = spec.expectedCodes.filter((c) => !codes.includes(c));
    const unexpected = codes.filter((c) => !spec.expectedCodes.includes(c));
    return {
      ...spec,
      found: !!row,
      actualCodes: codes,
      missingExpected: missing,
      unexpectedCodes: unexpected,
      pass: row != null && missing.length === 0 && unexpected.length === 0,
      itemName: row?.item.name ?? null,
      findings: row?.findings ?? [],
    };
  });

  const falseNegativeCandidates: Array<Record<string, unknown>> = [];

  for (const spec of KNOWN_PROBLEM_ROWS.filter((s) => s.expectedCodes.length > 0)) {
    const result = knownRowResults.find((r) => r.key === spec.key);
    if (result && result.missingExpected.length > 0) {
      falseNegativeCandidates.push({
        type: "known_problem_missed",
        key: spec.key,
        invoiceItemId: spec.invoiceItemId,
        itemName: result.itemName,
        expected: spec.expectedCodes,
        actual: result.actualCodes,
        why: spec.notes,
      });
    }
  }

  const gorgonzolaPdfTruth = {
    id: "gorgonzola-pdf-truth-synthetic",
    name: "Arrigoni Formaggi - Gorgonzola DOP Dolce Linea Castelfrigo 1/8 - 1,5kg",
    quantity: 1.35,
    unit: "kg",
    unit_price: 9.95,
    total: 13.44,
  };
  const pdfTruthFindings = validateInvoiceLine({
    ...gorgonzolaPdfTruth,
    matchDisplayState: "confirmed",
  });
  if (pdfTruthFindings.length > 0) {
    falseNegativeCandidates.push({
      type: "pdf_truth_no_finding",
      key: "gorgonzola_pdf_truth",
      itemName: gorgonzolaPdfTruth.name,
      expected: [],
      actual: pdfTruthFindings.map((f) => f.code),
      why: "PDF ground truth 1.35×9.95≈13.44 reconciles — extraction error not detectable when only persisted wrong triple is validated",
    });
  }

  const rowsWithNoFindings = allFindings.filter((r) => r.findings.length === 0);
  const mathGapRows = (items ?? []).filter((item) => {
    const q = item.quantity;
    const up = item.unit_price;
    const t = item.total;
    if (q == null || up == null || t == null) return false;
    const expected = q * up;
    const variance = Math.abs(expected - t);
    const pct = (variance / Math.max(t, 0.01)) * 100;
    return variance > 0.01 && variance <= 0.5 && pct <= 5;
  });

  for (const item of mathGapRows) {
    const row = allFindings.find((r) => r.item.id === item.id);
    const hasMathFinding = row?.findings.some((f) =>
      f.code.includes("MATHEMATICAL"),
    );
    if (!hasMathFinding) {
      const q = item.quantity!;
      const up = item.unit_price!;
      const t = item.total!;
      const variance = Math.abs(q * up - t);
      const pct = (variance / Math.max(t, 0.01)) * 100;
      falseNegativeCandidates.push({
        type: "sub_threshold_math_gap",
        invoiceItemId: item.id,
        itemName: item.name,
        supplier: invoiceById.get(item.invoice_id)?.supplier_name,
        quantity: q,
        unit_price: up,
        total: t,
        variance_abs: Math.round(variance * 100) / 100,
        variance_pct: Math.round(pct * 100) / 100,
        why: "Small math gap below MATHEMATICAL_INCONSISTENCY OR thresholds — may be intentional tolerance",
      });
    }
  }

  const duplicateMathRows = allFindings.filter((r) => {
    const mathCodes = r.findings.filter((f) => f.code.includes("MATHEMATICAL"));
    return mathCodes.length > 1;
  });

  const output = {
    generatedAt: new Date().toISOString(),
    validationLab: VL_REF,
    summary: {
      invoiceCount: invoices?.length ?? 0,
      itemCount: items?.length ?? 0,
      totalFindings: flatFindings.length,
      rowsWithFindings: allFindings.filter((r) => r.findings.length > 0).length,
      rowsWithoutFindings: rowsWithNoFindings.length,
      bySupplier: Object.fromEntries(
        [...bySupplier.entries()].map(([supplier, v]) => [
          supplier,
          {
            items: v.items,
            findings: v.findings,
            codes: Object.fromEntries(v.codes),
          },
        ]),
      ),
      codeCounts: Object.fromEntries(
        [...new Map(flatFindings.map((f) => [f.code, 0])).keys()].map((code) => [
          code,
          flatFindings.filter((f) => f.code === code).length,
        ]),
      ),
    },
    knownProblemRows: knownRowResults,
    duplicateMathRows: duplicateMathRows.map((r) => ({
      itemId: r.item.id,
      itemName: r.item.name,
      supplier: r.supplier,
      codes: r.findings.filter((f) => f.code.includes("MATHEMATICAL")).map((f) => f.code),
    })),
    falseNegativeCandidates,
    findings: flatFindings,
    rows: allFindings,
  };

  writeFileSync(`${OUT}/results.json`, JSON.stringify(output, null, 2));
  console.log(
    JSON.stringify(
      {
        items: output.summary.itemCount,
        findings: output.summary.totalFindings,
        codes: output.summary.codeCounts,
        knownPasses: knownRowResults.filter((r) => r.pass).length,
        knownTotal: knownRowResults.length,
        falseNegatives: falseNegativeCandidates.length,
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
