# Gorgonzola Re-Read Validation Audit

**Validation Lab:** `bjhnlrgodcqoyzddbpbd` · **Invoice:** `ab52796d-de1d-418d-86e7-230c8f056f09` · **Original item:** `bece238e-fd6d-493c-8555-6921b164f97c` · **Current item:** `091d5bc2-b041-4a65-b652-d9be15b5fd3f` · **Read-only** · 2026-06-24

## Executive question

Did Re-read produce **CORRECT** extraction or merely **MATHEMATICALLY CONSISTENT** values?

## T1 — PDF ground truth (Emporio Gorgonzola line)

| Field | Value |
|-------|-------|
| description | Arrigoni Formaggi - Gorgonzola DOP Dolce Linea Castelregio* 1/8" ~1,5kg (Produto de Stock) |
| qty | 1.35 kg |
| gross unit | €12.9 |
| discount | 22.85% |
| net unit (implied) | €9.95 |
| line total | €13.44 |
| source | .tmp/gorgonzola-root-cause/stage-trace.json visibleInvoice |

## T2 — Current persisted `invoice_items` (VL DB)

| Field | Value |
|-------|-------|
| qty | 2 |
| unit_price | 9.35 |
| total | 18.72 |
| gross_unit_price | null (not stored) |
| discount_pct | null (not stored) |
| structure | null |
| usable | null |
| ingredients.current_price | 9.35 |
| created_at | 2026-06-24T10:45:37.333848+00:00 |
| updated_at | 2026-06-24T10:45:37.333848+00:00 |

## T3 — Side-by-side

| Field | PDF | Current Persisted | Match? |
|-------|-----|-------------------|--------|
| description | Arrigoni Formaggi - Gorgonzola DOP Dolce Linea Castelregio* 1/8" ~1,5kg (Produto de Stock) | Arrigoni Formaggi - Gorgonzola DOP Dolce Linea Castelfrigo 1/8 - 1,5kg | **NO** |
| quantity | 1.35 | 2 | **NO** |
| gross_unit_price | 12.9 | — | **NO** |
| discount_pct | 22.85 | — | **NO** |
| net_unit_price | 9.95 | 9.35 | **NO** |
| line_total | 13.44 | 18.72 | **NO** |

## T4 — Math: qty × unit_price vs total

| Expression | 2 × 9.35 = 18.7 |
| Persisted total | 18.72 |
| Variance | €0.02 (0.11%) |
| Reconciles (±€0.02)? | **YES** |
| Review flag | none |

## T5 — Semantic classification

**B)** Merely mathematically consistent

## T6 — Re-read extraction trace

Original item `bece238e-fd6d-493c-8555-6921b164f97c` still in DB: **NO — replaced on re-read**
Current Gorgonzola item id: `091d5bc2-b041-4a65-b652-d9be15b5fd3f`
Re-read modification detected (DB): **YES**
Matches user-reported trio (2.00 / 9.35 / 18.72): **YES**
| updated_at equals created_at — no post-insert modification detected |

Artifact traces containing Gorgonzola:

| Source | qty | unit_price | total | reconciles? |
|--------|-----|------------|-------|-------------|
| .tmp/final-validation-lab-rerun-v28/extracts/17aa3591-ec98-4c21-89c9-5ae946bc97bb.json | 1.05 | 10.88 | 13.44 | NO | ← original trio
| .tmp/final-stability-audit/extracts/17aa3591-ec98-4c21-89c9-5ae946bc97bb-run2.json | 2 | 9.35 | 18.68 | YES |
| .tmp/persistence-audit/pass-c-raw/17aa3591-ec98-4c21-89c9-5ae946bc97bb-extract-invoice.json | 1.35 | 9.82 | 13.44 | NO |
| .tmp/mathematical-reconciliation-implementation/results.json | undefined | 10.88 | 13.44 | NO |

**First artifact with current trio (2/9.35/18.72):** not found in workspace artifacts

## T7 — History: Original vs Current

| Field | Original (pre re-read) | Current (VL DB) | PDF |
|-------|------------------------|-----------------|-----|
| qty | 1.05 | 2 | 1.35 |
| unit_price | 10.88 | 9.35 | 9.95 (net) |
| total | 13.44 | 18.72 | 13.44 |
| qty×price=total | 11.424000000000001≠13.44 | 18.7=18.72? | 13.43≈13.44 |
| Distance to PDF (L1) | 1.23 | 6.53 | 0 |
| updated_at | 2026-06-23T10:41:31.22202+00:00 | 2026-06-24T10:45:37.333848+00:00 | — |

## T8 — Explicit answers

1. **Correct per PDF?** **NO**
2. **Merely mathematically consistent?** **YES**
3. **Closer to PDF — original or current?** **original** (L1 distances: original=1.23, current=6.53)
4. **Would human approve current row?** NO — arithmetic reconciles but qty/total diverge from PDF (€5.28 line total error)
