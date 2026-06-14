# Final Verdict — OCR Determinism Hardening

**Date:** 2026-06-14  
**Verdict:** **SUCCESS**

---

## Question

Did `temperature=0` + `seed=42` hardening reduce OCR variability on the AVILUDO Anchovas line?

**Answer: YES — dramatically on full-page extraction.**

---

## Evidence

| Test | Before | After |
|------|--------|-------|
| Full-page Anchovas variants (N runs) | 3/3 distinct | **1/5 distinct** |
| Full item-list signatures | 3/3 distinct | **1/5 identical** |

Pre-hardening: every re-read produced a different brand token (`Alfonsica Ll`, `Alfonsoita LI`, `Alfonsica Li`) and different quantities on sibling lines.

Post-hardening: five consecutive VL invocations returned byte-identical item arrays including `Filete de Anchoas Alconfirosa LI 495 g`.

---

## Classification

| Tag | Value |
|-----|-------|
| **Verdict** | **SUCCESS** |
| **Root cause addressed** | Missing sampling controls on GPT-4.1 vision calls |
| **Fix applied** | `temperature: 0`, `seed: 42` on all `callOpenAiJson` passes |
| **Regression risk** | Low — unit tests pass; json_object and json_schema both verified |

---

## Caveats

1. **Not 100% guaranteed globally** — OpenAI documents that seed improves reproducibility but does not guarantee bit-identical output across all inputs/API versions. Our 5-run sample on this invoice is fully stable.
2. **Spelling may differ from prior runs** — stabilized output is `Alconfirosa`, not any of the three pre-hardening variants. Alias/matcher behavior should be re-evaluated against the new stable spelling.
3. **Row-crop / partial-crop modes** — baseline showed some crops already stable (`row-anchovas` 3/3); full-page was the failure mode and is now fixed.
4. **Deployed to VL** — hardened code is live on Validation Lab; local repo changes are uncommitted per task constraints.

---

## Recommended follow-up

- Re-read AVILUDO April invoice in VL UI and confirm Anchovas match stability across user-triggered re-reads.
- Monitor `[invoice-ocr] openai-request` logs for parameter confirmation in production traces.
- If alias miss persists on stable spelling `Alconfirosa`, add alias entry (separate from this OCR hardening scope).
