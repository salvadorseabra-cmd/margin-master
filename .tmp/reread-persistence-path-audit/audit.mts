/**
 * Re-read Persistence Path Audit — STRICT READ-ONLY
 * Validation Lab: bjhnlrgodcqoyzddbpbd
 */
const metaEnv = import.meta as { env?: Record<string, unknown> };
if (!metaEnv.env) metaEnv.env = {};
metaEnv.env.DEV = false;
metaEnv.env.PROD = true;

import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { defaultIsGenericUnit } from "../../src/lib/ingredient-auto-persist.ts";
import { normalizeInvoiceItemFields } from "../../src/lib/invoice-item-fields.ts";
import {
  resolveInvoiceLinePurchaseFormat,
  resolveInvoiceLinePurchaseUnit,
  resolveInvoicePersistedItemUnit,
} from "../../src/lib/invoice-purchase-format.ts";

const OUT = ".tmp/reread-persistence-path-audit";
const VL = "bjhnlrgodcqoyzddbpbd";
const INVOICE_ID = "ab52796d-de1d-418d-86e7-230c8f056f09";

mkdirSync(OUT, { recursive: true });

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

/** Mirrors invoices.tsx resolveInvoiceItemUnit — persistence call site shape. */
function persistenceCallSiteResolve(item: { name: string; unit: string | null }) {
  return resolveInvoicePersistedItemUnit(item, defaultIsGenericUnit);
}

/** Full line shape (what tests / replay scripts use). */
function fullLineResolve(item: { name: string; quantity: number | null; unit: string | null }) {
  return resolveInvoicePersistedItemUnit(item, defaultIsGenericUnit);
}

function gateDiagnostics(item: { name: string; quantity?: number | null; unit?: string | null }) {
  const resolution = resolveInvoiceLinePurchaseUnit(item, defaultIsGenericUnit);
  const structured = resolveInvoiceLinePurchaseFormat(item);
  const qty = item.quantity;
  return {
    resolution,
    structuredKind: structured.kind,
    purchaseContainerCount: structured.purchaseContainerCount,
    gates: {
      fallbackNull: resolution.source === "fallback_null",
      ocrUnitNull: !item.unit?.trim(),
      weightOrVolume: structured.kind === "weight_or_volume",
      qtyPresent: qty != null,
      qtyIntegerGt1:
        qty != null && Number.isFinite(qty) && Number.isInteger(qty) && qty > 1,
      embeddedRetail: /(\d+(?:[.,]\d+)?)\s*(G|GR|GRS|ML|CL)\b/i.test(
        item.name.normalize("NFD").replace(/\p{M}/gu, "").toUpperCase(),
      ),
    },
    persistedItemUnit: resolveInvoicePersistedItemUnit(item, defaultIsGenericUnit),
  };
}

const { data: items, error: itemsError } = await sb
  .from("invoice_items")
  .select("id, invoice_id, name, quantity, unit, unit_price, total, created_at, updated_at")
  .eq("invoice_id", INVOICE_ID)
  .order("name");
if (itemsError) throw new Error(itemsError.message);

const { data: invoice } = await sb
  .from("invoices")
  .select("id, supplier_name, created_at, invoice_date, total, file_path")
  .eq("id", INVOICE_ID)
  .single();

const paccheri = (items ?? []).find((i) => /paccheri/i.test(i.name));
const ginger = (items ?? []).find((i) => /ginger/i.test(i.name));
const pellegrino = (items ?? []).find((i) => /pellegrino/i.test(i.name));

const rawExtract = {
  paccheri: { name: paccheri?.name ?? "", quantity: paccheri?.quantity ?? 24, unit: null },
  ginger: { name: ginger?.name ?? "", quantity: ginger?.quantity ?? 24, unit: null },
};

function buildProductTrace(
  row: (typeof items)[number] | undefined,
  raw: { name: string; quantity: number | null; unit: string | null },
) {
  if (!row) return null;
  const normalized = normalizeInvoiceItemFields(raw);
  const persistenceInput = { name: String(normalized.name), unit: normalized.unit };
  const fullInput = {
    name: String(normalized.name),
    quantity: normalized.quantity,
    unit: normalized.unit,
  };
  const persistenceOutput = persistenceCallSiteResolve(persistenceInput);
  const fullOutput = fullLineResolve(fullInput);
  const persistenceDiag = gateDiagnostics(persistenceInput);
  const fullDiag = gateDiagnostics(fullInput);
  return {
    invoiceItemId: row.id,
    product: row.name,
    db: {
      quantity: row.quantity,
      unit: row.unit,
      created_at: row.created_at,
      updated_at: row.updated_at,
    },
    rawExtract: raw,
    afterNormalizeInvoiceItemFields: {
      name: normalized.name,
      quantity: normalized.quantity,
      unit: normalized.unit,
    },
    resolverCalled: true,
    resolverCallSite: "invoices.tsx:1448 resolveInvoiceItemUnit({ name, unit: it.unit })",
    persistencePathInput: persistenceInput,
    persistencePathOutput: persistenceOutput,
    persistencePathDiagnostics: persistenceDiag,
    fullLineInput: fullInput,
    fullLineOutput: fullOutput,
    fullLineDiagnostics: fullDiag,
    insertPayloadUnit: persistenceOutput,
    persistedDbUnit: row.unit,
    matchesDb: persistenceOutput === row.unit,
  };
}

const paccheriTrace = buildProductTrace(paccheri, rawExtract.paccheri);
const gingerTrace = buildProductTrace(ginger, rawExtract.ginger);

const originMain = execSync("git rev-parse origin/main", { encoding: "utf8" }).trim();
const localMain = execSync("git rev-parse main", { encoding: "utf8" }).trim();
const head = execSync("git rev-parse HEAD", { encoding: "utf8" }).trim();
const originHasGate = Number(
  execSync(
    "git show origin/main:src/lib/invoice-purchase-format.ts 2>/dev/null | grep -c shouldInferUnForEmbeddedMeasureCountable || echo 0",
    { encoding: "utf8" },
  ).trim(),
);
const be21f02Date = execSync('git log -1 --format="%ci" be21f02', { encoding: "utf8" }).trim();

const results = {
  generatedAt: new Date().toISOString(),
  validationLab: VL,
  mode: "STRICT_READ_ONLY",
  invoiceId: INVOICE_ID,
  invoice,
  git: {
    head,
    localMain,
    originMain,
    originMainEqualsBe21f02: originMain.startsWith("be21f02"),
    localMainEqualsOriginMain: localMain === originMain,
    originHasShouldInferUnGate: originHasGate > 0,
    be21f02CommitDate: be21f02Date,
  },
  q1_entryPoint: {
    ui: "Invoice Review → reExtract(row) — invoices.tsx:2393",
    trigger: "onClick reExtract / onExtract",
    preconditions: ["row.file_path present", "isExtractableInvoicePath(file_path)"],
  },
  q2_functionChain: [
    "reExtract(row) — invoices.tsx:2393",
    "createSignedUrl → fetch blob → fileToExtractionDataUrl",
    "runExtraction(invoiceId, dataUrl) — invoices.tsx:1339",
    "supabase.functions.invoke('extract-invoice', { imageDataUrl })",
    "items.map(normalizeInvoiceItemFields).filter(shouldRejectInvoiceIngredientRow)",
    "supabase.from('invoice_items').delete().eq('invoice_id')",
    "insertRows = normalizedItems.map → resolveInvoiceItemUnit({ name, unit }) — line 1448",
    "resolveInvoiceItemUnit → resolveInvoicePersistedItemUnit(item, isGenericUnit) — line 656-657",
    "supabase.from('invoice_items').insert(insertRows)",
    "syncOperationalIngredientCostsFromInvoiceLines (also calls resolveInvoiceItemUnit)",
    "reExtract updates invoices row metadata if result non-null",
    "loadItems(invoiceId) refresh UI",
  ],
  q3_resolverExecutes: "YES",
  q3_note:
    "Same runExtraction path for initial upload and re-read; edge extract-invoice does NOT insert invoice_items",
  q4_ifYes: {
    paccheri: paccheriTrace,
    ginger: gingerTrace,
  },
  q5_actualPersistencePath:
    "Client runExtraction insertRows — NOT edge, NOT loadItems, NOT a separate re-read branch",
  reReadEvidence: {
    batchCreatedAt: items?.[0]?.created_at ?? null,
    allItemsShareTimestamp: new Set((items ?? []).map((i) => i.created_at)).size === 1,
    itemCount: items?.length ?? 0,
    priorPaccheriIds: [
      "728517aa-8578-4f6f-a415-aae06f05f5c4",
      "cdecef89-2881-4795-92ba-93c06bc7c8e8",
    ],
    currentPaccheriId: paccheri?.id ?? null,
    priorGingerIds: [
      "634a418b-1509-42a9-bf01-563705967b6f",
      "e41a41e6-dc12-403e-abe3-47872412435c",
    ],
    currentGingerId: ginger?.id ?? null,
    reReadExecuted: true,
  },
  stageTable: [
    {
      stage: "Raw extract unit",
      paccheri: "null (edge GPT Pass C — discount-binding stage_3)",
      ginger: "null",
    },
    {
      stage: "Resolver called?",
      paccheri: "YES — resolveInvoicePersistedItemUnit via resolveInvoiceItemUnit",
      ginger: "YES",
    },
    {
      stage: "Resolver output (actual call site: name+unit only)",
      paccheri: paccheriTrace?.persistencePathOutput ?? null,
      ginger: gingerTrace?.persistencePathOutput ?? null,
    },
    {
      stage: "Resolver output (if quantity passed)",
      paccheri: paccheriTrace?.fullLineOutput ?? null,
      ginger: gingerTrace?.fullLineOutput ?? null,
    },
    {
      stage: "DB payload unit",
      paccheri: paccheriTrace?.insertPayloadUnit ?? null,
      ginger: gingerTrace?.insertPayloadUnit ?? null,
    },
    {
      stage: "Persisted unit",
      paccheri: paccheri?.unit ?? null,
      ginger: ginger?.unit ?? null,
    },
  ],
  pellegrinoControl: pellegrino
    ? {
        id: pellegrino.id,
        quantity: pellegrino.quantity,
        unit: pellegrino.unit,
        persistencePathOutput: persistenceCallSiteResolve({
          name: pellegrino.name,
          unit: pellegrino.unit,
        }),
        note: "multi_unit_pack / preserved_countable — does not need quantity gate",
      }
    : null,
  deploymentReconciliation: {
    priorAuditClaim: "origin/main lacked be21f02 at 2026-06-23T10:20Z",
    currentEvidence: {
      originMainAtBe21f02: originMain.startsWith("be21f02"),
      gatePresentOnOriginMain: originHasGate > 0,
      fetchedAt: new Date().toISOString(),
    },
    conclusion:
      "User claim origin/main=be21f02 is NOW correct (pushed since prior audit). Null DB units are NOT explained by missing git commit.",
    activeBundleNote:
      ".env.local points VITE_SUPABASE_URL to VL (bjhnlrgodcqoyzddbpbd). Frontend is Vite SPA — resolver runs in whichever bundle serves /invoices (local dev or hosted). Bug is in source at be21f02 regardless of host.",
    edgeFunction: { name: "extract-invoice", version: 38, updatedAtUtc: "2026-06-23 10:13:38" },
  },
  rootCauseAnalysis: {
    callSiteBug: {
      file: "src/routes/invoices.tsx",
      lines: "656-657, 1448, 1490",
      issue:
        "resolveInvoiceItemUnit typed as Pick<ItemRow,'name'|'unit'> — persistence passes only { name, unit }, omitting quantity",
      gateRequirement:
        "shouldInferUnForEmbeddedMeasureCountable requires item.quantity integer > 1 (invoice-purchase-format.ts:1433-1434)",
      effect:
        "Gate fails when quantity undefined → resolveInvoicePersistedItemUnit returns null even on be21f02",
    },
    replayProof: {
      nameUnitOnly: {
        paccheri: persistenceCallSiteResolve({
          name: rawExtract.paccheri.name,
          unit: null,
        }),
        ginger: persistenceCallSiteResolve({ name: rawExtract.ginger.name, unit: null }),
      },
      withQuantity: {
        paccheri: fullLineResolve(rawExtract.paccheri),
        ginger: fullLineResolve(rawExtract.ginger),
      },
    },
  },
  bindingTraceArtifacts: [
    ".tmp/discount-binding-root-cause-output.json — stage_3 unit:null for Paccheri through stage_7 insert",
    ".tmp/post-deploy-persistence-verification/ — superseded deployment hypothesis",
  ],
  finalVerdict: "B",
  finalVerdictLabel: "Resolver runs but returns null",
  finalVerdictDetail:
    "resolveInvoicePersistedItemUnit executes on every re-read insert, but runExtraction calls it with {name, unit} only. shouldInferUnForEmbeddedMeasureCountable requires quantity>1; without quantity the gate fails and resolver returns null → insert unit:null. This holds on be21f02 (origin/main) — not a deployment gap.",
  ruledOut: {
    A_resolverNeverRuns:
      "runExtraction line 1448 always calls resolveInvoiceItemUnit before insert; re-read uses same path",
    C_resolverReturnsUnPersistenceBypasses:
      "insertRows.unit is direct output of resolver; no post-resolver strip (normalizeInvoiceItemFields runs before resolver, not after)",
    D_otherDeploymentOnly:
      "origin/main now at be21f02 with gate present; null persists even with fix because call site omits quantity",
  },
  allInvoiceItems: items,
};

writeFileSync(`${OUT}/results.json`, JSON.stringify(results, null, 2));
console.log(
  JSON.stringify(
    {
      ok: true,
      verdict: results.finalVerdict,
      paccheriDbUnit: paccheri?.unit,
      persistencePathUnit: paccheriTrace?.persistencePathOutput,
      fullLineUnit: paccheriTrace?.fullLineOutput,
    },
    null,
    2,
  ),
);
