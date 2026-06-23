# Mezzi Paccheri Root Cause Trace — READ-ONLY

**Generated:** 2026-06-22  
**Validation Lab:** `bjhnlrgodcqoyzddbpbd`  
**Invoice:** `f0aa5a08-86a3-4938-99f0-711e86073968` (Il Bocconcino, 2026-05-08)  
**Line:** MEZZI PACCHERI MANCINI (CX 1KG*6)  
**Invoice item:** `bb4bbfac-a59b-4d0b-9844-ba773c1f261e`  
**Ingredient:** Mezzi paccheri mancini (`6a7d0b80-764a-40e8-a3fb-9361e7d9ee98`)

---

### Invoice Reality

Manual inspection of `.tmp/geometry-audit/images/f0aa5a08-86a3-4938-99f0-711e86073968.png` (corroborated by `.tmp/field-accuracy-audit/ground-truth.json`, `.tmp/bocconcino-investigation/REPORT.md`, `.tmp/family-a-scope-audit/audit-result.json`):

| Stage | Quantity | Unit Price | Total | Source |
|-------|----------:|-----------:|------:|--------|
| PDF visible row | **1** | **27.30** | **27.30** | QUANT=1,000 · CXs=(blank) · UNI · P.VENDA S/IVA=27,300 EUR · no line discount · VALOR LÍQUIDO=27,30 EUR |

Pack notation `(CX 1KG*6)` implies **1 case = 6 × 1 kg = 6 kg** usable. At PDF truth: 1 case × €27.30 = **€4.55/kg**.

---

### Stage-by-Stage Trace

| Stage | Quantity | Unit Price | Total | Source |
|-------|----------:|-----------:|------:|--------|
| 1. PDF reality | 1 | 27.30 | 27.30 | Invoice PNG (see above) |
| 2. OCR / table GPT raw (Pass C era) | 1 | 27.30 (27.56 in raw cache) | 27.30 | `.tmp/bocconcino-investigation/extract-invoice-response.json`; `.tmp/persistence-audit/pass-c-raw/...-gpt-raw-cache.json` |
| 3. Pass C baseline | 1 | 27.56 | 27.30 | `.tmp/passc-refinement-validation/reextract/f0aa5a08-86a3-4938-99f0-711e86073968.json` |
| 4. **Hybrid H output (v25)** | **2** | 27.36 | 27.30 | `.tmp/final-validation-lab-rerun/extracts/f0aa5a08-86a3-4938-99f0-711e86073968.json`; 10/10 stability runs qty=2 |
| 5a. bindMonetaryColumns **input** | 2 | 27.36 | 27.30 | Hybrid H legacy fields |
| 5b. bindMonetaryColumns **output** | 2 | **13.65** | 27.30 | Production replay; `.tmp/phase1-validation-forensics-result.json`; `.tmp/family-a-v25-raw-capture/edge-invoke-final.json` (v36 API) |
| 6a. reconcileLineItemAmounts **input** | 2 | 13.65 | 27.30 | Post-bind |
| 6b. reconcileLineItemAmounts **output** | 2 | 13.65 | 27.30 | **Unchanged** (production replay) |
| 7. invoice_items persisted | 2 | 27.31 | 27.30 | VL DB SELECT 2026-06-16 re-ingest; `.tmp/phase1-validation-forensics-result.json` (earlier snapshot qty=1 per `.tmp/vl-final-state-audit/...`) |
| 8. Purchase history / catalog | 2 (line qty); catalog `purchase_quantity`=2 | 27.31 (line); history `new_price`=13.655 | 27.30 | `.tmp/historical-pricing-integrity-audit/per-ingredient/6a7d0b80-764a-40e8-a3fb-9361e7d9ee98.json` |
| 9. Ingredient detail page | Last **2 un** | Proc **€13.65/case** | total €27.30 implied | `.tmp/quantity-mismatch-ui-audit/replay.json` |
| 10. Procurement cost calc | display qty **2 un**; `purchaseQtyForCost`=**1** | **€13.65/case** | — | `resolveCountablePurchaseQuantityForCost` + presentation replay |
| 11. Operational cost calc | usable **6 kg** (1 case via collapse) | **€4.55/kg** | €27.30÷6 kg | `computeEffectiveUsableCost` replay |

**Math check at each stage vs prior stage**

| Transition | Consistent? | Notes |
|------------|:-----------:|-------|
| PDF → Pass C | ✓ | qty=1 preserved; unit_price 27.30↔27.56 minor column rounding |
| Pass C → Hybrid H | ✗ | **qty 1→2** introduced here |
| Hybrid H → bind output | ✓ (given qty=2) | unit_price 27.36→13.65 via total÷qty (27.30÷2) |
| bind → reconcile | ✓ | no modification |
| bind → DB persist | ✗ | DB keeps **pre-bind** unit_price 27.31, not 13.65; 2×27.31≠27.30 |
| bound line → UI economics | ✗ (split-brain) | Last Purchase uses invoice qty=**2**; usable/op cost use `purchaseQtyForCost`=**1** → 6 kg not 12 kg |

---

### First Incorrect Value

| Field | PDF value | First wrong value | Stage introduced |
|-------|----------:|------------------:|------------------|
| **Quantity** | **1** | **2** | **Hybrid H / table GPT extraction (stage 4)** |

Evidence:

- Pass C era and baseline consistently return **qty=1** (`.tmp/bocconcino-investigation/extract-invoice-response.json`, `.tmp/passc-refinement-validation/reextract/...`, `.tmp/family-a-scope-audit/audit-result.json` ocrQty=1).
- Post-geometry Hybrid H path (v25+) consistently returns **qty=2** across `.tmp/final-validation-lab-rerun/extracts/...` and `.tmp/final-stability-audit/extracts/...-all-runs.json` (10/10 runs).
- **Unit price ~27.30** and **total 27.30** match the PDF at extraction; only quantity is wrong at Hybrid H output.

Production replay confirms `reconcileLineItemAmounts` does not modify this row. `bindMonetaryColumns` does not introduce the quantity error; it adapts unit_price to the already-wrong qty=2.

---

### Downstream Consequences

1. **bindMonetaryColumns** rewrites unit_price from 27.36 → **13.65** (27.30÷2). Arithmetically correct for qty=2 but wrong vs PDF gross unit 27.30.
2. **Persistence** stores qty=2, unit_price=**27.31** (pre-bind rounded gross), total=27.30 — internally inconsistent (2×27.31≠27.30).
3. **Family A collapse** sets `resolveCountablePurchaseQuantityForCost` → 1 while row qty=2, triggering mismatch signals in `.tmp/quantity-mismatch-validation/mismatches.json`.
4. **Cost pipeline split-brain:** Last Purchase and bound per-case price follow invoice qty=2; usable stock and €/kg follow `purchaseQtyForCost`=1 (one case = 6 kg). Operational **€4.55/kg** (= €27.30 ÷ 6 kg) matches PDF 1-case truth **by accident**, not by design.
5. **Correct qty=1 baseline** (from PDF + pack structure): bound 1×€27.30=€27.30, procurement €27.30/case, usable 6 kg, operational €4.55/kg, Last Purchase 1 un.

Stages 5–11 do not restore PDF qty=1. The usable/op-cost numbers happen to align with 1-case PDF reality because Family A collapse and wrong qty=2 partially cancel for this `(CX 1KG*6)` pack shape.

---

### User-Visible Impact

Against **PDF reality** (1 case purchased, 6 kg usable):

| Surface | PDF truth | User sees | Wrong? |
|---------|-----------|-----------|:------:|
| Last Purchase qty | 1 case | **2 un** | **Yes** |
| Procurement price | €27.30/case | **€13.65/case** | **Yes** |
| Usable stock | 6 kg | **6 kg** | No |
| Operational cost | €4.55/kg | **€4.55/kg** | No |
| Line total | €27.30 | €27.30 (implicit) | No |

**Internal UI contradiction (always visible):** Last Purchase shows **2 un** but usable stock shows **6 kg** (one case only). A user expecting 2 cases would expect 12 kg.

`.tmp/quantity-mismatch-ui-audit/REPORT.md` classifies Mezzi as **A — Confirmed Bug** using bound qty=2 as “invoice reality” (2 cases, 12 kg). Against the visible PDF (1 case, 6 kg), the classification rationale shifts: procurement and Last Purchase reflect the **extraction error**; usable/kg are accidentally correct. The split-brain presentation remains a user-visible defect regardless.

---

### Root Cause

**Hybrid H table GPT extraction (post-geometry, full 7-row path) emits `quantity: 2` where the invoice shows QUANT=1,000.** Pass C on the same invoice previously extracted qty=1 correctly. The error is introduced at **stage 4 (Hybrid H output)**; later pipeline stages propagate and mathematically reconcile around the wrong quantity rather than correcting it.

Mezzi's distinct downstream symptom (vs Ricotta) is **split-brain UI**: `resolveCountablePurchaseQuantityForCost` collapses to 1 for Family A multi-unit packs, so usable stock stays at one-case volume (6 kg) while Last Purchase displays the inflated invoice qty (2 un).

**Not root cause (evidence):**

- `reconcileLineItemAmounts` — no change (production replay; `.tmp/persistence-audit/REPORT.md`)
- Persistence layer — stores what extraction returns; does not invent qty=2
- UI presentation layer — displays bound economics; the usable/kg fields follow cost collapse, not invoice qty
- `resolveCountablePurchaseQuantityForCost` — downstream Family A behavior amplifying extraction error; not source of qty=2

---

### Comparison With Ricotta

| Stage | Ricotta | Mezzi | Same Failure Pattern? |
|-------|---------|-------|:---------------------:|
| 1 PDF reality | qty **1**, €7.967, €7.97 | qty **1**, €27.30, €27.30 | ✓ (both qty=1 on PDF) |
| 2 OCR / Pass C | qty **1** | qty **1** | ✓ |
| 3 Pass C baseline | qty **1** | qty **1** | ✓ |
| 4 Hybrid H | qty **2** ← first error | qty **2** ← first error | **✓ same stage** |
| 5 bind output | €3.99/unit (7.97÷2) | €13.65/case (27.30÷2) | ✓ (same total÷qty collapse) |
| 6 reconcile | unchanged | unchanged | ✓ |
| 7 persisted | qty 2, pre-bind unit | qty 2, pre-bind unit | ✓ |
| 8–11 cost/UI | 2 un · 3 kg · €2.66/kg (all scale with qty=2) | 2 un · **6 kg** · €4.55/kg (usable uses collapse=1 case) | ✗ different UI profile |

**Same first incorrect stage?** **Yes** — Hybrid H output (stage 4), quantity 1→2.

**Same downstream effects?** **Partially.** Both trigger Family A `purchaseQtyForCost` collapse to 1 and pre-bind/post-bind unit_price split. Ricotta scales usable weight with wrong qty=2 (3 kg = 2×1.5 kg) — internally consistent with bound fiction. Mezzi leaves usable at one-case volume (6 kg) while Last Purchase shows 2 — **split-brain**.

**Same bug family or different mechanisms?** **Same Family A bug family** (OCR qty=1 → Hybrid H qty=2, total preserved, unit halved). **Different UI mechanism:** Ricotta `weight_or_volume` line scales usable with invoice qty; Mezzi `multi_unit_pack` `(CX 1KG*6)` + collapse produces contradictory Last Purchase vs usable display. UI audit: Ricotta **C**, Mezzi **A**.

---

### Artefacts

| File | Role |
|------|------|
| `.tmp/mezzi-root-cause-trace/trace.json` | Machine-readable stage table |
| `.tmp/final-validation-lab-rerun/extracts/f0aa5a08-86a3-4938-99f0-711e86073968.json` | v25 Hybrid H bad-path extract |
| `.tmp/passc-refinement-validation/reextract/f0aa5a08-86a3-4938-99f0-711e86073968.json` | Pass C baseline (qty=1) |
| `.tmp/phase1-validation-forensics-result.json` | DB + bound replay (`paccheri` section) |
| `.tmp/quantity-mismatch-ui-audit/replay.json` | Full cost/UI replay for item bb4bbfac… |
| `.tmp/geometry-audit/images/f0aa5a08-86a3-4938-99f0-711e86073968.png` | PDF ground truth image |
| `.tmp/ricotta-root-cause-trace/REPORT.md` | Methodology reference trace |
