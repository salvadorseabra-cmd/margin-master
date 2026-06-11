/**
 * Validate Bidfood MO/EM unit extraction (local PNG + deployed Pass C).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { loadEnvFiles } from "../scripts/load-env.mts";
import { normalizeInvoiceItemFields } from "../src/lib/invoice-item-fields.ts";

loadEnvFiles();

const VL_REF = "bjhnlrgodcqoyzddbpbd";
const BIDFOOD_PNG = process.argv[2] ?? join(process.cwd(), ".tmp/bidfood-crop-after.png");
const key =
  process.env.VL_KEY ??
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
if (!key) {
  console.error(JSON.stringify({ error: "No Supabase key in env" }));
  process.exit(1);
}

const HERB_PATTERNS = [
  { label: "Tomilho", re: /tomilho/i, expected: "mo" },
  { label: "Manjericão", re: /manjeric/i, expected: "mo" },
  { label: "Salada", re: /salada/i, expected: "em" },
] as const;

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

const normalizeRow = (it: {
  name?: string;
  quantity?: number | null;
  unit?: string | null;
  unit_price?: number | null;
  total?: number | null;
}) =>
  normalizeInvoiceItemFields({
    id: "x",
    name: it.name ?? "",
    quantity: it.quantity ?? null,
    unit: it.unit ?? null,
    unit_price: it.unit_price ?? null,
    total: it.total ?? null,
  });

const items = (extracted.items ?? []).map(normalizeRow);

const herbResults = HERB_PATTERNS.map(({ label, re, expected }) => {
  const row = items.find((i) => re.test(i.name ?? ""));
  return {
    label,
    found: Boolean(row),
    name: row?.name ?? null,
    rawUnit: (extracted.items ?? []).find((i: { name?: string }) => re.test(i.name ?? ""))?.unit ?? null,
    normalizedUnit: row?.unit ?? null,
    expected,
    ok: row?.unit === expected,
  };
});

const regressionUnits = ["kg", "g", "L", "ml", "un", "cx"] as const;
const regression = Object.fromEntries(
  regressionUnits.map((u) => [
    u,
    items.filter((i) => (i.unit ?? "").toLowerCase() === u.toLowerCase()).length,
  ]),
);

console.log(
  JSON.stringify(
    {
      image: BIDFOOD_PNG,
      itemCount: items.length,
      herbResults,
      regression,
      pass: herbResults.every((h) => h.ok),
    },
    null,
    2,
  ),
);
