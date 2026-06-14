# OCR Provider Audit

**Generated:** 2026-06-14  
**Mode:** READ-ONLY investigation  
**Scope:** `supabase/functions/extract-invoice/` and related extraction modules

---

## Provider Summary

| Setting | Value |
|---------|-------|
| **OCR provider** | OpenAI Chat Completions API |
| **Endpoint** | `https://api.openai.com/v1/chat/completions` |
| **Model** | `gpt-4.1` (all 4 passes) |
| **Mode** | Vision JSON — four specialist passes |
| **temperature** | **Not set** (model defaults apply → non-deterministic) |
| **top_p** | **Not set** |
| **seed** | **Not set** |
| **response_format** | `json_object` or strict `json_schema` (table pass) |
| **Retry logic** | **None** in extract-invoice functions |
| **Caching** | **None** — no prompt cache, no result cache |
| **Can extraction vary between runs?** | **YES** — stochastic model + no sampling controls |

---

## Four-Pass Architecture

Logged at extraction start:

```62:68:supabase/functions/extract-invoice/index.ts
    console.log("[invoice-ocr] stage=2 ocr-started", {
      provider: "openai",
      model: "gpt-4.1",
      mode: "vision-json-four-pass",
      passes: ["date-specialist", "supplier-specialist", "footer-totals-specialist", "table-specialist"],
      note: "deterministic OCR parsers (parseContinente/parsePadaria/stages.ts) not invoked",
    });
```

| Pass | File | Input | Output |
|------|------|-------|--------|
| Date specialist | `invoice-date-extraction.ts` | Header crop | `{ invoice_date, dates[] }` |
| Supplier specialist | `invoice-metadata-extraction.ts` | Full/header image | `{ supplier_name }` |
| Footer totals | `invoice-footer-metadata-extraction.ts` | Footer crop | `{ total, ... }` |
| Table specialist | `invoice-table-extraction.ts` | Table crop | `{ items[] }` with line names |

Anchovas brand token is extracted in the **table specialist** pass.

---

## API Call Shape

All passes share `callOpenAiJson` — no sampling parameters:

```48:64:supabase/functions/extract-invoice/invoice-date-extraction.ts
export async function callOpenAiJson(
  apiKey: string,
  messages: OpenAiMessage[],
  responseFormat: OpenAiResponseFormat = { type: "json_object" },
): Promise<Record<string, unknown>> {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4.1",
      response_format: responseFormat,
      messages,
    }),
  });
```

**Missing determinism controls:**

- No `temperature: 0`
- No `top_p` constraint
- No `seed` parameter
- No retry with fixed seed on variance

---

## Codebase Search Results

Searched `supabase/functions/extract-invoice/**` for: `temperature`, `top_p`, `seed`, `retry`, `cache`.

| Term | Found in extract-invoice? |
|------|---------------------------|
| `temperature` | ❌ Not set on any API call |
| `top_p` | ❌ Not set |
| `seed` | ❌ Not set |
| `retry` / `attempt` | ❌ No retry wrapper |
| `cache` | ❌ No OCR result cache |

Searched `src/**` for extraction cache patterns (`cache.*extract`, `previous.*extract`, `stored.*ocr`) — **no matches**.

---

## Alternative Parsers (Not Active)

The codebase contains deterministic OCR parsers that are **not invoked** in the live pipeline:

- `parseContinente`
- `parsePadaria`
- `stages.ts` pipeline

These could provide deterministic extraction for known supplier formats but are bypassed in favor of GPT-4.1 vision.

---

## Stability Run Observation

From `.tmp/vl-ocr-rc/ocr-stability-runs.json`:

| Crop mode | Anchovas stability (3 runs each) |
|-----------|----------------------------------|
| `full` | 3 different strings (`Alfonsica Ll`, `Alfonsoita LI`, `Alfonsica Li`) |
| `table-full` | 3 variants (`Alconfirosa L4`, `Lt`, `L`) |
| `row-anchovas` | **Identical** (`Alconfirosa LT 495 g`) — 3/3 |
| `row-chocolate-header` | 3 variants (`Alconfiosta`, `Alconfiosa`, `Alconfi osa`) |

**Interpretation:** Crop geometry and surrounding context drive instability. Tight row crops can be stable; full-page / table crops vary on every run even with the same underlying PDF.

---

## Conclusion

Extraction is **inherently non-deterministic** under current configuration. GPT-4.1 vision with default sampling produces different brand-token spellings on identical source images. No mitigation (temperature=0, seed, cache, deterministic parser fallback) is in place.
