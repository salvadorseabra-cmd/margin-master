# Family A Implementation Report

**Generated:** 2026-06-23  
**Validation Lab:** `bjhnlrgodcqoyzddbpbd`  
**Invoice:** `f0aa5a08-86a3-4938-99f0-711e86073968` (IL BOCCONCINO)  
**Scope:** Ricotta + Mezzi only — Mozzarella, Ginger Beer, Guanciale untouched

---

## Phase 1 — Capture & Prove

### Proof: **A** (GPT authored qty=2)

**B eliminated:** Production pipeline replay shows quantity is invariant through all post-GPT stages when GPT emits qty=2:

| Stage | Mezzi qty | Ricotta qty |
|-------|-----------|-------------|
| rawGpt (synthetic v25 profile) | 2 | 2 |
| postNormalize | 2 | 2 |
| postBind | 2 | 2 |
| postReconcile | 2 | 2 |
| postFinalize | 2 | 2 |

Code audit confirms no downstream stage assigns quantity (`parseMonetaryLineItems`, `bindMonetaryColumns`, `reconcileLineItemAmounts`, `finalizeExtractedLineItems`).

**A proven:** Pass C GPT raw cache and baseline reextract both emit qty=**1** for Mezzi/Ricotta; Hybrid H v25/v36 final output emits qty=**2** with no intervening mutation → first incorrect value is at `callOpenAiJson` (Hybrid H table GPT pass).

| Source | Mezzi | Ricotta |
|--------|------:|--------:|
| PDF / OCR ground truth | 1 | 1 |
| Pass C gpt-raw-cache | 1 | 1 |
| Hybrid H v25 extract | 2 | 2 |
| VL edge invoke v36 | 2 | 2 |

**Live raw JSON capture:** Not completed — `OPENAI_API_KEY` unavailable in local environment. Existing `.tmp/family-a-v25-raw-capture/` artifacts (edge-invoke-final.json) confirm post-bind qty=2 but do not include structured GPT JSON. Script ready: `.tmp/family-a-implementation/capture-phase1.mts`.

**Mechanism (aligned with causal attribution):** Undiscounted blank-DESC Bocconcino rows where VALOR ≈ P.VENDA at qty=1; existing `qty>1 → line_total_net > gross_unit_price` heuristic likely pushed GPT to qty=2 despite pack-metadata rules.

Artifacts: `.tmp/family-a-implementation/capture-result.json`

---

## Phase 2 — Implement

### Strategy

Extraction-source fix at Hybrid H (`TABLE_EXTRACTION_SYSTEM_PROMPT`). **Option C binding gates not used.**

### Changes (`invoice-table-extraction.ts`)

1. **TOTAL COLUMN ISOLATION** — Clarified that undiscounted qty=1 rows may have `line_total_net ≈ gross_unit_price`; do not infer qty>1 from that equality alone.

2. **BOCCONCINO UNDISCOUNTED BLANK-DESC guardrail** — Added negative examples mirroring POMODORI guardrail for the undiscounted class:
   - `MEZZI PACCHERI MANCINI (CX 1KG*6)` → qty **1** (NOT 6, NOT 2)
   - `RICOTTA TREVIGIANA 1,5KG` → qty **1** (NOT 2; 1,5KG is weight metadata)

### Changed files

- `supabase/functions/extract-invoice/invoice-table-extraction.ts`

---

## Test Results

| Suite | Result |
|-------|--------|
| `invoice-monetary-binding.test.ts` | **16/16 passed** |
| `invoice-image-crop.test.ts` | Not run (requires `--allow-read` on `.tmp` fixtures; unrelated to prompt change) |
| Live GPT re-extract f0aa5a08 | **Pending** (requires VL deploy + OPENAI_API_KEY) |

---

## Regression Matrix (f0aa5a08)

| Product | Pre-fix qty | Expected post-fix | Status |
|---------|------------:|------------------:|--------|
| MEZZI PACCHERI MANCINI | 2 | **1** | Fix target |
| RICOTTA TREVIGIANA 1,5KG | 2 | **1** | Fix target |
| POMODORI PELATI | 1 | 1 | Must preserve |
| ROLO DE CABRA E VACA 1KG | 1 | 1 | Must preserve |
| ACQUA S.PELLEGRINO | 2 | 2 | Must preserve |

Offline binding at corrected qty=1: Mezzi unit_price €27.30, Ricotta €7.97 (totals unchanged).

Full matrix: `.tmp/family-a-implementation/implementation-result.json`

---

## Post-Deploy Validation (required)

1. Deploy `extract-invoice` to VL `bjhnlrgodcqoyzddbpbd`
2. Re-extract `f0aa5a08` — Mezzi/Ricotta qty=1
3. 10× stability on Bocconcino (≥9/10 qty=1 for failures)
4. Confirm Pomodori, Rolo, Acqua unchanged on same invoice
5. Run `capture-phase1.mts` with OPENAI_API_KEY to archive `gpt-raw-json.json`
6. Re-ingest VL invoice to heal persisted qty=2 rows
