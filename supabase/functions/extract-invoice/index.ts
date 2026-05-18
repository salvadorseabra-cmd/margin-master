import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const LOG_PREFIX = "[invoice-extract]";
const DEBUG_INVOICE_EXTRACTION = Deno.env.get("INVOICE_EXTRACT_DEBUG") === "true";

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
              "You are an expert at extracting line items from restaurant supplier invoices. Read the invoice carefully and call the extract_invoice tool with the supplier name, invoice number/reference if visible, invoice date (ISO YYYY-MM-DD if visible, else null), grand total (numeric), and an array of ingredient line items. Only include product/table rows as items; never include supplier headers, addresses, tax summaries, totals, customer details, or footer lines as items. Split each product row into name, quantity, unit, unit price, and total when those fields are visible. VAT percentages must not be part of the item name. Quantities and prices must be numeric. If a value is not present, use null.",
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
    parsed = normalizeExtractedInvoice(parsed);
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

type ExtractedInvoice = {
  supplier?: unknown;
  invoice_number?: unknown;
  invoice_date?: unknown;
  total?: unknown;
  items?: unknown;
};

type ExtractedItem = {
  name?: unknown;
  quantity?: unknown;
  unit?: unknown;
  unit_price?: unknown;
  total?: unknown;
};

type NormalizedItem = {
  name: string;
  quantity: number | null;
  unit: string | null;
  unit_price: number | null;
  total: number | null;
};

type RejectedLine = {
  line: string;
  reason: string;
};

type ParsedCollapsedRow = {
  name: string;
  quantity: number;
  unit: string;
  unit_price: number | null;
  total: number | null;
};

const NUMBER_TOKEN = String.raw`\d{1,3}(?:[.\s]\d{3})*(?:,\d+)?|\d{1,3}(?:,\d{3})*(?:\.\d+)?|\d+[.,]\d+|\d+`;
const UNIT_TOKEN = String.raw`un|uni|und|unds|unid|unids|unidade|unidades|kg|g|gr|l|lt|ml|cl|cx|caixa|caixas|dz|pack|packs|pc|pcs`;
const COLLAPSED_ROW_RE = new RegExp(
  String.raw`^(?<name>.+)\s+(?<quantity>${NUMBER_TOKEN})\s*(?<unit>${UNIT_TOKEN})\b\s+(?<tail>.+)$`,
  "iu",
);
const MONEY_TOKEN_RE = new RegExp(
  String.raw`(?:€|EUR)?\s*(?<amount>${NUMBER_TOKEN})\s*(?:€|EUR)?`,
  "giu",
);
const VAT_TOKEN_RE = /\b\d{1,2}(?:[,.]\d+)?\s*%/u;
const HEADER_FOOTER_RE =
  /\b(?:codigo\s+postal|cod\.?\s+postal|nif|nipc|contribuinte|telefone|telemovel|email|e-mail|www|capital\s+social|matricula|conservatoria|certidao|pagina|page|fatura|factura|invoice|guia|encomenda|cliente|fornecedor|morada|local\s+de\s+descarga|resumo|subtotal|total|iva|vat|troco|mbway|multibanco)\b/iu;
const ADDRESS_RE =
  /(^|\s)(?:travessa|trav\.?|rua|r\.|avenida|av\.?|estrada|largo|praceta|praca|rotunda|urbanizacao|zona\s+industrial|parque\s+industrial|edificio|lote|loja|andar|sala|apartado|cod\.?\s+postal|cp)\b/iu;
const PAYMENT_METADATA_RE =
  /\b(?:iban|swift|bic|sepa|referencia\s+mb|ref\.?\s+mb|entidade|pagamento|transferencia|multibanco|mb\s*way|cartao|visa|mastercard)\b/iu;
const TAX_SUMMARY_RE =
  /\b(?:base\s+incidencia|incidencia|valor\s+iva|taxa\s+iva|iva\s+dedutivel|total\s+liquido|total\s+mercadoria|total\s+documento|valor\s+a\s+pagar)\b/iu;
const BUSINESS_METADATA_RE =
  /\b(?:lda|l\.?da|unipessoal|sa|s\.?a\.?|sociedade|comercial|distribuicao|armazem|sede|delegacao|gerencia|gerente|eng\.?|engenheiro|dr\.?|dra\.?)\b/iu;
const PRODUCT_CODE_RE = /^(?:[A-Z]{1,4}\d{3,8}|\d{2,8})\s+/iu;

function normalizeExtractedInvoice(value: ExtractedInvoice): ExtractedInvoice {
  const items = Array.isArray(value?.items) ? value.items : [];
  const candidates = items.map(itemToRawLine).filter((line): line is string => Boolean(line));
  const rejectedLines: RejectedLine[] = [];
  const normalizedItems: NormalizedItem[] = [];
  const fieldExtractions: unknown[] = [];

  debugInvoice("ocr_raw_lines", {
    note: "Current ingestion receives structured model output, not a separate OCR text layer.",
    lines: candidates,
  });

  for (const item of items) {
    const normalized = normalizeExtractedItem(item as ExtractedItem);
    if (!normalized) continue;

    fieldExtractions.push({
      raw: itemToRawLine(item),
      parsed: normalized,
    });

    const rejectReason = getNonIngredientReason(normalized.name, normalized);
    if (rejectReason) {
      rejectedLines.push({ line: normalized.name, reason: rejectReason });
      continue;
    }

    normalizedItems.push(normalized);
  }

  debugInvoice("detected_table_regions", {
    candidateRows: candidates.length,
    acceptedRows: normalizedItems.length,
    rejectedRows: rejectedLines.length,
  });
  debugInvoice("field_extraction_results", fieldExtractions);
  debugInvoice("parsed_ingredient_candidates", normalizedItems);
  debugInvoice("rejected_header_footer_lines", rejectedLines);

  return {
    ...value,
    items: normalizedItems,
  };
}

function normalizeExtractedItem(item: ExtractedItem): NormalizedItem | null {
  const rawName = stringValue(item.name).replace(/\s+/g, " ").trim();
  if (!rawName) return null;

  const collapsed = parseCollapsedInvoiceRow(rawName);
  if (collapsed) {
    return {
      name: collapsed.name,
      quantity: collapsed.quantity,
      unit: collapsed.unit,
      unit_price: collapsed.unit_price,
      total: numberValue(item.total) ?? collapsed.total,
    };
  }

  return {
    name: cleanIngredientName(rawName),
    quantity: numberValue(item.quantity),
    unit: normalizeUnit(stringValue(item.unit)) ?? null,
    unit_price: numberValue(item.unit_price),
    total: numberValue(item.total),
  };
}

function parseCollapsedInvoiceRow(line: string): ParsedCollapsedRow | null {
  const withoutVatTail = line.replace(/\s+\d{1,2}(?:[,.]\d+)?\s*%\s*$/u, "").trim();
  const match = withoutVatTail.match(COLLAPSED_ROW_RE);
  if (!match?.groups?.name || !match.groups.quantity || !match.groups.unit || !match.groups.tail) {
    return null;
  }

  const quantity = parseEuropeanNumber(match.groups.quantity);
  if (quantity == null || quantity <= 0) return null;

  const unit = normalizeUnit(match.groups.unit);
  if (!unit) return null;

  const tail = match.groups.tail;
  const amounts = extractMoneyValues(tail);
  if (amounts.length === 0) return null;

  const name = cleanIngredientName(match.groups.name);
  if (!name || !/[A-Za-zÀ-ÿ]/u.test(name) || getNonIngredientReason(name)) return null;

  return {
    name,
    quantity,
    unit,
    unit_price: amounts[0] ?? null,
    total: amounts.length > 1 ? amounts[amounts.length - 1] : null,
  };
}

function extractMoneyValues(tail: string): number[] {
  const values: number[] = [];
  for (const match of tail.matchAll(MONEY_TOKEN_RE)) {
    const amount = match.groups?.amount;
    if (!amount) continue;

    const tokenEnd = match.index + match[0].length;
    const nearby = tail.slice(match.index, Math.min(tail.length, tokenEnd + 2));
    if (VAT_TOKEN_RE.test(nearby)) continue;

    const value = parseEuropeanNumber(amount);
    if (value != null && value >= 0) values.push(value);
  }
  return values;
}

function cleanIngredientName(name: string): string {
  return name.replace(PRODUCT_CODE_RE, "").replace(/\s+/g, " ").trim().slice(0, 200);
}

function getNonIngredientReason(line: string, item?: NormalizedItem): string | null {
  const trimmed = line.trim();
  if (!trimmed) return "empty";
  if (!/[A-Za-zÀ-ÿ]/u.test(trimmed)) return "no_letters";

  const normalized = normalizeAccents(trimmed);
  const hasParsedRowFields = itemHasParsedRowFields(item);
  const hasPriceSignal = /\d+[.,]\d{1,4}\s*(?:€|EUR)?/iu.test(trimmed);
  const hasQuantityUnitSignal = new RegExp(
    String.raw`\b${NUMBER_TOKEN}\s*(?:${UNIT_TOKEN})\b`,
    "iu",
  ).test(trimmed);

  if (ADDRESS_RE.test(normalized) && !hasParsedRowFields) return "address_keyword";
  if (PAYMENT_METADATA_RE.test(normalized)) return "payment_metadata";
  if (TAX_SUMMARY_RE.test(normalized)) return "tax_summary";
  if (BUSINESS_METADATA_RE.test(normalized) && !hasParsedRowFields) return "business_metadata";
  if (HEADER_FOOTER_RE.test(normalized) && !hasParsedRowFields) return "header_footer_keyword";

  const mostlyPunctuationAddress = /[,;:]$/u.test(trimmed) && trimmed.split(/\s+/).length <= 8;
  if (mostlyPunctuationAddress && !hasPriceSignal && !hasQuantityUnitSignal) {
    return "address_fragment";
  }

  return null;
}

function itemHasParsedRowFields(item?: NormalizedItem): boolean {
  if (!item) return false;
  return (
    item.quantity != null || item.unit != null || item.unit_price != null || item.total != null
  );
}

function parseEuropeanNumber(raw: string): number | null {
  let value = raw
    .replace(/\u20AC/g, " ")
    .replace(/€/g, " ")
    .replace(/EUR/gi, " ")
    .replace(/\s+/g, "")
    .trim();
  if (!value) return null;

  const negative = /^[-–—]/u.test(value);
  value = value.replace(/^[-–—]/u, "").replace(/[^\d.,]/g, "");
  if (!value) return null;

  const lastComma = value.lastIndexOf(",");
  const lastDot = value.lastIndexOf(".");
  let normalized: string;
  if (lastComma > lastDot) {
    normalized = value.replace(/\./g, "").replace(",", ".");
  } else if (lastDot > lastComma) {
    normalized = value.replace(/,/g, "");
  } else if (lastComma !== -1) {
    normalized = value.replace(",", ".");
  } else {
    normalized = value;
  }

  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) return null;
  return negative ? -parsed : parsed;
}

function normalizeUnit(raw: string): string | null {
  const unit = raw.trim().toLowerCase();
  if (!unit) return null;
  if (["uni", "und", "unds", "unid", "unids", "unidade", "unidades", "pc", "pcs"].includes(unit)) {
    return "un";
  }
  if (unit === "lt") return "L";
  if (unit === "gr") return "g";
  return unit === "l" ? "L" : unit;
}

function numberValue(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") return parseEuropeanNumber(value);
  return null;
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function itemToRawLine(item: unknown): string | null {
  if (!item || typeof item !== "object") return null;
  const candidate = item as ExtractedItem;
  const parts = [
    stringValue(candidate.name),
    candidate.quantity == null ? "" : String(candidate.quantity),
    stringValue(candidate.unit),
    candidate.unit_price == null ? "" : String(candidate.unit_price),
    candidate.total == null ? "" : String(candidate.total),
  ].filter(Boolean);
  return parts.length ? parts.join(" ") : null;
}

function normalizeAccents(value: string): string {
  return value.normalize("NFD").replace(/\p{M}/gu, "");
}

function debugInvoice(stage: string, payload: unknown) {
  if (!DEBUG_INVOICE_EXTRACTION) return;
  console.log(`${LOG_PREFIX} ${stage}=${JSON.stringify(payload)}`);
}
