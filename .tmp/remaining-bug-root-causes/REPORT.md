# Remaining Bug Root Cause Traces — READ-ONLY

**Generated:** 2026-06-22  
**Validation Lab:** `bjhnlrgodcqoyzddbpbd`  
**Methodology:** Same stage-by-stage trace as `.tmp/ricotta-root-cause-trace/` and `.tmp/mezzi-root-cause-trace/`

---

### Mozzarella Fior di Latte Trace

**Invoice:** `f0aa5a08-86a3-4938-99f0-711e86073968` (Il Bocconcino, 2026-05-08)  
**Line:** MOZZARELLA FIOR DI LATTE "IL BOCCONCINO" 125GR*8  
**Invoice item:** `095b2bb9-bd36-44c2-a1f9-7c50fa9c0cc6`  
**Ingredient:** Mozzarella fior di latte (`2a99cecd-08fb-48d5-87cf-cc9ea5282a6d`)

#### Invoice Reality

Manual inspection of `.tmp/geometry-audit/images/f0aa5a08-86a3-4938-99f0-711e86073968.png` (corroborated by `.tmp/field-accuracy-audit/ground-truth.json`, `.tmp/bocconcino-investigation/extract-invoice-postfix.json`):

| Stage | Quantity | Unit Price | Total | Source |
|-------|----------:|-----------:|------:|--------|
| PDF visible row | **10** | **9.50** (gross) | **81.23** | QUANT=10,000 · CXs=10 · UNI · P.VENDA S/IVA=9,500 EUR · DESC 14,50% · VALOR LÍQUIDO=81,23 EUR |

Pack notation `125GR*8` = 8 × 125 g = **1 kg per outer pack**. At PDF truth: 10 packs × 1 kg = **10 kg** usable; operational **€8.12/kg** (= €81.23 ÷ 10 kg after discount).

#### Stage-by-Stage Trace

| Stage | Quantity | Unit Price | Total | Source |
|-------|----------:|-----------:|------:|--------|
| 1. PDF reality | 10 | 9.50 | 81.23 | Invoice PNG (see above) |
| 2. OCR / table GPT raw (Pass C era) | 10 | 9.50 | 81.23 | `.tmp/persistence-audit/pass-c-raw/f0aa5a08-86a3-4938-99f0-711e86073968-gpt-raw-cache.json` |
| 3. Pass C baseline | 10 | 9.50 | 81.23 | `.tmp/passc-refinement-validation/reextract/f0aa5a08-86a3-4938-99f0-711e86073968.json` |
| 4. Hybrid H output (v25) | 10 | 8.12 | 81.23 | `.tmp/final-validation-lab-rerun/extracts/f0aa5a08-86a3-4938-99f0-711e86073968.json` |
| 5a. bindMonetaryColumns **input** | 10 | 8.12 | 81.23 | Hybrid H legacy fields |
| 5b. bindMonetaryColumns **output** | 10 | 8.12 | 81.23 | **Unchanged** — 10×8.12≈81.23 (`.tmp/quantity-mismatch-ui-audit/replay.json`) |
| 6a. reconcileLineItemAmounts **input** | 10 | 8.12 | 81.23 | Post-bind |
| 6b. reconcileLineItemAmounts **output** | 10 | 8.12 | 81.23 | **Unchanged** (production replay) |
| 7. invoice_items persisted | 10 | 8.12 | 81.23 | VL DB; `.tmp/phase1-validation-forensics-result.json` `mozzarella fior` |
| 8. Purchase history / catalog | 10 (line qty); catalog `purchase_quantity`=1 | 8.12 (line); history `new_price`=8.12 | 81.23 | `.tmp/historical-pricing-integrity-audit/per-ingredient/2a99cecd-08fb-48d5-87cf-cc9ea5282a6d.json` |
| 9. Ingredient detail page | Last **10 un** ✓ | Proc **€8.12/unit** ✓ | usable **1 kg** ✗ · Op **€81.20/kg** ✗ | `.tmp/quantity-mismatch-ui-audit/replay.json` |
| 10. Procurement cost calc | display qty **10 un**; `purchaseQtyForCost`=**1** | **€8.12/unit** | — | `resolveCountablePurchaseQuantityForCost` collapse |
| 11. Operational cost calc | usable **1 kg** (not 10 kg) | **€81.20/kg** (not €8.12/kg) | €81.23÷1 kg | `computeEffectiveUsableCost` replay |

**Math check at each stage vs prior stage**

| Transition | Consistent? | Notes |
|------------|:-----------:|-------|
| PDF → Hybrid H | ✓ | qty=10 preserved; unit_price 9.50→8.12 is post-discount effective only |
| Hybrid H → bind | ✓ | no modification |
| bind → reconcile | ✓ | no modification |
| bind → DB persist | ✓ | monetary triple stored faithfully |
| persisted → structure resolution | ✗ | **`normalizedUsableQuantity` 1000 g (1 kg) instead of 10000 g (10 kg)** |
| structure → UI economics | ✓ (given 1 kg fiction) | €81.20/kg = €81.23÷1 kg; Last Purchase 10 un contradicts 1 kg usable |

#### First Incorrect Value

| Field | PDF value | First wrong value | Stage introduced |
|-------|----------:|------------------:|------------------|
| **Usable weight** | **10 kg** (10 packs × 1 kg) | **1 kg** | **Purchase structure / stock normalization (stage 8)** |

Evidence:

- Extraction stages 1–7 all preserve **qty=10**, **unit_price=8.12**, **total=81.23** (`.tmp/final-validation-lab-rerun/extracts/...`, `.tmp/phase1-validation-forensics-result.json`).
- `bindMonetaryColumns` and `reconcileLineItemAmounts` do not modify this row.
- First deviation: `resolveInvoiceLinePurchaseFormat` parses `125GR*8` as `multi_unit_pack` with `purchaseContainerCount=8` (inner balls), `normalizedUsableQuantity=1000` g — single-pack volume, **not multiplied by invoice qty 10** (`.tmp/phase1-validation-forensics-result.json` structured block; `.tmp/quantity-mismatch-ui-audit/replay.json` `purchaseContainerCount=8`, `normalizedUsable=1000`).
- Stracciatella on same invoice (24×250 g → 6 kg) shows the pipeline **can** scale usable with invoice qty when `purchaseContainerCount` tracks outer units; Mozzarella does not because inner count (8) is used instead of outer pack count (10).

#### User-Visible Impact

| Surface | PDF truth | User sees | Wrong? |
|---------|-----------|-----------|:------:|
| Last Purchase qty | 10 packs | **10 un** | No |
| Procurement price | €8.12/pack | **€8.12/unit** | No |
| Usable stock | **10 kg** | **1 kg** | **Yes** |
| Operational cost | **€8.12/kg** | **€81.20/kg** | **Yes** |
| Line total | €81.23 | €81.23 (implicit) | No |

---

### Ginger Beer Trace

**Invoice:** `ab52796d-de1d-418d-86e7-230c8f056f09` (Emporio Italia, 2026-05-19)  
**Line:** Baladin - Ginger Beer 0.20cl  
**Invoice item:** `634a418b-1509-42a9-bf01-563705967b6f`  
**Ingredient:** Ginger beer (`7aa5dd9e-44c2-43e3-b673-890ad6d6da41`)

Extract corroboration from sibling invoice `17aa3591-ec98-4c21-89c9-5ae946bc97bb` (same supplier row; `.tmp/ginger-beer-audit/INVOICE_GROUND_TRUTH.md`).

#### Invoice Reality

Manual inspection of `.tmp/ginger-beer-ground-truth/invoice-full.png` (corroborated by `.tmp/ginger-beer-audit/INVOICE_GROUND_TRUTH.md`, `.tmp/field-accuracy-audit/ground-truth.json`):

| Stage | Quantity | Unit Price | Total | Source |
|-------|----------:|-----------:|------:|--------|
| PDF visible row | **24** | **0.85** (gross) | **19.38** | Qtd=24,00 · Pr.=0,85 € · Desc 5,00% · Valor=19,38 € · name prints `0.20cl` |

24 bottles × ~20 cl ≈ **4.8 L** usable; operational **~€4.04/L** (= €19.38 ÷ 4.8 L).

#### Stage-by-Stage Trace

| Stage | Quantity | Unit Price | Total | Source |
|-------|----------:|-----------:|------:|--------|
| 1. PDF reality | 24 | 0.85 | 19.38 | `.tmp/ginger-beer-audit/INVOICE_GROUND_TRUTH.md` |
| 2. OCR / table GPT raw (Pass C era) | 24 | 0.85 | 19.38 | `.tmp/persistence-audit/pass-c-raw/17aa3591-ec98-4c21-89c9-5ae946bc97bb-extract-invoice.json` |
| 3. Pass C baseline | 2 | 9.69 | 19.38 | `.tmp/passc-refinement-validation/reextract/17aa3591-ec98-4c21-89c9-5ae946bc97bb.json` (case framing; total preserved) |
| 4. Hybrid H output (v25) | 24 | 0.81 | 19.38 | `.tmp/final-validation-lab-rerun/extracts/17aa3591-ec98-4c21-89c9-5ae946bc97bb.json` |
| 5a. bindMonetaryColumns **input** | 24 | 0.81 | 19.38 | Hybrid H legacy fields |
| 5b. bindMonetaryColumns **output** | 24 | 0.81 | 19.38 | **Unchanged** (`.tmp/quantity-mismatch-ui-audit/replay.json`) |
| 6a. reconcileLineItemAmounts **input** | 24 | 0.81 | 19.38 | Post-bind |
| 6b. reconcileLineItemAmounts **output** | 24 | 0.81 | 19.38 | **Unchanged** |
| 7. invoice_items persisted | 24 | 0.81 | 19.38 | VL DB; `.tmp/quantity-mismatch-validation/mismatches.json` |
| 8. Purchase history / catalog | 24 (line); catalog `purchase_quantity`=2 ml | 0.81 | 19.38 | `.tmp/historical-pricing-integrity-audit/per-ingredient/7aa5dd9e-44c2-43e3-b673-890ad6d6da41.json` |
| 9. Ingredient detail page | Last **24** ✓ | Proc **€0.81** ✓ | usable **48 ml** ✗ · Op **€405/L** ✗ | `.tmp/quantity-mismatch-ui-audit/replay.json` |
| 10. Procurement cost calc | `purchaseQtyForCost`=1; stored PQ=**2 ml** | **€0.81** | — | Volume parse seeds catalog |
| 11. Operational cost calc | usable **48 ml** (24×2 ml) | **€405/L** | €19.38÷0.048 L | `computeEffectiveUsableCost` replay |

**Math check at each stage vs prior stage**

| Transition | Consistent? | Notes |
|------------|:-----------:|-------|
| PDF → Hybrid H | ✓ | qty=24 preserved; unit_price 0.85→0.81 is post-discount effective |
| Hybrid H → bind | ✓ | no modification |
| bind → DB persist | ✓ | monetary triple stored faithfully |
| persisted → volume inference | ✗ | **`0.20cl` in name parsed as 0.20 centilitres = 2 ml/bottle** |
| volume → UI economics | ✓ (given 48 ml fiction) | €405/L = €19.38÷0.048 L; Last Purchase 24 contradicts 48 ml total |

#### First Incorrect Value

| Field | PDF value | First wrong value | Stage introduced |
|-------|----------:|------------------:|------------------|
| **Per-bottle volume** | **~200 ml** (20 cl) | **2 ml** | **Volume inference from product name (stage 8)** |

Evidence:

- Monetary extraction stages 4–7 are correct for qty=24 and total=19.38 (`.tmp/final-validation-lab-rerun/extracts/17aa3591-ec98-4c21-89c9-5ae946bc97bb.json`).
- Product name `0.20cl` is faithfully copied from PDF through extraction (`.tmp/ginger-beer-ground-truth/stage-table.json` — typo originates on source document).
- `detectVolume()` regex `(\d+)\s*CL` matches `0.20cl` → 0.20 × 10 = **2 ml** (`src/lib/ingredient-unit-inference.ts:135`).
- Replay: `normalizedUsable=48` ml = 24 × 2 ml; `storedPurchaseQuantity=2` ml (`.tmp/quantity-mismatch-ui-audit/replay.json`).
- Peroni 33cl on same Mammafiore invoice parses correctly (7.92 L usable) — only the `0.20cl` decimal-centilitre token fails.

#### User-Visible Impact

| Surface | PDF truth | User sees | Wrong? |
|---------|-----------|-----------|:------:|
| Last Purchase qty | 24 bottles | **24** | No |
| Procurement price | €0.85/bottle (gross) | **€0.81** | No (post-discount) |
| Usable stock | **~4.8 L** | **48 ml** | **Yes** |
| Operational cost | **~€4/L** | **€405/L** | **Yes** |
| Line total | €19.38 | €19.38 (implicit) | No |

---

### Guanciale Trace

**Invoice:** `36c99d19-6f9f-413f-8c2d-ae3526291a2d` (Mammafiore, 2026-05-19)  
**Line:** Guanciale di suino stagionato +/- 1,5kg*7 Sorrentino  
**Invoice item:** `6efebedf-c78e-46c1-9ae1-58792229834b`  
**Ingredient:** Guanciale stagionato (`705dbbff-cd36-4dd6-9e68-bd68d350b9a6`)

#### Invoice Reality

Manual inspection of `.tmp/geometry-audit/images/36c99d19-6f9f-413f-8c2d-ae3526291a2d.png` (corroborated by `.tmp/mammafiore-line-audit/ground-truth.json`, `.tmp/field-accuracy-audit/ground-truth.json`):

| Stage | Quantity | Unit Price | Total | Source |
|-------|----------:|-----------:|------:|--------|
| PDF visible row | **5.996** | **16.922** (gross €/kg) | **64.93** | Qtd=5,996 · Un.=UN · Pr.=16,922 · Desc 36,00% · Valor=64,93 |

Weight line: **~6 kg** purchased at effective **€10.83/kg** (= 16.922 × 0.64). Pack notation `*7` describes supplier case shape, not units purchased on this line.

#### Stage-by-Stage Trace

| Stage | Quantity | Unit Price | Total | Source |
|-------|----------:|-----------:|------:|--------|
| 1. PDF reality | 5.996 | 16.922 | 64.93 | Invoice PNG (see above) |
| 2. OCR / table GPT raw (Pass C era) | 5.996 | 16.922 | 64.93 | `.tmp/persistence-audit/pass-c-raw/36c99d19-6f9f-413f-8c2d-ae3526291a2d-gpt-raw-cache.json` (unit=kg) |
| 3. Pass C baseline | 5.996 | 16.922 | 101.59 | `.tmp/passc-refinement-validation/reextract/36c99d19-6f9f-413f-8c2d-ae3526291a2d.json` (total variance on run) |
| 4. Hybrid H output (v25) | 5.996 | 10.83 | 64.93 | `.tmp/final-validation-lab-rerun/extracts/36c99d19-6f9f-413f-8c2d-ae3526291a2d.json` |
| 5a. bindMonetaryColumns **input** | 5.996 | 10.83 | 64.93 | Hybrid H legacy fields |
| 5b. bindMonetaryColumns **output** | 5.996 | 10.83 | 64.93 | **Unchanged** (`.tmp/quantity-mismatch-ui-audit/replay.json`) |
| 6a. reconcileLineItemAmounts **input** | 5.996 | 10.83 | 64.93 | Post-bind |
| 6b. reconcileLineItemAmounts **output** | 5.996 | 10.83 | 64.93 | **Unchanged** |
| 7. invoice_items persisted | 5.996 | 10.83 | 64.93 | VL DB; `.tmp/quantity-mismatch-validation/mismatches.json` |
| 8. Purchase history / catalog | 5.996 (line); catalog `purchase_quantity`=1 | 10.83 | 64.93 | `.tmp/historical-pricing-integrity-audit/findings.json` (history `new_price`=10.83) |
| 9. Ingredient detail page | Last **6.00 un** (round) | Proc **€10.83/unit** | usable **10.5 kg** ✗ · Op **€6.18/kg** ✗ | `.tmp/quantity-mismatch-ui-audit/replay.json` |
| 10. Procurement cost calc | `purchaseQtyForCost`=1; `purchaseContainerCount`=**7** | **€10.83/unit** | — | Pack `*7` applied as container count |
| 11. Operational cost calc | usable **10.5 kg** (7×1.5 kg) | **€6.18/kg** | €64.93÷10.5 kg | `computeEffectiveUsableCost` replay |

**Math check at each stage vs prior stage**

| Transition | Consistent? | Notes |
|------------|:-----------:|-------|
| PDF → Hybrid H | ✓ | qty=5.996 preserved; unit_price 16.922→10.83 is post-discount effective €/kg |
| Hybrid H → bind | ✓ | no modification |
| bind → DB persist | ✓ | monetary triple stored faithfully |
| persisted → structure resolution | ✗ | **`normalizedUsableQuantity` 10500 g (7×1.5 kg) instead of ~5996 g (row weight)** |
| structure → UI economics | ✓ (given 10.5 kg fiction) | €6.18/kg = €64.93÷10.5 kg; understates true €10.83/kg |

#### First Incorrect Value

| Field | PDF value | First wrong value | Stage introduced |
|-------|----------:|------------------:|------------------|
| **Usable weight** | **~6 kg** (5.996 kg row qty) | **10.5 kg** (7×1.5 kg) | **Purchase structure / stock normalization (stage 8)** |

Evidence:

- Extraction stages 4–7 preserve **qty=5.996**, **unit_price=10.83**, **total=64.93** (`.tmp/final-validation-lab-rerun/extracts/36c99d19-6f9f-413f-8c2d-ae3526291a2d.json`).
- `bindMonetaryColumns` and `reconcileLineItemAmounts` do not modify this row.
- Name `+/- 1,5kg*7` parsed as `multi_unit_pack`: `purchaseContainerCount=7`, `packageQuantity=1500` g → **10500 g** (`.tmp/quantity-mismatch-ui-audit/replay.json` `purchaseContainerCount=7`, `normalizedUsable=10500`).
- Row unit is generic `un` with qty=5.996 (weight semantics); `resolvePurchaseContainerCount` does not override embedded `*7` because `rowUnit` is not a measure unit (`src/lib/stock-normalization.ts:1446–1464`).
- True operational cost should be €64.93 ÷ 5.996 kg ≈ **€10.83/kg**, not €6.18/kg.

#### User-Visible Impact

| Surface | PDF truth | User sees | Wrong? |
|---------|-----------|-----------|:------:|
| Last Purchase qty | ~6 kg | **6.00 un** | Borderline (rounding) |
| Procurement price | €10.83/kg | **€10.83/unit** | Mislabeled unit |
| Usable stock | **~6 kg** | **10.5 kg** | **Yes** |
| Operational cost | **€10.83/kg** | **€6.18/kg** | **Yes** |
| Line total | €64.93 | €64.93 (implicit) | No |

---

### Comparison Matrix

| Product | First Incorrect Stage | Extraction Bug? | Downstream Bug? | User Visible? |
|---------|----------------------|:---------------:|:---------------:|:-------------:|
| Ricotta trevigiana | **Hybrid H (stage 4)** — qty 1→2 | **Yes** | No (propagates) | **Yes** (vs PDF) |
| Mezzi paccheri mancini | **Hybrid H (stage 4)** — qty 1→2 | **Yes** | Partial (split-brain UI) | **Yes** |
| Mozzarella fior di latte | **Stock normalization (stage 8)** — usable 1 kg not 10 kg | No | **Yes** | **Yes** |
| Ginger beer | **Volume inference (stage 8)** — 2 ml/bottle from `0.20cl` | No (monetary) | **Yes** | **Yes** |
| Guanciale stagionato | **Stock normalization (stage 8)** — usable 10.5 kg not ~6 kg | No | **Yes** | **Yes** |

---

### Bug Family Assessment

| Family | Products | Mechanism |
|--------|----------|-----------|
| **A) Extraction-originated** | Ricotta, Mezzi | Hybrid H emits wrong `quantity` (1→2); bind adapts unit_price; downstream reconciles around fiction |
| **B) Downstream-transformation-originated** | Mozzarella, Ginger Beer, Guanciale | Monetary extraction correct; `stock-normalization.ts` / `ingredient-unit-inference.ts` / `resolveInvoiceLinePurchaseFormat` produce wrong usable denominator |
| **C) Mixed** | — | None among these five |

**Downstream sub-patterns (Family B):**

- **Mozzarella:** `multi_unit_pack` uses inner count (`*8` balls) for usable; does not scale by invoice qty (10 packs). `resolveCountablePurchaseQuantityForCost` collapse to 1 leaves usable at single-pack 1 kg.
- **Ginger Beer:** `detectVolume()` interprets printed typo `0.20cl` as 0.20 centilitres (= 2 ml) instead of 20 cl (= 200 ml).
- **Guanciale:** Pack multiplier `*7` applied to weight line where row qty (5.996) already expresses purchased kilograms; yields 7×1.5 kg fiction.

---

### Artefacts

| File | Role |
|------|------|
| `.tmp/remaining-bug-root-causes/root-causes.json` | Machine-readable stage tables |
| `.tmp/quantity-mismatch-ui-audit/replay.json` | Production-path UI replay |
| `.tmp/phase1-validation-forensics-result.json` | DB + bound replay (Mozzarella structured block) |
| `.tmp/final-validation-lab-rerun/extracts/` | v25 Hybrid H extracts |
| `.tmp/ricotta-root-cause-trace/`, `.tmp/mezzi-root-cause-trace/` | Methodology reference |
