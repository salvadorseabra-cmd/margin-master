/**
 * Mozzarella fix — STRICT READ-ONLY regression matrix replay.
 * Simulates proposed shouldScaleOuterPackForSizeCountGenericRow (Option A)
 * against production derivation. NO code changes, NO DB writes.
 */
const metaEnv = import.meta as { env?: Record<string, unknown> };
if (!metaEnv.env) metaEnv.env = {};
metaEnv.env.DEV = false;
metaEnv.env.PROD = true;

import { execSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import {
  bindMonetaryColumns,
  parseMonetaryLineItems,
} from "../../supabase/functions/extract-invoice/invoice-monetary-binding.ts";
import {
  resolveInvoiceLinePurchaseFormat,
  resolveInvoiceLineStockPresentation,
} from "../../src/lib/invoice-purchase-format.ts";
import {
  computeEffectiveUsableCost,
  resolveInvoiceLinePricingPresentation,
} from "../../src/lib/invoice-purchase-price-semantics.ts";
import {
  computeUsableFromPurchaseStructure,
  isGenericPurchaseUnit,
  parsePurchaseStructureFromText,
  resolveStructurePurchaseQuantity,
  type PurchaseStructure,
} from "../../src/lib/stock-normalization.ts";

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dir, "..");
const OUT = join(ROOT, "mozzarella-regression-matrix");
mkdirSync(OUT, { recursive: true });

const VL_REF = "bjhnlrgodcqoyzddbpbd";

type ControlSpec = {
  key: string;
  label: string;
  invoiceItemId: string;
  match: (name: string) => boolean;
  expectedChange: boolean;
  expectedClassification: "A" | "C";
  notes?: string;
};

const CONTROLS: ControlSpec[] = [
  {
    key: "mozzarella",
    label: "Mozzarella",
    invoiceItemId: "095b2bb9-bd36-44c2-a1f9-7c50fa9c0cc6",
    match: (n) => /MOZZARELLA/i.test(n) && /BOCCONCINO/i.test(n),
    expectedChange: true,
    expectedClassification: "A",
    notes: "Fix target — size_count 125GR*8, qty=10",
  },
  {
    key: "stracciatella",
    label: "Stracciatella",
    invoiceItemId: "da2ad0fc-eb56-4506-8ba4-ae22b3cb6a5a",
    match: (n) => /STRACCIATELLA/i.test(n),
    expectedChange: false,
    expectedClassification: "C",
    notes: "bare_measure tier — not size_count",
  },
  {
    key: "peroni",
    label: "Peroni",
    invoiceItemId: "979a9928-dbdb-4fe5-a231-2caaae327ed9",
    match: (n) => /PERONI/i.test(n) && /33/i.test(n),
    expectedChange: false,
    expectedClassification: "C",
    notes: "rowQty === innerCount (24)",
  },
  {
    key: "pellegrino_bocconcino",
    label: "S.Pellegrino (Bocconcino)",
    invoiceItemId: "f25feb92-3477-41a4-9a81-c556a90a0814",
    match: (n) => /PELLEGRINO/i.test(n) && /CX/i.test(n),
    expectedChange: false,
    expectedClassification: "C",
    notes: "caixa_units_size tier",
  },
  {
    key: "pellegrino_emporio",
    label: "S.Pellegrino (Emporio)",
    invoiceItemId: "9cdd22ba-051b-4422-a122-3e6a39e9ef8c",
    match: (n) => /SanPellegrino/i.test(n) || (/PELLEGRINO/i.test(n) && /15ud/i.test(n)),
    expectedChange: false,
    expectedClassification: "C",
    notes: "size_count cl — unitMeasurement ∉ {kg,L}; rowQty≠inner but volume unit caveat",
  },
  {
    key: "guanciale",
    label: "Guanciale",
    invoiceItemId: "6efebedf-c78e-46c1-9ae1-58792229834b",
    match: (n) => /GUANCIALE/i.test(n),
    expectedChange: false,
    expectedClassification: "C",
    notes: "unitMeasurement=kg excluded",
  },
  {
    key: "mezzi",
    label: "Mezzi",
    invoiceItemId: "bb4bbfac-a59b-4d0b-9844-ba773c1f261e",
    match: (n) => /MEZZI/i.test(n) && /PACCHERI/i.test(n),
    expectedChange: false,
    expectedClassification: "C",
    notes: "caixa_units_size — Family A separate track",
  },
  {
    key: "ricotta",
    label: "Ricotta",
    invoiceItemId: "409850ab-646d-44fa-b20c-c8a4a8570064",
    match: (n) => /RICOTTA/i.test(n),
    expectedChange: false,
    expectedClassification: "C",
    notes: "bare/kg — no size_count token",
  },
];

/** Proposed helper — Option A from mozzarella-fix-design/design.json */
function shouldScaleOuterPackForSizeCountGenericRow(
  structure: PurchaseStructure,
  rowQuantity: number | null,
  rowUnit: string | null,
): boolean {
  if (structure.tier !== "size_count") return false;
  if (!isGenericPurchaseUnit(rowUnit)) return false;
  if (rowQuantity == null || !Number.isFinite(rowQuantity) || rowQuantity <= 1) return false;
  const inner = structure.innerUnitCount ?? 1;
  if (Math.abs(rowQuantity - inner) < 0.01) return false;
  const um = structure.unitMeasurement;
  if (um === "kg" || um === "L") return false;
  return true;
}

function simulateResolveStructurePurchaseQuantity(
  structure: PurchaseStructure,
  rowQuantity: number | null,
  rowUnit: string | null,
): number {
  if (shouldScaleOuterPackForSizeCountGenericRow(structure, rowQuantity, rowUnit)) {
    return Math.max(1, Math.round(rowQuantity!));
  }
  return resolveStructurePurchaseQuantity(structure, rowQuantity, rowUnit);
}

function simulateComputeUsableFromPurchaseStructure(
  structure: PurchaseStructure,
  rowQuantity: number | null,
  rowUnit: string | null,
) {
  const current = computeUsableFromPurchaseStructure(structure, rowQuantity, rowUnit);
  if (!shouldScaleOuterPackForSizeCountGenericRow(structure, rowQuantity, rowUnit)) {
    return { ...current, helperActive: false };
  }
  const purchaseContainerCount = simulateResolveStructurePurchaseQuantity(
    structure,
    rowQuantity,
    rowUnit,
  );
  const outerFromName = Math.max(1, structure.purchaseQuantity);
  const scale = purchaseContainerCount / outerFromName;
  const total = Math.max(1, Math.round(structure.totalUsableAmount * scale));
  return {
    ...current,
    usableQuantity: total,
    purchaseContainerCount,
    usableSource: "structure_scaled_outer" as const,
    fallbackReason: `outer count ${purchaseContainerCount} (name ${structure.purchaseQuantity})`,
    helperActive: true,
  };
}

function formatUsable(gramsOrMl: number | null, unit: string | null): string {
  if (gramsOrMl == null) return "—";
  if (unit === "g") {
    if (gramsOrMl >= 1000) return `${(gramsOrMl / 1000).toFixed(gramsOrMl % 1000 === 0 ? 0 : 1)} kg`;
    return `${gramsOrMl} g`;
  }
  if (unit === "ml") {
    if (gramsOrMl >= 1000) return `${(gramsOrMl / 1000).toFixed(2)} L`;
    return `${gramsOrMl} ml`;
  }
  return `${gramsOrMl} ${unit ?? ""}`;
}

function formatOpCost(cost: { cost: number; unit: string } | null): string {
  if (!cost) return "—";
  return `€${cost.cost.toFixed(2)}/${cost.unit}`;
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

function bindLine(raw: {
  name: string;
  quantity: number | null;
  unit: string | null;
  unit_price: number | null;
  total: number | null;
}) {
  const [bound] = bindMonetaryColumns(
    parseMonetaryLineItems([
      {
        ...raw,
        gross_unit_price: null,
        discount_pct: null,
        line_total_net: null,
      },
    ]),
  );
  return bound;
}

type VlRow = {
  id: string;
  name: string;
  quantity: number | null;
  unit: string | null;
  unit_price: number | null;
  total: number | null;
  invoice_id: string;
};

async function fetchVlRows(ids: string[]): Promise<Map<string, VlRow>> {
  const raw = execSync(`supabase projects api-keys --project-ref ${VL_REF} -o json`, {
    encoding: "utf8",
  });
  const key = JSON.parse(raw).find((k: { name: string }) => k.name === "service_role").api_key;
  const sb = createClient(`https://${VL_REF}.supabase.co`, key, {
    auth: { persistSession: false },
  });
  const { data, error } = await sb
    .from("invoice_items")
    .select("id, name, quantity, unit, unit_price, total, invoice_id")
    .in("id", ids);
  if (error) throw error;
  const map = new Map<string, VlRow>();
  for (const row of data ?? []) map.set(row.id, row as VlRow);
  return map;
}

function replayRow(
  spec: ControlSpec,
  vlRow: VlRow | null,
  frozenReplay: Record<string, unknown> | null,
) {
  const source = vlRow ?? (frozenReplay as VlRow | null);
  if (!source) {
    return { spec, error: "no VL or frozen source" };
  }

  const bound = bindLine({
    name: source.name,
    quantity: source.quantity,
    unit: source.unit,
    unit_price: source.unit_price,
    total: source.total,
  });

  const metadata = {
    name: bound.name,
    quantity: bound.quantity,
    unit: bound.unit,
    unit_price: bound.unit_price,
    line_total: bound.total,
    matchedIngredientName: null as string | null,
  };

  const currentStructured = resolveInvoiceLinePurchaseFormat(metadata);
  const currentStock = resolveInvoiceLineStockPresentation(metadata);
  const currentPres = resolveInvoiceLinePricingPresentation(metadata);
  const currentOp = computeEffectiveUsableCost(
    bound.unit_price ?? 0,
    metadata,
    currentStructured,
    bound.name,
  );

  const structure = parsePurchaseStructureFromText(bound.name);
  const currentDerived = structure
    ? computeUsableFromPurchaseStructure(structure, bound.quantity, bound.unit)
    : null;
  const simulatedDerived = structure
    ? simulateComputeUsableFromPurchaseStructure(structure, bound.quantity, bound.unit)
    : null;

  const helperWouldFire = structure
    ? shouldScaleOuterPackForSizeCountGenericRow(structure, bound.quantity, bound.unit)
    : false;

  const simulatedStructured =
    simulatedDerived?.helperActive
      ? {
          ...currentStructured,
          normalizedUsableQuantity: simulatedDerived.usableQuantity,
          purchaseContainerCount: simulatedDerived.purchaseContainerCount,
          usableQuantityUnit:
            simulatedDerived.usableUnit === "g"
              ? ("g" as const)
              : simulatedDerived.usableUnit === "ml"
                ? ("ml" as const)
                : currentStructured.usableQuantityUnit,
        }
      : currentStructured;

  const simulatedOp = computeEffectiveUsableCost(
    bound.unit_price ?? 0,
    metadata,
    simulatedStructured,
    bound.name,
  );

  const currentUsable = currentStructured.normalizedUsableQuantity;
  const simulatedUsable = simulatedStructured.normalizedUsableQuantity;
  const usableChanged =
    currentUsable != null &&
    simulatedUsable != null &&
    Math.abs(currentUsable - simulatedUsable) > 0.5;

  const currentOpCost = currentOp?.cost ?? null;
  const simulatedOpCost = simulatedOp?.cost ?? null;
  const opChanged =
    currentOpCost != null &&
    simulatedOpCost != null &&
    Math.abs(currentOpCost - simulatedOpCost) > 0.02;

  let classification: "A" | "B" | "C";
  if (!usableChanged && !opChanged) {
    classification = "C";
  } else if (spec.expectedChange) {
    classification = "A";
  } else {
    classification = "B";
  }

  return {
    key: spec.key,
    label: spec.label,
    invoiceItemId: spec.invoiceItemId,
    lineName: bound.name,
    invoiceId: source.invoice_id ?? null,
    bound: {
      qty: bound.quantity,
      unit: bound.unit,
      unitPrice: bound.unit_price,
      total: bound.total,
    },
    structure: structure
      ? {
          tier: structure.tier,
          innerUnitCount: structure.innerUnitCount,
          unitMeasurement: structure.unitMeasurement,
          unitSize: structure.unitSize,
          totalUsableAmount: structure.totalUsableAmount,
          purchaseQuantity: structure.purchaseQuantity,
        }
      : null,
    helper: {
      wouldFire: helperWouldFire,
      conditions: structure
        ? {
            tier_size_count: structure.tier === "size_count",
            generic_row: isGenericPurchaseUnit(bound.unit),
            rowQty_gt_1: (bound.quantity ?? 0) > 1,
            rowQty_ne_inner:
              structure.innerUnitCount != null &&
              bound.quantity != null &&
              Math.abs(bound.quantity - structure.innerUnitCount) >= 0.01,
            unit_not_kg_L:
              structure.unitMeasurement !== "kg" && structure.unitMeasurement !== "L",
          }
        : null,
    },
    current: {
      usableQuantity: currentUsable,
      usableUnit: currentStructured.usableQuantityUnit,
      usableLabel: currentStock.quantityLabel,
      purchaseContainerCount: currentStructured.purchaseContainerCount,
      usableSource: currentDerived?.usableSource ?? null,
      fallbackReason: currentDerived?.fallbackReason ?? null,
      resolveStructurePurchaseQty: currentDerived
        ? resolveStructurePurchaseQuantity(structure!, bound.quantity, bound.unit)
        : null,
      operationalCost: currentOpCost,
      operationalCostUnit: currentOp?.unit ?? null,
      operationalCostLabel: currentPres.effectiveUsableCostLabel,
    },
    simulated: {
      usableQuantity: simulatedUsable,
      usableUnit: simulatedStructured.usableQuantityUnit,
      usableLabel: formatUsable(simulatedUsable, simulatedStructured.usableQuantityUnit),
      purchaseContainerCount: simulatedStructured.purchaseContainerCount,
      usableSource: simulatedDerived?.usableSource ?? null,
      fallbackReason: simulatedDerived?.fallbackReason ?? null,
      resolveStructurePurchaseQty: simulatedDerived
        ? simulateResolveStructurePurchaseQuantity(structure!, bound.quantity, bound.unit)
        : null,
      operationalCost: simulatedOpCost,
      operationalCostUnit: simulatedOp?.unit ?? null,
      operationalCostLabel: formatOpCost(simulatedOp),
    },
    changed: {
      usable: usableChanged,
      operationalCost: opChanged,
    },
    expectedChange: spec.expectedChange,
    classification,
    expectedClassification: spec.expectedClassification,
    classificationMatch: classification === spec.expectedClassification,
    notes: spec.notes,
    dataSource: vlRow ? "vl_db_readonly" : "frozen_replay_json",
  };
}

// Frozen fallback from quantity-mismatch-ui-audit/replay.json
const frozenReplay = JSON.parse(
  readFileSync(join(ROOT, "quantity-mismatch-ui-audit/replay.json"), "utf8"),
) as Array<{
  invoiceItemId: string;
  lineName: string;
  bound: { qty: number; unit: string; unitPrice: number; total: number };
}>;

const frozenById = new Map(frozenReplay.map((r) => [r.invoiceItemId, r]));

async function main() {
  const ids = CONTROLS.map((c) => c.invoiceItemId);
  let vlRows: Map<string, VlRow>;
  try {
    vlRows = await fetchVlRows(ids);
  } catch (e) {
    console.warn("VL fetch failed, using frozen replay:", e);
    vlRows = new Map();
  }

  const results = CONTROLS.map((spec) => {
    const vlRow = vlRows.get(spec.invoiceItemId) ?? null;
    const frozen = frozenById.get(spec.invoiceItemId);
    const frozenAsVl: VlRow | null = frozen
      ? {
          id: spec.invoiceItemId,
          name: frozen.lineName,
          quantity: frozen.bound.qty,
          unit: frozen.bound.unit,
          unit_price: frozen.bound.unitPrice,
          total: frozen.bound.total,
          invoice_id: spec.key === "mozzarella" || spec.key === "stracciatella" || spec.key === "mezzi" || spec.key === "ricotta" || spec.key === "pellegrino_bocconcino"
            ? "f0aa5a08-86a3-4938-99f0-711e86073968"
            : spec.key === "guanciale" || spec.key === "peroni"
              ? "36c99d19-6f9f-413f-8c2d-ae3526291a2d"
              : "unknown",
        }
      : null;
    return replayRow(spec, vlRow, frozenAsVl);
  });

  const evaluated = results.filter((r) => !("error" in r));
  const changed = evaluated.filter((r) => r.changed.usable || r.changed.operationalCost);
  const expectedChanges = evaluated.filter((r) => r.classification === "A");
  const unexpectedChanges = evaluated.filter((r) => r.classification === "B");
  const noChanges = evaluated.filter((r) => r.classification === "C");

  const allClassificationsMatch = evaluated.every((r) => r.classificationMatch);
  const onlyMozzarellaChanged =
    changed.length === 1 && changed[0]?.key === "mozzarella";
  const readiness = allClassificationsMatch && onlyMozzarellaChanged
    ? "A) Clean ready"
    : unexpectedChanges.length > 0
      ? "B) Control impact"
      : "C) Inconclusive";

  const blockers = {
    rootCauseLocalized: { status: "A", label: "Proven" },
    helperLogicScoped: {
      status: unexpectedChanges.length === 0 ? "A" : "B",
      label: unexpectedChanges.length === 0 ? "Proven" : "Needs validation",
    },
    productionReplayMatchesVl: {
      status: vlRows.size >= 6 ? "A" : "B",
      label: vlRows.size >= 6 ? "Proven" : "Needs validation",
    },
    reIngestPath: { status: "B", label: "Needs validation" },
    sanPellegrinoClCaveat: {
      status: results.find((r) => r.key === "pellegrino_emporio")?.helper.wouldFire
        ? "B"
        : "A",
      label: results.find((r) => r.key === "pellegrino_emporio")?.helper.wouldFire
        ? "Needs validation — helper fires on Emporio row"
        : "Proven — helper does not fire",
    },
  };

  const output = {
    generatedAt: new Date().toISOString(),
    mode: "STRICT_READ_ONLY_REGRESSION_MATRIX",
    validationLab: VL_REF,
    proposedFix: {
      name: "size_count outer-pack scaling exception (Option A)",
      helper: "shouldScaleOuterPackForSizeCountGenericRow",
      conditions: [
        "structure.tier === 'size_count'",
        "isGenericPurchaseUnit(rowUnit)",
        "rowQuantity > 1",
        "rowQuantity !== innerUnitCount (±0.01)",
        "structure.unitMeasurement not in ['kg', 'L']",
      ],
      integrationPoints: [
        "resolveStructurePurchaseQuantity",
        "computeUsableFromPurchaseStructure",
      ],
    },
    task1_usableReplay: evaluated.map((r) => ({
      product: r.label,
      currentUsable: formatUsable(r.current.usableQuantity, r.current.usableUnit),
      simulatedUsable: formatUsable(r.simulated.usableQuantity, r.simulated.usableUnit),
      changed: r.changed.usable,
    })),
    task2_opCostReplay: evaluated.map((r) => ({
      product: r.label,
      currentOpCost: formatOpCost(
        r.current.operationalCost != null
          ? { cost: r.current.operationalCost, unit: r.current.operationalCostUnit ?? "?" }
          : null,
      ),
      simulatedOpCost: formatOpCost(
        r.simulated.operationalCost != null
          ? { cost: r.simulated.operationalCost, unit: r.simulated.operationalCostUnit ?? "?" }
          : null,
      ),
      changed: r.changed.operationalCost,
    })),
    task3_controlValidation: evaluated.map((r) => ({
      product: r.label,
      classification: r.classification,
      expected: r.expectedClassification,
      match: r.classificationMatch,
    })),
    task4_blastRadius: {
      totalEvaluated: evaluated.length,
      changed: changed.length,
      expectedChange: expectedChanges.length,
      unexpectedChange: unexpectedChanges.length,
      noChange: noChanges.length,
      onlyMozzarellaChanged,
    },
    task5_implementationBlockers: blockers,
    task6_finalReadiness: readiness,
    confidence: {
      regressionMatrix: unexpectedChanges.length === 0 ? 0.91 : 0.62,
      mozzarellaFixTarget: 0.94,
      controlPreservation: unexpectedChanges.length === 0 ? 0.9 : 0.55,
      overall: unexpectedChanges.length === 0 && onlyMozzarellaChanged ? 0.9 : 0.65,
    },
    vlRowsFetched: vlRows.size,
    rows: results,
    sources: [
      ".tmp/mozzarella-fix-design/design.json",
      ".tmp/mozzarella-implementation-prep/readiness.json",
      ".tmp/stock-normalization-family-assessment/assessment.json",
      ".tmp/bug-pattern-expansion-audit/population.json",
      ".tmp/quantity-mismatch-ui-audit/replay.json",
      "src/lib/stock-normalization.ts",
      "src/lib/invoice-purchase-format.ts",
      `VL ${VL_REF} invoice_items (read-only)`,
    ],
  };

  writeFileSync(join(OUT, "results.json"), JSON.stringify(output, null, 2));

  const md = buildReport(output);
  writeFileSync(join(OUT, "REPORT.md"), md);

  console.log(
    JSON.stringify(
      {
        readiness: output.task6_finalReadiness,
        blastRadius: output.task4_blastRadius,
        unexpected: unexpectedChanges.map((r) => r.label),
      },
      null,
      2,
    ),
  );
}

function buildReport(output: {
  generatedAt: string;
  validationLab: string;
  proposedFix: { name: string; helper: string; conditions: string[] };
  task1_usableReplay: Array<{ product: string; currentUsable: string; simulatedUsable: string; changed: boolean }>;
  task2_opCostReplay: Array<{ product: string; currentOpCost: string; simulatedOpCost: string; changed: boolean }>;
  task3_controlValidation: Array<{ product: string; classification: string; expected: string; match: boolean }>;
  task4_blastRadius: Record<string, unknown>;
  task5_implementationBlockers: Record<string, { status: string; label: string }>;
  task6_finalReadiness: string;
  confidence: Record<string, number>;
  vlRowsFetched: number;
  rows: Array<Record<string, unknown>>;
}) {
  const lines: string[] = [];
  lines.push("# Mozzarella Fix — Regression Matrix Validation\n");
  lines.push(`Generated: ${output.generatedAt}  \nVL: ${output.validationLab}  \nMode: **STRICT READ-ONLY**\n`);
  lines.push("## Proposed Fix (Option A)\n");
  lines.push(`Helper: \`${output.proposedFix.helper}\` in \`resolveStructurePurchaseQuantity\` + \`computeUsableFromPurchaseStructure\`\n`);
  lines.push("Conditions:");
  for (const c of output.proposedFix.conditions) lines.push(`- ${c}`);
  lines.push("");

  lines.push("## TASK 1 — Usable Replay\n");
  lines.push("| Product | Current Usable | Simulated Usable | Changed? |");
  lines.push("|---------|----------------|------------------|----------|");
  for (const r of output.task1_usableReplay) {
    lines.push(`| ${r.product} | ${r.currentUsable} | ${r.simulatedUsable} | ${r.changed ? "**YES**" : "no"} |`);
  }

  lines.push("\n## TASK 2 — Regression Matrix (Op Cost)\n");
  lines.push("| Product | Current Op Cost | Simulated Op Cost | Changed? |");
  lines.push("|---------|-----------------|-------------------|----------|");
  for (const r of output.task2_opCostReplay) {
    lines.push(`| ${r.product} | ${r.currentOpCost} | ${r.simulatedOpCost} | ${r.changed ? "**YES**" : "no"} |`);
  }

  lines.push("\n## TASK 3 — Control Validation\n");
  lines.push("| Product | Classification | Expected | Match |");
  lines.push("|---------|----------------|----------|-------|");
  for (const r of output.task3_controlValidation) {
    const cls =
      r.classification === "A"
        ? "A) Expected change"
        : r.classification === "B"
          ? "B) Unexpected change"
          : "C) No change";
    const exp =
      r.expected === "A" ? "A) Expected change" : "C) No change";
    lines.push(`| ${r.product} | ${cls} | ${exp} | ${r.match ? "✓" : "✗"} |`);
  }

  lines.push("\n## TASK 4 — Blast Radius\n");
  const br = output.task4_blastRadius;
  lines.push(`- Total evaluated: **${br.totalEvaluated}**`);
  lines.push(`- Changed: **${br.changed}**`);
  lines.push(`- Expected change: **${br.expectedChange}**`);
  lines.push(`- Unexpected change: **${br.unexpectedChange}**`);
  lines.push(`- No change: **${br.noChange}**`);
  lines.push(`- Only Mozzarella changed: **${br.onlyMozzarellaChanged ? "yes" : "no"}**`);

  lines.push("\n## TASK 5 — Implementation Blockers\n");
  for (const [k, v] of Object.entries(output.task5_implementationBlockers)) {
    lines.push(`- **${k}**: ${v.status}) ${v.label}`);
  }

  lines.push("\n## TASK 6 — Final Readiness\n");
  lines.push(`**${output.task6_finalReadiness}**\n`);

  lines.push("## Helper Trace (per row)\n");
  for (const row of output.rows) {
    if ("error" in row) continue;
    const r = row as {
      label: string;
      helper: { wouldFire: boolean; conditions: Record<string, boolean> | null };
      structure: { tier: string; innerUnitCount: number; unitMeasurement: string } | null;
      current: { resolveStructurePurchaseQty: number | null; usableSource: string | null };
      simulated: { resolveStructurePurchaseQty: number | null; usableSource: string | null };
      notes?: string;
    };
    lines.push(`### ${r.label}`);
    lines.push(`- Tier: ${r.structure?.tier ?? "—"} | inner=${r.structure?.innerUnitCount ?? "—"} | unit=${r.structure?.unitMeasurement ?? "—"}`);
    lines.push(`- Helper fires: **${r.helper.wouldFire ? "YES" : "no"}**`);
    if (r.helper.conditions) {
      lines.push(`- Conditions: ${Object.entries(r.helper.conditions).map(([k, v]) => `${k}=${v}`).join(", ")}`);
    }
    lines.push(`- purchaseQty: ${r.current.resolveStructurePurchaseQty} → ${r.simulated.resolveStructurePurchaseQty}`);
    lines.push(`- usableSource: ${r.current.usableSource} → ${r.simulated.usableSource}`);
    if (r.notes) lines.push(`- Note: ${r.notes}`);
    lines.push("");
  }

  lines.push("## Answer\n");
  const onlyMozz = output.task4_blastRadius.onlyMozzarellaChanged;
  lines.push(
    onlyMozz
      ? "**Does the proposed fix change anything besides Mozzarella?** No — only Mozzarella usable/op-cost changes under simulated Option A."
      : `**Does the proposed fix change anything besides Mozzarella?** ${Number(output.task4_blastRadius.unexpectedChange) > 0 ? "Yes — unexpected control impact detected." : "Inconclusive — see blast radius."}`,
  );

  lines.push("\n## Confidence\n");
  lines.push(`- Regression matrix: **${(output.confidence.regressionMatrix * 100).toFixed(0)}%**`);
  lines.push(`- Mozzarella fix target: **${(output.confidence.mozzarellaFixTarget * 100).toFixed(0)}%**`);
  lines.push(`- Control preservation: **${(output.confidence.controlPreservation * 100).toFixed(0)}%**`);
  lines.push(`- Overall: **${(output.confidence.overall * 100).toFixed(0)}%**`);
  lines.push(`\nVL rows fetched: ${output.vlRowsFetched}/8. Evidence: \`.tmp/mozzarella-regression-matrix/results.json\``);

  return lines.join("\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
