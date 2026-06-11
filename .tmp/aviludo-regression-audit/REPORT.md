# Aviludo 17/04/2026 Regression Investigation

Generated: 2026-06-11  
Invoice: `c2f52357-0f80-491a-ba14-c97ff4837472`  
Mode: **READ-ONLY**

---

## Executive Summary

**9 rows → 0 rows is NOT a Hybrid H Phase 1/2 regression.** Phase 1+2 is **local uncommitted only**; VL edge is still `214e864` (pre-Hybrid). With a **valid PNG input**, deployed extract-invoice returns **9 items in 3/3 runs** (same as historical success).

**First failing stage (0-item path):** **`crop_generation` / `image_decode_input`** — when a **raw PDF data URL** (2,497-byte storage file) reaches `extract-invoice`, ImageScript cannot decode PDF bytes. All GPT passes return null; **Pass C symptom** is `items:[]` with HTTP 200.

**Rollback Phase 1/2 would restore Aviludo:** **NO** (not deployed; wouldn't fix PDF input path).

**Confidence:** **85%**

---

## Historical vs Current

| Probe | Input | Items | Pass A | Pass B | Pass C | Timestamp |
|-------|-------|-------|--------|--------|--------|-----------|
| **Historical success** | PNG fixture | **9** | 2026-04-17 | AVILUDO | 9 rows | 2026-06-11 00:48 |
| **DB snapshot** | (prior upload) | **9** | — | — | — | 2026-06-10 17:23 |
| **Current audit run 1** | PNG fixture | **9** | 2026-04-17 | AVILUDO | 9 rows | 2026-06-11 23:08 |
| **Current audit run 2** | PNG fixture | **9** | 2026-04-17 | AVILUDO | 9 rows | 2026-06-11 23:08 |
| **Current audit run 3** | PNG fixture | **9** | 2026-04-17 | AVILUDO | 9 rows | 2026-06-11 23:08 |
| **Current storage PDF** | PDF data URL | **0** | null | null | 0 rows | 2026-06-11 23:08 |
| **aviludo-reread-audit** | PDF + broken PNG URL | **0** | null | null | 0 rows | 2026-06-11 22:48 |

---

## Stage-by-Stage Divergence (9 → 0)

Pipeline mapping (`index.ts`):

| User stage | Code | PDF path (0 items) | PNG path (9 items) |
|------------|------|--------------------|--------------------|
| Geometry | `detectTableBounds` | **Not reached** (invalid image) | top=184 (m10) / 158 (m36), bottom=439 ✅ |
| Crop | `cropTableRegionForLineItems` | **Decode fails** | cropHeight 255–281 ✅ |
| OCR | — | N/A (vision only) | N/A |
| Pass A | `extractIssueDateFromImage` | **null** | `2026-04-17` ✅ |
| Pass B | `extractMetadataFromImage` | **null** | `AVILUDO` ✅ |
| Footer | `extractFooterMetadataFromImage` | null | total varies (GPT) |
| **Pass C** | `extractTableItemsFromImage` | **`items:[]`** ❌ | **9 items** ✅ |
| Final | `finalizeExtractedLineItems` | 0 (no change) | 9 ✅ |

**First divergence:** **`crop_generation`** on PDF path (invalid image bytes). Pass C is where **row count** drops to 0, but root cause is **upstream image input**, not Pass C logic change.

Normalize/reconcile: **not involved** — empty before reconcile.

---

## Hybrid H Phase 1 / Phase 2 Assessment

| Phase | Deployed? | Aviludo impact | Caused 9→0? |
|-------|-----------|----------------|-------------|
| **Phase 1** (TABLE_TOP_MARGIN 36) | **NO** (local only) | +26px crop above header; rows still in crop | **NO** |
| **Phase 2** (structured schema) | **NO** (local only) | `hasStructuredFields=false` on invokes | **NO** |

Evidence: `phase1-phase2-assessment.json`, `git diff` uncommitted, HEAD `214e864`.

---

## Why aviludo-reread-audit showed 0 on PNG

The prior audit script built:

`data:image/png;base64,${fileContents}`

but `april-historico-png-fixture.b64.txt` **already contains** the `data:image/png;base64,` prefix → **double-prefixed corrupt URL** → 0 items. This audit strips the prefix correctly and gets **9/9**.

---

## Production re-read path

1. Client downloads **2.5KB PDF** from storage  
2. `fileToExtractionDataUrl` rasterizes via pdfjs → PNG  
3. PNG sent to `extract-invoice`

If step 2 produces a valid PNG → **9 items** (proven). If rasterization fails or sends PDF bytes → **0 items** (proven). Storage PDF is a **known VL flake** (`passc-refinement-validation/REPORT.md` line 61, `geometry-audit` Class 4).

---

## Artifacts

| File | Contents |
|------|----------|
| `stage-comparison.json` | Per-stage historical vs current |
| `divergence-point.json` | First failure + failure modes |
| `phase1-phase2-assessment.json` | Hybrid H causation verdict |
| `run-audit.mts` | Reproducible script |

---

## Return Summary

| Field | Value |
|-------|-------|
| **First failing stage** | **`crop_generation` / `image_decode_input`** (PDF path); Pass C is symptom |
| **Evidence** | PDF 2497B → 0 items all passes null; PNG fixture → 9/9 items deployed |
| **Confidence** | **85%** |
| **Rollback Phase 1/2 restores?** | **NO** |
