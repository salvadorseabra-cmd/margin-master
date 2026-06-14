/**
 * OCR hardening stability test — 5 consecutive full-page extractions.
 *
 *   npx vite-node .tmp/ocr-hardening-stability/run-stability.mts [runs]
 *
 * Uses local uncommitted extract-invoice code (temperature=0, seed=42).
 * Image: .tmp/vl-ocr-rc/full.png (AVILUDO April invoice).
 */
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { loadEnvFiles } from "../../scripts/load-env.mts";

const ROOT = resolve(import.meta.dirname, "../..");
const OUT = join(ROOT, ".tmp/ocr-hardening-stability");
const IMAGE = join(ROOT, ".tmp/vl-ocr-rc/full.png");
const DENO = join(ROOT, ".tmp/deno/bin/deno");
const RUNS = Number(process.argv[2] ?? "5");

loadEnvFiles(ROOT);

mkdirSync(OUT, { recursive: true });

const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) {
  console.error("OPENAI_API_KEY not set in .env.local — cannot run live stability test");
  process.exit(1);
}

if (!readFileSync(IMAGE)) {
  console.error(`Missing image: ${IMAGE}`);
  process.exit(1);
}

const buf = readFileSync(IMAGE);
const imageDataUrl = `data:image/png;base64,${buf.toString("base64")}`;
const dataUrlPath = join(OUT, "full-image-dataurl.txt");
writeFileSync(dataUrlPath, imageDataUrl);

const runnerPath = join(OUT, "local-full-extract.ts");
writeFileSync(
  runnerPath,
  `/** Auto-generated — full 4-pass extract via index handler modules. */
import { readFileSync } from "node:fs";
import { extractIssueDateFromImage } from "../../supabase/functions/extract-invoice/invoice-date-extraction.ts";
import { extractMetadataFromImage } from "../../supabase/functions/extract-invoice/invoice-metadata-extraction.ts";
import { extractFooterMetadataFromImage } from "../../supabase/functions/extract-invoice/invoice-footer-metadata-extraction.ts";
import { extractTableItemsFromImage, finalizeExtractedLineItems } from "../../supabase/functions/extract-invoice/invoice-table-extraction.ts";

const imagePath = Deno.args[0];
const runIndex = Number(Deno.args[1] ?? "1");
const apiKey = Deno.env.get("OPENAI_API_KEY");
if (!apiKey) {
  console.log(JSON.stringify({ error: "OPENAI_API_KEY not set", runIndex }));
  Deno.exit(1);
}

const raw = readFileSync(imagePath, "utf8").trim();
const imageDataUrl = raw.startsWith("data:") ? raw : \`data:image/png;base64,\${raw}\`;

const started = Date.now();
const issueDate = await extractIssueDateFromImage(imageDataUrl, apiKey);
const metadata = await extractMetadataFromImage(imageDataUrl, apiKey);
const footer = await extractFooterMetadataFromImage(imageDataUrl, apiKey);
const table = await extractTableItemsFromImage(imageDataUrl, apiKey);
const items = finalizeExtractedLineItems(table.items, footer, issueDate);

const anchovas = items.find((it) => /anchov|anchoa/i.test(it.name)) ?? null;

console.log(
  JSON.stringify({
    crop: "full",
    run: runIndex,
    elapsed_s: Math.round((Date.now() - started) / 100) / 10,
    item_count: items.length,
    items,
    supplier: metadata.supplier_name ?? null,
    total: footer.total ?? null,
    anchovas,
  }),
);
`,
);

const results: unknown[] = [];

console.log(`Running ${RUNS} full-page extractions (temperature=0, seed=42)...\n`);

for (let i = 1; i <= RUNS; i++) {
  process.stdout.write(`  run ${i}/${RUNS}... `);
  try {
    const out = execSync(
      `${DENO} run --allow-read --allow-net --allow-env ${runnerPath} "${dataUrlPath}" ${i}`,
      {
        encoding: "utf8",
        timeout: 300_000,
        cwd: ROOT,
        env: { ...process.env, OPENAI_API_KEY: apiKey },
      },
    );
    const parsed = JSON.parse(out.trim());
    results.push(parsed);
    const name = (parsed as { anchovas?: { name?: string } }).anchovas?.name ?? "(none)";
    console.log(`${name} (${(parsed as { elapsed_s?: number }).elapsed_s}s)`);
  } catch (e) {
    const err = e as { stdout?: string; stderr?: string; message?: string };
    console.log("FAILED");
    results.push({
      run: i,
      error: (err.stderr ?? "") + (err.stdout ?? "") + (err.message ?? ""),
    });
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
