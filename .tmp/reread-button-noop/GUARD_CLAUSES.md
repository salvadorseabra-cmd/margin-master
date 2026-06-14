# Guard Clauses — Every Early Return That Can Cause No-Op

**Source:** `src/routes/invoices.tsx`  
**Generated:** 2026-06-14

---

## Definition: "Complete No-Op"

Click produces **no spinner, no toast, no UI update**. Requires failure **before** `setExtracting` at line 1367, OR mutex return at 1354–1359 without a prior visible spinner.

---

## `reExtract` — All Silent (No Toast, No Spinner)

```2393:2402:src/routes/invoices.tsx
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
```

| ID | Line | Condition | User feedback | Applies to c2f52357? |
|----|------|-----------|---------------|----------------------|
| **G1** | 2394 | `!row.file_path` | None | ❌ Path exists in DB |
| **G2** | 2395 | `!isExtractableInvoicePath(row.file_path)` | None (button also hidden) | ❌ `.pdf` is extractable |
| **G3** | **2400** | **`!signed` after `createSignedUrl`** | **None** | **⚠️ Possible** |
| **G4** | 2401–2402 | `fetch` or `fileToExtractionDataUrl` throws | None (unhandled rejection) | ⚠️ Possible (2.5 KB stub PDF) |

### G2 detail — `isExtractableInvoicePath`

Defined in `src/lib/invoice-extraction-input.ts`:

```26:30:src/lib/invoice-extraction-input.ts
export function isExtractableInvoicePath(path: string | null | undefined): boolean {
  if (!path) return false;
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  return EXTRACTABLE_EXTENSIONS.has(ext);
}
```

Extensions: `png`, `jpg`, `jpeg`, `webp`, `pdf`. Aviludo path passes.

### G3 detail — signed URL failure

`createSignedUrl` returns `{ data: signed }`. Line 2400 checks `if (!signed) return` — does **not** inspect `error`. Storage permission failure, missing object, or network error → **silent return**.

### G4 detail — pre-OCR throws

`fileToExtractionDataUrl` calls `renderPdfFirstPageToPngDataUrl` for PDFs (`src/lib/pdf-to-invoice-image.ts`). PDF parse failures log `[pdf-rasterize] load-failed` to console but `reExtract` has no catch → no toast.

---

## `runExtraction` — Partial Feedback

```1354:1359:src/routes/invoices.tsx
    if (extractionInFlightRef.current[invoiceId]) {
      console.log("[invoice-ocr] extraction-skipped", {
        invoiceId,
        reason: "already_in_flight",
      });
      return null;
    }
```

| ID | Lines | Condition | User feedback | Complete no-op? |
|----|-------|-----------|---------------|-----------------|
| **G5** | **1354–1359** | **`extractionInFlightRef.current[invoiceId]`** | **Console only** | **✅ Yes** |
| G6 | 1417–1425 | `normalizedItems.length === 0` | Toast + spinner | ❌ (spinner shown) |
| G7 | 1427–1433 | `!user` | Console only | ❌ (spinner was set at 1367) |
| G8 | 1439–1445 | DELETE error | Toast | ❌ |
| G9 | 1473–1479 | INSERT error | Toast | ❌ |
| G10 | 1572–1578 | catch (API/unexpected) | Toast | ❌ |

### G6 — empty OCR (post Jun 12 safety fix)

```1417:1425:src/routes/invoices.tsx
      if (normalizedItems.length === 0) {
        console.log("[invoice-ocr] stage=9 persistence-skipped", {
          invoiceId,
          reason: "no accepted rows after normalization",
          rawItemsCount: items.length,
          rejectedItemsCount: rejectedCount,
        });
        toast.error("Extraction returned no line items — existing rows kept.");
        return null;
      }
```

Not a **complete** no-op — user sees spinner then toast. Distinct from reported symptom.

### Mutex cleanup

```1579:1581:src/routes/invoices.tsx
    } finally {
      delete extractionInFlightRef.current[invoiceId];
      setExtracting((s) => ({ ...s, [invoiceId]: false }));
    }
```

Mutex cleared in `finally`. Stuck mutex only possible if `finally` never runs (tab crash / hard kill mid-flight).

---

## Button Disabled — Click Never Fires

| Control | Line | Condition |
|---------|------|-----------|
| List wand | 2751 | `disabled={!!extracting[r.id]}` |
| ItemsTable Re-read | 3474 | `disabled={extracting}` |

If `extracting[id]` is `true`, button is visually dimmed (`opacity-30` / `opacity-50`) and click is suppressed. This is **not** a silent no-op on an enabled-looking button — it is a disabled button.

---

## State Refs

```865:866:src/routes/invoices.tsx
  const [extracting, setExtracting] = useState<Record<string, boolean>>({});
  const extractionInFlightRef = useRef<Record<string, boolean>>({});
```

Two parallel guards:
- `extracting` state → disables button + shows spinner
- `extractionInFlightRef` → prevents duplicate `runExtraction` calls (console-only feedback)

---

## Browser Console Patterns (from prior audits)

| Log pattern | Guard | Complete no-op? |
|-------------|-------|-----------------|
| *(no log at all)* | G1, G2, or G3 | ✅ |
| `[invoice-ocr] extraction-skipped { reason: "already_in_flight" }` | G5 | ✅ |
| `[pdf-rasterize] load-failed` | G4 | ✅ (unhandled throw) |
| `[invoice-ocr] stage=2 ocr-trigger` | Past all pre-OCR guards | ❌ (spinner will show) |

---

## Priority Ranking for c2f52357 Complete No-Op

1. **G3 (line 2400)** — `createSignedUrl` failure, most likely for zero feedback
2. **G4 (lines 2401–2402)** — fetch or PDF rasterize throw on 2.5 KB stub PDF
3. **G5 (lines 1354–1359)** — duplicate click while prior extraction in-flight
4. G1, G2 — ruled out for this invoice (valid PDF path)
