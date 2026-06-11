import { Image } from "https://deno.land/x/imagescript@1.3.0/mod.ts";

const png = await Deno.readFile(".tmp/emporio-footer-audit/emporio/invoice-full.png");
const img = await Image.decode(png);
console.log("from png:", img.width, img.height);

const txt = await Deno.readTextFile(".tmp/emporio-footer-audit/emporio/invoice-full.b64.txt");
console.log("txt len", txt.length, "prefix", txt.slice(0, 30));
const b64 = txt.split(",")[1];
console.log("b64 len", b64?.length);
const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
console.log("bytes len", bytes.length);
const img2 = await Image.decode(bytes);
console.log("from b64:", img2.width, img2.height);
