# OCR Quantity Anchoring Activation Audit

**Validation Lab:** `bjhnlrgodcqoyzddbpbd` · **Invoice:** `ab52796d-de1d-418d-86e7-230c8f056f09` · **Gorgonzola item:** `091d5bc2-b041-4a65-b652-d9be15b5fd3f` · **Re-read:** `2026-06-24T10:45:37.333848+00:00` · **Read-only** · 2026-06-24

## Executive verdict

**NEVER RUNNING at live re-read** — OCR quantity anchoring exists only in **uncommitted local code** and was **not deployed** to VL `extract-invoice` v38 when the 2026-06-24 re-read produced Gorgonzola **2.00 / €9.35 / €18.73**.

---

## Final 5 questions

| # | Question | Answer |
|---|----------|--------|
| 1 | **Active?** | **Locally yes** — `invoice-qty-prepass.ts` + wired `runTableExtractionPass` in working tree. **Production VL: no** — v38 deployed 2026-06-23 lacks it. |
| 2 | **Executed during live re-read?** | **NO** — re-read at 10:45 UTC used deployed v38; hardening landed ~11:46 UTC; `invoice-qty-prepass.ts` is untracked. |
| 3 | **Bypassed by gating?** | **NO** — not bypassed; function absent from deployed edge. Gorgonzola S3 row **would be in scope** (fractional kg + Emporio discount). |
| 4 | **Never wired?** | **Edge: never deployed.** Client review (`extractionMetaByItemId`, `OCR_QUANTITY_MISMATCH`) also **uncommitted**. |
| 5 | **Why no review?** | No `extraction_meta` from edge; client OCR review not in committed build; persisted trio math-consistent; meta not stored in DB. |

## T1 — Pipeline trace (UI → persist)

| Stage | Live re-read (v38) | Local uncommitted |
|-------|-------------------|-------------------|
| UI | `reExtract` → `runExtraction` | same |
| Edge | `extractTableItemsFromImage` | + `runQuantityPrePass` + `anchorQuantities` |
| Pass C | GPT → `parseMonetaryLineItems` | same |
| Bind | `bindMonetaryColumns` | after anchoring |
| API meta | none | `extraction_meta` per item |
| Persist | qty, unit_price, total only | same (meta stripped) |
| Review | committed: placeholder/qty/amount only | + OCR + math reconciliation |

## T2 — `runQuantityPrePass` executed? **NO**

- HEAD commit has no runQuantityPrePass in invoice-table-extraction.ts
- invoice-qty-prepass.ts is untracked (??) — never committed
- VL extract-invoice still version 38 updated 2026-06-23T10:13:38.814Z
- Live re-read 2026-06-24T10:45:37.333848+00:00 predates hardening implementation 2026-06-24T11:46:08Z
- No qty-prepass-result logs available; edge logs not queried

## T3 — `anchorQuantities` executed? **NO**

If it had run with OCR **1.35**, Pass C **2.00**, total **18.72**: keep Pass C qty, `ocr_qty_mismatch: true`, `quantity_anchored: false`.

## T4 — Gating conditions (`invoice-qty-prepass.ts`)

**Scope (`isQtyAnchorScopeRow`):**
- Unit normalized to `kg`
- OCR/prepass quantity fractional (`abs(qty % 1) > 0.001`)
- Emporio discount semantics: `discount_pct` set OR `gross_unit_price > line_total_net`

**Anchor decision:**
- Skip if OCR vs Pass C delta ≤ 2%
- Anchor if OCR line-total score beats Pass C by > €0.1, or Pass C fails math review and OCR score ≤ €0.5
- Flag ocr_qty_mismatch when delta > 10% and anchor not applied

**Gorgonzola S3 in scope?** **YES**

## T5 — Persisted `invoice_item`

| Field | Live re-read (091d5bc2) | Current VL row |
|-------|-------------------------|----------------|
| id | `091d5bc2-b041-4a65-b652-d9be15b5fd3f` | `8eb3b794-19d7-452e-81ec-1b14a21ea80f` |
| quantity | 2 | 2 |
| unit_price | 9.35 | 9.35 |
| total | 18.72 | 18.73 |
| created_at | 2026-06-24T10:45:37Z | 2026-06-24T11:49:15Z |

091d5bc2 superseded by a later re-read (also pre-anchoring deploy).

DB columns: id, invoice_id, user_id, name, quantity, unit, unit_price, total, created_at, updated_at — **no** ocr_quantity, **no** anchored_quantity, **no** extraction_meta.

## T6 — OCR 1.35 vs persisted 2.00 → `OCR_QTY_MISMATCH`?

**YES with current anchoring code** (delta 48% > 10%, anchor declined). **NO in live re-read** because anchoring never ran and client review unwired/deployed.

## T7 — Replay (OCR 1.35, Pass C 2.00, Total 18.72)

| | Expected (current code) | Actual (VL DB) |
|---|-------------------------|----------------|
| quantity | 2 | 2 |
| unit_price | 9.95 (bound net) | 9.35 (Pass C synthesized) |
| total | 18.72 | 18.72 |
| ocr_qty_mismatch | true | n/a (not stored) |
| OCR review flag | true | false (no meta) |
| Math review (2×9.35 vs 18.72) | — | false |

## Deploy gap (Family A parallel)

VL `extract-invoice` **v38** last updated **2026-06-23T10:13:38.814Z**. Anchoring files are local-only (`?? supabase/functions/extract-invoice/invoice-qty-prepass.ts`, `M supabase/functions/extract-invoice/invoice-table-extraction.ts`). Same deploy lag pattern as Family A Hybrid H.

## Classification

| State | Assessment |
|-------|------------|
| Failed | No — code path never invoked |
| Bypassed | No — not gated out; absent from deploy |
| **Never running (at re-read)** | **Yes** |