# Structured Monetary Fields — Pipeline Trace Investigation

Generated: 2026-06-12  
Workspace: `/Users/salvadorseabra1/margin-master`  
Mode: **READ-ONLY**

---

## Executive Summary

Structured fields are **not reaching the Phase 3 binder in a usable form** because **GPT Pass C does not populate them** in the raw JSON response. The pipeline preserves and uses structured fields correctly when they are present (verified by local mock trace). They are **intentionally stripped** from the HTTP API response at `monetaryToInvoiceLineItem`.

| Question | Answer |
|----------|--------|
| First point of loss (binder) | **Stage 1 — GPT raw JSON** |
| Responsible function | `callOpenAiJson` / GPT model output (not code bug) |
| Classification | **A) Prompt/GPT extraction failure** |
| API shows null structured | **Also D) Response serialization** (by design) |
| Confidence | **88%** |

---

## Pipeline trace (code path)

```
callOpenAiJson (GPT Pass C)
  → parseMonetaryLineItems(parsed.items)     [invoice-monetary-binding.ts]
  → bindMonetaryColumns(...)                [invoice-monetary-binding.ts]
  → monetaryToInvoiceLineItem(...)          [STRIPS structured fields]
  → reconcileLineItemAmounts(...)           [invoice-line-reconcile.ts]
  → finalizeExtractedLineItems (index.ts)
  → json({ items }) HTTP response
```

---

## Stage-by-stage analysis

### Stage 1: GPT raw JSON (`callOpenAiJson`)

**File:** `invoice-date-extraction.ts` — `JSON.parse(content)`  
**Prompt:** `TABLE_EXTRACTION_SYSTEM_PROMPT` in `invoice-table-extraction.ts`

- Schema **does request** `gross_unit_price`, `discount_pct`, `line_total_net`
- Pomodor negative example explicitly shows structured output with `unit_price: null, total: null`
- User message: *"Copy quantity, gross_unit_price, discount_pct, and line_total_net"*

**Live evidence (v22, inferred):** GPT returns legacy shape only:

```json
{
  "name": "POMODORI PELATI (CX 2,5KG*6)",
  "quantity": 1,
  "unit": "uni",
  "unit_price": 22.05,
  "total": 22.05
}
```

No `gross_unit_price`, `discount_pct`, or `line_total_net` keys.  
**No server-side logging** of raw GPT JSON exists — inference from v22 output matching mock scenario B.

**Prior cache** (`.tmp/persistence-audit/pass-c-raw/...`) also shows legacy-only `unit_price`/`total` (pre-Phase-2 full-page extract).

---

### Stage 2: `parseMonetaryLineItems`

**File:** `invoice-monetary-binding.ts`

- Maps `gross_unit_price`, `discount_pct`, `line_total_net` via `normalizeNumberField`
- **Does not drop** fields present in GPT JSON
- Missing keys → `null` (not an error)

**Mock trace A:** structured fields **preserved** through parse.  
**Mock trace B (v22):** all structured fields `null` because GPT omitted them.

---

### Stage 3: `bindMonetaryColumns`

**File:** `invoice-monetary-binding.ts`

- `applyStructuredBinding` early-returns when `gross_unit_price`, `discount_pct`, and `line_total_net` are all null
- Rule B / Rule E require structured fields or matching patterns

**Mock trace B:** **no-op** — output identical to input.  
**Mock trace D:** Rule B fixes unit €20 → €22.05 when structured fields present.

---

### Stage 4: `monetaryToInvoiceLineItem` ⚠️ API strip

**File:** `invoice-monetary-binding.ts` lines 195–203

```typescript
return {
  name, quantity, unit, unit_price, total
  // gross_unit_price, discount_pct, line_total_net NOT included
};
```

**This is the first point structured fields disappear from the object** — but only for downstream/API. Binder has already run.

`InvoiceLineItem` type (`invoice-line-reconcile.ts`) has no structured fields.

---

### Stage 5–6: Reconcile

**File:** `invoice-line-reconcile.ts`

- `reconcileLineItemAmounts`: only fills missing `unit_price` or `total`; does not touch structured fields (already stripped)
- `reconcileLineItemsToNetSubtotal`: OCR gap fix on sub-€10 lines only

**Not responsible** for structured field loss.

---

### Stage 7: API response (`index.ts`)

Returns `reconciledItems` as JSON — legacy 5-field shape only.

---

## Local mock trace results

| Scenario | GPT input | Binder effect | Final API fields |
|----------|-----------|---------------|------------------|
| **A** Structured correct | gross 27.56, disc 20%, net 22.05 | Derives unit 22.05 | unit 22.05, total 22.05 |
| **B** Legacy only (v22) | unit 22.05, total 22.05 | **No-op** | unit 22.05, total 22.05 |
| **C** Structured + VALOR bleed | structured + unit=total=22.05 | Re-derives from gross/disc | unit 22.05, total 22.05 |
| **D** DESC bleed + structured | unit 20, gross 27.56, disc 20% | **Rule B** → unit 22.05 | unit 22.05, total 40 |

**Conclusion:** Pipeline works when GPT supplies structured fields. v22 live output matches scenario **B** exactly.

---

## Classification answer

| Option | Responsible? | Evidence |
|--------|--------------|----------|
| **A) Prompt/GPT extraction** | **YES (primary)** | GPT omits structured keys; prompt requests them but model returns legacy |
| B) JSON parsing | NO | `JSON.parse` preserves all keys |
| C) normalizeItems mapping | N/A | Replaced by `parseMonetaryLineItems`; preserves fields |
| **D) Response serialization** | **YES (secondary)** | `monetaryToInvoiceLineItem` + `InvoiceLineItem` type strip for API |

---

## Why v22 Pomodor unchanged from v21

1. GPT returns `unit_price=22.05, total=22.05` (VALOR copied to both)
2. No `gross_unit_price` / `discount_pct` / `line_total_net` in raw JSON
3. Binder `applyStructuredBinding` no-op
4. Rule B/E do not trigger (no discount_pct to compare; no neighbour mismatch pattern)
5. Output passes through unchanged

Phase 3 code is active but **starved of structured input**.

---

## Recommendations (investigation only — no code changes)

1. **Add temporary Pass C raw logging** (`console.log` parsed.items pre-binder) to confirm GPT output on VL
2. **Expose structured fields in debug API mode** for validation
3. **Phase 4 row retry** with narrowed monetary prompt when structured fields absent
4. Consider **JSON schema enforcement** in OpenAI `response_format` with explicit property requirements (if supported for vision)

---

## Artifacts

| File | Contents |
|------|----------|
| `pipeline-trace.json` | 4 mock scenarios, 5 stages each |
| `pomodor-stage-trace.json` | Stage metadata + verdict |
| `trace-pipeline.ts` | Reproducible local trace script |
| `REPORT.md` | This report |

---

## Confidence: 88%

- **100%** code path traced; mock traces confirm parse/bind/strip behavior
- **88%** (not 100%) on live GPT omission — inferred from output shape, no raw GPT log on v22
