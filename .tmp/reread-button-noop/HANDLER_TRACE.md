# Handler Trace — Re-read Click to Persistence

**Source:** `src/routes/invoices.tsx`  
**Generated:** 2026-06-14

---

## Symbol Search Results

| Symbol searched | Found? |
|-----------------|--------|
| `handleRereadInvoice` | ❌ No |
| `onReread` | ❌ No |
| `rereadInvoice` | ❌ No |
| `reprocessInvoice` | ❌ No |
| `reExtract` | ✅ Yes — sole re-read handler |

---

## Full Call Chain

```
Click (list wand OR ItemsTable "Re-read")
  └─ onClick={() => reExtract(r)}                    [2750 / 2799→3473]
       │
       ├─ G1: if (!row.file_path) return             [2394]  → silent
       ├─ G2: if (!isExtractableInvoicePath(...)) return  [2395]  → silent
       ├─ await supabase.storage.createSignedUrl     [2397–2399]
       ├─ G3: if (!signed) return                    [2400]  → silent  ← most likely no-op
       ├─ await fetch(signed.signedUrl).blob()       [2401]  → may throw (no catch)
       ├─ await fileToExtractionDataUrl(...)          [2402]  → may throw (no catch)
       │
       └─ await runExtraction(row.id, dataUrl)      [2403]
            ├─ G5: extractionInFlightRef mutex      [1354–1359]  → console only
            ├─ setExtracting(true)                   [1367]  ← FIRST spinner
            ├─ supabase.functions.invoke("extract-invoice")  [1373]
            ├─ normalize + filter rows               [1399–1401]
            ├─ G6: empty rows → toast + return null  [1417–1425]  (spinner shown)
            ├─ G7: !user → return null               [1427–1433]  (console only)
            ├─ DELETE invoice_items                  [1435–1438]
            ├─ G8: delete error → toast              [1439–1445]
            ├─ INSERT invoice_items                  [1466]
            ├─ G9: insert error → toast              [1473–1479]
            ├─ cost sync + shadow seed               [1486–1531]
            └─ finally: clear mutex + setExtracting(false)  [1579–1581]
       │
       └─ if (result):                               [2404–2447]
            ├─ supabase.from("invoices").update(...)  [2416–2421]
            ├─ rememberInvoiceIdentity(...)          [2439–2444]
            ├─ loadItems(row.id, row.created_at)     [2445]
            └─ load()                                [2446]
```

---

## `reExtract` — Entry Handler

```2393:2403:src/routes/invoices.tsx
  const reExtract = async (row: InvoiceRow) => {
    if (!row.file_path) return;
    if (!isExtractableInvoicePath(row.file_path)) return;
    const ext = row.file_path.split(".").pop()?.toLowerCase() ?? "";
    const { data: signed } = await supabase.storage
      .from("invoices")
      .createSignedUrl(row.file_path, 120);
    if (!signed) return;
    const blob = await fetch(signed.signedUrl).then((r) => r.blob());
    const dataUrl = await fileToExtractionDataUrl(blob, row.file_path.split("/").pop() ?? `invoice.${ext}`);
    const result = await runExtraction(row.id, dataUrl);
```

**Critical property:** `reExtract` has **no try/catch**. Any throw in lines 2401–2402 or in the post-`runExtraction` update block (2429) produces an unhandled promise rejection with zero UI feedback.

**Critical property:** `setExtracting` is **not** called in `reExtract`. Spinner only appears after `runExtraction` line 1367.

---

## `runExtraction` — OCR + Persistence

```1354:1367:src/routes/invoices.tsx
    if (extractionInFlightRef.current[invoiceId]) {
      console.log("[invoice-ocr] extraction-skipped", {
        invoiceId,
        reason: "already_in_flight",
      });
      return null;
    }
    extractionInFlightRef.current[invoiceId] = true;
    console.log("[invoice-ocr] stage=2 ocr-trigger", {
      invoiceId,
      dataUrlLength: dataUrl.length,
      dataUrlPrefix: dataUrl.slice(0, 64),
    });
    setExtracting((s) => ({ ...s, [invoiceId]: true }));
```

Mutex check (G5) runs **before** `setExtracting`. If mutex fires, user sees no spinner and no toast — only a console log.

---

## Post-Extraction Header Update (only when `result` is truthy)

```2404:2447:src/routes/invoices.tsx
    if (result) {
      const invoiceUpdatePayload: {
        supplier_name: string;
        invoice_date?: string;
        total: number;
      } = {
        supplier_name: result.supplier?.slice(0, 120) ?? row.supplier,
        ...(normalizeInvoiceDate(result.invoiceDate)
          ? { invoice_date: normalizeInvoiceDate(result.invoiceDate)! }
          : {}),
        total: typeof result?.total === "number" && result.total > 0 ? result.total : row.total,
      };
      const { data: updatedInvoice, error: invoiceUpdateError } = await supabase
        .from("invoices")
        .update(invoiceUpdatePayload)
        .eq("id", row.id)
        .select("invoice_date")
        .single();
      // ... trace calls ...
      if (invoiceUpdateError) throw invoiceUpdateError;
      // ... rememberInvoiceIdentity ...
      await loadItems(row.id, row.created_at);
      load();
    }
```

If `runExtraction` returns `null` (mutex, empty OCR, errors), this block is skipped — no header update, no `loadItems`, no `load()`.

---

## Feedback Boundary

| Phase | First user-visible feedback |
|-------|----------------------------|
| Pre-`runExtraction` (G1–G4) | **None** |
| Mutex skip (G5) | **None** (console only) |
| `runExtraction` entered | Spinner at line 1367 |
| Empty OCR (G6, post Jun 12 fix) | Spinner + toast at 1424 |
| API error (G10) | Spinner + toast at 1577 |

**Complete no-op** = failure at G1, G2, G3, G4, or G5.

---

## Historical Note — c2f52357

`.tmp/anchoas-reread-investigation/` documents a successful re-read on 2026-06-14: OCR ran, 9 rows persisted, Anchoas line OCR variant changed. That run **did** reach `runExtraction` (spinner would have appeared). Current "absolutely nothing" symptom indicates a **pre-OCR** failure path, not the empty-OCR wipe path described in older `.tmp/aviludo-reread-audit/REPORT.md` (Jun 11).
