# Gorgonzola vs Prosciutto — Differential Extraction Audit

**Validation Lab:** `bjhnlrgodcqoyzddbpbd`  
**Invoice:** `ab52796d-de1d-418d-86e7-230c8f056f09` (Emporio Italia, 19 May 2026)  
**Geometry fixture:** `17aa3591-ec98-4c21-89c9-5ae946bc97bb` (same screenshot)  
**Mode:** STRICT READ-ONLY · No code changes · No DB writes · No deployments  
**Generated:** 2026-06-24

## Goal

Why is Gorgonzola unstable but Prosciutto stable on the same Emporio invoice `ab52796d`?

---

## T1 — PDF Side-by-Side

| Field | Gorgonzola DOP dolce | Prosciutto cotto scelto |
|-------|----------------------|-------------------------|
| **Description** | Arrigoni Formaggi - Gorgonzola DOP Dolce Linea Castelregio* 1/8" ~1,5kg (Produto de Stock) | Rovagnati - Assaporami Prosciutto Cotto Scelto HC ~4,25KG |
| **Qty** | **1,35** kg | **4,30** kg |
| **Gross (Preço Unit)** | €12,90 | €10,30 |
| **Discount %** | 22,85 | 17,50 |
| **Net unit** | **€9,95** | **€8,50** |
| **Total (Preço Total)** | **€13,44** | **€36,54** |

Sources: `.tmp/gorgonzola-root-cause/stage-trace.json`, `.tmp/column-shift-audit/ground-truth.json`

---

## T2 — OCR Comparison

**Did OCR struggle on Gorgonzola? NO**

| Product | OCR-era API (pass-c-raw) | Qty vs PDF | Total vs PDF | Notes |
|---------|--------------------------|:----------:|:------------:|-------|
| **Gorgonzola** | 1.35 / €9.82 / €13.44 | ✓ | ✓ | Qtd column read correctly; net unit minor slip (€9.82 vs €9.95) |
| **Prosciutto** | 4.30 / €17.06 / €36.44 | ✓ | ✓ | Qty correct; unit **€17.06 ≈ Desc 17,50** (discount-column bleed) |

OCR-era extraction did **not** misread Gorgonzola qty. Instability originates downstream at Pass C structured extraction. Prosciutto had historical unit-column shift (discount bleed), resolved at v28+.

Source: `.tmp/persistence-audit/pass-c-raw/17aa3591-ec98-4c21-89c9-5ae946bc97bb-extract-invoice.json`

---

## T3 — All Runs v23 / v27 / v28 / v30 / v38

### Gorgonzola DOP dolce

| Run | Deploy | Qty | Unit Price | Total |
|-----|--------|-----|------------|-------|
| pass-c-raw | ocr-era | 1.35 | 9.82 | 13.44 |
| v23-run1 | v23 | 1.00 | 9.90 | 13.44 |
| v23-run2 | v23 | 2.00 | 10.62 | 13.44 |
| v27-stab-1 | v27 | 2.60 | 10.22 | 13.44 |
| v27-stab-2 | v27 | 2.00 | 13.22 | 13.44 |
| v27-stab-3 | v27 | 2.00 | 9.45 | 13.44 |
| v27-stab-4 | v27 | 2.00 | 12.20 | 13.44 |
| v27-stab-5 | v27 | 2.00 | 16.55 | **33.14** |
| v28-single | v28 | **1.05** | **10.88** | 13.44 |
| v28-cluster-2 | v28 | 2.00 | 12.87 | **25.73** |
| v30-run1 | v30 | 1.05 | 9.88 | 13.44 |
| v30-run2 | v30 | 2.00 | 9.35 | **18.68** |
| v30-run6 | v30 | 2.00 | 13.43 | **26.85** |
| v30-run8 | v30 | 2.00 | 22.85 | **45.70** |
| ab52796d-persisted | v38-db | 1.05 | 10.88 | 13.44 |
| **v38-reread** | **v38** | **2.00** | **9.35** | **18.72** |

*Full 10-run v30 matrix: `.tmp/emporio-deli-stability-audit/results.json`*

### Prosciutto cotto scelto

| Run | Deploy | Qty | Unit Price | Total |
|-----|--------|-----|------------|-------|
| pass-c-raw | ocr-era | 4.30 | 17.06 | 36.54 |
| v23-run1 | v23 | 4.30 | 10.56 | 36.44 |
| v23-run2 | v23 | 4.30 | 10.70 | **46.01** |
| v23-run3 | v23 | 4.30 | 10.22 | **43.95** |
| v28-single | v28 | 4.30 | 8.50 | 36.54 |
| v30-run1–10 | v30 | 4.30 | 8.50 | 36.54 |
| **v38-reread** | **v38** | **4.30** | **8.50** | **36.54** |

Prosciutto locked at PDF-visible values from v28 onward. Gorgonzola spans **€13.44–€45.70** across artifacts.

---

## T4 — Field Stability

| Field | Gorgonzola (v30 10-run) | Prosciutto (v30 10-run) |
|-------|-------------------------|-------------------------|
| **qty** | 2 values (1.05, 2.00) — **unstable** | 1 value (4.30) — **stable** |
| **unit_price** | 9 unique (8.43–22.85) — **unstable** | 1 value (8.50) — **stable** |
| **total** | 5 unique (13.44–45.70) — **unstable** | 1 value (36.54) — **stable** |

Across all artifacts (v23–v38): Gorgonzola totals range **€13.44–€45.70**; Prosciutto v28+ fixed at **€36.54** (v23 had €36.44–€46.01).

---

## T5 — Column Ambiguity

| Attribute | Gorgonzola | Prosciutto |
|-----------|------------|------------|
| Wrapped description text | **YES** — long Castel* line with 1/8 notation | NO — single-line meat description |
| Line breaks in row | Possible in dense table crop | NO |
| Shifted columns | NO — values readable; failure is semantic not pixel | Historical v23: unit read Desc 17,50 |
| Qty ambiguity | **YES** — 1,35 vs description `1/8` / `~1,5kg` → runs emit qty **2** | NO — 4,30 unambiguous |
| Discount format | 22,85 without % | 17,50 without % (same Emporio format) |

Gorgonzola instability is driven more by **description-token confusion** than column pixel shift. Prosciutto's historical issue was **discount-column omission** (now closed).

---

## T6 — Token Complexity

**Gorgonzola objectively harder? YES**

| Metric | Gorgonzola | Prosciutto |
|--------|------------|------------|
| Description length | ~95 chars + pack metadata | ~55 chars |
| Numeric tokens in name | `1/8*`, `~1,5kg`, `1,8-1,9kg` variants | `~4,25KG` only |
| Qty digit pattern | 1,35 — documented 3↔0/5 misread | 4,30 — integer+fraction, stable |
| Hallucinated variants | Castelfrigo, Castelfiorito, Castelgrotti, Casaleggio… | Minor HC range text only |
| v30 name stability | Different Castel* brand each run | HC range wording only |

---

## T7 — First Divergence (PDF → OCR → Structured → Binding → Persistence)

| Stage | Gorgonzola | Prosciutto | First split? |
|-------|------------|------------|:------------:|
| **PDF** | 1.35 / €9.95 / €13.44 | 4.30 / €8.50 / €36.54 | — |
| **OCR** | 1.35 / €9.82 / €13.44 ✓ qty | 4.30 / €17.06 / €36.54 (unit bleed) | Partial (Prosciutto unit only) |
| **Pass C** | **1.05–2.00 / €8.43–€22.85** | **4.30 / €8.50 / €36.54** (v28+) | **YES** |
| **Binding** | pass-through | pass-through | — |
| **Persistence** | 2.00 / €9.35 / €18.72 (v38 re-read) | 4.30 / €8.50 / €36.54 | Reflects Pass C |

**First REAL difference between unstable and stable rows:** **Pass C structured extraction** — Gorgonzola diverges every generation; Prosciutto converged at v28 and holds through v38 re-read.

---

## T8 — Root Cause (exactly one)

| Code | Mechanism | Applies to differential? |
|------|-----------|:--------------------------:|
| A | OCR/vision input failure | NO — Gorgonzola OCR qty correct |
| B | discount_pct omission only | NO — Prosciutto v23 pattern, fixed v28 |
| **C** | **LLM hallucinated both qty and unit_price** | **YES** |
| D | Post-processing/binding corruption | NO — lossless pass-through proven |
| E | Persistence/cache mutation | NO — ruled out by reread forensics |

**Answer: C** — GPT Pass C dual-field hallucination on Gorgonzola (qty 1,35→1,05/2; invented unit_price). Prosciutto's historical instability was pattern B (discount omission), closed by v28 prompt hardening.

---

## T9 — Would Fixing Gorgonzola Fix Others?

**NO**

- Prosciutto already stable v28–v38 (different sub-pattern, already fixed).
- Mortadella/Bresaola share Emporio Pass C family but have adjacent-row bleed and intermittent discount failures — Gorgonzola-specific qty-digit and `1/8` description fix would not close those.
- Shared Emporio prompt block helps partially; Gorgonzola-only fix is insufficient for family-wide closure.

---

## Required Table

| Stage | Gorgonzola | Prosciutto | Divergence? |
|-------|------------|------------|:-----------:|
| PDF | 1.35 / €9.95 net / €13.44 | 4.30 / €8.50 net / €36.54 | NO |
| OCR (pass-c-raw) | 1.35 / €9.82 / €13.44 | 4.30 / €17.06 / €36.54 | YES (Prosciutto unit bleed only) |
| Pass C (v28+) | 1.05–2.00 / €8.43–€22.85 / €13.44–€45.70 | 4.30 / €8.50 / €36.54 | **YES** |
| Binding | pass-through | pass-through | NO |
| Persistence (ab52796d) | 2.00 / €9.35 / €18.72 (v38 re-read) | 4.30 / €8.50 / €36.54 | YES |

---

## Final Answers

### 1. Why Gorgonzola unstable?

Pass C GPT non-determinism on fractional qty (**1,35→1,05** or **2**) and invented unit_price (**€8.43–€22.85**), amplified by description tokens **`1/8`**, **`~1,5kg`**, and Castel* brand hallucination. Totals sometimes copied correctly (**€13.44**) but often synthesized (**€18.72–€45.70**). v38 live re-read regressed from 1.05/10.88/13.44 to **2/9.35/18.72** — fresh hallucination with internal math consistency but wrong vs PDF.

Evidence: v30 60% correct total; 5 distinct totals on 10 runs; `.tmp/reread-pipeline-forensics-audit/`

### 2. Why Prosciutto stable?

Qty **4,30** is unambiguous. v28 **EMPORIO discount-column hardening** populates gross + discount + net consistently. v30 **10/10** identical at **4.3/8.5/36.54**; v38 re-read unchanged. Historical v23 instability (discount_pct null → gross unit, inflated totals) was a **different mechanism**, now closed.

Evidence: `.tmp/emporio-discount-column-audit/validation-report.md`, `.tmp/emporio-deli-stability-audit/`

### 3. First differing stage?

**Pass C structured extraction** — the first stage where Gorgonzola is wrong and Prosciutto is correct on the same invoice (v28+). OCR and binding are not the split point for the current differential.

### 4. Unique edge case or deli-family mode?

**Unique Gorgonzola edge case within shared Emporio deli-family Pass C variance cluster** — same pipeline, same crop, same discount-column format; not a separate extraction mode. Gorgonzola is the worst outlier due to fractional qty + cheese-wheel description tokens.

### 5. Fix target A/B/C?

**C) Prompt + validation** — Pass C fractional-digit fidelity rule + mandatory Emporio discount columns + deterministic math guard when `qty×unit ≠ line_total_net`. Prompt-only proven insufficient (correct Gorgonzola example at L107–108 yet v28 failed).

Source: `.tmp/gorgonzola-fix-design/REPORT.md`

---

## Artifacts

| File | Contents |
|------|----------|
| `results.json` | Machine-readable tasks 1–9, stage table, final verdict |
| `REPORT.md` | This report |

**Evidence only. No replay extract-invoice invoked.** Sufficient artifacts existed in `.tmp/emporio-deli-stability-audit/`, `.tmp/gorgonzola-reread-validation-audit/`, `.tmp/reread-pipeline-forensics-audit/`, `.tmp/gorgonzola-structured-extraction-failure-audit/`, and stability runs.
