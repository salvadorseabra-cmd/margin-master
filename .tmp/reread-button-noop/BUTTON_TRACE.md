# Button Trace — Re-read No-Op Investigation

**Invoice:** `c2f52357-0f80-491a-ba14-c97ff4837472` (AVILUDO April)  
**Source:** `src/routes/invoices.tsx`  
**Generated:** 2026-06-14

---

## Summary

There are **two** Re-read entry points in the invoice list UI. Both call the same handler: `reExtract(r)`. No separate `handleRereadInvoice`, `onReread`, `rereadInvoice`, or `reprocessInvoice` symbols exist anywhere in the codebase.

---

## Entry Point 1 — Invoice List Row (Wand Icon)

Rendered inside `invoiceRowsForDisplay.map` for each invoice row.

```2692:2761:src/routes/invoices.tsx
                {invoiceRowsForDisplay.map((r) => {
                  const open = expanded === r.id;
                  const isExtractable = isExtractableInvoicePath(r.file_path);
                  const items = itemsByInvoice[r.id] ?? [];
                  // ...
                        <td
                          className="py-3 px-5 text-right whitespace-nowrap"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {isExtractable && (
                            <button
                              onClick={() => reExtract(r)}
                              disabled={!!extracting[r.id]}
                              className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-30"
                              title="Re-read invoice"
                            >
                              {extracting[r.id] ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Wand2 className="h-4 w-4" />
                              )}
                            </button>
                          )}
```

| Property | Value |
|----------|-------|
| Visibility | `isExtractable = isExtractableInvoicePath(r.file_path)` (line 2694) |
| onClick | `() => reExtract(r)` (line 2750) |
| disabled | `!!extracting[r.id]` (line 2751) |
| Spinner | Shown when `extracting[r.id]` is true |
| Row expand | Actions `<td>` calls `e.stopPropagation()` so wand click does not toggle expand |

For `c2f52357`: `file_url` ends in `.pdf` → `isExtractableInvoicePath` returns **true** → button **is rendered**.

---

## Entry Point 2 — Expanded Panel ItemsTable "Re-read" Button

Only visible when the invoice row is expanded (`open && … ItemsTable`).

Wiring from parent:

```2798:2799:src/routes/invoices.tsx
                              extracting={!!extracting[r.id]}
                              onExtract={isExtractable ? () => reExtract(r) : undefined}
```

Button inside `ItemsTable`:

```3471:3483:src/routes/invoices.tsx
        {onExtract && (
          <button
            onClick={onExtract}
            disabled={extracting}
            className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-md border border-border hover:bg-muted disabled:opacity-50"
          >
            {extracting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Wand2 className="h-3.5 w-3.5" />
            )}
            {extracting ? "Reading…" : "Re-read"}
          </button>
        )}
```

| Property | Value |
|----------|-------|
| Visibility | `onExtract` prop is set only when `isExtractable` (line 2799) |
| onClick | `onExtract` → `() => reExtract(r)` |
| disabled | `extracting` prop from parent (`!!extracting[r.id]`) |
| Label | "Re-read" / "Reading…" |

---

## Data Mapping — `file_path` vs `file_url`

`toInvoiceRow` maps DB `file_url` to runtime `file_path`:

```475:475:src/routes/invoices.tsx
    file_path: row.file_url,
```

`reExtract` reads `row.file_path` (not `file_url`). Mapping is correct for all list rows.

For `c2f52357`:

| Field | Value |
|-------|-------|
| DB `file_url` | `acfb54e5-785f-4bc8-b47b-3914452e18a5/1781011281053-Aviludo_Historico_2026_04_with_total.pdf` |
| Runtime `file_path` | Same path via `toInvoiceRow` |
| Extension | `.pdf` → extractable |

---

## Disabled State / CSS

| Control | Disabled when | Visual |
|---------|---------------|--------|
| List wand | `extracting[r.id]` truthy | `disabled:opacity-30` |
| ItemsTable Re-read | `extracting` prop truthy | `disabled:opacity-50` |

- No `pointer-events: none` on either button.
- No separate logical-disable beyond `extracting` state.
- If `extracting[id]` is stuck `true` from a prior run, button appears disabled and click never fires — but this would show opacity reduction, not a fully enabled-looking no-op.

---

## Extraction State Refs

```865:866:src/routes/invoices.tsx
  const [extracting, setExtracting] = useState<Record<string, boolean>>({});
  const extractionInFlightRef = useRef<Record<string, boolean>>({});
```

`setExtracting` (spinner) is first called inside `runExtraction` at line 1367 — **not** in `reExtract`. Any failure before `runExtraction` is entered produces zero spinner feedback.

---

## Verdict for Button Wiring

| Check | Result |
|-------|--------|
| Button rendered for c2f52357 | ✅ Yes (`.pdf` path) |
| Handler wired | ✅ Both entry points → `reExtract(r)` |
| Wrong symbol / dead handler | ❌ No — only `reExtract` exists |
| UI-layer cause of complete no-op | ❌ Unlikely — wiring is correct |

A complete no-op (enabled button, zero feedback) points to **silent early returns inside `reExtract`** before `runExtraction`, not to button miswiring.
