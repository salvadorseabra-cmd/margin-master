/**
 * Post-hardening stability test — 5 VL extract-invoice invocations.
 *
 *   npx vite-node .tmp/ocr-hardening-stability/run-vl-stability.mts [runs]
 */
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "../..");
const OUT = join(ROOT, ".tmp/ocr-hardening-stability");
const IMAGE = join(ROOT, ".tmp/vl-ocr-rc/full.png");
const VL_REF = "bjhnlrgodcqoyzddbpbd";
const RUNS = Number(process.argv[2] ?? "5");

mkdirSync(OUT, { recursive: true });

function projectKey(name: "anon" | "service_role"): string {
  const raw = execSync(`supabase projects api-keys --project-ref ${VL_REF} -o json`, {
    encoding: "utf8",
    timeout: 60_000,
  });
  const row = (JSON.parse(raw) as { name: string; api_key: string }[]).find(
    (k) => k.name === name,
  );
  if (!row?.api_key) throw new Error(`missing ${name} key`);
  return row.api_key;
}

const anonKey = projectKey("anon");
const buf = readFileSync(IMAGE);
const imageDataUrl = `data:image/png;base64,${buf.toString("base64")}`;
const url = `https://${VL_REF}.supabase.co/functions/v1/extract-invoice`;

const results: unknown[] = [];

console.log(`Running ${RUNS} VL full-page extractions (temperature=0, seed=42 deployed)...\n`);

for (let i = 1; i <= RUNS; i++) {
  process.stdout.write(`  run ${i}/${RUNS}... `);
  const started = Date.now();
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 180_000);
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
      },
      body: JSON.stringify({ imageDataUrl }),
      signal: controller.signal,
    });
    clearTimeout(timer);
    const body = await res.json();
    const elapsed_s = Math.round((Date.now() - started) / 100) / 10;
    const items = Array.isArray(body.items) ? body.items : [];
    const anchovas = items.find((it: { name?: string }) => /anchov|anchoa/i.test(it.name ?? "")) ?? null;

    const entry = {
      crop: "full",
      run: i,
      elapsed_s,
      item_count: items.length,
      items,
      supplier: body.supplier_name ?? null,
      total: body.total ?? null,
      anchovas,
      status: res.status,
    };
    results.push(entry);
    console.log(`${anchovas?.name ?? "(none)"} (${elapsed_s}s)`);
  } catch (e) {
    console.log("FAILED");
    results.push({ run: i, error: String(e) });
  }
}

const outPath = join(OUT, "ocr-stability-runs-after.json");
writeFileSync(outPath, JSON.stringify(results, null, 2));

const anchovasNames = new Set<string>();
for (const r of results) {
  const name = (r as { anchovas?: { name?: string } }).anchovas?.name;
  if (name) anchovasNames.add(name);
}

console.log(`\nAnchovas distinct variants (${RUNS} runs): ${anchovasNames.size}`);
for (const v of anchovasNames) console.log(`  - ${v}`);
console.log(`\nResults written to ${outPath}`);
