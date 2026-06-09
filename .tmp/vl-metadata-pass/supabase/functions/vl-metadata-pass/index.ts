import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { Image } from "https://deno.land/x/imagescript@1.3.0/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DATA_URL_PATTERN = /^data:([^;]+);base64,(.+)$/;

async function cropTopPortion(dataUrl: string, topFraction = 0.83): Promise<string> {
  const match = dataUrl.match(DATA_URL_PATTERN);
  if (!match) throw new Error("imageDataUrl must be a base64 data URL");
  const bytes = Uint8Array.from(atob(match[2]), (c) => c.charCodeAt(0));
  const image = await Image.decode(bytes);
  const cropHeight = Math.max(1, Math.round(image.height * topFraction));
  const cropped = image.crop(0, 0, image.width, cropHeight);
  const encoded = await cropped.encode();
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < encoded.length; i += chunk) {
    binary += String.fromCharCode(...encoded.subarray(i, i + chunk));
  }
  return `data:image/png;base64,${btoa(binary)}`;
}

const METADATA_SYSTEM_PROMPT = `
You extract invoice HEADER METADATA from restaurant invoice images.

Return ONLY valid JSON with this exact structure:

{
  "supplier": string | null,
  "invoice_date": string | null,
  "invoice_number": string | null,
  "total": number | null
}

CRITICAL RULES:

- supplier: legal supplier / issuer name on the document (company name near logo).
- invoice_date: document ISSUE date only (labels: DATA, Data Emissão, Data Documento, Invoice Date).
- Prefer header issue dates over due dates (Vencimento, Due Date).
- IGNORE footer compliance stamps, TALÃO DE CONTROLO dates, certification dates, transport timestamps.
- invoice_number: document number (e.g. DOC. NÚMERO, Invoice No, Fatura Nº).
- total: document amount to pay (VALOR A PAGAR / Total / Amount Due) — numeric only, no currency symbol.
- NEVER invent values. If not visible, return null.
- Return invoice_date exactly as printed (DD/MM/YYYY preferred) or YYYY-MM-DD.
`.trim();

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { imageDataUrl } = await req.json();
    if (!imageDataUrl || typeof imageDataUrl !== "string") {
      return new Response(JSON.stringify({ error: "imageDataUrl required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    if (!OPENAI_API_KEY) {
      return new Response(JSON.stringify({ error: "OPENAI_API_KEY not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const croppedDataUrl = await cropTopPortion(imageDataUrl, 0.83);

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
          { role: "system", content: METADATA_SYSTEM_PROMPT },
          {
            role: "user",
            content: [
              {
                type: "text",
                text:
                  "Extract supplier, invoice issue date, invoice number, and total from this invoice image. Ignore footer compliance dates.",
              },
              { type: "image_url", image_url: { url: croppedDataUrl } },
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
        crop: "top-83pct",
        model: "gpt-4.1",
        ...parsed,
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
