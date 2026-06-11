# Mammafiore Line-Level Extraction Audit

**Invoice:** Mammafiore Portugal · 2026-05-19 · €415.96  
**ID:** `36c99d19-6f9f-413f-8c2d-ae3526291a2d`  
**VL project:** bjhnlrgodcqoyzddbpbd  
**Audit date:** 2026-06-10  
**Mode:** Read-only — no source edits

---

## Executive summary

After the white-header geometry fix (crop top 622 → **386**), extraction returns **9 rows** instead of the expected **8**. The extra row is a **GPT-hallucinated olive oil line** that does not appear anywhere on the source invoice. The phantom first appears in **Pass C raw GPT JSON**; downstream stages preserve row count. DB currently holds 9 `invoice_items` including `Olio Nuto 609 10lt`. Invoice total **€415.96 remains correct** (footer pass).

---

## Ground Truth Table

Manually transcribed from `invoice-full.png` (storage screenshot).

| # | Description | Qty | Unit | Unit Price | Total |
|---|-------------|-----|------|------------|-------|
| 1 | Guanciale di suino stagionato +/- 1,5kg*7 Sorrentino | 5,996 | un | 16,922 | 64,93 |
| 2 | Farina Speciale pizza 25kg Amoruso | 1 | un | 33,154 | 26,52 |
| 3 | Birra Peroni Nastro Azzurro PNA 33cl*24 Nastro Azzurro | 24 | un | 1,529 | 25,69 |
| 4 | Aceto balsamico di Modena IGP pet 5l*2 Toschi | 1 | un | 18,929 | 16,09 |
| 5 | MOZZA Fior di Latte Expert Julienne 3kg Simonetta | 10 | un | 24,728 | 200,30 |
| 6 | Rulo Di Capra 1kg*2 Simonetta | 1 | un | 15,192 | 10,86 |
| 7 | Recargo por combustible | 1 | un | 2,000 | 2,00 |
| 8 | Farina 00 pasta fresca e gnocchi25kg Caputo | 1 | un | 39,101 | 30,11 |

**Net line sum:** €376,50 (pre-IVA Valor column)

Saved: `ground-truth.json`

---

## Pass C Output

### Raw GPT (before `normalizeItems`)

Captured via `vl-prompt-compare` variant A on the **production table crop** (same image Pass C sees).

| # | Name | Qty | Unit | Unit Price | Total |
|---|------|-----|------|------------|-------|
| 1 | Guanciale di Suino stagionato +/- 1,5kg*7 Sorrentino | 5,996 | kg | 16,922 | 64,93 |
| 2 | Farina Speciale pizza 25kg Amorucci | 1 | un | 33,154 | 26,52 |
| 3 | Birra Peroni Nastro Azzurro PNA 33cl*24 Nastro Azzurro | 24 | un | 1,529 | 25,69 |
| 4 | **Olio Noc 609 Della O.P.** | 1 | un | 18,829 | 18,83 |
| 5 | Aceto balsamico di modena IGP pet 5lt*2 Toschi | 2 | un | 13,8 | 15,96 |
| 6 | MOZZA Fioc di Latte Expet Julienne 3kg Simonetta | 10 | kg | 24,728 | 200,30 |
| 7 | Rub Di Capra 1kg*2 Simonetta | 2 | kg | 15,192 | 10,28 |
| 8 | Recargo por combustible | 1 | un | 2 | 2 |
| 9 | Farina 00 pasta fresca e gnocchi25kg Caputo | 1 | un | 39,101 | 30,11 |

**Did GPT produce a phantom olive oil line?** **YES**  
(Exact label varies per run: `Olio Noc 609…`, `Olio Nute 600g Dea`, `Olio Nuto 609 10lt` — none on invoice.)

Saved: `pass-c-raw.json`

### `extract-invoice` response (Pass C + normalize + reconcile)

9 items; phantom labeled `Olio Nute 600g Dea` (€15). Saved: `extract-invoice-response.json`

---

## First appearance of phantom item

| Stage | Phantom present? | Evidence |
|-------|------------------|----------|
| 1. Source invoice | **No** | 8 rows only; no olive oil text |
| 2. Crop | No | Crop top=386 includes real table; cannot invent text |
| 3. OCR | N/A | GPT vision, no separate OCR |
| 4. **GPT Pass C raw** | **YES** | `Olio Noc 609 Della O.P.` in `pass-c-raw.json` |
| 5. After `normalizeItems` | Yes (same row) | Row count unchanged |
| 6. After `reconcile` | Yes (same row) | Row count unchanged |
| 7. Persistence | Yes | `Olio Nuto 609 10lt` in DB (earlier run label) |

**First appearance: GPT (Pass C)** — not geometry, not normalization, not persistence.

Saved: `phantom-item-trace.json`

---

## Row-by-row comparison

| Ground Truth | PDF € | GPT € | Persisted € | Status |
|--------------|-------|-------|-------------|--------|
| Guanciale di suino stagionato +/- 1,5kg*7 Sorrentino | 64,93 | 64,93 | 64,93 | MATCH |
| Farina Speciale pizza 25kg Amoruso | 26,52 | 26,52 | 26,52 | MATCH |
| Birra Peroni Nastro Azzurro PNA 33cl*24 Nastro Azzurro | 25,69 | 25,69 | 25,69 | MATCH |
| *(phantom — not on invoice)* | — | 15,00 | 18,30 | **PHANTOM** |
| Aceto balsamico di Modena IGP pet 5l*2 Toschi | 16,09 | 15,00 | 15,09 | PARTIAL |
| MOZZA Fior di Latte Expert Julienne 3kg Simonetta | 200,30 | 200,30 | 200,30 | PARTIAL |
| Rulo Di Capra 1kg*2 Simonetta | 10,86 | 10,80 | 10,38 | PARTIAL |
| Recargo por combustible | 2,00 | 2,00 | 2,00 | PARTIAL |
| Farina 00 pasta fresca e gnocchi25kg Caputo | 30,11 | 30,11 | 30,11 | MATCH |

Saved: `classification.json`, `line-trace.json`

---

## Monetary audit

| Metric | Amount |
|--------|--------|
| Ground truth line sum | **€376,50** |
| Pass C raw sum | €394,62 |
| Pass C (extract-invoice) sum | €390,35 |
| Persisted `invoice_items` sum | **€393,32** |
| Invoice total (footer) | **€415,96** ✅ |

**Total still €415.96?** Yes — footer pass independent of line items.

**Rows explaining difference:**
- **Phantom oil** (+€15–18 vs PDF) — primary over-count
- **Aceto** — PDF €16,09 vs persisted €15,09 (qty/price misread)
- **Rulo** — PDF €10,86 vs persisted €10,38 (qty 1 vs 2 confusion from `*2` in description)

Saved: `money-audit.json`

---

## Root Cause

**C) GPT table extraction** — with evidence:

1. Geometry fix works: crop top **386** (was 622) — all 8 real rows visible in crop (`crop-bounds.json`).
2. Phantom appears in **raw GPT JSON** with 9 items before any normalization (`pass-c-raw.json` row 4).
3. `normalizeItems()` and `reconcileLineItemAmounts()` / `reconcileLineItemsToNetSubtotal()` **do not add rows** — phantom count is 9 throughout pipeline.
4. Persistence inserts Pass C output verbatim — DB phantom is a copy of GPT output, not created by DB layer.
5. Likely hallucination trigger: Birra Peroni sub-line lot **6009** + Aceto **pet 5l*2** (10L) fused into a phantom olive-oil SKU.

**Not the root cause:**
- A) Geometry — fixed; crop now correct
- B) OCR — no separate OCR stage
- D) normalizeItems — passthrough only
- E) invoice-line-reconcile — amount fill only, no row insertion
- F) Persistence — reflects GPT output

---

## Recommendation (design only)

1. **Post-extraction row-count gate:** If Pass C returns more rows than visible article codes in crop (or row count > footer-implied count), flag for review.
2. **Phantom filter heuristic:** Reject lines whose name contains `Olio` when no oil product appears in supplier catalog / no matching article code column pattern.
3. **Prompt hardening:** Add explicit rule: *"Do not invent rows from lot numbers or sub-lines (Nº Lote). Only extract rows with a visible Artigo code in the left column."*
4. **Deterministic article-code anchor:** OCR/count 8-digit `Artigo` codes in crop; if GPT returns N ≠ code count, retry or trim.
5. **Regression fixture:** Add Mammafiore PNG asserting exactly 8 items and absence of `/Olio/i` in output.

---

## DB state (queried live)

- `invoice_items` count: **9**
- Inserted: `2026-06-10T21:16:48Z`
- Phantom row: `Olio Nuto 609 10lt` · qty 1 · €18,30

Saved: `db-invoice-items.json`

---

## Evidence files

```
.tmp/mammafiore-line-audit/
  REPORT.md                      # This report
  ground-truth.json              # Task 1
  pass-c-raw.json                # Task 2 — raw GPT before normalizeItems
  line-trace.json                # Task 3 — per-stage row trace
  money-audit.json               # Task 4
  phantom-item-trace.json        # Task 5
  classification.json            # Task 6
  db-invoice-items.json          # Live DB query
  extract-invoice-response.json  # Full edge-function re-extract
  crop-bounds.json               # Table crop geometry
  table-crop.png                 # Image sent to Pass C
  invoice-dataurl.txt            # Source image data URL
  summary.json                   # Run summary
  audit.mts                      # Audit runner script

Reference (prior investigations):
.tmp/mammafiore-investigation/   # Pre-fix 0-item geometry failure
.tmp/mammafiore-fix/             # Post-fix 9-item validation
.tmp/geometry-audit/             # Cross-invoice geometry dataset
```
