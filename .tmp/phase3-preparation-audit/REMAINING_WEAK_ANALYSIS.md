# Remaining WEAK Analysis

**Date:** 2026-06-15

---

## 1. Rulo Di Capra 1kg*2 Simonetta

| Field | Detail |
|-------|--------|
| **Supplier** | Mammafiore Portugal |
| **Suggested** | `Rulo di capra *2 simonetta` |
| **Retained noise** | `*2` (pack multiplier), **simonetta** (distributor brand) |
| **Missing transformation** | Strip `simonetta`; strip `*2` / `1kg*2` multipack notation |
| **Category** | Dairy/cheese — product identity is capra roll |
| **Phase 2 gap** | `simonetta` planned but **not added** to `CATALOG_NOISE_TOKENS` |

**Ideal:** `Rulo di capra`

---

## 2. Farina do pasta fresca e gnocchi25kg Caputo

| Field | Detail |
|-------|--------|
| **Supplier** | Mammafiore Portugal |
| **Suggested** | `Farina do pasta fresca e gnocchi caputo` |
| **Retained noise** | **caputo** (mill brand), fused OCR `gnocchi25kg` → partial strip only |
| **Missing transformation** | Strip `caputo`; split fused weight token `gnocchi25kg` → `gnocchi` |
| **Category** | Dry goods / flour |
| **Phase 2 gap** | `caputo` not in noise list; no fused-token parser |

**Ideal:** `Farina pasta fresca e gnocchi` or `Farina para gnocchi`

---

## 3. MOZZA Fior di Latte Expet Julienne 3kg Simonetta

| Field | Detail |
|-------|--------|
| **Supplier** | Mammafiore Portugal |
| **Suggested** | `Mozza fior di latte expet julienne simonetta` |
| **Retained noise** | **mozza** (shorthand), **expet** (OCR for expert), **simonetta** |
| **Missing transformation** | Expand `MOZZA` → `Mozzarella`; strip `expet`; strip `simonetta` |
| **Category** | Cheese — **fior di latte** is identity (must keep) |
| **Phase 2 gap** | Shorthand expansion is operational-path concern; `simonetta` not stripped |

**Ideal:** `Mozzarella fior di latte julienne` (identity expansion sim: do not collapse to generic Mozzarella)

---

## 4. Aceto balsamico di modena IGP pet 5l*2 Toschi

| Field | Detail |
|-------|--------|
| **Supplier** | Mammafiore Portugal |
| **Suggested** | `Aceto balsamico di modena IGP pet *2 toschi` |
| **Retained noise** | **pet** (pack type), **\*2**, **toschi** (brand) |
| **Missing transformation** | Strip `toschi`, `pet`, `*2`; keep **IGP** (product identity) |
| **Category** | Condiments / vinegar |
| **Phase 2 gap** | `toschi`, `pet` not in noise tokens; `*2` debris |

**Ideal:** `Aceto balsamico di Modena IGP`

---

## WEAK common thread

All 4 WEAK rows are **Mammafiore** lines sharing **Italian distributor brand suffixes** (`Simonetta`, `Caputo`, `Toschi`) plus **pack notation** (`*2`, `pet`, fused weights). Phase 2 added Bidfood-oriented tokens but **did not add Mammafiore supplier brands**.
