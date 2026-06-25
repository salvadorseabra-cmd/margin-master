# Quantity Source of Truth Audit

**VL:** `bjhnlrgodcqoyzddbpbd` · **Mode:** STRICT READ-ONLY

## Verdict: **D) Hybrid**

No active deterministic quantity OCR exists. GPT reads qty twice (prepass + Pass C). Closest latent path: math inverse from monetary columns — not wired.

---

## T1 — Quantity source inventory (summary)

| Source | Available | Active | Deterministic |
|--------|-----------|--------|---------------|
| GPT Qty Prepass | Yes | **Yes** | No |
| GPT Pass C | Yes | **Yes** | No |
| Quantity anchoring | Yes | Yes | Yes (logic) |
| Monetary binding | Yes | Yes | Yes (price only) |
| Math inverse qty | Latent | **No** | Yes |
| parseContinente/Padaria | Yes | **No** | Yes |
| PDF text layer | No | Never | — |
| Tesseract/Document AI | No | Never | — |

---

## T2 — Gorgonzola lifecycle (v41)

| Stage | Qty |
|-------|-----|
| PDF | **1.35** |
| GPT Prepass | **1.30** ← first wrong |
| Pass C | 1.05 |
| Anchored | 1.30 |
| Persisted | 1.30 |

---

## T3 — OCR capabilities

No word-level OCR, token bboxes, structured tables, or PDF text extraction. GPT is the only digit reader. Prepass added because Pass C alone misread fraction metadata.

---

## T5 — Can existing source produce 1.35?

| Source | Produces 1.35? |
|--------|----------------|
| GPT Prepass v41 | No (1.30) |
| GPT Pass C | No (1.05) |
| Math: 13.44 / (12.9 × 0.7715) | **Yes** — not wired |
| parseContinente | N/A — not invoked |

---

## Final answers

1. Reading qty twice? **Yes** (prepass + Pass C).
2. Deterministic qty exists? **No** in production.
3. Why GPT? Only digit reader; no traditional OCR.
4. Smallest improvement? Wire **qty = total / net_unit** when monetary columns reconcile.
5. Choice: **D) Hybrid**
