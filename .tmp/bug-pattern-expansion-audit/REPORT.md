# Bug Pattern Expansion Audit — READ-ONLY

**Generated:** 2026-06-22  
**Validation Lab:** `bjhnlrgodcqoyzddbpbd`  
**Mode:** STRICT READ-ONLY — no code changes, no DB writes, no fixes  
**Method:** Production derivation replay + cross-artifact corroboration

---

## Executive Summary

Pattern expansion across all 51 VL `invoice_items` (7 invoices) finds **no new user-visible bug families** beyond the four confirmed mechanisms. Each mechanism is **isolated or small** within VL:

| Mechanism | Confirmed | Additional user-visible | VL status |
|-----------|----------:|------------------------:|-----------|
| Family A (extraction qty inflation) | 2 | 0 | **B) Small family <5** |
| Mozzarella (SIZE×COUNT under-count) | 1 | 0 | **A) Isolated** |
| Guanciale (weight→count over-count) | 1 | 0 | **A) Isolated** |
| Ginger Beer (decimal CL parse) | 1 | 0 | **A) Isolated** |

Five products share the Mozzarella **structural** code path (`SIZE_COUNT_RE` + `structureTotalIsFinalForGenericRow`) but show **correct UI economics** — they are not expansion hits for the Mozzarella bug mechanism.

---

## Task 1 — Family A Expansion Table

**Mechanism:** PDF/OCR qty=1 → Pass C qty=1 → Hybrid H qty>1, total preserved, unit≈total at qty=1.

**Candidate population:** 15 rows (OCR qty=1 + weight/pack token pattern per `family-a-scope-audit`).

| Product | Invoice | PDF qty | Pass C | Hybrid H | Classification | User-visible? |
|---------|---------|--------:|-------:|---------:|----------------|:-------------:|
| **MEZZI PACCHERI MANCINI (CX 1KG*6)** | Bocconcino | 1 | 1 | **2** | **Confirmed** | Yes (split-brain: 2 un vs 6 kg) |
| **RICOTTA TREVIGIANA 1,5KG** | Bocconcino | 1 | 1 | **2** | **Confirmed** | No (UI self-consistent with bound qty=2) |
| POMODORO PELATI (CX 2.5KG*6) | Bocconcino | 1 | 1 | 1 | Rejected | — |
| ROLO DE CABRA E VACA 1KG | Bocconcino | 1 | 1 | 1 | False negative (correct) | — |
| Pepinos / Arroz / Açúcar (Avijudo×3) | Avijudo | 1 | 1 | 1 | Rejected | — |
| Pepinos / Arroz / Açúcar (Aviludo×3) | Aviludo | 1 | 1 | 1 | Rejected | — |
| Ovo MORENO / Tomilho | Bidfood | 1 | 1 | 1 | Rejected | — |
| Farina / Aceto / Rulo Di Capra | Mammafiore | 1 | 1 | 1 | Rejected | — |

**Expansion result:** **0 additional products** beyond Mezzi and Ricotta. All 13 other candidates have Hybrid H qty=1 (no inflation signature). Both confirmed rows are on the same Bocconcino invoice; supplier-specific (Il Bocconcino blank-CX pattern).

**Evidence:** `.tmp/family-a-scope-audit/audit-result.json` (2/15 failures), `.tmp/family-a-full-population-replay/results.json` (2 confirmed, 15 verified), `.tmp/ricotta-root-cause-trace/`, `.tmp/mezzi-root-cause-trace/`.

---

## Task 2 — Mozzarella Pattern Expansion

**Mechanism:** `parsePurchaseStructureFromText` matches `SIZE_COUNT_RE` (e.g. `125GR*8`); `structureTotalIsFinalForGenericRow` treats inner pack total as final; invoice outer qty not multiplied → **usable under-counted**.

**Code path:** `stock-normalization.ts` → `computeUsableFromPurchaseStructure` with fallback `"name N×SIZE total is final; generic row does not rescale inner pack"`.

### Confirmed (user-visible)

| Product | Invoice qty | Expected usable | Actual usable | Operational impact |
|---------|------------:|----------------:|--------------:|-------------------|
| **MOZZARELLA FIOR DI LATTE "IL BOCCONCINO" 125GR*8** | 10 | 10 kg | **1 kg** | €81.20/kg vs €8.12/kg |

Extraction stages 1–7 correct (qty=10). First error at stage 8 stock normalization.

### Structural matches (NOT user-visible — excluded from expansion)

| Product | Replay gap | UI audit | Why excluded |
|---------|-----------|----------|--------------|
| MEZZI PACCHERI (CX 1KG*6) | 12 kg → 6 kg | Class A (Family A) | Different primary bug (extraction); €/kg accidentally correct |
| ACQUA S.PELLEGRINO (CX 75CL*15) | 22.5 L → 11.25 L | Class C | Operational €3.73/L correct for 2 cases |
| SanPellegrino 75cl x 15ud | 22.5 L → 11.25 L | Class C | Same — UI correct |
| Birra Peroni 33cl*24 | 190 L → 7.92 L | Class C | 24 bottles → 7.92 L correct |
| Guanciale 1,5kg*7 | 63 kg → 10.5 kg | Class A | **Guanciale mechanism** (over-count), not Mozzarella |

**Expansion result:** **0 additional user-visible Mozzarella-pattern products.** One confirmed only.

**Control (same invoice, no SIZE×COUNT):** Stracciatella 250 GR — qty=24 scales to 6 kg correctly (`bare_measure` tier).

---

## Task 3 — Guanciale Pattern Expansion

**Mechanism:** Weight-purchase line (qty≈kg, unit=UN) misread as count; supplier `*N` pack notation (7×1.5 kg case shape) applied as purchased units → **usable over-counted**.

**Code path:** Same `SIZE_COUNT_RE` tier as Mozzarella, but weight-semantics row + `+/-` tolerance token triggers wrong direction.

### Confirmed

| Product | Purchased | Parsed usable | Direction | Operational |
|---------|----------:|--------------:|-----------|-------------|
| **Guanciale di suino stagionato +/- 1,5kg*7 Sorrentino** | ~5.996 kg | **10.5 kg** | Over-count | €6.18/kg vs €10.83/kg |

Token `1,5kg*7` → `purchaseContainerCount=7`, `totalUsableAmount=10500g`. Row qty 5.996 ignored.

### Expansion scan

Weight-semantics heuristic applied to all 51 VL rows:

- `size_count` + `unitMeasurement=kg` matches: **2** (Mozzarella token is g, Guanciale is kg)
- Usable > purchased weight (>5%): **1** (Guanciale only)

**Expansion result:** **0 additional products.** Pattern requires weight-line qty + supplier case notation on a weight-priced row — rare in VL corpus.

**Contrast with Mozzarella:** Same subsystem (`structureTotalIsFinalForGenericRow`) but opposite direction and different fix (weight semantics vs outer-pack scaling).

---

## Task 4 — Ginger Beer Pattern Expansion

**Mechanism:** OCR typo `0.20cl` in product name → `detectVolume` parses as 0.20 centilitres = **2 ml/bottle** → absurd €/L.

**Code path:** `ingredient-unit-inference.ts` → `detectVolume` CL regex; `computeEffectiveUsableCost` divides total by tiny usable volume.

### Confirmed

| Product | Parsed vol | Expected vol | Operational €/L | Invoice |
|---------|-----------|-------------|------------------|---------|
| **Baladin - Ginger Beer 0.20cl** | 2 ml/bottle | ~200 ml (33 cl SKU) | **€405/L** | Emporio Italia |

Extraction qty=24 correct. Error at volume inference (stage 8).

### Expansion scan

| Scan | VL (51 rows) | Production (207 rows) |
|------|-------------:|----------------------:|
| `/0\.[0-9]+\s*cl\b/i` regex | **1** | **0** |
| Beverage + parsed vol <50 ml | **1** | **0** |
| €/L >€50 outlier | **1** | **0** |

**Integer CL controls (correct):** `75cl` → 750 ml (S.Pellegrino), `33cl` → 330 ml (Peroni).

**Expansion result:** **0 additional products.** Failure requires decimal-leading OCR artifact (`0.XXcl`) absent elsewhere in VL or production.

---

## Task 5 — Population Size Per Mechanism

| Mechanism | Confirmed products | Structural/code-path matches | User-visible additional | Total VL impact |
|-----------|-------------------:|-----------------------------:|------------------------:|----------------:|
| Family A | 2 | 15 candidates screened | 0 | 2 |
| Mozzarella | 1 | 5 (UI correct or different bug) | 0 | 1 |
| Guanciale | 1 | 2 size_count kg scanned | 0 | 1 |
| Ginger Beer | 1 | 51 rows regex-scanned | 0 | 1 |

**Cross-mechanism overlap:**

- Mezzi Paccheri: Family A (primary) + Mozzarella structural match (secondary, not user-visible for under-count)
- Guanciale: Guanciale (primary) + Mozzarella structural match (secondary, wrong direction)

**Unique user-visible bug rows in VL:** 4 confirmed surfaces (Mezzi split-brain, Mozzarella, Guanciale, Ginger Beer) across 5 invoice items; Ricotta Family A is confirmed extraction but UI-economics-consistent.

---

## Task 6 — VL Status Classification

| Mechanism | Affected count | Status | Rationale |
|-----------|---------------:|--------|-----------|
| Family A | 2 | **B) Small family <5** | 2 confirmed on 1 invoice; 0 expansion |
| Mozzarella | 1 | **A) Isolated** | 1 user-visible; 5 structural non-hits |
| Guanciale | 1 | **A) Isolated** | 1 confirmed; weight scan found 0 more |
| Ginger Beer | 1 | **A) Isolated** | 1/51 VL; 0 production |

**Status key:** A = 1 product · B = 2–4 · C = ≥5 user-visible affected.

---

## Methodology

1. **VL DB read-only:** 51 `invoice_items` across 7 invoices via Supabase service role (`audit.mts`).
2. **Production replay:** `bindMonetaryColumns`, `resolveInvoiceLinePurchaseFormat`, `parsePurchaseStructureFromText`, `detectVolume`, `computeEffectiveUsableCost`.
3. **Extract cross-check:** Pass C (`.tmp/passc-refinement-validation/reextract/`) vs Hybrid H (`.tmp/final-validation-lab-rerun/extracts/`).
4. **UI corroboration:** `.tmp/quantity-mismatch-ui-audit/classifications.json` — user-visible vs internal-only.
5. **Prior audits:** family-a-scope-audit, decimal-cl-audit, stock-normalization-family-assessment, root-cause traces.

---

## Confidence

| Mechanism | Score | Basis |
|-----------|------:|-------|
| Family A | 0.90 | Full 15-row population replay; PDF ground truth |
| Mozzarella | 0.92 | Live replay matches persisted values; UI audit confirms single hit |
| Guanciale | 0.85 | Single VL instance; heuristic scan may miss edge weight lines |
| Ginger Beer | 0.92 | Exhaustive regex scan VL + production |

---

## Artifacts

| File | Contents |
|------|----------|
| `.tmp/bug-pattern-expansion-audit/REPORT.md` | This report |
| `.tmp/bug-pattern-expansion-audit/population.json` | Machine-readable population + rows |
| `.tmp/bug-pattern-expansion-audit/audit.mts` | Reproducible replay script (read-only) |

---

## Conclusion

**No new bug families discovered.** Pattern expansion within VL confirms all four mechanisms are **small and isolated** — none expand to ≥5 user-visible products. The Mozzarella code path (`SIZE_COUNT_RE`) touches more rows structurally, but only Mozzarella Fior di Latte shows the under-count user-visible defect; other matches are either UI-correct or belong to Family A / Guanciale mechanisms.
