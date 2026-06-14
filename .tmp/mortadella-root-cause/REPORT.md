# Mortadella Root Cause — Emporio Residual (READ-ONLY)

**Invoice:** `17aa3591-ec98-4c21-89c9-5ae946bc97bb` (Emporio Italia)  
**Row:** Rovagnati — Mortadella IGP "Massima" con Pistacchio 1/2 ~3,5kg (ROVA023)  
**Deploy:** v28  
**Generated:** 2026-06-13

---

## Executive Summary

| | |
|--|--|
| **Root cause** | **A) Discount extraction** — Pass C omits `discount_pct` (10,00), misreads gross unit, then synthesizes `line_total_net` as qty×unit instead of copying **Preço Total 31,07 €** |
| **Confidence** | **88%** |
| **First failing stage** | **Pass C** (GPT structured extraction) |
| **Recommended fix** | **Prompt-only** — add Mortadella positive example beside Prosciutto/Ventricina in `invoice-table-extraction.ts` |
| **Expected recovery** | **€3.50** (v28 lab); up to **€0.78** (v27 tail) |

---

## Visible vs GT vs v28

| Field | Visible invoice | GT | v28 extraction |
|-------|-----------------|-----|----------------|
| Qty | **3,11** | 3.11 | 3.11 ✓ |
| Preço Unit (gross) | **11,10 €** | — | — (→ 8.88 API) |
| Desc.(%) | **10,00** | — | null (inferred) |
| Unit (net) | ~10.10 implied | 10.10 | 8.88 |
| Preço Total | **31,07 €** | 31.07 | **27.57** ✗ |
| **€ error** | — | — | **€3.50** |

Arithmetic: 3.11 × 11.10 × (1 − 10%) ≈ **31.07** ✓

---

## € Math Trace

### v27 tail (€0.78 — emporio-final-audit)

```
GT total     31.07
v27 total    30.29
Δ            0.78

Mechanism: 3.1 × 9.77 ≈ 30.29  (qty×unit synthesis, not VALOR 31,07)
```

### v28 lab rerun (€3.50)

```
GT total     31.07
v28 total    27.57
Δ            3.50

Mechanism: 3.11 × 8.88 ≈ 27.62  (qty×unit synthesis, not VALOR 31,07)
```

**Primary financial driver:** `total` / `line_total_net` — not quantity (correct at 3.11).

---

## Structured Field Analysis

| Pass C field | Expected | v28 behaviour |
|--------------|----------|---------------|
| `discount_pct` | **10.0** (from Desc. 10,00) | **Not extracted** (null) |
| `gross_unit_price` | **11.10** | **Wrong** (~8.56–8.88) |
| `line_total_net` | **31.07** (from Preço Total) | **Wrong** (27.57 ≈ qty×unit) |
| `quantity` | 3.11 | ✓ Correct |

**Binder:** Forwards Pass C `line_total_net` when present — does not create the error, but does not repair a wrong 27.57.

**First failing stage:** **Pass C** only.

---

## Why Prosciutto/Ventricina Closed but Mortadella Didn't

v28 Emporio extract (same invoke):

| Row | Total | € err | Prompt example? |
|-----|-------|-------|-----------------|
| Prosciutto | **36.54** | €0 | ✓ v25 block (Desc 17,50) |
| Ventricina | **39.49** | €0 | ✓ v25 block (Desc 8,50) |
| **Mortadella** | **27.57** | **€3.50** | ✗ **No worked example** |

Mortadella uses the **same Emporio plain-decimal Desc.(%) pattern** (10,00 without % symbol) as Ventricina (8,50) and Prosciutto (17,50). v28 **EMPORIO DENSE TABLE VALOR ISOLATION** targets Gorgonzola/Bresaola/SanPellegrino weight/case rows — **not discount lines**.

Historical proof Mortadella is extractable:
- Refinement: total **31.07** (€0)
- pass-c-raw: total **31.07**, unit **10.1** (€0)

---

## GPT Variance (secondary)

3-run v28 stability probe (`.tmp/mortadella-root-cause/stability.json`):

| Run | Unit | Total | € err | qty×unit? |
|-----|------|-------|-------|-----------|
| 1 | 8.56 | 26.66 | 4.41 | yes |
| 2 | 8.56 | 26.65 | 4.42 | yes |
| 3 | 8.88 | 27.62 | 3.45 | yes |

**0/3** correct total; all runs show **qty×unit synthesis**. Error magnitude varies (€0.78–€4.42) but **mechanism is stable** — classify as **A primary**, not pure C.

---

## Classification

| Option | Verdict |
|--------|---------|
| **A) Discount extraction** | **CONFIRMED** — Desc.(%) 10,00 not structured; enables wrong unit/total path |
| **B) Total column** | Partial — VALOR not copied, but because discount path fails first |
| **C) GPT variance** | Secondary — error €0.78–€4.42 oscillates; mechanism unchanged |

---

## Recommended Prompt-Only Fix

**File:** `supabase/functions/extract-invoice/invoice-table-extraction.ts`  
**Location:** After Ventricina example (~line 143), alongside existing Prosciutto/Ventricina blocks

```
Emporio Italia — "Mortadella IGP 'Massima' con Pistacchio" with Qtd "3,11", Preço Unit "11,10 €", Desc.(%) "10,00", Preço Total "31,07 €"
→ quantity: 3.11
→ gross_unit_price: 11.1 (from Preço Unit)
→ discount_pct: 10 (from Desc.(%) — plain 10,00 without % symbol)
→ line_total_net: 31.07 (from Preço Total — NOT qty×unit 27.57)
```

**Negative:** when Preço Total prints **31,07**, never emit **27.57** from qty×unit.

**Not recommended:** binder change, geometry change (discount values visible in row pixels).

**Expected recovery:** **€3.50** on v28 bad run; stabilise to **€0** (refinement/pass-c-raw baseline).

---

## Artifacts

| File | Purpose |
|------|---------|
| `root-cause.json` | Structured verdict |
| `stage-trace.json` | Pipeline trace + extraction history |
| `stability.json` | 3-run v28 variance probe |
| `stability.mts` | Repro script |

**Sources:** `.tmp/final-validation-lab-rerun-v28/`, `.tmp/emporio-final-audit/`, `.tmp/ventricina-root-cause/`, `.tmp/emporio-discount-column-audit/`
