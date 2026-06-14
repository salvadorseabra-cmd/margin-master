/** Verify json_schema response_format works with temperature=0 and seed=42. */
import { callOpenAiJson } from "../../supabase/functions/extract-invoice/invoice-date-extraction.ts";

const TABLE_FORMAT = {
  type: "json_schema" as const,
  json_schema: {
    name: "invoice_line_items",
    strict: true,
    schema: {
      type: "object",
      properties: {
        items: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              quantity: { type: "number" },
            },
            required: ["name", "quantity"],
            additionalProperties: false,
          },
        },
      },
      required: ["items"],
      additionalProperties: false,
    },
  },
};

let capturedBody: string | null = null;
globalThis.fetch = async (_input: RequestInfo | URL, init?: RequestInit) => {
  capturedBody = init?.body as string;
  return new Response(
    JSON.stringify({
      choices: [{ message: { content: '{"items":[{"name":"Test","quantity":1}]}' } }],
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
};

const result = await callOpenAiJson("test-key", [{ role: "user", content: "hi" }], TABLE_FORMAT);
const body = JSON.parse(capturedBody!);

const pass =
  body.temperature === 0 &&
  body.seed === 42 &&
  body.response_format?.type === "json_schema" &&
  Array.isArray(result.items);

console.log(JSON.stringify({ pass, response_format: body.response_format, itemCount: (result.items as unknown[]).length }, null, 2));
if (!pass) Deno.exit(1);
