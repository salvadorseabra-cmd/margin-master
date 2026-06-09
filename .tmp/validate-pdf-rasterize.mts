import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createCanvas } from "canvas";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

const fixtureDir = join(dirname(fileURLToPath(import.meta.url)), "../.tmp/aviludo-investigation");
const fixturePdf = join(fixtureDir, "Aviludo_Historico_2026_04_with_total.pdf");

function computePdfRenderScale(width: number, height: number, maxLongEdge: number): number {
  const longEdge = Math.max(width, height);
  if (longEdge <= 0 || longEdge <= maxLongEdge) return 1;
  return maxLongEdge / longEdge;
}

async function main() {
  const bytes = readFileSync(fixturePdf);
  const pdf = await getDocument({ data: new Uint8Array(bytes) }).promise;
  const page = await pdf.getPage(1);
  const baseViewport = page.getViewport({ scale: 1 });
  const scale = computePdfRenderScale(baseViewport.width, baseViewport.height, 1600);
  const viewport = page.getViewport({ scale });
  const canvas = createCanvas(Math.floor(viewport.width), Math.floor(viewport.height));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Node canvas unavailable");

  await page.render({
    canvasContext: context as unknown as CanvasRenderingContext2D,
    viewport,
    canvas: canvas as unknown as HTMLCanvasElement,
  }).promise;

  const dataUrl = canvas.toDataURL("image/png");
  await pdf.destroy();

  console.log(
    JSON.stringify(
      {
        numPages: 1,
        width: canvas.width,
        height: canvas.height,
        scale,
        dataUrlPrefix: dataUrl.slice(0, 64),
        dataUrlLength: dataUrl.length,
        pngBytes: Math.ceil((dataUrl.length * 3) / 4),
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
