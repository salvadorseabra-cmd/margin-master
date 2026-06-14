/** Verify callOpenAiJson request body includes temperature=0 and seed=42. */
import {
  OPENAI_OCR_MODEL,
  OPENAI_OCR_TEMPERATURE,
  OPENAI_OCR_SEED,
  callOpenAiJson,
} from "../../supabase/functions/extract-invoice/invoice-date-extraction.ts";

const originalFetch = globalThis.fetch;
let capturedBody: string | null = null;

globalThis.fetch = async (_input: RequestInfo | URL, init?: RequestInit) => {
  capturedBody = init?.body as string;
  return new Response(
    JSON.stringify({
      choices: [{ message: { content: '{"invoice_date":null,"dates":[]}' } }],
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
};

await callOpenAiJson("test-key", [{ role: "user", content: "hi" }]);

const body = JSON.parse(capturedBody!);
const pass =
  body.temperature === 0 &&
  body.seed === 42 &&
  body.model === "gpt-4.1" &&
  body.response_format?.type === "json_object";

console.log(
  JSON.stringify(
    {
      model: body.model,
      temperature: body.temperature,
      seed: body.seed,
      response_format: body.response_format,
      constants: { OPENAI_OCR_MODEL, OPENAI_OCR_TEMPERATURE, OPENAI_OCR_SEED },
      pass,
    },
    null,
    2,
  ),
);

if (!pass) Deno.exit(1);
