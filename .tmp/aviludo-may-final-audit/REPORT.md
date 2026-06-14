# Aviludo May — Remaining €40 Error Audit

**Invoice:** `3b4cb21f-8b3f-45f3-9f2d-6f15e9f438a2`  
**Date:** 19/05/2026  
**Deploy:** extract-invoice **v25**  
**Mode:** READ-ONLY  
**Generated:** 2026-06-12

---

## Executive Summary

Aviludo May's **€40.00** financial error is **100% attributable to a single row**: **Chocolate Culinaria Pantagruel 10x200 g**. v25 reads unit price **€9.99** (the adjacent Açúcar row's price) instead of **€29.99**, producing total **€19.98** vs ground truth **€59.98**.

The previously fixed **Açúcar** row remains correct on v25 (qty 1, €9.99). **Atum** has qty/unit parsing errors but **zero € impact** because line total is preserved. Five other rows are fully correct.

**Confidence:** 92%

---

## Error Contribution Table

| Row | GT total | v25 total | Δ total | € error | Category |
|-----|----------|-----------|---------|---------|----------|
| Filete de Anchoas | €19.98 | €19.98 | €0 | **€0** | OCR (name only) |
| Ovo Líquido | €62.94 | €62.94 | €0 | **€0** | — |
| Pepinos Extra | €22.49 | €22.49 | €0 | **€0** | — |
| Atum Óleo | €13.10 | €13.10 | €0 | **€0** | Qty/unit parsing* |
| Arroz Agulha | €13.95 | €13.95 | €0 | **€0** | — |
| **Chocolate Pantagruel** | **€59.98** | **€19.98** | **−€40.00** | **€40.00** | **Monetary column bleed** |
| Açúcar Branco | €9.99 | €9.99 | €0 | **€0** | — (fixed) |
| Nata Culinária | €94.45 | €94.45 | €0 | **€0** | OCR (name only) |
| **Total** | | | | **€40.00** | |

\*Atum: extracted qty **1** @ **€13.10** vs GT qty **2** @ **€6.55** — line total matches (1×13.10 = 2×6.55 = 13.10).

---

## Top Error Drivers

### 1. Chocolate — €40.00 (100% of invoice error)

| Field | Ground truth | v25 | Delta |
|-------|-------------|-----|-------|
| Qty | 2 CX | 2 CX | 0 |
| Unit price | **€29.99** | **€9.99** | −€20.00 |
| Total | **€59.98** | **€19.98** | −€40.00 |

**Mechanism:** On the visible invoice, Chocolate row shows Preço Unitário **29,99** and Valor **59,98**. The row immediately below (Açúcar) shows Preço **9,99**. GPT copies **9,99** into Chocolate's unit_price — adjacent-row monetary column bleed.

**Stability (3 v25 PDF probes):** unit_price **9.99** in all 3 runs; qty 2 in runs 1–2, qty 1 in run 3 (would be €50 error). Systematic, not random OCR noise.

### 2. Atum — €0.00 (field errors only)

| Field | Ground truth | v25 | Delta |
|-------|-------------|-----|-------|
| Qty | 2 UN | 1 UN | −1 |
| Unit price | €6.55 | €13.10 | +€6.55 |
| Total | €13.10 | €13.10 | 0 |

**Mechanism:** Line total absorbed into unit_price; qty halved. Same conflation pattern seen elsewhere but total preserved.

### 3. Filete — €0.00 (OCR name drift)

Amounts correct; description OCR variants only (Anchovas→Anchoivas).

---

## Structural Family vs Isolated

| Case | Status | Mechanism |
|------|--------|-----------|
| Açúcar qty bleed | **SOLVED** (Pass C refinement) | Leading digit **9** from price 9,99 → qty |
| **Chocolate price bleed** | **OPEN** | Entire price **9,99** from row below → unit_price |
| Atum qty/unit swap | OPEN (€0) | Line total → unit_price |

**Verdict:** Same **Aviludo dense-table column isolation** family as the solved Açúcar case — not an isolated anomaly. The Açúcar prompt fix addressed qty-column bleed but not price-column bleed on the adjacent Chocolate row.

---

## Timeline: Regression on Chocolate

| Stage | Chocolate unit_price | Chocolate total | May € error |
|-------|---------------------|-----------------|-------------|
| Pre-c33a7f1 | €29.99 | €59.98 | €0 |
| c33a7f1 | €29.99 | €59.98 | €79.92 (Açúcar only) |
| Pass C refinement | €29.99 | €59.98 | **€0** |
| **v25 final rerun** | **€9.99** | **€19.98** | **€40** |

Açúcar fix survived v25; Chocolate regressed — likely GPT run variance + prompt bloat (v24/v25 Emporio examples) shifting attention on dense Aviludo rows, not a schema or geometry change.

---

## Smallest Fix Category (recommend only)

**Pass C prompt — column isolation extension** (no geometry/binder/persistence change).

Add a worked BAD/GOOD example for Chocolate adjacent to the existing Açúcar rule:

- **GOOD:** Chocolate 2 CX, Preço Unitário **29,99**, Total **59,98** (same row)
- **BAD:** unit_price **9,99** borrowed from Açúcar row below

Generic rule reinforcement: *Preço Unitário must come from the same row's column — never from an adjacent line.*

---

## Expected VL Improvement

| Metric | Current | After Chocolate fix |
|--------|---------|---------------------|
| Aviludo May € error | €40.00 | **~€0** |
| Global € error (post-April harness fix) | ~€89 | **~€49** |
| May field accuracy | 84.4% | **~90%+** |
| May rows fully correct | 5/8 | **6/8** (Atum still field-wrong, €0) |

Fixing Atum qty/unit would add field accuracy but **no € improvement** (total already matches).

---

## Evidence

| File | Contents |
|------|----------|
| `error-breakdown.json` | Per-row GT vs v25 deltas and categories |
| `root-cause-summary.json` | Drivers, family, fix recommendation |
| `v25-stability-runs.json` | 3× v25 PDF probe (Chocolate/Atum/Açúcar) |
| `.tmp/final-validation-lab-rerun/extracts/3b4cb21f-....json` | Primary v25 extract |
| `.tmp/passc-refinement-validation/reextract/3b4cb21f-....json` | Historical 0€ baseline |
| `.tmp/geometry-audit/images/3b4cb21f-....png` | Visible invoice (29,99 / 59,98 confirmed) |
