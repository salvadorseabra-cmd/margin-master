# Network Path — Click to API Calls

**Source:** `src/routes/invoices.tsx`, `src/lib/invoice-extraction-input.ts`, `src/lib/pdf-to-invoice-image.ts`  
**Generated:** 2026-06-14

---

## Overview

Re-read does **not** use a dedicated REST route or RPC named `reread` / `reprocess`. The path is a chain of Supabase client calls initiated from `reExtract` → `runExtraction`.

On a **complete no-op**, network calls stop before step 4 (`extract-invoice` edge function) — typically at step 1 (signed URL) or step 2 (blob fetch).

---

## Step-by-Step Call Chain

### Step 0 — Click (no network)

```
onClick={() => reExtract(r)}   [2750 or 2799→3473]
```

### Step 1 — Signed URL (Supabase Storage REST)

```2397:2399:src/routes/invoices.tsx
    const { data: signed } = await supabase.storage
      .from("invoices")
      .createSignedUrl(row.file_path, 120);
```

| Property | Value |
|----------|-------|
| Bucket | `invoices` |
| Path | `row.file_path` (mapped from DB `file_url`) |
| TTL | 120 seconds |
| Failure mode | `if (!signed) return` at line 2400 — **silent, no network retry, no toast** |

For `c2f52357`:
- Path: `acfb54e5-785f-4bc8-b47b-3914452e18a5/1781011281053-Aviludo_Historico_2026_04_with_total.pdf`
- Object exists (2,497 bytes per `.tmp/aviludo-reread-audit/invoice-record.json`)

### Step 2 — Blob Download (HTTP fetch)

```2401:2401:src/routes/invoices.tsx
    const blob = await fetch(signed.signedUrl).then((r) => r.blob());
```

| Property | Value |
|----------|-------|
| Method | `GET` to signed Supabase Storage URL |
| Failure mode | Unhandled throw — no toast |

### Step 3 — Client-Side PDF Rasterize (no network)

```2402:2402:src/routes/invoices.tsx
    const dataUrl = await fileToExtractionDataUrl(blob, row.file_path.split("/").pop() ?? `invoice.${ext}`);
```

`fileToExtractionDataUrl` (`src/lib/invoice-extraction-input.ts`):
- Images → `FileReader.readAsDataURL`
- PDFs → `renderPdfFirstPageToPngDataUrl` via `pdfjs-dist` (`src/lib/pdf-to-invoice-image.ts`)

| Property | Value |
|----------|-------|
| Runs | Entirely client-side |
| Failure mode | Throw → unhandled rejection in `reExtract` |

### Step 4 — OCR Edge Function (Supabase Functions)

```1373:1375:src/routes/invoices.tsx
      const { data, error } = await supabase.functions.invoke("extract-invoice", {
        body: { imageDataUrl: dataUrl },
      });
```

| Property | Value |
|----------|-------|
| Function | `extract-invoice` |
| Body | `{ imageDataUrl: dataUrl }` |
| Reached on complete no-op? | **No** |
| Failure mode | Toast at line 1577 (inside `runExtraction` catch) |

Console marker when reached: `[invoice-ocr] stage=2 ocr-trigger` (line 1362).

### Step 5 — Delete Existing Items (PostgREST)

```1435:1438:src/routes/invoices.tsx
      const { error: deleteError } = await supabase
        .from("invoice_items")
        .delete()
        .eq("invoice_id", invoiceId);
```

Skipped when G6 fires (empty normalized items, post Jun 12 fix).

### Step 6 — Insert New Items (PostgREST)

```1466:1466:src/routes/invoices.tsx
      const { error: insertError } = await supabase.from("invoice_items").insert(insertRows);
```

### Step 7 — Cost Sync + Shadow Seed (awaited, internal)

```1486:1531:src/routes/invoices.tsx
      const costSync = await syncOperationalIngredientCostsFromInvoiceLines(/* ... */);
      // ...
        await shadowSeedInvoiceItemMatchesAfterExtract(supabase, { /* ... */ });
```

### Step 8 — Invoice Header Update (PostgREST, in `reExtract` post-process)

```2416:2421:src/routes/invoices.tsx
      const { data: updatedInvoice, error: invoiceUpdateError } = await supabase
        .from("invoices")
        .update(invoiceUpdatePayload)
        .eq("id", row.id)
        .select("invoice_date")
        .single();
```

Only runs when `runExtraction` returns a truthy `result`.

### Step 9 — UI Refresh (no external network beyond prior queries)

```2445:2446:src/routes/invoices.tsx
      await loadItems(row.id, row.created_at);
      load();
```

---

## Network Reachability Matrix

| Symptom | Steps reached | `extract-invoice` called? |
|---------|---------------|---------------------------|
| Complete no-op (G1/G2/G3) | 0–1 | ❌ |
| Complete no-op (G4 throw) | 1–3 | ❌ |
| Complete no-op (G5 mutex) | 0 (blocked at `runExtraction` entry) | ❌ |
| Spinner + empty toast (G6) | 1–4 | ✅ (returned 0 items) |
| Full success | 1–9 | ✅ |

---

## Invoice c2f52357 — Network Evidence

From `.tmp/aviludo-reread-audit/invoice-record.json`:

| Probe | Result |
|-------|--------|
| Storage object | 2,497 bytes, `application/pdf` |
| `storagePdfExtract` (edge fn on stored PDF) | 200 OK, 0 items |
| `pngFixtureExtract` | 200 OK, 0 items |
| DB items | 9 rows persisted |

Jun 14 anchoas audit confirms re-read **did** reach `extract-invoice` historically and produced 9 OCR rows (with Anchoas brand token variation). Current complete no-op implies a **transient pre-OCR failure** (signed URL, fetch, or mutex), not a permanent missing-file condition.

---

## Debug Checklist

On click, open DevTools:

1. **Network tab** — look for `createSignedUrl` / storage GET / `extract-invoice` invoke
2. **Console** — look for:
   - `[invoice-ocr] stage=2 ocr-trigger` → past pre-OCR guards
   - `[invoice-ocr] extraction-skipped` → G5 mutex
   - `[pdf-rasterize] load-failed` → G4 PDF parse failure
   - *(silence)* → G1/G2/G3
