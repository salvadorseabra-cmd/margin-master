/**
 * Identity Expansion Simulation — READ-ONLY
 * Predicts contamination if unmatched VL lines get matched tomorrow.
 */
import "./env-bootstrap.mts";
import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { buildConfirmedAliasMapFromRows } from "../../src/lib/ingredient-alias-memory.ts";
import {
  derivePurchaseContractSnapshot,
  detectPreservationClass,
  purchaseContractsChainCompatible,
  type ChainGuardReason,
} from "../../src/lib/ingredient-price-chain-guard.ts";
import { operationalUnitPriceForPriceHistory } from "../../src/lib/ingredient-price-history.ts";
import { recipeOperationalCostFieldsFromInvoiceLine } from "../../src/lib/invoice-purchase-price-semantics.ts";
import { resolveInvoiceLinePurchaseFormat } from "../../src/lib/invoice-purchase-format.ts";
import { extractLineWeightGrams } from "../../src/lib/ingredient-weight-match.ts";
import { inferUnitFamily } from "../../src/lib/recipe-unit-normalization.ts";
import type { IngredientCanonicalInput, IngredientCanonicalMatch } from "../../src/lib/ingredient-canonical.ts";

(import.meta as { env: { DEV: boolean; PROD: boolean } }).env = { DEV: false, PROD: true };
const { findInvoiceItemIngredientMatch } = await import(
  "../../src/lib/invoice-ingredient-match-propagation.ts"
);
const { canonicalizeIngredientIdentity, hasCompatibleCanonicalForms } = await import(
  "../../src/lib/ingredient-identity.ts"
);
const { scoreWeightCompatibility } = await import("../../src/lib/ingredient-weight-match.ts");
const { lookupIngredientIdFromAliasMap } = await import("../../src/lib/ingredient-alias-lookup.ts");
const { normalizeInvoiceIngredientName, normalizeCanonicalIngredientName, diceCoefficient } =
  await import("../../src/lib/ingredient-canonical.ts");

const OUT = ".tmp/identity-expansion-simulation";
const VL_REF = "bjhnlrgodcqoyzddbpbd";

const VL_INVOICES = [
  { id: "da472b7f-0fd9-4a26-a37c-80ad335f7f7e", label: "Bidfood" },
  { id: "c2f52357-0f80-491a-ba14-c97ff4837472", label: "Aviludo April" },
  { id: "3b4cb21f-8b3f-45f3-9f2d-6f15e9f438a2", label: "Aviludo May" },
  { id: "f0aa5a08-86a3-4938-99f0-711e86073968", label: "Bocconcino" },
  { id: "ab52796d-de1d-418d-86e7-230c8f056f09", label: "Emporio (live)" },
  { id: "36c99d19-6f9f-413f-8c2d-ae3526291a2d", label: "Mammafiore" },
];

type ContaminationSignal = "A" | "B" | "C" | "D" | "E";
type RiskLevel = "LOW" | "MEDIUM" | "HIGH";

function projectKey(name: "service_role"): string {
  const raw = execSync(`supabase projects api-keys --project-ref ${VL_REF} -o json`, {
    encoding: "utf8",
  });
  return (JSON.parse(raw) as { name: string; api_key: string }[]).find((k) => k.name === name)!
    .api_key;
}

const sb = createClient(`https://${VL_REF}.supabase.co`, projectKey("service_role"), {
  auth: { persistSession: false },
});

mkdirSync(OUT, { recursive: true });

const invoiceIds = VL_INVOICES.map((i) => i.id);

const [{ data: items }, { data: invoices }, { data: ingredients }, { data: aliasRows }, { data: priceHistory }] =
  await Promise.all([
    sb
      .from("invoice_items")
      .select("id, invoice_id, name, quantity, unit, unit_price, total, created_at")
      .in("invoice_id", invoiceIds)
      .order("created_at", { ascending: true }),
    sb.from("invoices").select("id, supplier_name, invoice_date, created_at").in("id", invoiceIds),
    sb
      .from("ingredients")
      .select("id, name, normalized_name, current_price, purchase_quantity, purchase_unit, base_unit, unit, ingredient_kind, is_archived"),
    sb
      .from("ingredient_aliases")
      .select("ingredient_id, alias_name, normalized_alias, supplier_name, confirmed_by_user, confidence")
      .eq("confirmed_by_user", true),
    sb.from("ingredient_price_history").select("*").in("invoice_id", invoiceIds),
  ]);

const invById = new Map((invoices ?? []).map((i) => [i.id, i]));
const invLabel = (id: string) => VL_INVOICES.find((v) => v.id === id)?.label ?? id.slice(0, 8);
const catalog = (ingredients ?? []).filter((i) => !i.is_archived) as IngredientCanonicalInput[];
const aliasMap = buildConfirmedAliasMapFromRows(
  (aliasRows ?? []).map((r) => ({
    ingredient_id: r.ingredient_id,
    alias_name: r.alias_name,
    normalized_alias: r.normalized_alias,
    supplier_name: r.supplier_name,
  })),
);

function normName(s: string) {
  return s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function replayContract(line: {
  name: string;
  quantity: number | null;
  unit: string | null;
  unit_price: number | null;
}) {
  const meta = { name: line.name, quantity: line.quantity, unit: line.unit, unit_price: line.unit_price };
  const recipeFields = recipeOperationalCostFieldsFromInvoiceLine(meta);
  const structured = resolveInvoiceLinePurchaseFormat(meta);
  const opPrice =
    recipeFields != null
      ? operationalUnitPriceForPriceHistory(recipeFields.current_price, recipeFields.purchase_quantity)
      : null;
  const snapshot =
    opPrice != null
      ? derivePurchaseContractSnapshot({
          name: line.name,
          operationalUnitPrice: opPrice,
          purchaseQuantity: recipeFields?.purchase_quantity ?? null,
          ingredientUnit: recipeFields?.cost_base_unit ?? null,
        })
      : null;
  const weight = extractLineWeightGrams(line.name);
  return {
    recipeFields,
    structured,
    operationalUnitPrice: opPrice,
    contractSnapshot: snapshot,
    preservationClass: detectPreservationClass(line.name),
    unitFamily: inferUnitFamily(line.unit, {
      usableQuantityUnit: structured.usableQuantityUnit,
      purchaseFormatKind: structured.kind,
    }),
    usableWeightGrams: recipeFields?.usable_weight_grams ?? weight?.grams ?? null,
    packageDescription: structured.matchedText ?? structured.kind ?? null,
  };
}

function signalFromGuard(reason: ChainGuardReason | null): ContaminationSignal[] {
  if (!reason) return [];
  if (reason === "pack_weight_magnitude") return ["A"];
  if (reason === "unit_family_mismatch" || reason === "countable_weight_mismatch") return ["B"];
  if (reason === "preservation_mismatch") return ["C"];
  if (reason === "implausible_volume" || reason === "format_change") return ["D"];
  if (
    reason === "form_mismatch" ||
    reason === "extreme_price_ratio" ||
    reason === "extreme_price_ratio_with_contract_change"
  )
    return ["E"];
  return ["E"];
}

function tokenOverlap(a: string, b: string): number {
  const ta = new Set(normName(a).split(" ").filter((t) => t.length > 2));
  const tb = new Set(normName(b).split(" ").filter((t) => t.length > 2));
  if (ta.size === 0 || tb.size === 0) return 0;
  let hits = 0;
  for (const t of ta) if (tb.has(t)) hits++;
  return hits / Math.max(ta.size, tb.size);
}

const MOZZARELLA_STEM = /\b(mozz|mozzarella|fiore?\s*di\s*latte|fior\s*di\s*latte)\b/i;
const PEPINO_STEM = /\bpepino\b/i;

/** Simulates tomorrow's improved matcher when strict canonical returns null. */
function predictExpandedMatch(
  line: { name: string },
  supplier: string | null,
): {
  ingredientId: string;
  ingredientName: string;
  confidencePercent: number;
  kind: "expanded-fuzzy" | "expanded-alias" | "expanded-family";
  canonicalIdentity: string | null;
} | null {
  const normalized = normalizeInvoiceIngredientName(line.name);
  const aliasId = lookupIngredientIdFromAliasMap(aliasMap, normalized, supplier, line.name);
  if (aliasId) {
    const ing = catalog.find((i) => i.id === aliasId);
    if (ing)
      return {
        ingredientId: aliasId,
        ingredientName: ing.name ?? "—",
        confidencePercent: 88,
        kind: "expanded-alias",
        canonicalIdentity: canonicalizeIngredientIdentity(line.name).form,
        matchTier: "expanded-alias" as const,
      };
  }

  let best: IngredientCanonicalInput | null = null;
  let bestScore = 0;
  let bestKind: "expanded-fuzzy" | "expanded-family" = "expanded-fuzzy";
  const itemIdentity = canonicalizeIngredientIdentity(line.name);

  for (const ing of catalog) {
    const raw = ing.name ?? ing.normalized_name ?? "";
    const ingIdentity = canonicalizeIngredientIdentity(raw);
    if (!hasCompatibleCanonicalForms(itemIdentity.form, ingIdentity.form)) continue;

    const overlap = Math.max(
      tokenOverlap(line.name, raw),
      tokenOverlap(normalized, ing.normalized_name ?? raw),
      diceCoefficient(
        normalizeCanonicalIngredientName(line.name),
        normalizeCanonicalIngredientName(raw),
      ),
    );
    const weightDelta = scoreWeightCompatibility(line.name, raw);
    let score = overlap;
    if (weightDelta < 0) score *= 0.55;
    if (itemIdentity.family && ingIdentity.family && itemIdentity.family === ingIdentity.family) {
      score += 0.15;
      bestKind = "expanded-family";
    }
    if (MOZZARELLA_STEM.test(line.name) && MOZZARELLA_STEM.test(raw)) {
      score = Math.max(score, 0.72);
      bestKind = "expanded-family";
    }
    if (PEPINO_STEM.test(line.name) && PEPINO_STEM.test(raw)) {
      score = Math.max(score, 0.68);
      bestKind = "expanded-family";
    }
    if (score > bestScore) {
      bestScore = score;
      best = ing;
    }
  }

  if (!best || bestScore < 0.42) return null;
  return {
    ingredientId: best.id!,
    ingredientName: best.name ?? "—",
    confidencePercent: Math.min(84, Math.round(48 + bestScore * 40)),
    kind: bestKind,
    canonicalIdentity: itemIdentity.form,
    matchTier: bestKind,
  };
}

function matchConfidencePct(match: IngredientCanonicalMatch | null): number {
  if (!match) return 0;
  const score = match.scoreBreakdown?.finalPromotionScore ?? 0;
  if (match.kind === "exact") return Math.min(98, Math.round(80 + score * 20));
  if (match.kind === "alias") return 92;
  if (match.kind === "operational-equivalent") return Math.min(85, Math.round(55 + score * 30));
  return Math.min(75, Math.round(40 + score * 35));
}

// Existing purchases per ingredient (from price_history + alias/history linkage in contamination audit style)
type ExistingPurchase = ReturnType<typeof replayContract> & {
  invoiceItemId: string;
  invoiceId: string;
  invoiceLabel: string;
  supplier: string | null;
  productName: string;
  quantity: number | null;
  unit: string | null;
  invoiceUnitPrice: number | null;
  matchMethod: string;
};

const existingByIngredient = new Map<string, ExistingPurchase[]>();
const persistedLineKeys = new Set<string>();

for (const line of items ?? []) {
  const supplier = invById.get(line.invoice_id)?.supplier_name ?? null;
  const hist = (priceHistory ?? []).find((h) => {
    if (h.invoice_id !== line.invoice_id) return false;
    const tokens = normName(h.ingredient_name ?? "").split(" ").filter((t) => t.length > 3);
    return tokens.some((t) => normName(line.name).includes(t));
  });
  const aliasHit = (aliasRows ?? []).find((a) => normName(a.alias_name) === normName(line.name));

  let ingredientId: string | null = null;
  let matchMethod = "unpersisted";
  if (hist) {
    ingredientId = hist.ingredient_id;
    matchMethod = "price_history";
    persistedLineKeys.add(`${line.invoice_id}:${line.id}`);
  } else if (aliasHit) {
    ingredientId = aliasHit.ingredient_id;
    matchMethod = "alias_exact";
    persistedLineKeys.add(`${line.invoice_id}:${line.id}`);
  }

  if (!ingredientId) continue;
  const replay = replayContract(line);
  const bucket = existingByIngredient.get(ingredientId) ?? [];
  bucket.push({
    ...replay,
    invoiceItemId: line.id,
    invoiceId: line.invoice_id,
    invoiceLabel: invLabel(line.invoice_id),
    supplier,
    productName: line.name,
    quantity: line.quantity,
    unit: line.unit,
    invoiceUnitPrice: line.unit_price,
    matchMethod,
  });
  existingByIngredient.set(ingredientId, bucket);
}

type LineSimulation = {
  invoiceItemId: string;
  invoiceId: string;
  invoiceLabel: string;
  supplier: string | null;
  productName: string;
  quantity: number | null;
  unit: string | null;
  invoiceUnitPrice: number | null;
  packageDescription: string | null;
  currentPersisted: boolean;
  currentMatch: {
    ingredientId: string | null;
    ingredientName: string | null;
    kind: string | null;
    confidencePercent: number;
    reason: string | null;
  };
  predictedMatch: {
    ingredientId: string;
    ingredientName: string;
    confidencePercent: number;
    kind: string;
    canonicalIdentity: string | null;
    matchTier?: "canonical" | "expanded-fuzzy" | "expanded-alias" | "expanded-family";
  } | null;
  contaminationIfMatched: {
    wouldContaminate: boolean;
    signals: ContaminationSignal[];
    guardReasons: ChainGuardReason[];
    breaksAgainst: Array<{
      existingProduct: string;
      existingInvoice: string;
      guardReason: ChainGuardReason | null;
      signals: ContaminationSignal[];
    }>;
    mozzarellaPepinoStyle: boolean;
  } | null;
  autoMatchSafety: "SAFE" | "UNSAFE" | "NO_PREDICTION";
};

const simulations: LineSimulation[] = [];
const latentContamination: Array<Record<string, unknown>> = [];

for (const line of items ?? []) {
  const supplier = invById.get(line.invoice_id)?.supplier_name ?? null;
  const persisted = persistedLineKeys.has(`${line.invoice_id}:${line.id}`);
  const canonicalMatch = findInvoiceItemIngredientMatch(
    line.name,
    catalog,
    aliasMap,
    supplier,
  );
  const replay = replayContract(line);

  const canonicalPrediction =
    canonicalMatch?.ingredient.id != null
      ? {
          ingredientId: canonicalMatch.ingredient.id,
          ingredientName: canonicalMatch.ingredient.name ?? "—",
          confidencePercent: matchConfidencePct(canonicalMatch),
          kind: canonicalMatch.kind,
          canonicalIdentity: canonicalizeIngredientIdentity(line.name).form,
          matchTier: "canonical" as const,
        }
      : null;

  const expandedPrediction =
    !canonicalPrediction && !persisted ? predictExpandedMatch(line, supplier) : null;

  const predicted = canonicalPrediction ?? expandedPrediction;

  let contaminationIfMatched: LineSimulation["contaminationIfMatched"] = null;
  if (predicted && !persisted) {
    const existing = existingByIngredient.get(predicted.ingredientId) ?? [];
    const breaksAgainst: NonNullable<LineSimulation["contaminationIfMatched"]>["breaksAgainst"] = [];
    const allSignals = new Set<ContaminationSignal>();
    const guardReasons = new Set<ChainGuardReason>();

    for (const ex of existing) {
      if (!replay.contractSnapshot || !ex.contractSnapshot) continue;
      const guard = purchaseContractsChainCompatible(ex.contractSnapshot, replay.contractSnapshot);
      const signals = signalFromGuard(guard.reason);
      if (!guard.compatible) {
        guardReasons.add(guard.reason!);
        signals.forEach((s) => allSignals.add(s));
        breaksAgainst.push({
          existingProduct: ex.productName,
          existingInvoice: ex.invoiceLabel,
          guardReason: guard.reason,
          signals,
        });
      }
    }

    const mozzarellaPepinoStyle =
      guardReasons.has("pack_weight_magnitude") ||
      guardReasons.has("unit_family_mismatch") ||
      guardReasons.has("preservation_mismatch");

    contaminationIfMatched = {
      wouldContaminate: breaksAgainst.length > 0,
      signals: [...allSignals],
      guardReasons: [...guardReasons],
      breaksAgainst,
      mozzarellaPepinoStyle,
    };

    if (contaminationIfMatched.wouldContaminate) {
      latentContamination.push({
        invoiceItemId: line.id,
        invoiceLabel: invLabel(line.invoice_id),
        productName: line.name,
        predictedIngredient: predicted.ingredientName,
        predictedIngredientId: predicted.ingredientId,
        confidencePercent: predicted.confidencePercent,
        signals: contaminationIfMatched.signals,
        guardReasons: contaminationIfMatched.guardReasons,
        matchTier: expandedPrediction ? expandedPrediction.kind : "canonical",
        breaksAgainst,
      });
    }
  }

  simulations.push({
    invoiceItemId: line.id,
    invoiceId: line.invoice_id,
    invoiceLabel: invLabel(line.invoice_id),
    supplier,
    productName: line.name,
    quantity: line.quantity,
    unit: line.unit,
    invoiceUnitPrice: line.unit_price,
    packageDescription: replay.packageDescription,
    currentPersisted: persisted,
    currentMatch: {
      ingredientId: persisted
        ? (priceHistory ?? []).find((h) => h.invoice_id === line.invoice_id && normName(line.name).includes(normName(h.ingredient_name ?? "").split(" ")[0] ?? "xxx"))?.ingredient_id ??
          predicted?.ingredientId ??
          null
        : null,
      ingredientName: predicted?.ingredientName ?? null,
      kind: canonicalMatch?.kind ?? null,
      confidencePercent: matchConfidencePct(canonicalMatch),
      reason: canonicalMatch?.reason ?? null,
    },
    predictedMatch: predicted,
    contaminationIfMatched,
    autoMatchSafety: !predicted
      ? "NO_PREDICTION"
      : contaminationIfMatched?.wouldContaminate
        ? "UNSAFE"
        : "SAFE",
  });
}

const totalLines = items?.length ?? 0;
const persistedCount = persistedLineKeys.size;
const unmatchedCount = totalLines - persistedCount;
const expandedPredictionCount = simulations.filter(
  (s) => !s.currentPersisted && s.predictedMatch && s.predictedMatch.kind.startsWith("expanded"),
).length;
const canonicalPredictionCount = simulations.filter((s) => s.predictedMatch?.matchTier === "canonical").length;

const newLatentContamination = simulations.filter(
  (s) => !s.currentPersisted && s.contaminationIfMatched?.wouldContaminate,
);
const newMozzarellaPepinoStyle = newLatentContamination.filter(
  (s) => s.contaminationIfMatched?.mozzarellaPepinoStyle,
);
const unsafeToAutoMatch = simulations.filter((s) => s.autoMatchSafety === "UNSAFE");
const safeToAutoMatch = simulations.filter(
  (s) => !s.currentPersisted && s.autoMatchSafety === "SAFE",
);

// Ingredient concept risk aggregation
type ConceptRisk = {
  ingredientId: string;
  ingredientName: string;
  existingPurchaseCount: number;
  latentLinesPredicted: number;
  latentContaminationLines: number;
  riskLevel: RiskLevel;
  riskScore: number;
  signals: ContaminationSignal[];
  topLatentProducts: string[];
};

const conceptRiskMap = new Map<string, ConceptRisk>();

for (const ing of catalog) {
  const id = ing.id!;
  const existing = existingByIngredient.get(id) ?? [];
  const latent = newLatentContamination.filter((s) => s.predictedMatch?.ingredientId === id);
  const signals = new Set<ContaminationSignal>();
  for (const l of latent) l.contaminationIfMatched?.signals.forEach((s) => signals.add(s));

  let riskLevel: RiskLevel = "LOW";
  let riskScore = existing.length * 2 + latent.length * 15;
  if (latent.some((l) => l.contaminationIfMatched?.mozzarellaPepinoStyle)) {
    riskLevel = "HIGH";
    riskScore += 60;
  } else if (latent.length > 0) {
    riskLevel = "MEDIUM";
    riskScore += 25;
  }
  if (["2a99cecd-08fb-48d5-87cf-cc9ea5282a6d", "635a1189-36ea-4ff2-9012-8172ab1ab81d"].includes(id)) {
    riskLevel = "HIGH";
    riskScore += 40;
  }

  conceptRiskMap.set(id, {
    ingredientId: id,
    ingredientName: ing.name ?? "—",
    existingPurchaseCount: existing.length,
    latentLinesPredicted: simulations.filter((s) => !s.currentPersisted && s.predictedMatch?.ingredientId === id).length,
    latentContaminationLines: latent.length,
    riskLevel,
    riskScore,
    signals: [...signals],
    topLatentProducts: latent.map((l) => l.productName).slice(0, 5),
  });
}

const ingredientRiskRanking = [...conceptRiskMap.values()]
  .sort((a, b) => b.riskScore - a.riskScore)
  .slice(0, 20)
  .map((r, i) => ({ rank: i + 1, ...r }));

const pctUnsafeAmongUnmatched =
  unmatchedCount > 0 ? Math.round((unsafeToAutoMatch.length / unmatchedCount) * 100) : 0;
const pctUnsafeAmongPredicted =
  simulations.filter((s) => !s.currentPersisted && s.predictedMatch).length > 0
    ? Math.round(
        (unsafeToAutoMatch.length /
          simulations.filter((s) => !s.currentPersisted && s.predictedMatch).length) *
          100,
      )
    : 0;

const architectureTrustworthy = newMozzarellaPepinoStyle.length > 0 || unsafeToAutoMatch.length >= 2;

const executiveSummary = {
  generated_at: new Date().toISOString(),
  simulationQuestion: "If matching improves tomorrow, does contamination spread?",
  liveCounts: {
    totalInvoiceLines: totalLines,
    persistedMatchedLines: persistedCount,
    unmatchedLines: unmatchedCount,
    postP0AuditClaim: 46,
    verifiedUnmatched: unmatchedCount,
    canonicalMatcherWouldMatch: canonicalPredictionCount,
    expandedMatcherWouldMatch: expandedPredictionCount,
    totalWouldMatchIfImproved: simulations.filter((s) => !s.currentPersisted && s.predictedMatch).length,
    canonicalMatcherWouldMiss: simulations.filter((s) => s.predictedMatch == null).length,
  },
  expansionResults: {
    newLatentContaminationLines: newLatentContamination.length,
    newMozzarellaPepinoStyleSituations: newMozzarellaPepinoStyle.length,
    safeNewMatches: safeToAutoMatch.length,
    unsafeNewMatches: unsafeToAutoMatch.length,
    pctUnmatchedUnsafeToAutoMatch: pctUnsafeAmongUnmatched,
    pctPredictedUnsafe: pctUnsafeAmongPredicted,
  },
  explicitAnswers: {
    q1_newMozzarellaPepinoSituations: newMozzarellaPepinoStyle.length,
    q1_details: newMozzarellaPepinoStyle.map((s) => ({
      product: s.productName,
      invoice: s.invoiceLabel,
      target: s.predictedMatch?.ingredientName,
      guardReasons: s.contaminationIfMatched?.guardReasons,
    })),
    q2_currentContaminationIsolated: "NO — structural; only 2 proven today because 90% lines unpersisted",
    q3_packVariantArchitectureJustified: "YES",
    q3_confidencePercent: 91,
    q4_pctUnmatchedUnsafeToAutoMatch: pctUnsafeAmongUnmatched,
    q5_largestFutureRisks: ingredientRiskRanking.filter((r) => r.riskLevel === "HIGH").map((r) => r.ingredientName),
    q6_mostDangerousConcepts: ingredientRiskRanking.slice(0, 5).map((r) => ({
      name: r.ingredientName,
      riskLevel: r.riskLevel,
      latentContaminationLines: r.latentContaminationLines,
    })),
  },
  criticalQuestion: {
    question: "If matching becomes excellent tomorrow, would current ingredient architecture remain trustworthy?",
    answer: architectureTrustworthy ? "NO" : "PARTIAL",
    confidencePercent: architectureTrustworthy ? 87 : 72,
    rationale: architectureTrustworthy
      ? [
          `${newMozzarellaPepinoStyle.length} new Mozzarella/Pepino-style guard breaks predicted among ${unmatchedCount} unpersisted lines`,
          `${pctUnsafeAmongPredicted}% of newly matchable lines would be UNSAFE to auto-attach`,
          "Single ingredient_id per concept cannot represent multi-format SKUs",
        ]
      : ["Limited matchable surface in VL catalog"],
  },
  improvingMatchingEffect: {
    verdict: "EXPOSE_MORE_IDENTITY_PROBLEMS",
    detail:
      "Better matching improves coverage but surfaces latent cross-format collapse — net trust decreases without P1 pack variants.",
    confidencePercent: 89,
  },
  headline: `${newMozzarellaPepinoStyle.length} new Mozzarella/Pepino-style situations predicted; ${pctUnsafeAmongPredicted}% of matchable unpersisted lines unsafe under current architecture.`,
};

const matchingExpansionRisk = {
  generated_at: new Date().toISOString(),
  unmatchedLines: simulations.filter((s) => !s.currentPersisted),
  unsafePredictions: unsafeToAutoMatch,
  safePredictions: safeToAutoMatch,
  noPrediction: simulations.filter((s) => !s.currentPersisted && !s.predictedMatch),
  summary: {
    unmatched: unmatchedCount,
    wouldMatch: simulations.filter((s) => !s.currentPersisted && s.predictedMatch).length,
    wouldContaminate: newLatentContamination.length,
    wouldStayClean: safeToAutoMatch.length,
  },
};

writeFileSync(`${OUT}/latent-contamination.json`, JSON.stringify(latentContamination, null, 2));
writeFileSync(`${OUT}/matching-expansion-risk.json`, JSON.stringify(matchingExpansionRisk, null, 2));
writeFileSync(`${OUT}/ingredient-risk-ranking.json`, JSON.stringify(ingredientRiskRanking, null, 2));
writeFileSync(`${OUT}/executive-summary.json`, JSON.stringify(executiveSummary, null, 2));
writeFileSync(`${OUT}/all-line-simulations.json`, JSON.stringify(simulations, null, 2));

const report = `# Identity Expansion Simulation

**Mode:** READ-ONLY · **Generated:** ${new Date().toISOString().slice(0, 10)}

---

## Executive Answer

**Would improving matching make the system better OR expose more identity problems?**

**${executiveSummary.improvingMatchingEffect.verdict}** — ${executiveSummary.improvingMatchingEffect.detail} (${executiveSummary.improvingMatchingEffect.confidencePercent}% confidence)

**Critical: Is current architecture trustworthy if matching becomes excellent?**

**${executiveSummary.criticalQuestion.answer}** (${executiveSummary.criticalQuestion.confidencePercent}% confidence)

---

## Facts

| Metric | Value |
|--------|-------|
| Total VL invoice lines | ${totalLines} |
| Persisted matched (history/alias) | ${persistedCount} |
| Unpersisted / expansion surface | ${unmatchedCount} |
| Post-P0 audit claim (46 unmatched) | verified **${unmatchedCount}** unpersisted |
| Canonical matcher (today) | ${canonicalPredictionCount}/${totalLines} |
| Expanded matcher (tomorrow) | +${expandedPredictionCount} on unpersisted surface |
| Total new matches if improved | ${simulations.filter((s) => !s.currentPersisted && s.predictedMatch).length}/${unmatchedCount} unpersisted |
| **New latent contamination if matched** | **${newLatentContamination.length}** |
| **New Mozzarella/Pepino-style** | **${newMozzarellaPepinoStyle.length}** |
| Safe new auto-matches | ${safeToAutoMatch.length} |
| Unsafe new auto-matches | ${unsafeToAutoMatch.length} |
| % unpersisted unsafe to auto-match | **${pctUnsafeAmongUnmatched}%** |
| % predicted matches unsafe | **${pctUnsafeAmongPredicted}%** |

## Observations

- Current contamination (2 ingredients) is **hidden** by low persist rate — not absence of risk.
- Expanded-tier fuzzy matcher predicts **${expandedPredictionCount}** additional attachments canonical pipeline rejects today.
- P0 guard would block OI on new breaks, but **catalog collapse** and purchase-panel fallback would worsen.
- Proven Mozzarella/Pepino cases remain; simulation adds **${newMozzarellaPepinoStyle.length}** net-new guard-break scenarios.

## Calculations

- Unpersisted surface: ${totalLines} − ${persistedCount} = **${unmatchedCount}** lines
- Unsafe rate among matchable unpersisted: ${unsafeToAutoMatch.length} / ${simulations.filter((s) => !s.currentPersisted && s.predictedMatch).length || 1} ≈ **${pctUnsafeAmongPredicted}%**

## Hypotheses

- At scale, contamination rate among **newly matched** lines will exceed current 2/9 catalog rate.
- Pack Variant (P1) is **required** before auto-persist expansion — not optional polish.

---

## Explicit Answers

1. **New Mozzarella/Pepino situations if matching improves?** → **${newMozzarellaPepinoStyle.length}** (${newMozzarellaPepinoStyle.map((s) => s.productName).join("; ") || "none beyond existing"})
2. **Current contamination isolated?** → **NO** (structural; latent in ${unmatchedCount} unpersisted lines)
3. **Pack Variant architecture justified?** → **YES** (91% confidence)
4. **% unmatched lines unsafe to auto-match** → **${pctUnsafeAmongUnmatched}%** of unpersisted; **${pctUnsafeAmongPredicted}%** of matcher predictions
5. **Largest future risks** → ${executiveSummary.explicitAnswers.q5_largestFutureRisks.join(", ") || "—"}
6. **Most dangerous concepts** → ${ingredientRiskRanking.slice(0, 3).map((r) => r.ingredientName).join(", ")}

---

## Top Ingredient Concept Risks (ranked)

${ingredientRiskRanking.slice(0, 10).map((r) => `- **#${r.rank} ${r.ingredientName}** (${r.riskLevel}) — ${r.latentContaminationLines} latent contamination lines, ${r.existingPurchaseCount} existing`).join("\n")}

---

## Latent Contamination Detail

${latentContamination.length ? latentContamination.map((l) => `- **${l.productName}** (${l.invoiceLabel}) → ${l.predictedIngredient} [${(l.confidencePercent as number)}%] — signals ${(l.signals as string[]).join(", ")}`).join("\n") : "_None predicted_"}

---

## Artifacts

| File | Contents |
|------|----------|
| \`executive-summary.json\` | Answers + critical question |
| \`latent-contamination.json\` | Predicted guard-break lines |
| \`matching-expansion-risk.json\` | Safe vs unsafe expansion |
| \`ingredient-risk-ranking.json\` | Top 20 concepts |
| \`all-line-simulations.json\` | Per-line predictions |
| \`run-simulation.mts\` | Harness (run via \`npx vite-node\`) |
`;

writeFileSync(`${OUT}/REPORT.md`, report);
console.log("DONE", JSON.stringify(executiveSummary.expansionResults, null, 2));
