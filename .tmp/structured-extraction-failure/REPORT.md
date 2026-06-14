# Phase 2 Structured Extraction Failure — Investigation Report

Generated: 2026-06-12  
Workspace: `/Users/salvadorseabra1/margin-master`  
Mode: **READ-ONLY** — no code changes

---

## Executive Summary

Phase 2 added structured monetary fields to the **prompt text** but **not to the OpenAI API contract**. GPT returns legacy `unit_price`/`total` because that output is still explicitly permitted and never rejected. The Phase 3 binder receives null structured fields and no-ops.

| Question | Answer |
|----------|--------|
| Root cause | **Unenforced dual schema** — prompt documents structured fields; API sends `json_object` only |
| Classification | **B) Schema allows legacy-only** + **D) Validation schema issue** (+ C contributing) |
| Confidence | **92%** |
| Smallest fix | Pass-C `response_format: json_schema` strict, omit `unit_price`/`total` |

---

## 1. Pass C Schema Definition (in code)

**File:** `invoice-table-extraction.ts` — `TABLE_EXTRACTION_SYSTEM_PROMPT`

The "Phase 2 schema" is a **markdown JSON example** inside the system prompt:

```json
{
  "items": [{
    "name": string,
    "quantity": number | null,
    "unit": string | null,
    "gross_unit_price": number | null,
    "discount_pct": number | null,
    "line_total_net": number | null,
    "unit_price": number | null,
    "total": number | null
  }]
}
```

- **All fields optional** (every field typed `| null`, none marked required)
- **Legacy fields retained** alongside structured fields
- **Escape hatch** (line 52): *"If a row has no discount column… copy unit_price from the unit price column instead of gross_unit_price"*

---

## 2. OpenAI JSON Schema Actually Sent

**File:** `invoice-date-extraction.ts` — `callOpenAiJson`

```typescript
response_format: { type: "json_object" }
```

| Property | Value |
|----------|-------|
| `json_schema` | **Not sent** |
| `strict` | **Not sent** |
| Property enforcement | **None** |
| Type validation | **None** |

`json_object` only guarantees the response parses as a JSON object. The model may omit any property, use legacy keys only, or mix shapes — all valid.

**No schema transform** exists between GPT response and `JSON.parse`. Nothing strips structured fields before validation because **no validation runs**.

---

## 3. Required vs Optional

| Layer | Structured fields required? | Legacy fields allowed? |
|-------|------------------------------|------------------------|
| Prompt text | Instructed, not required | Yes — explicit fallback |
| OpenAI API | No | Yes |
| `parseMonetaryLineItems` | No (null if absent) | Yes |
| `bindMonetaryColumns` | Needed for binding | Legacy passes through |

---

## 4. Prompt Analysis — Structured vs Legacy

**User message** (single sentence): *"Copy quantity, gross_unit_price, discount_pct, and line_total_net…"*

**System prompt** (6800 chars):
- 23 mentions of structured field names
- 30 mentions of `unit_price`/`total`
- **1** worked example with structured-only output (Pomodor negative example)
- **7** worked examples using `unit_price`/`total`

**Contradictions:**

1. *"leave unit_price/total null when structured populated"* vs *"copy unit_price from unit price column"*
2. *"When quantity is 1, unit_price usually equals line total"* — teaches VALOR→unit_price bleed (exact v22 Pomodor failure: 22.05/22.05)
3. Pre-Phase-2 (`65452a9` parent) trained model on `unit_price`/`total` only; Phase 2 added prompt fields without API enforcement

---

## 5. Expected vs Actual (Pomodor, v22)

| Field | Expected (Phase 2) | Actual (GPT) |
|-------|-------------------|--------------|
| `gross_unit_price` | 27.56 | absent → null |
| `discount_pct` | 20 | absent → null |
| `line_total_net` | 22.05 | absent → null |
| `unit_price` | null | **22.05** |
| `total` | null | **22.05** |

Actual output is **valid per current contract** — legacy path fully satisfies prompt + API.

---

## 6. Classification

| Option | Applies? | Role |
|--------|----------|------|
| **A) GPT ignoring optional fields** | Symptom only | No fields are required — model isn't ignoring requirements |
| **B) Schema allows legacy-only output** | **YES — primary** | Dual schema + escape hatch + legacy examples |
| **C) Prompt ambiguity** | **YES — contributing** | Example corpus contradicts structured-first instruction |
| **D) Validation schema issue** | **YES — primary** | No `json_schema`; Phase 2 schema is prompt-only |

**Answer: B + D** (with C as amplifier). Not A as root cause.

---

## 7. Pipeline Position

```
[FAILURE HERE] callOpenAiJson — json_object only, no property enforcement
       ↓
JSON.parse — preserves whatever keys GPT sends
       ↓
parseMonetaryLineItems — null for missing structured keys ✓
       ↓
bindMonetaryColumns — no-op when structured null ✓
       ↓
monetaryToInvoiceLineItem — strips structured (API boundary, separate issue)
```

Prior trace (`.tmp/structured-monetary-trace/`) confirmed downstream code is correct. Failure is **before** `parseMonetaryLineItems`.

---

## 8. Recommended Minimal Fix (NO implementation)

### Smallest effective change

In `extractTableItemsFromImage`, use Pass-C-specific:

```typescript
response_format: {
  type: "json_schema",
  json_schema: {
    name: "invoice_line_items",
    strict: true,
    schema: {
      type: "object",
      properties: {
        items: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              quantity: { type: ["number", "null"] },
              unit: { type: ["string", "null"] },
              gross_unit_price: { type: ["number", "null"] },
              discount_pct: { type: ["number", "null"] },
              line_total_net: { type: ["number", "null"] }
            },
            required: ["name", "quantity", "unit", "gross_unit_price", "discount_pct", "line_total_net"],
            additionalProperties: false
          }
        }
      },
      required: ["items"],
      additionalProperties: false
    }
  }
}
```

**Key:** Omit `unit_price` and `total` from properties. `additionalProperties: false` blocks legacy keys.

### Implementation scope

| Change | File | Lines |
|--------|------|-------|
| Add optional `responseFormat` to `callOpenAiJson` | `invoice-date-extraction.ts` | ~10 |
| Pass strict schema from Pass C | `invoice-table-extraction.ts` | ~30 |

### Not sufficient alone

Prompt-only edits (remove legacy examples, drop escape hatch) without `json_schema` — model already has structured instructions and still emits legacy.

---

## 9. Files & Functions

| File | Function | Responsibility |
|------|----------|----------------|
| `invoice-date-extraction.ts` | `callOpenAiJson` | API call — **no schema enforcement** |
| `invoice-table-extraction.ts` | `TABLE_EXTRACTION_SYSTEM_PROMPT` | Dual schema documentation |
| `invoice-table-extraction.ts` | `extractTableItemsFromImage` | Orchestrates Pass C |
| `invoice-monetary-binding.ts` | `parseMonetaryLineItems` | Preserves fields if present (not at fault) |

---

## 10. Artifacts

| File | Contents |
|------|----------|
| `schema-analysis.json` | Prompt vs API schema comparison |
| `prompt-analysis.json` | Example balance, contradictions |
| `root-cause.json` | Verdict, confidence, minimal fix |
| `REPORT.md` | This report |

---

## Confidence: 92%

- **100%** on code facts (no `json_schema`, dual prompt schema, legacy escape hatch)
- **92%** overall (8% reserved: no live raw GPT log on v22 to prove omission vs key rename)
