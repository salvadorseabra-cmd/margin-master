# Emporio Deli Family — Extraction Stability Audit

**Validation Lab:** `bjhnlrgodcqoyzddbpbd`  
**Invoices:** `17aa3591-ec98-4c21-89c9-5ae946bc97bb` (geometry fixture) · `ab52796d-de1d-418d-86e7-230c8f056f09` (VL persisted)  
**Mode:** STRICT READ-ONLY · No code changes · No DB writes · No deployments  
**Generated:** 2026-06-24

## Goal

Is Gorgonzola an isolated unstable extraction, or is the entire Emporio deli family unstable?

**Products:** Gorgonzola, Prosciutto, Mortadella, Bresaola

---

## Task 1 — Extraction Artifacts Located

| Path | Kind | Deploy | Scope |
|------|------|--------|-------|
| `.tmp/final-stability-audit/` | 10-run stability matrix + per-run extracts | v30 | All 4 products on `17aa3591` |
| `.tmp/final-validation-lab-rerun-v28/` | Single v28 extract + metrics | v28 | All 4 products |
| `.tmp/emporio-variance-cluster/v28-validation.json` | 5-run cluster probe | v28 | Gorgonzola, Bresaola |
| `.tmp/gorgonzola-root-cause/v27-stability.json` | 5-run Gorgonzola probe | v27 | Gorgonzola |
| `.tmp/bresaola-root-cause/stability.json` | 5-run Bresaola probe | v27 | Bresaola |
| `.tmp/mortadella-root-cause/stability.json` | 3-run Mortadella probe | v28 | Mortadella |
| `.tmp/prosciutto-v23-audit/` | 3-run + stage trace | v23 | Prosciutto |
| `.tmp/persistence-audit/pass-c-raw/` | Pass C / hybrid OCR-era | pre-v28 | Gorgonzola |
| `.tmp/emporio-discount-column-audit/` | Discount-column forensics | v24+ | Prosciutto, Mortadella |
| `.tmp/gorgonzola-reread-validation-audit/` | v38 live re-read vs PDF | v38 | Gorgonzola on `ab52796d` |
| `.tmp/reread-pipeline-forensics-audit/` | v38 re-read pipeline trace | v38 | All lines on `ab52796d` |
| `.tmp/gorgonzola-*` (8 audit dirs) | Mathematical trace, unit-price origin, persistence, structured failure | various | Gorgonzola |
| `.tmp/emporio-deli-family-audit/` | Post-persist math trace (not extraction stability) | DB state | All 4 on `ab52796d` |

**v38 extracts:** No standalone v38 replay artifact file. v38 evidence comes from live re-read forensics (`reread-pipeline-forensics-audit`, `gorgonzola-reread-validation-audit`) — edge function version **38**, invoked 2026-06-24.

---

## Task 2 — Per Product: Run | Qty | Unit Price | Total

### Gorgonzola DOP dolce

**v30 stability (10 runs)** — `.tmp/final-stability-audit/extracts/17aa3591-*-all-runs.json`

| Run | Qty | Unit Price | Total |
|-----|-----|------------|-------|
| 1 | 1.05 | 9.88 | 13.44 |
| 2 | 2.00 | 9.35 | 18.68 |
| 3 | 2.00 | 10.22 | 13.44 |
| 4 | 2.00 | 8.43 | 13.44 |
| 5 | 2.00 | 10.20 | 13.44 |
| 6 | 2.00 | 13.43 | 26.85 |
| 7 | 2.00 | 10.22 | 13.44 |
| 8 | 2.00 | 22.85 | 45.70 |
| 9 | 2.00 | 13.22 | 13.44 |
| 10 | 2.00 | 8.69 | 17.38 |

**Other key versions**

| Source | Deploy | Qty | Unit Price | Total |
|--------|--------|-----|------------|-------|
| v28 single extract | v28 | 1.05 | 10.88 | 13.44 |
| pass-c-raw OCR | ocr-era | 1.35 | 9.82 | 13.44 |
| ab52796d persisted (pre-reread) | v38-db | 1.05 | 10.88 | 13.44 |
| **v38 live re-read** | **v38** | **2.00** | **9.35** | **18.72** |
| v27 stability run 5 (bad) | v27 | 2.00 | 16.55 | 33.14 |

### Prosciutto cotto scelto

**v30 stability (10 runs)** — all identical

| Run | Qty | Unit Price | Total |
|-----|-----|------------|-------|
| 1–10 | 4.30 | 8.50 | 36.54 |

**Other key versions**

| Source | Deploy | Qty | Unit Price | Total |
|--------|--------|-----|------------|-------|
| v28 single | v28 | 4.30 | 8.50 | 36.54 |
| v38 re-read | v38 | 4.30 | 8.50 | 36.54 |
| v23 run 1 | v23 | 4.30 | 10.56 | 36.44 |
| v23 run 2 (bad) | v23 | 4.30 | 10.70 | 46.01 |
| v23 run 3 (bad) | v23 | 4.30 | 10.22 | 43.95 |

### Mortadella IGP massima con pistacchio

**v30 stability (10 runs)**

| Run | Qty | Unit Price | Total |
|-----|-----|------------|-------|
| 1–6, 8–10 | 3.11 | 9.99 | 31.07 |
| 7 | 3.11 | 7.94 | 24.70 |

**Other key versions**

| Source | Deploy | Qty | Unit Price | Total |
|--------|--------|-----|------------|-------|
| v28 single (bad) | v28 | 3.11 | 8.88 | 27.57 |
| v28 stability 1–3 | v28 | 3.11 | 8.56–8.88 | 26.65–27.62 |
| v38 re-read | v38 | 3.11 | 9.99 | 31.07 |

### Bresaola punta d'anca oro

**v30 stability (10 runs)** — all identical

| Run | Qty | Unit Price | Total |
|-----|-----|------------|-------|
| 1–10 | 1.83 | 27.04 | 49.48 |

**Other key versions**

| Source | Deploy | Qty | Unit Price | Total |
|--------|--------|-----|------------|-------|
| v27 run 3 (bad) | v27 | 2.30 | 19.49 | 44.83 |
| v27 run 4 (bad) | v27 | 3.30 | 12.00 | 39.48 |
| v28 cluster 5/5 | v28 | 1.83 | 27.04 | 49.48 |
| v38 re-read | v38 | 1.83 | 27.04 | 49.48 |

---

## Task 3 — Variance per Field (v30 10-run)

| Product | Field | Unique Values | Min | Max | Range | Variance % |
|---------|-------|---------------|-----|-----|-------|------------|
| **Gorgonzola** | qty | 2 (1.05, 2.00) | 1.05 | 2.00 | 0.95 | 63.33 |
| | unit_price | 9 | 8.43 | 22.85 | 14.42 | 126.15 |
| | total | 5 | 13.44 | 45.70 | 32.26 | **170.46** |
| **Prosciutto** | qty | 1 | 4.30 | 4.30 | 0 | 0 |
| | unit_price | 1 | 8.50 | 8.50 | 0 | 0 |
| | total | 1 | 36.54 | 36.54 | 0 | 0 |
| **Mortadella** | qty | 1 | 3.11 | 3.11 | 0 | 0 |
| | unit_price | 2 | 7.94 | 9.99 | 2.05 | 22.99 |
| | total | 2 | 24.70 | 31.07 | 6.37 | 22.99 |
| **Bresaola** | qty | 1 | 1.83 | 1.83 | 0 | 0 |
| | unit_price | 1 | 27.04 | 27.04 | 0 | 0 |
| | total | 1 | 49.48 | 49.48 | 0 | 0 |

Across **all artifacts** (v23–v38), Gorgonzola totals span **€13.44–€45.70**; Bresaola **€39.48–€49.48**; Mortadella **€24.70–€31.07**; Prosciutto **€36.44–€46.01**.

---

## Task 4 — Compare vs PDF Ground Truth

PDF values from prior audits (`gorgonzola-root-cause/stage-trace.json`, `column-shift-audit/ground-truth.json`, `bresaola-root-cause/stage-trace.json`, `mortadella-root-cause/stage-trace.json`). Net unit prices after discount.

| Field | Gorgonzola PDF | Min | Max | Prosciutto PDF | Min | Max |
|-------|----------------|-----|-----|----------------|-----|-----|
| qty | **1.35** | 1.05 | 2.60 | **4.30** | 4.30 | 4.30 |
| unit_price | **9.95** | 8.43 | 22.85 | **8.50** | 8.50 | 10.76 |
| total | **13.44** | 13.44 | 45.70 | **36.54** | 36.44 | 46.01 |

| Field | Mortadella PDF | Min | Max | Bresaola PDF | Min | Max |
|-------|----------------|-----|-----|--------------|-----|-----|
| qty | **3.11** | 3.11 | 3.11 | **1.83** | 1.83 | 3.30 |
| unit_price | **9.99** | 7.94 | 10.88 | **27.04** | 12.00 | 27.04 |
| total | **31.07** | 24.70 | 31.07 | **49.48** | 39.48 | 49.48 |

**Notes**

- Gorgonzola PDF net **9.95** (gross 12.90 × (1−22.85%)); user-specified anchor **1.35 / 9.95 / 13.44** confirmed.
- Prosciutto PDF net **8.50** (gross 10.30 × (1−17.50%)); VL catalog GT uses net **8.17** / total **35.14** (€1.40 below visible).
- Mortadella PDF gross **11.10**, Desc **10.00%**, net **~9.99**; VL GT net **10.10**.
- Bresaola PDF Qtd **1.83**; VL GT qty **2.8** (catalog normalization) — financial anchor is total **49.48**.

---

## Task 5 — Stability Score A/B/C/D per Product

| Code | Meaning |
|------|---------|
| A | Deterministic extraction bug — consistently wrong |
| B | GPT variance — intermittent, multiple outcomes |
| C | GT/catalog issue — extraction matches visible but not VL GT |
| D | Stable — ≥90% correct vs PDF on latest 10-run probe |

| Product | v30 (10-run) | All artifacts (v23–v38) | Rationale |
|---------|:------------:|:-----------------------:|-----------|
| **Gorgonzola** | **B** | **B** | 60% total correct; 5 distinct totals; qty flips 1.05↔2; v38 reread regressed |
| **Prosciutto** | **D** | **B** | v30 10/10 stable at PDF visible; v23 had €7–11 inflation; VL GT gap €1.40 → C sub-note |
| **Mortadella** | **D** | **B** | v30 9/10 at 31.07; v28 0/3 correct (discount-line failure) |
| **Bresaola** | **D** | **B** | v30 10/10 at 49.48; v27 2/5 correct (40% stability) |

---

## Task 6 — Common Pattern

| Attribute | Evidence |
|-----------|----------|
| **Weighted** | YES — all four are fractional-kg deli rows (1.35, 4.30, 3.11, 1.83 kg) |
| **Discounted** | YES — Emporio Desc.(%) column without % symbol (22.85, 17.50, 10.00, 20.00) |
| **Deli** | YES — cheese/cured-meat family on same Emporio dense table |
| **Gross/net** | YES — Preço Unit = gross; net = gross × (1 − Desc%); binder needs `discount_pct` |

**Shared failure family:** Emporio variance cluster A (`.tmp/emporio-variance-cluster/REPORT.md`) — Pass C GPT non-determinism on the same 8-column crop. Sub-patterns:

1. **Qty confusion** — Gorgonzola 1,35→1,05 or description 1/8→qty 2
2. **Discount omission** — Prosciutto v23, Mortadella v28 (`discount_pct` null)
3. **VALOR not copied** — total synthesized as qty×unit instead of Preço Total
4. **Adjacent-row bleed** — Bresaola 39.48 ≈ Ventricina 39.49

---

## Task 7 — Instability Outside Gorgonzola?

### **YES**

| Product | Historical instability | v30 stability |
|---------|------------------------|---------------|
| Gorgonzola | v27 4/5, v30 6/10 correct total | Worst — 5 distinct totals |
| Prosciutto | v23 1/4 runs matched visible | 10/10 stable |
| Mortadella | v28 0/3 correct total | 9/10 stable |
| Bresaola | v27 2/5 correct total | 10/10 stable |

Gorgonzola is the **most unstable** member but **not isolated** — same Pass C stage, same invoice crop, same discount-column mechanics. v28 prompt hardening closed Prosciutto discount extraction; Mortadella/Bresaola improved at v30; Gorgonzola remains open.

---

## Final Verdict

### Classification: **B**

**Question:** Should VL continue to Prosciutto or address extraction stability first?

**Answer:** **Address extraction stability first** — primarily Gorgonzola.

| Evidence | Detail |
|----------|--------|
| Gorgonzola v30 | 60% correct vs PDF; totals €13.44–€45.70; qty 1.05 vs PDF 1.35 |
| Gorgonzola v38 re-read | Fresh hallucination: **2 / 9.35 / 18.72** (was 1.05/10.88/13.44) |
| Prosciutto | v30 + v38 stable at PDF visible 4.3/8.5/36.54 — **ready after Gorgonzola fix** |
| Mortadella | v30 9/10; v38 re-read correct — residual risk low |
| Bresaola | v30 10/10; v38 re-read correct — closed at current deploy |

Prosciutto extraction against the **visible PDF** is stable enough to continue VL work **once Gorgonzola stability is hardened**. The v38 live re-read proves re-extraction can still produce fresh wrong values on the same invoice — blocking confident family-wide VL closure.

### Summary table

| Product | PDF (qty / net / total) | v30 stable? | Blocker? |
|---------|-------------------------|:-----------:|:--------:|
| Gorgonzola | 1.35 / 9.95 / 13.44 | NO | **YES** |
| Prosciutto | 4.30 / 8.50 / 36.54 | YES | No (visible) |
| Mortadella | 3.11 / 9.99 / 31.07 | YES | Low |
| Bresaola | 1.83 / 27.04 / 49.48 | YES | No |

---

## Artifacts Produced

| File | Contents |
|------|----------|
| `results.json` | Machine-readable per-product runs, variance, scores, verdict |
| `REPORT.md` | This report |

**Evidence only. No replay extract-invoice invoked during this audit** — sufficient artifacts existed in `.tmp/`.
