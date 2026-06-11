import { execSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { Image } from "https://deno.land/x/imagescript@1.3.0/mod.ts";
import { detectTableBounds } from "../../supabase/functions/extract-invoice/invoice-image-crop.ts";

const VL_REF = "bjhnlrgodcqoyzddbpbd";
const OUT = ".tmp/mammafiore-fix";
mkdirSync(OUT, { recursive: true });

function projectKey(name: "anon" | "service_role"): string {
  const raw = execSync(
    `supabase projects api-keys --project-ref ${VL_REF} -o json`,
    { encoding: "utf8" },
  );
  return (JSON.parse(raw) as { name: string; api_key: string }[]).find(
    (k) => k.name === name,
  )!.api_key;
}

const anonKey = projectKey("anon");
const serviceKey = projectKey("service_role");
const sb = createClient(`https://${VL_REF}.supabase.co`, serviceKey, {
  auth: { persistSession: false },
});

async function extract(imageDataUrl: string) {
  const res = await fetch(
    `https://${VL_REF}.supabase.co/functions/v1/extract-invoice`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
      },
      body: JSON.stringify({ imageDataUrl }),
    },
  );
  return await res.json();
}

async function boundsFor(path: string) {
  const image = await Image.decode(readFileSync(path));
  const b = detectTableBounds(image);
  return { top: b.top, headerTop: b.headerTop, bottom: b.bottom };
}

const INVOICE_ID = "36c99d19-6f9f-413f-8c2d-ae3526291a2d";
const { data: invoice } = await sb
  .from("invoices")
  .select("file_url")
  .eq("id", INVOICE_ID)
  .single();
const { data: signed } = await sb.storage
  .from("invoices")
  .createSignedUrl(invoice!.file_url!, 600);
const buf = Buffer.from(await fetch(signed!.signedUrl).then((r) => r.arrayBuffer()));
const imageDataUrl = `data:image/png;base64,${buf.toString("base64")}`;

const mammaExtract = await extract(imageDataUrl);
writeFileSync(`${OUT}/mammafiore-extract.json`, JSON.stringify(mammaExtract, null, 2));

for (
  const [label, path] of [
    ["bocconcino", ".tmp/bocconcino-investigation/invoice-full.png"],
    ["bidfood", ".tmp/bidfood-ovo.png"],
  ] as const
) {
  const png = readFileSync(path);
  const dataUrl = `data:image/png;base64,${png.toString("base64")}`;
  const ex = await extract(dataUrl);
  writeFileSync(`${OUT}/${label}-extract.json`, JSON.stringify(ex, null, 2));
}

const bocconcinoExtract = JSON.parse(
  readFileSync(`${OUT}/bocconcino-extract.json`, "utf8"),
);
const bidfoodExtract = JSON.parse(
  readFileSync(`${OUT}/bidfood-extract.json`, "utf8"),
);

const summary = {
  cropBounds: {
    Mammafiore: {
      beforeTop: 622,
      after: await boundsFor(".tmp/mammafiore-investigation/invoice-full.png"),
    },
    Bocconcino: {
      beforeTop: 561,
      after: await boundsFor(".tmp/bocconcino-investigation/invoice-full.png"),
    },
    Bidfood: {
      beforeTop: 437,
      after: await boundsFor(".tmp/bidfood-ovo.png"),
    },
    AviludoMay: {
      beforeTop: 218,
      after: await boundsFor(
        ".tmp/aviludo-investigation/reference_3b4cb21f_scan.png",
      ),
    },
    Emporio: {
      beforeTop: 456,
      after: await boundsFor(
        ".tmp/emporio-footer-audit/emporio/invoice-full.png",
      ),
    },
  },
  extraction: {
    Mammafiore: {
      expected: 8,
      got: (mammaExtract.items ?? []).length,
      names: (mammaExtract.items ?? []).map((i: { name?: string }) => i.name),
      total: mammaExtract.total,
    },
    Bocconcino: {
      expected: 7,
      got: (bocconcinoExtract.items ?? []).length,
    },
    Bidfood: {
      got: (bidfoodExtract.items ?? []).length,
    },
  },
};

writeFileSync(`${OUT}/summary.json`, JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
