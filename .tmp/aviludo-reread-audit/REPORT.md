# Aviludo 17/04/2026 Re-read Button — Investigation Report

Generated: 2026-06-11  
Invoice: **Aviludo April** · `c2f52357-0f80-491a-ba14-c97ff4837472`  
Date: **2026-04-17** (17/04/2026)  
Mode: **READ-ONLY investigation**

---

## Executive Summary

**Exact failure point:** **`extract-invoice` returns HTTP 200 with `items: []` (0 rows)** → client **`runExtraction` deletes all existing `invoice_items` then skips insert** because `items.length === 0` → UI shows empty table ("re-read doesn't work").

**Not** a UI button block, **not** an API HTTP error, **not** a persistence insert failure. The re-read path **runs end-to-end** but **destructively clears** the 9 stored rows when extraction is empty.

**Contributing factors:**
1. **Known Aviludo April PDF flake** — storage file is **2,497-byte PDF**; VL audits document intermittent **0-item** returns from storage PDF path.
2. **Current deployed `extract-invoice`** returned **0 items** on live audit (both raw PDF data URL and PNG fixture).
3. **No empty-extraction guard** — `DELETE` at `invoices.tsx:1263` runs unconditionally before the `items.length` check.

---

## Invoice Identity

| Field | Value |
|-------|-------|
| **Invoice ID** | `c2f52357-0f80-491a-ba14-c97ff4837472` |
| **Supplier** | AVILUDO |
| **Invoice date** | `2026-04-17` |
| **DB total** | €370.17 |
| **Storage file** | `.../Aviludo_Historico_2026_04_with_total.pdf` |
| **File size** | **2,497 bytes** |
| **DB items (pre failed re-read)** | **9** (`created_at` 2026-06-10) |

---

## Full Path Trace

### 1. UI click ✅ Not blocked

| Control | Location | Aviludo April |
|---------|----------|---------------|
| List re-read (wand) | `invoices.tsx:2435-2447` | **Visible** — `.pdf` is extractable |
| Expanded "Re-read" | `ItemsTable:3090-3102` | **Enabled** when `!extracting` |
| Disabled only when | `extracting[r.id] === true` | In-flight guard |

`isExtractableInvoicePath` returns **true** for `.pdf` (`invoice-extraction-input.ts:26-29`).

### 2. `reExtract()` ✅ Reaches API (no silent guard hit)

```2080:2090:src/routes/invoices.tsx
const reExtract = async (row: InvoiceRow) => {
  if (!row.file_path) return;
  if (!isExtractableInvoicePath(row.file_path)) return;
  // ... signed URL, fetch blob ...
  const dataUrl = await fileToExtractionDataUrl(blob, ...);
  const result = await runExtraction(row.id, dataUrl);
```

- `file_path` present ✅  
- Path extractable ✅  
- **No try/catch** — PDF rasterize failure would throw uncaught (different symptom: spinner stops, items unchanged)

### 3. Client PDF handling

`fileToExtractionDataUrl` rasterizes PDF → PNG in browser (`pdf-to-invoice-image.ts`). Edge function **does not** rasterize PDF — expects image data URL.

Storage PDF is **2.5 KB** — flagged in `.tmp/vl-footer-retry.mts` as unusable for direct extraction; VL audits use PNG fixture instead.

### 4. API request ✅

- **Endpoint:** `POST https://bjhnlrgodcqoyzddbpbd.supabase.co/functions/v1/extract-invoice`
- **Payload:** `{ "imageDataUrl": "<data URL>" }`
- **Via:** `supabase.functions.invoke("extract-invoice", { body: { imageDataUrl } })`

### 5. `extract-invoice` ❌ **PRIMARY FAILURE**

| Probe | Status | Items | Supplier | Total |
|-------|--------|-------|----------|-------|
| Storage PDF data URL (audit) | **200** | **0** | null | null |
| PNG fixture (audit, same deploy) | **200** | **0** | null | null |
| PNG fixture (Jun 11 00:48 pre-audit) | 200 | **9** | AVILUDO | 687.07 |
| Storage PDF (`reextract/summary.json`) | 200 | **0** | — | — |

**Error message:** None — HTTP 200 with empty `items: []`.

Historical note: `.tmp/passc-refinement-validation/REPORT.md` line 61: *"Aviludo April PDF re-extract returned 0 items on this run — known VL PDF flake"*.

### 6. Persistence ❌ **SECONDARY FAILURE (data loss)**

```1262:1347:src/routes/invoices.tsx
// wipe prior items then insert fresh
await supabase.from("invoice_items").delete().eq("invoice_id", invoiceId);
// ...
if (items.length && user) {
  // INSERT ...
} else {
  console.log("[invoice-ocr] stage=9 persistence-skipped", {
    reason: !items.length ? "no items from extraction" : "no user session",
  });
}
```

**Sequence on failed re-read:**
1. DELETE removes **9 existing rows**
2. `items.length === 0` → **INSERT skipped**
3. `runExtraction` still returns `{ itemsCount: 0 }` (not `null`)
4. `reExtract` updates invoice header and refreshes UI → **0 line items shown**

Delete error is **not checked** (same pattern as Emporio duplicate audit).

### 7. UI outcome

User perceives re-read as broken: line items disappear or stay empty; no toast/error. `ItemsTable` shows: *"The invoice table was not prepared into rows. Re-read after checking the file image."* when `items.length === 0`.

---

## State Flags Summary

| Flag | Blocks Aviludo re-read? |
|------|-------------------------|
| `!file_path` | No |
| `!isExtractableInvoicePath` | No |
| `extracting[id]` | Only during in-flight |
| `createSignedUrl` failure | Possible but unlikely (file exists) |
| PDF rasterize throw | Possible — uncaught, no user message |
| **0 items from extract** | **Causes wipe + empty UI** |

See `state-flags.json`.

---

## Comparison: Before vs After Re-read

| Metric | Before (DB snapshot) | After failed re-read (expected) |
|--------|----------------------|----------------------------------|
| `invoice_items` count | **9** | **0** |
| Items `created_at` | 2026-06-10T17:23:27 | *(deleted)* |
| Invoice total | €370.17 | Preserved (extract total null) |

---

## Root Cause Classification

| Layer | Verdict |
|-------|---------|
| UI blocked | **NO** |
| API HTTP error | **NO** (200 OK) |
| **extract-invoice empty result** | **YES — primary** |
| **Persistence delete-without-insert** | **YES — amplifies failure** |
| PDF rasterization error | **Possible** (uncaught path) |

---

## Evidence Files

| File | Contents |
|------|----------|
| `invoice-record.json` | VL DB invoice + 9 items + live extract probes |
| `trace.json` | Step-by-step path with failure points |
| `state-flags.json` | UI/backend blocking conditions |
| `run-audit.mts` | Reproducible query + invoke script |

---

## Recommendations (investigation only — not implemented)

1. **Guard:** Do not `DELETE` when `items.length === 0` (or confirm with user).
2. **Replace storage PDF** with full-fidelity PNG for Aviludo April VL fixture.
3. **Surface error** when re-read returns 0 items.
4. **Investigate** why current deploy returns 0 even on PNG fixture (possible Phase 1+2 regression or GPT flake).

---

## Return Summary

| Field | Value |
|-------|-------|
| **Invoice ID** | `c2f52357-0f80-491a-ba14-c97ff4837472` |
| **Exact failure point** | **extract-invoice 0-item success + persistence delete-without-reinsert** |
| **Error message** | **None** (HTTP 200, empty items) |
| **UI blocked?** | **No** |
| **DB items before** | **9** |
| **Extract items on audit** | **0** |
