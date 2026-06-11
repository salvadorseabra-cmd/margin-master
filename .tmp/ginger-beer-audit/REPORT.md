# Ginger Beer Volume Conversion Bug — Audit Report

**Invoice:** `17aa3591-ec98-4c21-89c9-5ae946bc97bb` (Emporio Italia, VL `bjhnlrgodcqoyzddbpbd`)  
**Evidence:** `.tmp/ginger-beer-audit/`  
**Cross-ref:** `.tmp/emporio-italia-investigation/`

---

## Summary — one-line root cause

**OCR/extraction stored `0.20cl` literally; both `detectVolume` and `parseSizeAndUnit` convert CL→ML as `n×10`, so 0.20 CL becomes 2 ml/bottle (not 33cl/200ml), producing 48 ml total and €425/L for the 24-unit scenario.**

---

## Raw invoice values

| Field | Ground truth (user / prior extract) | Current VL DB row |
|-------|-------------------------------------|-------------------|
| Description | Baladin - Ginger Beer **0.20cl** | Same |
| Product code (PDF only) | **BBB-GINGER33ITA** | Not persisted |
| Qty | 24 | 2 |
| Unit | un | cx |
| Unit price | €0.85 | €9.69 |
| Line total | €19.38 | €19.38 ✓ |

The description token is identical across uploads. Qty/unit representation changed on re-extract (24 singles → 2 cases) but line total unchanged.

---

## Conversion chain — every step with values

| Step | Function / stage | Input | Output |
|------|------------------|-------|--------|
| 1 | GPT table extraction | PDF line | `name="Baladin - Ginger Beer 0.20cl"`, qty=24, unit=un, €0.85 |
| 2 | DB persistence | extract response | `invoice_items.name` stores literal `0.20cl` |
| 3 | `detectVolume` | `"0.20cl"` | regex `(\d+(?:[.,]\d+)?)\s*CL` → qty=**0.20**, `toMl(0.20)=0.20×10` → **2 ml** |
| 4 | `parseSizeAndUnit` (stock-normalization) | size=0.20, unit=cl | `0.20×10` → unitSize=**2**, unitMeasurement=**ml** |
| 5 | `parsePurchaseStructureFromText` | full name | tier=`bare_measure`, matchedText=`0.20cl`, unitSize=2 ml |
| 6 | `normalizePurchasedToUsableStock` | row qty=24, unit=un | `24 × 2 ml` → **48 ml** usable |
| 7 | `resolveUsablePerPricedUnit` | structured + meta | **2 ml** per priced unit |
| 8 | `computeEffectiveUsableCost` | €0.85, 2 ml/un | `0.85 / (2/1000)` → **€425/L** |
| 9 | UI (invoice line) | structured display | "48 ml usable", "€425/L usable" |

**Where 2 ml vs 200 ml is decided:** At step 3/4 — the decimal `0.20` is parsed as **0.2 centilitres**, not repaired to `20` or `33`. Both code paths apply the same `×10` CL→ML rule with no beverage sanity floor.

---

## Mathematical proof — 48 ml and €425/L formulas

```
Token:     "0.20cl"
Parse:     0.20 (float)
CL → ML:   0.20 × 10 = 2 ml per bottle        [detectVolume / parseSizeAndUnit]

Usable:    24 units × 2 ml/unit = 48 ml       [normalizePurchasedToUsableStock]
Per-unit:  resolveUsablePerPricedUnit → 2 ml

Cost:      liters_per_unit = 2 / 1000 = 0.002 L
           €0.85 / 0.002 L = €425/L            [computeEffectiveUsableCost]
```

**Sanity check (expected 33cl SKU):**
```
33 cl × 10 = 330 ml/bottle
24 × 330 ml = 7,920 ml = 7.92 L
€0.85 / 0.33 L ≈ €2.58/L
```

---

## Similar products audit

Scanned **2,000** recent `invoice_items`; **5** beverage-related lines matched.

| Product | detectVolume | Usable | €/L | Anomaly |
|---------|-------------|--------|-----|---------|
| Baladin Ginger Beer 0.20cl | **2 ml** | **4–48 ml** | **€425/L** (24 un scenario) | **SUSPECT** |
| SanPellegrino 75cl x 15ud | 750 ml | 1,500 ml | — (cx pricing) | OK |
| ACQUA S.PELLEGRINO (CX 75CL*15) | 750 ml | 1,500 ml | €27/L | OK |

**Verdict:** Isolated to the `0.XXcl` decimal-OCR pattern. Normal integer CL tokens (`75cl`) convert correctly to 750 ml. No other impossible €/L values found in VL beverage sample.

---

## Stage analysis table

| Stage | Result |
|-------|--------|
| OCR extraction | Table pass copies literal **`0.20cl`** from PDF; product code `BBB-GINGER33ITA` (implies 33cl) not captured |
| GPT extraction | Returns `Baladin - Ginger Beer 0.20cl`, qty=24, unit=un, unit_price=0.85 — no volume normalization |
| Package parser | `parsePurchaseStructureFromText` → `bare_measure`, unitSize=**2 ml** from `0.20cl` |
| Unit normalization | `detectVolume` / `parseSizeAndUnit`: **0.20 × 10 = 2 ml** (identical in both paths) |
| Operational pricing | `resolveUsablePerPricedUnit` → 2 ml/un; `computeEffectiveUsableCost` → **€425/L** |
| DB persistence | `invoice_items` stores name with `0.20cl`; no ingredient linked; no usable/cost columns |
| UI display | Read-time computation from name → **48 ml usable**, **€425/L** (24 un scenario) |

---

## Root cause — proven with evidence paths

1. **Extraction error (primary):** Invoice PDF shows bottle size OCR'd as `0.20cl` instead of `33cl` (SKU `BBB-GINGER33ITA` confirms 33cl). Evidence: `extract-invoice-response.json`, `invoice-full.png` in emporio-italia investigation.

2. **Parser accepts sub-physical volumes (secondary):** `detectVolume` at `src/lib/ingredient-unit-inference.ts:135` and `parseSizeAndUnit` at `src/lib/stock-normalization.ts:551` both compute `n×10` for any CL value including decimals — no minimum bottle size check.

3. **No SKU cross-check (tertiary):** `ingredient-identity.ts` does not parse embedded size from product codes; `invoice_items` schema has no `product_code` field.

4. **Validation gap:** `isImpossibleUsableQuantity` only caps at 500,000 ml; `isCollapsedMeaninglessUsable` only flags quantity=1 — **48 ml passes both**.

Evidence chain: `.tmp/ginger-beer-audit/parsing-chain.json` (live code replay), `math-audit.json`, `db-record.json`.

---

## Recommended fix — design only (NO IMPLEMENT)

1. **OCR repair heuristic:** When CL token matches `0.(\d{2})` with digits ≥ 10 (e.g. `0.33cl`), reinterpret as `XXcl` (leading zero dropped). Similarly `0.20cl` → probe `20cl` vs `33cl` from SKU.

2. **Beverage volume floor:** After CL→ML conversion, if result < 50 ml and product context is liquid (beer, acqua, etc.), suppress usable or flag for review.

3. **SKU size inference:** Parse numeric size tokens from product codes (`GINGER33` → 330 ml) when description volume is suspect.

4. **Persist product code:** Extend extraction + `invoice_items` to store supplier SKU for cross-validation.

5. **Extreme cost badge:** Surface €425/L as critical pricing alert (may partially exist).

---

## Evidence artifacts

| File | Contents |
|------|----------|
| `audit.mts` | Reproducible audit script |
| `db-probe.mts` | Live DB query helper |
| `db-record.json` | Current + prior invoice_item rows |
| `db-record-live.json` | Full live query dump |
| `extraction-trace.json` | GPT vs DB field comparison |
| `parsing-chain.json` | Full code-path replay with intermediates |
| `math-audit.json` | Step-by-step formulas |
| `dual-scenario-math.json` | 24 un vs 2 cx scenarios |
| `similar-beverages.json` | Beverage anomaly scan (2000 items) |
| `stage-analysis.json` | Pipeline stage results |
| `summary.json` | One-line root cause + counts |
| `REPORT.md` | This document |
