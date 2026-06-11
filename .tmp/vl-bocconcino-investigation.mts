/**
 * Read-only Bocconcino missing-lines investigation.
 */
import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import {
  normalizeInvoiceItemFields,
  shouldRejectInvoiceIngredientRow,
} from "../src/lib/invoice-item-fields.ts";

const VL_REF = "bjhnlrgodcqoyzddbpbd";
const INVOICE_ID = "f0aa5a08-86a3-4938-99f0-711e86073968";
const OUT_DIR = ".tmp/bocconcino-investigation";
const DENO = ".tmp/deno/bin/deno";

function projectKey(name: "anon" | "service_role"): string {
  const raw = execSync(
    `supabase projects api-keys --project-ref ${VL_REF} -o json`,
    { encoding: "utf8" },
  );
  return (JSON.parse(raw) as { name: string; api_key: string }[]).find(
    (k) => k.name === name,
  )!.api_key;
}

const serviceKey = projectKey("service_role");
const anonKey = projectKey("anon");
const sb = createClient(`https://${VL_REF}.supabase.co`, serviceKey, {
  auth: { persistSession: false },
});

mkdirSync(OUT_DIR, { recursive: true });

const isEligible = (it: {
  name?: string;
  quantity?: number | null;
  unit?: string | null;
  unit_price?: number | null;
  total?: number | null;
}) => {
  const normalized = normalizeInvoiceItemFields({
    id: "x",
    name: it.name ?? "",
    quantity: it.quantity ?? null,
    unit: it.unit ?? null,
    unit_price: it.unit_price ?? null,
    total: it.total ?? null,
  });
  const rejected = shouldRejectInvoiceIngredientRow(normalized);
  return { normalized, rejected, eligible: !rejected };
};

// 1. DB rows
const { data: dbItems } = await sb
  .from("invoice_items")
  .select("id,name,quantity,unit,unit_price,total,created_at")
  .eq("invoice_id", INVOICE_ID)
  .order("created_at");

const { data: invoice } = await sb
  .from("invoices")
  .select("id,supplier_name,invoice_date,total,file_url,user_id,created_at")
  .eq("id", INVOICE_ID)
  .single();

// 2. Download image
const { data: signed } = await sb.storage
  .from("invoices")
  .createSignedUrl(invoice!.file_url!, 600);
const blob = await fetch(signed!.signedUrl).then((r) => r.blob());
const buf = Buffer.from(await blob.arrayBuffer());
const imageDataUrl = `data:${blob.type || "image/png"};base64,${buf.toString("base64")}`;
writeFileSync(`${OUT_DIR}/invoice-full.b64.txt`, imageDataUrl.slice(0, 200) + "...(truncated)");
writeFileSync(`${OUT_DIR}/invoice-meta.json`, JSON.stringify({ invoice, dbItemCount: dbItems?.length ?? 0, dbItems }, null, 2));

// Save PNG for inspection
const pngPath = `${OUT_DIR}/invoice-full.png`;
writeFileSync(pngPath, buf);

// 3. Local crop bounds via deno
const cropScript = `
import { readFileSync, writeFileSync } from "node:fs";
import { cropTableRegionForLineItems, detectTableBounds, parseImageDataUrl } from "../../supabase/functions/extract-invoice/invoice-image-crop.ts";
import { Image } from "https://deno.land/x/imagescript@1.3.0/mod.ts";

const dataUrl = readFileSync(Deno.args[0], "utf8").trim();
const outDir = Deno.args[1];
const { bytes } = parseImageDataUrl(dataUrl);
const image = await Image.decode(bytes);
const bounds = detectTableBounds(image);
const cropResult = await cropTableRegionForLineItems(dataUrl);

// Save cropped table region
const croppedBytes = parseImageDataUrl(cropResult.croppedDataUrl).bytes;
writeFileSync(outDir + "/table-crop.png", croppedBytes);

// Save top 400px of crop for first-row inspection
const croppedImg = await Image.decode(croppedBytes);
const topH = Math.min(400, croppedImg.height);
const topCrop = croppedImg.crop(0, 0, croppedImg.width, topH);
const topEncoded = await topCrop.encode();
writeFileSync(outDir + "/table-crop-top400.png", topEncoded);

console.log(JSON.stringify({
  fullImage: { width: image.width, height: image.height },
  bounds,
  cropResult: {
    fallbackUsed: cropResult.fallbackUsed,
    cropHeight: bounds ? bounds.bottom - bounds.top : null,
    cropTop: bounds?.top,
    cropBottom: bounds?.bottom,
    croppedSize: { width: croppedImg.width, height: croppedImg.height },
  },
}, null, 2));
`;
writeFileSync(`${OUT_DIR}/crop-local.ts`, cropScript);
writeFileSync(`${OUT_DIR}/invoice-dataurl.txt`, imageDataUrl);
const cropOut = execSync(
  `${DENO} run --allow-read --allow-write --allow-env --allow-net ${OUT_DIR}/crop-local.ts "${OUT_DIR}/invoice-dataurl.txt" "${OUT_DIR}"`,
  { encoding: "utf8", cwd: process.cwd(), maxBuffer: 20 * 1024 * 1024 },
);
const cropMeta = JSON.parse(cropOut.trim());
writeFileSync(`${OUT_DIR}/crop-bounds.json`, JSON.stringify(cropMeta, null, 2));

// 4. Re-invoke extract-invoice (Pass C + full pipeline)
const extractRes = await fetch(`https://${VL_REF}.supabase.co/functions/v1/extract-invoice`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    apikey: anonKey,
    Authorization: `Bearer ${anonKey}`,
  },
  body: JSON.stringify({ imageDataUrl }),
});
const extracted = await extractRes.json();
writeFileSync(`${OUT_DIR}/extract-invoice-response.json`, JSON.stringify(extracted, null, 2));

const passCItems = extracted.items ?? [];
const eligibility = passCItems.map((it: Record<string, unknown>) => {
  const e = isEligible(it as Parameters<typeof isEligible>[0]);
  return { raw: it, ...e };
});

const dbSum = (dbItems ?? []).reduce((s, r) => s + Number(r.total ?? 0), 0);
const passCSum = passCItems.reduce((s: number, r: { total?: number }) => s + (r.total ?? 0), 0);

const summary = {
  invoiceId: INVOICE_ID,
  storagePath: invoice?.file_url,
  dbRowCount: dbItems?.length ?? 0,
  expectedRows: 7,
  passCRowCount: passCItems.length,
  passCEligibleCount: eligibility.filter((e) => e.eligible).length,
  dbLineSum: Math.round(dbSum * 100) / 100,
  passCLineSum: Math.round(passCSum * 100) / 100,
  invoiceTotal: invoice?.total,
  netSubtotal: extracted.net_subtotal ?? null,
  cropBounds: cropMeta.bounds,
  cropFallbackUsed: cropMeta.cropResult?.fallbackUsed,
  passCNames: passCItems.map((it: { name?: string }) => it.name),
  dbNames: (dbItems ?? []).map((r) => r.name),
  missingFromPassC: ["Mozzarella Fior di Latte", "Stracciatella"].map((needle) => ({
    needle,
    inPassC: passCItems.some((it: { name?: string }) =>
      (it.name ?? "").toLowerCase().includes(needle.split(" ")[0].toLowerCase()),
    ),
    inDb: (dbItems ?? []).some((r) =>
      (r.name ?? "").toLowerCase().includes(needle.split(" ")[0].toLowerCase()),
    ),
  })),
  eligibility,
};

writeFileSync(`${OUT_DIR}/summary.json`, JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
