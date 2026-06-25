# OCR Quantity Reading Strategy Audit

**VL:** `bjhnlrgodcqoyzddbpbd` · **Deploy:** v41 · **Mode:** STRICT READ-ONLY

## Recommendation: **E) Hybrid**

Full table crop + explicit Qtd column bounds (x≈438–483) + row-band index guidance. +0 GPT calls; preserves fraction fix; adds row context for decimal disambiguation.

---

## T1 — Current production flow

```
image → cropTableRegionForLineItems → cropQtdColumnStrip (43px)
     → runQuantityPrePass (QTD_STRIP_SYSTEM_PROMPT) → GPT
     → Pass C → anchorQuantities
```

Fail-open: strip null → full table + `QTY_PREPAS_SYSTEM_PROMPT`.

---

## T2 — Strategy comparison

| Strategy | Gorgonzola | Evidence |
|----------|------------|----------|
| A Current 43px strip | **1.30** | Live v41 |
| B Alt strip prompt | 1.30 | Inferred (same pixels) |
| C Full table Qtd-only | **2.00** | Live v39 |
| D Full table + coords | 2.00 | Inferred v39 |
| E Hybrid | **1.35**? | Hypothesis |

---

## T3 — GPT visibility

| Strategy | Qtd | Description | Prices |
|----------|-----|-------------|--------|
| A/B strip | HIGH | LOW | LOW |
| C/D full table | MEDIUM | HIGH | HIGH |
| E hybrid | HIGH | HIGH (prompt forbids) | HIGH |

---

## T4 — Can produce 1.35→1.30?

All strategies **YES** in theory. **A proven live** at v41. C/D worse (fraction regression to 2.00).

---

## T5 — Regression risk

| Product | Current | Strip risk | Full-table risk |
|---------|---------|------------|-----------------|
| Gorgonzola | 1.30 | OPEN | HIGH (2.00 v39) |
| Bresaola | 1.83 | LOW | HIGH |
| Prosciutto | 4.30 | LOW | LOW |
| Controls | OK | LOW | varies |

---

## T6 — Architecture

| | Strip | Hybrid E |
|---|-------|----------|
| GPT calls | +0 | +0 |
| Blast radius | Emporio geometry | Prepass prompt path |
| Fraction fix | Proven | Retained via isolation rules |

---

## Final answers

1. Strip fundamentally wrong? **No** — fixed fraction-metadata class.
2. Full-table constrained more reliable? **No** for fraction rows (v39 proven).
3. Wider strips solve issue? **Inconclusive** (inferred only).
4. Smallest safe improvement? **Hybrid E**.
5. Choice: **E) Hybrid**

Live replay blocked (`OPENAI_API_KEY` unavailable). Validate hybrid prompt before implementation.
