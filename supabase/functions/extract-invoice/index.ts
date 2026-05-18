import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { imageDataUrl } = await req.json();
    if (!imageDataUrl || typeof imageDataUrl !== "string") {
      return json({ error: "imageDataUrl is required" }, 400);
    }
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) return json({ error: "LOVABLE_API_KEY not configured" }, 500);

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content:
              "You are an expert at extracting line items from restaurant supplier invoices. Read the invoice carefully and call the extract_invoice tool with the supplier name, invoice number/reference if visible, invoice date (ISO YYYY-MM-DD if visible, else null), grand total (numeric), and an array of ingredient line items. Quantities and prices must be numeric. If a value is not present, use null.",
          },
          {
            role: "user",
            content: [
              { type: "text", text: "Extract all line items from this invoice." },
              { type: "image_url", image_url: { url: imageDataUrl } },
            ],
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "extract_invoice",
              description: "Return structured invoice data.",
              parameters: {
                type: "object",
                properties: {
                  supplier: { type: "string" },
                  invoice_number: { type: ["string", "null"] },
                  invoice_date: { type: ["string", "null"] },
                  total: { type: ["number", "null"] },
                  items: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        name: { type: "string" },
                        quantity: { type: ["number", "null"] },
                        unit: { type: ["string", "null"] },
                        unit_price: { type: ["number", "null"] },
                        total: { type: ["number", "null"] },
                      },
                      required: ["name"],
                      additionalProperties: false,
                    },
                  },
                },
                required: ["supplier", "items"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "extract_invoice" } },
      }),
    });

    if (!response.ok) {
      if (response.status === 429)
        return json({ error: "Rate limit reached. Please try again shortly." }, 429);
      if (response.status === 402)
        return json(
          { error: "AI credits exhausted. Add funds in Lovable workspace settings." },
          402,
        );
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      return json({ error: "AI extraction failed" }, 500);
    }

    const result = await response.json();
    const call = result?.choices?.[0]?.message?.tool_calls?.[0];
    if (!call?.function?.arguments) {
      return json({ error: "No structured output from model" }, 502);
    }
    let parsed;
    try {
      parsed = JSON.parse(call.function.arguments);
    } catch (e) {
      console.error("JSON parse error", e);
      return json({ error: "Invalid JSON from model" }, 502);
    }
    return json(parsed, 200);
  } catch (e) {
    console.error("extract-invoice error", e);
    return json({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
