# Determinism Analysis — OCR Replay Evidence

**Generated:** 2026-06-14  
**Mode:** READ-ONLY investigation  
**Primary evidence:** `.tmp/vl-ocr-rc/ocr-stability-runs.json`  
**Secondary evidence:** Live re-read history on invoice `c2f52357-0f80-491a-ba14-c97ff4837472`

---

## Question

Does the same PDF produce the same OCR text on every extraction?

**Answer: NO.**

---

## Stability Run Results

Three runs per crop mode against the same AVILUDO April invoice PDF.

### Crop: `full` (full page)

| Run | Anchovas OCR text |
|-----|-------------------|
| 1 | `Filete de Anchoas Alfonsica Ll 495 g` |
| 2 | `Filete de Anchoas Alfonsoita LI 495 g` |
| 3 | `Filete de Anchoas Alfonsica Li 495 g` |

**Result:** 3/3 different brand tokens.

### Crop: `table-full` (table region)

| Run | Anchovas OCR text |
|-----|-------------------|
| 1 | `Filete de Anchovas Alconfirosa L4 495 g` |
| 2 | `Filete de Anchovas Alconfirosa Lt 495 g` |
| 3 | `Filete de Anchovas Alconfirosa L 495 g` |

**Result:** 3/3 different unit-token variants (`L4`, `Lt`, `L`).

### Crop: `row-anchovas` (tight row crop)

| Run | Anchovas OCR text |
|-----|-------------------|
| 1 | `Filete de Anchovas Alconfirosa LT 495 g` |
| 2 | `Filete de Anchovas Alconfirosa LT 495 g` |
| 3 | `Filete de Anchovas Alconfirosa LT 495 g` |

**Result:** 3/3 **identical** — stable when crop isolates the row.

### Crop: `row-chocolate-header` (adjacent row context)

| Run | Anchovas OCR text (from chocolate-header crop) |
|-----|------------------------------------------------|
| 1 | `Filete de Anchovas Alconfiosta Ll 495 g` |
| 2 | `Filete de Anchovas Alconfiosa LL 495 g` |
| 3 | `Filete de Anchovas Alconfi osa LI 495 g` |

**Result:** 3/3 different — context/crop geometry drives variance.

---

## Summary Table

| Crop mode | Runs | Anchovas stability |
|-----------|------|-------------------|
| `full` | 3 | ❌ 3 different strings |
| `table-full` | 3 | ❌ 3 variants |
| `row-anchovas` | 3 | ✅ Identical |
| `row-chocolate-header` | 3 | ❌ 3 variants |

---

## Live Re-Read Evidence

Independent of stability runs, production re-reads on the same invoice produced:

| Re-read | OCR brand token | Match |
|---------|-----------------|-------|
| #1 | `Alconfirsta` | unmatched |
| #2 | `Alconfi sta` | unmatched (later aliased) |
| #3 | `Alconfrisa` | matched |
| #4+ | `Alconfrista` | matched (after alias added) |

Same PDF, same edge function, same model — different OCR every time.

---

## Determinism Layers

| Layer | Deterministic? | Notes |
|-------|----------------|-------|
| GPT-4.1 vision OCR | ❌ NO | No temperature/seed/cache |
| Normalization | ✅ YES | Pure function of OCR text |
| Alias lookup | ✅ YES | Exact-key map lookup |
| Semantic matcher | ✅ YES | Fixed thresholds, fixed catalog |
| Shadow seed | ✅ YES | Awaited, deterministic given input |
| End-to-end re-read | ❌ NO | OCR variance propagates to match outcome |

---

## Matcher Determinism Proof

Given fixed OCR text + fixed alias map snapshot, matcher output is identical:

```
validate-anchoas-reread.mts matcher  →  same results on repeated runs
validate-reread-determinism.mts matcher  →  same variant table every invocation
```

The non-determinism enters at OCR, not at matching.

---

## Pepino Control Case

Pepino line OCR text `"Pepino Extra III Frasco 6x720 g"` is stable across re-reads. Apparent Pepino "flips" come from virtual/persisted split (`READ_CUTOVER=OFF`) and user unmatch/reject actions — not OCR variance.

See `.tmp/reread-determinism-investigation/ANCHOAS_PEPINO_COMPARISON.md`.

---

## Conclusion

Same PDF → **different OCR text** on full-page / table extraction. End-to-end re-read is **not deterministic**. Match Lifecycle and matcher behave correctly when OCR input is stable.
