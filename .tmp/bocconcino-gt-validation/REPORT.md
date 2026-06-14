# Bocconcino Pomodor GT Validation

**Invoice:** `f0aa5a08-86a3-4938-99f0-711e86073968` (IL Bocconcino)  
**Product:** POMODORI PELATI (CX 2,5KG*6)  
**Mode:** READ-ONLY  
**Generated:** 2026-06-13

---

## Verdict

# **B) GT bug — 96% confidence**

The €27.95 VL financial error on this row is caused by **incorrect ground truth**, not incorrect v27 extraction. v27 (and 5/5 stability runs) match the **visible invoice**; VL GT does not.

---

## Three-way comparison

| Field | Visible invoice | VL GT | v27 extraction |
|-------|-----------------|-------|----------------|
| **Qty** | **1** (QUANT. 1,000) | 2 | **1** |
| List / P.VENDA | **27,56 EUR** | — (uses €25) | — (not extracted) |
| Discount | **20,00%** | — | — |
| Net / VALOR | **22,05 EUR** | — | 22,05 (as unit_price) |
| **Total** | **22,05 EUR** | **50,00** | **22,05** |

**Financial error vs GT:** €27.95 (`|50 − 22.05|`)  
**Financial error vs visible:** **€0** (qty and total match)

---

## Evidence: visible invoice shows qty 1

Independent transcriptions agree on **QUANT. = 1,000**:

| Source | Qty | P.VENDA | DESC | VALOR |
|--------|-----|---------|------|-------|
| column-selection-deep-dive/column-reconstruction.json | **1,000** | 27,560 EUR | 20,00% | **22,05 EUR** |
| column-shift-audit/ground-truth.json | **1** | 27.56 | 20% | **22.05** |
| bocconcino-investigation DB record | **1** | 27.56 | — | **22.05** |

Column headers are visible in Pass C crop (Bocconcino geometry includes header row — `column-selection-deep-dive/REPORT.md`).

**Math check:** 1 × €27.56 × (1 − 20%) = **€22.05** ✓

---

## Evidence: GT qty 2 / total €50 does not match visible

| GT claim | Visible column? | Verdict |
|----------|-----------------|---------|
| qty **2** | QUANT shows **1** | **NO** |
| unit **€25** | P.VENDA shows **€27.56**; no €25 column | **NO** |
| total **€50** | VALOR shows **€22.05**; 2×25 not printed | **NO** |

GT source in `field-accuracy-audit/ground-truth.json`:

> `bocconcino-investigation OCR + post-geometry re-extract`

`column-shift-audit/ground-truth.json` explicitly notes:

> *"VL GT qty=2/total=€50 reflects post-geometry re-extract interpretation, not visible row."*

**Likely GT origin:** Pack notation `(CX 2,5KG*6)` in description was interpreted as **purchased qty 2** instead of reading QUANT. column `1,000`. `gpt-pattern-audit` documents this pack-multiplier confusion class for Bocconcino Pomodor.

---

## v27 extraction and 5-run stability

**v27** (`.tmp/final-residual-error-audit/extracts/f0aa5a08-....json`):

```
qty: 1  |  unit_price: 22.05  |  total: 22.05
```

**5-run stability** (`monetary-binding-final-validation/pomodor-5run-stability.json`, v21+):

| Run | Qty | Unit € | Total € |
|-----|-----|--------|---------|
| 1–5 | **1** | **22.05** | **22.05** |

- **Deterministic:** 5/5 identical
- **vs visible:** qty ✓, total ✓
- **vs VL GT:** 0/5 correct

Pre-hybrid runs showed different errors (DESC €20 bleed, qty 2 inference, totals €40–€54). Post-hybrid/v27 stabilized on **visible-aligned** values.

---

## Extraction caveat (does not change verdict)

v27 copies **VALOR LÍQUIDO €22.05** into both `unit_price` and `total`. Ideally:
- `gross_unit_price` = 27.56 (P.VENDA)
- `line_total_net` = 22.05 (VALOR)
- `unit_price` = derived net per unit

When qty = 1, copying VALOR into `unit_price` has **€0 financial impact** (total still 22.05). This is a **field-semantics / column-binding** issue, not the source of the €27.95 GT delta.

---

## Question checklist

| Question | Answer |
|----------|--------|
| Does visible invoice show qty 1 or 2? | **Qty 1** |
| Does VALOR show €22.05 for single unit? | **Yes** |
| Does GT qty 2 / total €50 match any visible column? | **No** |
| Does v27 match visible? | **Yes** (qty 1, total 22.05) |
| 5-run stability? | **5/5** deterministic at visible values |

---

## Recommendation

**Revise VL GT** for Pomodor PELATI to:

| Field | Corrected value |
|-------|-----------------|
| qty | 1 |
| unit_price (list) | 27.56 (or net 22.05 with convention note) |
| total | **22.05** |

This removes **€27.95** from the global VL financial error bucket for Bocconcino without any extraction prompt change.

---

## Artifacts

| File | Contents |
|------|----------|
| `verdict.json` | Structured verdict + evidence |
| `REPORT.md` | This report |
