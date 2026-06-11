/**
 * Read-only Mammafiore 0-items investigation.
 */
import { execSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import {
  normalizeInvoiceItemFields,
  shouldRejectInvoiceIngredientRow,
} from "../../src/lib/invoice-item-fields.ts";

const VL_REF = "bjhnlrgodcqoyzddbpbd";
const INVOICE_ID = "36c99d19-6f9f-413f-8c2d-ae3526291a2d";
const OUT_DIR = ".tmp/mammafiore-investigation";
const DENO = ".tmp/deno/bin/deno";

const EXPECTED_ROWS = [
  "Guanciale di suino stagionato +/- 1,5kg",
  "Farina Speciale pizza 25kg Amoruso",
  "Birra Peroni Nastro Azzurro PNA 33cl*24",
  "Aceto balsamico di Modena IGP pet 5l*2",
  "Mozza Fior di Latte Expert Julienne 3kg",
  "Rulo Di Capra 1kg",
  "Recargo por combustible",
  "Farina 00 pasta fresca e gnocchi 25kg Caputo",
];

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

// 1. DB
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

writeFileSync(
  `${OUT_DIR}/invoice-meta.json`,
  JSON.stringify({ invoice, dbItemCount: dbItems?.length ?? 0, dbItems }, null, 2),
);

// 2. Download image
const { data: signed } = await sb.storage
  .from("invoices")
  .createSignedUrl(invoice!.file_url!, 600);
const blob = await fetch(signed!.signedUrl).then((r) => r.blob());
const buf = Buffer.from(await blob.arrayBuffer());
const imageDataUrl = `data:${blob.type || "image/png"};base64,${buf.toString("base64")}`;
writeFileSync(`${OUT_DIR}/invoice-dataurl.txt`, imageDataUrl);
writeFileSync(`${OUT_DIR}/invoice-full.png`, buf);

// 3. Local crop + overlay via deno
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

const croppedBytes = parseImageDataUrl(cropResult.croppedDataUrl).bytes;
writeFileSync(outDir + "/table-crop.png", croppedBytes);

const croppedImg = await Image.decode(croppedBytes);
const topH = Math.min(400, croppedImg.height);
const topCrop = croppedImg.crop(0, 0, croppedImg.width, topH);
writeFileSync(outDir + "/table-crop-top400.png", await topCrop.encode());

// Region above crop top
if (bounds.detected && bounds.top > 0) {
  const aboveH = Math.min(bounds.top, image.height);
  const above = image.crop(0, 0, image.width, aboveH);
  writeFileSync(outDir + "/region-above-crop-top.png", await above.encode());
}

// Overlay: red=top, green=bottom, blue=headerTop
const overlay = image.clone();
const drawHLine = (y: number, color: number) => {
  if (y < 0 || y >= overlay.height) return;
  for (let x = 0; x < overlay.width; x++) overlay.setPixelAt(x + 1, y + 1, color);
};
if (bounds.detected) {
  drawHLine(bounds.top, 0xff0000ff);
  drawHLine(bounds.bottom, 0xff00ff00);
  drawHLine(bounds.headerTop, 0xffff0000);
  if (bounds.totalsStart != null) drawHLine(bounds.totalsStart, 0xffffff00);
}
writeFileSync(outDir + "/overlay.png", await overlay.encode());

// Row band crops for OCR (first/middle/last of expected 8 rows)
const rowBands = [];
if (bounds.detected) {
  const tableH = bounds.bottom - bounds.top;
  const rowH = Math.floor(tableH / 8);
  for (const idx of [0, 3, 7]) {
    const y0 = bounds.top + idx * rowH;
    const h = Math.min(rowH + 20, image.height - y0);
    const band = image.crop(0, y0, image.width, h);
    const path = outDir + "/row-band-" + idx + ".png";
    writeFileSync(path, await band.encode());
    rowBands.push({ index: idx, y0, h, path: "row-band-" + idx + ".png" });
  }
}

console.log(JSON.stringify({
  fullImage: { width: image.width, height: image.height },
  bounds,
  cropResult: {
    fallbackUsed: cropResult.fallbackUsed,
    cropHeight: bounds.detected ? bounds.bottom - bounds.top : null,
    cropTop: bounds?.top,
    cropBottom: bounds?.bottom,
    croppedSize: { width: croppedImg.width, height: croppedImg.height },
  },
  rowBands,
}, null, 2));
`;
writeFileSync(`${OUT_DIR}/crop-local.ts`, cropScript);
const cropOut = execSync(
  `${DENO} run --allow-read --allow-write --allow-env --allow-net ${OUT_DIR}/crop-local.ts "${OUT_DIR}/invoice-dataurl.txt" "${OUT_DIR}"`,
  { encoding: "utf8", cwd: process.cwd(), maxBuffer: 20 * 1024 * 1024 },
);
const cropMeta = JSON.parse(cropOut.trim());
writeFileSync(`${OUT_DIR}/crop-bounds.json`, JSON.stringify(cropMeta, null, 2));

// 4. Re-invoke extract-invoice
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

// 5. OCR table region — row bands via extract-invoice (Pass C on each band)
const ocrTable: Record<string, unknown> = { method: "extract-invoice on row bands", bands: [] as unknown[] };
for (const band of cropMeta.rowBands ?? []) {
  const bandPath = `${OUT_DIR}/${band.path}`;
  const bandBytes = readFileSync(bandPath);
  const bandDataUrl = `data:image/png;base64,${bandBytes.toString("base64")}`;
  const bandRes = await fetch(`https://${VL_REF}.supabase.co/functions/v1/extract-invoice`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
    },
    body: JSON.stringify({ imageDataUrl: bandDataUrl }),
  });
  const bandExtract = await bandRes.json();
  ocrTable.bands.push({
    rowIndex: band.index,
    y0: band.y0,
    items: bandExtract.items ?? [],
    supplier: bandExtract.supplier,
    total: bandExtract.total,
  });
}
writeFileSync(`${OUT_DIR}/ocr-table.json`, JSON.stringify(ocrTable, null, 2));

// 6. Full image OCR check (does full image have rows visible?)
const fullImageCheck = {
  passCItemCount: passCItems.length,
  passCItems,
  netSubtotal: extracted.net_subtotal ?? null,
  total: extracted.total,
  supplier: extracted.supplier,
  invoice_date: extracted.invoice_date,
  tableCropFromResponse: extracted.tableCrop ?? null,
};

const dbSum = (dbItems ?? []).reduce((s, r) => s + Number(r.total ?? 0), 0);
const passCSum = passCItems.reduce((s: number, r: { total?: number }) => s + (r.total ?? 0), 0);

const needleMatch = (name: string, needle: string) =>
  name.toLowerCase().includes(needle.toLowerCase().split(" ")[0]);

const summary = {
  invoiceId: INVOICE_ID,
  storagePath: invoice?.file_url,
  dbRowCount: dbItems?.length ?? 0,
  expectedRows: EXPECTED_ROWS.length,
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
  expectedRowPresence: EXPECTED_ROWS.map((needle) => ({
    needle,
    inPassC: passCItems.some((it: { name?: string }) => needleMatch(it.name ?? "", needle)),
    inDb: (dbItems ?? []).some((r) => needleMatch(r.name ?? "", needle)),
  })),
  eligibility,
  fullImageCheck,
};

writeFileSync(`${OUT_DIR}/summary.json`, JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
