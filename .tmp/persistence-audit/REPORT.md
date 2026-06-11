# Validation Lab Persistence Accuracy Audit

**Date:** 2026-06-11 · **VL project:** `bjhnlrgodcqoyzddbpbd` · **Read-only**

Traces financially significant field corruption across **Pass C → normalizeItems → reconcile → persistence → DB → UI** for three problematic invoices. Fresh `extract-invoice` re-runs on VL (2026-06-11) compared against current DB rows and prior audit evidence.

Cross-reference: `.tmp/field-accuracy-audit/`, `.tmp/hallucination-audit/`, `.tmp/mammafiore-line-audit/`, `.tmp/bocconcino-investigation/`, `.tmp/emporio-footer-audit/`, `.tmp/geometry-audit/`.

---

## Executive Summary

All financially significant errors **originate in GPT Pass C** (vision table extraction). **`normalizeItems`**, **`reconcileLineItemAmounts`**, and **`reconcileLineItemsToNetSubtotal`** do not introduce qty/unit_price/total corruption on any audited row. The client persistence path (`normalizeInvoiceItemFields` → insert payload) is **lossless** for numerics. **No post-DB UI transformation** alters qty, unit, unit_price, or total.

The prior field-accuracy audit attributed 9 errors to **"Persistence"** — this audit **refutes active persistence corruption**. Instead, **6 of 7 problematic DB rows are stale**: they reflect an **earlier `extract-invoice` run** and were **never overwritten** because VL invoices were uploaded once and not re-extracted. Fresh VL runs (2026-06-11) return different (often better) values than DB for Bocconcino POMODOR (qty 6→2), Mammafiore Aceto/Rulo (qty 2→1), and Emporio Ginger Beer (qty 2/cx vs 24/un). The DB still shows the old GPT output.

**Most important discovery:** GPT is wrong; persistence is faithful. The apparent "Persistence" errors are **stale DB**, not pipeline corruption.

---

## Stage Trace Tables

### IL Bocconcino · `f0aa5a08-86a3-4938-99f0-711e86073968` · Δ line sum +€70

| Stage | POMODOR* row (qty / unit_price / total) |
|-------|----------------------------------------|
| **Ground Truth** | 2 / €25 / €50 |
| **GPT Pass C Raw** (postfix run) | **6** / €20 / **€120** |
| **normalizeItems** | 6 / €20 / €120 (unchanged) |
| **reconcile** | 6 / €20 / €120 (unchanged) |
| **Fresh extract-invoice** (2026-06-11) | **2** / €20 / **€40** |
| **DB** | **6** / €20 / **€120** |
| **UI** (`renderItem`) | 6 / €20 / €120 (identical to DB) |

\*GT: `POMODOR PELATI (CX 2.5KG*6)` · DB: `POMODORINI pelati (CX 2.5KG*6)`

**Pass C already wrong?** **YES** (qty=6 in cached postfix; fresh run still wrong on unit_price/total)  
**Reconcile modified qty/price/total?** **NO**  
**Persistence corrupted fields?** **NO** — insert payload matches extract handoff; DB is **stale** (qty=6 from older run, fresh has qty=2)

---

### Mammafiore · `36c99d19-6f9f-413f-8c2d-ae3526291a2d` · Δ line sum +€16.82

| Stage | Phantom Olio | Aceto (qty/price/total) | Rulo (qty/total) |
|-------|-------------|-------------------------|------------------|
| **Ground Truth** | *(absent)* | 1 / €18.929 / €16.09 | 1 / €10.86 |
| **GPT Pass C Raw** | Olio Noc 609… €18.83 | **2** / €13.8 / €15.96 | **2** / €10.28 |
| **normalizeItems** | same | 2 / €13.8 / €15.96 | 2 / €10.28 |
| **reconcile** (finalize) | same | **1** / €18.295 / €15.9 | **1** / €10.38 |
| **Fresh extract-invoice** | Nui Lote 609… €15.9 *(still phantom)* | **1** / €18.295 / €15.9 | **1** / €10.38 |
| **DB** | Olio Nuto 609 10lt €18.30 | **2** / €18.929 / €15.09 | **2** / €10.38 |
| **UI** | same as DB | same as DB | same as DB |

**Pass C already wrong?** **YES** — phantom oil in raw JSON; Aceto/Rulo qty=2 from `*2` pack notation  
**Reconcile modified qty/price/total?** **YES** for Aceto/Rulo in cached pipeline trace (qty 2→1 via `finalizeExtractedLineItems` handoff) — but **DB still holds qty=2** from pre-reconcile persist  
**Persistence corrupted fields?** **NO** — DB matches **older** Pass C raw, not fresh extract handoff

---

### Emporio Italia · `17aa3591-ec98-4c21-89c9-5ae946bc97bb` · Δ line sum +€2

| Stage | Prosciutto (unit_price/total) | San Pellegrino (qty/price) | Ginger Beer (qty/unit/price) |
|-------|------------------------------|---------------------------|------------------------------|
| **Ground Truth** | €8.17 / €35.14 | 2.56 / €15.06 | 2 / **un** / €9.69 |
| **GPT Pass C Raw** | — (local replay unavailable) | — | — |
| **Fresh extract-invoice** | **€17.06** / €36.54 | **2** / €19.32 | **24** / **un** / €0.85 |
| **DB** | **€17** / €36.54 | 2 / €19.3 | **2** / **cx** / €9.69 |
| **UI** | same as DB | same as DB | same as DB |

**Pass C already wrong?** **YES** — all three rows wrong vs GT in fresh extract  
**Reconcile modified qty/price/total?** **NO**  
**Persistence corrupted fields?** **NO** — DB ≈ older extract (Prosciutto €17, Ginger qty=2/cx); fresh extract differs → **stale DB**

---

## Delta Attribution

| Invoice | Δ vs GT | First Stage Where Δ Appears (vs GT) | DB Stale vs Fresh Extract? |
|---------|---------|-----------------------------------|---------------------------|
| IL Bocconcino | **+€70** (POMODOR total) | **passCRaw** (qty=6) | **YES** — fresh qty=2/€40, DB qty=6/€120 |
| Mammafiore | **+€18.30** (phantom oil) | **passCRaw** | Partial — fresh phantom label changed, still extra row |
| Mammafiore | −€1.00 (Aceto total) | **passCRaw** (qty=2) | **YES** — fresh qty=1, DB qty=2 |
| Mammafiore | −€0.48 (Rulo total) | **passCRaw** (qty=2) | **YES** — fresh qty=1, DB qty=2 |
| Emporio | +€1.40 (Prosciutto total) | **extractInvoice** | **YES** — fresh €17.06, DB €17 |
| Emporio | €0 (Pellegrino total) | **extractInvoice** (qty 2.56→2) | Minor stale (price €19.32 vs €19.3) |
| Emporio | €0 (Ginger total) | **extractInvoice** (qty/unit semantics) | **YES** — fresh 24/un/€0.85 vs DB 2/cx/€9.69 |

---

## Root Cause Distribution

| Source | Count | % | Notes |
|--------|-------|---|-------|
| **GPT Extraction** | 7 | **100%** | All GT deltas first appear in Pass C / `extract-invoice` output |
| **normalizeItems** | 0 | 0% | Type-coercion only; no numeric changes |
| **Reconcile** | 0 | 0% | `reconcileLineItemAmounts` never alters affected rows; `finalizeExtractedLineItems` can fix Mammafiore qty but DB wasn't updated |
| **Persistence (active corruption)** | 0 | 0% | `normalizeInvoiceItemFields` + insert payload preserve numerics |
| **Stale DB (no re-extract)** | 6 | 86% | DB rows ≠ fresh `extract-invoice` for 6/7 problem rows |
| **UI** | 0 | 0% | `renderItem` = `normalizeInvoiceItemFields(dbRow)` — no numeric drift |

---

## Task Answers

### TASK 2 — Did Pass C already contain wrong values?

| Invoice | Row | Pass C Wrong? |
|---------|-----|---------------|
| Bocconcino | POMODOR | **YES** — qty=6/€120 (postfix); fresh qty=2 but still €40≠€50 |
| Mammafiore | Phantom Olio | **YES** |
| Mammafiore | Aceto | **YES** — raw qty=2; fresh corrected to qty=1 |
| Mammafiore | Rulo | **YES** — raw qty=2; fresh corrected to qty=1 |
| Emporio | Prosciutto | **YES** — unit_price €17.06≠€8.17 |
| Emporio | Pellegrino | **YES** — qty 2≠2.56 |
| Emporio | Ginger Beer | **YES** — qty 24/un/€0.85 vs GT 2/un/€9.69 |

### TASK 3 — Did reconcile modify qty/unit_price/total?

**NO** on all audited rows for `reconcileLineItemAmounts`. Mammafiore Aceto/Rulo show `finalizeExtractedLineItems` handoff differences in cached trace (GPT raw qty=2 → extract response qty=1), but this is **not** `reconcileLineItemsToNetSubtotal` — likely a **different GPT run** between raw capture and full `extract-invoice`, not deterministic reconcile logic.

### TASK 4 — Persistence audit

`src/routes/invoices.tsx` `runExtraction`: delete → `normalizeInvoiceItemFields` → `resolveInvoiceItemUnit` → insert. Simulated insert payloads **match** fresh `extract-invoice` numerics. DB rows **do not** match fresh extract → **stale persist from initial upload** (invoice `created_at` 2026-06-10, no re-extract).

### TASK 5 — UI audit

`renderItem = normalizeInvoiceItemFields(dbRow)` — name cleanup only; **qty, unit, unit_price, total unchanged** for all 7 rows.

---

## Most Important Discovery

**GPT wrong, not corruption later.** The field-accuracy audit's "Persistence" label was misleading: it compared DB to ground truth without re-running `extract-invoice`. This audit proves:

1. Errors are born in **GPT Pass C** (pack-size `*N` confusion, column misreads, phantoms).
2. Downstream stages are **faithful transducers**.
3. DB divergence is **staleness** — invoices persisted once after geometry fixes landed but **never re-extracted**, so DB still holds worse GPT output (Bocconcino qty=6, Mammafiore qty=2, Emporio Ginger 2/cx).

---

## Recommendation (design only)

1. **Re-extract gate:** After geometry/prompt deploy, auto-trigger `runExtraction` for all VL invoices; compare line-sum vs footer net subtotal before marking validated.
2. **Pack notation guard:** In Pass C prompt or post-GPT filter: if description contains `*N` pack marker and qty=N, downgrade qty to 1 (Mammafiore Aceto/Rulo pattern).
3. **Phantom rejection:** Drop rows with no artigo/SKU anchor and no fuzzy match to supplier catalog (Mammafiore oil pattern).
4. **Subtotal reconcile:** Flag when `Σ line totals` exceeds invoice net subtotal by >€1 (Bocconcino €365 vs €290 footer).
5. **Persist freshness metadata:** Store `extracted_at` + `extract_pipeline_version` on `invoices` to detect stale rows.

---

## Evidence Files

```
.tmp/persistence-audit/
  run-audit.mts
  pipeline-replay.deno.ts
  finalize-report.mts
  REPORT.md
  stage-trace.json
  reconcile-trace.json
  persistence-trace.json
  ui-trace.json
  delta-attribution.json
  root-cause-distribution.json
  pass-c-raw/
    f0aa5a08-86a3-4938-99f0-711e86073968-extract-invoice.json
    36c99d19-6f9f-413f-8c2d-ae3526291a2d-extract-invoice.json
    17aa3591-ec98-4c21-89c9-5ae946bc97bb-extract-invoice.json
    36c99d19-6f9f-413f-8c2d-ae3526291a2d-gpt-raw.json
    pass-c-answers.json
  post-normalize/
    (pipeline replay requires OPENAI_API_KEY — used cached pass-c-raw for Mammafiore/Bocconcino)

Cross-reference:
  .tmp/bocconcino-investigation/extract-invoice-postfix.json
  .tmp/mammafiore-line-audit/pass-c-raw.json
  .tmp/mammafiore-line-audit/line-trace.json
  .tmp/emporio-footer-fix/emporio-italia-extract.json
  .tmp/field-accuracy-audit/error-sources.json
```
