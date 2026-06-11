# Emporio Italia Validation Lab — Investigation Report

**Invoice ID:** `17aa3591-ec98-4c21-89c9-5ae946bc97bb`  
**Supplier:** Emporio Italia, Lda.  
**Date:** 2026-05-19  
**Evidence dir:** `.tmp/emporio-italia-investigation/`

---

## Issue #1 — Invoice total extraction failure

### Stage results

| Stage | Result | Evidence |
|-------|--------|----------|
| DB persistence | `invoices.total = 0` | `invoice-meta.json` |
| extract-invoice (deployed) | `total: null`, no net_subtotal/vat | `extract-invoice-response.json` |
| Footer crop (`cropBottomPortion`) | 724×273 px, starts y≈851 on 1124 px page | `footer-crop.png` — IVA breakdown + banking only |
| Fraction crop (55% bottom, no table anchor) | Includes Subtotal 278.16, Impostos 49.30, **Total 327.46** | `footer-fraction-crop.png` |
| Table bounds detection | `bottom: 851`, `totalsStart: 827` | `footer-evidence.json` |
| `computeFooterCropStartY` | `max(fractionY=506, tableBottom=851) → 851` | Anchored crop excludes totals grey box |
| GPT footer pass | Not run locally (no OPENAI_API_KEY); deployed returned null | Consistent with crop missing totals |
| `parseFooterMetadataExtraction` | N/A — no numeric fields to parse | — |
| `validateFooterMetadataArithmetic` | N/A | — |
| Client persistence | `ext.total` null → forced **0** | `src/routes/invoices.tsx:1462` |

### Root cause

**Footer crop misses the document totals band.**

Emporio Italia uses a **white-background** template with a distinct layout:

1. Line-item table (white)
2. **Grey totals summary box** — Descontos / Subtotal / Impostos / **Total** (right-aligned)
3. IVA breakdown table (IVA6 / IVA23 / IVA13)
4. Banking details + “Pagina 1 de 2”

`detectTableBounds` finds a strong horizontal edge at y≈827 (IVA breakdown header). With `nearSearchBoundary` + `BOUNDARY_BOTTOM_PADDING=190`, `tableBounds.bottom` becomes 851. `computeFooterCropStartY` takes `max(fractionStartY, tableBottom)`, so the crop starts at **y=851** — **below** the grey totals box (~y 700–820).

GPT receives a crop showing only IVA rows and bank details; no Subtotal/Total labels → returns `null` for all fields.

Compare to Bidfood/Aviludo (grey-header templates): totals sit at the bottom of the detected table band, so table-anchored footer crops still capture TOTAL / VALOR A PAGAR.

### Persistence chain

```
footer pass → total: null
  → extract-invoice response total: null
  → invoices.tsx upload: total = (ext.total > 0) ? ext.total : 0
  → DB total = 0.00
```

Re-extract path (`:2101`) preserves existing total when extraction returns null, but initial upload always writes 0.

### Recommended fix direction

1. **Footer crop geometry:** For white-background templates, do not let `tableBounds.bottom` push the crop start below the totals summary. Options:
   - Cap table-anchored start at `min(tableBottom, fractionStartY + offset)` when totals band is above detected edge
   - Detect the grey totals box (luminance band between table and IVA section)
   - Fall back to fraction-only crop when anchored crop height < threshold or anchored crop excludes a detected totals band
2. **Prompt labels:** Add Emporio-style labels (`Subtotal`, `Impostos`, `Total`, `Descontos`) to footer extraction prompt examples.
3. **Persistence (optional):** Avoid overwriting with 0 when footer pass returns null but line items sum matches a visible subtotal (secondary safeguard).

---

## Issue #2 — Ginger Beer volume conversion

### Field trace

| Field | Extracted | Parsed volume | Computed usable | Expected (33cl SKU) |
|-------|-----------|---------------|-----------------|---------------------|
| Description | `Baladin - Ginger Beer 0.20cl` | 0.20 CL → **2 ml/unit** | **48 ml** total | **7,920 ml** (330 ml × 24) |
| Product code | `BBB-GINGER33ITA` | — | — | implies **33 cl** bottle |
| Qty | 24 un | — | 24 × 2 ml | 24 × 330 ml |
| Unit price | €0.85/un | — | — | €0.85/un |
| Line total | €19.38 | — | — | €19.38 ✓ |
| Usable cost | — | — | **€425/L** | ~€2.57/L |

### Mathematical explanation of 48 ml and €425/L

The OCR/table pass transcribed the bottle size as **`0.20cl`** (likely a typo for **33cl** per SKU `GINGER33`, or **20cl**).

`detectVolume()` in `src/lib/ingredient-unit-inference.ts`:

```
/(\d+(?:[.,]\d+)?)\s*CL\b/  →  toMl(n) = n × 10
"0.20cl" → 0.20 × 10 = 2 ml per unit
```

Stock normalization (`resolveStructuredPurchaseForDisplay` → `stock-normalization.ts`):

```
2 ml/unit × 24 units = 48 ml usable
```

Cost (`computeEffectiveUsableCost` in `invoice-purchase-price-semantics.ts`):

```
litersPerPurchase = 2 ml / 1000 = 0.002 L
€0.85 / 0.002 L = €425/L
```

Verified by `src/lib/emporio-ginger-probe.test.ts` (probe run during investigation).

### Root cause + code path

1. **Extraction:** Table pass copies `0.20cl` literally from invoice PDF (visible on full image).
2. **Volume parse:** `detectVolume` treats decimal CL literally — no sanity check for sub-10ml beverage bottles.
3. **No SKU cross-check:** Product code `BBB-GINGER33ITA` encodes 33cl but is not used for volume inference.
4. **No suppression:** `isImpossibleUsableQuantity` only caps at 500,000 ml; 48 ml passes validation.

### Recommended fix direction

1. **Volume sanity floor:** Reject or flag CL/ML tokens yielding < ~50 ml for beverage SKUs (similar to `isCollapsedMeaninglessUsable`).
2. **Leading-zero / OCR repair:** Treat patterns like `0.XXcl` where XX ≥ 10 as `XXcl` (0.33cl → 33cl) when product context is liquid.
3. **SKU hint:** Parse embedded size from product codes (`GINGER33` → 330 ml).
4. **Human review flag:** Surface €425/L as critical pricing badge (may already exist for extreme costs).

---

## Summary

| Pass | Status | One-line fix |
|------|--------|--------------|
| **Table** | ✅ PASS | — (8 lines, subtotal 278.16 verified) |
| **Footer** | ❌ FAIL | Table-anchored footer crop starts below Emporio totals box → GPT returns null → persisted as 0 |
| **Volume** | ❌ FAIL | `0.20cl` parsed as 2 ml/bottle (not 33cl) → 48 ml and €425/L |

### Evidence files

| File | Contents |
|------|----------|
| `invoice-full.png` | Full page screenshot (724×1124) |
| `footer-crop.png` | Actual footer pass crop (missing totals) |
| `footer-fraction-crop.png` | 55% bottom crop (includes totals) |
| `extract-invoice-response.json` | Live re-invocation of extract-invoice |
| `invoice-items.json` | All 8 persisted line items |
| `ginger-beer-item.json` | Ginger Beer row |
| `footer-evidence.json` | Crop geometry + DB state |
| `volume-evidence.json` | Volume math trace |
