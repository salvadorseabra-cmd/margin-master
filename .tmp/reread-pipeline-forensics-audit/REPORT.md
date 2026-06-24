# Re-Read Pipeline Forensics Audit

**Validation Lab:** `bjhnlrgodcqoyzddbpbd` · **Invoice:** `ab52796d-de1d-418d-86e7-230c8f056f09` · **Re-read:** `2026-06-24T10:45:37.333848+00:00` · **Read-only** · 2026-06-24

## Executive answer

**Why did Re-read replace Gorgonzola with 2.00 kg / €9.35 / €18.72 when the PDF shows 1.35 kg / €9.95 / €13.44?**

Re-read executed a **fresh** `extract-invoice` Pass C GPT call on the same Emporio screenshot. GPT **hallucinated a new internally-consistent triple**: qty **2** (misread from 1,35), unit_price **9.35** (synthesized, not PDF net 9.95), total **18.72** (computed as ~2×9.36 instead of copying Preço Total **13,44**). The client **deleted and re-inserted** all lines losslessly — no cache, no line mix-up, no post-insert mutation.

**Required verdict: A) Fresh hallucination**

---

## T1 — Re-read execution trace

| Layer | Detail |
|-------|--------|
| UI | `reExtract(row)` → `invoices.tsx:2411` |
| Preconditions | `file_path` / `file_url` present; `isExtractableInvoicePath` |
| Image | Signed URL → blob → `fileToExtractionDataUrl` |
| API | `runExtraction` → `supabase.functions.invoke('extract-invoice', { imageDataUrl })` |
| Edge fn | `extract-invoice` **v38** (deployed 2026-06-23 10:13:38 UTC) |
| Model | gpt-4.1, temperature 0, seed 42, 4 vision passes |
| Pass C | `extractTableItemsFromImage` → `bindMonetaryColumns` → `reconcileLineItemAmounts` |
| Cache | **None** in production code |
| Persist | DELETE all `invoice_items` → INSERT normalized rows |
| Re-read batch ts | `2026-06-24T10:45:37.333848+00:00` (8 rows, new UUIDs) |
| Invoice file | `acfb54e5-785f-4bc8-b47b-3914452e18a5/1781218392988-Screenshot_2026-06-07_at_21.05.07.png` |

## T2 — Forensic timeline

| When (UTC) | Event | Evidence |
|------------|-------|----------|
| 2026-06-11T22:53:16Z | Invoice ab52796d uploaded (Emporio screenshot PNG) | invoices.created_at |
| 2026-06-12T23:59:04Z | v28 geometry replay: Gorgonzola 1.05/10.88/13.44 | final-validation-lab-rerun-v28/extracts/17aa3591.json |
| 2026-06-13T16:35:39Z | Stability run2 lab extract: Gorgonzola 2/9.35/18.68 | final-stability-audit/run2.json |
| 2026-06-23T10:28:12Z | Prior re-read batch: Gorgonzola 2/8.69/13.44 (total preserved) | reread-persistence-path-audit/results.json |
| 2026-06-23T10:41:31Z | Original item bece238e persisted: 1.05/10.88/13.44 | gorgonzola-persistence-reconciliation-audit |
| 2026-06-24T10:45:37.333848+00:00 | Live re-read: all 8 lines replaced; Gorgonzola 091d5bc2 → 2/9.35/18.72 | VL invoice_items.created_at batch |
| 2026-06-24T10:45:39Z | Ingredient current_price updated to 9.35 | ingredients.updated_at |

## T3 — Recovered artifacts

| Artifact | Gorgonzola qty | unit_price | total | Reconciles? |
|----------|----------------|------------|-------|-------------|
| v28-deploy-replay | 1.05 | 10.88 | 13.44 | NO |
| stability-run2 | 2 | 9.35 | 18.68 | YES |
| pass-c-raw-ocr-era | 1.35 | 9.82 | 13.44 | NO |
| pass-c-refinement | 1.35 | 9.82 | 13.44 | NO |
| **live re-read (VL DB)** | **2** | **9.35** | **18.72** | **YES** |

**Live 2026-06-24 extract-invoice HTTP response:** not captured in workspace.

## T4 — First appearance

| Value | First appearance |
|-------|------------------|
| **2.00** (qty) | stability-run2 lab extract (not PDF 1.35) |
| **9.35** (unit) | stability-run2 lab extract (not PDF 9.95) |
| **18.72** (total) | **reread-persisted** (closest lab: run2 **18.68**, Δ€0.04) |
| **1.35** (PDF qty) | PDF / OCR pass-c-raw |
| **9.95** (PDF net) | PDF arithmetic only |
| **13.44** (PDF total) | PDF through original; **lost** on re-read |

## T5 — Cache investigation

**Does re-read always re-extract? YES.**

- reExtract: signed URL fetch → blob → fileToExtractionDataUrl → runExtraction — no local cache (invoices.tsx:2411-2421)
- runExtraction: supabase.functions.invoke('extract-invoice') with fresh imageDataUrl — no cache key param (invoices.tsx:1378)
- extract-invoice/index.ts: no cache read/write; each request runs 4 GPT vision passes
- gpt-raw-cache files under .tmp/persistence-audit/ are audit scripts only, not production runtime
- Persisted batch ≠ exact replay of stability-run2 (Gorgonzola total 18.72 vs 18.68; Ginger Beer 24×0.85 vs 2×9.77) — rules out serving stale lab JSON
- Batch vs stability-run2 exact line matches: **6/8** (not a stale cache replay)

## T6 — Could 2.00/18.72 belong to another line? **NO**

Only the Gorgonzola row has unit_price **9.35** or total **18.72**. SanPellegrino shares qty **2** but at **19.28 / 38.56**.

## T7 — Comparison table

| Field | PDF | Original (bece238e) | Re-read (091d5bc2) |
|-------|-----|---------------------|---------------------|
| qty | 1.35 | 1.05 | 2.00 |
| unit_price (net) | 9.95 | 10.88 | 9.35 |
| line_total | 13.44 | 13.44 | 18.72 |
| qty×price=total | ✓ | ✗ (11.42≠13.44) | ✓ (18.7≈18.72) |
| Matches PDF | ✓ | partial (total only) | ✗ |

## T8 — Persistence mutate? **NO**

- Extraction → insert: **lossless** (`bindMonetaryColumns`, `reconcileLineItemAmounts`, `normalizeInvoiceItemFields` pass-through on re-read trio)
- DB: DELETE+INSERT at re-read; `updated_at === created_at` — no post-insert monetary UPDATE

## T9 — Original vs re-read root cause

**Same underlying cause:** GPT Pass C variance on Emporio Gorgonzola.

| | Original | Re-read |
|---|----------|---------|
| Qty error | 1.05 (1,35→1,05) | 2.00 (1,35→2) |
| Price error | 10.88 (invented) | 9.35 (synthesized) |
| Total | **13.44 copied correctly** | **18.72 synthesized (wrong)** |
| Math | Fails | Passes |
| PDF distance | Closer (L1=1.23) | Farther (L1=6.53) |

## T10 — Final answers

1. **Why 2.00?** GPT misread fractional qty 1,35 as **2** — documented Gorgonzola instability (6/10 stability runs).
2. **Why 9.35?** GPT emitted a synthesized net unit (~total/qty), not PDF gross-discount net **9.95**.
3. **Why 18.72?** GPT computed line total as **qty×unit** instead of copying visible **Preço Total 13,44**.
4. **Same or different root cause?** **Same** — Pass C GPT variance; different manifestation (original preserved total; re-read preserved internal math).
5. **Verdict A–F:** **A) Fresh hallucination**

### Ruled out

| Option | Why ruled out |
|--------|---------------|
| B) Cached extraction | No runtime cache; live batch ≠ exact lab replay |
| C) Wrong invoice artifact | Same ab52796d / same screenshot |
| D) Line mix-up | Unique 9.35/18.72 on Gorgonzola only |
| E) Pipeline bug | Post-GPT stages pass-through; corruption at GPT |
| F) Unknown | Mechanism documented with lab precedent |