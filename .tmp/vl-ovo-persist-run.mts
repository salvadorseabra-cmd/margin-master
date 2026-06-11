/**
 * One-off validation: extract Bidfood, apply client filter, attempt persist.
 */
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import {
  normalizeInvoiceItemFields,
  shouldRejectInvoiceIngredientRow,
} from "../src/lib/invoice-item-fields.ts";

const VL_REF = "bjhnlrgodcqoyzddbpbd";
const BIDFOOD_ID = "da472b7f-0fd9-4a26-a37c-80ad335f7f7e";
const USER_ID = "acfb54e5-785f-4bc8-b47b-3914452e18a5";

function projectKey(name: "anon" | "service_role"): string {
  const fromEnv =
    name === "anon"
      ? process.env.ANON_KEY ?? process.env.VL_ANON
      : process.env.SR_KEY ?? process.env.VL_SR ?? process.env.VL_KEY;
  if (fromEnv) return fromEnv;
  const raw = execSync(
    `supabase projects api-keys --project-ref ${VL_REF} -o json`,
    { encoding: "utf8" },
  );
  const row = (JSON.parse(raw) as { name: string; api_key: string }[]).find(
    (k) => k.name === name,
  );
  if (!row?.api_key) throw new Error(`missing ${name} key`);
  return row.api_key;
}

const anonKey = projectKey("anon");
const serviceKey = projectKey("service_role");
const extractSb = createClient(`https://${VL_REF}.supabase.co`, anonKey, {
  auth: { persistSession: false },
});
const persistSb = createClient(`https://${VL_REF}.supabase.co`, serviceKey, {
  auth: { persistSession: false },
});

const isEligible = (it: {
  name?: string;
  quantity?: number | null;
  unit?: string | null;
  unit_price?: number | null;
  total?: number | null;
}) =>
  !shouldRejectInvoiceIngredientRow(
    normalizeInvoiceItemFields({
      id: "x",
      name: it.name ?? "",
      quantity: it.quantity ?? null,
      unit: it.unit ?? null,
      unit_price: it.unit_price ?? null,
      total: it.total ?? null,
    }),
  );

const png = readFileSync("/tmp/bidfood-invoice.png");
const imageDataUrl = `data:image/png;base64,${png.toString("base64")}`;

const { data: extracted, error } = await extractSb.functions.invoke(
  "extract-invoice",
  { body: { imageDataUrl } },
);
if (error) throw new Error(`extract: ${error.message}`);

const items = extracted?.items ?? [];
const eligible = items.filter(isEligible);
const rejected = items.filter((it) => !isEligible(it));
const ovo = items.find((it) => /ovo moreno/i.test(it.name ?? ""));

const regression = [
  "Cartão Visa",
  "Pagamento por cartão",
  "Multibanco",
  "MB Way",
].map((name) => ({
  name,
  rejected: shouldRejectInvoiceIngredientRow(
    normalizeInvoiceItemFields({
      id: "x",
      name,
      quantity: 2,
      unit: "un",
      unit_price: 4.5,
      total: 9,
    }),
  ),
}));

await persistSb.from("invoice_items").delete().eq("invoice_id", BIDFOOD_ID);
const insertRows = eligible.map((it) => ({
  invoice_id: BIDFOOD_ID,
  user_id: USER_ID,
  name: String(it.name ?? "Unknown").slice(0, 200),
  quantity: it.quantity ?? null,
  unit: it.unit ? String(it.unit).slice(0, 20) : null,
  unit_price: it.unit_price ?? null,
  total: it.total ?? null,
}));
const { error: insertErr } = await persistSb.from("invoice_items").insert(insertRows);
const { data: persisted, error: readErr } = await persistSb
  .from("invoice_items")
  .select("id,name")
  .eq("invoice_id", BIDFOOD_ID);

console.log(
  JSON.stringify(
    {
      beforePersistedCount: 7,
      passCRowCount: items.length,
      postFilterCount: eligible.length,
      persistedCount: persisted?.length ?? null,
      insertError: insertErr?.message ?? null,
      readError: readErr?.message ?? null,
      rejectedByFilter: rejected.map((it) => it.name),
      eligibleNames: eligible.map((it) => it.name),
      persistedNames: persisted?.map((i) => i.name) ?? null,
      ovoExtracted: Boolean(ovo),
      ovoName: ovo?.name ?? null,
      ovoSurvivesFilter: ovo ? isEligible(ovo) : false,
      ovoPersisted: (persisted ?? []).some((i) => /ovo moreno/i.test(i.name ?? "")),
      regression,
      supplier: extracted?.supplier,
      total: extracted?.total,
    },
    null,
    2,
  ),
);
