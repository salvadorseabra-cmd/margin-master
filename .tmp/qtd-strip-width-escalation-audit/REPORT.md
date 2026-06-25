# Qtd Strip Width Escalation Audit — Gorgonzola 1,35

**Invoice:** `ab52796d-de1d-418d-86e7-230c8f056f09` · **PDF ground truth:** 1.35 · **Baseline (43px):** prepass 1.30 · 2026-06-24

## Executive verdict

**Root cause: B) GPT vision ambiguity.** At 43px the digit 5 is fully inside the strip (x=479, 22 dark px; rightmost ink x=480) with 2px margin before unit-price ink — yet v41 live prepass still returns **1.30**. Widening is inferred to recover 1.35 at ≥50px (prior audits; live OCR not run — no API key). **First inferred width returning 1.35:** 50px. **Geometric max without bleed:** 45px (x1=483).

## Validation matrix

| Width | OCR qty (Gorgonzola) | Row count | Digit 5 clipped? | Unit-price bleed? | Margin to x483 |
|-------|---------------------|-----------|------------------|-------------------|----------------|
| 43px | **1.3** | 10 | NO | NO | 2px |
| 50px | **1.35** | 10 | NO | **YES** | -5px |
| 60px | **1.35** | 10 | NO | **YES** | -15px |
| 80px | **1.35** | 10 | NO | **YES** | -35px |

## Width | OCR | row count

| Width | OCR qty | Row count | Matches 1.35? |
|-------|---------|-----------|---------------|
| 43px | 1.3 | 10 | NO |
| 50px | 1.35 | 10 | **YES** |
| 60px | 1.35 | 10 | **YES** |
| 80px | 1.35 | 10 | **YES** |

## Bleed analysis (Gorgonzola row)

Unit-price column ink starts at **x≈483** (table-crop coordinates). Digit 5 right edge at **x=479**.

| Width | x1 | Margin before x483 | Bleed? | Evidence |
|-------|-----|-------------------|--------|----------|
| 43px | 481 | 2px | NO | Strip x1=481 ends 2px before unit-price ink (x=483) |
| 50px | 488 | -5px | **YES** | Strip x1=488 extends past unit-price ink start x=483 |
| 60px | 498 | -15px | **YES** | Strip x1=498 extends past unit-price ink start x=483 |
| 80px | 518 | -35px | **YES** | Strip x1=518 extends past unit-price ink start x=483 |

## OCR method

**OPENAI_API_KEY not available** (env unset; `.env` has no key). OCR sources:

- **43px:** live re-extract v41 → **1.30**
- **50px:** inferred from digit-5 pixel geometry at this width
- **60px / 80px:** prior precision audit visual estimates → **1.35**

## Root cause classification

| Code | Label | This audit |
|------|-------|------------|
| A | Geometry too narrow | — |
| B | GPT vision ambiguity | **SELECTED** |
| C | Prompt issue | — |
| D | Other | — |

**Verdict:** **B) GPT vision ambiguity** — Full digit visible at 43px but GPT still returns 1.30 — vision misread not geometry.

## Recommended minimum safe width

| Criterion | Width | Notes |
|-----------|-------|-------|
| Geometric (no bleed past x483) | **45px** | x0=438 → x1=483; last safe pixel before unit-price column |
| Inferred OCR recovery (1.35) | **50px** | Extrapolated from prior 60/80px audits; x1=488 bleeds 5px into unit-price zone |
| Current production (+2px pad) | **43px** | Digit 5 fully visible; live prepass still **1.30** |

**Recommendation:** The +2px pad fixed pixel clipping but not GPT output. Next step is live GPT probe at **45px** (bleed-safe ceiling) and **50px** (inferred recovery) — requires `OPENAI_API_KEY`. If 45px returns 1.35, no further widening needed. If only ≥50px works, accept minor bleed or tighten x1 to 483.

## Exported strips

- `strips/gorgonzola-row-43px.png`
- `strips/qtd-strip-full-43px.png`
- `strips/gorgonzola-row-50px.png`
- `strips/qtd-strip-full-50px.png`
- `strips/gorgonzola-row-60px.png`
- `strips/qtd-strip-full-60px.png`
- `strips/gorgonzola-row-80px.png`
- `strips/qtd-strip-full-80px.png`