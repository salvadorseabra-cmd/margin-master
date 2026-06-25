# Aceto Mathematical Root Cause Investigation

**Validation Lab:** `bjhnlrgodcqoyzddbpbd`  
**Invoice:** Mammafiore Portugal · `36c99d19-6f9f-413f-8c2d-ae3526291a2d`  
**Invoice item:** `1ccf0bd0-12ef-4823-b504-3833df0899c7`  
**Mode:** READ-ONLY — no code changes  
**Date:** 2026-06-25

---

## Executive summary

The `MATHEMATICAL_INCONSISTENCY` finding on Aceto balsamico is **correct on persisted data** but **not a genuine PDF arithmetic error**. The PDF line is a **15% discounted row** where `1 × €18.929 × 0.85 = €16.09`. Extraction reads **Valor (total) correctly** as €16.09 but persists **unit_price €15.55**, which equals `€18.295 × 0.85` — a misread gross unit digit plus discount binding without a persisted `discount_pct`. The validation engine correctly flags the inconsistent triple; the root cause is **extraction / monetary binding (B)**, not PDF inconsistency or validation false positive.

**Classification: B** — OCR / Pass C / monetary binding produced a wrong net `unit_price` while `total` is correct.

**Should finding remain after fix?** **No** — correct binding yields `unit_price = €16.09`, `total = €16.09`.

---

## 1. PDF ground truth

Manually transcribed from `invoice-full.png` (`.tmp/mammafiore-line-audit/ground-truth.json`, `.tmp/mammafiore-line-audit/REPORT.md`).

| Field | PDF value | Notes |
|-------|-----------|-------|
| Product | Aceto balsamico di Modena IGP pet 5l*2 Toschi | Pack notation `5l*2` = 2×5 L per outer unit |
| Qty | **1** | Column Qtd = 1 outer sellable unit |
| Unit | **un** | |
| Gross unit price (Pr. Unitário) | **€18.929** | List / pre-discount unit price |
| Discount (Desc.) | **15%** (15,00) | Inferred from `18.929 × 0.85 = 16.08965` (`.tmp/guanciale-commercial-reality-audit/REPORT.md`) |
| Net unit price (effective) | **€16.09** | `round2(18.929 × 0.85)` |
| VAT (IVA) | 6% | Rate column — not used in line net math |
| Line total (Valor) | **€16.09** | Net line amount |

**PDF internal consistency (discount-aware):**

```
1 × €18.929 × (1 − 15/100) = €16.08965 → €16.09  ✓
```

**Naive qty × gross check (what validation uses):**

```
1 × €18.929 = €18.929 ≠ €16.09  (expected on discounted rows without discount context)
```

---

## 2. OCR extraction trace

Mammafiore uses GPT vision on the table crop (no separate row OCR for prices). Qty pre-pass is active on newer deploys; Aceto **qty=1 is stable** across v31+ extracts (`.tmp/farina-stability-final/` — 20/20 runs at qty=1, total=16.09).

| Stage | quantity | unit | unit_price | discount | total | vs PDF |
|-------|----------|------|------------|----------|-------|--------|
| **PDF** | 1 | un | 18.929 (gross) | 15% | 16.09 | — |
| **OCR / Qty pre-pass** | 1 | — | — | — | — | qty OK |
| **Pass C raw** (Jun 10) | **2** | un | **13.8** | — | **15.96** | **First divergence** — pack `*2` inflated qty; all monetary fields wrong (`.tmp/mammafiore-line-audit/pass-c-raw.json`, `line-trace.json`) |
| **Pass C** (Jun 10 extract-invoice) | 1 | UN | 18.295 | — | 15.9 | qty fixed; unit_price & total still wrong (`.tmp/gpt-pattern-audit/error-catalog.json`) |
| **Pass C + binding (v31 stable)** | 1 | un | **15.55** | null | **16.09** | total OK; **unit_price first diverges at binding** (`.tmp/vl-final-state-audit/extracts/36c99d19-….json`) |
| **Persisted DB** (live VL, 2026-06-17) | 1 | un | 15.55 | null | 16.09 | matches v31 extract |

**First stage where *current* finding values diverge from PDF:** Pass C + `bindMonetaryColumns` — `unit_price` becomes €15.55 while `total` is €16.09.

**Mechanism for €15.55:** `round2(18.295 × 0.85) = 15.55` — wrong gross digit (18.295 vs 18.929) combined with 15% discount derivation, or equivalent binding path without structured `gross_unit_price` / `discount_pct` (`.tmp/discount-binding-root-cause-output.json`).

---

## 3. Persisted `invoice_items` row (VL Supabase)

Queried live 2026-06-25:

| Field | Value | Matches PDF? |
|-------|-------|:------------:|
| `invoice_item_id` | `1ccf0bd0-12ef-4823-b504-3833df0899c7` | — |
| `invoice_id` | `36c99d19-6f9f-413f-8c2d-ae3526291a2d` | — |
| `name` | Aceto balsamico di modena IGP pet 5l*2 Toschi | ✓ (minor OCR spelling) |
| `quantity` | 1 | ✓ |
| `unit` | un | ✓ |
| `unit_price` | **15.55** | ✗ (PDF net effective = 16.09) |
| `total` | **16.09** | ✓ |
| `gross_unit_price` | *(column absent)* | — |
| `discount_percent` | *(column absent)* | — |
| `created_at` | 2026-06-17T21:28:14Z | — |

**Persistence drift?** **No** — DB matches v31 extract exactly (`.tmp/vl-final-state-audit/per-invoice/36c99d19-….json` extract vs DB diff: only stale older row `3f7d5597` at 18.829/15.09; current row `1ccf0bd0` is canonical).

---

## 4. Mathematical reconstruction

Using persisted triple (what validation sees):

| Step | Raw | Rounded (round2) |
|------|-----|------------------|
| quantity | 1 | 1 |
| unit_price | 15.55 | 15.55 |
| total | 16.09 | 16.09 |
| **expected_total** = qty × unit_price | 15.55 | **15.55** |
| **variance_abs** | 0.54 | **0.54** |
| **variance_pct** | 3.357…% | **3.36%** |

Using PDF discount-aware economics:

| Step | Value |
|------|-------|
| qty × gross × (1 − discount) | 1 × 18.929 × 0.85 = 16.08965 |
| rounded | **16.09** |
| vs PDF Valor | **match** |

---

## 5. Procurement economics

| Check | Result |
|-------|--------|
| PDF: `qty × gross × (1 − 15%) = total` | **✓** — €16.09 |
| PDF: `qty × gross = total` | **✗** — by design (discount line) |
| Persisted: `qty × unit_price = total` | **✗** — 1 × 15.55 = 15.55 ≠ 16.09 |
| Effective paid per unit | €16.09 / 1 = **€16.09** (`.tmp/gross-net-global-audit-result.json`) |
| Stored procurement cost | **€15.55/unit** — understates true paid unit by €0.54 |
| Operational volume (`5l*2`) | 1 outer × 10 L = 10 L usable (`.tmp/guanciale-commercial-reality-audit/`) |
| True €/L | €16.09 ÷ 10 L = **€1.61/L** (not €1.56/L from €15.55) |

**Gross / discount / net reconcile on PDF** when discount is included. **Persisted row does not** because `unit_price` is a wrong partial discount derivative and discount metadata is not stored.

---

## 6. Validation engine trace

### Pipeline

```
validateInvoiceLine(input)
  → validateExtractionFindings(input)     // no math warning (AND gate not met)
  → validateMathematicsFindings(input)    // MATHEMATICAL_INCONSISTENCY fires
  → validateOperationalFindings(input)
  → validateMatchingFindings(input)
```

### `computeMathematicalReconciliation` (`src/lib/invoice-extraction-review.ts:70–87`)

**Input:** `{ quantity: 1, unit_price: 15.55, total: 16.09 }`

**Output:**

```json
{
  "expected_total": 15.55,
  "actual_total": 16.09,
  "variance_abs": 0.54,
  "variance_pct": 3.36
}
```

### `hasMathematicalInconsistency` (`src/lib/invoice-validation/validators/mathematics.ts:14–22`)

| Threshold | Value | Met? |
|-----------|-------|:----:|
| `variance_abs > €0.50` | 0.54 | **YES** |
| `variance_pct > 5%` | 3.36% | no |
| **OR gate** | | **fires** |

**Finding emitted:** `MATHEMATICAL_INCONSISTENCY` (error) — replay confirmed (`.tmp/validation-findings-acceptance-test/results.json`).

### `deriveMathematicalReconciliationReviewReason` (extraction path, AND gate)

| Threshold | Met? |
|-----------|:----:|
| `variance_abs > €0.50` AND `variance_pct > 5%` | **NO** (3.36% < 5%) |

→ `MATHEMATICAL_RECONCILIATION_FAILURE` does **not** fire on this row (only mathematics OR-gate finding).

### Why `applyEffectivePaidPrice` did not fix extraction

`applyEffectivePaidPrice` (`invoice-monetary-binding.ts:120–129`) only runs when `total < qty × unit_price` (gross-over-net). Aceto has the **inverse**: `total (16.09) > qty × unit_price (15.55)`. Same failure family as Gorgonzola (`.tmp/mathematical-consistency-coverage-audit/REPORT.md`).

---

## 7. Root cause classification

| Option | Verdict | Rationale |
|--------|:-------:|-----------|
| **A** PDF inconsistent | ✗ | PDF reconciles with 15% discount |
| **B** OCR / extraction wrong | **✓** | Wrong net `unit_price` from Pass C + `bindMonetaryColumns` without `discount_pct`; total correct |
| **C** Persistence drift | ✗ | DB faithfully mirrors extract |
| **D** Validation correct, real persisted inconsistency | Partial | Finding is correct, but describes symptom not origin |
| **E** Validation wrong values | ✗ | Math on persisted fields is exact |
| **F** Other architectural | Partial | `applyEffectivePaidPrice` blind spot is contributing architecture |

### **Selected: B**

Pass C / monetary binding stores `unit_price=15.55` (mis-derived net) against correct `total=16.09`. Discount column (15%) is not extracted or bound, so the pipeline cannot produce the PDF-consistent net unit €16.09.

---

## 8. Architectural assessment

| Question | Answer |
|----------|--------|
| Is the finding a false positive? | **No** — persisted triple is genuinely inconsistent |
| Is the PDF wrong? | **No** — discount line math is correct |
| Is validation working? | **Yes** — correctly surfaces extraction defect managers can act on |
| Should finding disappear after pipeline fix? | **Yes** — replay shows `structured_gross_discount_net` scenario yields `unit_price=16.09, total=16.09` (`.tmp/discount-binding-root-cause-output.json`) |
| Will validation still fire on discount lines with correct gross stored? | **Potentially yes** — validator is discount-unaware (`qty × unit_price` only). If fix stores **net** unit_price (16.09), finding clears. If fix stores **gross** (18.929) without discount-aware validation, finding would remain by design. |

**Recommended binding target:** persist **net paid unit** €16.09 (effective procurement price), not gross €18.929.

---

## Smallest safe fix (do NOT implement)

**Primary:** Ensure Pass C extracts Mammafiore structured monetary columns for Aceto:

```
gross_unit_price: 18.929
discount_pct: 15
line_total_net: 16.09
quantity: 1
```

Then `bindMonetaryColumns` → `deriveNetUnitPrice` → `unit_price = round2(18.929 × 0.85) = 16.09` (`supabase/functions/extract-invoice/invoice-monetary-binding.ts:46–53`).

**Prompt lever:** Add Aceto as Mammafiore positive example alongside existing Rulo/Farina discount rows (`invoice-table-extraction.ts` MAMMAFIORE COLUMN ISOLATION section).

**Do not** blindly extend `applyEffectivePaidPrice` to all `total > qty × unit_price` rows without discount detection — would risk masking confirmed extraction bugs (Gorgonzola family). Discount-aware structured extraction is the proven fix path (`.tmp/discount-binding-root-cause-output.json`: 15/15 flagged rows fix with `discount_pct`).

**VL follow-up:** Re-ingest Mammafiore invoice after fix so `invoice_items` row `1ccf0bd0` updates to `unit_price=16.09`.

---

## Evidence index

| Artifact | Relevance |
|----------|-----------|
| `.tmp/mammafiore-line-audit/ground-truth.json` | PDF numerics |
| `.tmp/mammafiore-line-audit/line-trace.json` | Stage-by-stage trace |
| `.tmp/passc-refinement-audit/aceto-audit.json` | Prior Aceto discount-line analysis |
| `.tmp/vl-final-state-audit/extracts/36c99d19-….json` | v31 extract (15.55 / 16.09) |
| `.tmp/validation-findings-acceptance-test/results.json` | Live finding replay |
| `.tmp/discount-binding-root-cause-output.json` | Binding replay scenarios |
| `.tmp/mathematical-consistency-coverage-audit/REPORT.md` | Corpus context |
| `.tmp/guanciale-commercial-reality-audit/REPORT.md` | 15% discount proof |
| `src/lib/invoice-extraction-review.ts` | `computeMathematicalReconciliation` |
| `src/lib/invoice-validation/validators/mathematics.ts` | `validateMathematicsFindings` |
| `supabase/functions/extract-invoice/invoice-monetary-binding.ts` | `bindMonetaryColumns`, `applyEffectivePaidPrice` |

---

## Return summary (parent agent)

1. **Root cause classification:** **B** (extraction / monetary binding — wrong net `unit_price`)
2. **Exact function/file:** `bindMonetaryColumns` / `applyStructuredBinding` / `applyEffectivePaidPrice` — `supabase/functions/extract-invoice/invoice-monetary-binding.ts`; validation trigger `hasMathematicalInconsistency` — `src/lib/invoice-validation/validators/mathematics.ts:14–22`
3. **One-sentence explanation:** Pass C reads Valor correctly (€16.09) but binds `unit_price` to €15.55 (mis-derived net from wrong gross × 15% discount) because `discount_pct` is not extracted, leaving a persisted triple where `1 × €15.55 ≠ €16.09` despite the PDF discount line being internally consistent at €16.09.
4. **Should finding remain after correct implementation?** **No**
5. **Smallest safe fix:** Extract `gross_unit_price=18.929`, `discount_pct=15`, `line_total_net=16.09` in Pass C so `bindMonetaryColumns` derives `unit_price=16.09`; re-ingest VL row.
