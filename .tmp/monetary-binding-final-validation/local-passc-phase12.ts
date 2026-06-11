/** Local Pass C with uncommitted Hybrid H Phase 1+2 code (table crop + structured schema). */
import { readFileSync } from "node:fs";
import { extractTableItemsFromImage } from "../../supabase/functions/extract-invoice/invoice-table-extraction.ts";

const imagePath = Deno.args[0];
const runIndex = Number(Deno.args[1] ?? "1");

if (!imagePath) {
  console.log(JSON.stringify({ error: "usage: local-passc-phase12.ts <dataUrlFile> [runIndex]" }));
  Deno.exit(1);
}

const apiKey = Deno.env.get("OPENAI_API_KEY");
if (!apiKey) {
  console.log(
    JSON.stringify({
      skipped: true,
      reason: "OPENAI_API_KEY not set",
      runIndex,
    }),
  );
  Deno.exit(0);
}

const raw = readFileSync(imagePath, "utf8").trim();
const imageDataUrl = raw.startsWith("data:") ? raw : `data:image/png;base64,${raw}`;

const started = Date.now();
const result = await extractTableItemsFromImage(imageDataUrl, apiKey);
const pomodor = result.items.find((it) => /pomodor/i.test(it.name)) ?? null;

console.log(
  JSON.stringify({
    runIndex,
    elapsedMs: Date.now() - started,
    itemCount: result.items.length,
    tableCrop: result.tableCrop,
    pomodor,
    allItems: result.items,
    phase: "local-uncommitted-phase1-plus-2",
  }),
);
