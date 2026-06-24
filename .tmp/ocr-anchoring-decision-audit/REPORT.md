# OCR Anchoring Decision Audit

**Validation Lab:** `bjhnlrgodcqoyzddbpbd` · **Invoice:** `ab52796d-de1d-418d-86e7-230c8f056f09` · **Gorgonzola item:** `35bdf942-712b-46af-9f2e-666cb4744a88` · **Re-read:** `2026-06-24T12:19:51.42294+00:00` · **Read-only** · 2026-06-24

## Executive verdict

**Anchoring executed on v39 but did not replace Pass C 1.05 with PDF OCR 1.35.** The qty pre-pass returned **integer OCR 2.00** on live probe (not 1.35), failing `isFractionalQty` inside `isQtyAnchorScopeRow` → `anchorQuantities` early-exits before scoring. Re-read persisted **1.05 / €9.95 / €13.44** — identical to Pass C — proving prepass did **not** return 1.35 at re-read time either.

---

## Final 5 questions

| # | Question | Answer |
|---|----------|--------|
| 1 | **Executed?** | **YES** — `extract-invoice` **v39** deployed `2026-06-24T12:17:35Z`; re-read `12:19:51Z` is 2m16s later; live API returns `extraction_meta` |
| 2 | **Saw 1.35?** | **NO** — live `ocr_quantity=2`; if re-read prepass had returned 1.35, counterfactual replay anchors to 1.35 (contradicts persisted 1.05) |
| 3 | **Why rejected?** | **Scope gate** — `isFractionalQty(2)` false → `invoice-qty-prepass.ts:221-224` early return. Alt at re-read: prepass=1.05 → agreement skip L234-237 |
| 4 | **Why no OCR_QTY_MISMATCH?** | Scope-fail `defaultMeta` forces `ocr_qty_mismatch:false` (L218); flag only when scoped row declines anchor with delta>10% (L271) |
| 5 | **Issue** | **B** — Scope gate excluded row before anchor scoring evaluated |

---

## T1 — Pipeline trace (this re-read)

| Stage | Component | Outcome |
|-------|-----------|---------|
| UI | `reExtract` → `runExtraction` | invoke `extract-invoice` |
| Edge v39 | `runQuantityPrePass` → Pass C → `anchorQuantities` → bind | meta attached |
| Pass C | GPT structured extract | qty **1.05**, gross/discount bound → unit **9.95** |
| Anchor | `anchorQuantities` | Pass C qty kept (**1.05**) |
| Persist | delete/insert `invoice_items` | **1.05 / 9.95 / 13.44** |
| Review | `needsExtractionConfirmation` | math **FLAG**; OCR mismatch **not flagged** |

Deploy timeline: v38 → v39 at **12:17:35 UTC**; this re-read at **12:19:51 UTC**.

---

## T2 — `runQuantityPrePass` returned 1.35? **NO**

| Evidence | Value |
|----------|-------|
| Edge version | v39 (post-hardening) |
| `extraction_meta.ocr_quantity` (live probe) | **2** |
| Re-read persisted qty | **1.05** (= Pass C, ≠ 1.35) |
| Counterfactual | OCR=1.35 would anchor per unit test A |

Prepass is non-deterministic; live probe confirms it can return **2** instead of PDF **1.35**.

---

## T3 — `anchorQuantities` executed? **YES**

Live probe `extraction_meta`:

```json
{
  "ocr_quantity": 2,
  "pass_c_quantity": 1.05,
  "quantity_anchored": false,
  "ocr_qty_mismatch": false
}
```

### Scoring table (net unit €9.95, line_total_net €13.44)

| Scenario | scopeIn | Δ% | scoreOcr | scorePassC | shouldAnchor | output qty | anchored | ocr_mismatch |
|----------|---------|-----|----------|------------|--------------|------------|----------|--------------|
| **Live (OCR=2)** | **false** | 47.5 | 6.46 | 2.99 | n/a (gated) | 1.05 | false | false |
| Counterfactual (OCR=1.35) | true | 22.2 | **0.01** | 2.99 | **true** | **1.35** | true | false |
| Agreement (OCR=1.05) | true | 0 | 2.99 | 2.99 | false | 1.05 | false | false |
| S3 (OCR=1.35, PassC=2, total=18.72) | true | 48.2 | 5.29 | 1.18 | false | 2 | false | **true** |

**Live branch:** `isQtyAnchorScopeRow false → early return (L221-224)` — scoring never runs.

---

## T4 — Why 1.35 not selected — exact branch

```221:224:supabase/functions/extract-invoice/invoice-qty-prepass.ts
    if (!prepass || !isQtyAnchorScopeRow(prepass, row)) {
      metadata.push(defaultMeta);
      return row;
    }
```

Failing sub-gate at L78-91:

```78:81:supabase/functions/extract-invoice/invoice-qty-prepass.ts
function isFractionalQty(qty: number): boolean {
  if (!Number.isFinite(qty) || qty <= 0) return false;
  return Math.abs(qty % 1) > 0.001;
}
```

Live prepass `ocr_quantity=**2**` → `isFractionalQty(2)` = **false** → entire anchoring block skipped.

**Re-read inference:** Persisted 1.05 proves prepass ≠ 1.35. If prepass returned **1.05** (matching Pass C), agreement gate at L234-237 (`delta ≤ 2%`) would also skip anchoring without mismatch flag.

---

## T5 — `OCR_QTY_MISMATCH` generated? **NO**

| Check | Result |
|-------|--------|
| `extraction_meta.ocr_qty_mismatch` (live) | `false` |
| `needsOcrQtyMismatchReview(meta)` | `false` |
| Delta OCR=2 vs PassC=1.05 | 47.5% (>10%) — would flag **if scoped** |

`ocr_qty_mismatch` is only set inside scoped branches (L243, L271). Scope-fail `defaultMeta` hardcodes `false` at L218 even when `ocr_quantity` differs materially.

---

## T6 — Review framework

| Layer | Status |
|-------|--------|
| Edge API `extraction_meta` | **Present** on v39 live probe |
| DB persistence of meta | **No** — stripped before insert |
| `extractionMetaByItemId` | Wired locally `invoices.tsx:1401-1566`; session-only |
| `origin/main` OCR review | **Absent** — `needsOcrQtyMismatchReview` not on deployed client |
| Math review on persisted 1.05×9.95 vs 13.44 | **FLAG** — variance €2.99 (22.25%) |
| OCR review on live meta | **null** — `ocr_qty_mismatch` false |

User observation (math YES, OCR NO) is consistent: math fires on persisted trio; OCR flag blocked by scope-fail meta.

---

## T7 — Replay OCR=1.35, Pass C=1.05, unit=9.95, total=13.44

| Field | Expected (hardening logic) | Actual (re-read DB) |
|-------|---------------------------|---------------------|
| quantity | **1.35** | 1.05 |
| unit_price | 9.95 | 9.95 |
| total | 13.44 | 13.44 |
| quantity_anchored | true | false (inferred) |
| math review | pass (1.35×9.95≈13.43) | **FLAG** |
| OCR review | — | not shown |

**Conclusion:** Hardening logic is correct for OCR=1.35; failure is upstream — prepass did not supply 1.35.

---

## T8 — Stage table

| Stage | Qty | Source |
|-------|-----|--------|
| PDF Qtd column | 1.35 | OCR/PDF |
| Qty pre-pass (live v39) | 2.00 | OCR prepass |
| Pass C structured (live) | 1.05 | Pass C |
| anchorQuantities output (live) | 1.05 | Anchored (unchanged) |
| Persisted (12:19 re-read) | 1.05 | Persisted |

---

## Gorgonzola VL history

Only one row remains after latest re-read (delete/recreate pattern):

| created_at | qty | unit_price | total | id |
|------------|-----|------------|-------|-----|
| 2026-06-24T12:19:51Z | 1.05 | 9.95 | 13.44 | `35bdf942-…` |

Prior rows (2/9.35/18.72 at 10:45Z, etc.) superseded.

---

## Deploy state

| Component | Version | Anchoring |
|-----------|---------|-----------|
| VL `extract-invoice` | **v39** (2026-06-24T12:17:35Z) | **Active** |
| Prior audit reference | v38 | Not active |
| Client `invoice-extraction-review.ts` | Uncommitted (`??`) | Math+OCR local only |
| `origin/main` client | No OCR review wiring | Math review absent |

---

## Issue classification (exactly one)

| Code | Mechanism | Applies? |
|------|-----------|:--------:|
| A | Scoring declined anchor (S3: OCR 1.35 loses) | NO — 1.35 wins vs 1.05 |
| **B** | **Scope gate excluded row** (`isFractionalQty` false on prepass OCR) | **YES** |
| C | Anchoring never executed | NO — v39 post-deploy, meta present |
| D | Client review wiring failure | Partial — meta has `ocr_qty_mismatch:false`; not root cause |

**Answer: B**

---

## Artifacts

- `results.json` — machine-readable audit output
- `audit.mts` — replay script (read-only VL probe + programmatic anchor replay)
