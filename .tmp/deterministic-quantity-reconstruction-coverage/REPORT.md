# Deterministic Quantity Reconstruction Coverage Audit

**VL:** `bjhnlrgodcqoyzddbpbd` · **Corpus:** 52 invoice_items · **Mode:** STRICT READ-ONLY

## Verdict: **B) Isolated edge cases**

86.5% reconstructable; only **1 row** (Gorgonzola) would materially improve. Zero regressions on controls if gated.

---

## Corpus statistics

| Metric | Value |
|--------|-------|
| Total rows | 52 |
| Reconstructable | 45 (86.5%) |
| Already correct | 44 |
| Would improve | **1** (Gorgonzola) |
| Would regress (ungated) | 7 traps |
| Impossible | 7 |

---

## Classification

| Class | Count | Definition |
|-------|-------|------------|
| B — Net unit price | 44 | Row reconcizes; Method B confirms qty |
| C — Gross + discount | 1 | Gorgonzola (artifact only, not DB) |
| A — Impossible | 7 | Non-reconciling, no trusted net |

---

## Gorgonzola

| Method | Qty | Correct? |
|--------|-----|----------|
| Persisted | 1.30 | No |
| Method B (total/unit_price) | 1.36 | No |
| Method C (gross+discount) | **1.35** | **Yes** (PDF) |

---

## Regression controls

Prosciutto, Mortadella, Bresaola, Pellegrino (Emporio), Paccheri, Ovo, Tomilho, Salada — all reconcile; reconstruction is identity. **No regression risk.**

Naive Method B on non-reconciling rows would regress (e.g. Ginger Beer 24→23.93).

---

## Architecture opportunity

| Dimension | Assessment |
|-----------|------------|
| Coverage | 84.6% DB-only; +1.9% with extraction-time gross/disc |
| Confidence | High when row reconcizes or Method C inputs trusted |
| Blast radius | 1 material bug; 7 false-positive traps if ungated |
| Blocker | gross/disc not persisted; qty never inverted in binding |

---

## Final answers

1. Reconstructable: **45/52**
2. Would improve: **1**
3. Gorgonzola correct? **Yes via Method C at extraction**
4. Regressions? **None on controls if gated**
5. Choice: **B) Isolated edge cases**
