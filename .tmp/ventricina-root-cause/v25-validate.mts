/**
 * v25 Ventricina prompt hardening — 5-run validation
 */
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

const VL_REF = "bjhnlrgodcqoyzddbpbd";
const OUT_DIR = ".tmp/ventricina-root-cause";
const IMG_PATH = ".tmp/emporio-italia-investigation/invoice-full.png";
const RUNS = 5;
const SLEEP_MS = 4000;

const REFERENCES = {
  prosciutto: {
    visible: { qty: 4.3, gross: 10.3, discount: 17.5, netUnit: 8.5, total: 36.54 },
    vlGt: { qty: 4.3, unit: 8.17, total: 35.14 },
  },
  mortadella: {
    visible: { qty: 3.11, gross: 11.1, discount: 10, total: 31.07 },
    vlGt: { qty: 3.11, unit: 10.1, total: 31.07 },
  },
  ventricina: {
    visible: { qty: 2.6, gross: 16.6, discount: 8.5, netUnit: 15.19, total: 39.49 },
    vlGt: { qty: 2.6, unit: 16.6, total: 39.49 },
  },
};

const V24_BASELINE = {
  source: ".tmp/emporio-discount-column-audit/post-hardening-3run-validation.json",
  prosciutto: { runs: [8.41, 8.5, 8.5], totals: [36.54, 36.54, 36.54], discount: "3/3 LIKELY_PRESENT" },
  mortadella: { runs: [9.43, 9.99, 10], totals: [29.31, 31.06, 31.11], discount: "0/3" },
  ventricina: { runs: [21, 20.2, 17.72], totals: [54.6, 52.52, 46.09], discount: "0/3 MISSING" },
};

function projectKey(name: "anon" | "service_role"): string {
  const raw = execSync(`supabase projects api-keys --project-ref ${VL_REF} -o json`, {
    encoding: "utf8",
    timeout: 60_000,
  });
  return (JSON.parse(raw) as { name: string; api_key: string }[]).find((k) => k.name === name)!.api_key;
}

function matchRow(items: Array<Record<string, unknown>>, pattern: RegExp) {
  return items.find((i) => pattern.test(String(i.name ?? ""))) ?? null;
}

function inferDiscount(
  row: { quantity: number; unit_price: number; total: number },
  ref: { visible: { gross: number; discount: number; netUnit: number; total: number } },
): { status: string; confidence: string; note?: string } {
  const { quantity, unit_price, total } = row;
  const { gross, discount, netUnit } = ref.visible;
  const derivedNet = Math.round(gross * (1 - discount / 100) * 100) / 100;
  const qtyUnit = Math.round(quantity * unit_price * 100) / 100;

  if (Math.abs(total - ref.visible.total) < 0.05 && Math.abs(unit_price - netUnit) < 0.15) {
    return { status: "LIKELY_PRESENT", confidence: "high", note: `net≈${netUnit}, total≈${ref.visible.total}` };
  }
  if (Math.abs(total - ref.visible.total) < 0.05 && Math.abs(unit_price - gross) < 0.15) {
    return { status: "PARTIAL", confidence: "medium", note: "total correct, unit≈gross" };
  }
  if (Math.abs(unit_price - discount) < 0.5 || Math.abs(unit_price - 17.5) < 0.5) {
    return { status: "BLEED", confidence: "high", note: "discount magnitude as unit" };
  }
  if (Math.abs(qtyUnit - total) < 0.1 && Math.abs(unit_price - gross) > 0.5) {
    return { status: "MISSING", confidence: "medium", note: "qty×unit=gross path" };
  }
  if (Math.abs(unit_price - derivedNet) < 0.15 && Math.abs(total - ref.visible.total) < 0.05) {
    return { status: "LIKELY_PRESENT", confidence: "high" };
  }
  return { status: "UNKNOWN", confidence: "low" };
}

const anonKey = projectKey("anon");
const png = readFileSync(IMG_PATH);
const imageDataUrl = `data:image/png;base64,${png.toString("base64")}`;

mkdirSync(OUT_DIR, { recursive: true });

const runs: Array<Record<string, unknown>> = [];

for (let run = 1; run <= RUNS; run++) {
  const t0 = Date.now();
  const res = await fetch(`https://${VL_REF}.supabase.co/functions/v1/extract-invoice`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
    },
    body: JSON.stringify({ imageDataUrl }),
  });
  const body = await res.json();
  const items = (body.items ?? []) as Array<{
    name: string;
    quantity: number;
    unit_price: number;
    total: number;
  }>;

  const prosciutto = matchRow(items, /prosciutto/i);
  const mortadella = matchRow(items, /mortadella/i);
  const ventricina = matchRow(items, /ventricina/i);

  const row = (item: typeof prosciutto, refKey: keyof typeof REFERENCES) => {
    if (!item) return null;
    const r = {
      name: item.name,
      quantity: item.quantity,
      unit_price: item.unit_price,
      total: item.total,
      qtyTimesUnit: Math.round(item.quantity * item.unit_price * 100) / 100,
      discountInferred: inferDiscount(item, REFERENCES[refKey]),
    };
    return r;
  };

  runs.push({
    run,
    status: res.status,
    elapsedMs: Date.now() - t0,
    itemCount: items.length,
    prosciutto: row(prosciutto, "prosciutto"),
    mortadella: row(mortadella, "mortadella"),
    ventricina: row(ventricina, "ventricina"),
  });

  console.log(`run ${run}/${RUNS} status=${res.status} ventricina=${ventricina?.unit_price}/${ventricina?.total}`);
  if (run < RUNS) await new Promise((r) => setTimeout(r, SLEEP_MS));
}

const ventricinaRuns = runs.map((r) => r.ventricina as Record<string, unknown>).filter(Boolean);
const likelyPresent = ventricinaRuns.filter(
  (r) => (r.discountInferred as { status: string }).status === "LIKELY_PRESENT",
).length;

const bestVentricina = ventricinaRuns.reduce((best, r) => {
  const d = Math.abs(Number(r.total) - REFERENCES.ventricina.visible.total);
  return !best || d < Math.abs(Number(best.total) - REFERENCES.ventricina.visible.total) ? r : best;
}, null as Record<string, unknown> | null);

const deploymentRaw = execSync(`supabase functions list --project-ref ${VL_REF} -o json`, { encoding: "utf8" });
const fn = (JSON.parse(deploymentRaw) as Array<{ slug: string; version: number; updated_at: string }>).find(
  (f) => f.slug === "extract-invoice",
);

const output = {
  generated_at: new Date().toISOString(),
  deployment: {
    version: fn?.version ?? null,
    updatedAtUtc: fn?.updated_at ?? null,
    priorVersion: 24,
    ventricinaHardening: true,
  },
  references: REFERENCES,
  v24Baseline: V24_BASELINE,
  runs,
  summary: {
    ventricina: {
      likelyPresent: likelyPresent,
      totalRuns: RUNS,
      statuses: ventricinaRuns.map((r) => (r.discountInferred as { status: string }).status),
      units: ventricinaRuns.map((r) => r.unit_price),
      totals: ventricinaRuns.map((r) => r.total),
      bestRun: bestVentricina,
      deltaVsVisible: bestVentricina
        ? {
            total: Math.round((Number(bestVentricina.total) - REFERENCES.ventricina.visible.total) * 100) / 100,
            unit: Math.round((Number(bestVentricina.unit_price) - REFERENCES.ventricina.visible.netUnit) * 100) / 100,
          }
        : null,
      deltaVsVlGt: bestVentricina
        ? {
            total: Math.round((Number(bestVentricina.total) - REFERENCES.ventricina.vlGt.total) * 100) / 100,
            unit: Math.round((Number(bestVentricina.unit_price) - REFERENCES.ventricina.vlGt.unit) * 100) / 100,
          }
        : null,
    },
    prosciutto: {
      statuses: runs.map((r) => (r.prosciutto as { discountInferred?: { status: string } })?.discountInferred?.status),
      totals: runs.map((r) => (r.prosciutto as { total?: number })?.total),
    },
    mortadella: {
      statuses: runs.map((r) => (r.mortadella as { discountInferred?: { status: string } })?.discountInferred?.status),
      totals: runs.map((r) => (r.mortadella as { total?: number })?.total),
    },
    emporioFamily:
      likelyPresent >= 4
        ? "CLOSED"
        : likelyPresent >= 2
          ? "PARTIAL"
          : "OPEN",
  },
};

writeFileSync(`${OUT_DIR}/v25-validation.json`, JSON.stringify(output, null, 2));
console.log("wrote", `${OUT_DIR}/v25-validation.json`);
console.log("ventricina discount present:", `${likelyPresent}/${RUNS}`);
console.log("family:", output.summary.emporioFamily);
