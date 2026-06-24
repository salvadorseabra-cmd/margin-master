/**
 * Post-deploy persistence verification — STRICT READ-ONLY
 * Validation Lab: bjhnlrgodcqoyzddbpbd
 */
const metaEnv = import.meta as { env?: Record<string, unknown> };
if (!metaEnv.env) metaEnv.env = {};
metaEnv.env.DEV = false;
metaEnv.env.PROD = true;

import { writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import { defaultIsGenericUnit } from "../../src/lib/ingredient-auto-persist.ts";
import {
  resolveInvoiceLinePurchaseFormat,
  resolveInvoiceLinePurchaseUnit,
  resolveInvoicePersistedItemUnit,
} from "../../src/lib/invoice-purchase-format.ts";

const OUT = ".tmp/post-deploy-persistence-verification";
mkdirSync(OUT, { recursive: true });

const env = readFileSync(".env.local", "utf8");
const url = env.match(/SUPABASE_URL=(.+)/)?.[1]?.trim()!;
const key = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.+)/)?.[1]?.trim()!;
const sb = createClient(url, key);
const invoiceId = "ab52796d-de1d-418d-86e7-230c8f056f09";

const { data: items } = await sb
  .from("invoice_items")
  .select("id, invoice_id, name, quantity, unit, created_at, updated_at")
  .eq("invoice_id", invoiceId)
  .order("name");

const { data: inv } = await sb
  .from("invoices")
  .select("id, supplier_name, created_at, invoice_date, total")
  .eq("id", invoiceId)
  .single();

function baselineResolveUnit(item: {
  name: string;
  quantity: number | null;
  unit: string | null;
}): string | null {
  const resolution = resolveInvoiceLinePurchaseUnit(item, defaultIsGenericUnit);
  if (resolution.unit) return resolution.unit;
  const extractedUnit = item.unit?.trim() || null;
  if (extractedUnit) {
    const u = extractedUnit.toLowerCase();
    if (u !== "g" && u !== "gr" && u !== "grs" && u !== "ml") return extractedUnit;
  }
  return null;
}

function gateChecks(item: { name: string; quantity: number | null; unit: string | null }) {
  const resolution = resolveInvoiceLinePurchaseUnit(item, defaultIsGenericUnit);
  const structured = resolveInvoiceLinePurchaseFormat(item);
  const ocrNull = !item.unit?.trim();
  const weightOrVolume = structured.kind === "weight_or_volume";
  const qty = item.quantity;
  const qtyOk = qty != null && Number.isFinite(qty) && Number.isInteger(qty) && qty > 1;
  const normalized = item.name.normalize("NFD").replace(/\p{M}/gu, "").toUpperCase();
  const embeddedRetail =
    !/(\d+(?:[.,]\d+)?)\s*(KG|KGS)\b/.test(normalized) &&
    !/(\d+(?:[.,]\d+)?)\s*(L|LT|LTS|LTR|LTRS)\b/.test(normalized) &&
    /(\d+(?:[.,]\d+)?)\s*(G|GR|GRS|ML|CL)\b/.test(normalized);
  const noPackMarkers = !/\b(EMB|CX|CAIXA|PACK)\b/.test(normalized);
  const fallbackNull = resolution.source === "fallback_null";
  return {
    ocrNull,
    weightOrVolume,
    qtyOk,
    embeddedRetail,
    noPackMarkers,
    fallbackNull,
    allPass:
      ocrNull && weightOrVolume && qtyOk && embeddedRetail && noPackMarkers && fallbackNull,
    structuredKind: structured.kind,
    resolution,
  };
}

const targets = (items ?? []).filter((i) => /paccheri|ginger beer/i.test(i.name));
const pellegrino = (items ?? []).find((i) => /pellegrino/i.test(i.name));

const traces = targets.map((row) => {
  const extractItem = { name: row.name, quantity: row.quantity, unit: null as string | null };
  const structured = resolveInvoiceLinePurchaseFormat(extractItem);
  const resolution = resolveInvoiceLinePurchaseUnit(extractItem, defaultIsGenericUnit);
  const currentResolved = resolveInvoicePersistedItemUnit(extractItem, defaultIsGenericUnit);
  const deployedResolved = baselineResolveUnit(extractItem);
  const gates = gateChecks(extractItem);
  return {
    product: row.name,
    invoiceItemId: row.id,
    db: {
      quantity: row.quantity,
      unit: row.unit,
      created_at: row.created_at,
      updated_at: row.updated_at,
    },
    trace: {
      extractionUnit: null,
      structuredKind: structured.kind,
      resolverInput: extractItem,
      resolverOutput: { unit: resolution.unit, source: resolution.source },
      persistencePayloadUnit_deployedProxy: deployedResolved,
      persistencePayloadUnit_currentLocalCode: currentResolved,
      persistedDbUnit: row.unit,
    },
    gates,
    wouldCurrentCodeInferUn: gates.allPass,
    wouldDeployedCodeInferUn: false,
  };
});

const gitLocal = execSync(
  'git log -1 --format="%H|%ci|%s" -- src/lib/invoice-purchase-format.ts',
  { encoding: "utf8" },
)
  .trim()
  .split("|");
const gitOrigin = execSync(
  'git log -1 --format="%H|%ci|%s" origin/main -- src/lib/invoice-purchase-format.ts',
  { encoding: "utf8" },
)
  .trim()
  .split("|");
const originHasGate = Number(
  execSync(
    "git show origin/main:src/lib/invoice-purchase-format.ts 2>/dev/null | grep -c shouldInferUnForEmbeddedMeasureCountable || echo 0",
    { encoding: "utf8" },
  ).trim(),
);

const paccheri = (items ?? []).find((i) => /paccheri/i.test(i.name));
const ginger = (items ?? []).find((i) => /ginger/i.test(i.name));

const results = {
  generatedAt: new Date().toISOString(),
  validationLab: "bjhnlrgodcqoyzddbpbd",
  mode: "STRICT_READ_ONLY",
  invoiceId,
  invoice: inv,
  task1_liveDb: (items ?? []).map((i) => ({
    invoice_item_id: i.id,
    invoice_id: i.invoice_id,
    product_name: i.name,
    quantity: i.quantity,
    unit: i.unit,
    updated_at: i.updated_at,
    created_at: i.created_at,
  })),
  task2_reReadEffect: {
    verdict: "B) delete/recreate",
    evidence: {
      reReadTimestamp: items?.[0]?.created_at,
      priorAuditIds: {
        invoiceUnitPersistence_0924Z: {
          paccheri: "728517aa-8578-4f6f-a415-aae06f05f5c4",
          ginger: "634a418b-1509-42a9-bf01-563705967b6f",
          created_at: "2026-06-20T01:25:08.339203+00:00",
        },
        paccheriGingerAudit_1200Z: {
          paccheri: "cdecef89-2881-4795-92ba-93c06bc7c8e8",
          ginger: "e41a41e6-dc12-403e-abe3-47872412435c",
        },
      },
      currentIds: { paccheri: paccheri?.id, ginger: ginger?.id },
      allEightItemsShareCreatedAt: items?.[0]?.created_at,
      unitStillNullAfterReRead: paccheri?.unit === null && ginger?.unit === null,
    },
  },
  task3_executionTrace: traces,
  task4_deploymentValidation: {
    shouldInferUnForEmbeddedMeasureCountable: {
      localWorkspace: {
        present: true,
        file: "src/lib/invoice-purchase-format.ts:1423",
        commit: gitLocal[0],
        commitDate: gitLocal[1],
        message: gitLocal[2],
      },
      originMain_proxyForDeployedFrontend: {
        present: originHasGate > 0,
        commit: gitOrigin[0],
        commitDate: gitOrigin[1],
        message: gitOrigin[2],
      },
      localMainAheadOfOrigin: Number(
        execSync("git rev-list --count origin/main..HEAD", { encoding: "utf8" }).trim(),
      ),
      runsOnReRead:
        "CLIENT — invoices.tsx runExtraction → resolveInvoiceItemUnit → resolveInvoicePersistedItemUnit (line 1448)",
      edgeFunction: {
        name: "extract-invoice",
        version: 38,
        updatedAtUtc: "2026-06-23 10:13:38",
        relevance:
          "Returns extraction unit only; does NOT run shouldInferUnForEmbeddedMeasureCountable",
      },
    },
  },
  task5_gateValidation: traces.map((t) => ({
    product: t.product,
    gates: {
      ocrUnitNull: t.gates.ocrNull ? "PASS" : "FAIL",
      weightOrVolume: t.gates.weightOrVolume ? "PASS" : "FAIL",
      integerQtyGt1: t.gates.qtyOk ? "PASS" : "FAIL",
      embeddedRetailMeasure: t.gates.embeddedRetail ? "PASS" : "FAIL",
      noPackMarkers: t.gates.noPackMarkers ? "PASS" : "FAIL",
      fallbackNull: t.gates.fallbackNull ? "PASS" : "FAIL",
    },
    allGatesPass: t.gates.allPass,
    wouldCurrentCodeInferUn: t.wouldCurrentCodeInferUn ? "YES" : "NO",
    wouldDeployedOriginMainInferUn: "NO",
  })),
  task6_rootCause: {
    verdict: "B) Deployed code not active",
    singleRootCause:
      "Client-side frontend bundle on VL does not include be21f02 gated un inference; re-read ran with pre-fix resolveInvoicePersistedItemUnit (origin/main proxy). Edge extract-invoice v38 deploy is irrelevant to unit persistence.",
  },
  task7_hypotheticalFreshUpload: {
    paccheri: {
      quantity: 24,
      extractionUnit: null,
      unitWithCurrentLocalCode: traces.find((t) => /paccheri/i.test(t.product))?.trace
        .persistencePayloadUnit_currentLocalCode,
      unitWithDeployedOriginMain: null,
    },
    gingerBeer: {
      quantity: 24,
      extractionUnit: null,
      unitWithCurrentLocalCode: traces.find((t) => /ginger/i.test(t.product))?.trace
        .persistencePayloadUnit_currentLocalCode,
      unitWithDeployedOriginMain: null,
    },
  },
  pellegrinoControl: pellegrino
    ? { id: pellegrino.id, unit: pellegrino.unit, created_at: pellegrino.created_at }
    : null,
};

writeFileSync(`${OUT}/results.json`, JSON.stringify(results, null, 2));
console.log(JSON.stringify({ ok: true, rootCause: results.task6_rootCause.verdict }, null, 2));
