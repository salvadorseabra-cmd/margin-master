# OCR Hardening Report

**Date:** 2026-06-14  
**Scope:** `supabase/functions/extract-invoice/` only  
**Deployed to VL:** Yes (`extract-invoice` on `bjhnlrgodcqoyzddbpbd`)

---

## Problem

GPT-4.1 vision OCR ran with default sampling (no `temperature`, `top_p`, or `seed`). Investigation showed 3/3 different Anchovas brand tokens on identical full-page extractions (`.tmp/vl-ocr-rc/ocr-stability-runs.json`).

---

## Changes

### Files modified

| File | Change |
|------|--------|
| `supabase/functions/extract-invoice/invoice-date-extraction.ts` | Added shared OCR constants, `temperature: 0`, `seed: 42`, per-call instrumentation log |
| `supabase/functions/extract-invoice/index.ts` | Updated `stage=2 ocr-started` log to include `temperature` and `seed` |

### Parameters (all 4 passes via `callOpenAiJson`)

| Parameter | Before | After |
|-----------|--------|-------|
| `model` | `gpt-4.1` | `gpt-4.1` (unchanged) |
| `temperature` | not set (default ~1) | `0` |
| `top_p` | not set | not set (logged as `null`) |
| `seed` | not set | `42` |
| `response_format` | `json_object` or `json_schema` | unchanged |

### Passes affected (single shared helper)

All four OCR passes route through `callOpenAiJson`:

1. **Date specialist** — `extractIssueDateFromImage` (`invoice-date-extraction.ts`)
2. **Supplier specialist** — `extractMetadataFromImage` (`invoice-metadata-extraction.ts`)
3. **Footer totals specialist** — `extractFooterMetadataFromImage` (`invoice-footer-metadata-extraction.ts`)
4. **Table specialist** — `extractTableItemsFromImage` (`invoice-table-extraction.ts`, uses strict `json_schema`)

### Instrumentation

Each OpenAI call now logs:

```json
{
  "model": "gpt-4.1",
  "temperature": 0,
  "top_p": null,
  "seed": 42,
  "response_format": "json_object" | "json_schema"
}
```

Log prefix: `[invoice-ocr] openai-request`

### response_format compatibility

Verified locally with mocked fetch:

- `json_object` — pass ✅
- `json_schema` (strict table schema) — pass ✅

Both formats accept `temperature: 0` and `seed: 42` in the request body without error.

---

## Tests run

| Test | Result |
|------|--------|
| `deno test invoice-image-crop.test.ts` | 8/8 pass |
| `deno test invoice-monetary-binding.test.ts` | 7/7 pass |
| Mock param verification (`verify-openai-params.ts`) | pass |
| Mock json_schema verification (`verify-json-schema-params.ts`) | pass |

---

## Out of scope (unchanged)

- Matcher, alias logic, Match Lifecycle, extraction schema
- Crop geometry, prompts, parsers (`parseContinente`, `parsePadaria`, `stages.ts`)
