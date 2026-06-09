import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { extractIssueDateFromImage } from "./invoice-date-extraction.ts";
import { extractMetadataFromImage } from "./invoice-metadata-extraction.ts";
import {
  extractTableItemsFromImage,
  finalizeExtractedLineItems,
} from "./invoice-table-extraction.ts";

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
      mode: "vision-json-three-pass",
      passes: ["date-specialist", "metadata-specialist", "table-specialist"],
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

    let metadataFromPass: {
      supplier: string | null;
      total: number | null;
      net_subtotal: number | null;
    } = {
      supplier: null,
      total: null,
      net_subtotal: null,
    };
    try {
      metadataFromPass = await extractMetadataFromImage(
        imageDataUrl,
        OPENAI_API_KEY,
      );
      console.log("[invoice-ocr] stage=2b metadata-pass", {
        supplier: metadataFromPass.supplier,
        total: metadataFromPass.total,
        net_subtotal: metadataFromPass.net_subtotal,
        strategy: "top-83pct-crop",
      });
    } catch (metadataPassError) {
      console.error("[invoice-ocr] stage=2b metadata-pass-failed", {
        error:
          metadataPassError instanceof Error
            ? metadataPassError.message
            : String(metadataPassError),
      });
    }

    let tableFromPass: Awaited<ReturnType<typeof extractTableItemsFromImage>> = {
      items: [],
      tableCrop: { bounds: null, fallbackUsed: true },
    };
    try {
      tableFromPass = await extractTableItemsFromImage(
        imageDataUrl,
        OPENAI_API_KEY,
      );
      console.log("[invoice-ocr] stage=2c table-pass", {
        itemCount: tableFromPass.items.length,
        tableCrop: tableFromPass.tableCrop,
      });
    } catch (tablePassError) {
      console.error("[invoice-ocr] stage=2c table-pass-failed", {
        error:
          tablePassError instanceof Error
            ? tablePassError.message
            : String(tablePassError),
      });
    }

    console.log("[invoice-ocr] stage=6 table-detection", {
      method: "grey-header-band-plus-totals-edge",
      tableCropBounds: tableFromPass.tableCrop.bounds,
      tableCropFallbackUsed: tableFromPass.tableCrop.fallbackUsed,
      parsedRowsCount: tableFromPass.items.length,
    });

    console.log("[invoice-ocr] stage=6b date-reconciliation", {
      issueDateFromHeaderPass,
      chosenInvoiceDate: issueDateFromHeaderPass,
      note: "invoice_date owned by Pass A only; no fallback from metadata/table passes",
    });

    const reconciledItems = finalizeExtractedLineItems(
      tableFromPass.items,
      metadataFromPass.net_subtotal,
    );
    if (reconciledItems !== tableFromPass.items) {
      console.log("[invoice-ocr] stage=6c net-subtotal-reconcile", {
        netSubtotal: metadataFromPass.net_subtotal,
        beforeSum: tableFromPass.items.reduce((s, i) => s + (i.total ?? 0), 0),
        afterSum: reconciledItems.reduce((s, i) => s + (i.total ?? 0), 0),
      });
    }

    const normalized = {
      supplier: metadataFromPass.supplier,
      invoice_date: issueDateFromHeaderPass,
      total: metadataFromPass.total,
      items: reconciledItems,
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
