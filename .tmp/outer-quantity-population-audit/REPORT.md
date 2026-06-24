# Outer Quantity Population Audit

**Generated:** 2026-06-23  
**Validation Lab:** `bjhnlrgodcqoyzddbpbd`  
**Mode:** STRICT READ-ONLY — no code changes, no DB writes, no deployments, no fixes

---

## Executive Summary

Scanned **51** VL `invoice_items`; **25** lines have `rowQty > 1` and a structured pack (`size_count`, `count_size`, or `bare_measure`). Of those, **6 are BROKEN**, **11 SAFE**, **8 SUSPICIOUS**.

The broken gate is **not Pellegrino-isolated**. It is a **family defect** in `structureTotalIsFinalForGenericRow` + `computeUsableFromPurchaseStructure` when:

- invoice outer quantity > 1,
- outer quantity ≠ inner pack count, and
- the line uses generic row units (`un`, `cx`, null).

**Confirmed BROKEN:** Pellegrino (2 cases → 11.25 L vs 22.5 L), Nata (5 cx → 6 L vs 30 L), Chocolate (2 cx → 2 kg vs 4 kg).

**Confirmed SAFE (focus):** Peroni (`rowQty === innerCount`), Mozzarella (`shouldScaleOuterPackForSizeCountGenericRow` g-path), Pomodori and Açúcar (`qty = 1`).

**Verdict: READY** — evidence complete for scoped fix design.

---

## Hypothesis (from prior work)

> When `rowQty > 1` AND `rowQty ≠ innerCount` AND `structureTotalIsFinalForGenericRow` is true, stock-normalization persists **one-pack** `structure_total` instead of `rowQty × pack`.

Replay on live VL corpus **confirms** for `size_count` cl/volume and `count_size` cx lines. The g-only outer-scaling helper (`shouldScaleOuterPackForSizeCountGenericRow`) already fixes Mozzarella but **does not** fire for cl, L, or count_size cx.

---

## Full Classification Table

| Product | Invoice | Row Qty | Structure | Current Usable | Expected Usable | Status |
|---------|---------|--------:|-----------|----------------|-----------------|--------|
| ACQUA S.PELLEGRINO (CX 75CL*15) | Il Bocconcino | 2 un | size_count 15×75cl | 11.25 L | 22.50 L | **BROKEN** |
| SanPellegrino - Acqua in vitro 75cl x 15ud | Emporio Italia | 2 un | size_count 15×75cl | 11.25 L | 22.50 L | **BROKEN** |
| Chocolate Culinaria Pantagruel 10x200 g | Avijudo | 2 cx | count_size 10×200g | 2 kg | 4 kg | **BROKEN** |
| Chocolate Pantagruel 10x200g | Aviludo | 2 cx | count_size 10×200g | 2 kg | 4 kg | **BROKEN** |
| Nata Culinaria 22% Reny Picot 6x1 Lt | Avijudo | 5 cx | count_size 6×1L | 6.00 L | 30.00 L | **BROKEN** |
| Nata Reny Picot 22% 6x1L | Aviludo | 5 cx | count_size 6×1L | 6.00 L | 30.00 L | **BROKEN** |
| Birra Peroni Nastro Azzurro 33cl*24 | Mammafiore | 24 un | size_count 24×33cl | 7.92 L | 7.92 L | SAFE |
| MOZZARELLA FIOR DI LATTE 125GR*8 | Il Bocconcino | 10 un | size_count 8×125g | 10 kg | 10 kg | SAFE |
| Guanciale 1,5kg*7 | Mammafiore | 5.996 un | size_count 7×1.5kg | 6.00 kg | — | SUSPICIOUS |
| Atum Óleo Bolsa 1 Kg | Aviludo | 2 un | bare_measure 1kg | 2 kg | 2 kg | SAFE |
| Baladin Ginger Beer 0.20cl | Emporio Italia | 24 | bare_measure 20cl | 4.80 L | 4.80 L | SAFE |
| De Cecco Paccheri 500g | Emporio Italia | 24 | bare_measure 500g | 12 kg | 12 kg | SAFE |
| Filete Anchoas 495 g | Avijudo / Aviludo | 2 un | bare_measure 495g | 990 g | 990 g | SAFE |
| MOZZA Julienne 3kg | Mammafiore | 10 un | bare_measure 3kg | 30 kg | 30 kg | SAFE |
| Ovo Líquido Gema 1 Kg | Avijudo / Aviludo | 6 un | bare_measure 1kg | 6 kg | 6 kg | SAFE |
| STRACCIATELLA 250 GR | Il Bocconcino | 24 un | bare_measure 250g | 6 kg | 6 kg | SAFE |
| Gorgonzola 1,5kg | Emporio Italia | 2 kg | bare_measure 1.5kg | 1.50 kg | — | SUSPICIOUS |
| Prosciutto Cotto 4,3-4,5KG | Emporio Italia | 4.3 kg | bare_measure 4.5kg | 4.50 kg | — | SUSPICIOUS |
| Manteiga Coimbra 1 Kg | Bidfood | 8 kg | bare_measure 1kg | 1 kg | — | SUSPICIOUS |
| Bresaola 1,5kg | Emporio Italia | 1.83 kg | bare_measure 1.5kg | 1.50 kg | — | SUSPICIOUS |
| Mortadella 3,5kg | Emporio Italia | 3.11 kg | bare_measure 3.5kg | 3.50 kg | — | SUSPICIOUS |
| Salame Ventricina 2,5 Kg | Emporio Italia | 2.6 kg | bare_measure 2.5kg | 2.50 kg | — | SUSPICIOUS |
| Salada Ibérica 250g | Bidfood | 4 em | bare_measure 250g | 250 g | — | SUSPICIOUS |

### Focus products — qty=1 (out of qty>1 scan scope)

| Product | Row Qty | Structure | Current Usable | Expected | Status |
|---------|--------:|-----------|----------------|----------|--------|
| POMODORI PELATI (CX 2,5KG*6) | 1 un | size_count 6×2.5kg | 15 kg | 15 kg | SAFE |
| Açúcar / Açucar 10x1Kg | 1 cx | count_size 10×1kg | 10 kg | 10 kg | SAFE |

### Prior corpus — not in live VL scan

| Product | Row Qty | Structure | Current Usable | Expected | Status |
|---------|--------:|-----------|----------------|----------|--------|
| MEZZI PACCHERI (CX 1KG*6) | 2 un | size_count 6×1kg | 6 kg | 12 kg or 6 kg | SUSPICIOUS |

Item `bb4bbfac` absent from live `invoice_items` on 2026-06-23. Prior discriminator audit: extracted qty=2 vs PDF qty=1 case.

---

## Family Summary

| Status | Count | Share |
|--------|------:|------:|
| **SAFE** | 11 | 44% |
| **BROKEN** | 6 | 24% |
| **SUSPICIOUS** | 8 | 32% |
| **Total qty>1 structured** | 25 | 100% |

### By parser tier (qty>1 only)

| Tier | Total | SAFE | BROKEN | SUSPICIOUS |
|------|------:|-----:|-------:|-----------:|
| `size_count` | 5 | 2 | 2 | 1 |
| `count_size` | 4 | 0 | 4 | 0 |
| `bare_measure` | 16 | 9 | 0 | 7 |

### Broken gate pattern (all 6 BROKEN)

All six share:

- `usableSource: structure_total`
- `structureTotalIsFinalForGenericRow: true`
- `rowQty > 1` and `rowQty ≠ innerCount` (count_size: inner embedded in name, row is cx count)
- `shouldScaleOuterPackForSizeCountGenericRow: false` (cl/L/count_size — not g)

Invoice item IDs: `ef25be0f`, `9cdd22ba`, `fa0d0138`, `11024922`, `2b5cea32`, `fead3fbb-df70-439c-b9e0-1ceb58cecc0e`.

---

## Focus Product Verdicts

| Product | Finding |
|---------|---------|
| **Pellegrino 75cl×15** | **BROKEN** — 2 cases → 11.25 L not 22.5 L; matches `.tmp/pellegrino-root-cause-audit/` |
| **Peroni 33cl×24** | **SAFE** — qty 24 = inner 24; structure_total is full line (7.92 L) |
| **Açúcar 10×1kg** | **SAFE** — qty=1 cx; 10 kg correct (count_size, out of qty>1 scan) |
| **Pomodori 2.5kg×6** | **SAFE** — qty=1 case; 15 kg correct (out of qty>1 scan) |
| **Nata 6×1L** | **BROKEN** — 5 cx → 6 L not 30 L; same gate as Pellegrino but count_size + cx |
| **Chocolate 10×200g** | **BROKEN** — 2 cx → 2 kg not 4 kg; count_size + cx |
| **Mozzarella 125GR×8** | **SAFE** — g-scaling path active (`structure_scaled_outer` → 10 kg) |

---

## Code Mechanism (evidence)

From `src/lib/stock-normalization.ts`:

1. `SIZE_COUNT_RE` / count_size parsers embed one-pack total in `totalUsableAmount`.
2. `structureTotalIsFinalForGenericRow` returns **true** for `count_size` and for `size_count` with `innerUnitCount > 1`.
3. `shouldScaleOuterPackForSizeCountGenericRow` scales outer qty **only when** `unitMeasurement === "g"`.
4. `computeUsableFromPurchaseStructure` → `structure_total` branch when gate is true — **no `rowQty` multiplication**.

Pellegrino: cl volume, gate true, no g-scaling → 11 250 ml.  
Nata/Chocolate: count_size gate true, cx row → one case volume/mass only.  
Mozzarella: g-scaling fires → 10 000 g (correct).

---

## Scope Verdict

| Question | Answer |
|----------|--------|
| Is Pellegrino isolated? | **No** |
| Family scope | **qty>1 outer-pack** when `structureTotalIsFinalForGenericRow` blocks scaling |
| Affected tiers | `size_count` (cl/L volume) + `count_size` (cx multi-case) |
| Not affected | `rowQty === innerCount` (Peroni); `qty=1` (Pomodori, Açúcar); g-scaling (Mozzarella); billed-weight (Guanciale) |
| READY for fix? | **READY** |

---

## Evidence Sources

| Source | Role |
|--------|------|
| Live VL `invoice_items` SELECT (read-only) | 51 rows, 7 invoices |
| `.tmp/outer-quantity-population-audit/audit.mts` | Production replay → `results.json` |
| `.tmp/pellegrino-root-cause-audit/` | Pellegrino lifecycle + €3.43/L math |
| `.tmp/stock-normalization-population-audit/` | Full VL structure population |
| `.tmp/size-count-discriminator-audit/` | Mozzarella / Mezzi / Guanciale clusters |
| `.tmp/mozzarella-vs-pellegrino-separation/` | g vs cl discriminator |
| `src/lib/stock-normalization.ts` L1092–1123, L1337–1386 | Gate functions |

---

## Final Status

| Criterion | Status |
|-----------|--------|
| All qty>1 structured VL lines classified | ✓ (25 rows) |
| Focus products addressed | ✓ |
| Family vs isolated verdict | ✓ FAMILY |
| Broken gate evidenced | ✓ 6 lines |
| **READY** | **READY** |
