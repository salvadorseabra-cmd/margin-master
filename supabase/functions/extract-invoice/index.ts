import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { extractIssueDateFromImage } from "./invoice-date-extraction.ts";
import { resolveIssueDateFromExtraction } from "./invoice-date-resolver.ts";

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

    console.log("[invoice-ocr] stage=1 request-received", {
      hasImageDataUrl: typeof imageDataUrl === "string",
      imageDataUrlLength: typeof imageDataUrl === "string" ? imageDataUrl.length : 0,
      imageDataUrlPrefix:
        typeof imageDataUrl === "string" ? imageDataUrl.slice(0, 64) : null,
    });

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
      console.error("[invoice-ocr] stage=2 ocr-aborted", {
        reason: "OPENAI_API_KEY not configured",
      });
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

    console.log("[invoice-ocr] stage=2 ocr-started", {
      provider: "openai",
      model: "gpt-4.1",
      mode: "vision-json-two-pass",
      note: "deterministic OCR parsers (parseContinente/parsePadaria/stages.ts) not invoked",
    });

    let issueDateFromHeaderPass: string | null = null;
    try {
      issueDateFromHeaderPass = await extractIssueDateFromImage(
        imageDataUrl,
        OPENAI_API_KEY,
      );
      console.log("[invoice-ocr] stage=2a issue-date-pass", {
        issueDate: issueDateFromHeaderPass,
        strategy: "top-portion-crop",
      });
    } catch (datePassError) {
      console.error("[invoice-ocr] stage=2a issue-date-pass-failed", {
        error:
          datePassError instanceof Error
            ? datePassError.message
            : String(datePassError),
      });
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

INVOICE DATE RULES (for invoice_date field):

- invoice_date must be the document ISSUE date (DATA / Data Emissão / Data Documento).
- Prefer header issue dates over due dates (Vencimento).
- IGNORE footer compliance stamps, TALÃO DE CONTROLO dates, and certification references.
- If multiple dates are visible, return the issue date only in invoice_date.
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

    console.log("[invoice-ocr] stage=3 provider-response", {
      ok: response.ok,
      status: response.status,
      statusText: response.statusText,
    });

    if (!response.ok) {
      if (response.status === 429) {
        console.error("[invoice-ocr] stage=3 provider-error", { status: 429, reason: "rate_limit" });
        return json(
          { error: "Rate limit reached. Please try again shortly." },
          429
        );
      }

      const t = await response.text();

      console.error("[invoice-ocr] stage=3 provider-error", {
        status: response.status,
        bodyPreview: t.slice(0, 500),
      });

      return json({ error: "AI extraction failed" }, 500);
    }

    const result = await response.json();

    console.log("[invoice-ocr] stage=4 ocr-completed", {
      finishReason: result?.choices?.[0]?.finish_reason ?? null,
      usage: result?.usage ?? null,
    });

    const content = result?.choices?.[0]?.message?.content;

    if (!content || typeof content !== "string") {
      console.error("[invoice-ocr] stage=5 raw-text-missing", {
        contentType: typeof content,
        choicesLength: Array.isArray(result?.choices) ? result.choices.length : 0,
      });
      return json({ error: "No structured output from model" }, 502);
    }

    console.log("[invoice-ocr] stage=5 raw-ocr-text", {
      rawTextLength: content.length,
      rawTextPreview: content.slice(0, 1000),
    });

    let parsed;

    try {
      parsed = JSON.parse(content);
    } catch (e) {
      console.error("[invoice-ocr] stage=5 json-parse-error", {
        error: e instanceof Error ? e.message : String(e),
        contentPreview: content.slice(0, 500),
      });

      return json({ error: "Invalid JSON from model" }, 502);
    }

    console.log("[invoice-ocr] stage=6 table-detection", {
      method: "vision-model-structured-json",
      deterministicTableDetection: "skipped",
      parsedKeys: parsed && typeof parsed === "object" ? Object.keys(parsed) : [],
      rawItemsArrayLength: Array.isArray(parsed?.items) ? parsed.items.length : null,
    });

    const fallbackInvoiceDate =
      typeof parsed?.invoice_date === "string"
        ? parsed.invoice_date
        : typeof parsed?.invoiceDate === "string"
          ? parsed.invoiceDate
          : null;
    const invoiceDateFromFullPass =
      parsed && typeof parsed === "object"
        ? resolveIssueDateFromExtraction(parsed as Record<string, unknown>, fallbackInvoiceDate)
        : fallbackInvoiceDate;

    const normalizedInvoiceDate =
      issueDateFromHeaderPass ?? invoiceDateFromFullPass;

    console.log("[invoice-ocr] stage=6b date-reconciliation", {
      issueDateFromHeaderPass,
      invoiceDateFromFullPass,
      chosenInvoiceDate: normalizedInvoiceDate,
    });

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

    console.log("[invoice-ocr] stage=7 row-extraction", {
      parsedRowsCount: normalized.items.length,
      parsedRowsPreview: normalized.items.slice(0, 5),
      supplier: normalized.supplier,
      invoice_date: normalized.invoice_date,
      total: normalized.total,
    });

    console.log("[invoice-ocr] stage=8 persistence-handoff", {
      note: "invoice_items insert happens in client (src/routes/invoices.tsx runExtraction)",
      itemsToPersist: normalized.items.length,
    });

    return json(normalized, 200);
  } catch (e) {
    console.error("[invoice-ocr] extract-invoice error", e);

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