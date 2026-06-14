# Final Verdict — Re-read Button No-Op

**Generated:** 2026-06-14  
**Investigation:** Why Re-read on invoice `c2f52357-0f80-491a-ba14-c97ff4837472` does absolutely nothing

---

## Verdict

| Field | Value |
|-------|-------|
| **Root cause** | Silent early returns in `reExtract` before `runExtraction` sets the spinner |
| **Most likely line** | **Line 2400** — `if (!signed) return` after `createSignedUrl` |
| **Secondary causes** | Lines 2394–2395 (silent path guards); `runExtraction` mutex at 1354–1359 (console only); unhandled throw at 2401–2402 |
| **Invoice-specific blockers** | None — valid PDF path, button wired, re-read worked on 2026-06-14 |
| **Bug class** | Missing user feedback on failure paths (silent swallow) |

---

## Exact No-Op Function / Lines

**Function:** `reExtract` (`src/routes/invoices.tsx`)

```2393:2400:src/routes/invoices.tsx
  const reExtract = async (row: InvoiceRow) => {
    if (!row.file_path) return;
    if (!isExtractableInvoicePath(row.file_path)) return;
    const ext = row.file_path.split(".").pop()?.toLowerCase() ?? "";
    const { data: signed } = await supabase.storage
      .from("invoices")
      .createSignedUrl(row.file_path, 120);
    if (!signed) return;
```

**Mutex secondary site:**

```1354:1359:src/routes/invoices.tsx
    if (extractionInFlightRef.current[invoiceId]) {
      console.log("[invoice-ocr] extraction-skipped", {
        invoiceId,
        reason: "already_in_flight",
      });
      return null;
    }
```

---

## Invoice c2f52357 Summary

| Check | Result |
|-------|--------|
| `file_url` / `file_path` | ✅ Valid PDF in `invoices` bucket |
| `isExtractableInvoicePath` | ✅ true |
| Button rendered | ✅ List wand (2749) + ItemsTable (3473) |
| Handler | ✅ `reExtract(r)` — no `handleRereadInvoice` symbol exists |
| DB items | 9 |
| Re-read history | ✅ Succeeded 2026-06-14 (anchoas investigation) |
| Network on complete no-op | ❌ Fails before `extract-invoice` invoke |

---

## Button Locations

| Entry point | Line | Handler |
|-------------|------|---------|
| List row wand icon | 2749–2750 | `onClick={() => reExtract(r)}` |
| Expanded ItemsTable | 2799 → 3473 | `onExtract={() => reExtract(r)}` |

---

## Complete No-Op vs Partial Feedback

| Failure mode | Spinner? | Toast? | Classification |
|--------------|----------|--------|----------------|
| G1 `!file_path` (2394) | ❌ | ❌ | Complete no-op |
| G2 `!isExtractable` (2395) | ❌ | ❌ | Complete no-op (button hidden) |
| **G3 `!signed` (2400)** | **❌** | **❌** | **Complete no-op — primary** |
| G4 fetch/rasterize throw (2401–2402) | ❌ | ❌ | Complete no-op |
| G5 mutex (1354–1359) | ❌ | ❌ | Complete no-op |
| G6 empty OCR (1417–1425) | ✅ | ✅ | Not complete no-op |
| G10 API error (1572–1578) | ✅ | ✅ | Not complete no-op |

---

## Distinction from Prior Audits

| Audit | Date | Symptom | Cause |
|-------|------|---------|-------|
| `.tmp/aviludo-reread-audit/` | 2026-06-11 | Spinner shown, items wiped | Empty OCR from 2.5 KB stub PDF |
| `.tmp/anchoas-reread-investigation/` | 2026-06-14 | Re-read ran, 9 rows, Anchoas alias miss | OCR brand token variation |
| **This investigation** | 2026-06-14 | **No spinner at all** | **Pre-`runExtraction` silent guards** |

---

## Recommended Debug

1. DevTools → Console → click Re-read
2. Look for:
   - `[invoice-ocr] extraction-skipped` → mutex (G5)
   - `[pdf-rasterize] load-failed` → PDF parse throw (G4)
   - `[invoice-ocr] stage=2 ocr-trigger` → past guards (spinner should show)
   - **Silence** → signed URL or earlier guard (G3 most likely)
3. DevTools → Network → confirm whether `extract-invoice` is invoked

---

## Related Deliverables

- [BUTTON_TRACE.md](./BUTTON_TRACE.md)
- [HANDLER_TRACE.md](./HANDLER_TRACE.md)
- [GUARD_CLAUSES.md](./GUARD_CLAUSES.md)
- [NETWORK_PATH.md](./NETWORK_PATH.md)
- [ROOT_CAUSE.md](./ROOT_CAUSE.md)

---

## One-Line Summary

Re-read is wired correctly for `c2f52357`, but `reExtract` swallows pre-OCR failures silently — especially `createSignedUrl` failure at line 2400 — before `runExtraction` ever sets the spinner.
