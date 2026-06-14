# Stability Test Results — Before vs After Hardening

**Invoice:** AVILUDO April (`c2f52357-0f80-491a-ba14-c97ff4837472`)  
**Image:** `.tmp/vl-ocr-rc/full.png` (full page)  
**Model:** gpt-4.1, 4-pass vision-json pipeline

---

## Before (baseline — pre-hardening)

**Source:** `.tmp/vl-ocr-rc/ocr-stability-runs.json`  
**Runs:** 3  
**Config:** no `temperature` / `seed` (model defaults)

### Anchovas line (full crop)

| Run | OCR name |
|-----|----------|
| 1 | `Filete de Anchoas Alfonsica Ll 495 g` |
| 2 | `Filete de Anchoas Alfonsoita LI 495 g` |
| 3 | `Filete de Anchoas Alfonsica Li 495 g` |

**Distinct Anchovas variants:** 3/3  
**Distinct full item-list signatures:** 3/3  

Other lines also varied (gema qty 3→5→8, pepino spelling, atum vs azeite, chocolate qty/unit).

---

## After (post-hardening)

**Source:** `.tmp/ocr-hardening-stability/ocr-stability-runs-after.json`  
**Runs:** 5  
**Config:** `temperature: 0`, `seed: 42`  
**Invocation:** VL `extract-invoice` (deployed hardened code)

### Anchovas line (full crop)

| Run | OCR name |
|-----|----------|
| 1 | `Filete de Anchoas Alconfirosa LI 495 g` |
| 2 | `Filete de Anchoas Alconfirosa LI 495 g` |
| 3 | `Filete de Anchoas Alconfirosa LI 495 g` |
| 4 | `Filete de Anchoas Alconfirosa LI 495 g` |
| 5 | `Filete de Anchoas Alconfirosa LI 495 g` |

**Distinct Anchovas variants:** 1/5 ✅  
**Distinct full item-list signatures:** 1/5 ✅  

### Stable after-run extraction (all 5 runs identical)

| Line | qty | unit | unit_price | total |
|------|-----|------|------------|-------|
| Filete de Anchoas Alconfirosa LI 495 g | 2 | un | 9.99 | 19.98 |
| Ovo Líquido Past.Gema Dovo 1 Kg | 6 | un | 10.49 | 62.94 |
| Pepinos Extra Uli Frasco 6x720 g | 1 | cx | 22.49 | 22.49 |
| Atum Oleo Bolsa Nau Catrineta 1 Kg | 1 | un | 13.1 | 13.1 |
| Arroz Agulha Metro Chef 12x1 kg | 1 | cx | 13.95 | 13.95 |
| Chocolate Culinaria Pantagruel 10x200 g | 2 | cx | 29.99 | 59.98 |
| Açucar Branco METRO Chef 10x1 Kg | 1 | cx | 9.99 | 9.99 |
| Nata Culinaria 22% Reny Picot 6x1 Lt | 5 | cx | 18.89 | 94.45 |

**Footer total:** 330.42 (consistent)  
**Avg elapsed:** ~15.4s/run (range 13.0–20.1s)

---

## Comparison summary

| Metric | Before (3 runs) | After (5 runs) |
|--------|-----------------|----------------|
| Anchovas distinct variants | 3 | **1** |
| Full item-list distinct signatures | 3 | **1** |
| Anchovas stability rate | 0% | **100%** |

---

## Notes

- Local `OPENAI_API_KEY` was not in `.env.local`; live validation used VL deploy + anon key invoke (`.tmp/ocr-hardening-stability/run-vl-stability.mts`).
- Baseline used 3 runs; after used 5 runs for stronger confidence.
- After-run OCR spelling (`Alconfirosa`) differs from any single before-run spelling — hardening stabilizes output, not necessarily toward a specific prior variant.
- Row-crop / table-only stability from baseline was not re-tested post-hardening (full-page path is the production re-read path).
