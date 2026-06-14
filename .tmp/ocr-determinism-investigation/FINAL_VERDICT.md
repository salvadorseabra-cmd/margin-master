# Final Verdict — OCR / Re-Read Determinism Investigation

**Generated:** 2026-06-14  
**Mode:** READ-ONLY investigation  
**Investigator:** subagent `2a783a7f-102a-4a15-bc08-9e241dc583b4`  
**Live DB queried:** 2026-06-14T16:05Z  
**Verdict tag:** **`OCR_NON_DETERMINISTIC`**  
**Classification:** **D — OCR non-deterministic + alias sensitivity**

---

## Required Answers

| # | Question | Answer |
|---|----------|--------|
| 1 | **Is OCR re-executed on every re-read?** | **YES** — `reExtract` → fresh signed URL → `runExtraction` → `extract-invoice` edge function. No cache, no reuse of prior extraction. |
| 2 | **Is extraction deterministic?** | **NO** — GPT-4.1 vision, 4-pass, no `temperature`/`top_p`/`seed` set (model defaults apply). |
| 3 | **Can same PDF produce different OCR text?** | **YES** — `.tmp/vl-ocr-rc/ocr-stability-runs.json` shows 20+ Anchovas brand variants from identical source. |
| 4 | **Is Anchovas failing because OCR text changes?** | **YES** — match toggles on exact alias key hit/miss per OCR spelling. |
| 5 | **Would Match Lifecycle behave correctly if OCR stable?** | **YES** — matcher is deterministic; shadow seed is awaited; Pepino proves stable-OCR stability. |
| 6 | **Primarily OCR problem or matching problem?** | **OCR problem** — matching behaves as designed (exact-key aliases + conservative semantic). |
| 7 | **Exact fix to eliminate Anchovas instability?** | Stabilize OCR (`temperature=0` + `seed`) **or** add fuzzy brand-token canonicalization before alias lookup (collapse `alconfi sta` ↔ `alconfrisa`). Whack-a-mole per-variant aliases is insufficient. |

---

## Verdict

| Tag | Value |
|-----|-------|
| **Final verdict** | **`OCR_NON_DETERMINISTIC`** |
| **Root cause class** | **D** — OCR non-deterministic + alias sensitivity |
| **Bug in matcher?** | **NO** |
| **Bug in Match Lifecycle?** | **NO** |
| **Bug in alias logic?** | **NO** (design limitation, not defect) |
| **Bug in OCR pipeline?** | **YES** (missing determinism controls) |

---

## Executive Summary

Anchovas flip instability on the AVILUDO April invoice (`c2f52357-0f80-491a-ba14-c97ff4837472`) is **OCR non-determinism amplified by exact-key alias matching**, not a matcher or lifecycle bug.

Every re-read re-invokes GPT-4.1 vision with no cache and no sampling controls. The same PDF produces 20+ brand-token variants (`Alconfrisa`, `Alconfi sta`, `Alconfirsta`, `Alconfrista`, …). Match outcome toggles solely on whether the OCR spelling hits a persisted alias key. Semantic fallback rejects variants at ~0.23 (threshold 0.58).

Pepino on the same invoice is stable because OCR text is stable — proving Match Lifecycle works when OCR is fixed.

---

## Fix Priority

1. **OCR stabilization (preferred):** `temperature: 0` (+ `seed` if supported) on all 4 `callOpenAiJson` passes in `supabase/functions/extract-invoice/`.
2. **Alias resilience:** Brand-token canonicalization before alias lookup — collapse spaced variants, edit-distance on supplier brand stems.
3. **Stopgap only:** Manual confirm per variant — already in use, does not scale.

---

## Deliverables

| File | Contents |
|------|----------|
| `OCR_PIPELINE.md` | Re-read execution order, cache/reuse answers |
| `OCR_PROVIDER_AUDIT.md` | GPT-4.1 config, missing sampling params |
| `ANCHOAS_HISTORY.md` | OCR variant table across re-reads |
| `DETERMINISM_ANALYSIS.md` | Stability run evidence |
| `ALIAS_SENSITIVITY.md` | Exact-key lookup, variant hit/miss table |
| `MATCHER_VARIANT_ANALYSIS.md` | Simulation results, Pepino contrast |
| `ROOT_CAUSE.md` | Classification D, mechanism diagram |
| `FINAL_VERDICT.md` | This file |

---

## Validation Scripts

```bash
npx vite-node scripts/validate-ocr-determinism.mts baseline
npx vite-node scripts/validate-ocr-determinism.mts matcher
npx vite-node scripts/validate-ocr-determinism.mts stability
```

Or individually:

```bash
npx vite-node scripts/validate-anchoas-reread.mts baseline
npx vite-node scripts/validate-anchoas-reread.mts matcher
npx vite-node scripts/validate-reread-determinism.mts baseline
```

---

## Related Audits

- `.tmp/reread-determinism-investigation/` — end-to-end re-read determinism
- `.tmp/anchoas-reread-investigation/` — Anchovas-specific trace
- `.tmp/vl-ocr-rc/ocr-stability-runs.json` — OCR stability evidence
