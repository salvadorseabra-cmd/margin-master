# Ricotta Root Cause Trace — READ-ONLY

**Generated:** 2026-06-21  
**Validation Lab:** `bjhnlrgodcqoyzddbpbd`  
**Invoice:** `f0aa5a08-86a3-4938-99f0-711e86073968` (Il Bocconcino, 2026-05-08)  
**Line:** RICOTTA TREVIGIANA 1,5KG  
**Invoice item:** `409850ab-646d-44fa-b20c-c8a4a8570064`  
**Ingredient:** Ricotta trevigiana (`6ec0bc6b-409a-4db2-b21f-fb01394f0014`)

---

### Invoice Reality

Manual inspection of `.tmp/geometry-audit/images/f0aa5a08-86a3-4938-99f0-711e86073968.png` (corroborated by `.tmp/bocconcino-investigation/REPORT.md` and `.tmp/field-accuracy-audit/ground-truth.json`):

| Stage | Quantity | Unit Price | Total | Source |
|-------|----------:|-----------:|------:|--------|
| PDF visible row | **1** | **7.967** | **7.97** | QUANT=1,000 · CXs=0 · UNI · P.VENDA S/IVA=7,967 EUR · no line discount · VALOR LÍQUIDO=7,97 EUR |

---

### Stage-by-Stage Trace

| Stage | Quantity | Unit Price | Total | Source |
|-------|----------:|-----------:|------:|--------|
| 1. PDF reality | 1 | 7.967 | 7.97 | Invoice PNG (see above) |
| 2. OCR / table GPT raw (Pass C era) | 1 | 7.967 | 7.97 | `.tmp/bocconcino-investigation/extract-invoice-response.json` |
| 3. Pass C baseline | 1 | 7.97 | 7.97 | `.tmp/passc-refinement-validation/reextract/f0aa5a08-86a3-4938-99f0-711e86073968.json`; `.tmp/persistence-audit/pass-c-raw/...-gpt-raw-cache.json` |
| 4. **Hybrid H output (v25)** | **2** | 7.967 | 7.97 | `.tmp/final-validation-lab-rerun/extracts/f0aa5a08-86a3-4938-99f0-711e86073968.json`; 10/10 stability runs qty=2 |
| 5a. bindMonetaryColumns **input** | 2 | 7.967 | 7.97 | Hybrid H legacy fields |
| 5b. bindMonetaryColumns **output** | 2 | **3.99** | 7.97 | Production replay; `.tmp/phase1-validation-forensics-result.json` bound replay; `.tmp/family-a-v25-raw-capture/edge-invoke-final.json` (v36 API) |
| 6a. reconcileLineItemAmounts **input** | 2 | 3.99 | 7.97 | Post-bind |
| 6b. reconcileLineItemAmounts **output** | 2 | 3.99 | 7.97 | **Unchanged** (production replay) |
| 7. invoice_items persisted | 2 | 7.97 | 7.97 | VL DB SELECT 2026-06-21; `.tmp/phase1-validation-forensics-result.json` |
| 8. Purchase history / catalog | 2 (line qty); catalog `purchase_quantity`=2 | 7.97 (line); history `new_price`=3.985 | 7.97 | `.tmp/historical-pricing-integrity-audit/per-ingredient/6ec0bc6b-409a-4db2-b21f-fb01394f0014.json` |
| 9. Ingredient detail page | Last **2 un** | Proc **€3.99/unit** | total €7.97 implied | `.tmp/quantity-mismatch-ui-audit/replay.json` |
| 10. Procurement cost calc | display qty **2 un**; `purchaseQtyForCost`=**1** | **€3.99/unit** | — | `resolveCountablePurchaseQuantityForCost` + presentation replay |
| 11. Operational cost calc | usable **3 kg** (2×1.5 kg) | **€2.66/kg** | €7.97÷3 kg | `computeEffectiveUsableCost` replay |

**Math check at each stage vs prior stage**

| Transition | Consistent? | Notes |
|------------|:-----------:|-------|
| PDF → Pass C | ✓ | qty=1 preserved; unit_price 7.967→7.97 rounding only |
| Pass C → Hybrid H | ✗ | **qty 1→2** introduced here |
| Hybrid H → bind output | ✓ (given qty=2) | unit_price 7.967→3.99 via total÷qty (7.97÷2) |
| bind → reconcile | ✓ | no modification |
| bind → DB persist | ✗ | DB keeps **pre-bind** unit_price 7.97, not 3.99; 2×7.97≠7.97 |
| bound line → UI economics | ✓ (given qty=2) | €3.99/unit · €2.66/kg · 3 kg all derive from qty=2 |

---

### First Incorrect Value

| Field | PDF value | First wrong value | Stage introduced |
|-------|----------:|------------------:|------------------|
| **Quantity** | **1** | **2** | **Hybrid H / table GPT extraction (stage 4)** |

Evidence:

- Pass C era and baseline consistently return **qty=1** (`.tmp/bocconcino-investigation/extract-invoice-response.json`, `.tmp/passc-refinement-validation/reextract/...`).
- Post-geometry Hybrid H path (v25+) consistently returns **qty=2** across `.tmp/final-validation-lab-rerun/extracts/...` and `.tmp/final-stability-audit/extracts/...-all-runs.json` (10/10 runs).
- **Unit price 7.967** and **total 7.97** match the PDF at extraction; only quantity is wrong at Hybrid H output.

Production replay confirms `reconcileLineItemAmounts` does not modify this row. `bindMonetaryColumns` does not introduce the quantity error; it adapts unit_price to the already-wrong qty=2.

---

### Downstream Consequences

1. **bindMonetaryColumns** rewrites unit_price from 7.967 → **3.99** (7.97÷2). This is arithmetically correct for qty=2 but wrong vs PDF gross unit 7.967.
2. **Persistence** stores qty=2, unit_price=**7.97** (pre-bind rounded gross), total=7.97 — internally inconsistent (2×7.97≠7.97).
3. **Family A collapse** sets `resolveCountablePurchaseQuantityForCost` → 1 while row qty=2, triggering mismatch signals in `.tmp/quantity-mismatch-validation/mismatches.json`.
4. **Cost pipeline** uses bound semantics: operational **€2.66/kg** (= €7.97 ÷ 3 kg usable), not PDF-correct **€5.31/kg** (= €7.97 ÷ 1.5 kg).
5. **Correct qty=1 baseline** (from forensics replay): bound 1×€7.97=€7.97, operational €5.31/kg, usable 1.5 kg (`.tmp/phase1-validation-forensics-result.json` `bocconcino-extract-response` artifact).

All downstream stages are **mathematically self-consistent with qty=2**; none restore PDF qty=1.

---

### User-Visible Impact

Against **PDF reality** (1 unit purchased):

| Surface | PDF truth | User sees | Wrong? |
|---------|-----------|-----------|:------:|
| Last Purchase qty | 1 un | **2 un** | **Yes** |
| Procurement price | €7.97/unit | **€3.99/unit** | **Yes** |
| Usable stock | 1.5 kg | **3 kg** | **Yes** |
| Operational cost | €5.31/kg | **€2.66/kg** | **Yes** |
| Line total | €7.97 | €7.97 (implicit) | No |

`.tmp/quantity-mismatch-ui-audit/REPORT.md` classifies Ricotta as **C — Operationally Correct** because it treated bound output (2×€3.99=€7.97) as “invoice reality.” Against the visible PDF (1×€7.967=€7.97), the detail page reflects the **extraction error**, not a separate downstream transform bug.

---

### Root Cause

**Hybrid H table GPT extraction (post-geometry, full 7-row path) emits `quantity: 2` where the invoice shows QUANT=1,000.** Pass C on the same invoice previously extracted qty=1 correctly. The error is introduced at **stage 4 (Hybrid H output)**; later pipeline stages propagate and mathematically reconcile around the wrong quantity rather than correcting it.

**Not root cause (evidence):**

- `reconcileLineItemAmounts` — no change (production replay)
- Persistence layer — stores what extraction returns; does not invent qty=2
- UI presentation layer — displays bound economics consistent with stored qty=2
- `resolveCountablePurchaseQuantityForCost` — downstream Family A behavior, not source of qty=2

---

### Artefacts

| File | Role |
|------|------|
| `.tmp/ricotta-root-cause-trace/trace.json` | Machine-readable stage table |
| `.tmp/final-validation-lab-rerun/extracts/f0aa5a08-86a3-4938-99f0-711e86073968.json` | v25 Hybrid H bad-path extract |
| `.tmp/passc-refinement-validation/reextract/f0aa5a08-86a3-4938-99f0-711e86073968.json` | Pass C baseline (qty=1) |
| `.tmp/phase1-validation-forensics-result.json` | DB + bound replay + qty=1 counterfactual |
| `.tmp/quantity-mismatch-ui-audit/replay.json` | Full cost/UI replay for item 409850ab… |
| `.tmp/geometry-audit/images/f0aa5a08-86a3-4938-99f0-711e86073968.png` | PDF ground truth image |
