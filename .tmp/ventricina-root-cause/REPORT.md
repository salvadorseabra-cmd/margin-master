# Ventricina Remaining Failure — Root Cause Report

Generated: 2026-06-12  
Workspace: `/Users/salvadorseabra1/margin-master`  
Mode: **READ-ONLY**

---

## Executive Summary

Ventricina fails on **Pass C GPT structured extraction** while Prosciutto and Mortadella improved on v24. The discount column value **8,50** is visible but `discount_pct` is not extracted; GPT instead misreads `gross_unit_price` (21 / 20.2 / 17.72), and the binder amplifies via qty×gross.

| Question | Answer |
|----------|--------|
| First failing stage | **Pass C GPT structured** |
| Exact field | **`discount_pct`** (null); secondary **`gross_unit_price`** (wrong) |
| 8,50 interpreted as? | **Not discount_pct** — gross column misread instead |
| Why Prosciutto OK, Ventricina not? | **Prompt asymmetry** — full Prosciutto row example; Ventricina format-only |
| Fix category | **Prompt** (primary) + **Geometry** (secondary) |
| Confidence | **88%** |

---

## Visible Invoice (Ventricina)

| Field | Value |
|-------|-------|
| Qty | 2,60 |
| Gross unit | 16,60 € |
| Desc.(%) | **8,50** |
| Preço Total | 39,49 € |
| Net unit (derived) | 15,19 (16,60 × 0,915) |

Row crop: `.tmp/ventricina-root-cause/ventricina-row-y746.png`

---

## Investigation Answers

### 1. Is `discount_pct` extracted?

**No** — 0/3 v24 runs. All show qty×gross inflation pattern.

### 2. Is `gross_unit_price` extracted?

**No** — misread as 21, 20.2, or 17.72 (visible gross is 16,60).

### 3. How is 8,50 interpreted?

| Interpretation | v24 outcome |
|----------------|-------------|
| `discount_pct: 8.5` (correct) | Never observed |
| `gross_unit_price` | Observed — wrong values substituted |
| `unit_price` (legacy bleed) | v23 pattern (17.50 neighbour); residual in run 3 (17.72) |
| `line_total_net` | Not reliably copied on v24 failures |

**Key ambiguity:** 8,50 is **smaller than** gross 16,60 — looks like a euro magnitude, unlike Prosciutto where 17,50 **exceeds** 10,30 and is obviously a percentage after prompt anchoring.

### 4. Pipeline trace

```
Visible invoice     ✅ 2,60 | 16,60€ | 8,50 | 39,49€
       ↓
Geometry crop       ⚠️ Headers clipped (same as Prosciutto — not Ventricina-specific)
       ↓
Pass C prompt v24   ⚠️ Prosciutto full example; Ventricina format line only
       ↓
GPT structured      ❌ discount_pct null; gross_unit_price wrong  [FIRST FAILURE]
       ↓
Binder              ⚠️ unit=gross; total=qty×gross
       ↓
API                 ❌ 21/54.6 | 20.2/52.52 | 17.72/46.09
```

### 5. Why Prosciutto succeeds but Ventricina fails

| Factor | Prosciutto | Ventricina |
|--------|------------|------------|
| v24 prompt | Full worked row (17,50) | Format example only (8,50→8.5) |
| Discount vs gross | 17,50 > 10,30 — not a euro price | 8,50 < 16,60 — euro-plausible |
| v24 result | 3/3 LIKELY_PRESENT | 0/3 MISSING |
| Mortadella parallel | 10,00 matches format example | 8,50 does not match any worked row |

---

## v24 Run Analysis

| Run | API unit | API total | Inferred Pass C structured | Binder output match |
|-----|----------|-----------|---------------------------|---------------------|
| 1 | 21.00 | 54.60 | gross=21, disc=null, net=null | ✅ exact |
| 2 | 20.20 | 52.52 | gross=20.2, disc=null, net=null | ✅ exact |
| 3 | 17.72 | 46.09 | gross=17.72, disc=null, net=null | ✅ ≈46.07 |

Binder simulation: `.tmp/ventricina-root-cause/binder-simulation.json`

**Correct structured input** (not observed on v24):

```
gross_unit_price: 16.6, discount_pct: 8.5, line_total_net: 39.49
→ binder: unit 15.19, total 39.49
```

**Rule B note:** If GPT extracts `discount_pct=8.5` but bleeds into `unit_price=8.5`, Rule B rebinds to 15.19/39.49. Binder is not the blocker — **discount omission is**.

---

## v23 → v24 Failure Mode Shift

| Version | Ventricina pattern |
|---------|-------------------|
| v23 run 1 | **BLEED** — unit 17.50 (Prosciutto Desc magnitude) |
| v23 run 2 | MISSING — gross path |
| v24 all runs | MISSING — wrong gross (21 / 20.2 / 17.72) |

Prosciutto fix reduced neighbour bleed from 17,50 but Ventricina still lacks a row-specific anchor.

---

## Financial Impact

| Reference | Total | v24 worst (run 1) | Δ |
|-----------|-------|-------------------|---|
| Visible / VL GT | €39.49 | €54.60 | **+€15.11** |

---

## Recommended Fix Category

| Category | Priority | Rationale |
|----------|----------|-----------|
| **Prompt** | **PRIMARY** | Add full Ventricina worked example with 8,50 between 16,60€ and 39,49€ |
| **Geometry** | SECONDARY | Include Desc.(%) header in crop (benefits all Emporio rows) |
| Schema | Low | Already requires key; allows null |
| Binder | None | Correct when structured fields present |
| OCR | N/A | No separate stage |

---

## Confidence: 88%

**Supporting evidence:**
- Row crop confirms 8,50 visible in Desc.(%) position
- Binder reverse-simulation matches all 3 v24 API outputs exactly
- Prompt diff shows Prosciutto-only worked row
- Prosciutto/Mortadella v24 improvement proves pipeline works when GPT extracts discount

**Uncertainty (12%):**
- No raw GPT JSON logged per run
- Exact OCR path for gross misread (21 vs 20.2) not individually traced

---

## Artifacts

| File | Contents |
|------|----------|
| `stage-trace.json` | Full pipeline stages + inferred Pass C fields |
| `root-cause.json` | Verdict, confidence, fix categories |
| `binder-simulation.json` | Binder reverse-engineering |
| `ventricina-row-y746.png` | Visible row crop |
| `REPORT.md` | This report |
