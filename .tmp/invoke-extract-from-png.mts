import { readFileSync } from "node:fs";
import { loadEnvFiles } from "../scripts/load-env.mts";

loadEnvFiles();

const pngPath = process.argv[2];
if (!pngPath) {
  console.error("usage: invoke-extract-from-png.mts <png-path>");
  process.exit(1);
}

const png = readFileSync(pngPath);
const imageDataUrl = `data:image/png;base64,${png.toString("base64")}`;
const url = process.env.VITE_SUPABASE_URL!;
const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY!;

const res = await fetch(`${url}/functions/v1/extract-invoice`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    apikey: key,
    Authorization: `Bearer ${key}`,
  },
  body: JSON.stringify({ imageDataUrl }),
});

const text = await res.text();
console.log("status", res.status);
console.log(text.slice(0, 4000));
