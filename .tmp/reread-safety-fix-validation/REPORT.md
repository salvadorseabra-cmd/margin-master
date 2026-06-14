# Re-read Safety Fix — Validation Report

Generated: 2026-06-12  
Change: `src/routes/invoices.tsx` — `runExtraction` persistence guards

---

## Files Changed

| File | Change |
|------|--------|
| `src/routes/invoices.tsx` | `extractionInFlightRef` mutex + reorder normalize-before-delete + empty/delete/insert guards + toasts |

---

## Exact Logic Changes

1. **`extractionInFlightRef`** — `useRef<Record<string, boolean>>({})` per invoiceId
2. **Mutex entry** — return `null` immediately if `extractionInFlightRef.current[invoiceId]`; set `true` synchronously before any `await`
3. **Normalize first** — `normalizeInvoiceItemFields` + `shouldRejectInvoiceIngredientRow` before any DELETE
4. **Empty guard** — `normalizedItems.length === 0` → `toast.error(...)`, `return null` (no DELETE, no INSERT)
5. **Delete error** — check `deleteError`, toast, `return null` (no INSERT)
6. **Insert error** — toast, `return null` (no silent success via thrown catch only)
7. **Catch** — `toast.error` on API/unexpected failures
8. **Finally** — `delete extractionInFlightRef.current[invoiceId]` + clear `extracting` state
9. **Return** — `itemsCount: normalizedItems.length` (was `items.length`)

`reExtract` unchanged — `if (result)` already skips header refresh when `null` returned.

---

## Validation Results

Simulation: `.tmp/reread-safety-fix-validation/simulate-persistence.mts`  
Results: `validation-results.json`

| Scenario | Description | Pass |
|----------|-------------|------|
| **A** | `items=[]` → DELETE not executed | ✅ |
| **B** | Double-trigger → second exits (mutex) | ✅ |
| **C** | Delete error → abort before insert | ✅ |
| **D** | Insert error → error surfaced, no success | ✅ |
| **E** | Happy path delete+insert | ✅ |

**All 5/5 pass**

---

## Remaining Risks

| Risk | Severity | Note |
|------|----------|------|
| Insert fails after successful DELETE | MEDIUM | Rows wiped; error toasted; no rollback (pre-existing; not introduced) |
| Cross-tab concurrent re-read | LOW | Mutex is per browser session only |
| Partial extraction (3 replaces 9) | MEDIUM | By design; unchanged |
| All rows filtered post-normalize | LOW | Same as empty — now preserved |

---

## Regression Answers

| Question | Answer |
|----------|--------|
| **Aviludo wipe now impossible?** | **YES** — empty `normalizedItems` cannot reach DELETE |
| **Emporio duplication now impossible?** | **YES** (same session) — mutex blocks overlapping `runExtraction` for same invoiceId |

---

## Code Trace Reference

```
runExtraction entry
  → mutex check (return null)
  → set mutex + extracting
  → await extract-invoice
  → normalize + filter
  → IF normalizedItems.length === 0 → toast + return null   [FIX 1]
  → IF !user → return null
  → DELETE (with error check)                                  [FIX 3]
  → INSERT (with error check + toast)                          [FIX 4]
  → cost sync + return success
  → catch: toast.error
  → finally: clear mutex + extracting                          [FIX 2]
```
