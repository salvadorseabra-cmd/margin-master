import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { imageDataUrl } = await req.json();

    if (!imageDataUrl || typeof imageDataUrl !== "string") {
      return new Response(
        JSON.stringify({ error: "imageDataUrl is required" }),
        {
          status: 400,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");

    if (!OPENAI_API_KEY) {
      return new Response(
        JSON.stringify({ error: "OPENAI_API_KEY not configured" }),
        {
          status: 500,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    const response = await fetch(
      "https://api.openai.com/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4.1", 
          response_format: { type: "json_object" },
          messages: [
            {
              role: "system",
              content: `
You extract structured restaurant invoice data from noisy screenshots, photos, scans, and PDFs.

Return ONLY valid JSON.

Return this exact structure:

{
  "supplier": string | null,
  "invoice_date": string | null,
  "total": number | null,
  "items": [
    {
      "name": string,
      "quantity": number | null,
      "unit": string | null,
      "unit_price": number | null,
      "total": number | null
    }
  ]
}

CRITICAL RULES:

- Extract ALL invoice line items.
- quantity must represent the PURCHASED quantity.
- unit must represent the PURCHASED unit.
- NEVER invent values.
- But DO infer quantity/unit when clearly present inside product names.
- Screenshots may have messy OCR. Use contextual reasoning.

IMPORTANT PATTERNS:

Examples:

"Acém Novilho Extra s/ osso 15kg"
→ quantity: 15
→ unit: "kg"

"Bacon Burger Premium Fatiado 1kg"
→ quantity: 1
→ unit: "kg"

"Peito de Frango Calibrado"
with visible quantity column "10"
→ quantity: 10
→ unit: "kg"

"Coca-Cola 33cl Pack 24"
→ quantity: 24
→ unit: "un"

"Água 25cl Pack 24"
→ quantity: 24
→ unit: "un"

"Hamburger Angus 180gr Caixa 40 un"
→ quantity: 40
→ unit: "un"

"Pão Brioche 80g 120 un"
→ quantity: 120
→ unit: "un"

If product size exists separately from purchased quantity:
- purchased quantity = pack/case/unit count
- NOT the per-item weight

Examples:
BAD:
180g

GOOD:
40 un

BAD:
33cl

GOOD:
24 un

Use these normalized units only when possible:
kg
g
L
ml
un

If quantity truly cannot be determined:
- quantity = null
- unit = null

Do not hallucinate.
              `,
            },
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: "Extract all invoice line items from this restaurant invoice image.",
                },
                {
                  type: "image_url",
                  image_url: {
                    url: imageDataUrl,
                  },
                },
              ],
            },
          ],
        }),
      }
    );

    if (!response.ok) {
      if (response.status === 429) {
        return json(
          { error: "Rate limit reached. Please try again shortly." },
          429
        );
      }

      const t = await response.text();

      console.error("OpenAI error:", response.status, t);

      return json({ error: "AI extraction failed" }, 500);
    }

    const result = await response.json();

    const content = result?.choices?.[0]?.message?.content;

    if (!content || typeof content !== "string") {
      return json({ error: "No structured output from model" }, 502);
    }

    let parsed;

    try {
      parsed = JSON.parse(content);
    } catch (e) {
      console.error("JSON parse error", e);

      return json({ error: "Invalid JSON from model" }, 502);
    }

    console.log("RAW MODEL RESPONSE", parsed);

console.log(
  "RAW MODEL ITEMS",
  JSON.stringify(parsed?.items, null, 2)
);

    let invoiceDate: string | null = null;

    if (typeof parsed?.invoice_date === "string") {
      invoiceDate = parsed.invoice_date;
    } else if (typeof parsed?.invoiceDate === "string") {
      invoiceDate = parsed.invoiceDate;
    }

    const normalizedInvoiceDate = invoiceDate;

    const normalized = {
      supplier:
        typeof parsed?.supplier === "string"
          ? parsed.supplier
          : null,

      invoice_date: normalizedInvoiceDate,

      total:
        typeof parsed?.total === "number"
          ? parsed.total
          : null,

      items: Array.isArray(parsed?.items)
        ? parsed.items.map((item: any) => ({
            name:
              typeof item?.name === "string"
                ? item.name
                : "Unknown item",

            quantity:
              typeof item?.quantity === "number"
                ? item.quantity
                : null,

            unit:
              typeof item?.unit === "string"
                ? item.unit
                : null,

            unit_price:
              typeof item?.unit_price === "number"
                ? item.unit_price
                : null,

            total:
              typeof item?.total === "number"
                ? item.total
                : null,
          }))
        : [],
    };

    console.log("NORMALIZED EXTRACTION", normalized);

    return json(normalized, 200);
  } catch (e) {
    console.error("extract-invoice error", e);

    return json(
      {
        error: e instanceof Error ? e.message : "Unknown error",
      },
      500
    );
  }
});

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}