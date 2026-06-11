import { cropBottomPortion } from "../../supabase/functions/extract-invoice/invoice-image-crop.ts";

const imageDataUrl = await Deno.readTextFile(Deno.args[0]);
const croppedDataUrl = await cropBottomPortion(imageDataUrl);
const match = croppedDataUrl.match(/^data:image\/png;base64,(.+)$/);
if (!match) throw new Error("no png");
await Deno.writeFile(
  Deno.args[1],
  Uint8Array.from(atob(match[1]), (c) => c.charCodeAt(0)),
);
console.log("saved", Deno.args[1]);
