# Emporio Discount Column Failure — Audit Report

Generated: 2026-06-12  
Workspace: `/Users/salvadorseabra1/margin-master`  
Mode: **READ-ONLY**

---

## Executive Summary

Pass C fails to extract `discount_pct` on Emporio **not only Prosciutto** but all three focus meat rows (Prosciutto, Mortadella, Ventricina). Quantity and gross unit price extract reliably; discount column values are **visible in the image** but GPT returns `discount_pct: null` (inferred). Root cause is **GPT vision column selection** amplified by **header clipping** and **Emporio's plain-decimal discount format** (17,50 without %).

| Question | Answer |
|----------|--------|
| Discount column visible in crop? | **Values yes; header often clipped** |
| Missing on all rows? | **No** — partial on De Cecco/Gorgonzola |
| Missing on focus meat rows? | **Yes — 0/6 run-slots correct** |
| Tax/lot confusion? | **No** |
| Discount bleed? | **Yes** — Ventricina run 1 unit €17.50 |
| First stage discount disappears | **Pass C GPT structured output** |
| Fix category | **Prompt** (primary) + **Geometry** (secondary) |
| Confidence | **86%** |

---

## 1. Is discount column visible inside crop?

| Context | Desc.(%) header | Discount values (e.g. 17,50) |
|---------|-----------------|------------------------------|
| Full invoice | ✅ Visible | ✅ Visible |
| Row crop | ❌ Clipped | ✅ Visible (x 548–612) |
| Pass C table crop | ❌ **Clipped** (top≈456, headers y≈430) | ✅ In data rows |

**Geometry coordinates** (Prosciutto row, 724px wide):

| Column | Header | x range | Value |
|--------|--------|---------|-------|
| imposto | Imposto | 392–438 | IVA23 |
| qty | Qtd. | 438–478 | 4,30 |
| unit_price | Preço Unit. | 478–548 | 10,30 € |
| **discount_pct** | **Desc.(%)** | **548–612** | **17,50** |
| line_total | Preço Total | 612–724 | 36,54 € |

Source: `column-selection-deep-dive/column-reconstruction.json`, `column-layout.json`

---

## 2. OCR / vision

No separate OCR stage — GPT-4.1 vision reads the cropped table image directly.

- Discount **digits are readable** in row crops (`emporio-prosciutto-row-crop.png`)
- **No % symbol** on Emporio Desc.(%) values (unlike Bocconcino `20,00%`)
- Four right-aligned numerics in 286px — visually ambiguous without header labels

---

## 3. Pass C prompt for discount_pct

From `invoice-table-extraction.ts`:
- Maps `DESC / Desc.(%) / discount column → discount_pct`
- Instructs: strip % symbol; never put discount in gross_unit_price
- **Negative example:** Bocconcino Pomodor with explicit `20,00%`
- **No Emporio example** with plain `17,50` without %

Prompt assumes % suffix or column headers — Emporio provides neither in the crop GPT sees.

---

## 4. v23 live invoke — all rows (2 runs)

Deployment: **v23**. Image: `.tmp/emporio-footer-audit/emporio/invoice-full.b64.txt`

### Focus rows

| Product | Visible disc% | v23 R1 unit/total | v23 R2 unit/total | Inferred discount |
|---------|---------------|-------------------|-------------------|-------------------|
| **Prosciutto** | 17,50 | 10.60 / **45.58** | 10.72 / **46.10** | **MISSING** (qty×gross) |
| **Mortadella** | — | 11.10 / **34.52** | 11.10 / **34.41** | **MISSING** (qty×gross) |
| **Ventricina** | ~9.3% implied | **17.50** / **45.50** | 14.00 / **36.40** | **BLEED** / MISSING |

### All rows discount inference

| Row | R1 pattern | R2 pattern |
|-----|------------|------------|
| De Cecco | PARTIAL (total≈GT) | PARTIAL |
| Gorgonzola | PARTIAL | PARTIAL |
| Prosciutto | MISSING | MISSING |
| Mortadella | MISSING | MISSING |
| Pellegrino | qty×unit | qty×unit |
| Bresaola | PARTIAL | MISSING |
| Ginger Beer | wrong qty | GT match |
| Ventricina | **BLEED 17.5** | MISSING |

**Structured `discount_pct` in API:** 0/8 rows (stripped by design; inferred null at GPT layer)

---

## 5. Missing on all rows or only Prosciutto?

**Emporio-wide on discounted meat rows — not Prosciutto-only.**

- Prosciutto, Mortadella, Ventricina: **0% discount extraction accuracy** (2 runs each)
- De Cecco: partial — total near GT (€50.4 vs €50.2), discount implicit via line total only
- Historical: Prosciutto 5-run showed discount bleed (€17) **and** missing; Ventricina refined pass copied gross unit with correct total

---

## 6. Confusion checks

| Hypothesis | Verdict |
|------------|---------|
| Discount confused with **tax** (IVA23)? | **NO** — separate column x 392–438 |
| Discount confused with **lot/expiry**? | **NO** — dates in Lotes x 52–108 |
| Discount confused with **gross price**? | **YES** — primary failure mode |
| Discount copied **into unit_price**? | **YES** — Ventricina €17.50; historical Prosciutto €17 |

---

## 7. Pipeline trace

```
Visible invoice     ✅ Desc 17,50 visible between Preço Unit and Total
       ↓
Geometry crop       ⚠️ Headers clipped; values in crop
       ↓
GPT vision          ⚠️ Reads gross/qty; skips plain decimal discount
       ↓
Pass C structured   ❌ discount_pct null (FIRST FAILURE)
       ↓
Binder              ⚠️ gross→unit; qty×gross→total when net null
       ↓
API                 legacy keys only
```

---

## 8. Root cause

**GPT Pass C column mis-identification on Emporio Desc.(%) field** — not a schema or binder bug.

Three reinforcing factors:
1. **Format:** `17,50` without `%` — looks like a price
2. **Geometry:** `Desc.(%)` header clipped from Pass C crop
3. **Prompt:** Examples use Bocconcino `%`-suffix format, not Emporio plain decimals

v23 strict schema **requires** `discount_pct` key but allows `null` — GPT complies with null.

---

## 9. Recommended fix category

| Category | Priority | Action |
|----------|----------|--------|
| **Prompt** | **PRIMARY** | Emporio negative example: `17,50` in Desc.(%) → `discount_pct: 17.5`; positional rule for decimals between unit and total columns |
| **Geometry** | SECONDARY | Verify Emporio crop includes header row (test expects top ≤ 430) |
| Schema | Low | Already enforced; optional post-parse guard |
| OCR | N/A | No separate stage |

---

## 10. Financial impact (focus rows vs VL GT)

| Product | v23 worst total error |
|---------|----------------------|
| Prosciutto | +€10.87 (€46.10 vs €35.14) |
| Mortadella | +€3.45 (€34.52 vs €31.07) |
| Ventricina | +€6.01 (€45.50 vs €39.49) |

---

## Confidence: 86%

- Row crops + column coordinates confirm discount visible
- v23 invokes + binder simulation match gross-without-discount pattern
- No raw GPT JSON logged (14% uncertainty)

---

## Artifacts

| File | Contents |
|------|----------|
| `discount-accuracy.json` | Row-by-row accuracy table |
| `discount-stage-trace.json` | Pipeline stages |
| `root-cause.json` | Verdict + fix category |
| `REPORT.md` | This report |
