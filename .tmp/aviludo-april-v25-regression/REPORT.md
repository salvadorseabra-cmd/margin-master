# Aviludo April v25 Regression Investigation

**Invoice:** `c2f52357-0f80-491a-ba14-c97ff4837472`  
**Mode:** READ-ONLY  
**Generated:** 2026-06-12  
**Deploy:** extract-invoice **v25** (VL `bjhnlrgodcqoyzddbpbd`)

---

## Executive Summary

**Aviludo April 0 rows on v25 is a false regression.** Production v25 extracts **9/9 items** on the same PNG fixture when the data URL is built correctly. The final VL re-run reported 0 rows because its audit harness **double-prefixed** the fixture URL.

| Probe | URL handling | Items | Pass A | Pass B | Pass C |
|-------|--------------|-------|--------|--------|--------|
| Historical (refinement) | PNG fixture | **9** | 2026-04-17 | AVILUDO | 9 rows |
| Final VL re-run (v25) | **Double prefix bug** | **0** | null | null | 0 rows |
| This investigation (v25) | Prefix normalized | **9** (3/3) | 2026-04-17 | AVILUDO | 9 rows |

**Root cause:** `.tmp/footer-validation-4dc40c3/april-historico-png-fixture.b64.txt` stores a **complete** `data:image/png;base64,...` string. `.tmp/final-validation-lab-rerun/run-audit.mts` prepends another prefix unconditionally → corrupt URL → image decode fails → all passes null → `items:[]`.

**Confidence:** **97%**

**Smallest fix:** Normalize data URL in audit scripts only (no production code change). Re-run VL metrics after fix.

---

## Stage Trace — First Divergence

| # | Stage | Historical (9 rows) | v25 failed audit (0 rows) | v25 corrected (9 rows) |
|---|-------|-------------------|---------------------------|------------------------|
| 1 | **Image input** | Valid PNG URL | **Corrupt double prefix** ❌ | Valid PNG URL ✅ |
| 2 | Geometry | top=184, bottom=439 | Not reached | Same bounds ✅ |
| 3 | Crop | cropHeight=255 | Not reached | Same ✅ |
| 4 | Pass A | 2026-04-17 | null | 2026-04-17 ✅ |
| 5 | Pass B | AVILUDO | null | AVILUDO ✅ |
| 6 | Pass C | 9 items | 0 items (symptom) | 9 items ✅ |
| 7 | Final | 9 items | 0 items | 9 items ✅ |

**First divergence: Stage 1 (image input / decode).** Pass C empty array is downstream of undecodable image, not a table-extraction regression.

---

## Hypothesis Evaluation

| Hypothesis | Verdict | Evidence |
|------------|---------|----------|
| Strict `json_schema` rejects Aviludo format | **Rejected** | 9/9 on v25 with valid PNG; no discount columns needed |
| Schema requires gross/discount/net fields | **Rejected** | Aviludo extracts with legacy `unit_price`/`total` mapping |
| v24/v25 prompt changes broke Pass C | **Rejected** | Emporio-only examples; Aviludo unchanged on valid image |
| Geometry/crop change (Phase 1 margin 36) | **Rejected** | Never reached on corrupt URL; valid PNG still 9 rows |
| GPT returns empty under strict schema | **Rejected** | Full item list returned when image decodes |
| **Double data-URL prefix in audit harness** | **Confirmed** | A/B test: bug 0/3, correct 9/3 |

---

## Git Commit Assessment

| Commit | Description | Caused 0 rows on valid PNG? |
|--------|-------------|----------------------------|
| `04c0d88` | Pass C fractional qty | No |
| `65452a9` | Hybrid H Phase 1+2 | No |
| `de556e0` | Phase 3 monetary binder | No |
| `ec5f42f` | Structured schema enforcement | No |
| `792adb8` | v25 Ventricina discount prompt | No |

**No production commit introduced Aviludo April 0-row behavior.** The failure is isolated to `.tmp/final-validation-lab-rerun/run-audit.mts` lines 304–306.

---

## Controlled v25 Re-test (3 runs)

Fixture: `april-historico-png-fixture.b64.txt`

```
double_prefix_bug: 0 items, supplier=null  (prefix: data:image/png;base64,data:image/png;base64,...)
correct URL:       9 items, supplier=AVILUDO (3/3 runs)
```

Full extract with correct URL matches historical 9 item names and quantities. See `v25-correct-png-extract.json` and `prefix-comparison.json`.

---

## Why Historical Refinement Succeeded (June 11)

`.tmp/passc-refinement-validation/reextract-april-png.mts` uses the same blind-prefix pattern. Likely explanations:

1. The b64 fixture was **raw base64** on June 11 00:48 and was later saved as a full data URL for footer-validation artifacts.
2. Regardless, v25 behavior on a **valid** PNG is unchanged from historical 9-row extraction.

Prior audit (`.tmp/aviludo-regression-audit/`) already documented this double-prefix pitfall and fixed it for PNG probes (9/9 on deployed edge).

---

## Smallest Fix (recommendation only)

**Scope:** Audit harness scripts — not production `extract-invoice`.

```typescript
const raw = readFileSync(path, "utf8").trim();
const imageDataUrl = raw.startsWith("data:")
  ? raw
  : `data:image/png;base64,${raw.replace(/^data:image\/[^;]+;base64,/, "")}`;
```

Apply to `.tmp/final-validation-lab-rerun/run-audit.mts` and any script loading `.b64.txt` fixtures.

---

## Expected VL Metrics Impact

| Metric | Current (broken URL) | After harness fix |
|--------|---------------------|-------------------|
| Aviludo April items | 0/9 | 9/9 (expected) |
| April € error | **€300.95** | ~€0 (if GT alignment holds) |
| Global € error | €389.97 | **~€89** |
| Field accuracy | 64% | Materially higher (+9 GT rows) |

April accounted for **77%** of total VL € error in the final re-run; this is a measurement artifact, not a v25 extraction regression.

---

## Artifacts

| File | Contents |
|------|----------|
| `root-cause.json` | Verdict, hypotheses, git assessment, fix recommendation |
| `stage-trace.json` | Per-stage comparison across three probe paths |
| `prefix-comparison.json` | A/B double-prefix vs correct URL results |
| `v25-correct-png-extract.json` | Full 9-item v25 response with valid URL |
