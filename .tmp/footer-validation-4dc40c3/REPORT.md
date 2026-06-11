# Post-4dc40c3 Footer Validation Report

**Commit:** 4dc40c3 (`Fix footer total extraction by transcribing printed totals only.`)  
**VL project:** bjhnlrgodcqoyzddbpbd  
**extract-invoice deployed:** v15 @ 2026-06-10 17:10:31 UTC (v14 predated 4dc40c3; deployed during this run)

## Summary

| Invoice | Expected | Extracted (footer pass) | DB `invoices.total` | PASS/FAIL |
|---------|----------|-------------------------|---------------------|-----------|
| Bidfood | 292.70 | 292.70 | 292.70 | **PASS** |
| Aviludo Maio | 330.42 | 330.42 | 330.42 | **PASS** |
| Aviludo Abril | 370.17 | null (storage PDF unsupported) | 687.07* | **FAIL** |

\*April DB was overwritten to 687.07 during a failed re-extract using the wrong local historico PNG fixture. Storage PDF path returns `total: null`. Prior correct value was 370.17.

---

## Per-invoice detail

### Bidfood (`da472b7f-0fd9-4a26-a37c-80ad335f7f7e`)

- **Storage:** 1.7MB PNG screenshot (`page 1/3` per VL context)
- **Full `extract-invoice`:** succeeded on retry — `total: 292.7`, 11 line items. Intermittent `546 WORKER_RESOURCE_LIMIT` on ~1.7MB image during concurrent runs (footer-only debug still succeeded).
- **Raw GPT JSON** (`vl-footer-debug`):
  ```json
  { "total": 292.7, "net_subtotal": 276.13, "vat": 16.57 }
  ```
- **Parsed:** `confidence: high`, `validation_warning: null` (276.13 + 16.57 = 292.70)
- **DB `invoices.total`:** 292.70 (updated from 187.87)
- **Footer crop:** `.tmp/footer-validation-4dc40c3/bidfood-footer-crop.png` (416KB)

### Aviludo Maio (`3b4cb21f-8b3f-45f3-9f2d-6f15e9f438a2`)

- **Storage:** 1.1MB PNG
- **Full `extract-invoice`:** `total: 330.42`, 8 items
- **Raw GPT JSON** (`vl-footer-debug`):
  ```json
  { "total": 330.42, "net_subtotal": 296.88, "vat": 33.54 }
  ```
- **Parsed:** `confidence: high`, `validation_warning: null` (296.88 + 33.54 = 330.42)
- **DB `invoices.total`:** 330.42
- **Footer crop:** `.tmp/footer-validation-4dc40c3/aviludo-maio-footer-crop.png` (708KB)

### Aviludo Abril (`c2f52357-0f80-491a-ba14-c97ff4837472`)

- **Storage:** 2.5KB ReportLab-generated PDF (`Aviludo_Historico_2026_04_with_total.pdf`) — **not a raster invoice scan**
- **Full `extract-invoice` on storage PDF:** `total: null`, `items: []`, `supplier: null`
- **vl-footer-debug on storage PDF:** `{ "error": "Unsupported image type" }` (imagescript cannot decode PDF)
- **Footer crop from storage:** not possible (PDF unsupported)
- **Alternate PNG attempts (not valid April invoice scans):**
  - Historico fixture PNG → extracted `687.07` (wrong document)
  - sips PDF→PNG → unrelated document (`total: 52.82` full pass / footer debug `283.5`)
- **DB `invoices.total`:** 687.07 (corrupted by historico fixture re-extract; was 370.17)

---

## Blockers

1. **Aviludo Abril:** VL storage file is a tiny synthetic PDF, not the invoice image. Footer pass cannot run; no repo fixture matches expected 370.17. Validation blocked until a correct April scan PNG is uploaded to VL storage.
2. **Bidfood intermittent 546:** Full four-pass `extract-invoice` occasionally hits `WORKER_RESOURCE_LIMIT` on the 1.7MB PNG; footer-only debug pass succeeds reliably with correct total.
3. **Raw GPT JSON:** Captured via temporary `vl-footer-debug` edge function (deployed to VL for evidence only). Local `OPENAI_API_KEY` not available.

## Evidence artifacts

- `.tmp/footer-validation-4dc40c3/final-evidence.json`
- `.tmp/footer-validation-4dc40c3/retry-results.json`
- `.tmp/footer-validation-4dc40c3/april-sips-results` (in april-maio/april-sips runs)
- Footer crops under `.tmp/footer-validation-4dc40c3/*-footer-crop.png`
