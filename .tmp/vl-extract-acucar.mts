import { readFileSync } from "node:fs";

const VL_SR = process.env.VL_SR!;
const pngPath = process.argv[2] ?? ".tmp/aviludo-investigation/reference_3b4cb21f_scan.png";
const png = readFileSync(pngPath);
const imageDataUrl = `data:image/png;base64,${png.toString("base64")}`;
const url = "https://bjhnlrgodcqoyzddbpbd.supabase.co/functions/v1/extract-invoice";

const res = await fetch(url, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    apikey: VL_SR,
    Authorization: `Bearer ${VL_SR}`,
  },
  body: JSON.stringify({ imageDataUrl }),
});

const data = await res.json();
const items = data.items ?? [];
const acucar = items.find((i: { name?: string }) => /acucar|açúcar|acúcar/i.test(i.name ?? ""));
console.log(
  JSON.stringify(
    {
      status: res.status,
      total: data.total,
      net_subtotal: data.net_subtotal,
      itemCount: items.length,
      acucar,
      items,
      lineSum: items.reduce((s: number, i: { total?: number }) => s + (i.total ?? 0), 0),
    },
    null,
    2,
  ),
);
