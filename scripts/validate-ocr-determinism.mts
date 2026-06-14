/**
 * Read-only OCR determinism validation — wraps existing investigation scripts.
 *
 *   npx vite-node scripts/validate-ocr-determinism.mts [baseline|matcher|stability|all]
 *
 * Modes:
 *   baseline   — Anchovas live DB state (via validate-anchoas-reread)
 *   matcher    — OCR variant matcher simulation (via validate-anchoas-reread + validate-reread-determinism)
 *   stability  — Summarize Anchovas variants from vl-ocr-rc stability runs
 *   all        — Run baseline + matcher + stability
 */
import { execSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const mode = process.argv[2] ?? "all";
const root = resolve(import.meta.dirname, "..");
const stabilityPath = resolve(root, ".tmp/vl-ocr-rc/ocr-stability-runs.json");

function run(script: string, submode?: string) {
  const cmd = submode
    ? `npx vite-node scripts/${script} ${submode}`
    : `npx vite-node scripts/${script}`;
  console.log(`\n${"=".repeat(60)}\n> ${cmd}\n${"=".repeat(60)}\n`);
  execSync(cmd, { cwd: root, stdio: "inherit" });
}

function summarizeStabilityRuns() {
  if (!existsSync(stabilityPath)) {
    console.error(`Missing ${stabilityPath}`);
    process.exit(1);
  }

  const runs = JSON.parse(readFileSync(stabilityPath, "utf-8")) as Array<{
    crop: string;
    run: number;
    anchovas?: { name: string };
    matched?: { name: string };
    items?: Array<{ name: string }>;
  }>;

  const byCrop = new Map<string, Set<string>>();

  function anchovasName(entry: (typeof runs)[number]): string | undefined {
    const fromField = entry.anchovas?.name ?? entry.matched?.name;
    if (fromField && /anchov|anchoa/i.test(fromField)) return fromField;
    return entry.items?.find((i) => /anchov|anchoa/i.test(i.name))?.name;
  }

  for (const entry of runs) {
    const name = anchovasName(entry);
    if (!name) continue;
    if (!byCrop.has(entry.crop)) byCrop.set(entry.crop, new Set());
    byCrop.get(entry.crop)!.add(name);
  }

  console.log("\nOCR Stability Summary — Anchovas brand variants by crop mode\n");
  console.log(`Source: ${stabilityPath}\n`);

  for (const [crop, variants] of [...byCrop.entries()].sort()) {
    const stable = variants.size === 1;
    console.log(`  ${crop}: ${variants.size} distinct variant(s) ${stable ? "(STABLE)" : "(UNSTABLE)"}`);
    for (const v of variants) {
      console.log(`    - ${v}`);
    }
  }

  const allVariants = new Set<string>();
  for (const variants of byCrop.values()) {
    for (const v of variants) allVariants.add(v);
  }
  console.log(`\nTotal distinct Anchovas OCR strings across all crops: ${allVariants.size}`);
  console.log("\nVerdict: OCR_NON_DETERMINISTIC (see .tmp/ocr-determinism-investigation/FINAL_VERDICT.md)\n");
}

switch (mode) {
  case "baseline":
    run("validate-anchoas-reread.mts", "baseline");
    break;
  case "matcher":
    run("validate-anchoas-reread.mts", "matcher");
    run("validate-reread-determinism.mts", "matcher");
    break;
  case "stability":
    summarizeStabilityRuns();
    break;
  case "all":
    run("validate-anchoas-reread.mts", "baseline");
    run("validate-anchoas-reread.mts", "matcher");
    run("validate-reread-determinism.mts", "matcher");
    summarizeStabilityRuns();
    break;
  default:
    console.error(`Unknown mode: ${mode}. Use baseline|matcher|stability|all`);
    process.exit(1);
}
