# Root Cause — Re-read Button Complete No-Op

**Invoice:** `c2f52357-0f80-491a-ba14-c97ff4837472` (AVILUDO April)  
**Source:** `src/routes/invoices.tsx`  
**Generated:** 2026-06-14

---

## Symptom

Clicking Re-read produces **absolutely nothing**: no spinner, no toast, no UI update.

---

## Exact No-Op Site

**Function:** `reExtract` in `src/routes/invoices.tsx`  
**Mechanism:** Silent early returns **before** `runExtraction`, which is the only place `setExtracting` (spinner) is set.

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

**Spinner first set at:**

```1367:1367:src/routes/invoices.tsx
    setExtracting((s) => ({ ...s, [invoiceId]: true }));
```

Any path that exits before line 1367 = complete no-op.

---

## Most Likely Line

| Line | Guard | Feedback |
|------|-------|----------|
| **2400** | `if (!signed) return` | **None** — signed-URL failure swallowed |
| 2394 | `if (!row.file_path) return` | None |
| 2395 | `if (!isExtractableInvoicePath(...)) return` | None |
| **1354–1359** | `extractionInFlightRef` mutex in `runExtraction` | Console only — no spinner/toast |

**Primary suspect: line 2400.** `createSignedUrl` failure returns without inspecting `error`, without toast, without spinner.

**Secondary: lines 2401–2402.** `fetch` or `fileToExtractionDataUrl` throw with no try/catch in `reExtract`.

**Tertiary: lines 1354–1359.** Mutex skip if duplicate click while prior extraction in-flight.

---

## Ruled Out for c2f52357

| Hypothesis | Evidence | Verdict |
|------------|----------|---------|
| Missing storage path | `file_url` present in DB | ❌ Ruled out |
| Non-extractable extension | `.pdf` → `isExtractableInvoicePath` true | ❌ Ruled out |
| Button not rendered | `isExtractable` true at line 2694 | ❌ Ruled out |
| Wrong handler wired | Both buttons → `reExtract(r)` | ❌ Ruled out |
| `handleRereadInvoice` dead code | Symbol does not exist | ❌ N/A |
| Empty OCR wipe (Jun 11 behavior) | Post Jun 12 fix shows spinner + toast | ❌ Wrong symptom class |
| Permanent missing PDF | 2,497-byte object in storage; preview path uses same bucket | ❌ Ruled out |

---

## Invoice-Specific Facts

From `.tmp/aviludo-reread-audit/invoice-record.json` and `.tmp/emporio-db-integrity/db-query.json`:

| Field | Value |
|-------|-------|
| `id` | `c2f52357-0f80-491a-ba14-c97ff4837472` |
| `supplier_name` | AVILUDO |
| `file_url` / `file_path` | `acfb54e5-785f-4bc8-b47b-3914452e18a5/1781011281053-Aviludo_Historico_2026_04_with_total.pdf` |
| Storage size | 2,497 bytes (known flake-prone stub PDF) |
| DB items | 9 |
| Re-read history | **Worked** on 2026-06-14 (`.tmp/anchoas-reread-investigation/` — OCR produced 9 rows, Anchoas brand token varied) |

Valid PDF path + historical success → current no-op is a **transient pre-OCR failure**, not a structural wiring or data defect.

---

## Classification by Layer

| Layer | Verdict for complete no-op |
|-------|---------------------------|
| UI not wired | ❌ |
| Button disabled (`extracting[id]`) | Only if prior run in-flight or stuck state |
| **Silent pre-OCR guards in `reExtract`** | **✅ Primary** |
| **Mutex in `runExtraction` (1354–1359)** | **✅ Secondary** |
| Empty OCR / item wipe | ❌ for *complete* no-op (spinner + toast post-fix) |
| Post-extraction update throw | ❌ for *complete* no-op (spinner would have shown) |

---

## Distinction from Prior Audits

`.tmp/aviludo-reread-audit/REPORT.md` (2026-06-11) described re-read **running with spinner** then wiping items on empty OCR from the 2.5 KB stub PDF.

Current code (post 2026-06-12 safety fix):

```1417:1425:src/routes/invoices.tsx
      if (normalizedItems.length === 0) {
        // ...
        toast.error("Extraction returned no line items — existing rows kept.");
        return null;
      }
```

That path shows spinner + toast — **not** a complete no-op.

**Reported symptom (no spinner at all) → pre-`runExtraction` silent path, not empty-OCR path.**

---

## Browser Console Patterns

| Pattern | Meaning |
|---------|---------|
| No log at all | G1/G2/G3 silent return |
| `[invoice-ocr] extraction-skipped { reason: "already_in_flight" }` | G5 mutex |
| `[pdf-rasterize] load-failed` | G4 PDF parse failure |
| `[invoice-ocr] stage=2 ocr-trigger` | Past pre-OCR guards — spinner should appear |

---

## Recommended Debug

1. Click Re-read with DevTools open
2. Check Network: is `createSignedUrl` / storage GET / `extract-invoice` invoked?
3. Check Console for patterns above
4. If silence + no network beyond signed URL → **line 2400 confirmed**
