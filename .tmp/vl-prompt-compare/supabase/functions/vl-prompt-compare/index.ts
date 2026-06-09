import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const TABLE_ONLY_PROMPT = `
You extract ONLY invoice line items from restaurant invoice table images.

Return ONLY valid JSON with this exact structure:

{
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

- Extract ALL invoice line items visible in the table.
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
cx

If quantity truly cannot be determined:
- quantity = null
- unit = null

Do not hallucinate.
Do NOT extract supplier, total, invoice_date, or invoice_number.
`.trim();

const FULL_PAGE_PROMPT = `
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

INVOICE DATE RULES (for invoice_date field):

- invoice_date must be the document ISSUE date (DATA / Data Emissão / Data Documento).
- Prefer header issue dates over due dates (Vencimento).
- IGNORE footer compliance stamps, TALÃO DE CONTROLO dates, and certification references.
- If multiple dates are visible, return the issue date only in invoice_date.
`.trim();

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { imageDataUrl, promptVariant } = await req.json();
    if (!imageDataUrl || typeof imageDataUrl !== "string") {
      return new Response(JSON.stringify({ error: "imageDataUrl required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const variant = promptVariant === "B" ? "B" : "A";
    const systemPrompt = variant === "B" ? FULL_PAGE_PROMPT : TABLE_ONLY_PROMPT;
    const userText = variant === "B"
      ? "Extract all invoice line items from this restaurant invoice image."
      : "Extract all invoice line items from this restaurant invoice table image.";

    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    if (!OPENAI_API_KEY) {
      return new Response(JSON.stringify({ error: "OPENAI_API_KEY not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4.1",
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: [
              { type: "text", text: userText },
              { type: "image_url", image_url: { url: imageDataUrl } },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      const t = await response.text();
      return new Response(JSON.stringify({ error: t.slice(0, 500) }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const result = await response.json();
    const content = result?.choices?.[0]?.message?.content;
    const parsed = JSON.parse(content);

    return new Response(
      JSON.stringify({
        promptVariant: variant,
        model: "gpt-4.1",
        recrop: false,
        items: parsed.items ?? [],
        supplier: parsed.supplier ?? null,
        invoice_date: parsed.invoice_date ?? null,
        total: parsed.total ?? null,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : String(e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
