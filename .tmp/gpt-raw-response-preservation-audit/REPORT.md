# GPT Raw Response Preservation Audit

**VL:** `bjhnlrgodcqoyzddbpbd` · **Deploy:** v41 · **Mode:** STRICT READ-ONLY

## Verdict: **A — GPT prepass returned 1.3; pipeline propagated it unchanged**

Raw GPT string not preserved (discarded at `callOpenAiJson:93`). Numeric proof: `ocr_quantity: 1.3` at first normalization point.

---

## T1 — Prepass trace

```
crop → cropQtdColumnStrip → callOpenAiJson → JSON.parse → normalizePrepassRows
→ Pass C → anchorQuantities → bindMonetaryColumns → persist
```

Gorgonzola: PDF **1.35** → prepass **1.3** → Pass C 1.05 → anchored **1.3** → persisted **1.3**

---

## T2 — Raw response discarded

**File:** `invoice-date-extraction.ts` · **Function:** `callOpenAiJson` · **Lines:** 87–93

`content` parsed immediately; never logged or stored on success path.

---

## T3–T4 — No quantity transformation

- No `round2`, `parseFloat`, or rounding on `quantity` in prepass→persist chain
- `normalizePrepassRows`: typeof check only
- `anchorQuantities`: copies `ocrQty` verbatim
- `round2(1.35) = 1.35` — even if misapplied, would not yield 1.3
- Unit test: prepass 1.35 → anchored 1.35

---

## T5–T6 — Only GPT could produce 1.3

Pipeline cannot convert 1.35→1.3. Live `ocr_quantity: 1.3` equals prepass output at first post-GPT step.

---

## T7 — Minimal instrumentation (design only)

Env-gated `console.log(content)` in `callOpenAiJson` before `JSON.parse` (~3 lines, no DB change).

---

## Final answers

1. Pipeline transform 1.35→1.30? **No**
2. Evidence of transformation? **None**
3. Raw response preserved? **No**
4. Future audits prove GPT directly? **Not without instrumentation**
5. Classification: **A**

---

## Investigation closure

Gorgonzola quantity bug is **GPT prepass vision misread (1.3 not 1.35)**, not pipeline corruption. Remaining fixes: better image presentation, math inverse at extraction, or raw-response instrumentation for future proof.
