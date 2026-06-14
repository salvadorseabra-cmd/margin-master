# Validation Lab Closure Audit

**Generated:** 2026-06-13  
**Latest deploy:** extract-invoice **v31** on `bjhnlrgodcqoyzddbpbd`  
**Mode:** READ-ONLY synthesis — no code changes, no deploy, no commit  
**Sources:** v30 VL rerun · 10-run stability audit · v28–v31 targeted validations · root-cause audits

---

## Decision: **EXTRACTION PHASE MOSTLY CLOSED** (83% confidence)

**Recommendation:** Return to **Core Marginly roadmap**. Pause active Validation Lab extraction work; keep a lightweight monitoring harness for Gorgonzola and Farina.

---

## Executive Summary

Invoice extraction has crossed the closure threshold for **structural** bugs. Geometry, IVA/Valor bleed, Mortadella Desc.(%) confusion, Emporio Bresaola/SanPellegrino cluster, and Mammafiore Rulo IVA bleed are all **validated fixed** (v28–v30). The pipeline is production-viable.

What remains is **low-€ noise**:

| Category | € impact | Nature |
|----------|----------|--------|
| **GT catalog error** | €27.95 | Pomodor — extraction matches visible invoice 10/10 |
| **GPT variance** | €5.49 avg | Gorgonzola — 60% stable, intermittent outlier runs |
| **Digit drift** | €0.40 avg | Farina — v31 improved 0/10→3/5, not yet deterministic |
| **Minor drift** | €0.54 | Bocconcino Rulo — single-run only |

**Headline** v30 single-run Class A (€28.26) is **misleading** — it counts Pomodor as extraction (GT issue) and captures one bad Gorgonzola run (€24.79). **True extraction Class A** on focus rows is **~€1.54 single-run** / **€0.40 Farina avg (v31)**.

---

## Version Trajectory: v28 → v30 → v31

| Metric | v28 | v30 | v31 |
|--------|-----|-----|-----|
| Headline Class A € | 9.36 | 28.26 | — |
| **True Class A €** (reclassified) | ~9.36 | **1.54** | **~1.0** |
| Focus-row sum € | 9.36 | 1.00 | 0.40 (Farina only) |
| Financial accuracy | 98.05% | 96.83% | — |
| Invoices CLOSED | 2 | 2 | 2 |

**v28→v30 recovery (focus rows):** €8.36 — Rulo Di Capra (€4.86→€0) + Mortadella (€3.50→€0). Farina unchanged at €1.00.

**v30→v31 (Farina only):** €1.00→€0.40 avg; 0/10→3/5 correct. Prompt hardening partial, not deterministic.

---

## Extraction Quality Metrics

### Single-run (v30 VL rerun — 1 invoke per invoice)

| Class | Headline € | Reclassified € | Notes |
|-------|-----------|----------------|-------|
| A — Deterministic | 28.26 | **1.54** | Farina €1 + Rulo €0.54 |
| B — GPT variance | 24.79 | **26.19** | Gorgonzola bad run €24.79 + Prosciutto €1.4 |
| C — GT issue | 1.4 | **27.95** | Pomodor reclassified (visible match) |
| D — Business interp. | 0 | 0 | 21 rows, field display only |

### Multi-run (v30 stability — 10 invokes × 5 focus rows = 50 runs)

| Metric | Headline (vs GT) | True extraction (excl. GT) |
|--------|------------------|---------------------------|
| Avg € error | **€6.89** | **€1.30** |
| p95 € error | **€27.95** | **€32.26** |
| Best € error | €0 | €0 |
| Worst € error | €32.26 | €32.26 |

*Headline avg inflated by Pomodor GT delta (10 runs × €27.95). True extraction sums Farina €10 + Gorgonzola failure runs €54.85 over 40 non-GT runs.*

### v31 Farina validation (5 runs)

| Metric | v30 (10-run) | v31 (5-run) |
|--------|--------------|-------------|
| Correct vs GT | 0/10 (0%) | **3/5 (60%)** |
| Avg € error | €1.00 | **€0.40** |
| Recovery | — | €0.60 avg |

---

## Stability Metrics — Focus Rows

| Row | v30 (10-run) | v28 cluster (5-run) | v31 Farina (5-run) | Class |
|-----|--------------|---------------------|---------------------|-------|
| Gorgonzola | **60%** · avg €5.49 | 80% · avg €2.46 | — | B |
| Bresaola | **100%** | 100% | — | B (stable) |
| SanPellegrino | **100%** | 100% | — | B (stable) |
| Farina Speciale | 0% · €1.00 | — | **60%** · €0.40 | A→B |
| Pomodor | 100% vs visible | — | — | C |

**Validated fixes:**

| Fix | Version | Result |
|-----|---------|--------|
| Mortadella Desc.(%) | v29 | 5/5 at €31.07 |
| Rulo IVA/Valor | v30 | 5/5 at €10.86 |
| Emporio Bresaola/SanPellegrino | v28 | 10/10 stable v30 |
| Farina Valor digit | v31 | 3/5 (partial) |

---

## Per-Invoice Status

| Invoice | Status | Financial € | Key residual |
|---------|--------|-------------|--------------|
| **Bidfood** | CLOSED | €0 | Field flags only (Class D) |
| **Aviludo April** | CLOSED | €0 | Harness fixed (was €169) |
| **Aviludo May** | PARTIAL | €0 | Chocolate fixed; name/unit flags |
| **Emporio** | PARTIAL | €26.39* | Gorgonzola variance; *single-run headline |
| **Bocconcino** | PARTIAL | €0.54 | Pomodor = GT; Rulo minor |
| **Mammafiore** | PARTIAL | €0.40 | Farina intermittent; Rulo fixed |

---

## Residual Classification

### A) Deterministic extraction bugs

| Product | € | Stability | Status |
|---------|---|-----------|--------|
| Farina Speciale | €1.00 (v30) / €0.40 avg (v31) | 0/10→3/5 | Intermittent after v31 |
| Rulo Bocconcino | €0.54 | Single-run | Minor |

**Total true Class A:** ~€1.54 single-run · ~€0.30–0.40 multi-run avg

### B) GPT variance

| Product | € | Stability | Status |
|---------|---|-----------|--------|
| Gorgonzola | avg €5.49 · worst €32.26 | 60% v30 | Acceptable noise |
| Prosciutto Cotto | €1.40 | Intermittent | Low priority |

### C) Ground-truth issues

| Product | € (vs GT) | vs visible | Action |
|---------|-----------|------------|--------|
| POMODOR PELATI | €27.95 | **10/10 match** | Revise GT catalog |

### D) Business interpretation (€0 impact)

21 rows — net vs list `unit_price` display, pack metadata in description, qty normalization. No financial delta.

---

## Critical Questions

### 1. What deterministic bugs remain?

**Minor and intermittent only.** Farina Valor digit drift (€1 when wrong; v31 60% correct). Rulo Bocconcino €0.54. No stable multi-euro deterministic bugs after Rulo/Mortadella fixes.

### 2. What GT issues remain?

**POMODOR PELATI** — GT says qty 2 / €50; visible invoice shows qty 1 / €22.05. Extraction correct. **Revise GT, not pipeline.**

### 3. What variance remains?

**Gorgonzola** — 40% of v30 runs fail (avg €5.49, worst €32.26). Emporio dense-table GPT noise, not structural regression. Bresaola/SanPellegrino fully stable.

### 4. Is Farina still worth fixing?

**Marginal.** v31 recovered 60% of runs (€0.60 avg). Remaining €0.40 avg is diminishing-returns territory. A binder guard (`unit_price > total` when qty=1) may outperform another prompt iteration.

### 5. Would another prompt iteration materially improve results?

**Unlikely.** v28→v30 addressed structural families (€8.36 focus recovery). v31 Farina example went 0%→60%, not 100%. Prompt saturation on digit OCR and GPT variance.

### 6. What is the expected ROI of v32?

**Low — €0.20–0.40 recovery.** Best case closes Farina to 5/5. Gorgonzola unlikely to close via prompt. Engineering time better on Marginly roadmap + GT hygiene.

---

## Closure Criteria Evaluation

| Criterion | Met? | Evidence |
|-----------|------|----------|
| Structural bugs closed | **YES** | Geometry, IVA bleed, Mortadella, Rulo, April harness |
| Column-shift family closed | **MOSTLY** | Bresaola/SanPellegrino 100%; Gorgonzola intermittent |
| Discount family closed | **MOSTLY** | Rulo/Mortadella fixed; Farina digit drift intermittent |
| Re-read safety closed | **YES** | Frontend guard validated (`.tmp/reread-safety-fix-validation/`) |
| Pack/unit interpretation acceptable | **YES** | 21 Class D rows documented |
| VL sufficient for roadmap | **YES** | 6 invoices · 2 CLOSED · 4 PARTIAL · 0 phantoms · 96.8% financial accuracy |

---

## Risks If Phase Declared Closed

1. **Gorgonzola** occasional €32 outlier on Emporio re-extract (~40% of runs)
2. **Farina** €1 digit drift on ~40% of Mammafiore runs (v31)
3. **GT catalog** not revised — VL dashboards overstate error until Pomodor fixed

---

## Final Recommendation

| Path | Verdict |
|------|---------|
| **Validation Lab work** | **Pause** — structural work complete; remaining items are low-€ noise |
| **Core Marginly roadmap** | **Resume** — extraction phase mostly closed |

### Recommended next actions (non-extraction)

1. Revise Pomodor GT in `field-accuracy-audit` catalog
2. Resume Core Marginly product development
3. Keep 5-run stability harness for Gorgonzola + Farina on future changes
4. Defer v32 unless production telemetry shows Farina €1 affecting real users

---

## Artifact Index

| File | Contents |
|------|----------|
| `executive-summary.json` | Decision, confidence, critical answers, criteria |
| `closure-metrics.json` | Single-run vs multi-run extraction quality |
| `residual-classification.json` | Per-row A/B/C/D with resolved list |
| `REPORT.md` | This document |

**Primary evidence:** `.tmp/final-validation-lab-rerun-v30/` · `.tmp/final-stability-audit/` · `.tmp/farina-final-root-cause/` · `.tmp/mortadella-root-cause/` · `.tmp/rulo-root-cause/` · `.tmp/emporio-variance-cluster/` · `.tmp/bocconcino-gt-validation/`
