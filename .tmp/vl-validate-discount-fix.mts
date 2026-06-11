/**
 * Validate Phase 1 discounted-line fix via deployed extract-invoice + local Bidfood PNG.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { loadEnvFiles } from "../scripts/load-env.mts";

loadEnvFiles();

const VL_REF = "bjhnlrgodcqoyzddbpbd";
const BIDFOOD_PNG = process.argv[2] ?? join(process.cwd(), ".tmp/bidfood-ovo.png");
const key =
  process.env.VL_KEY ??
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
if (!key) {
  console.error(JSON.stringify({ error: "No Supabase key in env" }));
  process.exit(1);
}

function findItem(
  items: Array<{
    name?: string;
    quantity?: number | null;
    unit?: string | null;
    unit_price?: number | null;
    total?: number | null;
  }>,
  pattern: RegExp,
) {
  return items.find((it) => pattern.test(String(it.name ?? "")));
}

const bidfoodPng = readFileSync(BIDFOOD_PNG);
const imageDataUrl = `data:image/png;base64,${bidfoodPng.toString("base64")}`;

const res = await fetch(`https://${VL_REF}.supabase.co/functions/v1/extract-invoice`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    apikey: key,
    Authorization: `Bearer ${key}`,
  },
  body: JSON.stringify({ imageDataUrl }),
});
const extracted = await res.json();
if (!res.ok) throw new Error(`extract ${res.status}: ${JSON.stringify(extracted)}`);

const items = (extracted.items ?? []) as Array<{
  name?: string;
  quantity?: number | null;
  unit?: string | null;
  unit_price?: number | null;
  total?: number | null;
}>;

const courgettes = findItem(items, /courgette/i);
const hortela = findItem(items, /hortel/i);
const pepino = findItem(items, /pepino/i);
const abobora = findItem(items, /ab[oó]bora/i);

const backSolvedQty = Math.round((5.15 / 1.95) * 1000) / 1000;

console.log(
  JSON.stringify(
    {
      image: BIDFOOD_PNG,
      itemCount: items.length,
      courgettes,
      hortela,
      pepino,
      abobora,
      courgettesQtyOk:
        courgettes?.quantity != null && Math.abs(courgettes.quantity - 3.3) < 0.01,
      courgettesNotBackSolved:
        courgettes?.quantity != null && Math.abs(courgettes.quantity - backSolvedQty) > 0.05,
      hortelaPreserved:
        hortela?.quantity === 0.5 &&
        hortela?.unit_price != null &&
        Math.abs(hortela.unit_price - 6.74) < 0.01 &&
        hortela?.total != null &&
        Math.abs(hortela.total - 2.7) < 0.01,
      allNames: items.map((i) => i.name),
    },
    null,
    2,
  ),
);
