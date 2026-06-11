# Decimal CL OCR Anomalies — Read-Only Audit

**Date:** 2026-06-10  
**VL project:** `bjhnlrgodcqoyzddbpbd` (marginly-validation-lab)  
**Production project:** `lhackrnlnrsiamorzmkb` (AI Profit Operating System for Restaurants)

## Summary

The `0.xxcl` OCR anomaly is **isolated to a single line** in the Validation Lab dataset: **Baladin Ginger Beer** on an Emporio Italia invoice (2026-05-19). A full scan of **43 VL** and **207 production** `invoice_items` rows found **no other** matches for `0.[0-9]+cl`, `0.[0-9]+ cl`, `0.xx L`, `0.xxL`, or beverage lines with sub-50 ml volume tokens. Production is directly accessible via service role (`lhackrnlnrsiamorzmkb`); no decimal-cl pattern appears there. Integer centilitre tokens (e.g. `75cl`) parse correctly elsewhere. The Ginger Beer line is not a systematic parser failure across beverages — it is a **single extraction typo** (`0.20cl` instead of likely `33cl` per SKU `BBB-GINGER33ITA`) that `detectVolume` parses literally as 0.20 CL → **2 ml/unit**, yielding absurd €/L when volume cost is computed.

## Results

| Product | Invoice (supplier + date) | Parsed volume | €/L | Status |
|---------|----------------------------|---------------|-----|--------|
| Baladin - Ginger Beer 0.20cl | Emporio Italia — 2026-05-19 | 2 ml/unit (4 ml total for 2 cx) | **€4,845/L** theoretical¹; UI path returns €/case for cx rows | **SUSPECT** |

¹ `computeEffectiveUsableCost` returns `{ cost: 9.69, unit: "case" }` for this cx row (`isCaseRowWithEmbeddedPieceWeightOnly`), so the app does not surface €/L. Theoretical €/L = €9.69 ÷ (2 ml ÷ 1000) = **€4,845/L** per priced cx. Prior extraction trace (24 `un` @ €0.85) would yield **€425/L** — same root cause, different row packaging.

**Expected (SKU hint):** `BBB-GINGER33ITA` → **330 ml/bottle** → ~€2.58/L at €0.85/un.

## Counts

| Metric | VL | Production |
|--------|-----|------------|
| Total `invoice_items` scanned | 43 | 207 |
| `0.xxcl` regex matches | **1** | **0** |
| Broader `0.xx L` / `0.xxL` matches | 0 | 0 |
| Beverage lines with `<50 ml` token | 0 | 0 |
| **SUSPECT** (parsed vol <50 ml beverage or €/L >€50) | **1** | **0** |

## Query methodology

### Validation Lab
- Full-table fetch via Supabase service role + client-side regex: `/0\.[0-9]+\s*cl\b/i`
- Cross-checked with `supabase db query --linked` SQL `~* '0\.[0-9]+cl'` → **1 row** (same Ginger Beer line)
- Schema: volume lives in `invoice_items.name` only (no separate `description` column)

### Production
- Project ref from `supabase/config.toml` and `scripts/audit-wave2b-origin.mts` (`lhackrnlnrsiamorzmkb`)
- Service role key via `supabase projects api-keys`
- Full paginated fetch (207 rows) + same regex filters
- REST `ilike` spot-check: `name.ilike.*0.*cl*` → **[]**

### Parsing replay
Production logic replayed via `.tmp/decimal-cl-audit/replay.mts`:
- `detectVolume` → 0.20 CL × 10 = **2 ml** (`volume token "0.20CL" (CL) → 2ml`)
- `resolveInvoiceLinePurchaseFormat` → `bare_measure`, `matchedText: "0.20cl"`
- `resolveUsablePerPricedUnit` → 2 ml per priced unit
- Total usable: 2 cx × 2 ml = **4 ml**

## Broader pattern search

| Pattern | VL | Production |
|---------|-----|------------|
| `0.10cl`, `0.20cl`, `0.25cl`, `0.33cl`, `0.50cl` | Only `0.20cl` (Ginger Beer) | None |
| `0.xx L`, `0.xxL` | 0 | 0 |
| Beverage + `<50 ml` in name | 0 | 0 |

No additional OCR typo families found in stored data. Local fixtures (`.tmp/emporio-*`, `.tmp/ginger-beer-audit/`) contain the same Ginger Beer extraction artifact but are not separate DB rows.

## Evidence artifacts

| File | Contents |
|------|----------|
| `.tmp/decimal-cl-audit/query-results.json` | Raw DB matches + broader-pattern scan |
| `.tmp/decimal-cl-audit/replay-results.json` | Parsed volume, €/L replay, classification |
| `.tmp/decimal-cl-audit/query.mts` | VL + production query script |
| `.tmp/decimal-cl-audit/replay.mts` | Parsing replay script |
| `.tmp/decimal-cl-audit/REPORT.md` | This report |

Prior related evidence: `.tmp/ginger-beer-audit/`, `.tmp/emporio-italia-investigation/`

## Conclusion: Isolated vs systematic

**Isolated.** One beverage, one invoice, one OCR token. The CL→ml conversion (`n × 10`) behaves correctly for integer centilitres (`75cl` → 750 ml). The failure mode requires a decimal-leading OCR artifact (`0.20cl`) that does not appear elsewhere in VL or production. Risk is latent (any future `0.33cl`-style typo would hit the same path) but **not currently systematic** across the dataset.
