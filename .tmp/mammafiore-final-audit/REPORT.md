# Mammafiore Final Audit — v27 Residual €5.86

**Invoice:** `36c99d19-6f9f-413f-8c2d-ae3526291a2d` (Mammafiore Portugal)  
**Deploy:** extract-invoice **v27**  
**Mode:** READ-ONLY  
**Generated:** 2026-06-13

---

## Executive Summary

Mammafiore v27 financial error is **€5.86**, fully accounted by two discounted-line rows:

| Row | € | Verdict | First failing stage |
|-----|---|---------|-------------------|
| Rulo Di Capra 1kg*2 | **€4.86** | **Extraction bug** | Pass C |
| Farina Speciale pizza | **€1.00** | **Extraction bug** | Pass C |
| **Sum** | **€5.86** | | |

**No GT issues.** Ground truth is manual transcription from the visible invoice (`mammafiore-line-audit`) and matches printed Valor column values. **No normalization issues** — binder and reconcile preserve Pass C totals.

On this v27 run, the other six rows (including Guanciale, Birra, Aceto) have **€0** financial error — a mostly-good discount-line outcome. The €5.86 is not the large Guanciale/Birra variance seen on bad runs in discount-line-audit.

---

## Methodology

| Source | Purpose |
|--------|---------|
| `.tmp/final-residual-error-audit/extracts/36c99d19-....json` | v27 extraction |
| `.tmp/field-accuracy-audit/ground-truth.json` | GT |
| `.tmp/mammafiore-line-audit/ground-truth.json` | Visible invoice values |
| `.tmp/discount-line-audit/` | Discount-line A/B behaviour, 5-run variance |
| `.tmp/root-cause-consolidation/` | Structural family context |
| v26 final-validation-lab rerun | Baseline comparison |

---

## Row 1 — Rulo Di Capra (€4.86)

### Visible invoice
| Field | Value |
|-------|-------|
| Qty | **1** un |
| List unit price | **15,192** |
| Valor (discounted total) | **10,86** |
| Implied discount | ~40% (15,19 − 10,86) |

*Source: mammafiore-line-audit manual transcription*

### Ground truth
qty 1 · unit_price **15.192** (list) · total **10.86**

### v27 extraction
qty 1 · unit_price **10.86** · total **€6.00**

### Analysis

| Check | Result |
|-------|--------|
| Matches visible total? | **NO** — €6 vs €10.86 |
| Matches GT total? | **NO** — €4.86 delta |
| Behaviour A (copy Valor)? | **NO** — should be €10.86 |
| Behaviour B (qty×list)? | **NO** — would be €15.19 |
| v26 on same invoice? | **€0** — total 10.86 correct |

**Root cause:** Pass C **Valor column catastrophic misread** (€6.00). The net unit €10.86 is copied into `unit_price` (field-level mismatch vs GT list unit, but €0 impact when total is correct). On v27 the total itself is wrong — a **regression** beyond discount-line-audit's historical €10.80–€15.19 range.

**Pack notation risk:** Description `1kg*2` historically triggered qty=2 confusion in early Pass C raw (`mammafiore-line-audit`).

**First failing stage:** **Pass C** (GPT structured extraction). Binder/reconcile do not alter totals.

---

## Row 2 — Farina Speciale pizza (€1.00)

### Visible invoice
| Field | Value |
|-------|-------|
| Qty | **1** un |
| List unit price | **33,154** |
| Valor (discounted total) | **26,52** |
| Implied discount | ~25% (33,15 − 26,52) |

### Ground truth
qty 1 · unit_price **33.154** · total **26.52**

### v27 extraction
qty 1 · unit_price **26.52** · total **€25.52**

### Analysis

| Check | Result |
|-------|--------|
| Matches visible total? | **NO** — €25.52 vs €26.52 |
| Matches GT total? | **NO** — €1.00 delta |
| Behaviour A (copy Valor)? | **PARTIAL** — off by €1 |
| Behaviour B (qty×list)? | **NO** — would be €33.15 |
| v26 identical? | **YES** — same €25.52 total |

**Root cause:** Pass C **partial Valor misread** — stable **€1 digit drift** (25,52 vs 26,52). Not a GT issue; visible invoice and GT agree on €26.52. `unit_price` field shows net/discounted price (€26.52) rather than list (€33.154) — field display issue with €0 impact when total is correct; here total is also wrong by €1.

**Stability:** discount-line-audit shows **4/5 runs correct** at €26.52; v27 landed on the stable partial-error path (same as v26), not the behaviour-B flip (€33.15).

**First failing stage:** **Pass C**

---

## Extraction bug vs GT issue

| Row | Extraction bug? | GT issue? | Rationale |
|-----|-----------------|-----------|-----------|
| Rulo Di Capra | **YES** | NO | Visible Valor €10.86; v27 reads €6 |
| Farina Speciale | **YES** | NO | Visible Valor €26.52; v27 reads €25.52 |

GT is high-confidence manual transcription from `invoice-full.png`. Neither row is a catalog interpretation difference.

---

## Structural context (discount-line family)

From `discount-line-audit` and `root-cause-consolidation`:

- Mammafiore has **8 discounted rows** where qty × list price ≠ Valor total
- Pass C alternates **behaviour A** (copy invoice total — correct) vs **behaviour B** (recalculate qty×price — wrong)
- **80% run success** on primary targets in 5-run study
- v27 focus errors are **partial/catastrophic total misreads**, not the full behaviour-B flip (except Rulo's €6 is worse than historical B)

**Not a normalization issue:** `discount-line-audit` confirms normalize/reconcile do not introduce discount total divergence.

---

## Pipeline trace (both rows)

```
Visible invoice (PDF)     ✅ Valor totals transcribed in GT
       ↓
Geometry crop (top=386)   ✅ All rows visible post-fix
       ↓
Pass C GPT                ❌ FIRST FAILURE — wrong line_total_net / total
       ↓
Binder                    ✅ Preserves Pass C values
       ↓
Reconcile                 ✅ No discount total correction
       ↓
API output                Pass-through
```

---

## Projected outcome

| Scenario | Mammafiore € error |
|----------|-------------------|
| v27 actual | **€5.86** |
| If both rows fixed | **€0** |
| Best-run discount-line baseline | **€0** (4/5 runs) |

---

## Artifacts

| File | Contents |
|------|----------|
| `row-breakdown.json` | Visible/GT/v27/baseline per row |
| `root-cause.json` | Classification, mechanism, pipeline trace |
| `REPORT.md` | This report |
