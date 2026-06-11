import { readFileSync } from "node:fs";
import { Image } from "https://deno.land/x/imagescript@1.3.0/mod.ts";
import { detectTableBounds } from "../supabase/functions/extract-invoice/invoice-image-crop.ts";

const cases = [
  [".tmp/bocconcino-investigation/invoice-full.png", "Bocconcino"],
  [".tmp/bidfood-ovo.png", "Bidfood"],
  [".tmp/aviludo-investigation/reference_3b4cb21f_scan.png", "Aviludo May"],
];

for (const [path, label] of cases) {
  const image = await Image.decode(readFileSync(path));
  const b = detectTableBounds(image);
  console.log(label, JSON.stringify(b));
}
