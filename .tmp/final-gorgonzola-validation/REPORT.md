# Final Gorgonzola Quantity Validation Audit

**VL:** `bjhnlrgodcqoyzddbpbd` · **Invoice:** `ab52796d-de1d-418d-86e7-230c8f056f09` · **Deploy:** v41 · Read-only

## Verdict: **C — Quantity still wrong**

Persisted DB and UI match (**1.30 / €9.88 / €13.44**), but both diverge from PDF (**1.35 / €9.95 / €13.44**). Not a display-rounding issue.

---

## T1 — Persisted invoice_item

| Field | Value |
|-------|-------|
| id | `fd785aba-bac4-4a1a-804d-fe32ed06ddbe` |
| quantity | **1.3** kg |
| unit_price | **9.88** |
| line_total | **13.44** |
| gross_unit_price | null (not stored) |
| discount_pct | null (not stored) |
| created_at | 2026-06-24T21:48:29Z |

---

## T2 — PDF vs persisted vs UI

| Field | PDF | Persisted | UI |
|-------|-----|-----------|-----|
| Quantity | 1.35 | 1.30 | 1.30 |
| Unit price | €9.95 | €9.88 | €9.88 |
| Total | €13.44 | €13.44 | €13.44 |

---

## T3 — Math reconciliation

| Source | qty × price | Total | Variance |
|--------|-------------|-------|----------|
| Persisted | 1.30 × 9.88 = €12.84 | €13.44 | €0.60 (4.46%) |
| PDF truth | 1.35 × 9.95 = €13.43 | €13.44 | €0.01 (0.07%) |

---

## T4 — UI display

`formatQuantity` uses 2 decimals; 1.35 would show as **1.35 kg**, not 1.30. DB stores 1.3 faithfully — no rounding mask.

---

## T5 — Pipeline trace (v41)

| Stage | Qty |
|-------|-----|
| PDF | 1.35 |
| Prepass OCR | **1.30** |
| Pass C | 1.05 |
| Anchored | **1.30** |
| Persisted | **1.30** |

Right-pad fixed geometry (2→1.30, anchoring active) but GPT prepass still under-reads trailing **5**.

---

## T6 — Classification

| Code | Applies |
|------|---------|
| A Fully fixed | No |
| B UI display issue | No |
| **C Quantity still wrong** | **Yes** |
| D Different bug | Partial (unit_price drift is downstream) |
