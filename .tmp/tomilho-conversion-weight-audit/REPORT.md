# Fresh Herb Conversion Weight Audit

**Validation Lab:** `bjhnlrgodcqoyzddbpbd`
**Mode:** STRICT READ-ONLY — no code changes, no DB writes, no deployments
**Generated:** 2026-06-24T01:42:50.131Z

---

## Executive Summary

PRODUCE_CONVERSION_HINTS **fresh herbs** group: **5** tokens at **100 g/bunch** (commit `04cefd7c`, 2026-05-18). **Missing:** TOMILHO, ALECRIM, ESTRAGAO. VL bunch herbs: **Manjericão** (SAFE, €20.60/kg) vs **Tomilho** (MISSING, no operational). At €2.06/bunch, 100g → **€20.60/kg** and recipe denominator **100g** (same as Manjericão).

**100g origin:** **A — generic herb assumption** (single group value, not product-specific, no restaurant data).

**FINAL VERDICT:** **A** — 100g for Tomilho is consistent with existing herb-conversion architecture (shared fresh-herbs group estimate).

---

## TASK 1 — PRODUCE_CONVERSION_HINTS Origin

| Token | Conversion | First Introduction | Comments | Tests |
|-------|------------|-------------------|----------|-------|
| MANJERICAO | 100g | 2026-05-18 `04cefd7` | fresh herbs group; confidence 0.58; not persisted | No herb-specific 100g test |
| SALSA | 100g | 2026-05-18 `04cefd7` | fresh herbs group; confidence 0.58; not persisted | No herb-specific 100g test |
| COENTROS | 100g | 2026-05-18 `04cefd7` | fresh herbs group; confidence 0.58; not persisted | No herb-specific 100g test |
| HORTELA | 100g | 2026-05-18 `04cefd7` | fresh herbs group; confidence 0.58; not persisted | No herb-specific 100g test |
| CEBOLINHO | 100g | 2026-05-18 `04cefd7` | fresh herbs group; confidence 0.58; not persisted | No herb-specific 100g test |
| TOMILHO | — | — | absent from table | none |
| ALECRIM | — | — | absent from table | none |
| ESTRAGAO | — | — | absent from table | none |

Git blame: entire PRODUCE_CONVERSION_HINTS block introduced in single commit `04cefd7c` ("Add conservative ingredient matching and invoice identity improvements"). All five in-table herbs added together at 100g.

---

## TASK 2 — Architecture Audit

**Why all share 100g?** Category-level `estimatedQuantity` per hint entry — not per-herb weights. Pattern mirrors leafy produce (500g × 7 tokens) and whole vegetable (700g × 4 tokens).

**"1 bunch herb = 100g"?** Yes in pipeline: `detectConversionHint` → `estimated_quantity: 100` → `resolveUsablePerPricedUnit` = 100g per priced bunch → `computeEffectiveUsableCost` → €/kg.

**Evidence:**
- `ingredient-unit-inference.ts` L412-417, L426-429, L443
- `stock-normalization.ts` L1690-1695
- `invoice-purchase-format.test.ts` — ALFACE `estimated_yield` (500g group analogue)
- No test asserts per-herb bunch gram weight
- Hortelã VL: purchased by kg (`weight_or_volume`); code HORTELA token exists but operational €5.40/kg comes from invoice kg price, not 100g/bunch math

---

## TASK 3 — VL Corpus

| Product | Purchase Unit | Conversion | Operational Cost | Invoice Rows | Recipe Lines |
|---------|---------------|------------|------------------|--------------|--------------|
| Manjericão | mo | 100 g/bunch | €20.60 / kg | 1 | 0 |
| Salsa | — | — | — | 0 | 0 |
| Coentros | — | — | — | 0 | 0 |
| Hortelã | kg | code hint 100g; VL row `weight_or_volume` (0.5 kg) | €5.40 / kg | 1 | 0 |
| Cebolinho | — | — | — | 0 | 0 |
| Tomilho | mo | — | — | 1 | 0 |
| Alecrim | — | — | — | 0 | 0 |
| Estragão | — | — | — | 0 | 0 |

---

## TASK 4 — Safety Analysis (TOMILHO → 100g)

| Aspect | Current | If TOMILHO → 100g |
|--------|---------|-------------------|
| Operational | null | €20.60 / kg |
| Recipe denominator | purchase_quantity=1, cost_base_unit=un | purchase_quantity=100, cost_base_unit=g |
| 1g recipe cost | null | €0.0206 |
| 10g recipe cost | null | €0.206 |
| Manjericão (reference) | €20.60/kg, pq=100 | unchanged |

**Side effects:** structured.kind inferred; operational display appears; recipe g-costing enabled on re-read. **Existing ingredients:** Manjericão and other table herbs unchanged. Tomilho DB row (pq=1, un) unchanged until persistence re-read. **VL recipe_ingredients for Tomilho:** 0.

---

## TASK 5 — Family (ALECRIM, ESTRAGAO)

**YES** — same architectural gap (missing from fresh herbs token list). VL: **0** invoice rows, **0** catalog ingredients for Alecrim/Estragão. Would follow identical 100g group pattern if tokens added.

---

## TASK 6 — Blast Radius

| Scope | Bunch Rows | Products | Row IDs |
|-------|------------|----------|---------|
| TOMILHO only | 1 | Tomilho | 1 |
| TOMILHO+ALECRIM+ESTRAGAO | 1 | Tomilho | ALECRIM and ESTRAGAO contribute 0 VL rows |

---

## Required Table

| Herb | Current Conversion | Intended Conversion | Evidence Level |
|------|-------------------|---------------------|----------------|
| Manjericão | 100 g/bunch (fresh herbs group) | 100 g/bunch (fresh herbs group pattern) | code+VL |
| Salsa | 100 g/bunch (fresh herbs group) | 100 g/bunch (fresh herbs group pattern) | code-only |
| Coentros | 100 g/bunch (fresh herbs group) | 100 g/bunch (fresh herbs group pattern) | code-only |
| Hortelã | 100 g/bunch (fresh herbs group) | 100 g/bunch (fresh herbs group pattern) | code+VL |
| Cebolinho | 100 g/bunch (fresh herbs group) | 100 g/bunch (fresh herbs group pattern) | code-only |
| Tomilho | — | 100 g/bunch (fresh herbs group pattern) | VL-gap |
| Alecrim | — | 100 g/bunch (fresh herbs group pattern) | none |
| Estragão | — | 100 g/bunch (fresh herbs group pattern) | none |

---

## 100g Origin Verdict

**A — generic herb assumption**

Evidence: single `fresh herbs` group, one `estimatedQuantity: 100` for all five in-table tokens; parallel category-level design (leafy 500g, vegetable 700g). Not product-specific (Hortelã kg row still uses HORTELA token). No restaurant/yield measurement data. Confidence 0.58 and "estimated" wording indicate heuristic, but applied uniformly as category rule — not arbitrary per-product placeholder.

---

## FINAL VERDICT

**A** — Is 100g for Tomilho consistent with existing herb-conversion architecture? **Yes.** Tomilho at 100g would use the same fresh-herbs group semantics as MANJERICAO, SALSA, COENTROS, HORTELA, CEBOLINHO.

---

## Evidence Files

- `.tmp/tomilho-conversion-weight-audit/results.json`
- Prior: `.tmp/fresh-produce-conversion-audit/`, `.tmp/manjericao-audit/`, `.tmp/tomilho-audit/`
