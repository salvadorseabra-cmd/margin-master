# Family A Execution Audit

**Generated:** 2026-06-23  
**Mode:** STRICT READ-ONLY  
**Invoice:** `f0aa5a08-86a3-4938-99f0-711e86073968` (IL BOCCONCINO)  
**Validation Lab:** `bjhnlrgodcqoyzddbpbd`

**Goal:** Explain why Family A implementation produced no change after Re-read.

**Prior work used (not redone):** `.tmp/family-a-deployment-path-audit/`

---

## Executive Answers

| # | Question | Verdict | One-line proof |
|---|----------|---------|----------------|
| 1 | Was **modified** `invoice-table-extraction.ts` executed during Re-read? | **NO** | Re-read hit VL `extract-invoice` **v36** (`853e02c`, 2026-06-20). Family A is **03ae903** (2026-06-23), never deployed. |
| 2 | Local code, deployed edge function, or cached extraction? | **Deployed edge function** | `runExtraction` always `invoke("extract-invoice")`; no cache layer in client or edge code. |
| 3 | Did new prompt text reach `callOpenAiJson`? | **NO** | `BOCCONCINO UNDISCOUNTED BLANK-DESC` and softened `TOTAL COLUMN ISOLATION` absent from v36 bundle. |
| 4 | If yes, did GPT still return qty=2? | **N/A** | Q3 is NO. Deployed v36 path still yields qty=2 (edge invoke + DB). |
| 5 | If no, where was new code bypassed? | **Supabase edge deployment boundary** | Git has 03ae903; Supabase still serves v36. Re-read ran 3 min after commit, before any deploy. |

---

## Why No Observable Change

Family A changed only `TABLE_EXTRACTION_SYSTEM_PROMPT` in local git. Re-read **did** run extraction end-to-end (Hybrid H table pass, fresh GPT call, DELETE+INSERT persistence). It executed the **already-deployed** v36 prompt bundle, which predates Family A and still returns Mezzi/Ricotta **qty=2**. The UI correctly persisted that output — so quantities looked unchanged relative to the pre-fix bad path.

---

## Evidence Path

```
[Re-read UI]  reExtract()  invoices.tsx:2393
      │
      ▼
[Client]  runExtraction()  invoices.tsx:1368
      │   supabase.functions.invoke("extract-invoice", { imageDataUrl })
      │   Project: bjhnlrgodcqoyzddbpbd (.env.local)
      ▼
[Edge — DEPLOYED v36, commit 853e02c, NOT 03ae903]
      │   index.ts:148 → extractTableItemsFromImage
      │   invoice-table-extraction.ts:397 → callOpenAiJson
      │   Prompt: OLD (no BOCCONCINO guardrail)
      ▼
[GPT response — proxy evidence]
      │   v36 edge invoke: Mezzi qty=2, Ricotta qty=2
      │   (edge-invoke-final.json; no raw JSON in API response)
      ▼
[Client persistence]  DELETE + INSERT invoice_items  invoices.tsx:1430-1461
      ▼
[VL DB]  created_at 2026-06-23T00:56:44Z — Mezzi qty=2, Ricotta qty=2
```

---

## 1. Was modified `invoice-table-extraction.ts` executed?

**NO.**

| Fact | Evidence |
|------|----------|
| Re-read invokes Hybrid H | `extract-invoice/index.ts:148` → `extractTableItemsFromImage` → `runTableExtractionPass` → `callOpenAiJson` (`invoice-table-extraction.ts:397`) |
| Active deploy is pre–Family A | VL `extract-invoice` **v36**, `updated_at` 2026-06-20 → commit `853e02c` |
| Family A not in v36 | `git show 853e02c:.../invoice-table-extraction.ts \| rg BOCCONCINO` → no match; section exists only in `03ae903` |
| Re-read after commit, before deploy | Family A commit `2026-06-23T00:53:19Z`; DB rows `created_at` `2026-06-23T00:56:44Z` (+3.4 min); still v36 |

The **file** `invoice-table-extraction.ts` ran on Supabase, but the **modified** version from Family A did not.

---

## 2. Local code, deployed edge function, or cached extraction?

**Deployed edge function.**

| Surface | Used? | Evidence |
|---------|-------|----------|
| **Deployed edge function** | **YES** | Remote `extract-invoice` on `bjhnlrgodcqoyzddbpbd`; v36 confirmed via CLI |
| Local code | NO | Edge functions execute on Supabase; local `03ae903` not live without `supabase functions deploy` |
| Cached extraction | NO | No cache in `runExtraction` or `extract-invoice`; Pass C `gpt-raw-cache` is archival only, not Hybrid H Re-read path |

`.env.local` points UI at VL (`VITE_SUPABASE_URL=https://bjhnlrgodcqoyzddbpbd.supabase.co`).

---

## 3. Did new prompt text reach `callOpenAiJson`?

**NO.**

Family A additions (commit `03ae903`):

1. Softened `TOTAL COLUMN ISOLATION` — undiscounted qty=1 may have `line_total_net ≈ gross_unit_price`.
2. New `BOCCONCINO UNDISCOUNTED BLANK-DESC ROWS` with MEZZI/RICOTTA negative examples.

v36 (`853e02c`) still has the old rule:

> *When quantity > 1, line_total_net should exceed gross_unit_price*

and **no** `BOCCONCINO UNDISCOUNTED` section (`git diff 853e02c 03ae903`).

`callOpenAiJson` at line 397 passes `TABLE_EXTRACTION_SYSTEM_PROMPT` from whatever bundle is deployed — v36, not 03ae903.

**Live GPT request capture for this specific Re-read:** unavailable (API returns post-bind items only). Prompt version inferred from deploy state + commit diff.

---

## 4. If yes, did GPT still return qty=2?

**N/A** (Q3 is NO).

**Deployed-path behavior (proxy for this Re-read):**

| Source | Mezzi qty | Ricotta qty |
|--------|----------:|------------:|
| v36 edge invoke (2026-06-20) | 2 | 2 |
| Post–Family A Re-read DB (2026-06-23) | 2 | 2 |
| PDF ground truth | 1 | 1 |

Pipeline replay (`.tmp/family-a-implementation/capture-result.json`) confirms post-GPT stages do not mutate quantity — qty=2 in DB reflects GPT-era output from v36 prompt, not client-side overwrite.

---

## 5. Where was new code bypassed?

**Supabase edge deployment boundary** (between local git and live function).

```
Local git HEAD  ──03ae903──►  invoice-table-extraction.ts (Family A prompt)
                                    │
                                    │  NO deploy step executed
                                    ▼
Supabase VL     ──v36────────►  invoice-table-extraction.ts (853e02c prompt)
                                    │
                                    ▼
                         callOpenAiJson → qty=2 → DB persist
```

- No v37+ in `supabase functions list --project-ref bjhnlrgodcqoyzddbpbd`
- `.tmp/family-a-implementation/implementation-result.json`: `postFixLiveValidation: PENDING — requires VL deploy`
- Re-read is **not** a separate code path that could skip the edge function

---

## Persisted State After Re-read

VL DB query (service role, 2026-06-23):

| Product | qty | created_at |
|---------|----:|------------|
| MEZZI PACCHERI MANCINI (CX 1KG*6) | **2** | 2026-06-23T00:56:44Z |
| RICOTTA TREVIGIANA 1,5KG | **2** | 2026-06-23T00:56:44Z |

All 7 rows share the same `created_at` — consistent with successful `runExtraction` DELETE+INSERT, not a skipped or cached path.

---

## What Was Checked

| Check | Result |
|-------|--------|
| Prior deployment path audit | Used as-is |
| `supabase functions list` VL | v36 active |
| `git diff 853e02c 03ae903` | Prompt-only Family A delta |
| Client `reExtract` / `runExtraction` trace | No cache, remote invoke |
| Edge function cache grep | None |
| VL DB `invoice_items` for f0aa5a08 | qty=2, timestamp post-commit |
| Live Hybrid H GPT raw JSON for this Re-read | Not in API response |

---

## Machine-Readable Evidence

`.tmp/family-a-execution-audit/evidence.json`
