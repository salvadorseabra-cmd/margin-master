# Qtd Strip Precision Audit — Gorgonzola 1,35 → 1.30

**Invoice:** `ab52796d-de1d-418d-86e7-230c8f056f09` · **Deploy v40 prepass:** 1.30 · **PDF ground truth:** 1.35 · 2026-06-24

## Executive verdict

**Root cause: crop width.** The production Qtd strip is **41px** wide (`EMPORIO_QTD_COLUMN_X_FRAC` 0.605–0.661 on 724px). The digit **5** in **1,35** is right-aligned and **partially clipped** at the strip's right edge. GPT prepass (v40) correctly reads the clipped image as **1.30** — not a prompt or anchoring bug at source. Widening the strip to **≥60px** reveals the full **1,35**.

| Question | Answer |
|----------|--------|
| 1. Crop issue? | **YES** — 41px strip clips digit 5 |
| 2. Resolution issue? | **NO** — 724px raster is sufficient; full row shows 1,35 clearly |
| 3. Prompt issue? | **NO** — QTD_STRIP prompt says read 1,35 exactly |
| 4. GPT vision issue? | **Secondary** — model reads what is visible (1,3 + clipped stroke → 1.30) |
| 5. Smallest safe fix? | **Widen x1 to ~0.685** (+17px) or add 12px right pad after crop |

## T1 — Exact Qtd strip export (Gorgonzola)

| Asset | Dimensions | Source |
|-------|------------|--------|
| `production-qtd-strip-full.png` | 41×421px | `cropQtdColumnStrip(table-crop)` |
| `gorgonzola-qtd-strip-exact.png` | 41×42px | row y=48 within strip |
| Geometry | x0=438, x1=479 | `EMPORIO_QTD_COLUMN_X_FRAC` |

## T2 — Strip width & resolution

- Table crop: **724×421px**
- Production Qtd strip: **41×421px** (sent to GPT prepass)
- Gorgonzola row band: **41×42px**
- No upscaling before OCR

## T3 — Width comparison (41 / 60 / 80 px)

| Width | File | Digit 5 visible? | Clipped? |
|-------|------|----------------|----------|
| 41px | `gorgonzola-qtd-strip-41px.png` | PARTIAL | **YES** |
| 60px | `gorgonzola-qtd-strip-60px.png` | YES | NO |
| 80px | `gorgonzola-qtd-strip-80px.png` | YES | NO |

## T4 — OCR results per width

OPENAI_API_KEY not set — OCR skipped. Reference:

| Width | Expected visual / v40 |
|-------|----------------------|
| 41px | **1.30** (v40 live prepass — clipped 5) |
| 60px | **1.35** (full digit visible) |
| 80px | **1.35** (full digit visible) |

## T5 — Digit 5 clipping analysis

- **41px strip clipped:** **YES**
- Evidence: Ink extends to column 79 in 80px reference but 41px strip ends at column 40; rightmost ink in 41px at column 40
- Rightmost ink column (41px): **40** (0-indexed, width=41)
- 80px reference rightmost ink: **79**

## T6 — First stage where 1.35 → 1.30

```
PDF 1,35
  → cropTableRegionForLineItems (table crop OK — full 1,35 visible in row)
  → cropQtdColumnStrip (41px — digit 5 CLIPPED)
  → runQuantityPrePass / QTD_STRIP_SYSTEM_PROMPT
  → GPT returns ocr_quantity: 1.30  ← FIRST WRONG VALUE
  → anchorQuantities (1.30 vs pass_c 1.05 → anchors 1.30)
```

Prior v39 failure (prepass=2) was **fraction metadata override** on full table crop. v40 QTD strip mode fixed 2→1.30 but **did not fix strip geometry**.

## T7 — Recommended smallest safe fix

**Change:** `EMPORIO_QTD_COLUMN_X_FRAC.x1` from `0.661` → `~0.685` (+17px on 724px → ~58px strip)

**Why safe:** Preço Unit column starts at x≈478; widening to x1≈496 keeps ~8px margin before unit price bleed.

**Alternative:** `QTD_STRIP_RIGHT_PAD_PX = 12` applied in `cropQtdColumnStrip` after fractional crop.

**Not sufficient alone:** Prompt changes — digit is physically absent from 41px image.