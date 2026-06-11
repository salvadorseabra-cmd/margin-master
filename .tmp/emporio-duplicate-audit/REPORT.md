# Emporio Duplicated Line Items — Investigation Report

Generated: 2026-06-11  
Invoice: **Emporio Italia** · `17aa3591-ec98-4c21-89c9-5ae946bc97bb`  
VL project: `bjhnlrgodcqoyzddbpbd`  
Mode: **READ-ONLY investigation** (no code changes)

---

## Executive Summary

Emporio shows **16 line items** (expected **8**) after post–Hybrid H Phase 1+2 re-read. Investigation confirms:

1. **Re-read did delete old items** — prior 8 rows (`created_at` 2026-06-10) are **gone**.
2. **Counts: 8 → 16** — exactly **two insert batches** of 8 rows each, **9ms apart**.
3. Duplicates are **two separate GPT extractions**, not byte-identical copies — OCR names and amounts differ between batches (e.g. Prosciutto €17 vs €9.15).
4. **Extraction did not return 16 rows in one call** — deployed `extract-invoice` re-invoke returned **8 unique items**.
5. **Root cause: client-side persistence race** — overlapping `runExtraction` calls (double re-read / concurrent submit) both pass `delete` then both `insert`, yielding 16 rows. **Not** a Phase 1 header-crop or Phase 2 schema bug directly.

---

## Q1 — Did re-read create new invoice_items without deleting old ones?

**NO — old items were deleted.**

| Snapshot | Item count | `created_at` |
|----------|------------|--------------|
| Historical DB (`.tmp/emporio-footer-audit/emporio/db-record.json`) | **8** | `2026-06-10T18:27:15` |
| Current VL DB (queried 2026-06-11) | **16** | `2026-06-11T22:41:41` only |

All 8 historical row IDs (e.g. `c0cfaecf-82ce-4fc7-8b23-d8481f9dfbc3`) are **absent** from current DB. Re-read **did replace** the prior generation; it did **not** append on top of stale rows.

---

## Q2 — Compare invoice_items count before and after re-read

| Stage | Count | Evidence |
|-------|-------|----------|
| Before re-read (Jun 10 upload) | **8** | `db-record.json`, `invoice-items.json` |
| Prior Pass C re-extract (Jun 11 01:02, pre–Phase 1+2) | **8** | `passc-refinement-validation/reextract/17aa3591-...json` |
| After re-read (Jun 11 22:41, post–Phase 1+2) | **16** | VL `invoice_items` query |
| Fresh extract invoke (Jun 11 22:48, audit) | **8** | Deployed `extract-invoice` — no duplicates |

**Delta:** +8 rows net, structured as **2×8** not **1×16**.

---

## Q3 — Are duplicated rows identical or newly extracted?

**Newly extracted pairs — not identical.**

Each of 7–8 products appears twice with **GPT variance** between batches:

| Product | Batch A (`.517584`) | Batch B (`.526773`) |
|---------|---------------------|---------------------|
| Prosciutto | qty **4.3**, unit **€17.00**, name `4+ 4,25KG` | qty **4**, unit **€9.15**, name `4+, 4,25Kg` |
| San Pellegrino | qty **1**, total **€25.74** | qty **2**, total **€38.56** |
| Gorgonzola | `Castellapo 1/8*~1,5Kg`, €9.82 | `Castelli 1978 - 1,5 Kg`, €9.92 |
| De Cecco | qty 24, €2.35 / €50.20 | **Same numbers** (only duplicate with identical amounts) |

Batch A shows Phase 2 failure mode on Prosciutto (**€17 ≈ Desc.(%) 17.50**). Batch B is a second extraction with different OCR. Both include `"Produto de Stock"` suffix typical of **header-inclusive crop** (Phase 1).

---

## Q4 — Did extraction return duplicates or did persistence create duplicates?

| Layer | Verdict | Evidence |
|-------|---------|----------|
| **Extraction (single call)** | **NO duplicates** | Deployed invoke: **8 items**, `dupes: []` |
| **Persistence** | **YES — created duplicates** | 16 DB rows, two `created_at` buckets 9ms apart |

Extraction is **not** emitting 16 rows per request. Persistence ran **twice** and retained both result sets.

---

## Q5 — Trace exact source of duplication

### Code path

```
reExtract() [invoices.tsx:2080]
  → runExtraction(invoiceId, dataUrl) [1215]
      → extract-invoice edge function [1236]
      → DELETE invoice_items WHERE invoice_id = ? [1263]  ← error not checked
      → INSERT invoice_items (bulk) [1302]
  → loadItems() [2132]
```

`extract-invoice/index.ts` **does not write** to `invoice_items`. All persistence is **client-side** in `runExtraction`.

### Mechanism (most likely)

**Concurrent double `runExtraction`** (double-click Re-read, or two overlapping triggers):

```
T0  Run A: DELETE  (removes old 8 rows → 0)
T1  Run B: DELETE  (0 rows)
T2  Run A: INSERT 8 rows  → created_at .517584
T3  Run B: INSERT 8 rows  → created_at .526773
Result: 16 rows
```

Supporting evidence:
- Two insert timestamps **9ms apart** on same invoice
- Exactly **8+8** rows
- No `updated_at` changes — all rows are inserts, not updates
- `invoice_items` has **no unique constraint** on `(invoice_id, name)` — second insert always succeeds
- Delete return value is **never checked** (`invoices.tsx:1263`)

### Ruled out

| Hypothesis | Status |
|------------|--------|
| Delete skipped entirely | **Ruled out** — old Jun 10 rows gone |
| Single extraction returned 16 items | **Ruled out** — fresh invoke returns 8 |
| Append without delete (stale + new) | **Ruled out** — would show mixed `created_at` (Jun 10 + Jun 11) |
| Phase 1 header crop duplicates rows in GPT | **Unlikely** — current deploy returns 8; duplication is at DB layer |

### Phase 1+2 correlation

Phase 1+2 **coincides temporally** with the bad re-read but is **not the direct duplication mechanism**. Header-inclusive crop may change GPT output (e.g. `"Produto de Stock"` suffix, structured monetary fields) — visible in batch A/B names — but **duplicate count comes from two persistence writes**, not one doubled extraction response.

---

## Artifacts

| File | Contents |
|------|----------|
| `duplicate-trace.json` | Counts, DB rows, duplicate name analysis |
| `persistence-path.json` | Code path + concurrency analysis |
| `extraction-vs-db.json` | Deployed extract (8) vs DB (16) comparison |
| `run-audit.mts` | Query + invoke script (reproducible) |

---

## Recommendations (investigation only — not implemented)

1. Add **extraction-in-flight guard** on `reExtract` / `runExtraction` (disable button while extracting).
2. **Check delete error** before insert; use transaction or `delete` + `insert` via RPC.
3. Optional: unique index on `(invoice_id, normalized_name)` or dedupe before insert.
4. Re-run single re-read after guard — expect 8 rows.

---

## Answers at a glance

| # | Question | Answer |
|---|----------|--------|
| 1 | Re-read without delete? | **NO** — old 8 deleted |
| 2 | Count before/after | **8 → 16** (two batches of 8) |
| 3 | Identical or new? | **New extractions** — GPT variance between pairs |
| 4 | Extraction vs persistence? | **Persistence** (double insert) |
| 5 | Exact mechanism? | **Concurrent `runExtraction` race** — delete-then-insert not atomic |
