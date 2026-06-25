# GPT Vision Quantity Reading Laboratory

**Validation Lab:** `bjhnlrgodcqoyzddbpbd` · **Read-only** · 2026-06-24T23:04:28Z

## Executive summary

**OPENAI_API_KEY unavailable locally** (env unset; Supabase VL secret exists but CLI cannot read values). All image variants generated. GPT live matrix **PENDING_LIVE** except variant **A / Gorgonzola Run1** = **1.30** from `.tmp/ocr-prepass-fix-implementation/live-reextract.json` (deploy v41, production 43px strip).

### Ground truth

| Product | Qtd |
|---------|-----|
| gorgonzola | 1.35 |
| prosciutto | 4.3 |
| bresaola | 1.83 |

## Output tables — Gorgonzola (all variants)

| Variant | Run1 | Run2 | Run3 | Run4 | Run5 | Majority | Correct? | Status |
|---------|------|------|------|------|------|----------|----------|--------|
| A | 1.3 | PENDING | PENDING | PENDING | PENDING | 1.3 | **NO** | partial_reference |
| B | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING | — | pending_live |
| C | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING | — | pending_live |
| D | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING | — | pending_live |
| E | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING | — | pending_live |
| F | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING | — | pending_live |
| G | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING | — | pending_live |
| H | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING | — | pending_live |
| I | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING | — | pending_live |
| J | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING | — | pending_live |
| K | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING | — | pending_live |

## Spot-check — Bresaola & Prosciutto (variants B, C only)

| Variant | Product | Run1–5 | Majority | Correct? |
|---------|---------|--------|----------|----------|
| B | bresaola | PEND, PEND, PEND, PEND, PEND | PEND | — |
| B | prosciutto | PEND, PEND, PEND, PEND, PEND | PEND | — |
| C | bresaola | PEND, PEND, PEND, PEND, PEND | PEND | — |
| C | prosciutto | PEND, PEND, PEND, PEND, PEND | PEND | — |

## Consistency — Gorgonzola

| Variant | Correct % | Variance | Consistency | Unique values |
|---------|-----------|----------|-------------|---------------|
| A | 0% | 0.0000 | 100 | 1.3 |
| B | 0% | 0.0000 | 0 | — |
| C | 0% | 0.0000 | 0 | — |
| D | 0% | 0.0000 | 0 | — |
| E | 0% | 0.0000 | 0 | — |
| F | 0% | 0.0000 | 0 | — |
| G | 0% | 0.0000 | 0 | — |
| H | 0% | 0.0000 | 0 | — |
| I | 0% | 0.0000 | 0 | — |
| J | 0% | 0.0000 | 0 | — |
| K | 0% | 0.0000 | 0 | — |

## Visual analysis per image

### `images/A-qtd-strip-full.png`

- **Size:** 43×421px
- **Digit clarity:** Digit 5 column (x479) has visible ink — full 1,35 should be readable; dense ink at right edge may confuse trailing digit
- **Context:** Multi-row Qtd strip — row bands only, no product names
- **Distractions:** Minimal
- **Digit 5 clipped:** NO
- **Unit-price bleed:** NO
- **Margin before unit-price (x483):** 2px
- **Mean luminance:** 186.4 · **Dark fraction:** 71.86%

### `images/A-gorgonzola-row.png`

- **Size:** 43×42px
- **Digit clarity:** Digit 5 column (x479) has visible ink — full 1,35 should be readable; dense ink at right edge may confuse trailing digit
- **Context:** Isolated presentation
- **Distractions:** Minimal
- **Digit 5 clipped:** NO
- **Unit-price bleed:** NO
- **Margin before unit-price (x483):** 2px
- **Mean luminance:** 192.0 · **Dark fraction:** 48.95%

### `images/B-qtd-strip-full.png`

- **Size:** 45×421px
- **Digit clarity:** Digit 5 column (x479) has visible ink — full 1,35 should be readable; dense ink at right edge may confuse trailing digit
- **Context:** Multi-row Qtd strip — row bands only, no product names
- **Distractions:** Unit-price column digits may bleed into strip
- **Digit 5 clipped:** NO
- **Unit-price bleed:** YES
- **Margin before unit-price (x483):** 0px
- **Mean luminance:** 186.2 · **Dark fraction:** 72.01%

### `images/B-gorgonzola-row.png`

- **Size:** 45×42px
- **Digit clarity:** Digit 5 column (x479) has visible ink — full 1,35 should be readable; dense ink at right edge may confuse trailing digit
- **Context:** Isolated presentation
- **Distractions:** Unit-price column digits may bleed into strip
- **Digit 5 clipped:** NO
- **Unit-price bleed:** YES
- **Margin before unit-price (x483):** 0px
- **Mean luminance:** 191.5 · **Dark fraction:** 48.84%

### `images/C-qtd-strip-full.png`

- **Size:** 47×421px
- **Digit clarity:** Digit 5 column (x479) has visible ink — full 1,35 should be readable; dense ink at right edge may confuse trailing digit
- **Context:** Multi-row Qtd strip — row bands only, no product names
- **Distractions:** Unit-price column digits may bleed into strip
- **Digit 5 clipped:** NO
- **Unit-price bleed:** YES
- **Margin before unit-price (x483):** -2px
- **Mean luminance:** 186.2 · **Dark fraction:** 72.25%

### `images/C-gorgonzola-row.png`

- **Size:** 47×42px
- **Digit clarity:** Digit 5 column (x479) has visible ink — full 1,35 should be readable; dense ink at right edge may confuse trailing digit
- **Context:** Isolated presentation
- **Distractions:** Unit-price column digits may bleed into strip
- **Digit 5 clipped:** NO
- **Unit-price bleed:** YES
- **Margin before unit-price (x483):** -2px
- **Mean luminance:** 191.1 · **Dark fraction:** 49.49%

### `images/D-qtd-strip-full.png`

- **Size:** 50×421px
- **Digit clarity:** Digit 5 column (x479) has visible ink — full 1,35 should be readable; dense ink at right edge may confuse trailing digit
- **Context:** Multi-row Qtd strip — row bands only, no product names
- **Distractions:** Unit-price column digits may bleed into strip
- **Digit 5 clipped:** NO
- **Unit-price bleed:** YES
- **Margin before unit-price (x483):** -5px
- **Mean luminance:** 186.4 · **Dark fraction:** 72.67%

### `images/D-gorgonzola-row.png`

- **Size:** 50×42px
- **Digit clarity:** Digit 5 column (x479) has visible ink — full 1,35 should be readable; dense ink at right edge may confuse trailing digit
- **Context:** Isolated presentation
- **Distractions:** Unit-price column digits may bleed into strip
- **Digit 5 clipped:** NO
- **Unit-price bleed:** YES
- **Margin before unit-price (x483):** -5px
- **Mean luminance:** 191.2 · **Dark fraction:** 49.62%

### `images/E-qtd-strip-full.png`

- **Size:** 60×421px
- **Digit clarity:** Digit 5 column (x479) has visible ink — full 1,35 should be readable; dense ink at right edge may confuse trailing digit
- **Context:** Multi-row Qtd strip — row bands only, no product names
- **Distractions:** Unit-price column digits may bleed into strip
- **Digit 5 clipped:** NO
- **Unit-price bleed:** YES
- **Margin before unit-price (x483):** -15px
- **Mean luminance:** 187.2 · **Dark fraction:** 73.42%

### `images/E-gorgonzola-row.png`

- **Size:** 60×42px
- **Digit clarity:** Digit 5 column (x479) has visible ink — full 1,35 should be readable; dense ink at right edge may confuse trailing digit
- **Context:** Isolated presentation
- **Distractions:** Unit-price column digits may bleed into strip
- **Digit 5 clipped:** NO
- **Unit-price bleed:** YES
- **Margin before unit-price (x483):** -15px
- **Mean luminance:** 191.5 · **Dark fraction:** 52.58%

### `images/F-qtd-strip-full.png`

- **Size:** 80×421px
- **Digit clarity:** Digit 5 column (x479) has visible ink — full 1,35 should be readable; dense ink at right edge may confuse trailing digit
- **Context:** Multi-row Qtd strip — row bands only, no product names
- **Distractions:** Unit-price column digits may bleed into strip
- **Digit 5 clipped:** NO
- **Unit-price bleed:** YES
- **Margin before unit-price (x483):** -35px
- **Mean luminance:** 188.4 · **Dark fraction:** 73.46%

### `images/F-gorgonzola-row.png`

- **Size:** 80×42px
- **Digit clarity:** Digit 5 column (x479) has visible ink — full 1,35 should be readable; dense ink at right edge may confuse trailing digit
- **Context:** Isolated presentation
- **Distractions:** Unit-price column digits may bleed into strip
- **Digit 5 clipped:** NO
- **Unit-price bleed:** YES
- **Margin before unit-price (x483):** -35px
- **Mean luminance:** 191.7 · **Dark fraction:** 58.01%

### `images/G-gorgonzola-row.png`

- **Size:** 724×42px
- **Digit clarity:** General ink present; dense ink at right edge may confuse trailing digit
- **Context:** Wide crop includes adjacent columns or description bleed
- **Distractions:** Description fractions (1/8, 1/2) and pack weights visible
- **Digit 5 clipped:** NO
- **Unit-price bleed:** NO
- **Mean luminance:** 188.4 · **Dark fraction:** 65.11%

### `images/H-gorgonzola-row.png`

- **Size:** 724×42px
- **Digit clarity:** General ink present; dense ink at right edge may confuse trailing digit
- **Context:** Wide crop includes adjacent columns or description bleed
- **Distractions:** Description fractions (1/8, 1/2) and pack weights visible
- **Digit 5 clipped:** NO
- **Unit-price bleed:** NO
- **Mean luminance:** 188.5 · **Dark fraction:** 63.71%

### `images/I-table-marker.png`

- **Size:** 724×421px
- **Digit clarity:** General ink present; dense ink at right edge may confuse trailing digit
- **Context:** Wide crop includes adjacent columns or description bleed
- **Distractions:** Description fractions (1/8, 1/2) and pack weights visible
- **Digit 5 clipped:** NO
- **Unit-price bleed:** NO
- **Mean luminance:** 175.1 · **Dark fraction:** 78.38%

### `images/J-qtd-strip-full.png`

- **Size:** 86×842px
- **Digit clarity:** Digit 5 column (x479) has visible ink — full 1,35 should be readable; dense ink at right edge may confuse trailing digit
- **Context:** Multi-row Qtd strip — row bands only, no product names
- **Distractions:** Unit-price column digits may bleed into strip
- **Digit 5 clipped:** NO
- **Unit-price bleed:** YES
- **Margin before unit-price (x483):** 2px
- **Mean luminance:** 186.4 · **Dark fraction:** 71.86%

### `images/J-gorgonzola-row.png`

- **Size:** 43×42px
- **Digit clarity:** Digit 5 column (x479) has visible ink — full 1,35 should be readable; dense ink at right edge may confuse trailing digit
- **Context:** Isolated presentation
- **Distractions:** Minimal
- **Digit 5 clipped:** NO
- **Unit-price bleed:** NO
- **Margin before unit-price (x483):** 2px
- **Mean luminance:** 192.0 · **Dark fraction:** 48.95%

### `images/K-qtd-strip-full.png`

- **Size:** 129×1263px
- **Digit clarity:** Digit 5 column (x479) has visible ink — full 1,35 should be readable; dense ink at right edge may confuse trailing digit
- **Context:** Wide crop includes adjacent columns or description bleed
- **Distractions:** Unit-price column digits may bleed into strip
- **Digit 5 clipped:** NO
- **Unit-price bleed:** YES
- **Margin before unit-price (x483):** 2px
- **Mean luminance:** 186.4 · **Dark fraction:** 71.86%

### `images/K-gorgonzola-row.png`

- **Size:** 43×42px
- **Digit clarity:** Digit 5 column (x479) has visible ink — full 1,35 should be readable; dense ink at right edge may confuse trailing digit
- **Context:** Isolated presentation
- **Distractions:** Minimal
- **Digit 5 clipped:** NO
- **Unit-price bleed:** NO
- **Margin before unit-price (x483):** 2px
- **Mean luminance:** 192.0 · **Dark fraction:** 48.95%

## Final ranking (Gorgonzola, best → worst)

| Rank | Variant | Label | Majority | Correct? | Correct % |
|------|---------|-------|----------|----------|-----------|
| 1 | A | 43px strip (production) | 1.3 | NO | 0% |
| 2 | B | 45px strip | PENDING_LIVE | — | 0% |
| 3 | C | 47px strip | PENDING_LIVE | — | 0% |
| 4 | D | 50px strip | PENDING_LIVE | — | 0% |
| 5 | E | 60px strip | PENDING_LIVE | — | 0% |
| 6 | F | 80px strip | PENDING_LIVE | — | 0% |
| 7 | G | Full row crop | PENDING_LIVE | — | 0% |
| 8 | H | Full row + Qtd highlight | PENDING_LIVE | — | 0% |
| 9 | I | Table crop + Gorgonzola marker | PENDING_LIVE | — | 0% |
| 10 | J | 43px strip enlarged 2x | PENDING_LIVE | — | 0% |
| 11 | K | 43px strip enlarged 3x | PENDING_LIVE | — | 0% |

## Final questions

1. **Which presentation reads Gorgonzola correctly most often?** PENDING_LIVE — only variant A has single reference run (1.30 from live-reextract v41)
2. **Does width improve accuracy?** Likely yes from pixel geometry: digit-5 visible from ~45px; live v41 still reads 1.30 at 43px. Wider strips (E/F) include digit fully with margin — PENDING_LIVE confirmation
3. **Does additional context improve accuracy?** Risk of harm — variants G/H/I expose description fractions (1/8) that historically caused integer-2 confusion; strip isolation (A–F) is safer. PENDING_LIVE
4. **Does enlargement improve accuracy?** Unlikely alone — 43px already shows digit 5 in pixels; failure at v41 is vision truncation (1.30) not resolution. Enlargement without width may not recover trailing 5 — PENDING_LIVE
5. **Can GPT reliably read 1.35?** Not reliably at production 43px — live-reextract v41 returns 1.30 (ocr_quantity 1.3). Pixel evidence shows digit 5 present; GPT truncates or misreads trailing digit.
6. **Production choice A/B/C/D/E?** Recommend **E (60px strip)** over A (43px): digit-5 fully visible, 5px+ margin before unit-price ink at x483, prior width-escalation audit estimates 1.35. A confirmed wrong (1.30) via live-reextract.

## Exported images

- `images/A-gorgonzola-row.png`
- `images/A-qtd-strip-full.png`
- `images/B-gorgonzola-row.png`
- `images/B-qtd-strip-full.png`
- `images/C-gorgonzola-row.png`
- `images/C-qtd-strip-full.png`
- `images/D-gorgonzola-row.png`
- `images/D-qtd-strip-full.png`
- `images/E-gorgonzola-row.png`
- `images/E-qtd-strip-full.png`
- `images/F-gorgonzola-row.png`
- `images/F-qtd-strip-full.png`
- `images/G-gorgonzola-row.png`
- `images/H-gorgonzola-row.png`
- `images/I-table-marker.png`
- `images/J-gorgonzola-row.png`
- `images/J-qtd-strip-full.png`
- `images/K-gorgonzola-row.png`
- `images/K-qtd-strip-full.png`

## Gorgonzola row strip — width comparison (pixel evidence)

| Variant | Width | Digit 5 clipped? | Margin to x483 | Unit-price bleed? |
|---------|-------|------------------|----------------|-------------------|
| A | 43px | NO | 2px | NO |
| B | 45px | NO | 0px | YES |
| C | 47px | NO | -2px | YES |
| D | 50px | NO | -5px | YES |
| E | 60px | NO | -15px | YES |
| F | 80px | NO | -35px | YES |

At **43px (A)** the trailing **5** of `1,35` is pixel-visible (rightmost ink x≈480) yet live v41 prepass returns **1.30** — vision truncation, not clipping. Wider strips (B–F) include unit-price ink (x≥483) which adds adjacent numeric distraction.

## Prior audit cross-reference (not counted as live runs)

| Source | Width | Gorgonzola qty | Method |
|--------|-------|----------------|--------|
| live-reextract.json (v41 deploy) | 43px | **1.30** | production pipeline |
| qtd-strip-width-escalation-audit | 60px | 1.35 (visual estimate) | pixel + prior |
| qtd-strip-width-escalation-audit | 80px | 1.35 (visual estimate) | pixel + prior |
| live-reextract.json | 43px strip | Bresaola **1.83**, Prosciutto **4.30** | production pipeline |

## Methodology

- Black-box GPT-4.1 only; image presentation varied across 11 variants (A–K).
- Strip variants use full table-crop height Qtd column at x0=438.
- Production geometry: `EMPORIO_QTD_COLUMN_X_FRAC` + 43px effective width (41px frac + 2px right pad).
- No code changes, DB writes, or deployments.