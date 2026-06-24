# Missing Purchase Unit Population Audit

**Validation Lab:** `bjhnlrgodcqoyzddbpbd`  
**Mode:** STRICT READ-ONLY — no code/DB writes, deployments, or fixes  
**Audited:** 2026-06-23

## Executive Summary

Across **all 52 `invoice_items`** in the Validation Lab (7 invoices), only **2 rows** have `quantity > 1` AND `unit IS NULL`. Both are on Emporio Italia invoice `ab52796d`: **Paccheri Lisci** (24 / null) and **Ginger Beer** (24 / null). Every other VL row (50/52) has a persisted unit.

Both affected rows classify as **B) Probably should be `un`** — embedded measure in product name (`500g`, `0.20cl`) with countable outer quantity, where `resolveInvoiceLinePurchaseUnit` returns `fallback_null` because structured kind is `weight_or_volume` (not `multi_unit_pack`).

Stock-normalization replay shows **no calculation divergence** between `unit=null` and `unit=un` for either row. Impact is **DISPLAY_ONLY** (Last Purchase shows `24` instead of `24 un`). Paccheri/Ginger are **not** part of a larger family — they are the entire affected set.

**Final verdict: Isolated**  
**Priority: B) Fix after Invoice Editing**

---

## TASK 1 — Scan: quantity > 1 AND unit IS NULL

| Invoice | Product | Quantity | Unit | Supplier |
|---------|---------|----------|------|----------|
| `ab52796d` | De Cecco - Paccheri Lisci Nr. 125 - 500g | 24 | **null** | Emporio Italia, Lda. |
| `ab52796d` | Baladin - Ginger Beer 0.20cl | 24 | **null** | Emporio Italia, Lda. |

*No other VL rows match this filter.*

---

## TASK 2 — Classification of NULL-unit rows (qty > 1)

| Product | Qty | Classification | Structured kind | Resolver source | Reason |
|---------|-----|----------------|-----------------|-----------------|--------|
| Paccheri Lisci | 24 | **B) expected_un** | `weight_or_volume` | `fallback_null` | Embedded `500g` in name; qty is piece count; no multipack marker (`*24`, `10x1kg`) |
| Ginger Beer | 24 | **B) expected_un** | `weight_or_volume` | `fallback_null` | Embedded `0.20cl` in name; qty is bottle count; no multipack marker |

**Not observed in VL:** A) correctly null, C) expected_cx, D) unknown (for qty>1 null rows).

### Why other countables are unaffected

Products with multipack markers in the name survive null OCR because `multi_unit_pack` inference backfills `un`:

| Product | DB unit | Name pattern | Structured kind |
|---------|---------|--------------|-----------------|
| Peroni 33cl | `un` | `33cl*24` | `multi_unit_pack` |
| Pellegrino 75cl×15 | `un` | `CX 75CL*15` | `multi_unit_pack` |
| Açúcar 10x1kg | `cx` | `10x1Kg` | `multi_unit_pack` |
| Pomodori 2.5kg×6 | `un` | `CX 2,5KG*6` | `multi_unit_pack` |

Paccheri (`500g`) and Ginger (`0.20cl`) lack these markers → `weight_or_volume` → resolver cannot infer `un` when OCR unit is null.

---

## TASK 3 — Frequency analysis

| Category | Count |
|----------|------:|
| **Total invoice_items** | 52 |
| **Unit present** | 50 |
| **Unit null (any qty)** | 2 |
| **Unit null, qty > 1** | 2 |
| **Null → expected `un`** | 2 |
| **Null → expected `cx`** | 0 |
| **Null → correctly null** | 0 |
| **Null → unknown** | 0 |

**Rate:** 2/52 (3.8%) null unit overall; 2/52 (3.8%) null with qty>1. Both null rows are the same two Emporio products.

---

## TASK 4 — Family analysis

| Family pattern | Count | Products | Supplier(s) | Part of larger family? |
|----------------|------:|----------|-------------|------------------------|
| `embedded_g` | 1 | Paccheri Lisci 500g | Emporio Italia | **No** — sole member |
| `embedded_cl` | 1 | Ginger Beer 0.20cl | Emporio Italia | **No** — sole member |

Paccheri and Ginger share a **mechanism** (embedded measure + countable qty + `weight_or_volume` + `fallback_null`) but constitute the **entire** null-unit population in VL. No additional `embedded_g`/`embedded_cl`/`weight_or_volume` rows with qty>1 and null unit exist.

### Historical note (Emporio `ab52796d`)

| Invoice | Created | Paccheri unit | Ginger unit |
|---------|---------|---------------|-------------|
| `17aa3591` (deleted) | 2026-06-10 | `un` | `un` |
| `ab52796d` (live) | items 2026-06-20 | **null** | **null** |

Regression is re-upload/re-ingest on the same PDF, not a widespread extraction pattern across suppliers.

---

## TASK 5 — Impact per row (null vs `un` replay)

| Product | Impact | Label null | Label if `un` | Usable qty | Effective cost | Procurement cost |
|---------|--------|------------|---------------|------------|----------------|------------------|
| Paccheri | **DISPLAY_ONLY** | `24` | `24 un` | 12,000 g (same) | €4.20/kg (same) | purchase_qty=1 un (same) |
| Ginger Beer | **DISPLAY_ONLY** | `24` | `24 un` | 4,800 ml (same) | €4.05/L (same) | purchase_qty=200 ml (same) |

### Impact summary

| Level | Count | Meaning |
|-------|------:|---------|
| NONE | 0 | — |
| **DISPLAY_ONLY** | **2** | `formatRowPurchaseQuantityLabel` / Ingredient Detail Last Purchase |
| CALCULATION_RISK | 0 | No usable/cost/procurement divergence |

Replay used `computeUsableFromPurchaseStructure`, `resolveInvoiceLinePurchaseFormat`, `computeEffectiveUsableCost`, `recipeOperationalCostFieldsFromInvoiceLine`, and `resolveCountablePurchaseQuantityForCost` — all paths identical for null vs injected `un`.

---

## TASK 6 — Priority

| Choice | Label | Evidence |
|--------|-------|----------|
| A | Fix before Invoice Editing | — |
| **B** | **Fix after Invoice Editing** | **Selected.** Both rows DISPLAY_ONLY; zero CALCULATION_RISK. Usable stock (12 kg pasta, 4.8 L ginger) and €/kg / €/L costs are correct. Only Last Purchase label loses `un` suffix. |
| C | Backlog only | — |

Resolver fix (`weight_or_volume` + countable qty → infer `un`) or GPT unit extraction hardening is still worthwhile for display fidelity, but not blocking invoice-editing work.

---

## Root cause (corroborated, read-only)

```
GPT Pass C omits unit for Emporio countable rows (run-dependent)
    ↓
resolveInvoicePersistedItemUnit
    → kind=weight_or_volume + OCR unit null → fallback_null
    ↓
invoice_items INSERT with unit=null
    ↓
formatRowPurchaseQuantityLabel → bare "24" (no unit suffix)
```

Prior audits: `.tmp/invoice-unit-persistence-audit/`, `.tmp/purchase-unit-representation-audit/`.

When OCR supplies `unit=un`, resolver preserves it (`preserveCountableExtractedUnit`). Frozen extracts for the same PDF sometimes return `un`; the ab52796d upload path handed off `unit=null`.

---

## Final Verdict

| Question | Answer |
|----------|--------|
| **Isolated / Small family / Widespread?** | **Isolated** |
| Affected rows | 2 of 52 (Paccheri + Ginger only) |
| Affected invoices | 1 of 7 (`ab52796d`) |
| Affected suppliers | 1 (Emporio Italia) |
| Larger family? | **No** — Paccheri/Ginger are the complete null-unit set |
| Calculation impact | **None** — display only |
| Priority | **B) Fix after Invoice Editing** |

---

## Evidence Files

- `.tmp/missing-unit-population-audit/results.json` — machine-readable full audit
- `.tmp/missing-unit-population-audit/audit.mts` — replay script (read-only SELECT)
- `.tmp/invoice-unit-persistence-audit/REPORT.md` — persistence root cause
- `.tmp/purchase-unit-representation-audit/REPORT.md` — UI/display lifecycle
- `.tmp/discount-binding-root-cause-output.json` — ab52796d unit=null at binding handoff
